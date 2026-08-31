import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicMissionNativeExecutorFixture,
  rebuildMissionNativeExecutorReceipt,
  verifyMissionNativeExecutorCertificationReceipt,
} from '../scripts/build-mission-native-executor-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'recoverable-mission-native-executor-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'recoverable-mission-native-executor-v1.json');

test('mission native executor fixture rebuilds with exact full-loop crash recovery evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicMissionNativeExecutorFixture(), checked);
  assert.equal(checked.assertions.processDeathObserved, true);
  assert.equal(checked.assertions.completedAfterReconstruction, true);
  assert.equal(checked.assertions.exactNativeDispatchReproduced, true);
  assert.equal(checked.assertions.nativeRecoveredWithoutRedispatch, true);
  assert.equal(checked.assertions.nativeEvidenceCommitted, true);
  assert.equal(checked.assertions.recoveredNativeEnteredReview, true);
  assert.equal(checked.assertions.finalReviewBoundExactRevision, true);
  assert.equal(checked.assertions.finalReviewAccepted, true);
  assert.equal(checked.assertions.nativeDeferredBodyFree, true);
  assert.equal(checked.assertions.nativeOnlyGodskillsAbsent, true);
  assert.equal(checked.assertions.nativeOnlyPhaseInputsAbsent, true);
  assert.equal(checked.assertions.replayExternalCalls, 0);
  assert.equal(checked.assertions.forbiddenNativeWireKeys, 0);
  assert.equal(checked.assertions.filesystemRootsDisclosed, 0);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('mission native executor receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyMissionNativeExecutorCertificationReceipt(checked), checked);
  const rebuilt = await rebuildMissionNativeExecutorReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.nativeTransportExecutions = 2;
  assert.throws(() => verifyMissionNativeExecutorCertificationReceipt(changed), /metrics|receipt/i);
});
