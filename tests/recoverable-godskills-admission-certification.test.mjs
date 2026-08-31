import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicRecoverableGodskillsAdmissionFixture,
  rebuildRecoverableGodskillsAdmissionReceipt,
  verifyRecoverableGodskillsAdmissionCertificationReceipt,
} from '../scripts/build-recoverable-godskills-admission-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'recoverable-godskills-admission-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'recoverable-godskills-admission-v1.json');

test('recoverable Godskills admission fixture rebuilds exact chained crash-recovery evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicRecoverableGodskillsAdmissionFixture(), checked);
  assert.equal(checked.assertions.routeProcessDeathObserved, true);
  assert.equal(checked.assertions.routeRecoveredWithoutReexecution, true);
  assert.equal(checked.assertions.activationProcessDeathObserved, true);
  assert.equal(checked.assertions.activationRecoveredWithoutReexecution, true);
  assert.equal(checked.assertions.nativeProcessDeathObserved, true);
  assert.equal(checked.assertions.nativeRecoveredWithoutReexecution, true);
  assert.equal(checked.assertions.exactIdentityDispatchReproduced, true);
  assert.equal(checked.assertions.actualGodskillsReviewMode, true);
  assert.equal(checked.assertions.deferredReviewBodyFreeBeforeInference, true);
  assert.equal(checked.assertions.finalReviewAccepted, true);
  assert.equal(checked.assertions.exactTerminalReplay, true);
  assert.equal(checked.assertions.replayExternalCalls, 0);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('recoverable Godskills admission receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyRecoverableGodskillsAdmissionCertificationReceipt(checked), checked);
  const rebuilt = await rebuildRecoverableGodskillsAdmissionReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.vesselActivationExecutions = 2;
  assert.throws(
    () => verifyRecoverableGodskillsAdmissionCertificationReceipt(changed),
    /metrics|receipt/i,
  );
});
