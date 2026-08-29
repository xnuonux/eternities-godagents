import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

const zeroDigest = '0'.repeat(64);
const keelIdPattern = /^keel-[a-f0-9]{64}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

function assertKeelId(keelId) {
  if (typeof keelId !== 'string' || !keelIdPattern.test(keelId)) {
    throw new IntegrityError('invalid keelId');
  }
}

function assertDigest(label, value) {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new IntegrityError(`invalid ${label}`);
  }
}

function assertInstanceId(instanceId) {
  if (typeof instanceId !== 'string'
      || !identifierPattern.test(instanceId)
      || instanceId === '.'
      || instanceId === '..'
      || instanceId.includes('/')
      || instanceId.includes('\\')) {
    throw new IntegrityError('invalid instanceId');
  }
}

async function readText(path, absent = null) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return absent;
    throw error;
  }
}

async function readCanonicalJson(path, label, absent = null) {
  const text = await readText(path, absent);
  if (text === absent) return absent;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new IntegrityError(`${label} is not valid JSON`);
  }
  if (text !== jsonBytes(value)) throw new IntegrityError(`${label} is not canonical`);
  return value;
}

async function atomicJson(path, value) {
  const temporary = `${path}.writing`;
  await writeFile(temporary, jsonBytes(value), { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, path);
}

function stateValue({ status, genesisId, reasonDigest = null }) {
  const unsigned = { schemaVersion: 1, status, genesisId, reasonDigest };
  return { ...unsigned, stateDigest: sha256Value(unsigned) };
}

function verifyState(state, expectedGenesisId) {
  if (!state || state.schemaVersion !== 1 || !['active', 'quarantined'].includes(state.status)) {
    throw new IntegrityError('keel namespace state is invalid');
  }
  if (state.genesisId !== expectedGenesisId) throw new IntegrityError('keel namespace state identity mismatch');
  if (state.reasonDigest !== null) assertDigest('quarantine reason digest', state.reasonDigest);
  const { stateDigest, ...unsigned } = state;
  if (stateDigest !== sha256Value(unsigned)) throw new IntegrityError('keel namespace state digest mismatch');
  return state;
}

function recordValue({ sequence, previousDigest, kind, payload, recordedAt }) {
  const unsigned = { schemaVersion: 1, sequence, previousDigest, kind, payload, recordedAt };
  const record = { ...unsigned, contentDigest: sha256Value(unsigned) };
  assertSchema('keel-record', record);
  return record;
}

async function readVerifiedChain(path) {
  const text = await readText(path, '');
  if (text === '') return [];
  if (!text.endsWith('\n')) throw new IntegrityError('incomplete keel record');
  const records = [];
  let previousDigest = zeroDigest;
  for (const [index, line] of text.slice(0, -1).split('\n').entries()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new IntegrityError(`keel record ${index + 1} is not valid JSON`);
    }
    if (line !== canonicalJson(record)) throw new IntegrityError(`keel record ${index + 1} is not canonical`);
    assertSchema('keel-record', record);
    if (record.sequence !== index + 1) throw new IntegrityError(`keel sequence mismatch at ${index + 1}`);
    if (record.previousDigest !== previousDigest) throw new IntegrityError(`keel previous digest mismatch at ${index + 1}`);
    const { contentDigest, ...unsigned } = record;
    if (contentDigest !== sha256Value(unsigned)) throw new IntegrityError(`keel digest mismatch at ${index + 1}`);
    records.push(record);
    previousDigest = contentDigest;
  }
  return records;
}

