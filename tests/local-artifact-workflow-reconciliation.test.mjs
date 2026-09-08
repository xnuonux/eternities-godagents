import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, rename, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import { prepareArtifactRealmFixture } from './helpers/local-artifact-realm-fixture.mjs';
import { prepareRecoveryFixture } from './helpers/local-workflow-recovery-fixture.mjs';
import * as workflow from '../examples/local-artifact-workflow/run.mjs';

const json = value => `${canonicalJson(value)}\n`;
const options = f => ({ manifestPath: f.manifestPath, expectedManifestDigest: f.manifestDigest, env: {} });
function controlled(counts, uncertain = false) {
  return input => createProviderPhaseHost({ ...input, fetchImpl: async (_url, init) => {
    counts.fetch++;
    if (uncertain) throw new Error('controlled uncertain request');
    const body = JSON.parse(init.body);
    return new Response(json({ id: 'controlled-reconcile', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content: 'four' }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
        completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } } }),
    { status: 200, headers: { 'content-type': 'application/json' } });
  } });
}
async function cli(f, extra = []) {
  const env = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  const child = spawn(process.execPath, ['--import', new URL('./helpers/local-workflow-network-witness.mjs', import.meta.url).href,
    'examples/local-artifact-workflow/cli.mjs', 'reconcile', '--manifest', f.manifestPath,
    '--manifest-digest', f.manifestDigest, ...extra], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stdout = '', stderr = '';
  const attempts = [];
  child.on('message', message => attempts.push(message));
  child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 65536) child.kill('SIGKILL'); });
  child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 65536) child.kill('SIGKILL'); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(signal, null);
    assert.deepEqual(attempts, []);
    return { code, stdout, stderr };
  } finally { clearTimeout(timer); }
}

test('fresh workflow and fresh CLI reconcile report absence, no artifact and no provider attempt', async t => {
  const f = await prepareArtifactRealmFixture(t);
  const counts = { fetch: 0 };
  const original = await readFile(f.manifestPath, 'utf8');
  assert.deepEqual(await workflow.reconcileLocalWorkflow({ ...options(f), createProviderPhaseHostImpl: controlled(counts) }),
    { status: 'absent', instanceId: f.instanceId, missionId: f.missionId, artifact: null });
  const fresh = await cli(f);
  assert.equal(fresh.code, 3);
  assert.equal(JSON.parse(fresh.stdout).status, 'absent');
  assert.equal(fresh.stderr, '');
  assert.equal(counts.fetch, 0);
  assert.equal(await readFile(f.manifestPath, 'utf8'), original);
  await assert.rejects(access(join(f.workspace, 'artifacts')), { code: 'ENOENT' });
});

for (const uncertain of [false, true]) {
  test(`workflow reconcile preserves ${uncertain ? 'pending' : 'completed'} evidence without additional inference`, async t => {
    const f = await prepareArtifactRealmFixture(t);
    const counts = { fetch: 0 };
    const run = workflow.runLocalWorkflow({ ...options(f), env: { GODAGENT_TEST_PHASE_KEY: 'controlled-workflow-secret' },
      createProviderPhaseHostImpl: controlled(counts, uncertain) });
    let first;
    if (uncertain) await assert.rejects(run);
    else first = await run;
    assert.equal(counts.fetch, 1);
    const recovered = await workflow.reconcileLocalWorkflow({ ...options(f), createProviderPhaseHostImpl: controlled(counts) });
    assert.equal(recovered.status, uncertain ? 'pending' : 'completed');
    if (uncertain) assert.equal(recovered.artifact, null);
    else {
      assert.equal(recovered.artifact.replayed, true);
      assert.deepEqual(recovered.receipt, first.receipt);
      assert.equal(await readFile(recovered.artifact.path, 'utf8'), await readFile(first.artifact.path, 'utf8'));
    }
    const fresh = await cli(f);
    assert.equal(fresh.code, uncertain ? 3 : 0);
    assert.equal(JSON.parse(fresh.stdout).status, uncertain ? 'pending' : 'completed');
    assert.equal(counts.fetch, 1);
  });
}

test('reconcile refuses legacy workflows before constructing a provider', async t => {
  let hosts = 0;
  for (const effectOnlyTask of [undefined, { question: 'four?' }]) {
    const f = await prepareRecoveryFixture(t, { effectOnlyTask });
    await assert.rejects(workflow.reconcileLocalWorkflow({ ...options(f),
      createProviderPhaseHostImpl: () => { hosts++; throw new Error('constructor forbidden'); } }), /reconciliation requires workflow version 3/);
    assert.equal((await cli(f)).code, 1);
  }
  assert.equal(hosts, 0);
});

test('wrong input/Realm pins and aliased distribution fail before provider construction', async t => {
  const f = await prepareArtifactRealmFixture(t);
  const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8'));
  let hosts = 0;
  const opts = { ...options(f), createProviderPhaseHostImpl: () => { hosts++; throw new Error('constructor forbidden'); } };
  const wrong = structuredClone(manifest); wrong.realmBinding.contractDigest = 'a'.repeat(64);
  await writeFile(f.manifestPath, json(wrong));
  await assert.rejects(workflow.reconcileLocalWorkflow({ ...opts, expectedManifestDigest: sha256Text(json(wrong)) }));
  await writeFile(f.manifestPath, json(manifest));
  const path = join(f.workspace, 'mission-request.json');
  const original = await readFile(path, 'utf8');
  await writeFile(path, '{}\n');
  await assert.rejects(workflow.reconcileLocalWorkflow(opts), /prepared workflow input changed/);
  await writeFile(path, original);
  const distribution = join(f.workspace, 'admission', 'distribution');
  const target = join(f.workspace, 'moved-distribution');
  await rename(distribution, target);
  await symlink(target, distribution, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(workflow.reconcileLocalWorkflow(opts), /aliased/);
  assert.equal(hosts, 0);
});

test('reconciliation does not override a routing refusal, and CLI reports code 3', async t => {
  const f = await prepareArtifactRealmFixture(t, config => {
    config.request = structuredClone(config.request);
    config.request.requestedAuthority = ['realm:write'];
    config.request.hostCeiling.availableAuthority = ['realm:write'];
    config.hostPolicy.authority = ['realm:write'];
    config.hostPolicy.hostContext.availableAuthority = ['realm:write'];
    delete config.request.effectAssessment;
    config.request = prepareLocalArtifactEffectRequest(config.request,
      { expectedProducerDescriptorDigest: config.effectOnly.producerDescriptorDigest });
  });
  const counts = { fetch: 0 };
  const result = await workflow.reconcileLocalWorkflow({ ...options(f), createProviderPhaseHostImpl: controlled(counts) });
  assert.equal(result.status, 'needs-decision'); assert.equal(result.artifact, null);
  assert.equal(counts.fetch, 0);
  const fresh = await cli(f);
  assert.equal(fresh.code, 3);
  assert.equal(JSON.parse(fresh.stdout).status, 'needs-decision');
  assert.equal((await cli(f, ['--execute', 'true'])).code, 2);
});
