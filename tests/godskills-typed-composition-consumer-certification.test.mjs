import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicGodskillsTypedCompositionConsumerFixture,
  rebuildGodskillsTypedCompositionConsumerReceipt,
  verifyGodskillsTypedCompositionConsumerFixture,
  verifyGodskillsTypedCompositionConsumerReceipt,
} from '../scripts/build-godskills-typed-composition-consumer-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'godskills-typed-composition-consumer-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'godskills-typed-composition-consumer-v1.json');

test('typed composition consumer fixture rebuilds the exact cross-repository canary', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.equal(verifyGodskillsTypedCompositionConsumerFixture(checked), checked);
  assert.deepEqual(await buildDeterministicGodskillsTypedCompositionConsumerFixture(), checked);
  assert.equal(checked.assertions.exactReleaseVerified, true);
  assert.equal(checked.assertions.exactMethodRecompiled, true);
  assert.equal(checked.assertions.exactExecutionReproduced, true);
  assert.equal(checked.assertions.authorityExpanded, false);
  assert.equal(checked.assertions.defaultLaunchEnabled, false);
  assert.deepEqual(checked.evidence.capabilityMethodOrReviewerBodyReads, []);
});

test('typed composition consumer receipt reproduces from its exact source commit', async (context) => {
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
  assert.equal(verifyGodskillsTypedCompositionConsumerReceipt(checked), checked);
  assert.deepEqual(await rebuildGodskillsTypedCompositionConsumerReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);
  const changed = structuredClone(checked);
  changed.metrics.authorityExpansions = 1;
  assert.throws(() => verifyGodskillsTypedCompositionConsumerReceipt(changed), /metrics|receipt/i);
});
