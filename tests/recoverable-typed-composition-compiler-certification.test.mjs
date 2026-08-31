import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicRecoverableTypedCompositionCompilerFixture,
  rebuildRecoverableTypedCompositionCompilerReceipt,
  verifyRecoverableTypedCompositionCompilerFixture,
  verifyRecoverableTypedCompositionCompilerReceipt,
} from '../scripts/build-recoverable-typed-composition-compiler-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(
  repositoryRoot, 'fixtures', 'recoverable-typed-composition-compiler-v1.json',
);
const receiptPath = resolve(
  repositoryRoot, 'receipts', 'recoverable-typed-composition-compiler-v1.json',
);

test('recoverable typed-composition fixture reproduces exact crash recovery and execution', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(verifyRecoverableTypedCompositionCompilerFixture(checked), checked);
  assert.deepEqual(await buildDeterministicRecoverableTypedCompositionCompilerFixture(), checked);
  assert.equal(checked.recovery.crashObserved, true);
  assert.equal(checked.recovery.routeExecutions, 1);
  assert.equal(checked.recovery.activationExecutions, 1);
  assert.equal(checked.recovery.concurrentReplayMatched, true);
  assert.equal(checked.state.serializedMethodFields, 0);
  assert.equal(checked.evidence.intentPublishedBeforeRoute, true);
  assert.deepEqual(checked.evidence.capabilityMethodOrReviewerBodyReads, []);
  assert.equal(checked.assertions.replayExternalExecutions, 0);
  assert.equal(checked.assertions.authorityExpanded, false);
  assert.equal(checked.assertions.defaultLaunchEnabled, false);
});

test('recoverable typed-composition receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyRecoverableTypedCompositionCompilerReceipt(checked), checked);
  assert.deepEqual(await rebuildRecoverableTypedCompositionCompilerReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);

  const changed = structuredClone(checked);
  changed.metrics.routeExecutions = 2;
  assert.throws(
    () => verifyRecoverableTypedCompositionCompilerReceipt(changed),
    /metrics|receipt/i,
  );
});
