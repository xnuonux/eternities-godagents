import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, open, stat, link, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';

const api = await import('../src/workspace/revision-store.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const limits = { maxFiles: 4, maxFileBytes: 4096, maxTotalBytes: 8192,
  maxRevisions: 8, maxStoreBytes: 65536 };

async function fixture(t) {
  assert.equal(typeof api.createWorkspaceRevisionStore, 'function', 'workspace revision store API is required');
  const parent = await mkdtemp(join(tmpdir(), 'godagent-workspace-store-'));
  t.after(async () => {
    const inside = relative(resolve(tmpdir()), resolve(parent));
    assert.ok(inside.startsWith('godagent-workspace-store-') && !inside.includes('..') && !isAbsolute(inside));
    await rm(parent, { recursive: true, force: true });
  });
  const root = join(parent, 'store'), sourceRoot = join(parent, 'source');
  await mkdir(root); await mkdir(sourceRoot);
  const original = Buffer.from('export const answer = 41;\n');
  const asset = Buffer.from([0, 255, 1, 128]);
  await writeFile(join(sourceRoot, 'app.js'), original);
  await writeFile(join(sourceRoot, 'asset.bin'), asset);
  const files = [{ path: 'app.js', sha256: hash(original) }, { path: 'asset.bin', sha256: hash(asset) }];
  return { parent, root, sourceRoot, original, asset, files };
}

test('workspace capture materializes exact pinned bytes without modifying original files', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  const revision = await store.capture({ sourceRoot: f.sourceRoot, files: f.files });
  assert.equal(revision.parentDigest, null);
  assert.equal(revision.totalBytes, f.original.length + f.asset.length);
  assert.deepEqual(await readFile(join(revision.filesRoot, 'app.js')), f.original);
  assert.deepEqual(await readFile(join(revision.filesRoot, 'asset.bin')), f.asset);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'asset.bin')), f.asset);
  assert.equal((await store.inspect(revision.revisionDigest)).revisionDigest, revision.revisionDigest);
  const returned = await store.read({ revisionDigest: revision.revisionDigest, path: 'asset.bin' });
  assert.deepEqual(Buffer.from(returned), f.asset);
  returned[0] = 12;
  assert.deepEqual(Buffer.from(await store.read({ revisionDigest: revision.revisionDigest, path: 'asset.bin' })), f.asset);
  const manifest = JSON.parse(await readFile(revision.manifestPath, 'utf8'));
  assert.deepEqual(manifest.files.map(row => row.path), ['app.js', 'asset.bin']);
  assert.equal((await store.describe()).openedAs, 'created');
  const reopened = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  assert.equal((await reopened.describe()).openedAs, 'reopened');
  assert.equal((await reopened.capture({ sourceRoot: f.sourceRoot, files: f.files })).revisionDigest, revision.revisionDigest);
  assert.equal((await reopened.describe()).completedCount, 1);
});

test('workspace initialization refuses an unrelated nonempty directory without changing its data', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'user.txt'), 'keep me');
  await assert.rejects(api.createWorkspaceRevisionStore({ root: f.root, limits }), /empty|unrelated|adopt/);
  assert.equal(await readFile(join(f.root, 'user.txt'), 'utf8'), 'keep me');
  assert.deepEqual(await readdir(f.root), ['user.txt']);
});

test('workspace capture rejects changed source preimages before publishing any revision', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  await writeFile(join(f.sourceRoot, 'app.js'), 'new source');
  await assert.rejects(store.capture({ sourceRoot: f.sourceRoot, files: f.files }), /digest|preimage/);
  assert.equal((await store.describe()).completedCount, 0);
  assert.equal((await store.describe()).pendingCount, 0);
  assert.equal(await readFile(join(f.sourceRoot, 'app.js'), 'utf8'), 'new source');
});

