import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { snapshotProviderProcessResponse } from './provider-phase-resolution.mjs';
import { GROK_REJECTION_STAGES } from './grok-cli-rejection-diagnostic.mjs';
import {
  buildProviderNeutralPhaseCompletion, providerNeutralPhaseInput,
  providerNeutralPhaseOutputSchema, PROVIDER_NEUTRAL_PHASE_SYSTEM_PROMPTS,
  verifyProviderNeutralPhaseDispatch,
} from './provider-neutral-phase-semantics.mjs';

const PROFILE = 'grok-headless-additive-v1';
const MAX_TOKENS = 10_000_000;
const PHASES = new Set(['native', 'review', 'revision']);
const USAGE_KEYS = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens', 'reasoning_tokens', 'total_tokens'];
const MODEL_KEYS = ['inputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'outputTokens', 'modelCalls', 'costUSD'];

export class GrokCliPhaseProtocolError extends Error {
  constructor(code, stage = null) {
    if (!['dispatch-invalid', 'request-over-budget', 'response-invalid'].includes(code)) throw new TypeError('invalid Grok protocol error code');
    if (stage !== null && !GROK_REJECTION_STAGES.includes(stage)) throw new TypeError('invalid Grok rejection stage');
    // Never attach raw provider output or parser errors to durable failures.
    super(`Grok CLI phase ${code}`);
    this.name = 'GrokCliPhaseProtocolError';
    this.code = code;
    this.stage = stage;
  }
}
function fail(code = 'response-invalid') { throw new GrokCliPhaseProtocolError(code); }
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function count(value) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TOKENS; }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function selected(value, keys) {
  return Object.fromEntries(keys.filter(k => Object.hasOwn(value, k)).map(k => [k, structuredClone(value[k])]));
}
function dispatchCheck(phase, dispatch, descriptor) {
  if (!PHASES.has(phase)) fail('dispatch-invalid');
  try { verifyProviderNeutralPhaseDispatch({ phase, dispatch, descriptor }); } catch { fail('dispatch-invalid'); }
}

export function compileGrokCliPhaseRequest({ phase, dispatch, descriptor, policy } = {}) {
  dispatchCheck(phase, dispatch, descriptor);
  if (policy?.provider?.modelId !== 'grok-4.6' || policy.provider.usageProfile !== PROFILE
      || !['low', 'medium', 'high'].includes(policy.provider.reasoningEffort)
      || !positive(policy.phases?.[phase]?.maximumCompletionTokens)
      || dispatch.maxCompletionTokens > policy.phases[phase].maximumCompletionTokens
      || !positive(policy.provider.maximumRequestBytes)) fail('request-over-budget');
  const schema = providerNeutralPhaseOutputSchema({ phase, dispatch, descriptor });
  const request = {
    model: policy.provider.modelId,
    maxCompletionTokens: dispatch.maxCompletionTokens,
    reasoningEffort: policy.provider.reasoningEffort,
    messages: [
      { role: 'system', content: `${PROVIDER_NEUTRAL_PHASE_SYSTEM_PROMPTS[phase]}\nReturn only JSON matching this schema: ${canonicalJson(schema)}` },
      { role: 'user', content: canonicalJson(providerNeutralPhaseInput({ phase, dispatch, descriptor,
        protocolId: 'eternities-grok-cli-phase-request-v1' })) },
    ],
  };
  const body = canonicalJson(request);
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  if (bodyBytes > policy.provider.maximumRequestBytes) fail('request-over-budget');
  return freeze({ body, bodyBytes, requestDigest: sha256Text(body) });
}

