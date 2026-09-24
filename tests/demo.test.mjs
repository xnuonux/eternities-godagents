import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

test('demo works in a fresh isolated checkout and preserves previous runs', async (t) => {
  const checkout = await mkdtemp(join(tmpdir(), 'godagents-demo-test-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  for (const directory of ['src', 'schemas', 'fixtures']) {
    await cp(join(repositoryRoot, directory), join(checkout, directory), { recursive: true });
  }
  await mkdir(join(checkout, 'scripts'));
  await cp(join(repositoryRoot, 'scripts/run-demo.mjs'), join(checkout, 'scripts/run-demo.mjs'));
  const previous = join(checkout, 'artifacts/demo-runtime');
  await mkdir(previous, { recursive: true });
  await writeFile(join(previous, 'keep.txt'), 'previous operator evidence');

  function run() {
    const child = spawnSync(process.execPath, [
      '--permission', `--allow-fs-read=${checkout}`, `--allow-fs-write=${checkout}`,
      join(checkout, 'scripts/run-demo.mjs'),
    ], { cwd: tmpdir(), encoding: 'utf8', timeout: 30_000 });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    return JSON.parse(child.stdout);
  }

  const first = run();
  assert.equal(first.expectedCounter, 1);
  assert.equal(first.observedCounter, 1);
  assert.equal(first.discrepancyClass, 'none');
  const journal = await readFile(first.journalPath, 'utf8');
  const events = journal.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(events.filter((event) => event.eventType === 'action.receipt').length, 1);
  assert.equal(events.at(-1).eventType, 'cycle.completed');
  const relativeJournal = relative(previous, first.journalPath);
  assert.ok(relativeJournal && !isAbsolute(relativeJournal)
    && relativeJournal !== '..' && !relativeJournal.startsWith(`..${sep}`));
  assert.equal(await readFile(join(previous, 'keep.txt'), 'utf8'), 'previous operator evidence');

  const second = run();
  assert.equal(second.observedCounter, 1);
  assert.notEqual(second.journalPath, first.journalPath);
  assert.equal(await readFile(first.journalPath, 'utf8'), journal);
});
