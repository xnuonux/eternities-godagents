import { randomUUID } from 'node:crypto';
import { link, lstat, open, readFile, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';
import { assertNoCredentialFields } from '../../src/cortex/receipt-safety.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const pathIdentity = (path) => process.platform === 'win32' ? path.toLowerCase() : path;

export async function writeAcceptedArtifact({ directory, artifact, expectedDigest, maximumBytes } = {}) {
  // Capture data before the first await; caller mutation cannot change the publication.
  const snapshot = structuredClone(artifact);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || !DIGEST.test(expectedDigest ?? '')
      || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 16_777_216
      || typeof directory !== 'string' || !directory || /[\0\r\n]/.test(directory)) {
    throw new Error('artifact export input is invalid');
  }
  assertNoCredentialFields(snapshot);
  const canonical = canonicalJson(snapshot);
  const text = `${canonical}\n`;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (sha256Text(canonical) !== expectedDigest || bytes > maximumBytes) {
    throw new Error('artifact export digest or byte limit mismatch');
  }
  const root = resolve(directory);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
      || pathIdentity(await realpath(root)) !== pathIdentity(root)) {
    throw new Error('artifact export directory is not canonical');
  }
  const path = join(root, `${expectedDigest}.json`);
  async function verifyExisting() {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes
        || await readFile(path, 'utf8') !== text) {
      throw new Error('artifact export conflicts with an existing entry');
    }
  }
  try {
    await lstat(path);
    await verifyExisting();
    return Object.freeze({ path, artifactDigest: expectedDigest, bytes, replayed: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Each attempt owns its temporary file; concurrent attempts never erase each other's work.
  const pending = join(root, `.artifact-${randomUUID()}.writing`);
  let handle;
  let replayed = false;
  try {
    handle = await open(pending, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    try {
      await link(pending, path);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      replayed = true;
    }
    await verifyExisting();
    return Object.freeze({ path, artifactDigest: expectedDigest, bytes, replayed });
  } finally {
    await handle?.close();
    await rm(pending, { force: true });
  }
}
