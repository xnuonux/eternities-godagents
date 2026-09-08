import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createWorkspaceRevisionStore } from '../src/workspace/revision-store.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const limits = { maxFiles: 4, maxFileBytes: 4096, maxTotalBytes: 8192,
  maxRevisions: 8, maxStoreBytes: 65536 };
async function fixture(t, overrides = {}) {
  const owned = await mkdtemp(join(tmpdir(), 'godagent-workspace-recovery-'));
  t.after(async () => {
    const within = relative(resolve(tmpdir()), resolve(owned));
    assert.ok(within.startsWith('godagent-workspace-recovery-') && !within.includes('..') && !isAbsolute(within));
    await rm(owned, { recursive: true, force: true });
  });
  const root = join(owned, 'store'), sourceRoot = join(owned, 'source');
  await mkdir(root); await mkdir(sourceRoot);
  const original = Buffer.from('export const answer = 41;\n'), asset = Buffer.from([0, 255, 1, 128]);
  await writeFile(join(sourceRoot, 'app.js'), original);
  await writeFile(join(sourceRoot, 'asset.bin'), asset);
  const files = [{ path: 'app.js', sha256: hash(original) }, { path: 'asset.bin', sha256: hash(asset) }];
  const policy = { ...limits, ...overrides };
  const store = await createWorkspaceRevisionStore({ root, limits: policy });
  const parent = await store.capture({ sourceRoot, files });
  return { root, sourceRoot, original, asset, files, policy, store, parent };
}

test('workspace revision replaces one admitted file while preserving parent, sibling and original bytes', async t => {
  const f = await fixture(t, { maxRevisions: 2 });
  assert.equal(typeof f.store.revise, 'function', 'workspace revise API is required');
  const replacement = Buffer.from('export const answer = 42;\n');
  const request = { parentDigest: f.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: replacement }] };
  const child = await f.store.revise(request);
  assert.equal(child.parentDigest, f.parent.revisionDigest);
  assert.notEqual(child.revisionDigest, f.parent.revisionDigest);
  assert.deepEqual(await readFile(join(child.filesRoot, 'app.js')), replacement);
  assert.deepEqual(await readFile(join(child.filesRoot, 'asset.bin')), f.asset);
  assert.deepEqual(await readFile(join(f.parent.filesRoot, 'app.js')), f.original);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
  const reopened = await createWorkspaceRevisionStore({ root: f.root, limits: f.policy });
  assert.equal((await reopened.inspect(child.revisionDigest)).revisionDigest, child.revisionDigest);
  assert.equal((await reopened.revise(request)).revisionDigest, child.revisionDigest);
  assert.equal((await reopened.describe()).completedCount, 2);
  assert.equal((await reopened.describe()).pendingCount, 0);
});

test('workspace pending bytes remain inert and consume exact storage and revision slots after reopening', async t => {
  const f = await fixture(t, { maxRevisions: 2 });
  const before = await f.store.describe();
  const pendingRoot = join(f.root, 'pending', '11111111-1111-4111-8111-111111111111');
  await mkdir(pendingRoot); await mkdir(join(pendingRoot, 'files'));
  await writeFile(join(pendingRoot, 'files', 'partial.bin'), Buffer.from([1, 2, 3]));
  await writeFile(join(pendingRoot, 'manifest.json'), '{partial');
  const reopened = await createWorkspaceRevisionStore({ root: f.root, limits: f.policy });
  const observed = await reopened.describe();
  assert.equal(observed.completedCount, 1); assert.equal(observed.pendingCount, 1);
  const completeBytes = (await readFile(f.parent.manifestPath)).length + f.original.length + f.asset.length;
  assert.equal(before.storedBytes, completeBytes);
  assert.equal(observed.storedBytes, completeBytes + 3 + 8);
  assert.equal((await reopened.capture({ sourceRoot: f.sourceRoot, files: f.files })).revisionDigest, f.parent.revisionDigest);
  await writeFile(join(f.sourceRoot, 'app.js'), 'new pinned source');
  await assert.rejects(reopened.capture({ sourceRoot: f.sourceRoot,
    files: [{ path: 'app.js', sha256: hash('new pinned source') }] }), /slots.*exhausted/);
  assert.equal(await readFile(join(pendingRoot, 'manifest.json'), 'utf8'), '{partial');
  assert.deepEqual(await readFile(join(pendingRoot, 'files', 'partial.bin')), Buffer.from([1, 2, 3]));
  assert.deepEqual(await readdir(join(f.root, 'revisions')), [f.parent.revisionDigest]);
});

