import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildProviderResolutionProfileReceiptFromSource,
  verifyProviderResolutionProfileReceipt,
} from '../scripts/build-provider-resolution-profile-v1-receipt.mjs';
import { buildDeterministicProviderResolutionProfileFixture } from './helpers/provider-resolution-profile-certification-fixture.mjs';

test('provider resolution profile fixture reproduces exact discovery without provider work', async () => {
  const first = await buildDeterministicProviderResolutionProfileFixture();
  const second = await buildDeterministicProviderResolutionProfileFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-resolution-profile-fixture-v1');
  assert.deepEqual(first.assertions, {
    families: 2,
    providerCalls: 0,
    credentialLeaks: 0,
    controllerSurfaceParity: true,
    distinctProfileDigests: 2,
    sharedNoRetry: true,
    sharedZeroProviderCalls: true,
    sharedAcceptedRecovery: true,
    explicitDecisionProtocolDifference: true,
    explicitWitnessFieldDifference: true,
  });
  for (const family of Object.values(first.families)) {
    assert.deepEqual(family.controllerSurface, ['authorityKeyId', 'inspect', 'policyDigest', 'resolve']);
    assert.match(family.resolutionProfileDigest, /^[a-f0-9]{64}$/);
    assert.equal(family.resolutionProfile.automaticRetry, false);
    assert.equal(family.resolutionProfile.providerCallsDuringResolution, 0);
  }
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('provider resolution profile receipt reconstructs from its exact source commit', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-resolution-profile-v1.json', import.meta.url), 'utf8',
  ));
  verifyProviderResolutionProfileReceipt(receipt);
  const rebuilt = await buildProviderResolutionProfileReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('provider resolution profile receipt rejects forged profile and protected trust root', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-resolution-profile-v1.json', import.meta.url), 'utf8',
  ));
  const forge = (mutate) => {
    const value = structuredClone(receipt);
    mutate(value);
    const { receiptDigest: _old, ...unsigned } = value;
    value.receiptDigest = sha256Value(unsigned);
    return value;
  };
  assert.throws(() => verifyProviderResolutionProfileReceipt(forge((value) => {
    value.fixture.value.assertions.providerCalls = 1;
    const { fixtureDigest: _old, ...unsigned } = value.fixture.value;
    value.fixture.value.fixtureDigest = sha256Value(unsigned);
    value.fixture.logicalDigest = value.fixture.value.fixtureDigest;
  })), /fixture/i);
  assert.throws(() => verifyProviderResolutionProfileReceipt(forge((value) => {
    value.source.protectedTrustRoots['src/transports/provider-phase-resolution.mjs'] = 'f'.repeat(64);
  })), /protected trust/i);
});
