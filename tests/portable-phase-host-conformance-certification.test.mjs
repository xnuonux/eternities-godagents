import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicPortablePhaseHostConformanceFixture } from './helpers/portable-phase-host-conformance-fixture.mjs';

async function certifier() {
  return import('../scripts/build-portable-phase-host-conformance-v1-receipt.mjs');
}

test('portable phase-host fixture is deterministic and records the closed proof metrics', async () => {
  const first = await buildDeterministicPortablePhaseHostConformanceFixture();
  const second = await buildDeterministicPortablePhaseHostConformanceFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.deepEqual(first.assertions, {
    adapters: 2,
    wrappedPhases: 6,
    providerCalls: 0,
    credentialLeaks: 0,
    authorityExpansions: 0,
    commonSurfaceParity: true,
  });
  const { fixtureDigest, ...unsigned } = first;
  assert.equal(fixtureDigest, sha256Value(unsigned));
});

test('committed portable phase-host fixture equals fresh reconstruction', async () => {
  const fresh = await buildDeterministicPortablePhaseHostConformanceFixture();
  const committed = JSON.parse(await readFile(
    new URL('../fixtures/portable-phase-host-conformance-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(canonicalJson(committed), canonicalJson(fresh));
});

test('portable phase-host receipt reconstructs from exact source and rejects forged metrics', async () => {
  const module = await certifier();
  assert.equal(typeof module.verifyPortablePhaseHostConformanceReceipt, 'function');
  assert.equal(typeof module.buildPortablePhaseHostConformanceReceiptFromSource, 'function');
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/portable-phase-host-conformance-v1.json', import.meta.url),
    'utf8',
  ));
  module.verifyPortablePhaseHostConformanceReceipt(receipt);
  const rebuilt = await module.buildPortablePhaseHostConformanceReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));

  const forged = structuredClone(receipt);
  forged.metrics.providerCalls = 1;
  const { receiptDigest: _old, ...unsigned } = forged;
  forged.receiptDigest = sha256Value(unsigned);
  assert.throws(() => module.verifyPortablePhaseHostConformanceReceipt(forged), /fixture|metric/i);
});