test('workspace revision rejects stale, unknown, duplicate and oversized changes before staging', async t => {
  const f = await fixture(t);
  const valid = { path: 'app.js', expectedSha256: hash(f.original), bytes: new Uint8Array([42]) };
  const badChanges = [[], [{ ...valid, expectedSha256: '0'.repeat(64) }],
    [{ ...valid, path: 'unknown.js' }], [valid, valid],
    [valid, { ...valid, path: 'APP.js' }], [{ ...valid, path: '../outside' }],
    [{ ...valid, bytes: 'not bytes' }], [{ ...valid, bytes: new Uint8Array(4097) }]];
  for (const changes of badChanges) {
    await assert.rejects(f.store.revise({ parentDigest: f.parent.revisionDigest, changes }),
      /change|preimage|admitted|collide|path|segment/);
  }
  assert.equal((await f.store.describe()).completedCount, 1);
  assert.equal((await f.store.describe()).pendingCount, 0);
  assert.deepEqual(await readFile(join(f.parent.filesRoot, 'app.js')), f.original);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace revision verifies untouched parent siblings and rejects an occupied conflicting child', async t => {
  const f = await fixture(t);
  const request = { parentDigest: f.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: Buffer.from('replacement') }] };
  const child = await f.store.revise(request);
  await writeFile(join(child.filesRoot, 'app.js'), 'conflicting child');
  await assert.rejects(f.store.revise(request), /digest|size|bytes/);
  assert.equal(await readFile(join(child.filesRoot, 'app.js'), 'utf8'), 'conflicting child');
  assert.equal((await f.store.describe()).pendingCount, 0);
  await writeFile(join(f.parent.filesRoot, 'asset.bin'), 'changed sibling');
  await assert.rejects(f.store.revise(request), /digest|size|bytes/);
  assert.equal(await readFile(join(f.parent.filesRoot, 'asset.bin'), 'utf8'), 'changed sibling');
  assert.deepEqual(await readFile(join(f.parent.filesRoot, 'app.js')), f.original);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'asset.bin')), f.asset);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
  assert.equal((await f.store.describe()).completedCount, 2);
});

test('workspace revision snapshots shared byte views and request fields before its first await', async t => {
  const f = await fixture(t);
  const backing = new Uint8Array(new SharedArrayBuffer(8));
  backing.set([99, 99, 7, 0, 255, 99, 99, 99]);
  const request = { parentDigest: f.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: backing.subarray(2, 5) }] };
  const running = f.store.revise(request);
  backing.fill(12); request.parentDigest = '0'.repeat(64);
  request.changes[0].path = 'asset.bin'; request.changes[0].expectedSha256 = '0'.repeat(64);
  request.changes.length = 0;
  const child = await running;
  assert.deepEqual(await readFile(join(child.filesRoot, 'app.js')), Buffer.from([7, 0, 255]));
  assert.deepEqual(await readFile(join(child.filesRoot, 'asset.bin')), f.asset);
  const empty = await f.store.revise({ parentDigest: child.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(Buffer.from([7, 0, 255])), bytes: new Uint8Array(0) }] });
  assert.equal((await readFile(join(empty.filesRoot, 'app.js'))).length, 0);
  assert.equal(empty.parentDigest, child.revisionDigest);
});

