import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicCortexBindingRegistryFixture,
  rebuildCortexBindingRegistryReceipt,
  verifyCortexBindingRegistryCertificationReceipt,
} from '../scripts/build-cortex-binding-registry-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'cortex-binding-registry-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'cortex-binding-registry-v1.json');

test('the checked cortex binding registry fixture rebuilds byte-for-byte through real leases', async () => {
  const expected = await readFile(fixturePath, 'utf8');
  const rebuilt = await buildDeterministicCortexBindingRegistryFixture({ repositoryRoot });
  assert.equal(`${canonicalJson(rebuilt)}\n`, expected);
  assert.equal(rebuilt.assertions.activeReceiptVerified, true);
  assert.equal(rebuilt.assertions.credentialAbsent, true);
  assert.equal(rebuilt.assertions.taskCollisionRejected, true);
  assert.equal(rebuilt.assertions.writerCollisionRejected, true);
  assert.equal(rebuilt.assertions.revocationAdvanced, true);
  assert.equal(rebuilt.assertions.expiryRecovered, true);
  assert.equal(rebuilt.assertions.realmEffects, 'none');
});

test('the checked cortex binding registry receipt reproduces from source and rejects mutation', async (context) => {
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
  assert.deepEqual(verifyCortexBindingRegistryCertificationReceipt(checked), checked);
  const rebuilt = await rebuildCortexBindingRegistryReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.activeRealmEffects = 1;
  assert.throws(
    () => verifyCortexBindingRegistryCertificationReceipt(changed),
    /cortex binding registry certification receipt mismatch/,
  );
});
