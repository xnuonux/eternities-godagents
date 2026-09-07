import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runLocalWorkflowCli } from '../examples/local-artifact-workflow/cli.mjs';

function streams() {
  const output = { stdout: '', stderr: '' };
  return { output, stdout: { write: (text) => { output.stdout += text; } },
    stderr: { write: (text) => { output.stderr += text; } } };
}

test('workflow CLI rejects unknown, duplicate, missing and credential arguments without echoing them', async () => {
  for (const argv of [[], ['launch'], ['run', '--manifest', 'x'],
    ['prepare', '--config', 'a', '--config', 'b', '--workspace', 'c'],
    ['run', '--manifest', 'x', '--manifest-digest', 'a'.repeat(64), '--api-key', 'DO-NOT-ECHO'],
    ['prepare', '--config', '--workspace', 'x']]) {
    const io = streams();
    assert.equal(await runLocalWorkflowCli({ argv, ...io }), 2);
    assert.equal(io.output.stdout, '');
    assert.deepEqual(JSON.parse(io.output.stderr), { status: 'failed', code: 'invalid-arguments' });
  }
});

test('workflow CLI describes inert prepare and explicit run without touching a provider', async () => {
  const io = streams();
  assert.equal(await runLocalWorkflowCli({ argv: ['--help'], ...io }), 0);
  assert.match(io.output.stdout, /prepare --config PATH --workspace PATH/);
  assert.match(io.output.stdout, /run --manifest PATH --manifest-digest SHA256/);
  assert.equal(io.output.stderr, '');
});

test('workflow CLI masks malformed and oversized configuration content', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-workflow-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = join(root, 'config.json');
  for (const content of ['{"DO-NOT-ECHO":', 'x'.repeat(1_048_577)]) {
    await writeFile(config, content);
    const io = streams();
    assert.equal(await runLocalWorkflowCli({ argv: ['prepare', '--config', config, '--workspace', join(root, 'work')], ...io }), 1);
    assert.equal(io.output.stdout, '');
    assert.deepEqual(JSON.parse(io.output.stderr), { status: 'failed', code: 'workflow-failed' });
  }
});
