import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, open } from 'node:fs/promises';
import { join, resolve, isAbsolute, win32 } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';

const REQUIRED_DRIVER_FILES = ['index.js', 'lib/bootstrap.js', 'lib/coreBundle.js', 'lib/utilsBundle.js', 'package.json'];
const requireValue = (condition, message) => { if (!condition) throw new TypeError(`browser runtime ${message}`); };
const identity = stat => `${stat.dev}:${stat.ino}`;
const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
function exact(value, keys) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), 'fields are invalid');
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function relativePath(value) {
  requireValue(typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 1024
    && value === value.normalize('NFC') && !/[\x00-\x1f\x7f<>:"\\|?*]/.test(value), 'relative path is invalid');
  const parts = value.split('/');
  requireValue(parts.length <= 32 && parts.every(part => part && part !== '.' && part !== '..'
    && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(part.split('.')[0].trimEnd())),
  'relative path has a forbidden segment');
}
function rows(value) {
  requireValue(Array.isArray(value), 'file pins are invalid');
  const names = new Set();
  for (const row of value) {
    exact(row, ['path', 'bytes', 'sha256']); relativePath(row.path);
    requireValue(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 1073741824, 'pin size exceeds limit');
    requireValue(typeof row.sha256 === 'string' && /^[a-f0-9]{64}$/.test(row.sha256), 'pin digest is invalid');
    const key = row.path.toLowerCase(); requireValue(!names.has(key), 'pin paths collide'); names.add(key);
  }
}
function version(value, count) {
  requireValue(typeof value === 'string' && value.length <= 64
    && new RegExp(`^(0|[1-9][0-9]{0,8})(\\.(0|[1-9][0-9]{0,8})){${count - 1}}$`).test(value), 'version is invalid');
}
function validate(config) {
  exact(config, ['node', 'driver', 'browser']);
  exact(config.node, ['root', 'version', 'file']);
  exact(config.driver, ['root', 'version', 'entryPath', 'files']);
  exact(config.browser, ['root', 'version', 'executable', 'engineFiles']);
  for (const part of Object.values(config)) requireValue(typeof part.root === 'string' && isAbsolute(part.root)
    && !/[\x00-\x1f\x7f]/.test(part.root), 'absolute root path is invalid');
  version(config.node.version, 3); version(config.driver.version, 3); version(config.browser.version, 4);
  requireValue(Number(config.node.version.split('.')[0]) >= 24, 'node version is unsupported');
  requireValue(Array.isArray(config.driver.files) && Array.isArray(config.browser.engineFiles)
    && config.browser.engineFiles.length > 0 && config.driver.files.length + config.browser.engineFiles.length + 2 <= 32,
  'file pin count exceeds limit');
  rows([config.node.file]); rows(config.driver.files); rows([config.browser.executable, ...config.browser.engineFiles]);
  requireValue(config.driver.entryPath === 'index.js' && REQUIRED_DRIVER_FILES.every(path => config.driver.files.some(row => row.path === path)),
    'required driver entry or pin is missing');
}
async function directory(path) {
  const stat = await lstat(path, { bigint: true });
  requireValue(stat.isDirectory() && !stat.isSymbolicLink() && stat.ino > 0n
    && pathKey(await realpath(path)) === pathKey(resolve(path)), 'directory is invalid or an alias');
  return stat;
}
async function pinnedFile(root, row, capture = false, verifyDigest = true) {
  const parts = row.path.split('/');
  for (let n = 1; n < parts.length; n++) await directory(join(root, ...parts.slice(0, n)));
  const path = join(root, ...parts), before = await lstat(path, { bigint: true });
  requireValue(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.ino > 0n
    && before.size === BigInt(row.bytes) && pathKey(await realpath(path)) === pathKey(resolve(path)),
  'file type, link, alias or pinned size is invalid');
  requireValue(!capture || row.bytes <= 65536, 'metadata size exceeds limit');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    requireValue(identity(opened) === identity(before) && opened.nlink === 1n && opened.size === before.size,
      'file identity or size changed before read');
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(65536), chunks = []; let length = 0;
    while (true) {
      const request = Math.min(buffer.length, row.bytes - length + 1);
      const { bytesRead } = await handle.read(buffer, 0, request, length);
      if (bytesRead === 0) break;
      length += bytesRead; requireValue(length <= row.bytes, 'file grew beyond pinned size');
      const chunk = buffer.subarray(0, bytesRead); hash.update(chunk); if (capture) chunks.push(Buffer.from(chunk));
    }
    const after = await handle.stat({ bigint: true }), named = await lstat(path, { bigint: true });
    requireValue(after.isFile() && named.isFile() && !named.isSymbolicLink()
      && identity(after) === identity(before) && identity(named) === identity(before)
      && after.nlink === 1n && named.nlink === 1n && after.size === before.size && named.size === before.size
      && after.mtimeNs === before.mtimeNs && after.ctimeNs === before.ctimeNs
      && named.mtimeNs === before.mtimeNs && named.ctimeNs === before.ctimeNs && length === row.bytes
      && pathKey(await realpath(path)) === pathKey(resolve(path)), 'file changed during pinned read');
    const sha256 = hash.digest('hex');
    requireValue(!verifyDigest || sha256 === row.sha256, 'file digest mismatch');
    return { sha256, content: capture ? Buffer.concat(chunks) : null };
  } finally { await handle.close(); }
}

// Read-only consistency check of the named files. Version declarations for native
// executables are host metadata here; worker launch must check actual versions.
export async function verifyBrowserRuntimeFiles(input) {
  const config = structuredClone(input); validate(config);
  const roots = [];
  for (const part of Object.values(config)) {
    part.root = resolve(part.root); roots.push([part.root, identity(await directory(part.root))]);
  }
  await pinnedFile(config.node.root, config.node.file);
  for (const row of config.driver.files) {
    const { content: metadata } = await pinnedFile(config.driver.root, row, row.path === 'package.json');
    if (metadata) {
      const declared = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadata));
      requireValue(declared.name === 'playwright-core' && declared.version === config.driver.version, 'driver package version mismatch');
    }
  }
  for (const row of [config.browser.executable, ...config.browser.engineFiles]) await pinnedFile(config.browser.root, row);
  for (const [root, id] of roots) requireValue(identity(await directory(root)) === id, 'installation root changed during verification');
  const compare = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  config.driver.files.sort(compare); config.browser.engineFiles.sort(compare);
  return freeze({ runtimePinScope: 'named-driver-and-engine-files', runtime: config,
    checkedFileCount: config.driver.files.length + config.browser.engineFiles.length + 2,
    runtimeDigest: sha256Value(config) });
}

