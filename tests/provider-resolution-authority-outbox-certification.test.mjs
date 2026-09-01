import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildProviderResolutionAuthorityOutboxReceiptFromSource,
  verifyProviderResolutionAuthorityOutboxReceipt,
} from '../scripts/build-provider-resolution-authority-outbox-v1-receipt.mjs';
import { buildDeterministicProviderResolutionAuthorityOutboxFixture } from './helpers/provider-resolution-authority-outbox-certification-fixture.mjs';

test('provider resolution authority outbox fixture reproduces exact cross-family recovery evidence', async () => {
  const first = await buildDeterministicProviderResolutionAuthorityOutboxFixture();
  const second = await buildDeterministicProviderResolutionAuthorityOutboxFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-resolution-authority-outbox-fixture-v1');
  assert.deepEqual(first.assertions, {
    families: 2,
    operations: 2,
    signingRequests: 2,
    signedReturns: 2,
    resolvedTerminals: 2,
    adoptedResponses: 1,
    abandonedOperations: 1,
    providerCalls: 2,
    additionalProviderCalls: 0,
    rawResponseBodiesRetained: 0,
    credentialsRetained: 0,
    privateKeysRetained: 0,
    automaticRetries: 0,
  });
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('committed provider resolution authority outbox fixture equals fresh reconstruction', async () => {
  const committed = JSON.parse(await readFile(
    new URL('../fixtures/provider-resolution-authority-outbox-v1.json', import.meta.url), 'utf8',
  ));
  assert.equal(canonicalJson(await buildDeterministicProviderResolutionAuthorityOutboxFixture()), canonicalJson(committed));
});

test('provider resolution authority outbox receipt reconstructs from exact source', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-resolution-authority-outbox-v1.json', import.meta.url), 'utf8',
  ));
  verifyProviderResolutionAuthorityOutboxReceipt(receipt);
  const rebuilt = await buildProviderResolutionAuthorityOutboxReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('provider resolution authority outbox receipt rejects false containment claims', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-resolution-authority-outbox-v1.json', import.meta.url), 'utf8',
  ));
  const forged = structuredClone(receipt);
  forged.metrics.rawResponseBodiesRetained = 1;
  const { receiptDigest: _old, ...unsigned } = forged;
  forged.receiptDigest = sha256Value(unsigned);
  assert.throws(() => verifyProviderResolutionAuthorityOutboxReceipt(forged), /evidence|fixture/i);
});
