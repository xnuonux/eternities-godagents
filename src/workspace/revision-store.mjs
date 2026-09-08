import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, open, opendir, mkdir, rename } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

const PROTOCOL = 'eternities-workspace-revision-store-v1';
const REVISION = 'eternities-workspace-revision-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const MANIFEST_MAX = 128 * 1024;
const CAPS = { maxFiles: 64, maxFileBytes: 16777216, maxTotalBytes: 67108864,
  maxRevisions: 64, maxStoreBytes: 1073741824 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${canonicalJson(value)}\n`);
const identity = stat => `${stat.dev}:${stat.ino}`;
const pathIdentity = path => process.platform === 'win32' ? path.toLowerCase() : path;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
function exact(value, keys, name) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), `${name} fields are invalid`);
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function checkedPath(path) {
  requireValue(typeof path === 'string' && path.length > 0 && path === path.normalize('NFC')
    && Buffer.byteLength(path) <= 1024 && !/[\x00-\x1f\x7f<>:"\\|?*]/.test(path), 'workspace relative path is invalid');
  const segments = path.split('/');
  requireValue(segments.length <= 32 && segments.every(part => part && part !== '.' && part !== '..'
    && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(part.split('.')[0].trimEnd())),
  'workspace relative path has a forbidden segment');
  return path;
}
function checkedPaths(rows) {
  const seen = new Set();
  for (const row of rows) {
    checkedPath(row.path);
    const key = row.path.toLowerCase();
    requireValue(!seen.has(key), 'workspace paths collide'); seen.add(key);
  }
  for (const key of seen) {
    const parts = key.split('/');
    for (let n = 1; n < parts.length; n++) requireValue(!seen.has(parts.slice(0, n).join('/')), 'workspace file paths overlap');
  }
}
async function directory(path) {
  const stat = await lstat(path, { bigint: true });
  requireValue(stat.isDirectory() && !stat.isSymbolicLink() && stat.ino > 0n
    && pathIdentity(await realpath(path)) === pathIdentity(resolve(path)), 'workspace directory is an alias or invalid');
  return stat;
}
async function directoryNames(path, maximum) {
  const handle = await opendir(path, { bufferSize: Math.min(32, maximum + 1) });
  const names = [];
  try {
    for (let entry = await handle.read(); entry !== null; entry = await handle.read()) {
      names.push(entry.name);
      requireValue(names.length <= maximum, 'workspace directory entry limit exceeded');
    }
    return names;
  } finally { await handle.close(); }
}
async function fileBytes(path, maximum) {
  const before = await lstat(path, { bigint: true });
  requireValue(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.ino > 0n
    && before.size <= BigInt(maximum) && pathIdentity(await realpath(path)) === pathIdentity(resolve(path)),
  'workspace file type, alias, hard link or size is invalid');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    requireValue(identity(opened) === identity(before) && opened.nlink === 1n && opened.size === before.size,
      'workspace file identity changed before read');
    // Never let readFile allocate from a file that grew after the checked stat.
    // One extra byte detects growth; allocation and requested bytes stay bounded.
    const expectedSize = Number(before.size), buffer = Buffer.allocUnsafe(expectedSize + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
      requireValue(length <= expectedSize, 'workspace file bytes exceed checked size');
    }
    const bytes = Buffer.from(buffer.subarray(0, length));
    const after = await handle.stat({ bigint: true }), named = await lstat(path, { bigint: true });
    requireValue(identity(after) === identity(before) && identity(named) === identity(before)
      && after.nlink === 1n && named.nlink === 1n && after.size === before.size
      && after.mtimeNs === before.mtimeNs && bytes.length === Number(before.size), 'workspace file changed during read');
    return { bytes, identity: identity(after) };
  } finally { await handle.close(); }
}
async function jsonFile(path, maximum) {
  const { bytes } = await fileBytes(path, maximum);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const value = JSON.parse(text);
  requireValue(text === `${canonicalJson(value)}\n`, 'workspace record is not canonical');
  return value;
}
async function below(root, path) {
  checkedPath(path); await directory(root);
  const parts = path.split('/');
  for (let n = 1; n < parts.length; n++) await directory(join(root, ...parts.slice(0, n)));
  return join(root, ...parts);
}
async function writeExclusive(path, bytes) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
function overlaps(a, b) {
  const inside = (root, target) => { const rest = relative(root, target); return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest)); };
  return inside(a, b) || inside(b, a);
}

// Internal filesystem utility. This is neither an actor nor an authority issuer.
export async function createWorkspaceRevisionStore(input) {
  const options = structuredClone(input); exact(options, ['root', 'limits'], 'workspace store');
  exact(options.limits, Object.keys(CAPS), 'workspace limits');
  const limits = options.limits;
  for (const [name, ceiling] of Object.entries(CAPS)) requireValue(Number.isSafeInteger(limits[name])
    && limits[name] > 0 && limits[name] <= ceiling, `workspace ${name} limit is invalid`);
  requireValue(typeof options.root === 'string' && options.root.length > 0 && !/[\0\r\n]/.test(options.root), 'workspace root is invalid');
  const root = resolve(options.root), rootId = identity(await directory(root));
  const policy = { schemaVersion: 1, protocolId: PROTOCOL, limits }, storePolicyDigest = sha256Value(policy);
  const revisions = join(root, 'revisions'), pending = join(root, 'pending'), lockPath = join(root, 'store.lock');
  let openedAs;
  async function checkRoot() { requireValue(identity(await directory(root)) === rootId, 'workspace root identity changed'); }
  async function lock(work) {
    await checkRoot();
    try { await fileBytes(lockPath, 4096); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const owned = await acquireFileLock({ lockPath });
    try { await checkRoot(); return await work(); } finally { await owned.release(); }
  }
  async function checkPolicy() {
    await checkRoot();
    const names = (await directoryNames(root, 4)).sort();
    requireValue(canonicalJson(names) === canonicalJson(['pending', 'revisions', 'store.json', 'store.lock']), 'workspace store contains unrelated entries');
    requireValue(canonicalJson(await jsonFile(join(root, 'store.json'), 8192)) === canonicalJson(policy), 'workspace store policy changed');
    await directory(revisions); await directory(pending);
  }
  const names = await directoryNames(root, 4);
  requireValue(names.includes('store.json') || names.every(name => name === 'store.lock'), 'workspace root must be empty; unrelated data cannot be adopted');
  await lock(async () => {
    const current = await directoryNames(root, 4);
    if (!current.includes('store.json')) {
      requireValue(current.length === 1 && current[0] === 'store.lock', 'incomplete or unrelated workspace root cannot be adopted');
      await mkdir(revisions); await mkdir(pending);
      await writeExclusive(join(root, 'store.json'), jsonBytes(policy)); openedAs = 'created';
    } else openedAs = 'reopened';
    await checkPolicy();
  });

  async function payloadFiles(filesRoot, allowMissing = false, expectedDirectories = null) {
    try { await directory(filesRoot); } catch (error) { if (allowMissing && error.code === 'ENOENT') return []; throw error; }
    const files = [], ids = new Set(); let directoryCount = 0;
    async function visit(current, prefix) {
      for (const name of await directoryNames(current, limits.maxFiles)) {
        const path = prefix ? `${prefix}/${name}` : name; checkedPath(path);
        const target = join(current, name), stat = await lstat(target, { bigint: true });
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          requireValue(expectedDirectories === null || expectedDirectories.has(path), 'workspace has an unexpected directory');
          requireValue(++directoryCount <= limits.maxFiles * 32, 'workspace directory count exceeds limit');
          await directory(target); await visit(target, path);
        } else {
          requireValue(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.ino > 0n
            && stat.size <= BigInt(limits.maxFileBytes), 'workspace quota file type, hard link or size is invalid');
          requireValue(!ids.has(identity(stat)), 'workspace duplicate file identity'); ids.add(identity(stat));
          files.push({ path, bytes: Number(stat.size) });
          requireValue(files.length <= limits.maxFiles, 'workspace file count exceeds limit');
        }
      }
    }
    await visit(filesRoot, ''); checkedPaths(files);
    requireValue(files.reduce((n, row) => n + row.bytes, 0) <= limits.maxTotalBytes, 'workspace payload bytes exceed limit');
    return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  }
  async function accounting() {
    let completedCount = 0, pendingCount = 0, storedBytes = 0;
    for (const [base, complete] of [[revisions, true], [pending, false]]) {
      for (const name of await directoryNames(base, limits.maxRevisions)) {
        requireValue(complete ? DIGEST.test(name) : /^[a-f0-9-]{36}$/.test(name), 'workspace quota directory name is invalid');
        complete ? completedCount++ : pendingCount++;
        requireValue(completedCount + pendingCount <= limits.maxRevisions, 'workspace revision slots exceed limit');
        const dir = join(base, name); await directory(dir);
        const entries = await directoryNames(dir, 2);
        requireValue(entries.every(entry => ['files', 'manifest.json'].includes(entry))
          && (!complete || entries.length === 2), 'workspace revision directory layout is invalid');
        storedBytes += (await payloadFiles(join(dir, 'files'), !complete)).reduce((n, row) => n + row.bytes, 0);
        if (entries.includes('manifest.json')) storedBytes += (await fileBytes(join(dir, 'manifest.json'), MANIFEST_MAX)).bytes.length;
        requireValue(storedBytes <= limits.maxStoreBytes, 'workspace stored bytes exceed limit');
      }
    }
    return { completedCount, pendingCount, storedBytes };
  }
  async function verifyAt(dir, digest) {
    requireValue(DIGEST.test(digest), 'workspace revision digest is invalid'); await directory(dir);
    requireValue(canonicalJson((await directoryNames(dir, 2)).sort()) === canonicalJson(['files', 'manifest.json']), 'workspace revision directory layout is invalid');
    const manifestPath = join(dir, 'manifest.json'), value = await jsonFile(manifestPath, MANIFEST_MAX);
    exact(value, ['schemaVersion', 'protocolId', 'storePolicyDigest', 'parentDigest', 'files', 'totalBytes', 'revisionDigest'], 'workspace revision');
    const { revisionDigest, ...unsigned } = value;
    requireValue(value.schemaVersion === 1 && value.protocolId === REVISION && value.storePolicyDigest === storePolicyDigest
      && (value.parentDigest === null || DIGEST.test(value.parentDigest)) && revisionDigest === digest
      && sha256Value(unsigned) === digest, 'workspace manifest digest or policy mismatch');
    requireValue(Array.isArray(value.files) && value.files.length > 0 && value.files.length <= limits.maxFiles, 'workspace manifest file count is invalid');
    checkedPaths(value.files);
    const expectedDirectories = new Set();
    for (const row of value.files) {
      const parts = row.path.split('/');
      for (let n = 1; n < parts.length; n++) expectedDirectories.add(parts.slice(0, n).join('/'));
    }
    const filesRoot = join(dir, 'files'), actual = await payloadFiles(filesRoot, false, expectedDirectories);
    requireValue(canonicalJson(actual.map(row => row.path)) === canonicalJson(value.files.map(row => row.path)), 'workspace materialized file set differs');
    let total = 0; const ids = new Set();
    for (const row of value.files) {
      exact(row, ['path', 'sha256', 'bytes'], 'workspace file row');
      requireValue(DIGEST.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0, 'workspace file digest or bytes is invalid');
      const found = await fileBytes(await below(filesRoot, row.path), limits.maxFileBytes);
      requireValue(!ids.has(found.identity), 'workspace duplicate file identity'); ids.add(found.identity);
      requireValue(found.bytes.length === row.bytes && hash(found.bytes) === row.sha256, 'workspace file digest or size changed'); total += row.bytes;
    }
    requireValue(total === value.totalBytes && total <= limits.maxTotalBytes, 'workspace total bytes mismatch');
    return freeze({ revisionDigest, parentDigest: value.parentDigest, manifestPath, filesRoot,
      files: structuredClone(value.files), totalBytes: total });
  }
  async function publish(parentDigest, contents) {
    const files = contents.map(row => ({ path: row.path, sha256: hash(row.bytes), bytes: row.bytes.length }));
    const unsigned = { schemaVersion: 1, protocolId: REVISION, storePolicyDigest, parentDigest,
      files, totalBytes: files.reduce((n, row) => n + row.bytes, 0) };
    requireValue(unsigned.totalBytes <= limits.maxTotalBytes, 'workspace payload bytes exceed limit');
    const digest = sha256Value(unsigned), manifest = jsonBytes({ ...unsigned, revisionDigest: digest });
    requireValue(manifest.length <= MANIFEST_MAX, 'workspace manifest bytes exceed limit');
    const usage = await accounting(), destination = join(revisions, digest);
    try { await lstat(destination); return await verifyAt(destination, digest); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    requireValue(usage.completedCount + usage.pendingCount < limits.maxRevisions, 'workspace revision slots exhausted');
    requireValue(usage.storedBytes + unsigned.totalBytes + manifest.length <= limits.maxStoreBytes, 'workspace stored bytes exhausted');
    const staged = join(pending, randomUUID()); await mkdir(staged); await directory(staged);
    const filesRoot = join(staged, 'files'); await mkdir(filesRoot);
    for (const row of contents) {
      const parts = row.path.split('/');
      for (let n = 1; n < parts.length; n++) {
        const dir = join(filesRoot, ...parts.slice(0, n));
        try { await mkdir(dir); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        await directory(dir);
      }
      await writeExclusive(await below(filesRoot, row.path), row.bytes);
    }
    await writeExclusive(join(staged, 'manifest.json'), manifest); await verifyAt(staged, digest);
    await checkPolicy(); await directory(revisions); await directory(pending);
    await rename(staged, destination);
    return verifyAt(destination, digest);
  }
  async function operation(work) { return lock(async () => { await checkPolicy(); return work(); }); }
  return Object.freeze({
    async describe() { return operation(async () => freeze({ protocolId: PROTOCOL, storePolicyDigest,
      limits: structuredClone(limits), openedAs, ...await accounting() })); },
    async capture(input) {
      const request = structuredClone(input); exact(request, ['sourceRoot', 'files'], 'workspace capture');
      requireValue(typeof request.sourceRoot === 'string' && request.sourceRoot.length > 0, 'workspace source root is invalid');
      requireValue(Array.isArray(request.files) && request.files.length > 0 && request.files.length <= limits.maxFiles, 'workspace file count is invalid');
      for (const row of request.files) { exact(row, ['path', 'sha256'], 'workspace source row'); requireValue(DIGEST.test(row.sha256), 'workspace source digest is invalid'); }
      checkedPaths(request.files); request.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      const sourceRoot = resolve(request.sourceRoot); requireValue(!overlaps(root, sourceRoot), 'workspace source and store overlap');
      return operation(async () => {
        await directory(sourceRoot); const contents = [], ids = new Set(); let total = 0;
        for (const row of request.files) {
          const found = await fileBytes(await below(sourceRoot, row.path), limits.maxFileBytes);
          requireValue(!ids.has(found.identity), 'workspace duplicate source identity'); ids.add(found.identity);
          requireValue(hash(found.bytes) === row.sha256, 'workspace source preimage digest changed');
          total += found.bytes.length; requireValue(total <= limits.maxTotalBytes, 'workspace payload bytes exceed limit');
          contents.push({ path: row.path, bytes: found.bytes });
        }
        return publish(null, contents);
      });
    },
    async inspect(digest) {
      requireValue(typeof digest === 'string' && DIGEST.test(digest), 'workspace revision digest is invalid');
      return operation(async () => { await accounting(); return verifyAt(join(revisions, digest), digest); });
    },
    async read(input) {
      const request = structuredClone(input); exact(request, ['revisionDigest', 'path'], 'workspace read'); checkedPath(request.path);
      requireValue(DIGEST.test(request.revisionDigest), 'workspace revision digest is invalid');
      return operation(async () => {
        await accounting(); const revision = await verifyAt(join(revisions, request.revisionDigest), request.revisionDigest);
        const row = revision.files.find(row => row.path === request.path); requireValue(row, 'workspace path is not admitted');
        const found = await fileBytes(await below(revision.filesRoot, request.path), limits.maxFileBytes);
        requireValue(hash(found.bytes) === row.sha256, 'workspace read digest changed'); return new Uint8Array(found.bytes);
      });
    },
  });
}
