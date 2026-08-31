import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { verifyCertificationLedger } from '../src/certification/verify-ledger.mjs';
import { sha256Value } from '../src/core/digest.mjs';

const sourceReceipts = new URL('../receipts/', import.meta.url);
const repositoryRoot = new URL('../', import.meta.url);

function verify(receiptDirectory) {
  return verifyCertificationLedger({ receiptDirectory, repositoryRoot });
}

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-cert-ledger-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const receipts = join(root, 'receipts');
  await cp(sourceReceipts, receipts, { recursive: true });
  return receipts;
}

test('certification ledger verifies all ten canonical receipts and declared links', async () => {
  const result = await verify(sourceReceipts);
  assert.equal(result.status, 'verified');
  assert.equal(result.receipts.length, 10);
  assert.deepEqual(result.receipts.map((row) => row.certificationId), [
    'creation-forge-phase1',
    'creator-protocol-phase3',
    'godagent-v0',
    'godskills-adaptive-activation-v1',
    'godskills-specialist-preference-v1',
    'godskills-v3-mission-binding',
    'local-admission-shell-v1',
    'networked-cortex-v1',
    'transactional-genesis-phase2',
    'visual-creator-shell-v1',
  ]);
  assert.match(result.ledgerDigest, /^[a-f0-9]{64}$/);
});

test('noncanonical, internally changed, missing, and extra receipts fail closed', async (context) => {
  for (const [index, mutate] of [
    async (directory) => {
      const path = join(directory, 'godagent-v0-certification.json');
      const value = JSON.parse(await readFile(path, 'utf8'));
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    },
    async (directory) => {
      const path = join(directory, 'visual-creator-shell-certification.json');
      const value = JSON.parse(await readFile(path, 'utf8'));
      value.status = 'rejected';
      await writeFile(path, `${canonicalJson(value)}\n`, 'utf8');
    },
    async (directory) => rm(join(directory, 'networked-cortex-certification.json')),
    async (directory) => writeFile(join(directory, 'foreign-certification.json'), '{}\n', 'utf8'),
  ].entries()) {
    const directory = await fixture(context, `-${index}`);
    await mutate(directory);
    await assert.rejects(() => verify(directory));
  }
});

test('changed declared historical receipt links fail even with a recomputed outer receipt digest', async (context) => {
  const directory = await fixture(context);
  const path = join(directory, 'local-admission-shell-certification.json');
  const value = JSON.parse(await readFile(path, 'utf8'));
  value.source.historicalReceiptDigests['receipts/visual-creator-shell-certification.json'] = 'f'.repeat(64);
  const { receiptDigest: _old, ...unsigned } = value;
  value.receiptDigest = sha256Value(unsigned);
  await writeFile(path, `${canonicalJson(value)}\n`, 'utf8');
  await assert.rejects(() => verify(directory), /historical/);
});

test('missing required historical links fail even with a recomputed receipt digest', async (context) => {
  const directory = await fixture(context);
  const path = join(directory, 'local-admission-shell-certification.json');
  const value = JSON.parse(await readFile(path, 'utf8'));
  delete value.source.historicalReceiptDigests['receipts/visual-creator-shell-certification.json'];
  const { receiptDigest: _old, ...unsigned } = value;
  value.receiptDigest = sha256Value(unsigned);
  await writeFile(path, `${canonicalJson(value)}\n`, 'utf8');
  await assert.rejects(() => verify(directory), /historical receipt (?:set|digest) mismatch/);
});

test('nonexistent source commits fail even with a recomputed receipt digest', async (context) => {
  const directory = await fixture(context);
  const path = join(directory, 'local-admission-shell-certification.json');
  const value = JSON.parse(await readFile(path, 'utf8'));
  value.source.commit = 'f'.repeat(40);
  const { receiptDigest: _old, ...unsigned } = value;
  value.receiptDigest = sha256Value(unsigned);
  await writeFile(path, `${canonicalJson(value)}\n`, 'utf8');
  await assert.rejects(() => verify(directory), /source commit does not resolve/);
});
