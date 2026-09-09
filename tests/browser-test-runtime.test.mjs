import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, link, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute, win32 } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

const api = await import('../src/workspace/browser-test-runtime.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-browser-pins-'));
  t.after(async () => {
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child.startsWith('godagent-browser-pins-') && !child.includes('..') && !isAbsolute(child));
    await rm(root, { recursive: true, force: true });
  });
  const nodeRoot = join(root, 'node'), driverRoot = join(root, 'driver'), browserRoot = join(root, 'browser');
  for (const path of [nodeRoot, join(driverRoot, 'lib'), join(browserRoot, '152.0.1.0')]) await mkdir(path, { recursive: true });
  async function pin(base, path, bytes = Buffer.from('not executable; never import this fixture')) {
    await writeFile(join(base, path), bytes);
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  }
  const files = [];
  for (const path of ['index.js', 'lib/bootstrap.js', 'lib/coreBundle.js', 'lib/utilsBundle.js']) files.push(await pin(driverRoot, path));
  files.push(await pin(driverRoot, 'package.json', Buffer.from('{"name":"playwright-core","version":"1.62.1"}')));
  const config = { node: { root: nodeRoot, version: '24.18.0', file: await pin(nodeRoot, 'node.exe') },
    driver: { root: driverRoot, version: '1.62.1', entryPath: 'index.js', files },
    browser: { root: browserRoot, version: '152.0.1.0', executable: await pin(browserRoot, 'msedge.exe'),
      engineFiles: [await pin(browserRoot, '152.0.1.0/msedge.dll')] } };
  return { root, config };
}

test('browser runtime preflight checks actual named bytes without importing executable-looking files', async t => {
  assert.equal(typeof api.verifyBrowserRuntimeFiles, 'function', 'static browser runtime preflight is required');
  const { config } = await fixture(t), original = structuredClone(config);
  const evidence = await api.verifyBrowserRuntimeFiles(config);
  assert.equal(evidence.runtimePinScope, 'named-driver-and-engine-files');
  assert.equal(evidence.checkedFileCount, 8);
  assert.equal(evidence.runtime.driver.version, '1.62.1');
  assert.ok(Object.isFrozen(evidence.runtime.browser.engineFiles[0]));
  assert.deepEqual(config, original);
  const target = join(config.driver.root, 'lib/coreBundle.js');
  const before = await readFile(target); before[0] ^= 1; await writeFile(target, before);
  await assert.rejects(api.verifyBrowserRuntimeFiles(config), /digest/);
});

