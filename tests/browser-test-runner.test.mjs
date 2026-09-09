import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createWorkspaceRevisionStore } from '../src/workspace/revision-store.mjs';
import { compileBrowserTestSuite } from '../src/workspace/browser-test-contracts.mjs';

const api = await import('../src/workspace/browser-test-runner.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
test('browser workspace runner exposes a real host-issued runner, not an injected verifier', async () => {
  assert.equal(typeof api.createBrowserWorkspaceTestRunner, 'function', 'browser workspace runner is required');
  await assert.rejects(api.createBrowserWorkspaceTestRunner({ store: { inspect() {} }, runtime: {}, policy: {}, suites: [] }), /browser|workspace|clone/);
});

test('browser runner refuses unapproved requests and changed bytes before the physical spawn boundary', async t => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-browser-refusal-'));
  t.after(async () => {
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child.startsWith('godagent-browser-refusal-') && !child.includes('..') && !isAbsolute(child));
    await rm(root, { recursive: true, force: true });
  });
  const bin = join(root, 'runtime'), sourceRoot = join(root, 'source'), storeRoot = join(root, 'store');
  for (const path of [join(bin, 'lib'), sourceRoot, storeRoot]) await mkdir(path, { recursive: true });
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  async function file(path, content = 'not executable') {
    await writeFile(join(bin, path), content); return { path, bytes: Buffer.byteLength(content), sha256: hash(content) };
  }
  const driverFiles = [];
  for (const path of ['index.js', 'lib/bootstrap.js', 'lib/coreBundle.js', 'lib/utilsBundle.js']) driverFiles.push(await file(path));
  driverFiles.push(await file('package.json', '{"name":"playwright-core","version":"1.62.1"}'));
  const runtime = { node: { root: bin, version: '24.18.0', file: await file('node.exe') },
    driver: { root: bin, version: '1.62.1', entryPath: 'index.js', files: driverFiles },
    browser: { root: bin, version: '153.0.1.0', executable: await file('browser.exe'), engineFiles: [await file('engine.dll')] } };
  const storeConfig = { root: storeRoot, limits: { maxFiles: 1, maxFileBytes: 4096, maxTotalBytes: 4096, maxRevisions: 2, maxStoreBytes: 16384 } };
  const original = '<p>hello</p>'; await writeFile(join(sourceRoot, 'index.html'), original);
  const store = await createWorkspaceRevisionStore(storeConfig);
  const revision = await store.capture({ sourceRoot, files: [{ path: 'index.html', sha256: hash(original) }] });
  const suite = compileBrowserTestSuite({ schemaVersion: 1, testId: 'hello', entryPath: 'index.html',
    cases: [{ caseId: 'text', steps: [{ kind: 'assert-text', selector: 'p', text: 'hello' }] }] });
  const runner = await api.createBrowserWorkspaceTestRunner({ runtime, store: storeConfig, suites: [suite],
    policy: { schemaVersion: 1, profile: 'host-reviewed-browser-local-v1', approvedRevisionDigests: [revision.revisionDigest],
      limits: { maxFiles: 1, maxAppBytes: 4096, maxResultBytes: 4096, stepTimeoutMs: 1000, launchTimeoutMs: 2000, runTimeoutMs: 3000, cleanupTimeoutMs: 1000 } } });
  const originalSpawn = childProcess.spawn; let spawns = 0;
  childProcess.spawn = (...args) => { spawns++; return originalSpawn(...args); }; syncBuiltinESMExports();
  try {
    await assert.rejects(runner.run({ revisionDigest: '0'.repeat(64), testId: 'hello' }), /approved/);
    await assert.rejects(runner.run({ revisionDigest: revision.revisionDigest, testId: 'unknown' }), /owned/);
    await assert.rejects(runner.run({ revisionDigest: revision.revisionDigest, testId: 'hello', args: [] }), /fields/);
    await writeFile(join(revision.filesRoot, 'index.html'), '<p>other</p>');
    await assert.rejects(runner.run({ revisionDigest: revision.revisionDigest, testId: 'hello' }), /digest|size/);
    await writeFile(join(bin, 'lib/coreBundle.js'), 'changed bytes!');
    await assert.rejects(runner.run({ revisionDigest: revision.revisionDigest, testId: 'hello' }), /digest|size/);
    assert.equal(spawns, 0);
  } finally { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); }
});
