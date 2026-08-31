import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicDeferredReviewExecutorFixture,
  rebuildDeferredReviewExecutorReceipt,
  verifyDeferredReviewExecutorCertificationReceipt,
} from '../scripts/build-deferred-review-executor-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'deferred-godskills-review-executor-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'deferred-godskills-review-executor-v1.json');

test('deferred review executor fixture rebuilds with exact crash recovery evidence', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicDeferredReviewExecutorFixture(), checked);
  assert.equal(checked.assertions.processDeathObserved, true);
  assert.equal(checked.assertions.exactDispatchReproduced, true);
  assert.equal(checked.assertions.recoveredWithoutRedispatch, true);
  assert.equal(checked.assertions.transportEvidenceCommitted, true);
  assert.equal(checked.assertions.replayExternalCalls, 0);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('deferred review executor receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyDeferredReviewExecutorCertificationReceipt(checked), checked);
  const rebuilt = await rebuildDeferredReviewExecutorReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.transportExecutions = 2;
  assert.throws(() => verifyDeferredReviewExecutorCertificationReceipt(changed), /metrics|receipt/i);
});
