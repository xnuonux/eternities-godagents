import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkspaceRevisionStore } from '../src/workspace/revision-store.mjs';
import { exportWorkspaceRevision } from '../src/workspace/revision-export.mjs';

const limits = { maxFiles: 4, maxFileBytes: 4096, maxTotalBytes: 8192,
  maxRevisions: 8, maxStoreBytes: 65536 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'revision-export-'));
  t.after(async () => {
    const canonical = await realpath(root);
    const prefix = `${await realpath(tmpdir())}${process.platform === 'win32' ? '\\' : '/'}revision-export-`;
    assert.ok(canonical.startsWith(prefix) && canonical.slice(prefix.length).length > 0);
    await rm(canonical, { recursive: true, force: true });
  });
  const storeRoot = join(root, 'store'), sourceRoot = join(root, 'source');
  await mkdir(storeRoot); await mkdir(sourceRoot);
  const original = Buffer.from('const answer = 41;\n');
  await writeFile(join(sourceRoot, 'app.js'), original);
  const store = await createWorkspaceRevisionStore({ root: storeRoot, limits });
  const parent = await store.capture({ sourceRoot, files: [{ path: 'app.js', sha256: hash(original) }] });
  return { root, storeRoot, sourceRoot, store, parent, original };
}

test('exports deterministic frozen checked text changes from a real store', async t => {
  const f = await fixture(t);
  const changed = Buffer.from('\ufeffconst answer = 42;\n');
  const child = await f.store.revise({ parentDigest: f.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: changed }] });
  const bundle = await exportWorkspaceRevision({ store: f.store, parentDigest: f.parent.revisionDigest,
    revisionDigest: child.revisionDigest });
  assert.deepEqual(bundle, { parentDigest: f.parent.revisionDigest, revisionDigest: child.revisionDigest,
    changes: [{ path: 'app.js', beforeSha256: hash(f.original), afterSha256: hash(changed),
      beforeText: 'const answer = 41;\n', afterText: '\ufeffconst answer = 42;\n' }] });
  assert.equal(hash(Buffer.from(bundle.changes[0].beforeText)), bundle.changes[0].beforeSha256);
  assert.equal(hash(Buffer.from(bundle.changes[0].afterText)), bundle.changes[0].afterSha256);
  assert.ok(Object.isFrozen(bundle) && Object.isFrozen(bundle.changes[0]));
  const reopened = await createWorkspaceRevisionStore({ root: f.storeRoot, limits });
  assert.deepEqual(bundle, await exportWorkspaceRevision({ store: reopened,
    parentDigest: f.parent.revisionDigest, revisionDigest: child.revisionDigest }));
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('supports no-change export and rejects wrong parent, tampering, binary, and invalid utf8', async t => {
  const f = await fixture(t);
  const same = await exportWorkspaceRevision({ store: f.store, parentDigest: f.parent.revisionDigest,
    revisionDigest: f.parent.revisionDigest });
  assert.deepEqual(same.changes, []);
  await assert.rejects(exportWorkspaceRevision({ store: f.store, parentDigest: '0'.repeat(64),
    revisionDigest: f.parent.revisionDigest }));
  const child = await f.store.revise({ parentDigest: f.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: Buffer.from([0, 1, 2]) }] });
  await writeFile(join(f.sourceRoot, 'app.js'), 'unrelated parent\n');
  const unrelated = await f.store.capture({ sourceRoot: f.sourceRoot,
    files: [{ path: 'app.js', sha256: hash(Buffer.from('unrelated parent\n')) }] });
  await writeFile(join(f.sourceRoot, 'app.js'), f.original);
  await assert.rejects(exportWorkspaceRevision({ store: f.store, parentDigest: unrelated.revisionDigest,
    revisionDigest: child.revisionDigest }));
  await assert.rejects(exportWorkspaceRevision({ store: f.store, parentDigest: f.parent.revisionDigest,
    revisionDigest: child.revisionDigest }), /binary|NUL|text/);
  const invalid = await f.store.revise({ parentDigest: f.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: Buffer.from([0xc3, 0x28]) }] });
  await assert.rejects(exportWorkspaceRevision({ store: f.store, parentDigest: f.parent.revisionDigest,
    revisionDigest: invalid.revisionDigest }), /UTF-8|text/);
  await writeFile(join(child.filesRoot, 'app.js'), 'tampered');
  await assert.rejects(exportWorkspaceRevision({ store: f.store, parentDigest: f.parent.revisionDigest,
    revisionDigest: child.revisionDigest }), /digest|bytes|size/);
});

test('rejects binary in an unchanged file and reinspects after checked reads', async t => {
  const f = await fixture(t);
  const binary = Buffer.from([0, 255, 1]);
  await writeFile(join(f.sourceRoot, 'asset.bin'), binary);
  const parent = await f.store.capture({ sourceRoot: f.sourceRoot, files: [
    { path: 'app.js', sha256: hash(f.original) }, { path: 'asset.bin', sha256: hash(binary) },
  ] });
  const changed = Buffer.from('const answer = 43;\n');
  const child = await f.store.revise({ parentDigest: parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: changed }] });
  await assert.rejects(exportWorkspaceRevision({ store: f.store, parentDigest: parent.revisionDigest,
    revisionDigest: child.revisionDigest }), /binary|NUL|text/);

  const clean = await fixture(t);
  const cleanChanged = Buffer.from('const answer = 43;\n');
  const cleanChild = await clean.store.revise({ parentDigest: clean.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(clean.original), bytes: cleanChanged }] });
  const adversarial = {
    ...clean.store,
    async read(request) {
      const bytes = await clean.store.read(request);
      if (request.revisionDigest === cleanChild.revisionDigest) await writeFile(join(cleanChild.filesRoot, 'app.js'), 'tampered');
      return bytes;
    },
    inspect: clean.store.inspect.bind(clean.store),
  };
  await assert.rejects(exportWorkspaceRevision({ store: adversarial, parentDigest: clean.parent.revisionDigest,
    revisionDigest: cleanChild.revisionDigest }), /digest|bytes|size/);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});
