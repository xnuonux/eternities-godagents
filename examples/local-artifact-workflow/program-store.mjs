import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { assertNoCredentialFields } from '../../src/cortex/receipt-safety.mjs';
import { publishFileExclusive } from '../../src/state/atomic-publication.mjs';

const limit = 1_048_576;
const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
export const programJson = value => `${canonicalJson(value)}\n`;

export async function assertProgramDirectory(path) {
  const absolute = resolve(path), stat = await lstat(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink() || key(await realpath(absolute)) !== key(absolute)) {
    throw new Error('artifact program directory is aliased');
  }
  return absolute;
}

export async function readProgramRecord(path, { optional = false } = {}) {
  const absolute = resolve(path);
  await assertProgramDirectory(dirname(absolute));
  let stat;
  try { stat = await lstat(absolute); } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error('artifact program record is not a bounded regular file');
  const file = await open(absolute, 'r');
  let bytes;
  try {
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) {
      const got = await file.read(buffer, size, buffer.length - size, null);
      if (!got.bytesRead) break;
      size += got.bytesRead;
    }
    if (size > limit || !(await file.stat()).isFile()) throw new Error('artifact program record exceeds byte ceiling');
    bytes = buffer.subarray(0, size);
  } finally { await file.close(); }
  // Preserve BOM bytes so canonical verification cannot normalize a changed pin.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const value = JSON.parse(text);
  if (text !== programJson(value)) throw new Error('artifact program record is not canonical');
  assertNoCredentialFields(value);
  return { text, value };
}

async function ensureChild(parent, name) {
  await assertProgramDirectory(parent);
  const path = join(parent, name);
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  return assertProgramDirectory(path);
}

export async function publishProgramRecord(path, value) {
  const text = programJson(value);
  if (Buffer.byteLength(text) > limit) throw new Error('artifact program record exceeds byte ceiling');
  assertNoCredentialFields(value);
  await assertProgramDirectory(dirname(path));
  await publishFileExclusive({ destinationPath: path, content: text });
  const stored = await readProgramRecord(path);
  if (stored.text !== text) throw new Error('artifact program record conflicts with existing evidence');
  return stored;
}

export async function createArtifactProgramStore({ workspaceRoot, programId, create = false }) {
  if (!/^[a-f0-9]{64}$/.test(programId ?? '')) throw new Error('artifact program id is invalid');
  const workspace = await assertProgramDirectory(workspaceRoot);
  const parent = create ? await ensureChild(workspace, 'artifact-programs') : await assertProgramDirectory(join(workspace, 'artifact-programs'));
  const root = create ? await ensureChild(parent, programId) : await assertProgramDirectory(join(parent, programId));
  const resolutions = join(root, 'resolutions');
  const resolutionPath = stepId => join(resolutions, `${sha256Value(stepId)}.json`);
  return Object.freeze({ root, manifestPath: join(root, 'program.json'), coordinatorRoot: join(root, 'coordinator'),
    ensureCoordinatorRoot: () => ensureChild(root, 'coordinator'),
    async readResolution(stepId, { required = false } = {}) {
      try {
        const record = await readProgramRecord(resolutionPath(stepId), { optional: !required });
        return record?.value ?? null;
      } catch (error) {
        if (error.code === 'ENOENT' && !required) return null;
        if (error.code === 'ENOENT') throw new Error('artifact program required resolution evidence is missing', { cause: error });
        throw error;
      }
    },
    async publishResolution(stepId, value) {
      await ensureChild(root, 'resolutions');
      return (await publishProgramRecord(resolutionPath(stepId), value)).value;
    },
  });
}
