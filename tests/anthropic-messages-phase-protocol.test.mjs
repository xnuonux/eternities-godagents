import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileAnthropicMessagesPhaseRequest,
  completeAnthropicMessagesPhaseResponse,
  inspectAnthropicMessagesPhaseResponse,
} from '../src/transports/anthropic-messages-phase-protocol.mjs';
import { completeOpenAICompatiblePhaseResponse } from '../src/transports/openai-compatible-phase-protocol.mjs';
import {
  reviewDispatch,
  revisionDispatch,
  setupPendingNativePhase,
} from './helpers/openai-compatible-phase-operation-fixture.mjs';

const policy = Object.freeze({
  provider: {
    modelId: 'claude-fixture-2026-08-31',
    maximumRequestBytes: 262_144,
    maximumResponseBytes: 262_144,
  },
  phases: {
    native: { maximumCompletionBytes: 262_144, maximumCompletionTokens: 400 },
    review: { maximumCompletionBytes: 262_144, maximumCompletionTokens: 1000 },
    revision: { maximumCompletionBytes: 262_144, maximumCompletionTokens: 1000 },
  },
});
const credential = 'anthropic-protocol-secret-canary';

function response(content = { content: 'one exact Anthropic native artifact' }, usage = {}) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify({
      id: 'msg_fixture',
      type: 'message',
      role: 'assistant',
      model: policy.provider.modelId,
      content: [{ type: 'text', text: JSON.stringify(content) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 40,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 60,
        output_tokens: 30,
        ...usage,
      },
    }),
  };
}

function openAIResponse(modelId, content) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify({
      id: 'chatcmpl_cross_adapter_fixture',
      object: 'chat.completion',
      model: modelId,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(content) },
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

test('compiles one cache-stable Anthropic Messages structured-output request', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const compiled = compileAnthropicMessagesPhaseRequest({
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native, policy,
  });
  const body = JSON.parse(compiled.body);
  assert.equal(body.model, policy.provider.modelId);
  assert.equal(body.max_tokens, fixture.dispatch.maxCompletionTokens);
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, 'user');
  assert.equal(body.output_config.format.type, 'json_schema');
  const wireSchema = JSON.stringify(body.output_config.format.schema);
  for (const unsupported of ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'uniqueItems']) {
    assert.equal(wireSchema.includes(`\"${unsupported}\"`), false, unsupported);
  }
  assert.equal(body.stream, false);
  assert.equal(compiled.body.includes(credential), false);
  assert.ok(Object.isFrozen(compiled));
});

test('maps Anthropic text and cache usage into the existing typed completion', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const completion = completeAnthropicMessagesPhaseResponse({
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native,
    policy, response: response(), credential,
    startedAt: '2026-08-31T22:00:00.000Z', completedAt: '2026-08-31T22:00:01.000Z',
  });
  assert.equal(completion.artifact.content, 'one exact Anthropic native artifact');
  assert.deepEqual(completion.usage, {
    inputTokens: 200,
    cachedInputTokens: 60,
    reasoningTokens: 0,
    visibleOutputTokens: 30,
    completionTokens: 30,
  });
  assert.deepEqual(completion.authority, {
    authorityExpanded: false,
    realmEffects: false,
    continuityAdmission: false,
    personalKeelWrite: false,
    identityOwnership: false,
    evolution: false,
    soul: false,
  });

  const inspected = inspectAnthropicMessagesPhaseResponse({
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native,
    policy, response: response(), credential,
    startedAt: '2026-08-31T22:00:00.000Z', completedAt: '2026-08-31T22:00:01.000Z',
  });
  assert.deepEqual(inspected.completion, completion);
  assert.deepEqual(inspected.providerUsage, {
    uncachedInputTokens: 40,
    cacheCreationInputTokens: 100,
    cacheReadInputTokens: 60,
    outputTokens: 30,
    thinkingTokens: 0,
  });
});

test('rejects tools, multiple content blocks, wrong models, and credential reflection', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const base = {
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native,
    policy, credential, startedAt: '2026-08-31T22:00:00.000Z', completedAt: '2026-08-31T22:00:01.000Z',
  };
  for (const mutate of [
    (value) => { value.model = 'changed-model'; },
    (value) => { value.content.push({ type: 'text', text: '{}' }); },
    (value) => { value.content = [{ type: 'tool_use', id: 'toolu_1', name: 'shell', input: {} }]; },
    (value) => { value.content[0].text = JSON.stringify({ content: credential }); },
  ]) {
    const value = JSON.parse(response().bodyText);
    mutate(value);
    assert.throws(
      () => completeAnthropicMessagesPhaseResponse({ ...base, response: { ...response(), bodyText: JSON.stringify(value) } }),
      /response is invalid|reflected its credential/,
    );
  }
});

test('rejects contradictory, negative, and over-budget Anthropic usage', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const base = {
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native,
    policy, credential, startedAt: '2026-08-31T22:00:00.000Z', completedAt: '2026-08-31T22:00:01.000Z',
  };
  for (const usage of [
    { input_tokens: -1 },
    { cache_read_input_tokens: -1 },
    { output_tokens: fixture.dispatch.maxCompletionTokens + 1 },
    { output_tokens_details: { thinking_tokens: 1 } },
    { output_tokens_details: { thinking_tokens: -1 } },
    { output_tokens_details: 'forged' },
  ]) {
    assert.throws(
      () => completeAnthropicMessagesPhaseResponse({ ...base, response: response(undefined, usage) }),
      /response is invalid/,
    );
  }
});

