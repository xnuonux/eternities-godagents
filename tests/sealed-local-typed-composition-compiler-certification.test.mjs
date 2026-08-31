import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicSealedLocalTypedCompositionFixture,
  rebuildSealedLocalTypedCompositionReceipt,
  verifySealedLocalTypedCompositionFixture,
  verifySealedLocalTypedCompositionReceipt,
} from '../scripts/build-sealed-local-typed-composition-compiler-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(
  repositoryRoot, 'fixtures', 'sealed-local-typed-composition-compiler-v1.json',
);
const receiptPath = resolve(
  repositoryRoot, 'receipts', 'sealed-local-typed-composition-compiler-v1.json',
);

test('sealed local typed-composition fixture reproduces exact process recovery and execution', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(verifySealedLocalTypedCompositionFixture(checked), checked);
  assert.deepEqual(await buildDeterministicSealedLocalTypedCompositionFixture(), checked);
  assert.equal(checked.recovery.processDeathObserved, true);
  assert.equal(checked.recovery.routeLaunches, 1);
  assert.equal(checked.recovery.activationLaunches, 1);
  assert.equal(checked.recovery.exactCompilationReplay, true);
  assert.deepEqual(checked.binding.selectedIds, ['eternities-forge', 'eternities-muse']);
  assert.equal(checked.state.serializedMethodFields, 0);
  assert.equal(checked.assertions.recoveredWithoutRelaunch, true);
  assert.equal(checked.assertions.authorityExpanded, false);
  assert.equal(checked.assertions.defaultLaunchEnabled, false);
});

test('sealed local typed-composition receipt reproduces from its exact source commit', async (context) => {
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
  assert.deepEqual(verifySealedLocalTypedCompositionReceipt(checked), checked);
  assert.deepEqual(await rebuildSealedLocalTypedCompositionReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);

  const changed = structuredClone(checked);
  changed.metrics.activationLaunches = 2;
  assert.throws(() => verifySealedLocalTypedCompositionReceipt(changed), /metrics|receipt/i);
});
