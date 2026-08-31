import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import {
  compileAnthropicMessagesPhaseRequest,
  completeAnthropicMessagesPhaseResponse,
} from '../../src/transports/anthropic-messages-phase-protocol.mjs';
import {
  compileOpenAICompatiblePhaseRequest,
  completeOpenAICompatiblePhaseResponse,
} from '../../src/transports/openai-compatible-phase-protocol.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import {
  reviewDispatch,
  revisionDispatch,
  setupPendingNativePhase,
} from './openai-compatible-phase-operation-fixture.mjs';

const OPENAI_CREDENTIAL = 'provider-neutral-openai-canary';
const ANTHROPIC_CREDENTIAL = 'provider-neutral-anthropic-canary';
const STARTED_AT = '2026-08-31T23:00:00.000Z';
const COMPLETED_AT = '2026-08-31T23:00:01.000Z';

function openAIResponse(model, content) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: canonicalJson({
      id: 'chatcmpl_provider_neutral_fixture',
      object: 'chat.completion',
      model,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: canonicalJson(content) },
      }],
      usage: {
        prompt_tokens: 200,
        prompt_tokens_details: { cached_tokens: 60 },
        completion_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 230,
      },
    }),
  };
}

function anthropicResponse(model, content) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: canonicalJson({
      id: 'msg_provider_neutral_fixture',
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: canonicalJson(content) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 140,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 60,
        output_tokens: 30,
      },
    }),
  };
}

function phaseRecord({ phase, dispatch, descriptor, content, openAIPolicy, anthropicPolicy }) {
  const openAIRequest = compileOpenAICompatiblePhaseRequest({
    phase, dispatch, descriptor, policy: openAIPolicy,
  });
  const anthropicRequest = compileAnthropicMessagesPhaseRequest({
    phase, dispatch, descriptor, policy: anthropicPolicy,
  });
  const shared = { phase, dispatch, descriptor, startedAt: STARTED_AT, completedAt: COMPLETED_AT };
  const openAICompletion = completeOpenAICompatiblePhaseResponse({
    ...shared,
    policy: openAIPolicy,
    response: openAIResponse(openAIPolicy.provider.modelId, content),
    credential: OPENAI_CREDENTIAL,
  });
  const anthropicCompletion = completeAnthropicMessagesPhaseResponse({
    ...shared,
    policy: anthropicPolicy,
    response: anthropicResponse(anthropicPolicy.provider.modelId, content),
    credential: ANTHROPIC_CREDENTIAL,
  });
  return {
    record: {
      dispatchDigest: dispatch.dispatchDigest,
      descriptorDigest: descriptor.descriptorDigest,
      openAIRequestDigest: openAIRequest.requestDigest,
      anthropicRequestDigest: anthropicRequest.requestDigest,
      artifactDigest: sha256Value(openAICompletion.artifact),
      completionParity: canonicalJson(openAICompletion) === canonicalJson(anthropicCompletion),
    },
    openAIRequest,
    anthropicRequest,
    openAICompletion,
    anthropicCompletion,
  };
}

function authorityExpansions(completions) {
  return completions.reduce((count, completion) => count
    + Object.values(completion.authority).filter(Boolean).length, 0);
}

export async function buildDeterministicProviderNeutralPhaseProtocolFixture() {
  const cleanups = [];
  const context = { after(callback) { cleanups.push(callback); } };
  try {
    const fixture = await setupPendingNativePhase(context);
    const openAIPolicy = fixture.transportPolicy;
    const anthropicPolicy = validAnthropicMessagesPhasePolicy();
    const cases = [
      {
        phase: 'native',
        dispatch: fixture.dispatch,
        descriptor: fixture.suite.descriptors.native,
        content: { content: 'one exact provider-neutral native artifact' },
      },
      {
        phase: 'review',
        dispatch: await reviewDispatch(fixture.suite.descriptors.review),
        descriptor: fixture.suite.descriptors.review,
        content: {
          recommendation: 'accept',
          findings: [],
          summary: 'the exact provider-neutral subject satisfies review',
        },
      },
      {
        phase: 'revision',
        dispatch: revisionDispatch(fixture.suite.descriptors.revision),
        descriptor: fixture.suite.descriptors.revision,
        content: {
          addressedFindingIds: ['bind-evidence'],
          content: 'the exact provider-neutral revision binds its evidence',
        },
      },
    ];
    const built = Object.fromEntries(cases.map((entry) => {
      const value = phaseRecord({ ...entry, openAIPolicy, anthropicPolicy });
      return [entry.phase, value];
    }));
    const completions = Object.values(built).flatMap((entry) => [entry.openAICompletion, entry.anthropicCompletion]);
    const requests = Object.values(built).flatMap((entry) => [entry.openAIRequest.body, entry.anthropicRequest.body]);
    const assertions = {
      phaseCount: Object.keys(built).length,
      exactTypedArtifactParity: Object.values(built).every(({ openAICompletion, anthropicCompletion }) => (
        canonicalJson(openAICompletion.artifact) === canonicalJson(anthropicCompletion.artifact)
      )),
      exactHostBindingParity: Object.values(built).every(({ openAICompletion, anthropicCompletion }) => (
        openAICompletion.dispatchDigest === anthropicCompletion.dispatchDigest
        && openAICompletion.transportDescriptorDigest === anthropicCompletion.transportDescriptorDigest
      )),
      exactUsageParity: Object.values(built).every(({ openAICompletion, anthropicCompletion }) => (
        canonicalJson(openAICompletion.usage) === canonicalJson(anthropicCompletion.usage)
      )),
      authorityExpansions: authorityExpansions(completions),
      credentialsInRequests: requests.filter((body) => (
        body.includes(OPENAI_CREDENTIAL) || body.includes(ANTHROPIC_CREDENTIAL)
      )).length,
      anthropicSystemCacheBoundary: Object.values(built).every(({ anthropicRequest }) => {
        const body = JSON.parse(anthropicRequest.body);
        return canonicalJson(body.system?.[0]?.cache_control) === canonicalJson({ type: 'ephemeral' });
      }),
      strictStructuredOutputs: Object.values(built).every(({ openAIRequest, anthropicRequest }) => {
        const openAI = JSON.parse(openAIRequest.body);
        const anthropic = JSON.parse(anthropicRequest.body);
        return openAI.response_format?.type === 'json_schema'
          && openAI.response_format?.json_schema?.strict === true
          && anthropic.output_config?.format?.type === 'json_schema';
      }),
    };
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-provider-neutral-phase-protocol-fixture-v1',
      policies: {
        openAICompatible: sha256Value(openAIPolicy),
        anthropicMessages: sha256Value(anthropicPolicy),
      },
      phases: Object.fromEntries(Object.entries(built).map(([phase, value]) => [phase, value.record])),
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}
