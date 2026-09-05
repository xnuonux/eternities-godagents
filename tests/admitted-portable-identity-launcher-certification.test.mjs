import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicAdmittedPortableIdentityLauncherFixture } from './helpers/admitted-portable-identity-launcher-certification-fixture.mjs';

async function loadCertifier() {
  try {
    return await import('../scripts/build-admitted-portable-identity-launcher-v1-receipt.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

test('admitted portable launcher fixture is deterministic and self-digested', async () => {
  const first = await buildDeterministicAdmittedPortableIdentityLauncherFixture();
  const second = await buildDeterministicAdmittedPortableIdentityLauncherFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(
    first.protocolId,
    'eternities-admitted-portable-identity-launcher-fixture-v1',
  );
  assert.deepEqual(first.assertions, {
    allFamiliesAuthorityClosed: true,
    allFamiliesCompleted: true,
    allLaunchersReconstructed: true,
    allPortableHostDescriptionsBound: true,
    credentialLeaks: 0,
    families: 2,
    providerCalls: 8,
    replayActivationLaunches: 0,
    replayProviderCalls: 0,
    replayRouteLaunches: 0,
    reviewedPhases: 8,
  });
  const { fixtureDigest, ...unsigned } = first;
  assert.equal(fixtureDigest, sha256Value(unsigned));
});

test('admitted portable launcher receipt reconstructs from its exact source', async () => {
  const certifier = await loadCertifier();
  assert.equal(typeof certifier.verifyAdmittedPortableIdentityLauncherReceipt, 'function');
  assert.equal(
    typeof certifier.buildAdmittedPortableIdentityLauncherReceiptFromSource,
    'function',
  );
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/admitted-portable-identity-launcher-v1.json', import.meta.url),
    'utf8',
  ));
  certifier.verifyAdmittedPortableIdentityLauncherReceipt(receipt);
  const rebuilt = await certifier.buildAdmittedPortableIdentityLauncherReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('portable launcher receipt rejects forged metrics and authority claims', async () => {
  const certifier = await loadCertifier();
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/admitted-portable-identity-launcher-v1.json', import.meta.url),
    'utf8',
  ));
  for (const mutate of [
    (value) => { value.metrics.replayProviderCalls = 1; },
    (value) => { value.metrics.allLaunchersReconstructed = false; },
    (value) => { value.metrics.allFamiliesAuthorityClosed = false; },
  ]) {
    const forged = structuredClone(receipt);
    mutate(forged);
    const { receiptDigest: ignored, ...unsigned } = forged;
    forged.receiptDigest = sha256Value(unsigned);
    assert.throws(
      () => certifier.verifyAdmittedPortableIdentityLauncherReceipt(forged),
      /evidence|fixture/i,
    );
  }
});

test('portable launcher receipt cannot self-declare an independent review', async () => {
  const certifier = await loadCertifier();
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/admitted-portable-identity-launcher-v1.json', import.meta.url),
    'utf8',
  ));
  const forged = structuredClone(receipt);
  forged.review.independent = true;
  forged.review.mode = 'independent-terra';
  const { receiptDigest: ignored, ...unsigned } = forged;
  forged.receiptDigest = sha256Value(unsigned);
  assert.throws(
    () => certifier.verifyAdmittedPortableIdentityLauncherReceipt(forged),
    /review/i,
  );
});
