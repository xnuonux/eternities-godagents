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

test('certification ledger verifies all forty-eight canonical receipts and declared links', async () => {
  const result = await verify(sourceReceipts);
  assert.equal(result.status, 'verified');
  assert.equal(result.receipts.length, 48);
  assert.deepEqual(result.receipts.map((row) => row.certificationId), [
    'admitted-provider-backed-identity-launcher-v1',
    'admitted-sealed-identity-host-v1',
    'admitted-sealed-typed-execution-host-v1',
    'codex-bound-turn-v1',
    'codex-recoverable-turn-coordinator-v1',
    'codex-recoverable-turn-journal-v1',
    'cortex-binding-contracts-v1',
    'cortex-binding-registry-v1',
    'creation-forge-phase1',
    'creator-protocol-phase3',
    'deferred-godskills-review-executor-v1',
    'deferred-godskills-review-materializer-v1',
    'durable-anthropic-messages-phase-transport-v1',
    'godagent-v0',
    'godskills-adaptive-activation-v1',
    'godskills-specialist-preference-v1',
    'godskills-typed-composition-consumer-v1',
    'godskills-v3-mission-binding',
    'identity-bound-mission-vessel-v1',
    'local-admission-shell-v1',
    'networked-cortex-v1',
    'portable-phase-host-conformance-v1',
    'provider-backed-identity-cli-v1',
    'provider-backed-mission-dependencies-v1',
    'provider-neutral-phase-protocol-v1',
    'provider-neutral-phase-resolution-v1',
    'provider-phase-host-sdk-v1',
    'provider-resolution-authority-handoff-v1',
    'provider-resolution-authority-outbox-v1',
    'provider-resolution-decision-preparer-v1',
    'provider-resolution-profile-v1',
    'realm-negotiation-v1',
    'receipt-bound-typed-executor-bundle-v1',
    'recoverable-godskills-admission-v1',
    'recoverable-mission-native-executor-v1',
    'recoverable-mission-revision-executor-v1',
    'recoverable-typed-composition-compiler-v1',
    'recoverable-typed-execution-journal-v1',
    'resumable-mission-review-kernel-v1',
    'routing-evidence-activation-classifier-v1',
    'sealed-local-godskills-transport-v1',
    'sealed-local-identity-vessel-v1',
    'sealed-local-typed-composition-compiler-v1',
    'sealed-local-typed-execution-runner-v1',
    'sealed-openai-compatible-phase-transport-v1',
    'signed-openai-phase-resolution-v1',
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
