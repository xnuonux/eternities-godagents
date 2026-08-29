import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { IntegrityError } from '../core/errors.mjs';

const jsonBytes = (value) => `${canonicalJson(value)}\n`;

function defaultProcessAlive(pid) {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function parseOwner(text) {
  let owner;
  try {
    owner = JSON.parse(text);
  } catch {
    throw new IntegrityError('resource is locked by malformed owner metadata');
  }
  if (text !== jsonBytes(owner)
      || owner?.schemaVersion !== 1
      || !Number.isInteger(owner.pid)
      || owner.pid < 1
      || typeof owner.nonce !== 'string'
      || owner.nonce.length < 1
      || owner.nonce.length > 128
      || typeof owner.createdAt !== 'string'
      || !Number.isFinite(Date.parse(owner.createdAt))) {
    throw new IntegrityError('resource is locked by malformed owner metadata');
  }
  return owner;
}

async function readOwner(lockPath) {
  try {
    return parseOwner(await readFile(lockPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function acquireFileLock({
  lockPath,
  staleAfterMs = 30_000,
  now = Date.now,
  isProcessAlive = defaultProcessAlive,
  nonce = randomUUID,
  pid = process.pid,
}) {
  if (typeof lockPath !== 'string' || lockPath.length === 0) throw new TypeError('lockPath is required');
  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1) throw new TypeError('staleAfterMs is invalid');
  if (typeof now !== 'function' || typeof isProcessAlive !== 'function' || typeof nonce !== 'function') {
    throw new TypeError('lock policy functions are required');
  }
  if (!Number.isInteger(pid) || pid < 1) throw new TypeError('lock pid is invalid');
  await mkdir(dirname(lockPath), { recursive: true });
  const owner = {
    schemaVersion: 1,
    pid,
    nonce: String(nonce()),
    createdAt: new Date(now()).toISOString(),
  };
  if (owner.nonce.length < 1 || owner.nonce.length > 128) throw new TypeError('lock nonce is invalid');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let handle;
    try {
      handle = await open(lockPath, 'wx');
      await handle.write(jsonBytes(owner), null, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      return Object.freeze({
        owner: Object.freeze({ ...owner }),
        async release() {
          const current = await readOwner(lockPath);
          if (!current) return;
          if (current.nonce !== owner.nonce || current.pid !== owner.pid) {
            throw new IntegrityError('lock ownership changed before release');
          }
          await rm(lockPath, { force: true });
        },
      });
    } catch (error) {
      await handle?.close();
      if (error.code !== 'EEXIST') throw error;
    }

    let existing;
    try {
      existing = await readOwner(lockPath);
    } catch (error) {
      if (!(error instanceof IntegrityError) || error.message !== 'resource is locked by malformed owner metadata') {
        throw error;
      }
      let metadata;
      try {
        metadata = await stat(lockPath);
      } catch (statError) {
        if (statError.code === 'ENOENT') continue;
        throw statError;
      }
      if (now() - metadata.mtimeMs < staleAfterMs) throw error;
      const stalePath = `${lockPath}.stale-${owner.nonce}`;
      try {
        await rename(lockPath, stalePath);
        await rm(stalePath, { force: true });
      } catch (reclaimError) {
        if (reclaimError.code !== 'ENOENT') throw reclaimError;
      }
      continue;
    }
    if (!existing) continue;
    const age = now() - Date.parse(existing.createdAt);
    if (age < staleAfterMs || isProcessAlive(existing.pid)) {
      throw new IntegrityError('resource is locked by a live or recent owner');
    }
    const stalePath = `${lockPath}.stale-${owner.nonce}`;
    try {
      await rename(lockPath, stalePath);
      await rm(stalePath, { force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new IntegrityError('resource lock contention could not be resolved');
}
