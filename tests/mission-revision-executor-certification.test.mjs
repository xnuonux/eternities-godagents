import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicMissionRevisionExecutorFixture,
  rebuildMissionRevisionExecutorReceipt,
  verifyMissionRevisionExecutorCertificationReceipt,
} from '../scripts/build-mission-revision-executor-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'recoverable-mission-revision-executor-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'recoverable-mission-revision-executor-v1.json');

test('mission revision executor fixture rebuilds with exact two-review crash recovery evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicMissionRevisionExecutorFixture(), checked);
  assert.equal(checked.assertions.processDeathObserved, true);
  assert.equal(checked.assertions.completedAfterReconstruction, true);
  assert.equal(checked.assertions.exactRevisionDispatchReproduced, true);
  assert.equal(checked.assertions.revisionRecoveredWithoutRedispatch, true);
  assert.equal(checked.assertions.revisionEvidenceCommitted, true);
  assert.equal(checked.assertions.finalReviewBoundExactRevision, true);
  assert.equal(checked.assertions.finalReviewAccepted, true);
  assert.equal(checked.assertions.replayExternalCalls, 0);
  assert.equal(checked.assertions.forbiddenRevisionWireKeys, 0);
  assert.equal(checked.assertions.filesystemRootsDisclosed, 0);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('mission revision executor receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyMissionRevisionExecutorCertificationReceipt(checked), checked);
  const rebuilt = await rebuildMissionRevisionExecutorReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.revisionTransportExecutions = 2;
  assert.throws(() => verifyMissionRevisionExecutorCertificationReceipt(changed), /metrics|receipt/i);
});
