import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256Value } from '../src/core/digest.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { workspaceOwnerFixture } from './helpers/workspace-owner-fixture.mjs';
import { createWorkspaceOwner, prepareWorkspaceReview, createReviewedWorkspaceTestOwner, loadWorkspaceReviewApproval } from '../src/host/workspace-owner.mjs';
import { compileBrowserTestSuite } from '../src/workspace/browser-test-contracts.mjs';

const runtimePath = process.env.GODAGENTS_WORKSPACE_BROWSER_RUNTIME;
const limits = { maxFiles: 4, maxAppBytes: 131072, maxResultBytes: 16384,
  stepTimeoutMs: 500, launchTimeoutMs: 10000, runTimeoutMs: 15000, cleanupTimeoutMs: 5000 };
function taskFrom(body) {
  function find(v) {
    if (typeof v === 'string') { try { const x = JSON.parse(v); if (x.protocolId === 'eternities-workspace-repair-task-v1') return x; } catch {} }
    if (v && typeof v === 'object') for (const child of Object.values(v)) { const x = find(child); if (x) return x; }
    return null;
  }
  return find(JSON.parse(body.messages.find(row => row.role === 'user').content));
}
async function prepared(t, fixed = true, repairAfterFailure = false, configure = () => {}) {
  const f = await workspaceOwnerFixture(t);
  configure(f);
  const host = await f.createHost({ propose: body => {
    const task = taskFrom(body);
    return { schemaVersion: 1, parentDigest: task.parentDigest, changes: [{ path: 'index.html', expectedSha256: task.files[0].sha256,
      text: fixed || (repairAfterFailure && f.requests.length > 1) ? f.fixed : task.files[0].text }] };
  } });
  const owner = await createWorkspaceOwner({ policy: f.policy, expectedPolicyDigest: sha256Value(f.policy), host, hostKind: 'provider', registryRoot: f.registryRoot });
  const stage = await owner.propose(), runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  const suite = compileBrowserTestSuite(JSON.parse(await readFile(new URL('./fixtures/browser-workspace/suite.json', import.meta.url), 'utf8')));
  const candidate = await prepareWorkspaceReview({ owner, stage, runtime, suite, limits });
  return { ...f, owner, stage, runtime, suite, candidate };
}
const reviewed = f => ({ schemaVersion: 1, protocolId: 'eternities-workspace-code-review-v1',
  reviewCandidateDigest: f.candidate.reviewCandidateDigest, reviewerRef: 'operator:reviewed-first-party-test-fixture', decision: 'approved' });
async function approvalFor(f, review = reviewed(f)) {
  const digest = sha256Value(review), path = join(f.root, `review-${digest}.json`);
  await writeFile(path, `${canonicalJson(review)}\n`);
  return loadWorkspaceReviewApproval({ path, env: { GODAGENT_WORKSPACE_REVIEW_SHA256: digest } });
}

test('actual browser owner requires independently pinned exact-child review and replays without a second dispatch', { skip: !runtimePath }, async t => {
  const f = await prepared(t);
  const config = { owner: f.owner, stage: f.stage, runtime: f.runtime, suite: f.suite, limits };
  await assert.rejects(createReviewedWorkspaceTestOwner({ ...config, approval: { ...reviewed(f), reviewDigest: sha256Value(reviewed(f)) } }), /not issued/);
  await assert.rejects(prepareWorkspaceReview({ ...config, stage: structuredClone(f.stage) }), /issued/);
  const changedSuite = structuredClone(f.suite); delete changedSuite.testSuiteDigest; changedSuite.cases[0].steps[0].count = 3;
  const approval = await approvalFor(f);
  await assert.rejects(createReviewedWorkspaceTestOwner({ ...config, suite: compileBrowserTestSuite(changedSuite), approval }), /review candidate/);
  const review = reviewed(f), points = [];
  const tested = await createReviewedWorkspaceTestOwner({ ...config, approval, checkpoint: point => { points.push(point); } });
  assert.equal((await tested.reconcile()).status, 'absent');
  const result = await tested.run();
  assert.equal(result.status, 'completed'); assert.equal(result.result.outcome, 'passed');
  assert.equal(result.result.revisionDigest, f.stage.revision.revisionDigest);
  assert.equal(result.stageDigest, f.stage.stageDigest);
  assert.deepEqual(points, ['test-prepared', 'test-dispatched', 'test-completed']);
  const reopened = await createReviewedWorkspaceTestOwner({ ...config, approval, checkpoint: () => { throw new Error('replay must not dispatch'); } });
  assert.deepEqual(await reopened.run(), result);
  assert.equal(f.requests.length, 1);
  const denied = { ...review, decision: 'denied' };
  await assert.rejects(approvalFor(f, denied), /review/);
  await assert.rejects(loadWorkspaceReviewApproval({ path: join(f.root, `review-${sha256Value(review)}.json`), env: {} }), /review/);
});

