import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { buildIdentityBoundNativeTransportDescriptor } from '../src/runtime/identity-bound-native-contracts.mjs';
import { buildGodskillsReviewTransportDescriptor } from '../src/skills/review-transport-contracts.mjs';
import { buildMissionRevisionTransportDescriptor } from '../src/runtime/mission-revision-transport-contracts.mjs';
import { nativeDispatch, reviewDispatch, revisionDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { compileGrokCliPhaseRequest, inspectGrokCliPhaseResponse, verifyGrokCliProviderEvidence } from '../src/transports/grok-cli-phase-protocol.mjs';

const policy = {
  provider: { modelId: 'grok-4.6', reasoningEffort: 'low', usageProfile: 'grok-headless-additive-v1',
    maximumRequestBytes: 262144, maximumResponseBytes: 65536 },
  phases: Object.fromEntries(['native', 'review', 'revision'].map(p => [p, { maximumCompletionTokens: 800, maximumCompletionBytes: 32768 }])),
};
const at = '2026-08-31T20:01:00.000Z';
const descriptors = {
  native: buildIdentityBoundNativeTransportDescriptor({ transportId: 'grok-native-fixture', maximumDispatchBytes: 131072, maximumCompletionBytes: 65536 }),
  review: buildGodskillsReviewTransportDescriptor({ transportId: 'grok-review-fixture', maximumCompletionBytes: 65536 }),
  revision: buildMissionRevisionTransportDescriptor({ transportId: 'grok-revision-fixture', maximumCompletionBytes: 65536 }),
};
function terminal(content) {
  return {
    text: canonicalJson(content), stopReason: 'end_turn', num_turns: 1,
    usage: { input_tokens: 100, cache_read_input_tokens: 15, cache_creation_input_tokens: 5,
      output_tokens: 10, reasoning_tokens: 3, total_tokens: 130 },
    modelUsage: { 'grok-4.6': { inputTokens: 100, cacheReadInputTokens: 15, outputTokens: 10, modelCalls: 1 } },
  };
}
function response(value) {
  return { kind: 'subprocess-json-v1', outcome: 'completed', exitCode: 0, bodyText: canonicalJson(value) };
}
function inspect(phase, dispatch, value, overrides = {}) {
  return inspectGrokCliPhaseResponse({ phase, dispatch, descriptor: descriptors[phase], policy,
    response: response(value), startedAt: at, completedAt: at, ...overrides });
}

for (const [phase, content] of Object.entries({ native: { content: 'native artifact' },
  review: { recommendation: 'accept', findings: [], summary: 'checked exact subject' },
  revision: { addressedFindingIds: ['bind-evidence'], content: 'revision artifact' } })) {
  test(`${phase} prompt and native terminal bind the real phase contract without HTTP schema machinery`, async t => {
    const dispatch = phase === 'native' ? await nativeDispatch(t, descriptors[phase])
      : phase === 'review' ? await reviewDispatch(descriptors[phase]) : revisionDispatch(descriptors[phase]);
    const compiled = compileGrokCliPhaseRequest({ phase, dispatch, descriptor: descriptors[phase], policy });
    assert.equal(compiled.bodyBytes, Buffer.byteLength(compiled.body));
    assert.equal(compiled.requestDigest, sha256Text(compiled.body));
    const request = JSON.parse(compiled.body);
    assert.equal(request.model, 'grok-4.6');
    assert.equal(request.maxCompletionTokens, dispatch.maxCompletionTokens);
    assert.equal(request.reasoningEffort, 'low');
    assert.equal(JSON.parse(request.messages[1].content).dispatchDigest, dispatch.dispatchDigest);
    assert.match(request.messages[0].content, /JSON/);
    assert.equal(Object.hasOwn(request, 'response_format'), false);
    assert.equal(Object.hasOwn(request, 'output_config'), false);
    const result = inspect(phase, dispatch, terminal(content));
    assert.equal(result.completion.artifact.artifactType, phase);
    assert.deepEqual(result.completion.usage, { inputTokens: 120, cachedInputTokens: 15, reasoningTokens: 3, visibleOutputTokens: 7, completionTokens: 10 });
    assert.equal(result.providerUsage.cacheCreationOrigin, 'reported');
    assert.equal(result.providerUsage.raw.total_cost_usd, undefined);
    assert.equal(result.providerUsage.actualCharge, 'unknown');
    assert.equal(result.providerUsage.modelAttribution, 'per-model-ledger-only');
    verifyGrokCliProviderEvidence(result.providerUsage);
    assert.equal(Object.isFrozen(result.providerUsage.raw.usage), true);
    assert.throws(() => inspect(phase, dispatch, terminal({ ...content, unauthorized: true })), { code: 'response-invalid' });
  });
}

test('missing cache-write count is derived only from complete additive counters and is labeled', async t => {
  const dispatch = await nativeDispatch(t, descriptors.native);
  const value = terminal({ content: 'artifact' });
  delete value.usage.cache_creation_input_tokens;
  const result = inspect('native', dispatch, value);
  assert.equal(result.providerUsage.cacheCreationOrigin, 'derived-from-total');
  assert.equal(result.providerUsage.cacheCreationInputTokens, 5);
  assert.equal(Object.hasOwn(result.providerUsage.raw.usage, 'cache_creation_input_tokens'), false);
  assert.equal(result.completion.usage.inputTokens, 120);
  const tampered = structuredClone(result.providerUsage);
  tampered.cacheCreationInputTokens = 0;
  assert.throws(() => verifyGrokCliProviderEvidence(tampered));
  value.usage.total_tokens = 120;
  assert.throws(() => inspect('native', dispatch, value), { code: 'response-invalid' });
});

test('missing, contradictory, partial, over-budget or multi-model telemetry is rejected rather than normalized away', async t => {
  const dispatch = await nativeDispatch(t, descriptors.native);
  const mutations = [
    ...['input_tokens', 'cache_read_input_tokens', 'output_tokens', 'reasoning_tokens', 'total_tokens'].map(k => v => { delete v.usage[k]; }),
    v => { v.usage.total_tokens++; }, v => { v.usage.reasoning_tokens = 11; },
    v => { v.usage.input_tokens = -1; }, v => { v.usage.cache_read_input_tokens = '15'; },
    v => { v.usage_is_incomplete = true; }, v => { v.usage_is_incomplete = 'false'; },
    v => { v.num_turns = 2; }, v => { delete v.num_turns; },
    v => { v.modelUsage['grok-4.6'].modelCalls = 2; }, v => { delete v.modelUsage; },
    v => { v.modelUsage.other = v.modelUsage['grok-4.6']; },
    v => { v.modelUsage['grok-4.6'].inputTokens = 120; },
    v => { v.modelUsage['grok-4.6'].cacheReadInputTokens = 0; },
    v => { v.model = 'different-model'; }, v => { v.stopReason = 'max_tokens'; },
    v => { v.usage.output_tokens = 401; v.usage.total_tokens = 521; v.modelUsage['grok-4.6'].outputTokens = 401; },
    v => { v.cost_is_partial = true; v.total_cost_usd = 0; },
    v => { v.total_cost_usd = -1; }, v => { v.total_cost_usd_ticks = 1.5; },
    v => { v.usage.unknown_tokens = 1; }, v => { v.modelUsage['grok-4.6'].unknownCounter = 1; },
  ];
  for (const mutate of mutations) {
    const value = terminal({ content: 'artifact' }); mutate(value);
    assert.throws(() => inspect('native', dispatch, value), { code: 'response-invalid' });
  }
});

test('reported cost remains reported cost, not an actual-charge or free-usage claim', async t => {
  const dispatch = await nativeDispatch(t, descriptors.native);
  const value = terminal({ content: 'artifact' });
  value.total_cost_usd = 0.001;
  value.total_cost_usd_ticks = 10000000;
  value.modelUsage['grok-4.6'].costUSD = 0.001;
  value.model = 'grok-4.6';
  const result = inspect('native', dispatch, value);
  assert.equal(result.providerUsage.modelAttribution, 'top-level-and-per-model-ledger');
  assert.equal(result.providerUsage.raw.total_cost_usd_ticks, 10000000);
  assert.equal(result.providerUsage.actualCharge, 'unknown');
  value.total_cost_usd_ticks = 1;
  assert.throws(() => inspect('native', dispatch, value), { code: 'response-invalid' });
});

test('request and response ceilings, changed dispatch digest, and malformed terminal are locally enforced', async t => {
  const dispatch = await nativeDispatch(t, descriptors.native);
  assert.throws(() => compileGrokCliPhaseRequest({ phase: 'native', dispatch, descriptor: descriptors.native,
    policy: { ...policy, provider: { ...policy.provider, maximumRequestBytes: 1 } } }), { code: 'request-over-budget' });
  assert.throws(() => compileGrokCliPhaseRequest({ phase: 'native', dispatch: { ...dispatch, maxCompletionTokens: 399 }, descriptor: descriptors.native, policy }), { code: 'dispatch-invalid' });
  assert.throws(() => inspect('native', dispatch, terminal({ content: 'artifact' }), {
    policy: { ...policy, provider: { ...policy.provider, maximumResponseBytes: 1 } },
  }), { code: 'response-invalid' });
  for (const r of [{ status: 200, bodyText: '{}' }, { ...response(terminal({ content: 'artifact' })), exitCode: 1 },
    { ...response({}), bodyText: 'not JSON' }]) {
    assert.throws(() => inspect('native', dispatch, {}, { response: r }), { code: 'response-invalid' });
  }
});
test('rejected terminal reports a closed failure stage without raw provider text',async t=>{
  const dispatch=await nativeDispatch(t,descriptors.native);
  const value=terminal({content:'private-provider-text'});
  delete value.modelUsage;
  assert.throws(()=>inspect('native',dispatch,value),error=>{
    assert.equal(error.stage,'usage-accounting');
    assert.equal(JSON.stringify(error).includes('private-provider-text'),false);
    return true;
  });
});
