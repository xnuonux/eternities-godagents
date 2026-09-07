import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['scripts/effect-only-v2.mjs', 'src/effect-intent-v2.mjs',
  'src/intent-contracts.mjs', 'src/io.mjs', 'src/routing-contracts.mjs'];
const protocolId = 'eternities-godskills-effect-only-executable-v2';
async function api() {
  const value = await import('../src/skills/effect-only-executable-verifier.mjs').catch(() => null);
  assert.equal(typeof value?.verifyEffectOnlyExecutable, 'function', 'effect-only source capture is implemented');
  return value;
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'effect-only-verifier-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sources = [];
  for (const path of paths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    const bytes = `// synthetic inert module: ${path}\n`;
    await writeFile(join(root, path), bytes);
    sources.push({ path, sha256: hash(bytes) });
  }
  // Synthetic trusted fixture, never a release or execution-quality claim.
  const receipt = { schemaVersion: 1, protocolId, status: 'verified-structural-only',
    sourceCommit: '1'.repeat(40), entrypoint: sources[0], sources,
    builder: {}, tests: [], vectors: [], verification: {},
    proofLimits: ['synthetic-fixture-not-release-evidence'] };
  receipt.receiptDigest = hash(canonicalJson(receipt));
  await mkdir(join(root, 'receipts'));
  const bytes = JSON.stringify(receipt);
  await writeFile(join(root, 'receipts/effect-only-executable-v2.json'), bytes);
  return { repositoryRoot: root, pin: { protocolId,
    executableReceipt: { path: 'receipts/effect-only-executable-v2.json', sha256: hash(bytes), receiptDigest: receipt.receiptDigest },
    entrypoint: sources[0] } };
}
test('captures immutable verified bytes so later checkout edits cannot alter the snapshot', async t => {
  const { verifyEffectOnlyExecutable, assertVerifiedEffectOnlyExecutable } = await api();
  const input = await fixture(t);
  const result = await verifyEffectOnlyExecutable(input);
  await writeFile(join(input.repositoryRoot, paths[0]), '// changed after verification');
  assert.equal(Buffer.from(result.sources[0].contentBase64, 'base64').toString(), '// synthetic inert module: scripts/effect-only-v2.mjs\n');
  assert.equal(Object.isFrozen(result.sources[0]), true);
  assert.equal(assertVerifiedEffectOnlyExecutable(result), result);
  assert.throws(() => assertVerifiedEffectOnlyExecutable(structuredClone(result)), /provenance/);
  await assert.rejects(verifyEffectOnlyExecutable(input), /digest/);
});
for (const target of ['receipt-file', 'receipt-logical', 'entrypoint', 'protocol', 'path']) {
  test(`rejects incorrect externally held ${target} pin`, async t => {
    const { verifyEffectOnlyExecutable } = await api();
    const input = await fixture(t);
    if (target === 'receipt-file') input.pin.executableReceipt.sha256 = '0'.repeat(64);
    if (target === 'receipt-logical') input.pin.executableReceipt.receiptDigest = '0'.repeat(64);
    if (target === 'entrypoint') input.pin.entrypoint.sha256 = '0'.repeat(64);
    if (target === 'protocol') input.pin.protocolId = 'unsupported';
    if (target === 'path') input.pin.executableReceipt.path = '../elsewhere.json';
    await assert.rejects(verifyEffectOnlyExecutable(input));
  });
}

for (const mutation of ['extra-module', 'reordered-closure', 'unsupported-receipt']) {
  test(`rejects ${mutation} even when its receipt is externally pinned`, async t => {
    const { verifyEffectOnlyExecutable } = await api();
    const input = await fixture(t);
    const location = join(input.repositoryRoot, input.pin.executableReceipt.path);
    const receipt = JSON.parse(await readFile(location, 'utf8'));
    if (mutation === 'extra-module') receipt.sources.push({ path: 'src/extra.mjs', sha256: '0'.repeat(64) });
    if (mutation === 'reordered-closure') receipt.sources.reverse();
    if (mutation === 'unsupported-receipt') receipt.schemaVersion = 99;
    delete receipt.receiptDigest;
    receipt.receiptDigest = hash(canonicalJson(receipt));
    const bytes = JSON.stringify(receipt);
    await writeFile(location, bytes);
    input.pin.executableReceipt = { ...input.pin.executableReceipt,
      sha256: hash(bytes), receiptDigest: receipt.receiptDigest };
    await assert.rejects(verifyEffectOnlyExecutable(input), /closure|identity/);
  });
}
test('refuses oversized source before hashing or exposing it', async t => {
  const { verifyEffectOnlyExecutable } = await api();
  const input = await fixture(t);
  await writeFile(join(input.repositoryRoot, paths[1]), Buffer.alloc(1_048_577));
  await assert.rejects(verifyEffectOnlyExecutable(input), /bound/);
});
test('rejects an aliased source directory even when every source byte matches', async t => {
  const { verifyEffectOnlyExecutable } = await api();
  const input = await fixture(t);
  const original = join(input.repositoryRoot, 'src');
  const relocated = join(input.repositoryRoot, 'relocated-src');
  await rename(original, relocated);
  await symlink(relocated, original, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyEffectOnlyExecutable(input), /alias/);
});

test('materializes only captured modules in a fresh directory without reopening the checkout', async t => {
  const { verifyEffectOnlyExecutable, materializeEffectOnlyExecutable } = await api();
  assert.equal(typeof materializeEffectOnlyExecutable, 'function', 'isolated source materialization is implemented');
  const input = await fixture(t);
  const captured = await verifyEffectOnlyExecutable(input);
  const parent = join(input.repositoryRoot, 'snapshots');
  await mkdir(parent);
  await writeFile(join(input.repositoryRoot, paths[0]), '// changed checkout');
  const first = await materializeEffectOnlyExecutable({ verifiedExecutable: captured, parent });
  const second = await materializeEffectOnlyExecutable({ verifiedExecutable: captured, parent });
  assert.notEqual(first.root, second.root);
  assert.equal(first.entrypoint, join(first.root, paths[0]));
  assert.equal(await readFile(first.entrypoint, 'utf8'), '// synthetic inert module: scripts/effect-only-v2.mjs\n');
  assert.deepEqual((await readdir(first.root)).sort(), ['scripts', 'src']);
  assert.equal((await readdir(join(first.root, 'src'))).length, 4);
  await assert.rejects(materializeEffectOnlyExecutable({ verifiedExecutable: structuredClone(captured), parent }), /provenance/);
});
test('offline probe never creates a missing output parent before source validation', async t => {
  const input = await fixture(t);
  const parent = join(input.repositoryRoot, 'not-created');
  const script = fileURLToPath(new URL('../scripts/evaluation/effect-only-snapshot-smoke.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script, input.repositoryRoot, parent],
    { windowsHide: true, timeout: 5000, maxBuffer: 4096 });
  assert.notEqual(child.status, 0);
  await assert.rejects(readdir(parent), { code: 'ENOENT' });
});