test('attempt and aggregate completion ceilings stop further repair before another inference', { skip: !runtimePath }, async t => {
  for (const budget of [{ maxAttempts: 1, totalCompletionTokens: 2800 }, { maxAttempts: 3, totalCompletionTokens: 1000 }]) {
    const f = await prepared(t, false, false, f => { f.policy.repairBudget = budget; }), review = reviewed(f);
    const tested = await createReviewedWorkspaceTestOwner({ owner: f.owner, stage: f.stage, runtime: f.runtime,
      suite: f.suite, limits, approval: await approvalFor(f, review) });
    assert.equal((await tested.run()).result.outcome, 'failed');
    await assert.rejects(f.owner.continueAfter(tested), /budget exhausted/); assert.equal(f.requests.length, 1);
    await assert.rejects(tested.export(), /passed/);
  }
});

test('browser failure is actual bounded feedback, not model claims of success', { skip: !runtimePath }, async t => {
  const f = await prepared(t, false), review = reviewed(f);
  const tested = await createReviewedWorkspaceTestOwner({ owner: f.owner, stage: f.stage, runtime: f.runtime,
    suite: f.suite, limits, approval: await approvalFor(f, review) });
  const result = await tested.run();
  assert.equal(result.status, 'completed'); assert.equal(result.result.outcome, 'failed');
  assert.equal(result.result.reason, 'assertion-mismatch');
  assert.ok(canonicalJson(result).includes('completed-only'));
});

test('interruption after dispatch cannot rerun a possibly executed browser test', { skip: !runtimePath }, async t => {
  const f = await prepared(t), review = reviewed(f);
  const config = { owner: f.owner, stage: f.stage, runtime: f.runtime, suite: f.suite, limits, approval: await approvalFor(f, review) };
  const first = await createReviewedWorkspaceTestOwner({ ...config, checkpoint: point => { if (point === 'test-dispatched') throw new Error('interrupt after durable dispatch'); } });
  await assert.rejects(first.run(), /interrupt/);
  const next = await createReviewedWorkspaceTestOwner({ ...config, checkpoint: () => { throw new Error('must not redispatch'); } });
  assert.equal((await next.reconcile()).status, 'pending'); assert.equal((await next.run()).status, 'pending');
});

test('failed browser feedback reaches the next admitted mission, which repairs and exports checked bytes', { skip: !runtimePath }, async t => {
  const f = await prepared(t, false, true), review = reviewed(f);
  const first = await createReviewedWorkspaceTestOwner({ owner: f.owner, stage: f.stage, runtime: f.runtime,
    suite: f.suite, limits, approval: await approvalFor(f, review) });
  assert.equal((await first.run()).result.outcome, 'failed');
  const nextOwner = await f.owner.continueAfter(first), second = await nextOwner.propose();
  assert.equal(second.attempt, 2); assert.equal(second.priorCompletionTokens, 120);
  assert.equal(second.parent.revisionDigest, f.stage.revision.revisionDigest);
  const nextTask = taskFrom(f.requests[1]);
  assert.equal(nextTask.feedback.outcome, 'failed');
  assert.equal(nextTask.feedback.resultDigest, (await first.reconcile()).result.receiptDigest);
  assert.ok(nextTask.feedback.failures.some(x => x.caseId === 'completed-only'));
  const nextCandidate = await prepareWorkspaceReview({ owner: nextOwner, stage: second, runtime: f.runtime, suite: f.suite, limits });
  const nextReview = { ...review, reviewCandidateDigest: nextCandidate.reviewCandidateDigest };
  const next = await createReviewedWorkspaceTestOwner({ owner: nextOwner, stage: second, runtime: f.runtime,
    suite: f.suite, limits, approval: await approvalFor(f, nextReview) });
  assert.equal((await next.run()).result.outcome, 'passed');
  const exported = await next.export();
  assert.equal(exported.changes.length, 1); assert.equal(exported.changes[0].afterText, f.fixed);
  await assert.rejects(nextOwner.continueAfter(next), /failed/);
  assert.equal(f.requests.length, 2);
});
