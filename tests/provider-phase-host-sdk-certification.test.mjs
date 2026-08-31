import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildProviderPhaseHostSdkReceiptFromSource,
  verifyProviderPhaseHostSdkReceipt,
} from '../scripts/build-provider-phase-host-sdk-v1-receipt.mjs';
import { buildDeterministicProviderPhaseHostSdkFixture } from './helpers/provider-phase-host-sdk-certification-fixture.mjs';

test('provider phase host sdk fixture reproduces exact cross-family conformance', async () => {
  const first = await buildDeterministicProviderPhaseHostSdkFixture();
  const second = await buildDeterministicProviderPhaseHostSdkFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-phase-host-sdk-fixture-v1');
  assert.deepEqual(Object.keys(first.families), [
    'anthropic-messages-v1',
    'openai-compatible-chat-completions-v1',
  ]);
  for (const value of Object.values(first.families)) {
    assert.match(value.descriptionDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(value.completedPhases, ['native', 'review', 'revision']);
    assert.equal(value.providerCalls, 3);
    assert.equal(value.replayProviderCalls, 0);
    assert.equal(value.authorityExpansions, 0);
  }
  assert.deepEqual(first.assertions, {
    families: 2,
    completedPhases: 6,
    providerCalls: 6,
    replayProviderCalls: 0,
    authorityExpansions: 0,
    credentialLeaks: 0,
    explicitCapabilityDifferences: true,
    commonSurfaceParity: true,
  });
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('provider phase host sdk receipt reconstructs from exact source', async () => {
  const receipt = JSON.parse(await readFile(new URL('../receipts/provider-phase-host-sdk-v1.json', import.meta.url), 'utf8'));
  verifyProviderPhaseHostSdkReceipt(receipt);
  const rebuilt = await buildProviderPhaseHostSdkReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url), sourceCommit: receipt.source.commit, testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('provider phase host sdk receipt rejects nested capability and source forgery', async () => {
  const receipt = JSON.parse(await readFile(new URL('../receipts/provider-phase-host-sdk-v1.json', import.meta.url), 'utf8'));
  const forge = (mutate) => {
    const value = structuredClone(receipt); mutate(value);
    const { receiptDigest: _old, ...unsigned } = value; value.receiptDigest = sha256Value(unsigned); return value;
  };
  assert.throws(() => verifyProviderPhaseHostSdkReceipt(forge((value) => {
    value.fixture.value.families['anthropic-messages-v1'].capabilities.signedAmbiguityResolutionAvailable = true;
  })), /conformance|fixture/i);
  assert.throws(() => verifyProviderPhaseHostSdkReceipt(forge((value) => {
    value.source.plan.sha256 = 'f'.repeat(64);
  })), /plan/i);
});
