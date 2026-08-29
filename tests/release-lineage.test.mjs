import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyReleaseLineage } from '../src/certification/verify-release-lineage.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const receiptDirectory = new URL('../receipts/', import.meta.url);

test('release lineage binds current HEAD to all seven ancestor certification sources', async () => {
  const result = await verifyReleaseLineage({ repositoryRoot, receiptDirectory });
  assert.equal(result.status, 'verified');
  assert.equal(result.receiptCount, 7);
  assert.match(result.headCommit, /^[a-f0-9]{40}$/);
  assert.match(result.ledgerDigest, /^[a-f0-9]{64}$/);
  assert.match(result.releaseLineageDigest, /^[a-f0-9]{64}$/);
});

test('a head predating later certification sources fails lineage verification', async () => {
  await assert.rejects(
    () => verifyReleaseLineage({
      repositoryRoot,
      receiptDirectory,
      head: '66edf417fbf5cee92e023e19ce2e67d870ff04f1',
    }),
    /not an ancestor/,
  );
});
