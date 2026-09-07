import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const source = fileURLToPath(new URL('../scripts/build-cross-repository-current-head-v2.mjs', import.meta.url));
const harness = fileURLToPath(new URL('./helpers/current-head-publication-harness.mjs', import.meta.url));
const previous = '{"status":"previous-measured-artifact"}\n';

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-publication-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'integrations'));
  await mkdir(join(root, 'docs'));
  const artifact = join(root, 'integrations/cross-repository-current-head-v2.json');
  await writeFile(artifact, previous);
  await writeFile(join(root, 'docs/cross-repository-current-head-v2-certification.md'), 'existing certification\n');
  return { root, artifact };
}

async function run(root, outcome) {
  const { stdout } = await execute(process.execPath,
    ['--experimental-vm-modules', harness, source, root, outcome],
    { windowsHide: true, timeout: 15000 });
  return JSON.parse(stdout.trim());
}

for (const phase of ['godskills', 'full', 'focused', 'verify', 'publish']) {
  test(`current-head refresh preserves the previous artifact on ${phase} failure`, async (t) => {
    const { root, artifact } = await workspace(t);
    const result = await run(root, phase);
    assert.match(result.error ?? '', new RegExp(`controlled ${phase} failure`));
    assert.equal(await readFile(artifact, 'utf8'), previous);
    assert.deepEqual(await readdir(join(root, 'integrations')), ['cross-repository-current-head-v2.json']);
  });
}

for (const outcome of ['dirty-godskills-pre', 'dirty-godskills-post', 'drift-post-godskills', 'drift-post-godagents']) {
  test(`current-head refresh refuses publication on ${outcome}`, async (t) => {
    const { root, artifact } = await workspace(t);
    const result = await run(root, outcome);
    assert.match(result.error ?? '', /dirty-godskills|checkout must match/);
    assert.equal(await readFile(artifact, 'utf8'), previous);
  });
}

test('current-head refresh publishes only observed results after every gate succeeds', async (t) => {
  const { root, artifact } = await workspace(t);
  const result = await run(root, 'success');
  assert.equal(result.error, null);
  assert.deepEqual(result.events, ['godskills', 'full', 'focused', 'verify'].map(phase => ({ phase, unchanged: true })));
  assert.deepEqual(JSON.parse(await readFile(artifact, 'utf8')).testRuns, {
    godagentsFocused: { status: 'pass', tests: 5 },
    godagentsFull: { status: 'pass', tests: 17 },
    godskillsFocused: { status: 'pass', tests: 3 },
  });
});

test('interrupting a current-head refresh leaves the previous artifact intact', async (t) => {
  const { root, artifact } = await workspace(t);
  const child = spawn(process.execPath,
    ['--experimental-vm-modules', harness, source, root, 'interrupt'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const closed = once(child, 'close');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('interruption checkpoint was not reached')), 15000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('waiting-for-interruption')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  child.kill();
  await closed;
  assert.equal(await readFile(artifact, 'utf8'), previous);
});
