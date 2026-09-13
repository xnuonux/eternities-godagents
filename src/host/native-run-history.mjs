import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const fail = code => { throw new Error(`native-run-history:${code}`); };
const DIGEST = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const COMMANDS = new Set(['launch', 'resume']);
const CATEGORY = /^(native-operator|native-pi|native-host|native-session-report|native-godskills):[a-z0-9-]{1,80}$/u;
const USAGE_FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'];
const MAX_RUNS = 1000;
const MAX_BYTES = 1024 * 1024;

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const iso = value => typeof value === 'string' && ISO.test(value) && new Date(value).toISOString() === value;
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const samePath = (left, right) => {
  const a = resolve(left), b = resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
};
const emptyUsage = () => Object.fromEntries(USAGE_FIELDS.map(field => [field, 0]));
const unknownUsage = () => Object.fromEntries(USAGE_FIELDS.map(field => [field, null]));

async function assertDirectory(path, root) {
  let stats;
  try { stats = await lstat(path); } catch { fail('unsafe-path'); }
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail('unsafe-path');
  const canonical = await realpath(path);
  if (root && !samePath(canonical, path) && !canonicalIsInside(root, canonical)) fail('unsafe-path');
  return canonical;
}

function canonicalIsInside(root, target) {
  const prefix = process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root);
  const value = process.platform === 'win32' ? resolve(target).toLowerCase() : resolve(target);
  const sep = prefix.endsWith('\\') || prefix.endsWith('/') ? '' : (prefix.includes('\\') ? '\\' : '/');
  return value.startsWith(prefix + (sep || '/')) || value.startsWith(prefix + '\\') || value.startsWith(prefix + '/');
}

async function readJson(expectedPath, root) {
  let stats;
  try { stats = await lstat(expectedPath); } catch { fail('record-invalid'); }
  if (stats.isSymbolicLink() || !stats.isFile()) fail('unsafe-path');
  if (stats.size > MAX_BYTES) fail('record-too-large');
  const canonical = await realpath(expectedPath);
  if (!samePath(canonical, expectedPath) || !canonicalIsInside(root, canonical)) fail('unsafe-path');
  try {
    const value = JSON.parse(await readFile(expectedPath, 'utf8'));
    if (!object(value)) fail('record-invalid');
    return value;
  } catch (error) {
    if (error?.message?.startsWith('native-run-history:')) throw error;
    fail('record-invalid');
  }
}

function usageFrom(result) {
  if (!Object.hasOwn(result, 'usage') || result.usage == null) return unknownUsage();
  if (!object(result.usage)) fail('usage');
  const values = {};
  for (const field of USAGE_FIELDS) {
    if (!Object.hasOwn(result.usage, field) || result.usage[field] == null) values[field] = null;
    else if (finite(result.usage[field])) values[field] = result.usage[field];
    else fail('usage');
  }
  return values;
}

function recorded(status, runId, startedAt, finishedAt, category) {
  const entry = { runId, status, startedAt, finishedAt };
  if (status === 'failed') entry.category = category;
  return entry;
}

export async function readNativeRunHistory({ sessionRoot, expectedSessionId, expectedConfigDigest } = {}) {
  if (!text(sessionRoot) || !isAbsolute(sessionRoot)) fail('session-root');
  if (!text(expectedSessionId)) fail('session-id');
  if (!DIGEST.test(expectedConfigDigest ?? '')) fail('config-pin');

  const root = await assertDirectory(resolve(sessionRoot));
  const runsPath = join(root, 'runs');
  let runEntries;
  try {
    const runsStats = await lstat(runsPath);
    if (runsStats.isSymbolicLink() || !runsStats.isDirectory()) fail('unsafe-path');
    const canonicalRuns = await realpath(runsPath);
    if (!samePath(canonicalRuns, runsPath) && !canonicalIsInside(root, canonicalRuns)) fail('unsafe-path');
    runEntries = await readdir(runsPath, { withFileTypes: true });
  } catch (error) {
    if (error?.message?.startsWith('native-run-history:')) throw error;
    if (error?.code === 'ENOENT') {
      return { status: 'recorded-history', entries: [], counts: { settled: 0, failed: 0, incomplete: 0 }, usage: emptyUsage() };
    }
    fail('session-root');
  }
  if (runEntries.length > MAX_RUNS) fail('too-many-runs');

  const records = [];
  for (const dirent of runEntries) {
    const runId = dirent.name;
    if (!UUID.test(runId)) fail('record-invalid');
    if (dirent.isSymbolicLink() || !dirent.isDirectory()) fail('unsafe-path');
    const runPath = join(runsPath, runId);
    const canonicalRun = await assertDirectory(runPath, root);
    if (!samePath(canonicalRun, runPath)) fail('unsafe-path');

    const started = await readJson(join(runPath, 'started.json'), root);
    if (started.schemaVersion !== 1) fail('record-invalid');
    if (!COMMANDS.has(started.command)) fail('command');
    if (!iso(started.startedAt)) fail('timestamp');
    if (started.sessionId !== expectedSessionId || started.configDigest !== expectedConfigDigest) fail('binding');

    const resultPath = join(runPath, 'result.json');
    let resultStats;
    try { resultStats = await lstat(resultPath); } catch (error) {
      if (error?.code === 'ENOENT') {
        records.push({ entry: recorded('incomplete', runId, started.startedAt, null), usage: unknownUsage(), incomplete: true });
        continue;
      }
      fail('record-invalid');
    }
    if (resultStats.isSymbolicLink() || !resultStats.isFile()) fail('unsafe-path');
    const result = await readJson(resultPath, root);
    if (result.status !== 'native-turn-settled' && result.status !== 'failed') fail('status');
    if (!iso(result.finishedAt)) fail('timestamp');
    if (result.startedAt !== undefined && result.startedAt !== started.startedAt) fail('timestamp');
    if (result.state != null) {
      if (!object(result.state)) fail('record-invalid');
      if (Object.hasOwn(result.state, 'sessionId') && result.state.sessionId !== expectedSessionId) fail('binding');
    }
    if (result.status === 'failed' && !CATEGORY.test(result.category ?? '')) fail('category');
    records.push({
      entry: recorded(result.status, runId, started.startedAt, result.finishedAt, result.category),
      usage: usageFrom(result),
      incomplete: false,
    });
  }

  records.sort((a, b) => {
    if (a.entry.startedAt < b.entry.startedAt) return -1;
    if (a.entry.startedAt > b.entry.startedAt) return 1;
    if (a.entry.runId < b.entry.runId) return -1;
    if (a.entry.runId > b.entry.runId) return 1;
    return 0;
  });

  const counts = { settled: 0, failed: 0, incomplete: 0 };
  const usage = emptyUsage();
  let incomplete = false;
  for (const record of records) {
    if (record.entry.status === 'native-turn-settled') counts.settled++;
    else if (record.entry.status === 'failed') counts.failed++;
    else { counts.incomplete++; incomplete = true; }
  }
  if (incomplete) {
    for (const field of USAGE_FIELDS) usage[field] = null;
  } else {
    for (const record of records) {
      for (const field of USAGE_FIELDS) {
        if (usage[field] === null) continue;
        const value = record.usage[field];
        if (value == null || !finite(value) || !finite(usage[field] + value)) usage[field] = null;
        else usage[field] += value;
      }
    }
  }

  return {
    status: 'recorded-history',
    entries: records.map(record => record.entry),
    counts,
    usage,
  };
}
