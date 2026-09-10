import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Value } from '../src/core/digest.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { workspaceOwnerFixture } from './helpers/workspace-owner-fixture.mjs';
import { createWorkspaceOwner, prepareWorkspaceReview, createReviewedWorkspaceTestOwner, loadWorkspaceReviewApproval } from '../src/host/workspace-owner.mjs';
import { compileBrowserTestSuite } from '../src/workspace/browser-test-contracts.mjs';

const runtimePath = process.env.GODAGENTS_WORKSPACE_BROWSER_RUNTIME;
const limits = { maxFiles: 4, maxAppBytes: 131072, maxResultBytes: 16384,
  stepTimeoutMs: 500, launchTimeoutMs: 10000, runTimeoutMs: 15000, cleanupTimeoutMs: 5000 };
const childPath = fileURLToPath(new URL('./helpers/workspace-owner-process-child.mjs', import.meta.url));
const reviewed = f => ({ schemaVersion: 1, protocolId: 'eternities-workspace-code-review-v1',
  reviewCandidateDigest: f.candidate.reviewCandidateDigest, reviewerRef: 'operator:process-recovery-fixture', decision: 'approved' });
function taskFrom(body) {
  const find = v => typeof v === 'string' ? (() => { try { const x = JSON.parse(v); return x.protocolId === 'eternities-workspace-repair-task-v1' ? x : null; } catch { return null; } })() : v && typeof v === 'object' ? Object.values(v).map(find).find(Boolean) : null;
  return find(JSON.parse(body.messages.find(row => row.role === 'user').content));
}
async function setup(t) {
  const f = await workspaceOwnerFixture(t);
  const host = await f.createHost({ propose: body => { const task = taskFrom(body); return { schemaVersion: 1,
    parentDigest: task.parentDigest, changes: [{ path: 'index.html', expectedSha256: task.files[0].sha256, text: f.fixed }] }; } });
  const owner = await createWorkspaceOwner({ policy: f.policy, expectedPolicyDigest: sha256Value(f.policy), host, hostKind: 'provider', registryRoot: f.registryRoot });
  const stage = await owner.propose();
  const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  const suite = compileBrowserTestSuite(JSON.parse(await readFile(new URL('./fixtures/browser-workspace/suite.json', import.meta.url), 'utf8')));
  const candidate = await prepareWorkspaceReview({ owner, stage, runtime, suite, limits });
  const review = reviewed({ candidate });
  const reviewPath = join(f.root, 'workspace-review.json');
  await writeFile(reviewPath, `${canonicalJson(review)}\n`);
  const providerPolicyPath = join(f.workspace, 'provider-policy.json');
  const providerPolicyDigest = sha256Value(JSON.parse(await readFile(providerPolicyPath, 'utf8')));
  return { f, owner, stage, runtime, suite, review, reviewPath, providerPolicyPath, providerPolicyDigest };
}
async function crash(configPath, exitAt) {
  const started = Date.now();
  const child = spawn(process.execPath, [childPath, configPath], { shell: false, windowsHide: true });
  let output = '', outputBytes = 0, overflow = false;
  const collect = chunk => { outputBytes += chunk.byteLength; if (outputBytes <= 65536) output += chunk.toString(); else overflow = true; };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`child timeout at ${exitAt}`)); }, 60000);
    const fail = error => { clearTimeout(timer); reject(error); };
    child.once('error', fail); child.once('exit', (code, signal) => {
      clearTimeout(timer); resolve({ code, signal, output, outputBytes, overflow, ms: Date.now() - started });
    });
  });
  assert.equal(result.overflow, false, `${exitAt}: child output exceeded 65536 bytes`);
  assert.equal(result.code, 73, `${exitAt}: ${result.output}`); return result;
}

test('real process death recovery preserves durable owner test phases', { skip: !runtimePath }, async t => {
  const fixtures = await Promise.all(['test-prepared', 'test-dispatched', 'test-completed'].map(() => setup(t)));
  const configs = [];
  for (let i = 0; i < fixtures.length; i++) {
    const x = fixtures[i], path = join(x.f.root, `child-${i}.json`);
    await writeFile(path, JSON.stringify({ policy: x.f.policy, runtime: x.runtime, suite: x.suite, limits,
      reviewPath: x.reviewPath, reviewDigest: sha256Value(x.review), registryRoot: x.f.registryRoot, providerPolicyPath: x.providerPolicyPath,
      providerPolicyDigest: x.providerPolicyDigest, runtimeRoot: join(x.f.workspace, 'admission', 'vessel', 'provider-phase'), exitAt: ['test-prepared', 'test-dispatched', 'test-completed'][i] }));
    configs.push(path);
  }
  const crashes = await Promise.all(configs.map((path, i) => crash(path, ['test-prepared', 'test-dispatched', 'test-completed'][i])));
  await new Promise(resolve => setTimeout(resolve, 31000));
  for (let i = 0; i < fixtures.length; i++) {
    const x = fixtures[i], freshHost = await x.f.createHost({ credential: false });
    const owner = await createWorkspaceOwner({ policy: x.f.policy, expectedPolicyDigest: sha256Value(x.f.policy), host: freshHost, hostKind: 'provider', registryRoot: x.f.registryRoot });
    const recoveredStage = await owner.propose();
    const approval = await loadWorkspaceReviewApproval({ path: x.reviewPath,
      env: { GODAGENT_WORKSPACE_REVIEW_SHA256: sha256Value(x.review) } });
    const checkpoints = [];
    const recovered = await createReviewedWorkspaceTestOwner({ owner, stage: recoveredStage, runtime: x.runtime, suite: x.suite, limits,
      approval, checkpoint: point => { if (i === 0) checkpoints.push(point); else throw new Error('recovery must not checkpoint or redispatch'); } });
    const result = await recovered.run();
    assert.equal(result.status, i === 0 ? 'completed' : i === 1 ? 'pending' : 'completed');
    if (i === 0) assert.deepEqual(checkpoints, ['test-prepared', 'test-dispatched', 'test-completed']);
    if (i === 0 || i === 2) assert.equal(result.result.outcome, 'passed');
    assert.equal(x.f.requests.length, 1); assert.equal(crashes[i].code, 73);
  }
});
