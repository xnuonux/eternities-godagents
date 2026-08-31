import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicReceiptBoundTypedExecutorBundleHostFixture } from './helpers/receipt-bound-typed-executor-bundle-fixture.mjs';

const fixtureUrl = new URL('../fixtures/receipt-bound-typed-executor-bundle-v1.json', import.meta.url);
const receiptUrl = new URL('../receipts/receipt-bound-typed-executor-bundle-v1.json', import.meta.url);

test('receipt-bound executor fixture rebuilds byte-for-byte through crash recovery and replay', async () => {
  const expected = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const actual = await buildDeterministicReceiptBoundTypedExecutorBundleHostFixture();
  assert.deepEqual(actual, expected);
  assert.equal(actual.fixtureDigest, '81d0148d8c6a601abf3ed390bf749266779be031c5da312e7b941d99a12535e8');
  assert.equal(actual.recovery.crashObserved, true);
  assert.equal(actual.recovery.executedSteps, 1);
  assert.equal(actual.recovery.recoveredSteps, 1);
  assert.equal(actual.recovery.replayExecutedSteps, 0);
  assert.equal(actual.recovery.replayRecoveredSteps, 2);
  assert.equal(actual.guarantees.callerExecutorsAccepted, false);
  assert.equal(actual.guarantees.exactVerifiedBytesExecuted, true);
});

test('receipt-bound executor certification reproduces from its exact source commit', async (t) => {
  let text;
  try {
    text = await readFile(receiptUrl, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      t.skip('release receipt has not been issued');
      return;
    }
    throw error;
  }
  const {
    buildReceiptBoundTypedExecutorBundleReceiptFromSource,
    verifyReceiptBoundTypedExecutorBundleReceipt,
  } = await import('../scripts/build-receipt-bound-typed-executor-bundle-v1-receipt.mjs');
  const receipt = verifyReceiptBoundTypedExecutorBundleReceipt(JSON.parse(text));
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  const rebuilt = await buildReceiptBoundTypedExecutorBundleReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.deepEqual(rebuilt, receipt);
});
