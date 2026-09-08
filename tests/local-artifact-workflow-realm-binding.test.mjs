import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, writeFile, rename, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { loadVerifiedDistribution } from '../src/foundry/compile.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { runLocalWorkflow } from '../examples/local-artifact-workflow/run.mjs';
import { prepareArtifactRealmFixture } from './helpers/local-artifact-realm-fixture.mjs';
const api = await import('../examples/local-artifact-workflow/realm-binding.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const json = value => `${canonicalJson(value)}\n`;
const options = prepared => ({ manifestPath: prepared.manifestPath, expectedManifestDigest: prepared.manifestDigest,
  env: { GODAGENT_TEST_PHASE_KEY: 'synthetic-artifact-realm-key' } });
function controlledHost(onCall = async () => {}, { content = 'four', onCheckpoint = async () => {} } = {}) {
  return options => createProviderPhaseHost({ ...options,
    checkpoint: (name, phase, digest) => onCheckpoint(name, phase, digest, options.runtimeRoot),
    fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    await onCall(body);
    return new Response(json({ id: 'artifact-realm-controlled', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: json({ content }).trimEnd() } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
        completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } } }),
    { status: 200, headers: { 'content-type': 'application/json' } });
  } });
}

test('protocol 3 pins its actual admitted Realm and preserves the binding through fresh-process replay', async t => {
  const prepared = await prepareArtifactRealmFixture(t);
  const manifest = JSON.parse(await readFile(prepared.manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.realmBinding.profile, 'local-artifact-v2');
  const verifiedDistribution = await loadVerifiedDistribution(join(prepared.workspace, 'admission', 'distribution'));
  assert.equal(typeof api.captureArtifactRealmBinding, 'function');
  const binding = api.captureArtifactRealmBinding({ verifiedDistribution, maximumArtifactBytes: 1024 });
  assert.deepEqual(binding, manifest.realmBinding);
  assert.ok(Object.isFrozen(binding));
  assert.equal(api.verifyArtifactRealmBinding({ verifiedDistribution, binding, maximumArtifactBytes: 1024 }), 65536);
  let calls = 0;
  const limits = [];
  const inspectLimits = value => {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'resourceLimits')) limits.push(value.resourceLimits);
    for (const child of Object.values(value)) inspectLimits(child);
  };
  const first = await runLocalWorkflow({ ...options(prepared), createProviderPhaseHostImpl: controlledHost(async body => {
    calls++; inspectLimits(JSON.parse(body.messages[1].content));
  }) });
  assert.equal(first.status, 'completed');
  assert.equal(calls, 1);
  assert.ok(limits.length > 0);
  for (const value of limits) assert.deepEqual(value, { profile: 'local-artifact-v2', maximumArtifactBytes: 65536 });
  assert.equal(JSON.parse(await readFile(first.artifact.path, 'utf8')).content, 'four');
  const replayCode = `import {runLocalWorkflow} from './examples/local-artifact-workflow/run.mjs';
    let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('no retry');};
    const input=JSON.parse(process.argv[1]);const result=await runLocalWorkflow({...input,env:{}});
    console.log(JSON.stringify({status:result.status,artifact:result.artifact,calls}));`;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', replayCode,
    JSON.stringify({ manifestPath: prepared.manifestPath, expectedManifestDigest: prepared.manifestDigest })],
  { cwd: process.cwd(), windowsHide: true, timeout: 30000,
    env: { SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA } });
  const replay = JSON.parse(stdout);
  assert.equal(replay.status, 'completed');
  assert.equal(replay.calls, 0);
  assert.equal(replay.artifact.replayed, true);
  assert.equal(replay.artifact.artifactDigest, first.artifact.artifactDigest);
});