function evidenceFrom(envelope, modelId, maximumCompletionTokens, reportedModelId = modelId) {
  if (!object(envelope) || modelId !== 'grok-4.6' || envelope.num_turns !== 1
      || !['grok-4.6', 'grok-4.6-build'].includes(reportedModelId)
      || (Object.hasOwn(envelope, 'model') && envelope.model !== reportedModelId)
      || !object(envelope.modelUsage) || Object.keys(envelope.modelUsage).length !== 1
      || !object(envelope.modelUsage[reportedModelId])) fail();
  for (const flag of ['usage_is_incomplete', 'cost_is_partial']) {
    if (Object.hasOwn(envelope, flag) && typeof envelope[flag] !== 'boolean') fail();
  }
  if (envelope.usage_is_incomplete === true || !object(envelope.usage)) fail();
  const u = envelope.usage;
  const row = envelope.modelUsage[reportedModelId];
  if (Object.keys(u).some(k => !USAGE_KEYS.includes(k)) || Object.keys(row).some(k => !MODEL_KEYS.includes(k))) fail();
  const values = [u.input_tokens, u.cache_read_input_tokens, u.output_tokens, u.reasoning_tokens, u.total_tokens];
  if (!values.every(count) || u.reasoning_tokens > u.output_tokens
      || u.output_tokens > maximumCompletionTokens || row.modelCalls !== 1
      || row.inputTokens !== u.input_tokens || row.outputTokens !== u.output_tokens
      || row.cacheReadInputTokens !== u.cache_read_input_tokens) fail();
  const reportedCreation = Object.hasOwn(u, 'cache_creation_input_tokens');
  const creation = reportedCreation ? u.cache_creation_input_tokens
    : u.total_tokens - u.input_tokens - u.cache_read_input_tokens - u.output_tokens;
  if (!count(creation) || u.total_tokens !== u.input_tokens + u.cache_read_input_tokens + creation + u.output_tokens
      || (Object.hasOwn(row, 'cacheCreationInputTokens') && row.cacheCreationInputTokens !== creation)) fail();

  for (const cost of [envelope.total_cost_usd, row.costUSD]) {
    if (cost !== undefined && (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0
        || envelope.cost_is_partial === true)) fail();
  }
  const ticks = envelope.total_cost_usd_ticks;
  if (ticks !== undefined && (!Number.isSafeInteger(ticks) || ticks < 0 || envelope.cost_is_partial === true)) fail();
  if (ticks !== undefined && envelope.total_cost_usd !== undefined
      && Math.abs(ticks / 1e10 - envelope.total_cost_usd) > 1e-10) fail();
  if (row.costUSD !== undefined && envelope.total_cost_usd !== undefined
      && Math.abs(row.costUSD - envelope.total_cost_usd) > 1e-10) fail();

  const raw = selected(envelope, ['num_turns', 'model', 'usage_is_incomplete', 'cost_is_partial', 'total_cost_usd', 'total_cost_usd_ticks']);
  raw.usage = selected(u, USAGE_KEYS);
  raw.modelUsage = { [reportedModelId]: selected(row, MODEL_KEYS) };
  return freeze({
    usageProfile: PROFILE, modelId, raw,
    ...(reportedModelId !== modelId ? { reportedModelId } : {}),
    modelAttribution: Object.hasOwn(envelope, 'model') ? 'top-level-and-per-model-ledger' : 'per-model-ledger-only',
    cacheCreationInputTokens: creation,
    cacheCreationOrigin: reportedCreation ? 'reported' : 'derived-from-total',
    normalized: { inputTokens: u.input_tokens + u.cache_read_input_tokens + creation,
      cachedInputTokens: u.cache_read_input_tokens, reasoningTokens: u.reasoning_tokens,
      visibleOutputTokens: u.output_tokens - u.reasoning_tokens, completionTokens: u.output_tokens },
    reportingScope: 'reported-prompt-ledger-not-physical-call-count', actualCharge: 'unknown',
  });
}

export function verifyGrokCliProviderEvidence(value, { modelId = 'grok-4.6', reportedModelId = modelId } = {}) {
  try {
    if (!object(value) || value.usageProfile !== PROFILE || value.modelId !== modelId) fail();
    // This closed numeric codec deliberately handles provider token-counter
    // names rejected by the generic credential-shaped-key heuristic.
    // The host supplies the expected reported deployment, never the receipt.
    // Default verification retains the original exact-model contract.
    const rebuilt = evidenceFrom(value.raw, modelId, MAX_TOKENS, reportedModelId);
    if (canonicalJson(rebuilt) !== canonicalJson(value)) fail();
    return rebuilt;
  } catch { fail(); }
}

export function inspectGrokCliPhaseResponse({ phase, dispatch, descriptor, policy, response, startedAt, completedAt } = {}) {
  dispatchCheck(phase, dispatch, descriptor);
  let stage = 'process-envelope';
  try {
    const captured = snapshotProviderProcessResponse(response);
    if (captured.outcome !== 'completed' || captured.exitCode !== 0
        || policy?.provider?.usageProfile !== PROFILE
        || !positive(policy.provider.maximumResponseBytes)
        || Buffer.byteLength(captured.bodyText, 'utf8') > policy.provider.maximumResponseBytes) fail();
    stage = 'terminal-json';
    const envelope = JSON.parse(captured.bodyText);
    stage = 'terminal-shape';
    if (!object(envelope) || envelope.stopReason !== 'end_turn' || typeof envelope.text !== 'string') fail();
    stage = 'artifact-json';
    const content = JSON.parse(envelope.text);
    stage = 'artifact-boundary';
    assertNoCredentialFields(content);
    if (!positive(policy.phases?.[phase]?.maximumCompletionBytes)
        || Buffer.byteLength(canonicalJson(content), 'utf8') > policy.phases[phase].maximumCompletionBytes) fail();
    stage = 'usage-accounting';
    const providerUsage = evidenceFrom(envelope, policy.provider.modelId, dispatch.maxCompletionTokens, policy.provider.reportedModelId);
    stage = 'phase-contract';
    const completion = buildProviderNeutralPhaseCompletion({ phase, dispatch, descriptor, content,
      usage: providerUsage.normalized, startedAt, completedAt });
    return freeze({ completion, providerUsage });
  } catch { throw new GrokCliPhaseProtocolError('response-invalid', stage); }
}
