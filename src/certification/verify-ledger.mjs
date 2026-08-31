import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';

const registry = Object.freeze({
  'codex-bound-turn-v1.json': 'codex-bound-turn-v1',
  'creation-forge-phase1-certification.json': 'creation-forge-phase1',
  'cortex-binding-contracts-v1.json': 'cortex-binding-contracts-v1',
  'cortex-binding-registry-v1.json': 'cortex-binding-registry-v1',
  'creator-protocol-phase3-certification.json': 'creator-protocol-phase3',
  'godagent-v0-certification.json': 'godagent-v0',
  'godskills-adaptive-activation-v1.json': 'godskills-adaptive-activation-v1',
  'godskills-specialist-preference-v1.json': 'godskills-specialist-preference-v1',
  'godskills-v3-integration.json': 'godskills-v3-mission-binding',
  'local-admission-shell-certification.json': 'local-admission-shell-v1',
  'networked-cortex-certification.json': 'networked-cortex-v1',
  'transactional-genesis-phase2-certification.json': 'transactional-genesis-phase2',
  'visual-creator-shell-certification.json': 'visual-creator-shell-v1',
});
const expectedFiles = Object.freeze(Object.keys(registry).sort());
const requiredHistoricalLinks = Object.freeze({
  'codex-bound-turn-v1.json': Object.freeze([
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'creation-forge-phase1-certification.json': Object.freeze([
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
  ]),
  'cortex-binding-contracts-v1.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'cortex-binding-registry-v1.json': Object.freeze([
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'creator-protocol-phase3-certification.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
  ]),
  'godagent-v0-certification.json': Object.freeze([]),
  'godskills-adaptive-activation-v1.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'godskills-specialist-preference-v1.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'godskills-v3-integration.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'local-admission-shell-certification.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'networked-cortex-certification.json': Object.freeze([
    'receipts/godagent-v0-certification.json',
  ]),
  'transactional-genesis-phase2-certification.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
  ]),
  'visual-creator-shell-certification.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
  ]),
});
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const execFileAsync = promisify(execFile);

function localPath(value) {
  return value instanceof URL ? fileURLToPath(value) : resolve(value);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function declaredLinks(file, receipt) {
  const sourceLinks = receipt.source?.historicalReceiptDigests;
  if (sourceLinks !== undefined) {
    if (!sourceLinks || typeof sourceLinks !== 'object' || Array.isArray(sourceLinks)) {
      throw new Error(`historical receipt map is invalid for ${file}`);
    }
    const links = Object.entries(sourceLinks);
    if (!sameArray(links.map(([path]) => path).sort(), requiredHistoricalLinks[file])) {
      throw new Error(`historical receipt set mismatch for ${file}`);
    }
    return links;
  }
  if (file === 'networked-cortex-certification.json') {
    const digest = receipt.proof?.historicalReceipt?.sha256;
    if (!DIGEST.test(digest)) throw new Error('historical receipt link is invalid for networked cortex');
    return [[requiredHistoricalLinks[file][0], digest]];
  }
  if (requiredHistoricalLinks[file].length > 0) throw new Error(`historical receipt set mismatch for ${file}`);
  return [];
}

async function requireCommit(repositoryRoot, commit, file, gitEnvironment) {
  try {
    await execFileAsync('git', ['-C', repositoryRoot, 'cat-file', '-e', `${commit}^{commit}`], {
      windowsHide: true,
      ...(gitEnvironment === undefined ? {} : { env: gitEnvironment }),
    });
  } catch {
    throw new Error(`certification source commit does not resolve: ${file}`);
  }
}

export async function verifyCertificationLedger({ receiptDirectory, repositoryRoot, gitEnvironment }) {
  const directory = localPath(receiptDirectory);
  const repository = repositoryRoot === undefined ? resolve(directory, '..') : localPath(repositoryRoot);
  const files = (await readdir(directory)).sort();
  if (!sameArray(files, expectedFiles)) throw new Error('certification receipt set mismatch');

  const loaded = new Map();
  for (const file of files) {
    const text = await readFile(join(directory, file), 'utf8');
    let receipt;
    try {
      receipt = JSON.parse(text);
    } catch {
      throw new Error(`certification receipt is invalid JSON: ${file}`);
    }
    if (text !== `${canonicalJson(receipt)}\n`) throw new Error(`certification receipt is not canonical: ${file}`);
    if (receipt.status !== 'certified' || !DIGEST.test(receipt.receiptDigest)) {
      throw new Error(`certification receipt is not certified: ${file}`);
    }
    const { receiptDigest, ...unsigned } = receipt;
    if (receiptDigest !== sha256Value(unsigned)) throw new Error(`certification receipt digest mismatch: ${file}`);
    const certificationId = receipt.certificationId ?? (file === 'godagent-v0-certification.json' ? 'godagent-v0' : null);
    if (certificationId !== registry[file]) throw new Error(`certification identity mismatch: ${file}`);
    const sourceCommit = receipt.source?.commit;
    if (!COMMIT.test(sourceCommit)) throw new Error(`certification source commit is invalid: ${file}`);
    await requireCommit(repository, sourceCommit, file, gitEnvironment);
    loaded.set(file, {
      receipt,
      fileSha256: sha256Text(text),
      row: {
        certificationId,
        file,
        sourceCommit,
        receiptDigest,
        fileSha256: sha256Text(text),
      },
    });
  }

  for (const [file, entry] of loaded) {
    for (const [path, expectedDigest] of declaredLinks(file, entry.receipt)) {
      if (typeof path !== 'string' || !path.startsWith('receipts/') || path.includes('..') || !DIGEST.test(expectedDigest)) {
        throw new Error(`historical receipt link is invalid for ${file}`);
      }
      const target = loaded.get(path.slice('receipts/'.length));
      if (!target || target.fileSha256 !== expectedDigest) {
        throw new Error(`historical receipt digest mismatch for ${file}`);
      }
    }
  }

  const receipts = [...loaded.values()].map(({ row }) => row);
  const unsigned = { schemaVersion: 1, status: 'verified', receipts };
  return Object.freeze({ ...unsigned, ledgerDigest: sha256Value(unsigned) });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  try {
    const result = await verifyCertificationLedger({ receiptDirectory: join(root, 'receipts') });
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch {
    process.stderr.write(`${canonicalJson({ schemaVersion: 1, status: 'failed', code: 'ledger-invalid' })}\n`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
