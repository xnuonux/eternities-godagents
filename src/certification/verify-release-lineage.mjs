import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyCertificationLedger } from './verify-ledger.mjs';

const execFileAsync = promisify(execFile);
const COMMIT = /^[a-f0-9]{40}$/;

function localPath(value) {
  return value instanceof URL ? fileURLToPath(value) : resolve(value);
}

async function resolveCommit(repositoryRoot, ref) {
  const { stdout } = await execFileAsync(
    'git', ['-C', repositoryRoot, 'rev-parse', '--verify', `${ref}^{commit}`], { windowsHide: true },
  );
  const commit = stdout.trim();
  if (!COMMIT.test(commit)) throw new Error('release head is invalid');
  return commit;
}

export async function verifyReleaseLineage({ repositoryRoot, receiptDirectory, head = 'HEAD' }) {
  if (typeof head !== 'string' || head.length < 1 || head.length > 256 || /[\0\r\n]/.test(head)) {
    throw new TypeError('release head reference is invalid');
  }
  const repository = localPath(repositoryRoot);
  const receipts = localPath(receiptDirectory);
  const ledger = await verifyCertificationLedger({ receiptDirectory: receipts, repositoryRoot: repository });
  const headCommit = await resolveCommit(repository, head);
  for (const row of ledger.receipts) {
    try {
      await execFileAsync(
        'git', ['-C', repository, 'merge-base', '--is-ancestor', row.sourceCommit, headCommit], { windowsHide: true },
      );
    } catch {
      throw new Error(`certification source is not an ancestor of release head: ${row.certificationId}`);
    }
  }
  const unsigned = {
    schemaVersion: 1,
    status: 'verified',
    headCommit,
    ledgerDigest: ledger.ledgerDigest,
    receiptCount: ledger.receipts.length,
  };
  return Object.freeze({ ...unsigned, releaseLineageDigest: sha256Value(unsigned) });
}

async function main() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  try {
    const result = await verifyReleaseLineage({
      repositoryRoot,
      receiptDirectory: join(repositoryRoot, 'receipts'),
    });
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch {
    process.stderr.write(`${canonicalJson({ schemaVersion: 1, status: 'failed', code: 'release-lineage-invalid' })}\n`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
