import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { resolveComparisonOracle } from '../scripts/evaluation/comparison-oracles.mjs';
import { prepareComparison } from '../scripts/evaluation/comparison-preparation.mjs';
import { prepareRecoveryFixture } from './helpers/local-workflow-recovery-fixture.mjs';
const api = await import('../scripts/evaluation/comparison.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

async function prepare(t) {
  const root = await mkdtemp(join(tmpdir(), 'comparison-run-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const oracle = resolveComparisonOracle('weighted-interval-scheduling-v1');
  const task = oracle.createTask({ jobs: [
    { id: 'a', start: 0, end: 2, weight: 4 }, { id: 'b', start: 2, end: 4, weight: 5 }, { id: 'c', start: 0, end: 4, weight: 8 },
  ] });
  const workflow = await prepareRecoveryFixture(t, { effectOnlyTask: task });
  const policy = JSON.parse(await readFile(join(workflow.workspace, 'provider-policy.json'), 'utf8'));
  const limits = { maximumCalls: 1, maximumReservedTokens: 1000, maximumRequestBytes: 1048576, maximumResponseBytes: 1048576, timeoutMs: 30000, maximumWallMs: 60000 };
  const pin = async path => ({ path, sha256: sha256Text(await readFile(path, 'utf8')) });
  const preregistration = { schemaVersion: 1, comparison: {
    workflow: { path: workflow.manifestPath, sha256: workflow.manifestDigest }, task,
    baseline: { endpoint: 'https://models.example.test/v1/chat/completions', request: {
      model: policy.provider.modelId, reasoning_split: true, max_completion_tokens: 1000, n: 1, stream: false, store: false,
      response_format: { type: 'json_schema', json_schema: { name: 'native_phase_output_v1', strict: true,
        schema: { type: 'object', additionalProperties: false, required: ['content'], properties: { content: { type: 'string', minLength: 1, maxLength: 16777216 } } } } },
      messages: [{ role: 'system', content: 'Return the requested answer in the JSON content field.' }, { role: 'user', content: canonicalJson(task) }],
    } }, allocations: { baseline: limits, godagent: { ...limits }, totalCalls: 2, totalReservedTokens: 2000 },
  }, armOrder: ['baseline', 'godagent'], sources: [await pin(join(process.cwd(), 'scripts/evaluation/comparison.mjs'))],
  oracle: { id: oracle.id, source: await pin(oracle.sourcePath) } };
  return prepareComparison({ directory: join(root, 'trial'), preregistration, expectedDigest: sha256Value(preregistration) });
}

test('controlled comparison runs both real paths once and scores quality separately from completion', async t => {
  assert.equal(typeof api.runControlledComparison, 'function');
  const prepared = await prepare(t);
  let calls = 0;
  const result = await api.runControlledComparison({ ...prepared, fetchImpl: async (_url, init) => {
    const request = JSON.parse(init.body);
    const answer = ++calls === 1 ? { selectedIds: ['c'], totalWeight: 8 } : { selectedIds: ['a', 'b'], totalWeight: 9 };
    return new Response(JSON.stringify({ model: request.model,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ content: JSON.stringify(answer) }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 5 } },
    }), { headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(calls, 2);
  assert.equal(result.executionKind, 'controlled');
  assert.equal(result.arms.baseline.status, 'completed');
  assert.equal(result.arms.godagent.status, 'completed');
  assert.deepEqual(result.arms.baseline.quality, { status: 'scored', correct: false, reason: 'suboptimal' });
  assert.deepEqual(result.arms.godagent.quality, { status: 'scored', correct: true, reason: 'optimal' });
  assert.equal(result.arms.godagent.attemptedCalls, 1);
  assert.equal(result.arms.godagent.usage.completionTokens, 20);
  const content = JSON.stringify({ selectedIds: ['a', 'b'], totalWeight: 9 });
  assert.equal(result.arms.godagent.artifactDigest, sha256Value({ schemaVersion: 1, artifactType: 'native', content }));
  assert.equal(result.arms.godagent.oracleInputDigest, sha256Value({ content }));
  await assert.rejects(api.runControlledComparison({ ...prepared, fetchImpl: async () => { calls++; throw new Error('must not repeat'); } }));
  assert.equal(calls, 2);
});

test('controlled comparison retains uncertain dispatches without retry or fabricated quality', async t => {
  const prepared = await prepare(t);
  let calls = 0;
  const result = await api.runControlledComparison({ ...prepared, fetchImpl: async () => { calls++; throw new Error('synthetic interrupted transport'); } });
  assert.equal(calls, 2);
  assert.equal(result.comparable, false);
  for (const arm of Object.values(result.arms)) {
    assert.notEqual(arm.status, 'completed');
    assert.equal(arm.attemptedCalls, 1);
    assert.equal(arm.reservedCompletionTokens, 1000);
    assert.equal(arm.usage, null);
    assert.equal(arm.quality.status, 'unscored');
  }
});

test('invalid arm ordering and unsupported oracle stop before any run directory or dispatch', async t => {
  for (const kind of ['arm-order', 'oracle']) {
    const prepared = await prepare(t);
    const record = JSON.parse(await readFile(prepared.preparationPath, 'utf8'));
    if (kind === 'arm-order') record.preregistration.armOrder = ['../outside', 'baseline'];
    else record.preregistration.oracle.id = 'file:///not-approved.mjs';
    record.preregistrationDigest = sha256Value(record.preregistration);
    const text = `${canonicalJson(record)}\n`;
    await writeFile(prepared.preparationPath, text);
    let calls = 0;
    await assert.rejects(api.runControlledComparison({ ...prepared, preparationDigest: sha256Text(text), fetchImpl: async () => { calls++; } }));
    assert.equal(calls, 0);
    assert.equal((await readdir(dirname(prepared.preparationPath))).includes('run'), false);
  }
});
