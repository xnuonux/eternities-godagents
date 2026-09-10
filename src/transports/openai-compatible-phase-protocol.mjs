import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text } from '../core/digest.mjs';
import { phaseSystemPrompt } from './operating-guidance.mjs';
import {
  buildProviderNeutralPhaseCompletion,
  providerNeutralPhaseInput,
  providerNeutralPhaseOutputSchema,
  PROVIDER_NEUTRAL_PHASE_SYSTEM_PROMPTS,
  verifyProviderNeutralPhaseDispatch,
} from './provider-neutral-phase-semantics.mjs';

const PHASES = new Set(['native', 'review', 'revision']);
const PROTOCOL_ID = 'eternities-openai-compatible-phase-request-v1';

const SYSTEM_PROMPTS = PROVIDER_NEUTRAL_PHASE_SYSTEM_PROMPTS;

const MESSAGES = Object.freeze({
  'dispatch-invalid': 'OpenAI-compatible phase dispatch is invalid',
  'request-over-budget': 'OpenAI-compatible phase request exceeds its byte ceiling',
  'response-invalid': 'OpenAI-compatible phase response is invalid',
  'credential-reflected': 'OpenAI-compatible phase response reflected its credential',
});

export class OpenAICompatiblePhaseProtocolError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('phase protocol error code is invalid');
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'OpenAICompatiblePhaseProtocolError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new OpenAICompatiblePhaseProtocolError(code, cause);
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
  return dispatch;
}

function modelInput(phase, dispatch, descriptor) {
  return providerNeutralPhaseInput({
    phase, dispatch, descriptor, protocolId: PROTOCOL_ID,
  });
}

function responseSchema(phase, dispatch, descriptor) {
  return providerNeutralPhaseOutputSchema({ phase, dispatch, descriptor });
}

export function compileOpenAICompatiblePhaseRequest({ phase, dispatch, descriptor, policy } = {}) {
  if (!PHASES.has(phase)) throw new TypeError('OpenAI-compatible phase is invalid');
  verifyDispatch(phase, dispatch, descriptor);
  if (dispatch.maxCompletionTokens > policy.phases[phase].maximumCompletionTokens) {
    fail('request-over-budget');
  }
  const request = {
    model: policy.provider.modelId,
    n: 1,
    stream: false,
    store: false,
    max_completion_tokens: dispatch.maxCompletionTokens,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: `${phase}_phase_output_v1`,
        strict: true,
        schema: responseSchema(phase, dispatch, descriptor),
      },
    },
    messages: [
      { role: 'system', content: phaseSystemPrompt({phase, base: SYSTEM_PROMPTS[phase], policy}) },
      { role: 'user', content: canonicalJson(modelInput(phase, dispatch, descriptor)) },
    ],
  };
  if (policy.provider.profile === 'chat-completions-json-schema-reasoning-split-v1') {
    request.reasoning_split = true;
  }
  const body = canonicalJson(request);
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  if (bodyBytes > policy.provider.maximumRequestBytes) fail('request-over-budget');
  return deepFreeze({ body, bodyBytes, requestDigest: sha256Text(body) });
}

function usageFrom(envelope, maximumCompletionTokens, requireReasoningUsage = false) {
  const usage = envelope?.usage;
  const inputTokens = usage?.prompt_tokens;
  const completionTokens = usage?.completion_tokens;
  const cachedInputTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  if (requireReasoningUsage && !Number.isSafeInteger(usage?.completion_tokens_details?.reasoning_tokens)) {
    fail('response-invalid');
  }
  const values = [inputTokens, completionTokens, cachedInputTokens, reasoningTokens];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)
      || cachedInputTokens > inputTokens || reasoningTokens > completionTokens
      || completionTokens > maximumCompletionTokens
      || (usage.total_tokens !== undefined
        && (!Number.isSafeInteger(usage.total_tokens)
          || usage.total_tokens !== inputTokens + completionTokens))) {
    fail('response-invalid');
  }
  return {
    inputTokens,
    cachedInputTokens,
    reasoningTokens,
    visibleOutputTokens: completionTokens - reasoningTokens,
    completionTokens,
  };
}

function contentFrom(response, policy, credential) {
  if (!response || typeof response.bodyText !== 'string') fail('response-invalid');
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
  if (envelope?.model !== policy.provider.modelId
      || !Array.isArray(envelope?.choices) || envelope.choices.length !== 1) {
    fail('response-invalid');
  }
  const choice = envelope.choices[0];
  const message = choice?.message;
  if (choice?.index !== 0 || choice?.finish_reason !== 'stop'
      || message?.role !== 'assistant' || typeof message?.content !== 'string'
      || message.refusal != null || message.tool_calls != null || message.function_call != null) {
    fail('response-invalid');
  }
  let content;
  try {
    content = JSON.parse(message.content);
    assertNoCredentialFields(content);
  } catch (error) {
    fail('response-invalid', error);
  }
  return { content, envelope };
}

export function completeOpenAICompatiblePhaseResponse({
  phase,
  dispatch,
  descriptor,
  policy,
  response,
  credential,
  startedAt,
  completedAt,
} = {}) {
  if (!PHASES.has(phase)) throw new TypeError('OpenAI-compatible phase is invalid');
  verifyDispatch(phase, dispatch, descriptor);
  const { content, envelope } = contentFrom(response, policy, credential);
  const usage = usageFrom(envelope, dispatch.maxCompletionTokens,
    policy.provider.profile === 'chat-completions-json-schema-reasoning-split-v1');
  try {
    return buildProviderNeutralPhaseCompletion({
      phase,
      dispatch,
      descriptor,
      content,
      usage,
      startedAt,
      completedAt,
    });
  } catch (error) {
    if (error instanceof OpenAICompatiblePhaseProtocolError) throw error;
    fail('response-invalid', error);
  }
}
