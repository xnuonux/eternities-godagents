import { createHash } from 'node:crypto';

const DIGEST = /^[a-f0-9]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (condition, message) => { if (!condition) throw new Error(message); };

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function text(bytes, path) {
  fail(!bytes.includes(0), `workspace export refuses binary/NUL file: ${path}`);
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error(`workspace export refuses non-UTF-8 text file: ${path}`); }
}

function checkedInput(input) {
  fail(input && typeof input === 'object' && !Array.isArray(input), 'workspace export request is invalid');
  fail(typeof input.parentDigest === 'string' && DIGEST.test(input.parentDigest), 'workspace export parent digest is invalid');
  fail(typeof input.revisionDigest === 'string' && DIGEST.test(input.revisionDigest), 'workspace export revision digest is invalid');
}

export async function exportWorkspaceRevision(input) {
  checkedInput(input);
  const { store, parentDigest, revisionDigest } = input;
  fail(store && typeof store.inspect === 'function' && typeof store.read === 'function', 'workspace export store is invalid');

  const parent = await store.inspect(parentDigest);
  const child = await store.inspect(revisionDigest);
  fail(revisionDigest === parentDigest || child.parentDigest === parentDigest,
    'workspace export child is not a direct child of parent');
  const parentRows = parent.files, childRows = child.files;
  fail(parentRows.length === childRows.length
    && parentRows.every((row, index) => row.path === childRows[index].path),
  'workspace export file sets differ');

  const changes = [];
  for (let index = 0; index < parentRows.length; index++) {
    const beforeRow = parentRows[index], afterRow = childRows[index];
    const before = await store.read({ revisionDigest: parentDigest, path: beforeRow.path });
    const after = await store.read({ revisionDigest, path: afterRow.path });
    fail(hash(before) === beforeRow.sha256 && hash(after) === afterRow.sha256,
      'workspace export bytes changed during checked read');
    const beforeText = text(before, beforeRow.path), afterText = text(after, afterRow.path);
    if (beforeRow.sha256 !== afterRow.sha256) {
      changes.push({ path: beforeRow.path, beforeSha256: beforeRow.sha256, afterSha256: afterRow.sha256,
        beforeText, afterText });
    }
  }
  const finalParent = await store.inspect(parentDigest), finalChild = await store.inspect(revisionDigest);
  fail(finalChild.parentDigest === (revisionDigest === parentDigest ? finalChild.parentDigest : parentDigest)
    && finalParent.revisionDigest === parentDigest && finalChild.revisionDigest === revisionDigest,
  'workspace export revision changed during export');
  return freeze({ parentDigest, revisionDigest, changes });
}
