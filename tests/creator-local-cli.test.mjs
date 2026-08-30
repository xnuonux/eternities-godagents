import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { runCreatorCli } from '../src/creator/local-cli.mjs';

const policyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixtureRoot = new URL('../fixtures/', import.meta.url);
const common = [
  '--policy', fileURLToPath(new URL('creation/creation-policy.json', fixtureRoot)),
  '--policy-digest', policyDigest,
  '--modules', fileURLToPath(new URL('creation/modules/', fixtureRoot)),
  '--expressions', fileURLToPath(new URL('creator/expressions/', fixtureRoot)),
  '--presets', fileURLToPath(new URL('creator/presets/', fixtureRoot)),
];

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
    },
    read: () => ({ stdout, stderr }),
  };
}

test('local creator CLI emits one canonical bounded catalog value', async () => {
  const stream = capture();
  const exitCode = await runCreatorCli({ argv: ['catalog', ...common], ...stream.io });
  const { stdout, stderr } = stream.read();
  assert.equal(exitCode, 0);
  assert.equal(stderr, '');
  const value = JSON.parse(stdout);
  assert.equal(stdout, `${canonicalJson(value)}\n`);
  assert.equal(value.status, 'ok');
  assert.equal(value.command, 'catalog');
  assert.match(value.catalog.catalogDigest, /^[a-f0-9]{64}$/);
  assert.equal(value.catalog.modules[0].payload, undefined);
});

test('local creator CLI preview output is reviewable but not a build or raw source dump', async () => {
  const stream = capture();
  const exitCode = await runCreatorCli({
    argv: [
      'preview-preset', ...common,
      '--preset', 'preset:aether-architect@1.0.0',
      '--creator', 'creator:dom',
    ],
    ...stream.io,
  });
  const value = JSON.parse(stream.read().stdout);
  assert.equal(exitCode, 0);
  assert.equal(value.status, 'ready');
  assert.match(value.previewDigest, /^[a-f0-9]{64}$/);
  assert.equal(value.candidate, undefined);
  assert.equal(value.genome, undefined);
  assert.equal(value.creationBuildId, undefined);
});

test('local creator CLI emits only closed failures and never rejected values', async () => {
  const canary = 'secret-cli-canary';
  const stream = capture();
  const exitCode = await runCreatorCli({
    argv: ['catalog', ...common, '--api-key', canary],
    ...stream.io,
  });
  const { stdout, stderr } = stream.read();
  assert.equal(exitCode, 2);
  assert.equal(stdout, '');
  assert.equal(stderr, `${canonicalJson({
    schemaVersion: 1,
    status: 'failed',
    code: 'option-unexpected',
  })}\n`);
  assert.doesNotMatch(stderr, new RegExp(canary));
});

test('local creator CLI finalizes only the exact preview it emitted', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-cli-finalize-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const previewStream = capture();
  await runCreatorCli({
    argv: [
      'preview-preset', ...common,
      '--preset', 'preset:aether-architect@1.0.0',
      '--creator', 'creator:dom',
    ],
    ...previewStream.io,
  });
  const preview = JSON.parse(previewStream.read().stdout);
  const finalizeStream = capture();
  const exitCode = await runCreatorCli({
    argv: [
      'finalize-preset', ...common,
      '--preset', 'preset:aether-architect@1.0.0',
      '--creator', 'creator:dom',
      '--expected-preview-digest', preview.previewDigest,
      '--source-dir', join(root, 'source'),
      '--output-dir', join(root, 'output'),
    ],
    ...finalizeStream.io,
  });
  const result = JSON.parse(finalizeStream.read().stdout);
  assert.equal(exitCode, 0);
  assert.equal(finalizeStream.read().stderr, '');
  assert.equal(result.status, 'finalized');
  assert.equal(result.previewDigest, preview.previewDigest);
  assert.equal(result.creationBuildId, '87168c691b10c2d4f1780c3826b6d3f40cbcee18a63049fea77a1780b857b9f8');
});

test('direct CLI process has canonical stdout and no ambient network need', async () => {
  const script = fileURLToPath(new URL('../src/creator/local-cli.mjs', import.meta.url));
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, 'catalog', ...common], {
      shell: false,
      windowsHide: true,
      env: { ...process.env, GODAGENT_MODEL_API_KEY: '' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  const parsed = JSON.parse(result.stdout);
  assert.equal(result.stdout, `${canonicalJson(parsed)}\n`);
});
