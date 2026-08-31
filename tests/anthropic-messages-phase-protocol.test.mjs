import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileAnthropicMessagesPhaseRequest,
  completeAnthropicMessagesPhaseResponse,
} from '../src/transports/anthropic-messages-phase-protocol.mjs';
import { setupPendingNativePhase } from './helpers/openai-compatible-phase-operation-fixture.mjs';

const policy = Object.freeze({
  provider: { modelId: 'claude-fixture-2026-08-31', maximumRequestBytes: 262_144 },
  phases: { native: { maximumCompletionTokens: 400 } },
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
  ]) {
    assert.throws(
      () => completeAnthropicMessagesPhaseResponse({ ...base, response: response(undefined, usage) }),
      /response is invalid/,
    );
  }
});
