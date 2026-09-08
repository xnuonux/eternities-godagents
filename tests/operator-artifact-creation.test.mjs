import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { runLocalWorkflow } from '../examples/local-artifact-workflow/run.mjs';
import { prepareOperatorArtifactFixture } from './helpers/operator-artifact-fixture.mjs';

const json = value => `${canonicalJson(value)}\n`;
test('standalone operator sources create a fresh admitted agent and a replayable accepted artifact', async t => {
  const prepared = await prepareOperatorArtifactFixture(t);
  let calls = 0;
  const result = await runLocalWorkflow({ manifestPath: prepared.manifestPath, expectedManifestDigest: prepared.manifestDigest,
    env: { GODAGENT_TEST_PHASE_KEY: 'synthetic-operator-key' },
    createProviderPhaseHostImpl: options => createProviderPhaseHost({ ...options, fetchImpl: async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      return new Response(json({ id: 'controlled-operator', object: 'chat.completion', model: body.model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content: 'four' }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
          completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } } }),
      { status: 200, headers: { 'content-type': 'application/json' } });
    } }),
  });
  assert.equal(result.status, 'completed');
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await readFile(result.artifact.path, 'utf8')).content, 'four');
  const cli = fileURLToPath(new URL('../examples/local-artifact-workflow/cli.mjs', import.meta.url));
  const guard = new URL('../src/certification/no-network-guard.mjs', import.meta.url).href;
  const replay = spawnSync(process.execPath, ['--import', guard, cli, 'run', '--manifest', prepared.manifestPath,
    '--manifest-digest', prepared.manifestDigest], { encoding: 'utf8', windowsHide: true, timeout: 20000,
    env: { SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA } });
  assert.equal(replay.status, 0, replay.stderr);
  const replayed = JSON.parse(replay.stdout);
  assert.equal(replayed.artifact.replayed, true);
  assert.equal(replayed.artifact.artifactDigest, result.artifact.artifactDigest);
});
