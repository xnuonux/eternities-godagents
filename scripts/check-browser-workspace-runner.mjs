import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createWorkspaceRevisionStore } from '../src/workspace/revision-store.mjs';
import { compileBrowserTestSuite } from '../src/workspace/browser-test-contracts.mjs';

const api = await import('../src/workspace/browser-test-runner.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
assert.equal(typeof api.createBrowserWorkspaceTestRunner, 'function', 'real browser runner is required');
const args = process.argv.slice(2);
assert.ok((args.length === 4 || args.length === 6 && args[4] === '--mode' && args[5] === 'launch-failure')
  && args[0] === '--runtime' && args[2] === '--output-root', 'explicit runtime and output root required');
const runtime = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
const launchFailure = args[5] === 'launch-failure';
if (launchFailure) {
  // Controlled first-party negative case: the verified Node executable rejects
  // Chromium flags. No arbitrary project command or executable is supplied.
  // Use the real driver file as the second named pin; root-relative paths stay explicit.
  const { relative } = await import('node:path');
  const root = resolve(runtime.node.root, '..', '..');
  runtime.browser.root = root;
  runtime.browser.executable = { ...runtime.node.file, path: relative(root, join(runtime.node.root, runtime.node.file.path)).replaceAll('\\', '/') };
  runtime.browser.engineFiles = [{ ...runtime.driver.files[0], path: relative(root, join(runtime.driver.root, runtime.driver.files[0].path)).replaceAll('\\', '/') }];
}
const root = await mkdtemp(join(resolve(args[3]), 'qualification-'));
const source = join(root, 'source'), storeRoot = join(root, 'store'); await mkdir(source); await mkdir(storeRoot);
const fixture = new URL('../tests/fixtures/browser-workspace/', import.meta.url);
const brokenBytes = await readFile(new URL('broken.html', fixture)), fixedBytes = await readFile(new URL('fixed.html', fixture));
const suiteBytes = await readFile(new URL('suite.json', fixture));
const hash = value => createHash('sha256').update(value).digest('hex');
await writeFile(join(source, 'index.html'), brokenBytes);
const storeConfig = { root: storeRoot, limits: { maxFiles: 4, maxFileBytes: 65536, maxTotalBytes: 131072,
  maxRevisions: 4, maxStoreBytes: 1048576 } };
const store = await createWorkspaceRevisionStore(storeConfig);
const broken = await store.capture({ sourceRoot: source, files: [{ path: 'index.html', sha256: hash(brokenBytes) }] });
const fixed = await store.revise({ parentDigest: broken.revisionDigest,
  changes: [{ path: 'index.html', expectedSha256: hash(brokenBytes), bytes: fixedBytes }] });
const suite = compileBrowserTestSuite(JSON.parse(suiteBytes));
const runner = await api.createBrowserWorkspaceTestRunner({ store: storeConfig, runtime, suites: [suite],
  policy: { schemaVersion: 1, profile: 'host-reviewed-browser-local-v1', approvedRevisionDigests: [broken.revisionDigest, fixed.revisionDigest],
    limits: { maxFiles: 4, maxAppBytes: 131072, maxResultBytes: 16384, stepTimeoutMs: 3000,
      launchTimeoutMs: 10000, runTimeoutMs: 30000, cleanupTimeoutMs: 10000 } } });
const results = [];
for (const [name, revision, expected] of launchFailure ? [['launch-failure', broken, 'uncertain']] : [['broken', broken, 'failed'], ['fixed', fixed, 'passed']]) {
  const result = await runner.run({ revisionDigest: revision.revisionDigest, testId: suite.testId });
  await writeFile(join(root, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  results.push({ name, revisionDigest: revision.revisionDigest, outcome: result.outcome });
  process.stdout.write(`${JSON.stringify({ name, outcome: result.outcome, root })}\n`);
  assert.equal(result.outcome, expected, `${name} actual browser outcome differs`);
  assert.equal(result.cleanup.confirmed, !launchFailure);
}
assert.deepEqual(await readFile(join(source, 'index.html')), brokenBytes);
assert.deepEqual(Buffer.from(await store.read({ revisionDigest: broken.revisionDigest, path: 'index.html' })), brokenBytes);
assert.deepEqual(await readFile(new URL('suite.json', fixture)), suiteBytes);
await writeFile(join(root, 'summary.json'), `${JSON.stringify({ results, descriptor: runner.describe(),
  originalSha256: hash(brokenBytes), fixedSha256: hash(fixedBytes), suiteSha256: hash(suiteBytes),
  originalUnchanged: true, parentUnchanged: true, suiteUnchanged: true, liveModelQualityClaim: false }, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ verified: true, root })}\n`);