test('workspace concurrent revisions produce only verified completed roots or explicit lock refusal', async t => {
  const f = await fixture(t);
  const request = { parentDigest: f.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: Buffer.from('next') }] };
  const attempts = await Promise.allSettled([f.store.revise(request), f.store.revise(request)]);
  assert.ok(attempts.some(result => result.status === 'fulfilled'));
  const digests = new Set();
  for (const result of attempts) {
    if (result.status === 'rejected') assert.match(result.reason.message, /lock|owner/);
    else {
      digests.add(result.value.revisionDigest);
      assert.equal((await f.store.inspect(result.value.revisionDigest)).revisionDigest, result.value.revisionDigest);
      assert.deepEqual(await readFile(join(result.value.filesRoot, 'app.js')), Buffer.from('next'));
    }
  }
  assert.equal(digests.size, 1);
  assert.equal((await f.store.describe()).completedCount, 2);
  assert.equal((await f.store.describe()).pendingCount, 0);
  assert.deepEqual(await readFile(join(f.parent.filesRoot, 'app.js')), f.original);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace pending byte reservations block new revisions even when slots remain', async t => {
  const f = await fixture(t, { maxStoreBytes: 2048 });
  const initial = await f.store.describe();
  const pendingRoot = join(f.root, 'pending', '22222222-2222-4222-8222-222222222222');
  await mkdir(pendingRoot); await mkdir(join(pendingRoot, 'files'));
  const partial = Buffer.alloc(2048 - initial.storedBytes - 1, 1);
  await writeFile(join(pendingRoot, 'files', 'partial.bin'), partial);
  assert.equal((await f.store.describe()).storedBytes, 2047);
  await assert.rejects(f.store.revise({ parentDigest: f.parent.revisionDigest,
    changes: [{ path: 'app.js', expectedSha256: hash(f.original), bytes: Buffer.from('next') }] }), /stored bytes.*exhausted/);
  const observed = await f.store.describe();
  assert.equal(observed.completedCount, 1); assert.equal(observed.pendingCount, 1);
  assert.equal(observed.storedBytes, 2047);
  assert.deepEqual(await readFile(join(pendingRoot, 'files', 'partial.bin')), partial);
  assert.deepEqual(await readFile(join(f.parent.filesRoot, 'app.js')), f.original);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace incomplete completed destinations are preserved and cannot be overwritten by replay', async t => {
  const f = await fixture(t);
  // The exact test-owned file is removed nonrecursively to emulate interrupted state.
  assert.equal(f.parent.manifestPath, join(f.root, 'revisions', f.parent.revisionDigest, 'manifest.json'));
  await rm(f.parent.manifestPath);
  const reopened = await createWorkspaceRevisionStore({ root: f.root, limits: f.policy });
  await assert.rejects(reopened.inspect(f.parent.revisionDigest), /layout/);
  await assert.rejects(reopened.capture({ sourceRoot: f.sourceRoot, files: f.files }), /layout/);
  assert.deepEqual(await readdir(join(f.root, 'revisions', f.parent.revisionDigest)), ['files']);
  assert.deepEqual(await readdir(join(f.root, 'pending')), []);
  assert.deepEqual(await readFile(join(f.parent.filesRoot, 'app.js')), f.original);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});

test('workspace pending quota inventory rejects hard links, junctions and undeclared entries', async t => {
  for (const variant of ['hard-link', 'junction', 'unexpected']) {
    const f = await fixture(t);
    const staged = join(f.root, 'pending', '33333333-3333-4333-8333-333333333333');
    await mkdir(staged);
    if (variant === 'junction') await symlink(f.sourceRoot, join(staged, 'files'), 'junction');
    else {
      await mkdir(join(staged, 'files'));
      if (variant === 'hard-link') await link(join(f.sourceRoot, 'app.js'), join(staged, 'files', 'app.js'));
      else await writeFile(join(staged, 'unknown.txt'), 'preserve');
    }
    const reopened = await createWorkspaceRevisionStore({ root: f.root, limits: f.policy });
    await assert.rejects(reopened.describe(), /alias|hard link|layout/);
    await assert.rejects(reopened.inspect(f.parent.revisionDigest), /alias|hard link|layout/);
    assert.deepEqual(await readdir(join(f.root, 'pending')), ['33333333-3333-4333-8333-333333333333']);
    assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
    assert.deepEqual(await readFile(join(f.parent.filesRoot, 'app.js')), f.original);
    if (variant === 'unexpected') assert.equal(await readFile(join(staged, 'unknown.txt'), 'utf8'), 'preserve');
  }
});

test('workspace inspection rejects a digest-correct manifest with a non-string parent', async t => {
  const f = await fixture(t);
  const { revisionDigest: ignored, ...unsigned } = JSON.parse(await readFile(f.parent.manifestPath, 'utf8'));
  unsigned.parentDigest = [f.parent.revisionDigest];
  // This is a structurally invalid, but digest-correct, record. Hash validity alone
  // must not authorize its parent shape; no production verifier builds the oracle.
  const digest = hash(canonicalJson(unsigned));
  const destination = join(f.root, 'revisions', digest);
  await mkdir(destination); await mkdir(join(destination, 'files'));
  await writeFile(join(destination, 'files', 'app.js'), f.original);
  await writeFile(join(destination, 'files', 'asset.bin'), f.asset);
  await writeFile(join(destination, 'manifest.json'), `${canonicalJson({ ...unsigned, revisionDigest: digest })}\n`);
  await assert.rejects(f.store.inspect(digest), /parent|manifest/);
  assert.deepEqual(await readFile(join(f.sourceRoot, 'app.js')), f.original);
});
