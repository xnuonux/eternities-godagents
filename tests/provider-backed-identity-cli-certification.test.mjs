import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicProviderBackedIdentityCliFixture } from './helpers/provider-backed-identity-cli-certification-fixture.mjs';

async function loadCertifier() {
  try {
    return await import('../scripts/build-provider-backed-identity-cli-v1-receipt.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

test('provider-backed identity cli fixture is deterministic and reports the closed proof metrics', async () => {
  const first = await buildDeterministicProviderBackedIdentityCliFixture();
  const second = await buildDeterministicProviderBackedIdentityCliFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-backed-identity-cli-fixture-v1');
  assert.deepEqual(first.assertions, {
    authorityExpanded: false,
    deterministicRuns: 2,
    families: 2,
    failureStdoutBytes: 0,
    hostConstructionCalls: 2,
    malformedResultAccepted: 0,
    outputLeaks: 0,
    parentReceiptBound: true,
    providerCalls: 0,
  });
  const { fixtureDigest, ...unsigned } = first;
  assert.equal(fixtureDigest, sha256Value(unsigned));
});

test('committed provider-backed identity cli fixture equals fresh reconstruction', async () => {
  const fresh = await buildDeterministicProviderBackedIdentityCliFixture();
  const committed = JSON.parse(await readFile(
    new URL('../fixtures/provider-backed-identity-cli-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(canonicalJson(committed), canonicalJson(fresh));
});

test('provider-backed identity cli receipt certifier exposes source reconstruction', async () => {
  const certifier = await loadCertifier();
  assert.equal(typeof certifier.verifyProviderBackedIdentityCliReceipt, 'function');
  assert.equal(typeof certifier.buildProviderBackedIdentityCliReceiptFromSource, 'function');
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-backed-identity-cli-v1.json', import.meta.url),
    'utf8',
  ));
  certifier.verifyProviderBackedIdentityCliReceipt(receipt);
  const rebuilt = await certifier.buildProviderBackedIdentityCliReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('provider-backed identity cli receipt rejects forged metrics and parent binding', async () => {
  const certifier = await loadCertifier();
  assert.equal(typeof certifier.verifyProviderBackedIdentityCliReceipt, 'function');
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-backed-identity-cli-v1.json', import.meta.url),
    'utf8',
  ));
  for (const mutate of [
    (value) => { value.metrics.providerCalls = 1; },
    (value) => { value.metrics.authorityExpanded = true; },
    (value) => { value.parent.receiptDigest = 'f'.repeat(64); },
  ]) {
    const forged = structuredClone(receipt);
    mutate(forged);
    const { receiptDigest: ignored, ...unsigned } = forged;
    forged.receiptDigest = sha256Value(unsigned);
    assert.throws(
      () => certifier.verifyProviderBackedIdentityCliReceipt(forged),
      /fixture|parent|metric|authority/i,
    );
  }
});
