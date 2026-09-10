import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { workspaceOwnerFixture } from './helpers/workspace-owner-fixture.mjs';
import { openLocalWorkspaceHost } from '../src/host/local-workspace-host.mjs';

const runtimePath = process.env.GODAGENTS_WORKSPACE_BROWSER_RUNTIME;
const json = value => `${canonicalJson(value)}\n`;
test('application host exposes no approval API and carries a staged real actor through operator approval to checked export', { skip: !runtimePath }, async t => {
  const f = await workspaceOwnerFixture(t);
  const policyPath = join(f.root, 'workspace-policy.json'); await writeFile(policyPath, json(f.policy));
  const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  const suitePath = join(f.root, 'browser-suite.json'), suite = JSON.parse(await readFile(new URL('./fixtures/browser-workspace/suite.json', import.meta.url), 'utf8'));
  await writeFile(suitePath, json(suite));
  const reviewDirectory = join(f.root, 'reviews'), exportDirectory = join(f.root, 'checked-exports'); await mkdir(reviewDirectory);
  const providerPolicyPath = join(f.workspace, 'provider-policy.json');
  const providerPolicy = JSON.parse(await readFile(providerPolicyPath, 'utf8'));
  const config = { schemaVersion: 1, protocolId: 'eternities-local-workspace-host-v1',
    workspacePolicy: { path: policyPath, digest: sha256Value(f.policy) },
    provider: { family: 'openai-compatible-chat-completions-v1', policyPath: providerPolicyPath, policyDigest: sha256Value(providerPolicy) },
    browser: { runtimePath, runtimeDigest: sha256Value(runtime), suitePath, suiteDigest: sha256Value(suite),
      limits: { maxFiles: 4, maxAppBytes: 131072, maxResultBytes: 16384, stepTimeoutMs: 500,
        launchTimeoutMs: 10000, runTimeoutMs: 15000, cleanupTimeoutMs: 5000 } },
    reviewDirectory, exportDirectory };
  const configPath = join(f.root, 'host.json'); await writeFile(configPath, json(config));
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls++; const body = JSON.parse(init.body);
    const find = value => {
      if (typeof value === 'string') { try { const v = JSON.parse(value); if (v.protocolId === 'eternities-workspace-repair-task-v1') return v; } catch {} }
      if (value && typeof value === 'object') for (const child of Object.values(value)) { const v = find(child); if (v) return v; }
      return null;
    };
    const task = find(JSON.parse(body.messages.find(row => row.role === 'user').content)); assert.ok(task);
    const proposal = { schemaVersion: 1, parentDigest: task.parentDigest,
      changes: [{ path: 'index.html', expectedSha256: task.files[0].sha256, text: f.fixed }] };
    return new Response(json({ id: 'host-fixture', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content: canonicalJson(proposal) }) } }],
      usage: { prompt_tokens: 200, completion_tokens: 120, total_tokens: 320,
        completion_tokens_details: { reasoning_tokens: 20 }, prompt_tokens_details: { cached_tokens: 0 } } }),
    { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const env = { GODAGENT_WORKSPACE_HOST_SHA256: sha256Value(config), GODAGENT_TEST_PHASE_KEY: 'synthetic-local-workspace-key' };
  await assert.rejects(openLocalWorkspaceHost({ configPath, env: {}, fetchImpl, registryRoot: f.registryRoot }), /pin/);
  const host = await openLocalWorkspaceHost({ configPath, env, fetchImpl, registryRoot: f.registryRoot });
  assert.deepEqual(Object.keys(host), ['run']);
  const waiting = await host.run(); assert.equal(waiting.status, 'needs-review'); assert.equal(calls, 1);
  const review = { schemaVersion: 1, protocolId: 'eternities-workspace-code-review-v1', reviewCandidateDigest: waiting.reviewCandidate.reviewCandidateDigest,
    reviewerRef: 'operator:first-party-fixture-review', decision: 'approved' };
  await writeFile(join(reviewDirectory, `${review.reviewCandidateDigest}.json`), json(review));
  assert.equal((await host.run()).status, 'needs-review', 'file alone without a host pin cannot authorize execution');
  const approvedEnv = { ...env, GODAGENT_WORKSPACE_REVIEW_PINS: JSON.stringify({ [review.reviewCandidateDigest]: sha256Value(review) }) };
  const approved = await openLocalWorkspaceHost({ configPath, env: approvedEnv, fetchImpl, registryRoot: f.registryRoot });
  const result = await approved.run(); assert.equal(result.status, 'completed'); assert.equal(calls, 1);
  const bundle = JSON.parse(await readFile(result.exportPath, 'utf8'));
  assert.equal(bundle.changes[0].afterText, f.fixed);
  assert.deepEqual(await readFile(join(f.policy.source.sourceRoot, 'index.html')), f.broken);
  assert.deepEqual(await approved.run(), result); assert.equal(calls, 1);
  await writeFile(join(reviewDirectory, `${review.reviewCandidateDigest}.json`), json({ ...review, decision: 'denied' }));
  await assert.rejects(approved.run(), /review/);
});