// Explicit operator preparation only. Observed bytes become proposed pins, then
// the ordinary verifier checks them again. No dependency is imported or executed.
export async function prepareBrowserRuntimeConfig(input) {
  const selection = structuredClone(input);
  exact(selection, ['node', 'driver', 'browser']);
  exact(selection.node, ['root', 'version', 'file']);
  exact(selection.driver, ['root', 'version', 'entryPath', 'files']);
  exact(selection.browser, ['root', 'version', 'executable', 'engineFiles']);
  requireValue(Array.isArray(selection.driver.files) && Array.isArray(selection.browser.engineFiles), 'selected file paths are invalid');
  const pending = path => ({ path, bytes: 1, sha256: '0'.repeat(64) });
  const config = { node: { ...selection.node, file: pending(selection.node.file) },
    driver: { ...selection.driver, files: selection.driver.files.map(pending) },
    browser: { ...selection.browser, executable: pending(selection.browser.executable), engineFiles: selection.browser.engineFiles.map(pending) } };
  validate(config);
  const groups = [[config.node.root, [config.node.file]], [config.driver.root, config.driver.files],
    [config.browser.root, [config.browser.executable, ...config.browser.engineFiles]]];
  for (const [root, files] of groups) {
    await directory(root);
    for (const row of files) {
      const stat = await lstat(join(root, ...row.path.split('/')), { bigint: true });
      requireValue(stat.size > 0n && stat.size <= 1073741824n, 'selected file size exceeds limit');
      row.bytes = Number(stat.size);
      row.sha256 = (await pinnedFile(root, row, false, false)).sha256;
    }
  }
  return (await verifyBrowserRuntimeFiles(config)).runtime;
}

export function buildBrowserWorkerEnvironment(input) {
  exact(input, ['systemRoot', 'tempRoot']);
  for (const path of Object.values(input)) requireValue(typeof path === 'string' && /^[A-Za-z]:\\/.test(path)
    && !/[\x00-\x1f\x7f;"<>|?*]/.test(path) && win32.normalize(path) === path, 'environment path is invalid');
  return Object.freeze({ SystemRoot: input.systemRoot, WINDIR: input.systemRoot,
    TEMP: input.tempRoot, TMP: input.tempRoot, PATH: win32.join(input.systemRoot, 'System32'),
    SYSTEMDRIVE: input.systemRoot.slice(0, 2), HOMEDRIVE: input.tempRoot.slice(0, 2), HOMEPATH: input.tempRoot.slice(2),
    USERPROFILE: input.tempRoot, USERNAME: 'godagent', USERDOMAIN: 'godagent', LOGONSERVER: 'local',
    LOCALAPPDATA: win32.join(input.tempRoot, 'AppData', 'Local'), APPDATA: win32.join(input.tempRoot, 'AppData', 'Roaming') });
}
