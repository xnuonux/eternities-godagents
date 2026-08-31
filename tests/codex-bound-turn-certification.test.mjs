import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicCodexBoundTurnFixture,
  rebuildCodexBoundTurnReceipt,
  verifyCodexBoundTurnCertificationReceipt,
} from '../scripts/build-codex-bound-turn-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'codex-bound-turn-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'codex-bound-turn-v1.json');

test('the checked codex bound-turn fixture rebuilds byte-for-byte through three real leases', async () => {
  const expected = await readFile(fixturePath, 'utf8');
  const rebuilt = await buildDeterministicCodexBoundTurnFixture({ repositoryRoot });
  assert.equal(`${canonicalJson(rebuilt)}\n`, expected);
  assert.equal(rebuilt.assertions.reservedBeforeDispatch, true);
  assert.equal(rebuilt.assertions.actorStableAcrossCortexes, true);
  assert.equal(rebuilt.assertions.parentChainExact, true);
  assert.equal(rebuilt.assertions.transcriptEntries, 0);
  assert.equal(rebuilt.assertions.activeBindingsAfterTurns, 0);
  assert.equal(rebuilt.assertions.realmEffects, 0);
});

test('the checked codex bound-turn receipt reproduces from source and rejects mutation', async (context) => {
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
  assert.deepEqual(verifyCodexBoundTurnCertificationReceipt(checked), checked);
  const rebuilt = await rebuildCodexBoundTurnReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.deepEqual(rebuilt, checked);

  const changed = structuredClone(checked);
  changed.metrics.realmEffects = 1;
  assert.throws(
    () => verifyCodexBoundTurnCertificationReceipt(changed),
    /codex bound-turn certification receipt mismatch/,
  );
});
