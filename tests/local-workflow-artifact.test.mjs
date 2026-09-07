import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const load = () => import('../examples/local-artifact-workflow/artifact.mjs');
const artifact = { content: 'checked answer', schemaVersion: 1 };
const serialized = '{"content":"checked answer","schemaVersion":1}';
const expectedDigest = createHash('sha256').update(serialized).digest('hex');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'godagents-artifact-export-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, artifact: structuredClone(artifact), expectedDigest, maximumBytes: 1024 };
}

test('accepted artifact export publishes checked bytes and reuses identical replay', async (t) => {
  const input = await fixture(t);
  const { writeAcceptedArtifact } = await load();
  const first = await writeAcceptedArtifact(input);
  assert.ok(first, 'publication must return its checked artifact');
  assert.equal(first.path, join(input.directory, `${expectedDigest}.json`));
  assert.equal(await readFile(first.path, 'utf8'), `${serialized}\n`);
  assert.equal(first.replayed, false);
  const second = await writeAcceptedArtifact(input);
  assert.equal(second.replayed, true);
  assert.equal(second.artifactDigest, expectedDigest);
});

test('artifact export rejects unchecked, absent and oversized output before publication', async (t) => {
  const input = await fixture(t);
  const { writeAcceptedArtifact } = await load();
  for (const change of [
    { expectedDigest: 'a'.repeat(64) },
    { expectedDigest: null },
    { artifact: null },
    { maximumBytes: 1 },
    { maximumBytes: Infinity },
  ]) await assert.rejects(writeAcceptedArtifact({ ...input, ...change }));
  await assert.rejects(readFile(join(input.directory, `${expectedDigest}.json`)), { code: 'ENOENT' });
});

test('artifact export never overwrites a conflicting existing file', async (t) => {
  const input = await fixture(t);
  const path = join(input.directory, `${expectedDigest}.json`);
  await writeFile(path, 'unrelated bytes');
  const { writeAcceptedArtifact } = await load();
  await assert.rejects(writeAcceptedArtifact(input));
  assert.equal(await readFile(path, 'utf8'), 'unrelated bytes');
});

test('artifact export rejects junction aliases without touching their targets', async (t) => {
  const input = await fixture(t);
  const target = join(input.directory, 'target');
  await mkdir(target);
  const marker = join(target, 'marker.txt');
  await writeFile(marker, 'preserve');
  const alias = join(input.directory, 'alias');
  await symlink(target, alias, 'junction');
  await symlink(target, join(input.directory, `${expectedDigest}.json`), 'junction');
  const { writeAcceptedArtifact } = await load();
  await assert.rejects(writeAcceptedArtifact(input));
  await assert.rejects(writeAcceptedArtifact({ ...input, directory: alias }));
  assert.equal(await readFile(marker, 'utf8'), 'preserve');
  await assert.rejects(readFile(join(target, `${expectedDigest}.json`)), { code: 'ENOENT' });
});

test('artifact export snapshots caller data before asynchronous publication', async (t) => {
  const input = await fixture(t);
  const { writeAcceptedArtifact } = await load();
  const pending = writeAcceptedArtifact(input);
  input.artifact.content = 'changed after dispatch';
  const result = await pending;
  assert.ok(result, 'publication must return the snapshotted artifact');
  assert.equal(await readFile(result.path, 'utf8'), `${serialized}\n`);
});
