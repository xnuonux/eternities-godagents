import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicSignedPhaseResolutionHostFixture,
  rebuildSignedOpenAIPhaseResolutionReceipt,
  verifySignedOpenAIPhaseResolutionReceipt,
} from '../scripts/build-signed-openai-phase-resolution-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'signed-openai-phase-resolution-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'signed-openai-phase-resolution-v1.json');

test('signed phase resolution fixture rebuilds exact admitted-host recovery evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicSignedPhaseResolutionHostFixture(), checked);
  assert.equal(checked.assertions.ambiguousNativeObserved, true);
  assert.equal(checked.assertions.signedResolutionAccepted, true);
  assert.equal(checked.assertions.nativeResponseAdoptedWithoutRedispatch, true);
  assert.deepEqual(checked.execution.phaseOrder, ['native', 'review', 'revision', 'review']);
  assert.equal(checked.assertions.finalReviewAccepted, true);
  assert.equal(checked.assertions.exactTerminalReplay, true);
  assert.equal(checked.assertions.replayExternalCalls, 0);
  assert.equal(checked.assertions.resolutionBodyAbsent, true);
  assert.equal(checked.assertions.secretLeaks, 0);
  assert.equal(checked.assertions.noRealmAuthorityExpansion, true);
});

test('signed phase resolution receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifySignedOpenAIPhaseResolutionReceipt(checked), checked);
  assert.deepEqual(await rebuildSignedOpenAIPhaseResolutionReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);
  const changed = structuredClone(checked);
  changed.metrics.nativeProviderCalls = 2;
  assert.throws(() => verifySignedOpenAIPhaseResolutionReceipt(changed), /metrics|receipt/i);
});