test('workspace inspection rejects changed materialized bytes instead of trusting a saved manifest', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  const revision = await store.capture({ sourceRoot: f.sourceRoot, files: f.files });
  await writeFile(join(revision.filesRoot, 'app.js'), 'tampered');
  await assert.rejects(store.inspect(revision.revisionDigest), /digest|bytes|size/);
  await assert.rejects(store.read({ revisionDigest: revision.revisionDigest, path: 'app.js' }), /digest|bytes|size/);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace inspection rejects unlisted empty directories in a completed revision', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  const revision = await store.capture({ sourceRoot: f.sourceRoot, files: f.files });
  await mkdir(join(revision.filesRoot, 'unlisted'));
  await assert.rejects(store.inspect(revision.revisionDigest), /unexpected.*directory|directory.*set/);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace source growth is rejected without reading beyond the declared byte ceiling', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  const sourcePath = join(f.sourceRoot, 'app.js');
  const sourceIdentity = await stat(sourcePath, { bigint: true });
  const probe = await open(sourcePath, 'r');
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const originalReadFile = prototype.readFile, originalRead = prototype.read;
  const grownBytes = Buffer.alloc(limits.maxFileBytes + 32, 65);
  let grew = false, deliveredBytes = 0;
  async function atReadBoundary(handle) {
    const value = await handle.stat({ bigint: true });
    const selected = value.dev === sourceIdentity.dev && value.ino === sourceIdentity.ino;
    if (selected && !grew) { grew = true; await writeFile(sourcePath, grownBytes); }
    return selected;
  }
  // Control only the writer's timing at the actual file-read boundary. Reads,
  // writes and file identities remain real; no production injection hook exists.
  t.mock.method(prototype, 'readFile', async function (...args) {
    const selected = await atReadBoundary(this);
    const result = await originalReadFile.apply(this, args);
    if (selected) deliveredBytes += result.length;
    return result;
  });
  t.mock.method(prototype, 'read', async function (...args) {
    const selected = await atReadBoundary(this);
    const result = await originalRead.apply(this, args);
    if (selected) deliveredBytes += result.bytesRead;
    return result;
  });
  try {
    await assert.rejects(store.capture({ sourceRoot: f.sourceRoot, files: f.files }), /bytes|size|changed|ceiling|limit/);
    assert.equal(grew, true, 'the selected file actually grew after its size was checked');
    assert.ok(deliveredBytes <= limits.maxFileBytes + 1,
      `read delivered ${deliveredBytes} bytes past a ${limits.maxFileBytes}-byte ceiling`);
    assert.equal((await store.describe()).completedCount, 0);
    assert.equal((await store.describe()).pendingCount, 0);
  } finally { t.mock.restoreAll(); }
  assert.deepEqual(await readFile(sourcePath), grownBytes);
});

test('workspace rejects real hard links and junction paths without copying outside files', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  await link(join(f.sourceRoot, 'app.js'), join(f.parent, 'outside-link.js'));
  assert.equal((await stat(join(f.sourceRoot, 'app.js'))).nlink, 2);
  await assert.rejects(store.capture({ sourceRoot: f.sourceRoot, files: f.files }), /hard link|identity/);
  const outside = join(f.parent, 'outside'); await mkdir(outside);
  await writeFile(join(outside, 'outside.js'), 'outside data');
  await symlink(outside, join(f.sourceRoot, 'linked'), 'junction');
  await assert.rejects(store.capture({ sourceRoot: f.sourceRoot,
    files: [{ path: 'linked/outside.js', sha256: hash('outside data') }] }), /alias|directory/);
  const aliasStore = join(f.parent, 'store-alias'); await symlink(f.root, aliasStore, 'junction');
  await assert.rejects(api.createWorkspaceRevisionStore({ root: aliasStore, limits }), /alias|directory/);
  assert.equal((await store.describe()).completedCount, 0);
  assert.equal((await store.describe()).pendingCount, 0);
  assert.equal(await readFile(join(outside, 'outside.js'), 'utf8'), 'outside data');
});

