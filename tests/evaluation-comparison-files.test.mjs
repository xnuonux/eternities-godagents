import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const api = await import('../scripts/evaluation/comparison-files.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'comparison-files-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'source.mjs');
  const bytes = Buffer.from('export const task = "frozen";\r\n');
  await writeFile(path, bytes);
  return { root, path, bytes, pin: { path, sha256: hash(bytes) } };
}

test('comparison captures exact pinned bytes without executing the declared source', async t => {
  assert.equal(typeof api.captureComparisonFiles, 'function');
  const state = await setup(t);
  const captured = await api.captureComparisonFiles([state.pin]);
  assert.equal(captured[0].sha256, hash(state.bytes));
  assert.deepEqual(Buffer.from(captured[0].base64, 'base64'), state.bytes);
  await writeFile(state.path, 'throw new Error("not the captured source");');
  assert.deepEqual(Buffer.from(captured[0].base64, 'base64'), state.bytes);
  assert.equal(Object.isFrozen(captured[0]), true);
  await assert.rejects(api.captureComparisonFiles([state.pin]), /digest/);
});

test('comparison source pins reject missing, loose, duplicate and oversized files', async t => {
  assert.equal(typeof api.captureComparisonFiles, 'function');
  const state = await setup(t);
  for (const pins of [[], [state.pin, state.pin], [{ ...state.pin, extra: true }],
    [{ path: 'relative.mjs', sha256: state.pin.sha256 }], [{ ...state.pin, sha256: 'bad' }]]) {
    await assert.rejects(api.captureComparisonFiles(pins));
  }
  await assert.rejects(api.captureComparisonFiles([{ path: join(state.root, 'missing'), sha256: state.pin.sha256 }]));
  await writeFile(state.path, Buffer.alloc(1_048_577));
  await assert.rejects(api.captureComparisonFiles([state.pin]), /bound/);
});

test('comparison refuses a directory alias before accepting file bytes', async t => {
  assert.equal(typeof api.captureComparisonFiles, 'function');
  const state = await setup(t);
  const real = join(state.root, 'real'); await mkdir(real);
  await writeFile(join(real, 'file'), state.bytes);
  const alias = join(state.root, 'alias');
  await symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(api.captureComparisonFiles([{ path: join(alias, 'file'), sha256: state.pin.sha256 }]), /alias/);
});

test('aggregate capture ceiling applies even when each declared file is individually valid', async t => {
  const state = await setup(t);
  const bytes = Buffer.alloc(1_048_576, 97);
  const pins = [];
  for (let index = 0; index < 5; index++) {
    const path = join(state.root, `source-${index}`);
    await writeFile(path, bytes); pins.push({ path, sha256: hash(bytes) });
  }
  assert.equal((await api.captureComparisonFiles(pins.slice(0, 4))).length, 4);
  await assert.rejects(api.captureComparisonFiles(pins), /bound/);
});
