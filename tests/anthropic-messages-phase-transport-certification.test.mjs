import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildDurableAnthropicMessagesPhaseTransportReceiptFromSource,
  verifyDurableAnthropicMessagesPhaseTransportReceipt,
} from '../scripts/build-durable-anthropic-messages-phase-transport-v1-receipt.mjs';
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

test('durable Anthropic receipt reconstructs from its exact source commit', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/durable-anthropic-messages-phase-transport-v1.json', import.meta.url),
    'utf8',
  ));
  verifyDurableAnthropicMessagesPhaseTransportReceipt(receipt);
  const rebuilt = await buildDurableAnthropicMessagesPhaseTransportReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('durable Anthropic receipt rejects forged nested fixture and source references', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/durable-anthropic-messages-phase-transport-v1.json', import.meta.url),
    'utf8',
  ));
  const forge = (mutate) => {
    const value = structuredClone(receipt);
    mutate(value);
    const { receiptDigest: _old, ...unsigned } = value;
    value.receiptDigest = sha256Value(unsigned);
    return value;
  };
  assert.throws(() => verifyDurableAnthropicMessagesPhaseTransportReceipt(forge((value) => {
    value.fixture.value.assertions.replayProviderCalls = 1;
    const { fixtureDigest: _old, ...unsigned } = value.fixture.value;
    value.fixture.value.fixtureDigest = sha256Value(unsigned);
    value.fixture.logicalDigest = value.fixture.value.fixtureDigest;
  })), /fixture/i);
  assert.throws(() => verifyDurableAnthropicMessagesPhaseTransportReceipt(forge((value) => {
    value.source.specification.sha256 = 'f'.repeat(64);
  })), /specification/i);
});
