import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoCredentialFields,
  projectInferenceEvent,
} from '../src/cortex/receipt-safety.mjs';

const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);

const requested = Object.freeze({
  eventType: 'cortex.requested',
  attemptId: 'attempt-1',
  ordinal: 1,
  adapterId: 'openai-compatible-v1',
  profile: 'chat-completions-json',
  modelId: 'test-model',
  requestDigest: digestA,
  stateEpoch: 0,
  hostPolicyId: 'local-test',
  hostPolicyDigest: digestB,
});

test('credential-shaped fields are rejected recursively without echoing values', () => {
  for (const field of [
    'Authorization', 'proxyAuthorization', 'authorizationHeader', 'apiKey', 'api_key',
    'x-api-key', 'apiToken', 'oauthToken', 'sessionToken', 'accessTokens', 'tokens',
    'auth', 'basicAuth', 'authHeader', 'authentication',
    'secret', 'secrets', 'credential', 'credentials', 'password', 'passwords',
    'privateKey', 'privateKeys', 'sessionCookie', 'headers', 'rawRequest',
    'rawResponse', 'environment',
  ]) {
    assert.throws(
      () => assertNoCredentialFields({ safe: [{ nested: { [field]: 'canary-secret-value' } }] }),
      (error) => error.message.includes('credential-shaped field')
        && !error.message.includes('canary-secret-value'),
      field,
    );
  }
});

test('ordinary usage counters are not mistaken for credentials', () => {
  assert.doesNotThrow(() => assertNoCredentialFields({
    usage: {
      cachedInputTokens: 3,
      completionTokens: 7,
      inputTokens: 11,
      maxCompletionTokens: 100,
      maxCycleCompletionTokens: 50,
      maximumCompletionTokens: 100,
      nativeCompletionTokens: 60,
      outputTokens: 7,
      promptTokens: 11,
      reasoningTokens: 4,
      reviewCompletionTokensPerRound: 10,
      revisionCompletionTokens: 20,
      totalCompletionTokens: 100,
      visibleOutputTokens: 3,
    },
  }));
  assert.doesNotThrow(() => assertNoCredentialFields({
    slots: { 'visual-system': { visualPrimitives: ['design-system', 'motion'] } },
    authority: [],
    author: 'fixture-author',
  }));
  assert.throws(
    () => assertNoCredentialFields({
      slots: { implementation: { 'visual-system': { tokens: ['credential-canary'] } } },
    }),
    /credential-shaped field/i,
  );
});

test('requested inference projection contains only fixed causal metadata', () => {
  const projected = projectInferenceEvent({ ...requested, ignored: 'not-durable' });

  assert.deepEqual(projected, {
    schemaVersion: 1,
    eventType: 'cortex.requested',
    attemptId: 'attempt-1',
    ordinal: 1,
    adapterId: 'openai-compatible-v1',
    profile: 'chat-completions-json',
    modelId: 'test-model',
    requestDigest: digestA,
    stateEpoch: 0,
    hostPolicyId: 'local-test',
    hostPolicyDigest: digestB,
  });
  assert.equal(Object.isFrozen(projected), true);
});

test('accepted and failed projections expose only their closed terminal fields', () => {
  const accepted = projectInferenceEvent({
    ...requested,
    eventType: 'cortex.accepted',
    responseDigest: 'c'.repeat(64),
    usage: { inputTokens: 11, outputTokens: 7 },
    providerMetadata: { region: 'ignored' },
  });
  const failed = projectInferenceEvent({
    ...requested,
    eventType: 'cortex.failed',
    reasonCode: 'timeout',
    responseDigest: 'd'.repeat(64),
    usage: { inputTokens: 0, outputTokens: 0 },
  });

  assert.deepEqual(accepted.usage, { inputTokens: 11, outputTokens: 7 });
  assert.equal(Object.hasOwn(accepted, 'providerMetadata'), false);
  assert.equal(failed.reasonCode, 'timeout');
  assert.equal(failed.responseDigest, 'd'.repeat(64));
});

test('unknown inference event types fail closed', () => {
  assert.throws(() => projectInferenceEvent({ ...requested, eventType: 'cortex.debug' }), /event type/);
});

test('failed projection rejects an open-ended reason code', () => {
  assert.throws(
    () => projectInferenceEvent({ ...requested, eventType: 'cortex.failed', reasonCode: 'provider-message' }),
    /reasonCode/,
  );
});
