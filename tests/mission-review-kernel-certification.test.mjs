import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicMissionReviewKernelFixture,
  rebuildMissionReviewKernelReceipt,
  verifyMissionReviewKernelCertificationReceipt,
} from '../scripts/build-mission-review-kernel-v1-receipt.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const fixturePath = new URL('../fixtures/resumable-mission-review-kernel-v1.json', import.meta.url);
const receiptPath = new URL('../receipts/resumable-mission-review-kernel-v1.json', import.meta.url);

test('mission review fixture rebuilds with stable recovery and authority assertions', async (context) => {
  let text;
  try {
    text = await readFile(fixturePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      context.skip('deterministic fixture has not been written yet');
      return;
    }
    throw error;
  }
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicMissionReviewKernelFixture(), checked);
  assert.equal(checked.assertions.nativeReplayExternalCalls, 0);
  assert.equal(checked.assertions.reviewedReplayExternalCalls, 0);
  assert.equal(checked.assertions.crashRecoveredWithoutRedispatch, true);
  assert.equal(checked.assertions.duplicateCompletedDispatches, 0);
  assert.equal(checked.assertions.nativeCommittedBeforeReview, true);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('mission review certification receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyMissionReviewKernelCertificationReceipt(checked), checked);
  const rebuilt = await rebuildMissionReviewKernelReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.realmEffects = 1;
  assert.throws(() => verifyMissionReviewKernelCertificationReceipt(changed), /receipt mismatch|fixture/i);
});
