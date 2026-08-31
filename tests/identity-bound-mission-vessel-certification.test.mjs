import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicIdentityBoundMissionVesselFixture,
  rebuildIdentityBoundMissionVesselReceipt,
  verifyIdentityBoundMissionVesselCertificationReceipt,
} from '../scripts/build-identity-bound-mission-vessel-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'identity-bound-mission-vessel-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'identity-bound-mission-vessel-v1.json');

test('identity-bound mission vessel fixture rebuilds with exact identity, activation, and recovery evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicIdentityBoundMissionVesselFixture(), checked);
  assert.equal(checked.assertions.processDeathObserved, true);
  assert.equal(checked.assertions.completedAfterReconstruction, true);
  assert.equal(checked.assertions.exactIdentityDispatchReproduced, true);
  assert.equal(checked.assertions.nativeRecoveredWithoutRedispatch, true);
  assert.equal(checked.assertions.actualGodskillsActivatedOnce, true);
  assert.equal(checked.assertions.recoveryRehydratedWithoutExternalActivation, true);
  assert.equal(checked.assertions.exactIdentityProjectionReachedNative, true);
  assert.equal(checked.assertions.deferredReviewBodyFreeBeforeInference, true);
  assert.equal(checked.assertions.finalReviewAccepted, true);
  assert.equal(checked.assertions.exactTerminalReplay, true);
  assert.equal(checked.assertions.replayExternalCalls, 0);
  assert.equal(checked.assertions.forbiddenWireKeys, 0);
  assert.equal(checked.assertions.filesystemRootsDisclosed, 0);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('identity-bound mission vessel receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyIdentityBoundMissionVesselCertificationReceipt(checked), checked);
  const rebuilt = await rebuildIdentityBoundMissionVesselReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.nativeTransportExecutions = 2;
  assert.throws(() => verifyIdentityBoundMissionVesselCertificationReceipt(changed), /metrics|receipt/i);
});
