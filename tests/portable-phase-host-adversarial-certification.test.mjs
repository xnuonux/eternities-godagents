import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicPortablePhaseHostAdversarialFixture } from './helpers/portable-phase-host-adversarial-fixture.mjs';

test('portable phase-host adversarial fixture is canonical and matches fresh reconstruction', async () => {
  const fresh = await buildDeterministicPortablePhaseHostAdversarialFixture();
  const committed = JSON.parse(await readFile(
    new URL('../fixtures/portable-phase-host-adversarial-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(canonicalJson(committed), canonicalJson(fresh));
  const { fixtureDigest, ...unsigned } = fresh;
  assert.equal(fixtureDigest, sha256Value(unsigned));
});

test('portable phase-host adversarial receipt reconstructs and rejects forged metrics', async () => {
  const module = await import('../scripts/build-portable-phase-host-adversarial-v1-receipt.mjs');
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/portable-phase-host-adversarial-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(typeof module.verifyPortablePhaseHostAdversarialReceipt, 'function');
  module.verifyPortablePhaseHostAdversarialReceipt(receipt);
  const rebuilt = await module.buildPortablePhaseHostAdversarialReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));

  const forged = structuredClone(receipt);
  forged.metrics.providerCalls = 1;
  const { receiptDigest: _old, ...unsigned } = forged;
  forged.receiptDigest = sha256Value(unsigned);
  assert.throws(
    () => module.verifyPortablePhaseHostAdversarialReceipt(forged),
    /metric|fixture/i,
  );
});
