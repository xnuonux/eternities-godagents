import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicAdmittedProviderBackedIdentityLauncherFixture } from './helpers/admitted-provider-backed-identity-launcher-certification-fixture.mjs';

async function loadCertifier() {
  try {
    return await import('../scripts/build-admitted-provider-backed-identity-launcher-v1-receipt.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

test('admitted provider-backed launcher fixture is deterministic and self-digested', async () => {
  const first = await buildDeterministicAdmittedProviderBackedIdentityLauncherFixture();
  const second = await buildDeterministicAdmittedProviderBackedIdentityLauncherFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(
    first.protocolId,
    'eternities-admitted-provider-backed-identity-launcher-fixture-v1',
  );
  assert.deepEqual(first.assertions, {
    allFamiliesAuthorityClosed: true,
    allFamiliesCompleted: true,
    allLaunchersReconstructed: true,
    credentialLeaks: 0,
    families: 2,
    providerCalls: 8,
    replayActivationLaunches: 0,
    replayProviderCalls: 0,
    replayRouteLaunches: 0,
    reviewedPhases: 8,
  });
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('admitted provider-backed launcher receipt reconstructs from its exact source', async () => {
  const certifier = await loadCertifier();
  assert.equal(
    typeof certifier.verifyAdmittedProviderBackedIdentityLauncherReceipt,
    'function',
  );
  assert.equal(
    typeof certifier.buildAdmittedProviderBackedIdentityLauncherReceiptFromSource,
    'function',
  );
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/admitted-provider-backed-identity-launcher-v1.json', import.meta.url),
    'utf8',
  ));
  certifier.verifyAdmittedProviderBackedIdentityLauncherReceipt(receipt);
  const rebuilt = await certifier.buildAdmittedProviderBackedIdentityLauncherReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('launcher receipt rejects false replay reconstruction and authority claims', async () => {
  const certifier = await loadCertifier();
  assert.equal(
    typeof certifier.verifyAdmittedProviderBackedIdentityLauncherReceipt,
    'function',
  );
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/admitted-provider-backed-identity-launcher-v1.json', import.meta.url),
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
      () => certifier.verifyAdmittedProviderBackedIdentityLauncherReceipt(forged),
      /evidence|fixture/i,
    );
  }
});

test('launcher receipt cannot self-declare a clean independent review', async () => {
  const certifier = await loadCertifier();
  assert.equal(
    typeof certifier.verifyAdmittedProviderBackedIdentityLauncherReceipt,
    'function',
  );
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/admitted-provider-backed-identity-launcher-v1.json', import.meta.url),
    'utf8',
  ));
  const forged = structuredClone(receipt);
  forged.review.value.findings.important = 1;
  const { attestationDigest: ignoredAttestation, ...attestationUnsigned } = forged.review.value;
  forged.review.value.attestationDigest = sha256Value(attestationUnsigned);
  forged.review.unresolvedImportantDefects = 1;
  const { receiptDigest: ignoredReceipt, ...receiptUnsigned } = forged;
  forged.receiptDigest = sha256Value(receiptUnsigned);
  assert.throws(
    () => certifier.verifyAdmittedProviderBackedIdentityLauncherReceipt(forged),
    /review.*unresolved|unresolved.*defect/i,
  );
});