test('wrong Realm binding or a workflow version downgrade fails before provider construction', async t => {
  const prepared = await prepareArtifactRealmFixture(t);
  const original = JSON.parse(await readFile(prepared.manifestPath, 'utf8'));
  let hosts = 0;
  for (const mutate of [
    m => { m.realmBinding.profile = 'fixture-local-v1'; },
    m => { m.realmBinding.contractDigest = 'a'.repeat(64); },
    m => { m.realmBinding.distributionBuildId = 'b'.repeat(64); },
    m => { m.realmBinding.producerDescriptorDigest = 'c'.repeat(64); },
    m => { m.realmBinding.authority = ['admin']; },
    m => { m.schemaVersion = 2; delete m.realmBinding; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    const text = json(changed); await writeFile(prepared.manifestPath, text);
    await assert.rejects(() => runLocalWorkflow({ ...options(prepared), expectedManifestDigest: sha256Text(text),
      createProviderPhaseHostImpl: () => { hosts++; throw new Error('must not construct provider'); } }));
  }
  assert.equal(hosts, 0);
  await assert.rejects(() => access(join(prepared.workspace, 'artifacts')), { code: 'ENOENT' });
});

test('Realm drift during native work cannot publish an artifact or refresh the recorded binding', async t => {
  const prepared = await prepareArtifactRealmFixture(t);
  const before = await readFile(prepared.manifestPath, 'utf8');
  const realmPath = join(prepared.workspace, 'admission', 'distribution', 'realm-contract.json');
  let calls = 0;
  const originalProviderEvidence = [];
  await assert.rejects(() => runLocalWorkflow({ ...options(prepared),
    createProviderPhaseHostImpl: controlledHost(async () => {
      calls++;
      const realm = JSON.parse(await readFile(realmPath, 'utf8'));
      realm.artifactStore.maximumBytes--;
      await writeFile(realmPath, json(realm));
    }, { onCheckpoint: async (name, phase, digest, root) => {
      if (name !== 'after-openai-phase-completion-persisted') return;
      for (const name of ['prepared.json', 'attempt.json', 'completion.json']) {
        const path = join(root, phase, digest, name);
        originalProviderEvidence.push({ path, bytes: await readFile(path, 'utf8') });
      }
    } }) }));
  assert.equal(calls, 1);
  assert.equal(originalProviderEvidence.length, 3);
  for (const record of originalProviderEvidence) assert.equal(await readFile(record.path, 'utf8'), record.bytes);
  assert.equal(await readFile(prepared.manifestPath, 'utf8'), before);
  await assert.rejects(() => access(join(prepared.workspace, 'artifacts')), { code: 'ENOENT' });
});

test('unsupported Realm profile and insufficient byte ceiling stop preparation before workspace creation', async t => {
  for (const variant of ['profile', 'ceiling']) {
    let workspace;
    await assert.rejects(() => prepareArtifactRealmFixture(t, async (config, target) => {
      workspace = target;
      const realm = JSON.parse(await readFile(config.admission.realmContractPath, 'utf8'));
      if (variant === 'profile') realm.profile = 'unknown-artifact-world';
      else realm.artifactStore.maximumBytes = 1;
      await writeFile(config.admission.realmContractPath, json(realm));
    }));
    assert.ok(workspace);
    await assert.rejects(() => access(workspace), { code: 'ENOENT' });
  }
});

test('an aliased admitted distribution is rejected before provider construction', async t => {
  const prepared = await prepareArtifactRealmFixture(t);
  const original = join(prepared.workspace, 'admission', 'distribution');
  const target = join(prepared.workspace, 'moved-distribution');
  await rename(original, target);
  await symlink(target, original, process.platform === 'win32' ? 'junction' : 'dir');
  let hosts = 0;
  await assert.rejects(() => runLocalWorkflow({ ...options(prepared),
    createProviderPhaseHostImpl: () => { hosts++; throw new Error('must not construct provider'); } }), /aliased/);
  assert.equal(hosts, 0);
});

test('a reflected credential cannot be published through the new Realm profile', async t => {
  const prepared = await prepareArtifactRealmFixture(t);
  let calls = 0;
  await assert.rejects(() => runLocalWorkflow({ ...options(prepared),
    createProviderPhaseHostImpl: controlledHost(async () => { calls++; }, { content: 'synthetic-artifact-realm-key' }) }));
  assert.equal(calls, 1);
  await assert.rejects(() => access(join(prepared.workspace, 'artifacts')), { code: 'ENOENT' });
});
