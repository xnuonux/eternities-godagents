import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicAnthropicMessagesPhaseTransportFixture } from './helpers/anthropic-messages-phase-transport-certification-fixture.mjs';

test('durable Anthropic transport fixture reproduces three phases and credential-free replay', async () => {
  const first = await buildDeterministicAnthropicMessagesPhaseTransportFixture();
  const second = await buildDeterministicAnthropicMessagesPhaseTransportFixture();

  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-durable-anthropic-messages-phase-transport-fixture-v1');
  assert.deepEqual(Object.keys(first.phases), ['native', 'review', 'revision']);
  for (const phase of Object.values(first.phases)) {
    assert.match(phase.dispatchDigest, /^[a-f0-9]{64}$/);
    assert.match(phase.descriptorDigest, /^[a-f0-9]{64}$/);
    assert.match(phase.completionDigest, /^[a-f0-9]{64}$/);
    assert.match(phase.providerEvidenceRecordDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(phase.providerUsage, {
      uncachedInputTokens: 100,
      cacheCreationInputTokens: 40,
      cacheReadInputTokens: 60,
      outputTokens: 30,
      thinkingTokens: 0,
    });
  }
  assert.deepEqual(first.assertions, {
    providerCalls: 3,
    replayProviderCalls: 0,
    completedReplays: 3,
    credentialLeaks: 0,
    authorityExpansions: 0,
    cacheCreationInputTokens: 120,
    cacheReadInputTokens: 180,
  });
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});
