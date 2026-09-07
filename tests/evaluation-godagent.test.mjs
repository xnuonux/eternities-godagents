import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const api = await import('../scripts/evaluation/godagent.mjs').catch(e => { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; return {}; });
const usage = { inputTokens: 20, cachedInputTokens: 5, completionTokens: 12, reasoningTokens: 4, visibleOutputTokens: 8 };
async function execute(value) {
  assert.equal(typeof api.runGodagent, 'function');
  let inspections = 0;
  const result = await api.runGodagent({ directory: await mkdtemp(join(tmpdir(), 'godagent-outcome-')),
    maximumCompletionTokens: 24, runWorkflow: async () => value,
    inspectCompleted: async () => { inspections++; } });
  return { result, inspections };
}
test('non-completed runtime outcomes remain distinct without artifact inspection', async () => {
  for (const status of ['needs-decision', 'pending', 'rejected']) {
    const { result, inspections } = await execute({ status, artifact: null, ...(status === 'rejected' ? { usage } : {}) });
    assert.equal(result.status, status); assert.equal(inspections, 0);
    assert.equal(result.usageKnown, status === 'rejected');
  }
});
test('completed result uses aggregate receipt usage exactly once', async () => {
  const { result, inspections } = await execute({ status: 'completed', artifact: { path: 'verified-by-runtime' }, usage });
  assert.equal(result.status, 'completed'); assert.equal(inspections, 1);
  assert.deepEqual(result.usage, { inputTokens: 20, cachedInputTokens: 5, completionTokens: 12, reasoningTokens: 4 });
});
test('malformed runtime outcomes cannot masquerade as completion', async () => {
  for (const value of [null, { status: 'unknown' }, { status: 'completed', artifact: null, usage },
    { status: 'pending', artifact: { path: 'contradiction' } }]) {
    const { result, inspections } = await execute(value);
    assert.equal(result.status, 'stopped'); assert.equal(result.category, 'workflow-result-invalid');
    assert.equal(inspections, 0);
  }
});
test('invalid aggregate accounting blocks artifact inspection', async () => {
  for (const broken of [undefined, { ...usage, visibleOutputTokens: 7 }, { ...usage, completionTokens: 25, visibleOutputTokens: 21 }]) {
    const { result, inspections } = await execute({ status: 'completed', artifact: {}, usage: broken });
    assert.equal(result.category, 'usage-invalid'); assert.equal(inspections, 0);
  }
});