test('workspace path validation rejects traversal, device names and case collisions before staging', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  for (const path of ['../app.js', '/app.js', 'C:/app.js', 'a\\b', 'a//b', 'a/./b',
    'CON.txt', 'COM1', 'x/file:stream', 'a/last.', 'a/last ', 'e\u0301.js']) {
    await assert.rejects(store.capture({ sourceRoot: f.sourceRoot, files: [{ path, sha256: hash(f.original) }] }), /path|segment/);
  }
  await assert.rejects(store.capture({ sourceRoot: f.sourceRoot, files: [
    { path: 'app.js', sha256: hash(f.original) }, { path: 'APP.js', sha256: hash(f.original) },
  ] }), /collide/);
  await assert.rejects(store.capture({ sourceRoot: f.root, files: f.files }), /overlap/);
  await assert.rejects(store.capture({ sourceRoot: f.parent, files: f.files }), /overlap/);
  assert.equal((await store.describe()).pendingCount, 0);
  assert.equal((await store.describe()).completedCount, 0);
});

test('workspace rejects each smaller host budget without creating a partial revision', async t => {
  const f = await fixture(t);
  for (const [name, value] of [['maxFiles', 1], ['maxFileBytes', 1], ['maxTotalBytes', 1], ['maxStoreBytes', 1]]) {
    const root = join(f.parent, name); await mkdir(root);
    const store = await api.createWorkspaceRevisionStore({ root, limits: { ...limits, [name]: value } });
    await assert.rejects(store.capture({ sourceRoot: f.sourceRoot, files: f.files }), /count|size|bytes|limit|exhausted/);
    const description = await store.describe();
    assert.equal(description.completedCount, 0); assert.equal(description.pendingCount, 0);
    assert.equal(description.storedBytes, 0);
  }
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace snapshots caller inputs before asynchronous initialization and capture', async t => {
  const f = await fixture(t);
  const options = { root: f.root, limits: { ...limits } };
  const initializing = api.createWorkspaceRevisionStore(options);
  options.root = f.sourceRoot; options.limits.maxFiles = 0;
  const store = await initializing;
  const request = { sourceRoot: f.sourceRoot, files: structuredClone(f.files) };
  const capturing = store.capture(request);
  request.sourceRoot = f.root; request.files[0].path = '../wrong'; request.files[0].sha256 = '0'.repeat(64);
  const revision = await capturing;
  assert.deepEqual(await readFile(join(revision.filesRoot, 'app.js')), f.original);
  assert.equal((await store.describe()).limits.maxFiles, 4);
});

test('workspace concurrent initialization produces one adopted store or an explicit lock refusal', async t => {
  const f = await fixture(t);
  const attempts = await Promise.allSettled([
    api.createWorkspaceRevisionStore({ root: f.root, limits }),
    api.createWorkspaceRevisionStore({ root: f.root, limits }),
  ]);
  const succeeded = attempts.filter(result => result.status === 'fulfilled');
  assert.ok(succeeded.length >= 1);
  for (const result of attempts.filter(result => result.status === 'rejected')) assert.match(result.reason.message, /lock|owner/);
  const descriptions = [];
  for (const result of succeeded) descriptions.push(await result.value.describe());
  assert.equal(descriptions.filter(result => result.openedAs === 'created').length, 1);
  const reopened = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  assert.equal((await reopened.describe()).openedAs, 'reopened');
  assert.deepEqual((await readdir(f.root)).sort(), ['pending', 'revisions', 'store.json']);
});

