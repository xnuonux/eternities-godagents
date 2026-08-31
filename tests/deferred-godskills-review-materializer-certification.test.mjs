import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicDeferredReviewMaterializerFixture,
  rebuildDeferredReviewMaterializerReceipt,
  verifyDeferredReviewMaterializerCertificationReceipt,
} from '../scripts/build-deferred-review-materializer-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'deferred-godskills-review-materializer-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'deferred-godskills-review-materializer-v1.json');

test('deferred review materializer fixture rebuilds with exact disclosure and authority assertions', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicDeferredReviewMaterializerFixture(), checked);
  assert.equal(checked.assertions.constructionBodyFree, true);
  assert.equal(checked.assertions.roundOneExactDisclosure, true);
  assert.equal(checked.assertions.roundTwoExactDisclosure, true);
  assert.equal(checked.assertions.roundOneReproduced, true);
  assert.equal(checked.assertions.roundTwoContextBound, true);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
  assert.equal(checked.assertions.filesystemRootsDisclosed, 0);
});

test('deferred review materializer receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifyDeferredReviewMaterializerCertificationReceipt(checked), checked);
  const rebuilt = await rebuildDeferredReviewMaterializerReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.realmEffects = 1;
  assert.throws(() => verifyDeferredReviewMaterializerCertificationReceipt(changed), /metrics|receipt/i);
});
