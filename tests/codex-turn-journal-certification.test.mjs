import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicCodexTurnJournalFixture,
  rebuildCodexTurnJournalReceipt,
  verifyCodexTurnJournalCertificationReceipt,
} from '../scripts/build-codex-turn-journal-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'codex-recoverable-turn-journal-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'codex-recoverable-turn-journal-v1.json');

test('the checked recoverable-turn fixture rebuilds byte-for-byte across every durable boundary', async () => {
  const expected = await readFile(fixturePath, 'utf8');
  const rebuilt = await buildDeterministicCodexTurnJournalFixture();
  assert.equal(`${canonicalJson(rebuilt)}\n`, expected);
  assert.ok(rebuilt.assertions.reconstructionCount >= 20);
  assert.equal(rebuilt.assertions.exactRetryEventCountStable, true);
  assert.equal(rebuilt.assertions.operationCollisionRejected, true);
  assert.equal(rebuilt.assertions.uncertainDispatchProjected, true);
  assert.equal(rebuilt.assertions.abandonedAttemptAdvancedOrdinal, true);
  assert.equal(rebuilt.assertions.acceptedTransactions, 3);
  assert.equal(rebuilt.assertions.terminalTransactions, 5);
  assert.equal(rebuilt.assertions.terminalResponsesRecovered, 3);
  assert.equal(rebuilt.assertions.trustedMetadataLeaks, 0);
  assert.equal(rebuilt.assertions.transcriptInputs, 0);
  assert.equal(rebuilt.assertions.continuityAdmissions, 0);
  assert.equal(rebuilt.assertions.realmEffects, 0);
});

test('the checked recoverable-turn receipt reproduces from frozen source and rejects mutation', async (context) => {
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
  assert.deepEqual(verifyCodexTurnJournalCertificationReceipt(checked), checked);
  const rebuilt = await rebuildCodexTurnJournalReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.realmEffects = 1;
  assert.throws(
    () => verifyCodexTurnJournalCertificationReceipt(changed),
    /codex turn journal certification receipt mismatch/,
  );
});