test('locally rejects values that violate constraints stripped from the Anthropic wire schema', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const dispatch = await reviewDispatch(fixture.suite.descriptors.review);
  assert.throws(
    () => completeAnthropicMessagesPhaseResponse({
      phase: 'review', dispatch, descriptor: fixture.suite.descriptors.review, policy,
      response: response({
        recommendation: 'revise',
        findings: [{
          id: 'x'.repeat(129), message: 'bounded finding', required: true, severity: 'important',
        }],
        summary: 'the provider wire stripped length constraints but the host retained them',
      }),
      credential,
      startedAt: '2026-08-31T22:05:00.000Z',
      completedAt: '2026-08-31T22:05:01.000Z',
    }),
    /response is invalid/,
  );
});

test('builds review and revision artifacts with only host-assigned immutable digests', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const cases = [
    {
      phase: 'review',
      dispatch: await reviewDispatch(fixture.suite.descriptors.review),
      descriptor: fixture.suite.descriptors.review,
      content: {
        recommendation: 'accept', findings: [], summary: 'the exact subject satisfies review',
      },
      assertArtifact(artifact, dispatch) {
        assert.equal(artifact.subjectDigest, dispatch.package.subject.artifactDigest);
        assert.equal(artifact.recommendation, 'accept');
        assert.equal(Object.hasOwn(artifact, 'nativeArtifactDigest'), false);
      },
    },
    {
      phase: 'revision',
      dispatch: revisionDispatch(fixture.suite.descriptors.revision),
      descriptor: fixture.suite.descriptors.revision,
      content: {
        addressedFindingIds: ['bind-evidence'], content: 'the exact evidence-bound revision',
      },
      assertArtifact(artifact, dispatch) {
        assert.equal(artifact.nativeArtifactDigest, dispatch.package.native.artifactDigest);
        assert.equal(artifact.reviewArtifactDigest, dispatch.package.review.artifactDigest);
        assert.deepEqual(artifact.addressedFindingIds, ['bind-evidence']);
        assert.equal(Object.hasOwn(artifact, 'subjectDigest'), false);
      },
    },
  ];

  for (const item of cases) {
    const compiled = compileAnthropicMessagesPhaseRequest({ ...item, policy });
    const body = JSON.parse(compiled.body);
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(Object.hasOwn(body.output_config.format.schema.properties, 'subjectDigest'), false);
    assert.equal(Object.hasOwn(body.output_config.format.schema.properties, 'nativeArtifactDigest'), false);
    assert.equal(Object.hasOwn(body.output_config.format.schema.properties, 'reviewArtifactDigest'), false);
    const completion = completeAnthropicMessagesPhaseResponse({
      ...item,
      policy,
      response: response(item.content),
      credential,
      startedAt: '2026-08-31T22:10:00.000Z',
      completedAt: '2026-08-31T22:10:01.000Z',
    });
    item.assertArtifact(completion.artifact, item.dispatch);
    assert.equal(completion.authority.authorityExpanded, false);
  }
});

test('produces the same trusted native artifact and authority across provider adapters', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const content = { content: 'one exact cross-adapter native artifact' };
  const times = {
    startedAt: '2026-08-31T22:20:00.000Z',
    completedAt: '2026-08-31T22:20:01.000Z',
  };
  const anthropic = completeAnthropicMessagesPhaseResponse({
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native,
    policy, response: response(content), credential, ...times,
  });
  const openAIPolicy = {
    provider: { modelId: 'openai-cross-adapter-fixture' },
  };
  const openAI = completeOpenAICompatiblePhaseResponse({
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native,
    policy: openAIPolicy,
    response: openAIResponse(openAIPolicy.provider.modelId, content),
    credential: 'openai-cross-adapter-secret',
    ...times,
  });

  assert.deepEqual(anthropic.artifact, openAI.artifact);
  assert.deepEqual(anthropic.authority, openAI.authority);
  assert.equal(anthropic.dispatchDigest, openAI.dispatchDigest);
  assert.equal(anthropic.transportDescriptorDigest, openAI.transportDescriptorDigest);
  assert.deepEqual(anthropic.usage, openAI.usage);
});

test('enforces provider response and phase artifact byte ceilings before completion', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const base = {
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native,
    credential, startedAt: '2026-08-31T22:30:00.000Z', completedAt: '2026-08-31T22:30:01.000Z',
  };
  const tinyResponsePolicy = structuredClone(policy);
  tinyResponsePolicy.provider.maximumResponseBytes = 128;
  assert.throws(
    () => completeAnthropicMessagesPhaseResponse({
      ...base, policy: tinyResponsePolicy, response: response({ content: 'x'.repeat(256) }),
    }),
    /response is invalid/,
  );

  const tinyArtifactPolicy = structuredClone(policy);
  tinyArtifactPolicy.phases.native.maximumCompletionBytes = 64;
  assert.throws(
    () => completeAnthropicMessagesPhaseResponse({
      ...base, policy: tinyArtifactPolicy, response: response({ content: 'x'.repeat(256) }),
    }),
    /response is invalid/,
  );
});
