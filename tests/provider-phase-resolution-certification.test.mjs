import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildProviderNeutralPhaseResolutionReceiptFromSource,
  verifyProviderNeutralPhaseResolutionReceipt,
} from '../scripts/build-provider-neutral-phase-resolution-v1-receipt.mjs';
import { buildDeterministicProviderPhaseResolutionFixture } from './helpers/provider-phase-resolution-certification-fixture.mjs';

test('provider-neutral resolution fixture reproduces exact adoption abandonment and zero-network recovery', async () => {
  const first = await buildDeterministicProviderPhaseResolutionFixture();
  const second = await buildDeterministicProviderPhaseResolutionFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-neutral-phase-resolution-fixture-v1');
  assert.deepEqual(first.assertions, {
    ambiguousProviderCalls: 2,
    resolutionProviderCalls: 0,
    replayProviderCalls: 0,
    completedReplays: 2,
    adoptedOperations: 1,
    abandonedOperations: 1,
    credentialLeaks: 0,
    resolutionBodyLeaks: 0,
    authorityExpansions: 0,
  });
  assert.equal(first.abandonment.reasonCode, 'operator-abandoned');
  for (const value of [
    first.transportPolicyDigest,
    first.resolutionPolicyDigest,
    first.adoption.dispatchDigest,
    first.adoption.requestDigest,
    first.adoption.attemptId,
    first.adoption.decisionDigest,
    first.adoption.responseWitnessDigest,
    first.adoption.resolutionRecordDigest,
    first.adoption.providerEvidenceRecordDigest,
    first.adoption.completionDigest,
    first.abandonment.dispatchDigest,
    first.abandonment.requestDigest,
    first.abandonment.attemptId,
    first.abandonment.decisionDigest,
    first.abandonment.resolutionRecordDigest,
  ]) assert.match(value, /^[a-f0-9]{64}$/);
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('provider-neutral resolution receipt reconstructs from its exact source commit', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-neutral-phase-resolution-v1.json', import.meta.url),
    'utf8',
  ));
  verifyProviderNeutralPhaseResolutionReceipt(receipt);
  const rebuilt = await buildProviderNeutralPhaseResolutionReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('provider-neutral resolution receipt rejects forged fixture and protected parent hashes', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-neutral-phase-resolution-v1.json', import.meta.url),
    'utf8',
  ));
  const forge = (mutate) => {
    const value = structuredClone(receipt);
    mutate(value);
    const { receiptDigest: _old, ...unsigned } = value;
    value.receiptDigest = sha256Value(unsigned);
    return value;
  };
  assert.throws(() => verifyProviderNeutralPhaseResolutionReceipt(forge((value) => {
    value.fixture.value.assertions.resolutionProviderCalls = 1;
    const { fixtureDigest: _old, ...unsigned } = value.fixture.value;
    value.fixture.value.fixtureDigest = sha256Value(unsigned);
    value.fixture.logicalDigest = value.fixture.value.fixtureDigest;
  })), /fixture/i);
  assert.throws(() => verifyProviderNeutralPhaseResolutionReceipt(forge((value) => {
    value.source.protectedParentHashes['src/transports/openai-compatible-phase-transport.mjs'] = 'f'.repeat(64);
  })), /protected parent/i);
});
