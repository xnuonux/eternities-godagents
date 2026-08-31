import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicReceiptBoundTypedExecutorBundleHostFixture } from './helpers/receipt-bound-typed-executor-bundle-fixture.mjs';

const fixtureUrl = new URL('../fixtures/receipt-bound-typed-executor-bundle-v1.json', import.meta.url);
const receiptUrl = new URL('../receipts/receipt-bound-typed-executor-bundle-v1.json', import.meta.url);

test('receipt-bound executor fixture rebuilds byte-for-byte through crash recovery and replay', async () => {
  const expected = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const actual = await buildDeterministicReceiptBoundTypedExecutorBundleHostFixture();
  assert.deepEqual(actual, expected);
  assert.equal(actual.fixtureDigest, 'f15a7ec63a13172e35befcf223aaffec64bedd6861c7cc688174f0d9d2da31d0');
  assert.equal(actual.recovery.crashObserved, true);
  assert.equal(actual.recovery.executedSteps, 1);
  assert.equal(actual.recovery.recoveredSteps, 1);
  assert.equal(actual.recovery.replayExecutedSteps, 0);
  assert.equal(actual.recovery.replayRecoveredSteps, 2);
  assert.equal(actual.recovery.freshProcessRecovery, true);
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

  const changedManifest = structuredClone(receipt);
  changedManifest.source.implementationManifest.entries[0].path = 'foreign-source.mjs';
  changedManifest.source.implementationManifest.digest = sha256Value(
    changedManifest.source.implementationManifest.entries,
  );
  changedManifest.receiptDigest = sha256Value((({ receiptDigest, ...value }) => value)(changedManifest));
  assert.throws(
    () => verifyReceiptBoundTypedExecutorBundleReceipt(changedManifest),
    /manifest|digest|binding/,
  );

  const changedPlan = structuredClone(receipt);
  changedPlan.source.plan.sha256 = '0'.repeat(64);
  changedPlan.receiptDigest = sha256Value((({ receiptDigest, ...value }) => value)(changedPlan));
  assert.throws(
    () => verifyReceiptBoundTypedExecutorBundleReceipt(changedPlan),
    /differs from implementation manifest/,
  );

  const changedReview = structuredClone(receipt);
  changedReview.source.review.value.unresolvedImportantDefects = 1;
  changedReview.source.review.fileSha256 = sha256Text(
    `${canonicalJson(changedReview.source.review.value)}\n`,
  );
  changedReview.receiptDigest = sha256Value((({ receiptDigest, ...value }) => value)(changedReview));
  assert.throws(
    () => verifyReceiptBoundTypedExecutorBundleReceipt(changedReview),
    /review is invalid/,
  );

  const changedReviewPaths = structuredClone(receipt);
  changedReviewPaths.source.review.value.reviewedPaths.pop();
  changedReviewPaths.source.review.fileSha256 = sha256Text(
    `${canonicalJson(changedReviewPaths.source.review.value)}\n`,
  );
  changedReviewPaths.receiptDigest = sha256Value(
    (({ receiptDigest, ...value }) => value)(changedReviewPaths),
  );
  assert.throws(
    () => verifyReceiptBoundTypedExecutorBundleReceipt(changedReviewPaths),
    /review is invalid/,
  );

  const changedParent = structuredClone(receipt);
  changedParent.parent.fileSha256 = '0'.repeat(64);
  changedParent.receiptDigest = sha256Value((({ receiptDigest, ...value }) => value)(changedParent));
  assert.throws(
    () => verifyReceiptBoundTypedExecutorBundleReceipt(changedParent),
    /parent binding changed/,
  );
});
