import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text } from '../core/digest.mjs';
import {
  buildProviderNeutralPhaseCompletion,
  providerNeutralPhaseInput,
  providerNeutralPhaseOutputSchema,
  PROVIDER_NEUTRAL_PHASE_SYSTEM_PROMPTS,
  verifyProviderNeutralPhaseDispatch,
} from './provider-neutral-phase-semantics.mjs';

const PHASES = new Set(['native', 'review', 'revision']);
const PROTOCOL_ID = 'eternities-anthropic-messages-phase-request-v1';
const MESSAGES = Object.freeze({
  'dispatch-invalid': 'Anthropic Messages phase dispatch is invalid',
  'request-over-budget': 'Anthropic Messages phase request exceeds its byte ceiling',
  'response-invalid': 'Anthropic Messages phase response is invalid',
  'credential-reflected': 'Anthropic Messages phase response reflected its credential',
});

export class AnthropicMessagesPhaseProtocolError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('Anthropic Messages phase protocol error code is invalid');
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'AnthropicMessagesPhaseProtocolError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new AnthropicMessagesPhaseProtocolError(code, cause);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function verifyDispatch(phase, dispatch, descriptor) {
  try {
    verifyProviderNeutralPhaseDispatch({ phase, dispatch, descriptor });
  } catch (error) {
    fail('dispatch-invalid', error);
  }
}

export function compileAnthropicMessagesPhaseRequest({ phase, dispatch, descriptor, policy } = {}) {
  if (!PHASES.has(phase)) throw new TypeError('Anthropic Messages phase is invalid');
  verifyDispatch(phase, dispatch, descriptor);
  if (dispatch.maxCompletionTokens > policy?.phases?.[phase]?.maximumCompletionTokens) {
    fail('request-over-budget');
  }
  let input;
  let schema;
  try {
    input = providerNeutralPhaseInput({ phase, dispatch, descriptor, protocolId: PROTOCOL_ID });
    schema = providerNeutralPhaseOutputSchema({ phase, dispatch, descriptor });
  } catch (error) {
    fail('dispatch-invalid', error);
  }
  const request = {
    model: policy?.provider?.modelId,
    max_tokens: dispatch.maxCompletionTokens,
    stream: false,
    system: [{
      type: 'text',
      text: PROVIDER_NEUTRAL_PHASE_SYSTEM_PROMPTS[phase],
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{ role: 'user', content: [{ type: 'text', text: canonicalJson(input) }] }],
    output_config: { format: { type: 'json_schema', schema } },
  };
  const body = canonicalJson(request);
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  if (typeof policy?.provider?.modelId !== 'string' || policy.provider.modelId.length === 0
      || !Number.isInteger(policy?.provider?.maximumRequestBytes)
      || bodyBytes > policy.provider.maximumRequestBytes) {
    fail('request-over-budget');
  }
  return deepFreeze({ body, bodyBytes, requestDigest: sha256Text(body) });
}

function usageFrom(envelope, maximumCompletionTokens) {
  const usage = envelope?.usage;
  const uncached = usage?.input_tokens;
  const created = usage?.cache_creation_input_tokens ?? 0;
  const cached = usage?.cache_read_input_tokens ?? 0;
  const completion = usage?.output_tokens;
  if ([uncached, created, cached, completion].some((value) => !Number.isSafeInteger(value) || value < 0)
      || completion > maximumCompletionTokens) {
    fail('response-invalid');
  }
  const inputTokens = uncached + created + cached;
  if (!Number.isSafeInteger(inputTokens)) fail('response-invalid');
  return {
    inputTokens,
    cachedInputTokens: cached,
    reasoningTokens: 0,
    visibleOutputTokens: completion,
    completionTokens: completion,
  };
}

function contentFrom(response, policy, credential) {
  if (!response || typeof response.bodyText !== 'string') fail('response-invalid');
  if (typeof credential !== 'string' || credential.length < 8) fail('response-invalid');
  if (response.bodyText.includes(credential)) fail('credential-reflected');
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    fail('response-invalid');
  }
  const contentType = response.headers?.['content-type'];
  if (typeof contentType === 'string' && contentType.length > 0
      && !contentType.toLowerCase().startsWith('application/json')) {
    fail('response-invalid');
  }
  let envelope;
  try {
    envelope = JSON.parse(response.bodyText);
  } catch (error) {
    fail('response-invalid', error);
  }
  if (envelope?.type !== 'message' || envelope?.role !== 'assistant'
      || envelope?.model !== policy?.provider?.modelId
      || envelope?.stop_reason !== 'end_turn'
      || !Array.isArray(envelope?.content) || envelope.content.length !== 1
      || envelope.content[0]?.type !== 'text' || typeof envelope.content[0].text !== 'string') {
    fail('response-invalid');
  }
  let content;
  try {
    content = JSON.parse(envelope.content[0].text);
    assertNoCredentialFields(content);
  } catch (error) {
    fail('response-invalid', error);
  }
  return { content, envelope };
}

export function completeAnthropicMessagesPhaseResponse({
  phase, dispatch, descriptor, policy, response, credential, startedAt, completedAt,
} = {}) {
  if (!PHASES.has(phase)) throw new TypeError('Anthropic Messages phase is invalid');
  verifyDispatch(phase, dispatch, descriptor);
  const { content, envelope } = contentFrom(response, policy, credential);
  const usage = usageFrom(envelope, dispatch.maxCompletionTokens);
  try {
    return buildProviderNeutralPhaseCompletion({
      phase, dispatch, descriptor, content, usage, startedAt, completedAt,
    });
  } catch (error) {
    if (error instanceof AnthropicMessagesPhaseProtocolError) throw error;
    fail('response-invalid', error);
  }
}
