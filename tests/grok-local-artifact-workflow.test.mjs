import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareRecoveryFixture } from './helpers/local-workflow-recovery-fixture.mjs';
import { grokProcessFixture } from './helpers/grok-cli-process-fixture.mjs';
import { runLocalWorkflow } from '../examples/local-artifact-workflow/run.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';

const exec = promisify(execFile);
const family = 'grok-cli-subscription-v1';
const task = { objective: 'write a short artifact', outputFormat: 'plain text' };

async function prepare(t, grok, configure = () => {}) {
  return prepareRecoveryFixture(t, { effectOnlyTask: task, configure: async (config, workspace) => {
    config.family = family;
    config.providerPolicyPath = grok.policyPath;
    await configure(config, workspace);
  } });
}
const options = f => ({ manifestPath: f.manifestPath, expectedManifestDigest: f.manifestDigest, env: {} });

test('Grok workflow prepares without auth and publishes an admitted artifact, with auth-free fresh-process replay', async t => {
  const grok = await grokProcessFixture(t);
  await rename(grok.authPath, `${grok.authPath}.saved`);
  const f = await prepare(t, grok);
  assert.equal(await grok.calls(), 0);
  await rename(`${grok.authPath}.saved`, grok.authPath);
  const result = await runLocalWorkflow(options(f));
  assert.equal(result.status, 'completed');
  assert.equal(await grok.calls(), 1);
  assert.ok(result.receipt.acceptedArtifactDigest);
  const artifact = await readFile(result.artifact.path, 'utf8');
  assert.match(artifact, /synthetic native/);
  await rename(grok.authPath, `${grok.authPath}.saved`);
  const replay = await exec(process.execPath, ['examples/local-artifact-workflow/cli.mjs',
    'run', '--manifest', f.manifestPath, '--manifest-digest', f.manifestDigest],
  { cwd: process.cwd(), windowsHide: true, timeout: 30_000, maxBuffer: 262144 });
  assert.equal(result.artifact.replayed, false);
  assert.deepEqual(JSON.parse(replay.stdout), { ...result, artifact: { ...result.artifact, replayed: true } });
  assert.equal(await readFile(result.artifact.path, 'utf8'), artifact);
  assert.equal(await grok.calls(), 1);
});

test('Grok workflow does not dispatch without the requested effect authority', async t => {
  const grok = await grokProcessFixture(t);
  const f = await prepare(t, grok, config => {
    config.request = structuredClone(config.request);
    config.request.requestedAuthority = ['realm:write'];
    config.request.hostCeiling.availableAuthority = ['realm:write'];
    config.hostPolicy.authority = ['realm:write'];
    config.hostPolicy.hostContext.availableAuthority = ['realm:write'];
    delete config.request.effectAssessment;
    config.request = prepareLocalArtifactEffectRequest(config.request,
      { expectedProducerDescriptorDigest: config.effectOnly.producerDescriptorDigest });
  });
  const result = await runLocalWorkflow(options(f));
  assert.equal(result.status, 'needs-decision');
  assert.equal(result.artifact, null);
  assert.equal(await grok.calls(), 0);
});

test('Grok workflow leaves an uncertain dispatch pending instead of repeating the physical call', async t => {
  const grok = await grokProcessFixture(t, 'uncertain');
  const f = await prepare(t, grok);
  await assert.rejects(runLocalWorkflow(options(f)));
  assert.equal(await grok.calls(), 1);
  const pending = await runLocalWorkflow(options(f));
  assert.equal(pending.status, 'pending');
  assert.equal(pending.artifact, null);
  assert.equal(await grok.calls(), 1);
});

test('Grok workflow rejects changed prepared policy before a child process starts', async t => {
  const grok = await grokProcessFixture(t);
  const f = await prepare(t, grok);
  await writeFile(join(f.workspace, 'provider-policy.json'), '{}\n');
  await assert.rejects(runLocalWorkflow(options(f)), /prepared workflow input changed/);
  assert.equal(await grok.calls(), 0);
});

test('Grok family is not silently enabled for the v1 review workflow', async t => {
  const grok = await grokProcessFixture(t);
  let workspace;
  await assert.rejects(prepareRecoveryFixture(t, { configure: (config, root) => {
    workspace = root;
    config.family = family;
    config.providerPolicyPath = grok.policyPath;
  } }), /Grok workflow requires effect-only v2/);
  await assert.rejects(access(workspace), { code: 'ENOENT' });
  assert.equal(await grok.calls(), 0);
});
