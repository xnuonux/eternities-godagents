import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildProviderResolutionDecisionPreparerReceiptFromSource,
  verifyProviderResolutionDecisionPreparerReceipt,
} from '../scripts/build-provider-resolution-decision-preparer-v1-receipt.mjs';
import { buildDeterministicProviderResolutionDecisionPreparerFixture } from './helpers/provider-resolution-decision-preparer-certification-fixture.mjs';

test('provider resolution decision preparer fixture reproduces exact authority-neutral output', async () => {
  const first = await buildDeterministicProviderResolutionDecisionPreparerFixture();
  const second = await buildDeterministicProviderResolutionDecisionPreparerFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-resolution-decision-preparer-fixture-v1');
  assert.deepEqual(first.assertions, {
    families: 2,
    decisionsPrepared: 4,
    responseWitnessesPrepared: 2,
    providerCalls: 0,
    credentialLeaks: 0,
    signaturesCreated: 0,
    privateKeysAccepted: 0,
    frozenOutputs: true,
    distinctDecisionProtocols: 2,
    distinctWitnessProtocols: 2,
    distinctWitnessDigestFields: 2,
  });
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('provider resolution decision preparer receipt reconstructs from its exact source commit', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-resolution-decision-preparer-v1.json', import.meta.url), 'utf8',
  ));
  verifyProviderResolutionDecisionPreparerReceipt(receipt);
  const rebuilt = await buildProviderResolutionDecisionPreparerReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('provider resolution decision preparer receipt rejects authority and trust-root inflation', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-resolution-decision-preparer-v1.json', import.meta.url), 'utf8',
  ));
  const forge = (mutate) => {
    const value = structuredClone(receipt);
    mutate(value);
    const { receiptDigest: _old, ...unsigned } = value;
    value.receiptDigest = sha256Value(unsigned);
    return value;
  };
  assert.throws(() => verifyProviderResolutionDecisionPreparerReceipt(forge((value) => {
    value.fixture.value.assertions.signaturesCreated = 1;
    const { fixtureDigest: _old, ...unsigned } = value.fixture.value;
    value.fixture.value.fixtureDigest = sha256Value(unsigned);
    value.fixture.logicalDigest = value.fixture.value.fixtureDigest;
  })), /fixture/i);
  assert.throws(() => verifyProviderResolutionDecisionPreparerReceipt(forge((value) => {
    value.source.protectedTrustRoots['src/transports/provider-phase-resolution.mjs'] = 'f'.repeat(64);
  })), /protected trust/i);
});

