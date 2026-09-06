import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicExternalHostQualificationFixture } from './helpers/external-host-qualification-fixture.mjs';

test('external host qualification fixture is canonical and deterministic', async () => {
  const fresh = await buildDeterministicExternalHostQualificationFixture();
  const committed = JSON.parse(await readFile(
    new URL('../fixtures/external-host-qualification-v1.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(committed, fresh.dossier);
  const { dossierDigest, ...unsigned } = committed;
  assert.equal(dossierDigest, sha256Value(unsigned));
  assert.equal(canonicalJson(committed).includes('apiKey'), false);
});

test('external host qualification receipt reconstructs from its exact source', async () => {
  const module = await import('../scripts/build-external-host-qualification-v1-receipt.mjs');
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/external-host-qualification-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(typeof module.verifyExternalHostQualificationReceipt, 'function');
  module.verifyExternalHostQualificationReceipt(receipt);
  const rebuilt = await module.buildExternalHostQualificationReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.deepEqual(rebuilt, receipt);
});

test('external host qualification receipt cannot self-declare live qualification', async () => {
  const module = await import('../scripts/build-external-host-qualification-v1-receipt.mjs');
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/external-host-qualification-v1.json', import.meta.url),
    'utf8',
  ));
  const forged = structuredClone(receipt);
  forged.metrics.liveQualification = true;
  const { receiptDigest: _old, ...unsigned } = forged;
  forged.receiptDigest = sha256Value(unsigned);
  assert.throws(
    () => module.verifyExternalHostQualificationReceipt(forged),
    /metric|qualification|live/i,
  );
});
