import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicSealedLocalIdentityVesselFixture,
  rebuildSealedLocalIdentityVesselReceipt,
  verifySealedLocalIdentityVesselCertificationReceipt,
} from '../scripts/build-sealed-local-identity-vessel-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'sealed-local-identity-vessel-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'sealed-local-identity-vessel-v1.json');

test('sealed local identity vessel fixture rebuilds exact real-process full-loop recovery evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicSealedLocalIdentityVesselFixture(), checked);
  assert.equal(checked.assertions.activationProcessDeathObserved, true);
  assert.equal(checked.assertions.routeRecoveredWithoutRelaunch, true);
  assert.equal(checked.assertions.activationRecoveredWithoutRelaunch, true);
  assert.equal(checked.assertions.actualMuseReviewMode, true);
  assert.equal(checked.assertions.finalReviewAccepted, true);
  assert.equal(checked.assertions.exactTerminalReplay, true);
  assert.equal(checked.assertions.replayExternalCalls, 0);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('sealed local identity vessel receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifySealedLocalIdentityVesselCertificationReceipt(checked), checked);
  assert.deepEqual(await rebuildSealedLocalIdentityVesselReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);

  const changed = structuredClone(checked);
  changed.metrics.activationLaunches = 2;
  assert.throws(() => verifySealedLocalIdentityVesselCertificationReceipt(changed), /metrics|receipt/i);
});