test('browser runtime rejects hard links, directory aliases, traversal and mismatched metadata', async t => {
  assert.equal(typeof api.verifyBrowserRuntimeFiles, 'function', 'static browser runtime preflight is required');
  const { root, config } = await fixture(t);
  for (const mutate of [
    input => { input.driver.entryPath = 'other.js'; },
    input => { input.driver.files[0].path = '../outside.js'; },
    input => { input.driver.files[0].sha256 = ['a'.repeat(64)]; },
    input => { input.browser.engineFiles[0].bytes++; },
    input => { input.node.version = '22.0.0'; },
    input => { input.driver.version = '1.62.2'; },
    input => { input.driver.command = 'anything'; },
    input => { input.driver.files = input.driver.files.filter(row => row.path !== 'lib/bootstrap.js'); },
    input => { input.browser.engineFiles = []; },
  ]) {
    const changed = structuredClone(config); mutate(changed);
    await assert.rejects(api.verifyBrowserRuntimeFiles(changed), /runtime|browser|pin|digest|path|version|size|field/);
  }
  const alias = join(root, 'driver-alias');
  await symlink(config.driver.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const changed = structuredClone(config); changed.driver.root = alias;
  await assert.rejects(api.verifyBrowserRuntimeFiles(changed), /alias|directory/);
  await link(join(config.node.root, 'node.exe'), join(root, 'node-hardlink'));
  await assert.rejects(api.verifyBrowserRuntimeFiles(config), /link|type/);
});

test('browser worker environment drops ambient options and uses only fixed Windows system paths', () => {
  assert.equal(typeof api.buildBrowserWorkerEnvironment, 'function', 'scrubbed browser worker environment is required');
  const names = ['NODE_OPTIONS', 'PW_INSTRUMENT_MODULES', 'DEBUG', 'HTTPS_PROXY', 'GODAGENTS_TEST_SECRET', 'PATH'];
  const previous = names.map(name => [name, process.env[name]]);
  try {
    for (const name of names) process.env[name] = 'synthetic-untrusted-value';
    const environment = api.buildBrowserWorkerEnvironment({ systemRoot: 'C:\\Windows', tempRoot: 'C:\\runner-temp' });
    assert.deepEqual(environment, { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows',
      TEMP: 'C:\\runner-temp', TMP: 'C:\\runner-temp', PATH: win32.join('C:\\Windows', 'System32') });
    assert.ok(Object.isFrozen(environment));
    for (const input of [
      { systemRoot: 'relative', tempRoot: 'C:\\runner-temp' },
      { systemRoot: 'C:\\Windows;C:\\user-bin', tempRoot: 'C:\\runner-temp' },
      { systemRoot: 'C:\\Windows', tempRoot: 'C:\\runner-temp', NODE_OPTIONS: 'anything' },
    ]) assert.throws(() => api.buildBrowserWorkerEnvironment(input), /runtime|environment|path|field/);
  } finally {
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test('browser runtime preparation pins explicitly selected files and verifies the generated configuration', async t => {
  assert.equal(typeof api.prepareBrowserRuntimeConfig, 'function', 'browser runtime preparation is required');
  const { config } = await fixture(t);
  const selection = { node: { root: config.node.root, version: config.node.version, file: 'node.exe' },
    driver: { root: config.driver.root, version: config.driver.version, entryPath: 'index.js', files: config.driver.files.map(row => row.path) },
    browser: { root: config.browser.root, version: config.browser.version, executable: 'msedge.exe',
      engineFiles: ['152.0.1.0/msedge.dll'] } };
  const prepared = await api.prepareBrowserRuntimeConfig(selection);
  assert.equal(prepared.node.file.sha256, config.node.file.sha256);
  assert.equal(prepared.browser.engineFiles[0].bytes, config.browser.engineFiles[0].bytes);
  assert.equal((await api.verifyBrowserRuntimeFiles(prepared)).checkedFileCount, 8);
  selection.browser.engineFiles[0] = '../outside.dll';
  await assert.rejects(api.prepareBrowserRuntimeConfig(selection), /path/);
});

test('browser preparation CLI writes only a new explicit config and preserves existing output', async t => {
  const { root, config } = await fixture(t);
  const selection = { node: { root: config.node.root, version: config.node.version, file: 'node.exe' },
    driver: { root: config.driver.root, version: config.driver.version, entryPath: 'index.js', files: config.driver.files.map(row => row.path) },
    browser: { root: config.browser.root, version: config.browser.version, executable: 'msedge.exe', engineFiles: ['152.0.1.0/msedge.dll'] } };
  const inputPath = join(root, 'selection.json'), outputPath = join(root, 'runtime.json');
  await writeFile(inputPath, JSON.stringify(selection));
  const script = fileURLToPath(new URL('../scripts/prepare-browser-test-runtime.mjs', import.meta.url));
  const args = [script, '--selection', inputPath, '--output', outputPath];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(first.status, 0, `runtime preparation CLI failed: ${first.stderr}`);
  const bytes = await readFile(outputPath), result = JSON.parse(bytes);
  assert.equal(result.node.file.sha256, config.node.file.sha256);
  assert.equal(JSON.parse(first.stdout).checkedFileCount, 8);
  const second = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.notEqual(second.status, 0);
  assert.deepEqual(await readFile(outputPath), bytes);
});

test('browser pin reads stay chunk-bounded and reject file growth during the actual read', async t => {
  const { config } = await fixture(t), target = join(config.node.root, 'node.exe');
  const payload = Buffer.alloc(200000, 97); await writeFile(target, payload);
  config.node.file.bytes = payload.length; config.node.file.sha256 = hash(payload);
  const originalOpen = fsPromises.open; let reads = 0, maximumRequest = 0, grow = false;
  fsPromises.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (resolve(args[0]) === resolve(target)) {
      const originalRead = handle.read.bind(handle);
      handle.read = async (...readArgs) => {
        reads++; maximumRequest = Math.max(maximumRequest, readArgs[2]);
        const result = await originalRead(...readArgs);
        if (grow) { grow = false; await writeFile(target, Buffer.concat([payload, Buffer.from('extra')])); }
        return result;
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    await api.verifyBrowserRuntimeFiles(config);
    assert.ok(reads >= 4); assert.ok(maximumRequest <= 65536);
    grow = true;
    await assert.rejects(api.verifyBrowserRuntimeFiles(config), /grew|changed/);
  } finally { fsPromises.open = originalOpen; syncBuiltinESMExports(); }
});

test('browser runtime accepts exact chunk boundaries and rejects oversized package metadata', async t => {
  const { config } = await fixture(t);
  for (const length of [65535, 65536, 65537, 131072]) {
    const payload = Buffer.alloc(length, 97);
    await writeFile(join(config.node.root, config.node.file.path), payload);
    config.node.file.bytes = length; config.node.file.sha256 = hash(payload);
    assert.equal((await api.verifyBrowserRuntimeFiles(config)).runtime.node.file.bytes, length);
  }
  const metadata = config.driver.files.find(row => row.path === 'package.json');
  const base = '{"name":"playwright-core","version":"1.62.1"}';
  for (const length of [65536, 65537]) {
    const bytes = Buffer.from(base.padEnd(length, ' '));
    await writeFile(join(config.driver.root, 'package.json'), bytes);
    metadata.bytes = bytes.length; metadata.sha256 = hash(bytes);
    if (length === 65536) assert.equal((await api.verifyBrowserRuntimeFiles(config)).runtime.driver.version, '1.62.1');
    else await assert.rejects(api.verifyBrowserRuntimeFiles(config), /metadata size/);
  }
});
