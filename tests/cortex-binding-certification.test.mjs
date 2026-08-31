import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicCortexBindingFixture,
  rebuildCortexBindingContractsReceipt,
  verifyCortexBindingContractsReceipt,
} from '../scripts/build-cortex-binding-contracts-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'cortex-binding-contracts-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'cortex-binding-contracts-v1.json');

test('the checked cortex binding fixture rebuilds byte-for-byte through real admissions', async () => {
  const expected = await readFile(fixturePath, 'utf8');
  const rebuilt = await buildDeterministicCortexBindingFixture({ repositoryRoot });
  assert.equal(`${canonicalJson(rebuilt)}\n`, expected);
  assert.equal(rebuilt.assertions.activeBindings, 0);
  assert.equal(rebuilt.assertions.grantedEffects, 0);
  assert.equal(rebuilt.assertions.compactionWholeSection, true);
});

test('the checked cortex binding receipt reproduces from its source commit and rejects mutation', async (context) => {
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
  assert.equal(`${canonicalJson(checked)}\n`, text);
  assert.deepEqual(verifyCortexBindingContractsReceipt(checked), checked);
  const rebuilt = await rebuildCortexBindingContractsReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.grantedEffects = 1;
  assert.throws(
    () => verifyCortexBindingContractsReceipt(changed),
    /cortex binding certification receipt mismatch/,
  );
});
