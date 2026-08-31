import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';

const receiptUrl = new URL('../receipts/sealed-local-typed-execution-runner-v1.json', import.meta.url);

async function receiptOrSkip(t) {
  try {
    return await readFile(receiptUrl, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      t.skip('release receipt has not been issued');
      return null;
    }
    throw error;
  }
}

test('sealed local typed execution runner receipt reproduces from its exact source commit', async (t) => {
  const text = await receiptOrSkip(t);
  if (text === null) return;
  const {
    buildSealedLocalTypedExecutionRunnerReceiptFromSource,
    verifySealedLocalTypedExecutionRunnerReceipt,
  } = await import('../scripts/build-sealed-local-typed-execution-runner-v1-receipt.mjs');
  const receipt = verifySealedLocalTypedExecutionRunnerReceipt(JSON.parse(text));
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  const rebuilt = await buildSealedLocalTypedExecutionRunnerReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
  assert.equal(receipt.status, 'certified');
  assert.equal(receipt.fixture.value.recovery.recoveryExecutions[0], 'eternities-forge');
  assert.equal(receipt.fixture.value.recovery.replayExecutedSteps, 0);
  assert.equal(receipt.fixture.value.guarantees.externalExactlyOnce, false);
});
