import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildProviderResolutionAuthorityHandoffReceiptFromSource,
  verifyProviderResolutionAuthorityHandoffReceipt,
} from '../scripts/build-provider-resolution-authority-handoff-v1-receipt.mjs';
import { buildDeterministicProviderResolutionAuthorityHandoffFixture } from './helpers/provider-resolution-authority-handoff-certification-fixture.mjs';

test('provider resolution authority handoff fixture reproduces exact portable signing evidence', async () => {
  const first = await buildDeterministicProviderResolutionAuthorityHandoffFixture();
  const second = await buildDeterministicProviderResolutionAuthorityHandoffFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-resolution-authority-handoff-fixture-v1');
  assert.deepEqual(first.assertions, {
    families: 2,
    signingRequests: 2,
    signedReturns: 2,
    providerCalls: 0,
    embeddedPrivateKeys: 0,
    embeddedSigningOperations: 0,
    rawResponseBodiesRetained: 0,
    explicitUnverifiedReturns: 2,
    distinctRequests: 2,
    distinctReturns: 2,
  });
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('provider resolution authority handoff receipt reconstructs from exact source', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-resolution-authority-handoff-v1.json', import.meta.url), 'utf8',
  ));
  verifyProviderResolutionAuthorityHandoffReceipt(receipt);
  const rebuilt = await buildProviderResolutionAuthorityHandoffReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('provider resolution authority handoff receipt rejects false authority and trust-root claims', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-resolution-authority-handoff-v1.json', import.meta.url), 'utf8',
  ));
  const forge = (mutate) => {
    const value = structuredClone(receipt);
    mutate(value);
    const { receiptDigest: _old, ...unsigned } = value;
    value.receiptDigest = sha256Value(unsigned);
    return value;
  };
  assert.throws(() => verifyProviderResolutionAuthorityHandoffReceipt(forge((value) => {
    value.metrics.embeddedSigningOperations = 1;
  })), /metric|fixture/i);
  assert.throws(() => verifyProviderResolutionAuthorityHandoffReceipt(forge((value) => {
    value.source.protectedTrustRoots['receipts/provider-resolution-decision-preparer-v1.json'] = 'f'.repeat(64);
  })), /protected trust/i);
});

