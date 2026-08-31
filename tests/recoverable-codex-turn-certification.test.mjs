import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicRecoverableCodexTurnCoordinatorFixture,
  rebuildRecoverableCodexTurnCoordinatorReceipt,
  verifyRecoverableCodexTurnCoordinatorCertificationReceipt,
} from '../scripts/build-codex-recoverable-turn-coordinator-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'codex-recoverable-turn-coordinator-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'codex-recoverable-turn-coordinator-v1.json');

test('the recoverable coordinator fixture rebuilds byte-for-byte through normal and interrupted turns', async () => {
  const expected = await readFile(fixturePath, 'utf8');
  const rebuilt = await buildDeterministicRecoverableCodexTurnCoordinatorFixture({ repositoryRoot });
  assert.equal(`${canonicalJson(rebuilt)}\n`, expected);
  assert.equal(rebuilt.assertions.reservationReconciledBeforeReserve, true);
  assert.equal(rebuilt.assertions.dispatchReconciledBeforeDispatch, true);
  assert.equal(rebuilt.assertions.exactReplayExternalCalls, 0);
  assert.equal(rebuilt.assertions.exactReplayReceiptStable, true);
  assert.equal(rebuilt.assertions.taskStable, true);
  assert.equal(rebuilt.assertions.actorStableAcrossCortexes, true);
  assert.equal(rebuilt.assertions.parentChainExact, true);
  assert.equal(rebuilt.assertions.recoveredAfterProcessDeath, true);
  assert.equal(rebuilt.assertions.duplicateReservations, 0);
  assert.equal(rebuilt.assertions.duplicateDispatches, 0);
  assert.equal(rebuilt.assertions.activeBindingsAfterCompletion, 0);
  assert.equal(rebuilt.assertions.credentialLeaks, 0);
  assert.equal(rebuilt.assertions.transcriptInputs, 0);
  assert.equal(rebuilt.assertions.continuityAdmissions, 0);
  assert.equal(rebuilt.assertions.realmEffects, 0);
});

test('the recoverable coordinator receipt reproduces from frozen source and rejects mutation', async (context) => {
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
  assert.equal(`${canonicalJson(checked)}\n`, text);
  assert.deepEqual(verifyRecoverableCodexTurnCoordinatorCertificationReceipt(checked), checked);
  const rebuilt = await rebuildRecoverableCodexTurnCoordinatorReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.realmEffects = 1;
  assert.throws(
    () => verifyRecoverableCodexTurnCoordinatorCertificationReceipt(changed),
    /coordinator certification receipt mismatch/,
  );
});
