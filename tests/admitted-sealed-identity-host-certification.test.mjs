import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicAdmittedSealedIdentityHostFixture,
  rebuildAdmittedSealedIdentityHostReceipt,
  verifyAdmittedSealedIdentityHostCertificationReceipt,
} from '../scripts/build-admitted-sealed-identity-host-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'admitted-sealed-identity-host-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'admitted-sealed-identity-host-v1.json');

test('admitted sealed identity host fixture rebuilds exact policy-bound recovery evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicAdmittedSealedIdentityHostFixture(), checked);
  assert.equal(checked.assertions.externalPolicyDigestPinned, true);
  assert.equal(checked.assertions.policyPathsBoundToAdmission, true);
  assert.equal(checked.assertions.residencyRecordPresent, true);
  assert.equal(checked.assertions.classifierDerivedFromVerifiedRouting, true);
  assert.equal(checked.assertions.actualMuseReviewMode, true);
  assert.equal(checked.assertions.routeRecoveredWithoutRelaunch, true);
  assert.equal(checked.assertions.activationRecoveredWithoutRelaunch, true);
  assert.equal(checked.assertions.exactTerminalReplay, true);
  assert.equal(checked.assertions.replayExternalCalls, 0);
  assert.equal(checked.assertions.forbiddenPolicyKeys, 0);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('admitted sealed identity host receipt reproduces from its exact source commit', async (context) => {
  let text;
  try {
    text = await readFile(receiptPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      context.skip('release receipt has not been issued yet');
      return;
    }
    throw error;
  }
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(verifyAdmittedSealedIdentityHostCertificationReceipt(checked), checked);
  assert.deepEqual(await rebuildAdmittedSealedIdentityHostReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);

  const changed = structuredClone(checked);
  changed.metrics.routeLaunches = 2;
  assert.throws(() => verifyAdmittedSealedIdentityHostCertificationReceipt(changed), /metrics|receipt/i);
});