async function appendRecord(path, record) {
  const handle = await open(path, 'a');
  try {
    await handle.write(`${canonicalJson(record)}\n`, null, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function createLocalKeelBackend({ root, clock = () => new Date().toISOString() }) {
  if (typeof root !== 'string' || root.length === 0) throw new TypeError('keel backend root is required');
  if (typeof clock !== 'function') throw new TypeError('keel backend clock is required');
  const resolvedRoot = resolve(root);
  const ownershipLockPath = resolve(resolvedRoot, '.ownership.lock');

  function namespacePaths(keelId) {
    assertKeelId(keelId);
    const directory = resolve(resolvedRoot, keelId);
    if (directory !== `${resolvedRoot}\\${keelId}` && directory !== `${resolvedRoot}/${keelId}`) {
      throw new IntegrityError('keel namespace escaped backend root');
    }
    return {
      directory,
      identity: resolve(directory, 'identity.json'),
      chain: resolve(directory, 'chain.jsonl'),
      state: resolve(directory, 'state.json'),
      lock: resolve(directory, '.lock'),
    };
  }

  async function acquire(paths) {
    await mkdir(paths.directory, { recursive: true });
    return acquireFileLock({ lockPath: paths.lock });
  }

  async function underLock(paths, operation) {
    const lock = await acquire(paths);
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  async function underOwnershipLock(operation) {
    await mkdir(resolvedRoot, { recursive: true });
    const lock = await acquireFileLock({ lockPath: ownershipLockPath });
    try {
      return await operation();
    } finally {
      await lock.release();
    }
  }

  async function assertInstanceOwnership(instanceId, requestedKeelId) {
    const entries = await readdir(resolvedRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !keelIdPattern.test(entry.name) || entry.name === requestedKeelId) continue;
      const otherIdentityPath = resolve(resolvedRoot, entry.name, 'identity.json');
      const identity = await readCanonicalJson(otherIdentityPath, 'keel identity');
      if (identity?.instanceId === instanceId) {
        throw new IntegrityError('persistent instance already owns another keel');
      }
    }
  }

  async function readIdentity(paths) {
    const identity = await readCanonicalJson(paths.identity, 'keel identity');
    if (!identity) throw new IntegrityError('keel namespace does not exist');
    const expected = {
      schemaVersion: 1,
      keelId: identity.keelId,
      instanceId: identity.instanceId,
      genesisId: identity.genesisId,
      bedrockDigest: identity.bedrockDigest,
    };
    if (canonicalJson(identity) !== canonicalJson(expected)) throw new IntegrityError('keel identity shape is invalid');
    assertKeelId(identity.keelId);
    assertInstanceId(identity.instanceId);
    assertDigest('genesisId', identity.genesisId);
    assertDigest('bedrockDigest', identity.bedrockDigest);
    return identity;
  }

  async function inspectNamespace({ keelId }) {
    const paths = namespacePaths(keelId);
    const identity = await readIdentity(paths);
    if (identity.keelId !== keelId) throw new IntegrityError('keel identity path mismatch');
    const state = verifyState(await readCanonicalJson(paths.state, 'keel state'), identity.genesisId);
    const records = await readVerifiedChain(paths.chain);
    if (records.length < 1 || records[0].kind !== 'bedrock') throw new IntegrityError('keel bedrock is missing');
    if (records[0].contentDigest !== identity.bedrockDigest) throw new IntegrityError('keel bedrock digest mismatch');
    if (records[0].payload.genesisId !== identity.genesisId
        || records[0].payload.instanceId !== identity.instanceId) {
      throw new IntegrityError('keel bedrock identity mismatch');
    }
    return Object.freeze({
      keelId,
      instanceId: identity.instanceId,
      genesisId: identity.genesisId,
      status: state.status,
      stateDigest: state.stateDigest,
      recordCount: records.length,
      headDigest: records.at(-1).contentDigest,
      records: structuredClone(records),
    });
  }

  async function prepareNamespace({ keelId, instanceId, genesisId, bedrock }) {
    const paths = namespacePaths(keelId);
    assertInstanceId(instanceId);
    assertDigest('genesisId', genesisId);
    if (!bedrock || typeof bedrock !== 'object' || Array.isArray(bedrock)) {
      throw new IntegrityError('keel bedrock payload is required');
    }
    if (bedrock.genesisId !== genesisId || bedrock.instanceId !== instanceId) {
      throw new IntegrityError('keel identity collision: bedrock identity mismatch');
    }
    return underOwnershipLock(async () => underLock(paths, async () => {
      await assertInstanceOwnership(instanceId, keelId);
      const existing = await readCanonicalJson(paths.identity, 'keel identity');
      if (existing) {
        const inspected = await inspectNamespace({ keelId });
        if (inspected.instanceId !== instanceId
            || inspected.genesisId !== genesisId
            || canonicalJson(inspected.records[0].payload) !== canonicalJson(bedrock)) {
          throw new IntegrityError('keel identity collision');
        }
        return inspected;
      }

      const first = recordValue({
        sequence: 1,
        previousDigest: zeroDigest,
        kind: 'bedrock',
        payload: structuredClone(bedrock),
        recordedAt: clock(),
      });
      const identity = { schemaVersion: 1, keelId, instanceId, genesisId, bedrockDigest: first.contentDigest };
      await Promise.all([
        rm(paths.chain, { force: true }),
        rm(paths.state, { force: true }),
        rm(`${paths.identity}.writing`, { force: true }),
        rm(`${paths.state}.writing`, { force: true }),
      ]);
      await writeFile(paths.chain, `${canonicalJson(first)}\n`, { encoding: 'utf8', flag: 'wx' });
      await atomicJson(paths.state, stateValue({ status: 'active', genesisId }));
      await atomicJson(paths.identity, identity);
      return inspectNamespace({ keelId });
    }));
  }

  async function appendGenesis({ keelId, genesisId, rows }) {
    const paths = namespacePaths(keelId);
    assertDigest('genesisId', genesisId);
    if (!Array.isArray(rows) || rows.length === 0) throw new IntegrityError('genesis rows are required');
    return underLock(paths, async () => {
      const before = await inspectNamespace({ keelId });
      if (before.status === 'quarantined') throw new IntegrityError('keel namespace is quarantined');
      if (before.genesisId !== genesisId) throw new IntegrityError('genesis identity collision');

      const existingRows = before.records.slice(1);
      for (let index = 0; index < existingRows.length; index += 1) {
        const requested = rows[index];
        if (!requested
            || existingRows[index].kind !== requested.kind
            || canonicalJson(existingRows[index].payload) !== canonicalJson(requested.payload)) {
          throw new IntegrityError('genesis row collision');
        }
      }
      let records = before.records;
      for (const requested of rows.slice(existingRows.length)) {
        const previous = records.at(-1);
        const record = recordValue({
          sequence: records.length + 1,
          previousDigest: previous.contentDigest,
          kind: requested.kind,
          payload: structuredClone(requested.payload),
          recordedAt: clock(),
        });
        await appendRecord(paths.chain, record);
        records = [...records, record];
      }
      return inspectNamespace({ keelId });
    });
  }

  async function appendCheckpoint({ keelId, expectedHeadDigest, checkpoint }) {
    const paths = namespacePaths(keelId);
    assertDigest('expectedHeadDigest', expectedHeadDigest);
    if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
      throw new IntegrityError('checkpoint payload is required');
    }
    return underLock(paths, async () => {
      const before = await inspectNamespace({ keelId });
      if (before.status === 'quarantined') throw new IntegrityError('keel namespace is quarantined');
      const last = before.records.at(-1);
      if (last.kind === 'checkpoint'
          && last.previousDigest === expectedHeadDigest
          && canonicalJson(last.payload) === canonicalJson(checkpoint)) {
        return before;
      }
      if (before.headDigest !== expectedHeadDigest) throw new IntegrityError('keel head mismatch');
      const record = recordValue({
        sequence: before.recordCount + 1,
        previousDigest: before.headDigest,
        kind: 'checkpoint',
        payload: structuredClone(checkpoint),
        recordedAt: clock(),
      });
      await appendRecord(paths.chain, record);
      return inspectNamespace({ keelId });
    });
  }

  async function quarantineNamespace({ keelId, genesisId, reasonDigest }) {
    const paths = namespacePaths(keelId);
    assertDigest('genesisId', genesisId);
    assertDigest('reasonDigest', reasonDigest);
    return underLock(paths, async () => {
      const before = await inspectNamespace({ keelId });
      if (before.genesisId !== genesisId) throw new IntegrityError('genesis identity collision');
      const state = stateValue({ status: 'quarantined', genesisId, reasonDigest });
      const existing = await readCanonicalJson(paths.state, 'keel state');
      if (existing.status === 'quarantined') {
        if (canonicalJson(existing) !== canonicalJson(state)) throw new IntegrityError('quarantine reason collision');
        return before;
      }
      await atomicJson(paths.state, state);
      return inspectNamespace({ keelId });
    });
  }

  return Object.freeze({
    prepareNamespace,
    appendGenesis,
    inspectNamespace,
    appendCheckpoint,
    quarantineNamespace,
  });
}