test('workspace stored policy changes and extra revision files are rejected on existing handles', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  const revision = await store.capture({ sourceRoot: f.sourceRoot, files: f.files });
  await writeFile(join(revision.filesRoot, 'extra.js'), 'unlisted');
  await assert.rejects(store.inspect(revision.revisionDigest), /file set/);
  const policyPath = join(f.root, 'store.json'), originalPolicy = await readFile(policyPath, 'utf8');
  const changedPolicy = originalPolicy.replace('"maxFiles":4', '"maxFiles":3');
  assert.notEqual(changedPolicy, originalPolicy);
  await writeFile(policyPath, changedPolicy);
  await assert.rejects(store.describe(), /policy changed/);
  await assert.rejects(api.createWorkspaceRevisionStore({ root: f.root, limits }), /policy changed/);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace slot overflow does not bulk-load an unbounded directory listing before rejection', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits: { ...limits, maxRevisions: 1 } });
  const pending = join(f.root, 'pending');
  for (const suffix of ['1', '2', '3']) await mkdir(join(pending, `00000000-0000-0000-0000-00000000000${suffix}`));
  const nativeReadDirectory = fsPromises.readdir;
  let largestWholeListing = 0;
  // Keep actual directory contents and I/O. Observe the unbounded bulk boundary
  // so rejecting only after it materializes every entry cannot pass this test.
  t.mock.method(fsPromises, 'readdir', async function (path, ...args) {
    const entries = await nativeReadDirectory.call(this, path, ...args);
    if (resolve(String(path)) === resolve(pending)) largestWholeListing = Math.max(largestWholeListing, entries.length);
    return entries;
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(store.describe(), /slot|entr.*limit|limit.*entr/);
    assert.ok(largestWholeListing <= 2, `bulk-loaded ${largestWholeListing} entries past a one-slot budget`);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  assert.equal((await readdir(pending)).length, 3, 'budget refusal preserves pending data');
});

test('workspace supports exact nested Unicode paths and zero-byte files without capturing unselected siblings', async t => {
  const f = await fixture(t);
  await mkdir(join(f.sourceRoot, 'nested'));
  const text = Buffer.from('export const message = "hello";\n');
  await writeFile(join(f.sourceRoot, 'nested', 'é.js'), text);
  await writeFile(join(f.sourceRoot, 'nested', 'empty.txt'), Buffer.alloc(0));
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  const revision = await store.capture({ sourceRoot: f.sourceRoot, files: [
    { path: 'nested/é.js', sha256: hash(text) },
    { path: 'nested/empty.txt', sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  ] });
  assert.deepEqual(revision.files.map(row => row.path), ['nested/empty.txt', 'nested/é.js']);
  assert.equal(revision.totalBytes, text.length);
  assert.deepEqual(await readFile(join(revision.filesRoot, 'nested', 'é.js')), text);
  assert.equal((await store.read({ revisionDigest: revision.revisionDigest, path: 'nested/empty.txt' })).length, 0);
  await assert.rejects(readFile(join(revision.filesRoot, 'app.js')), { code: 'ENOENT' });
});

test('workspace inspection rejects destination hard links and a BOM-prefixed manifest', async t => {
  const f = await fixture(t);
  const store = await api.createWorkspaceRevisionStore({ root: f.root, limits });
  const revision = await store.capture({ sourceRoot: f.sourceRoot, files: f.files });
  const alias = join(f.parent, 'materialized-link.js');
  await link(join(revision.filesRoot, 'app.js'), alias);
  await assert.rejects(store.inspect(revision.revisionDigest), /hard link|identity/);
  await rm(alias); // exact owned temporary link only, not its target
  const manifest = await readFile(revision.manifestPath);
  await writeFile(revision.manifestPath, Buffer.concat([Buffer.from([239, 187, 191]), manifest]));
  await assert.rejects(store.inspect(revision.revisionDigest));
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace interrupted initialization is preserved and never silently adopted', async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'revisions'));
  await mkdir(join(f.root, 'pending'));
  await assert.rejects(api.createWorkspaceRevisionStore({ root: f.root, limits }), /unrelated|incomplete|adopt/);
  assert.deepEqual((await readdir(f.root)).sort(), ['pending', 'revisions']);
  await writeFile(join(f.root, 'store.json'), '{partial');
  await assert.rejects(api.createWorkspaceRevisionStore({ root: f.root, limits }));
  assert.equal(await readFile(join(f.root, 'store.json'), 'utf8'), '{partial');
  assert.deepEqual((await readdir(f.root)).sort(), ['pending', 'revisions', 'store.json']);
});
