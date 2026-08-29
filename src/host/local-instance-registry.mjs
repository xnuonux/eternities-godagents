import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const KEEL_ID = /^keel-[a-f0-9]{64}$/;
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

function pathIdentity(path) {
  const value = resolve(path);
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

export function defaultLocalInstanceRegistryRoot() {
  const profile = userInfo().homedir;
  if (typeof profile !== 'string' || profile.length === 0 || /[\0\r\n]/.test(profile)) {
    throw new IntegrityError('OS account profile directory is unavailable');
  }
  return join(profile, '.eternities', 'godagents', 'instances');
}

function recordValue({ binding, admissionRoot }) {
  const unsigned = {
    schemaVersion: 1,
    instanceId: binding.instanceId,
    genesisId: binding.genesisId,
    keelId: binding.keelId,
    admissionRoot: resolve(admissionRoot),
  };
  return { ...unsigned, recordDigest: sha256Value(unsigned) };
}

function validateRecord(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new IntegrityError('local instance residency record is invalid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || text !== jsonBytes(value)
      || value.schemaVersion !== 1
      || typeof value.instanceId !== 'string'
      || !DIGEST.test(value.genesisId)
      || !KEEL_ID.test(value.keelId)
      || typeof value.admissionRoot !== 'string'
      || value.admissionRoot.length < 1) throw new IntegrityError('local instance residency record is invalid');
  const { recordDigest, ...unsigned } = value;
  if (recordDigest !== sha256Value(unsigned)) throw new IntegrityError('local instance residency digest mismatch');
  return value;
}

export async function claimLocalInstanceResidency({ registryRoot, binding, admissionRoot }) {
  if (typeof registryRoot !== 'string' || registryRoot.length === 0 || /[\0\r\n]/.test(registryRoot)) {
    throw new TypeError('local instance registry root is invalid');
  }
  const root = resolve(registryRoot);
  await mkdir(root, { recursive: true });
  const key = sha256Text(binding.instanceId);
  const recordPath = join(root, `${key}.json`);
  const lock = await acquireFileLock({ lockPath: join(root, `${key}.lock`) });
  try {
    const expected = recordValue({ binding, admissionRoot });
    let text;
    try {
      text = await readFile(recordPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await writeFile(recordPath, jsonBytes(expected), { encoding: 'utf8', flag: 'wx' });
      return Object.freeze(expected);
    }
    const actual = validateRecord(text);
    if (actual.instanceId !== expected.instanceId
        || actual.genesisId !== expected.genesisId
        || actual.keelId !== expected.keelId
        || pathIdentity(actual.admissionRoot) !== pathIdentity(expected.admissionRoot)) {
      throw new IntegrityError('local instance residency conflicts with canonical admission');
    }
    return Object.freeze(actual);
  } finally {
    await lock.release();
  }
}
