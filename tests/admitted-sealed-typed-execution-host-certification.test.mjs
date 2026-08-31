import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';

const receiptUrl = new URL('../receipts/admitted-sealed-typed-execution-host-v1.json', import.meta.url);

test('admitted sealed typed execution host receipt reproduces from its exact source commit', async (t) => {
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
    buildAdmittedSealedTypedExecutionHostReceiptFromSource,
    verifyAdmittedSealedTypedExecutionHostReceipt,
  } = await import('../scripts/build-admitted-sealed-typed-execution-host-v1-receipt.mjs');
  const receipt = verifyAdmittedSealedTypedExecutionHostReceipt(JSON.parse(text));
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  const rebuilt = await buildAdmittedSealedTypedExecutionHostReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
  assert.equal(receipt.fixture.value.recovery.recoveryExecutions[0], 'eternities-forge');
  assert.equal(receipt.fixture.value.recovery.replayExecutedSteps, 0);
  assert.equal(receipt.fixture.value.guarantees.defaultLaunchEnabled, false);
});
