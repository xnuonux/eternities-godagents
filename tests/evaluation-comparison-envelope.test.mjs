import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Text } from '../src/core/digest.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { compileOpenAICompatiblePhaseRequest } from '../src/transports/openai-compatible-phase-protocol.mjs';
import { nativeDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
const api = await import('../scripts/evaluation/comparison-envelope.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
function fixture() {
  const task = { objective: 'Solve the supplied task', input: { count: 4 }, requirements: ['Return the count'], outputFormat: 'JSON' };
  const providerPolicy = validOpenAICompatiblePhasePolicy();
  providerPolicy.provider.profile = 'chat-completions-json-schema-reasoning-split-v1';
  const limits = { maximumCalls: 1, maximumReservedTokens: 1000, maximumRequestBytes: 1_048_576,
    maximumResponseBytes: 1_048_576, timeoutMs: 30_000, maximumWallMs: 60_000 };
  return { task, providerPolicy,
    baseline: { endpoint: 'https://models.example.test/v1/chat/completions',
      request: { model: providerPolicy.provider.modelId, reasoning_split: true, max_completion_tokens: 1000,
        n: 1, stream: false, store: false,
        response_format: { type: 'json_schema', json_schema: { name: 'native_phase_output_v1', strict: true,
          schema: { type: 'object', additionalProperties: false, required: ['content'],
            properties: { content: { type: 'string', minLength: 1, maxLength: 16_777_216 } } } } },
        messages: [{ role: 'system', content: 'Return JSON with one string field content.' }, { role: 'user', content: canonicalJson(task) }] } },
    mission: { schemaVersion: 2, routeMode: 'effect-only', mission: { objective: canonicalJson(task) }, budgets: { nativeCompletionTokens: 1000 } },
    allocations: { baseline: limits, godagent: { ...limits }, totalCalls: 2, totalReservedTokens: 2000 } };
}
test('comparison envelope binds identical task, model and independently fixed allocations', () => {
  assert.equal(typeof api.bindComparisonEnvelope, 'function');
  const input = fixture();
  const result = api.bindComparisonEnvelope(input);
  assert.equal(result.model, input.providerPolicy.provider.modelId);
  assert.equal(result.allocations.totalCalls, 2);
  assert.equal(result.allocations.totalReservedTokens, 2000);
  input.allocations.baseline.maximumCalls = 5;
  assert.equal(result.allocations.baseline.maximumCalls, 1);
  assert.equal(Object.isFrozen(result.allocations.baseline), true);
});
test('model, profile, task and budget drift cannot receive a comparison envelope', () => {
  assert.equal(typeof api.bindComparisonEnvelope, 'function');
  for (const mutate of [
    x => { x.baseline.endpoint = 'https://other.example/v1/chat/completions'; },
    x => { x.baseline.request.model = 'another-model'; },
    x => { x.baseline.request.reasoning_split = false; },
    x => { x.providerPolicy.provider.profile = 'chat-completions-json-schema'; },
    x => { x.mission.mission.objective += ' additional task'; },
    x => { x.allocations.totalCalls = 3; },
    x => { x.allocations.godagent.maximumReservedTokens = 999; },
    x => { x.allocations.baseline.timeoutMs = 0; },
    x => { x.mission.budgets.nativeCompletionTokens = 999; },
    x => { x.baseline.request.messages.push({ role: 'user', content: 'hidden task' }); },
    x => { x.baseline.request.tools = []; },
    x => { x.providerPolicy.provider.timeoutMs = 29_000; },
    x => { delete x.baseline.request.response_format; },
    x => { x.baseline.request.response_format.json_schema.strict = false; },
    x => { x.baseline.request.n = 2; },
    x => { x.baseline.request.store = true; },
  ]) {
    const input = fixture(); mutate(input);
    assert.throws(() => api.bindComparisonEnvelope(input));
  }
});

test('comparison baseline output controls match the real native transport compiler', async t => {
  const input = fixture();
  const root = await mkdtemp(join(tmpdir(), 'comparison-wire-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policyPath = join(root, 'policy.json');
  await writeFile(policyPath, `${canonicalJson(input.providerPolicy)}\n`);
  const host = await createProviderPhaseHost({ family: 'openai-compatible-chat-completions-v1', policyPath,
    runtimeRoot: join(root, 'operations'), env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: sha256Text(canonicalJson(input.providerPolicy)) },
    fetchImpl: async () => { throw new Error('wire compilation cannot dispatch'); } });
  const descriptor = host.describe().descriptors.native;
  const dispatch = await nativeDispatch(t, descriptor);
  const compiled = JSON.parse(compileOpenAICompatiblePhaseRequest({ phase: 'native', dispatch, descriptor, policy: input.providerPolicy }).body);
  for (const key of ['n', 'stream', 'store', 'reasoning_split', 'response_format']) {
    assert.deepEqual(input.baseline.request[key], compiled[key], key);
  }
});
