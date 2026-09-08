import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { bindComparisonTask } from './comparison-task.mjs';

const limitKeys = ['maximumCalls', 'maximumReservedTokens', 'maximumRequestBytes', 'maximumResponseBytes', 'timeoutMs', 'maximumWallMs'];
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) throw new Error('comparison envelope fields invalid');
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Checks declared alignment, not provider-policy validity, genome authority,
// source closure, oracle quality, billing or permission to execute a comparison.
export function bindComparisonEnvelope(input) {
  exact(input, ['task', 'providerPolicy', 'baseline', 'mission', 'allocations']);
  const { task, providerPolicy, baseline, mission, allocations } = structuredClone(input);
  exact(baseline, ['endpoint', 'request']);
  exact(allocations, ['baseline', 'godagent', 'totalCalls', 'totalReservedTokens']);
  for (const arm of ['baseline', 'godagent']) {
    exact(allocations[arm], limitKeys);
    if (limitKeys.some(key => !Number.isSafeInteger(allocations[arm][key]) || allocations[arm][key] < 1)
        || allocations[arm].timeoutMs > allocations[arm].maximumWallMs
        || allocations[arm].maximumWallMs > 2_147_483_647) throw new Error('comparison resource allocation invalid');
  }
  if (canonicalJson(allocations.baseline) !== canonicalJson(allocations.godagent)
      || !Number.isSafeInteger(allocations.totalCalls) || !Number.isSafeInteger(allocations.totalReservedTokens)
      || allocations.totalCalls !== allocations.baseline.maximumCalls + allocations.godagent.maximumCalls
      || allocations.totalReservedTokens !== allocations.baseline.maximumReservedTokens + allocations.godagent.maximumReservedTokens) {
    throw new Error('comparison allocations must be matched, fixed and fully accounted');
  }
  const provider = providerPolicy?.provider;
  const request = baseline.request;
  exact(request, ['model', 'reasoning_split', 'max_completion_tokens', 'messages', 'n', 'stream', 'store', 'response_format']);
  // Match the current native phase wire controls. Source-gated preparation must
  // pin the compiler implementing these controls as well as this checker.
  const nativeFormat = { type: 'json_schema', json_schema: { name: 'native_phase_output_v1', strict: true,
    schema: { type: 'object', additionalProperties: false, required: ['content'],
      properties: { content: { type: 'string', minLength: 1, maxLength: 16_777_216 } } } } };
  if (request.n !== 1 || request.stream !== false || request.store !== false
      || canonicalJson(request.response_format) !== canonicalJson(nativeFormat)) throw new Error('comparison native wire controls differ');
  const endpoint = new URL(baseline.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
      || baseline.endpoint !== `${provider?.endpointOrigin}${provider?.endpointPath}`
      || provider?.profile !== 'chat-completions-json-schema-reasoning-split-v1'
      || typeof provider?.modelId !== 'string' || !provider.modelId
      || request?.model !== provider.modelId || request.reasoning_split !== true
      || request.max_completion_tokens !== allocations.baseline.maximumReservedTokens
      || providerPolicy?.phases?.native?.maximumCompletionTokens !== allocations.godagent.maximumReservedTokens
      || provider.timeoutMs !== allocations.godagent.timeoutMs
      || provider.maximumRequestBytes !== allocations.godagent.maximumRequestBytes
      || provider.maximumResponseBytes !== allocations.godagent.maximumResponseBytes
      || mission?.budgets?.nativeCompletionTokens !== allocations.godagent.maximumReservedTokens
      || mission.schemaVersion !== 2 || mission.routeMode !== 'effect-only') throw new Error('comparison model, profile or token binding mismatch');
  if (!Array.isArray(request.messages) || request.messages.length !== 2
      || request.messages[0]?.role !== 'system' || typeof request.messages[0].content !== 'string'
      || request.messages[1]?.role !== 'user') throw new Error('comparison baseline message shape invalid');
  for (const message of request.messages) exact(message, ['role', 'content']);
  if (Buffer.byteLength(canonicalJson(request)) > allocations.baseline.maximumRequestBytes) throw new Error('comparison request exceeds bound');
  const binding = bindComparisonTask({ task, baselineSubject: request.messages[1].content, godagentObjective: mission.mission?.objective });
  const unsigned = { schemaVersion: 1, protocolId: 'eternities-comparison-envelope-v1',
    taskDigest: binding.taskDigest, endpoint: baseline.endpoint, model: provider.modelId,
    profile: provider.profile, allocations, baselineRequestDigest: sha256Value(request),
    providerPolicyDigest: sha256Value(providerPolicy), missionDigest: sha256Value(mission) };
  return freeze({ ...unsigned, envelopeDigest: sha256Value(unsigned) });
}
