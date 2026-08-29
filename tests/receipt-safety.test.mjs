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
  for (const field of ['Authorization', 'apiKey', 'api_key', 'secret', 'credential', 'password', 'headers', 'rawRequest', 'rawResponse', 'environment']) {
    assert.throws(
      () => assertNoCredentialFields({ safe: [{ nested: { [field]: 'canary-secret-value' } }] }),
      (error) => error.message.includes('credential-shaped field')
        && !error.message.includes('canary-secret-value'),
      field,
    );
  }
});

test('ordinary usage counters are not mistaken for credentials', () => {
  assert.doesNotThrow(() => assertNoCredentialFields({ usage: { inputTokens: 11, outputTokens: 7 } }));
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
