import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { verifyReleaseLineage } from '../src/certification/verify-release-lineage.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const receiptDirectory = new URL('../receipts/', import.meta.url);

test('release lineage binds current HEAD to all fifty-nine ancestor certification sources', async () => {
  const result = await verifyReleaseLineage({ repositoryRoot, receiptDirectory });
  assert.equal(result.status, 'verified');
  assert.equal(result.receiptCount, 59);
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

test('ambient Git control variables cannot redirect the release head', async () => {
  const expected = await verifyReleaseLineage({ repositoryRoot, receiptDirectory });
  const script = fileURLToPath(new URL('../src/certification/verify-release-lineage.mjs', import.meta.url));
  const foreignGitDirectory = fileURLToPath(new URL('../../.git/', repositoryRoot));
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script], {
      shell: false,
      windowsHide: true,
      env: { ...process.env, GIT_DIR: foreignGitDirectory, GIT_WORK_TREE: fileURLToPath(repositoryRoot) },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).headCommit, expected.headCommit);
});
