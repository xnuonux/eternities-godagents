import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { defaultLocalInstanceRegistryRoot } from '../src/host/local-instance-registry.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import { prepareArtifactRealmFixture } from './helpers/local-artifact-realm-fixture.mjs';
import { prepareRecoveryFixture } from './helpers/local-workflow-recovery-fixture.mjs';
const api = await import('../examples/local-artifact-workflow/owner.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const options = f => ({ manifestPath: f.manifestPath, expectedManifestDigest: f.manifestDigest, env: {} });
const json = v => `${canonicalJson(v)}\n`;
const read = async (f, path) => JSON.parse(await readFile(join(f.workspace, path), 'utf8'));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function controlled(count, gate) {
  return input => createProviderPhaseHost({ ...input, fetchImpl: async (_url, init) => {
    count.calls++;
    if (gate) { gate.entered.resolve(); await gate.release.promise; }
    const body = JSON.parse(init.body);
    return new Response(json({ id: 'controlled-owner', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content: 'four' }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
        completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } } }),
    { status: 200, headers: { 'content-type': 'application/json' } });
  } });
}

test('workflow owner describes authenticated identity inertly and closes its issued capability', async t => {
  const f = await prepareArtifactRealmFixture(t);
  // Preparation already creates the empty provider directories for descriptors.
  const providerRoot = join(f.workspace, 'admission/vessel/provider-phase');
  const providerEntries = await readdir(providerRoot, { recursive: true });
  let held, hosts = 0;
  const result = await api.withLocalWorkflowOwner({ ...options(f), createProviderPhaseHostImpl: () => { hosts++; throw Error('forbidden'); } }, async owner => {
    held = owner; api.assertLocalWorkflowOwner(owner);
    await access(join(f.workspace, 'workflow-run.lock'));
    const d = await owner.describeArtifactBinding();
    const receipt = await read(f, 'admission/transaction/genesis-receipt.json');
    assert.equal(d.sourceBinding.actor.instanceId, f.instanceId);
    assert.equal(d.sourceBinding.actor.genomeDigest, receipt.genomeValueDigest);
    assert.equal(d.sourceBinding.actor.keelHeadDigest, receipt.keelHeadDigest);
    assert.equal(d.sourceBinding.admissionReceiptDigest, receipt.receiptDigest);
    assert.equal(d.sourceBinding.identityPolicyDigest, sha256Value(d.policy));
    assert.equal(d.sourceBinding.workflowManifestDigest, f.manifestDigest);
    assert.deepEqual(d.baseRequest, await read(f, 'mission-request.json'));
    assert.ok(Object.isFrozen(d.sourceBinding.actor));
    assert.deepEqual(await owner.describeArtifactBinding(), d);
    return 'scope-result';
  });
  assert.equal(result, 'scope-result'); assert.equal(hosts, 0);
  assert.throws(() => api.assertLocalWorkflowOwner({ ...held }), /issued|owner/);
  assert.throws(() => api.assertLocalWorkflowOwner(held), /closed/);
  await assert.rejects(held.describeArtifactBinding(), /closed/);
  await assert.rejects(held.launchArtifactMission({}), /closed/);
  await assert.rejects(access(join(f.workspace, 'workflow-run.lock')), { code: 'ENOENT' });
  assert.deepEqual(await readdir(providerRoot, { recursive: true }), providerEntries);
  await assert.rejects(access(join(defaultLocalInstanceRegistryRoot(), `${sha256Text(f.instanceId)}.json`)), { code: 'ENOENT' });
});

test('workflow owner runs a separate mission and reconciles it under one scope without editing root inputs', async t => {
  const f = await prepareArtifactRealmFixture(t), count = { calls: 0 };
  const files = ['workflow.json', 'mission-request.json', 'identity-policy.json', 'provider-policy.json'];
  const originals = await Promise.all(files.map(name => readFile(join(f.workspace, name), 'utf8')));
  await api.withLocalWorkflowOwner({ ...options(f), env: { GODAGENT_TEST_PHASE_KEY: 'controlled-owner-secret' },
    createProviderPhaseHostImpl: controlled(count) }, async owner => {
    const before = await owner.describeArtifactBinding();
    let request = structuredClone(before.baseRequest);
    request.task.taskId = 'owned-second-task'; request.mission.missionId = 'owned-second-mission';
    delete request.effectAssessment;
    request = prepareLocalArtifactEffectRequest(request, { expectedProducerDescriptorDigest: before.policy.runtime.effectProducerDescriptorDigest });
    request = structuredClone(request);
    const expectedRequest = structuredClone(request);
    const pending = owner.launchArtifactMission(request);
    request.mission.missionId = 'caller-mutated-after-launch';
    request.requestedAuthority.push('admin');
    const completed = await pending;
    assert.equal(completed.status, 'completed'); assert.equal(completed.missionId, 'owned-second-mission');
    assert.equal(completed.mission.artifact.content, 'four');
    assert.equal(completed.artifact.artifactDigest, sha256Value(completed.mission.artifact));
    assert.deepEqual(completed.usage, completed.mission.receipt.usage);
    const replay = await owner.reconcileArtifactMission(expectedRequest);
    assert.equal(replay.status, 'completed'); assert.equal(replay.artifact.replayed, true);
    assert.deepEqual(replay.mission, completed.mission);
    assert.deepEqual((await owner.describeArtifactBinding()).sourceBinding, before.sourceBinding);
    assert.equal(count.calls, 1);
  });
  assert.deepEqual(await Promise.all(files.map(name => readFile(join(f.workspace, name), 'utf8'))), originals);
});

test('workflow owner holds its lock for an unawaited in-flight call and rejects new work while closing', { timeout: 15000 }, async t => {
  const f = await prepareArtifactRealmFixture(t), count = { calls: 0 };
  const gate = { entered: deferred(), release: deferred() };
  t.after(() => gate.release.resolve());
  let held, call, exited = false;
  const scope = api.withLocalWorkflowOwner({ ...options(f), env: { GODAGENT_TEST_PHASE_KEY: 'controlled-owner-secret' },
    createProviderPhaseHostImpl: controlled(count, gate) }, async owner => {
    held = owner;
    call = owner.runPrepared('launch');
    await gate.entered.promise;
  });
  void scope.then(() => { exited = true; }, () => { exited = true; });
  await gate.entered.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(exited, false); await access(join(f.workspace, 'workflow-run.lock'));
  await assert.rejects(held.describeArtifactBinding(), /closing|closed/);
  gate.release.resolve(); await scope;
  const result = await call;
  assert.equal(result.status, 'completed'); assert.equal(count.calls, 1);
  assert.deepEqual(Object.keys(result).sort(), ['artifact', 'instanceId', 'missionId', 'receipt', 'status', 'usage']);
  await assert.rejects(access(join(f.workspace, 'workflow-run.lock')), { code: 'ENOENT' });
});

test('workflow owner rejects wrong source pins and legacy artifact operations before constructing a provider', async t => {
  const f = await prepareArtifactRealmFixture(t); let hosts = 0;
  const opts = { ...options(f), createProviderPhaseHostImpl: () => { hosts++; throw Error('forbidden'); } };
  await assert.rejects(api.withLocalWorkflowOwner({ ...opts, expectedManifestDigest: 'a'.repeat(64) }, () => {}), /digest/);
  await writeFile(join(f.workspace, 'mission-request.json'), '{}\n');
  await assert.rejects(api.withLocalWorkflowOwner(opts, () => {}), /input changed/);
  const legacy = await prepareRecoveryFixture(t, { effectOnlyTask: { question: 'four?' } });
  await api.withLocalWorkflowOwner({ ...options(legacy), createProviderPhaseHostImpl: opts.createProviderPhaseHostImpl }, async owner => {
    await assert.rejects(owner.describeArtifactBinding(), /version 3/);
    await assert.rejects(owner.reconcileArtifactMission({}), /version 3/);
  });
  assert.equal(hosts, 0);
});

test('workflow owner description rejects re-pinned policy Realm and manifest genesis mismatches', async t => {
  const f = await prepareArtifactRealmFixture(t);
  const policy = await read(f, 'identity-policy.json');
  const manifest = await read(f, 'workflow.json');
  const badPolicy = structuredClone(policy); badPolicy.realmId = 'different-realm';
  const badManifest = structuredClone(manifest);
  badManifest.identityPolicyDigest = sha256Value(badPolicy);
  badManifest.inputs.identityPolicy = sha256Text(json(badPolicy));
  await writeFile(join(f.workspace, 'identity-policy.json'), json(badPolicy));
  await writeFile(f.manifestPath, json(badManifest));
  await assert.rejects(api.withLocalWorkflowOwner({ ...options(f), expectedManifestDigest: sha256Text(json(badManifest)) },
    owner => owner.describeArtifactBinding()), /Realm|realm/);
  await writeFile(join(f.workspace, 'identity-policy.json'), json(policy));
  const badGenesis = { ...manifest, genesisId: 'a'.repeat(64) };
  await writeFile(f.manifestPath, json(badGenesis));
  await assert.rejects(api.withLocalWorkflowOwner({ ...options(f), expectedManifestDigest: sha256Text(json(badGenesis)) },
    owner => owner.describeArtifactBinding()), /genesis|identity/);
});

test('workflow owner drains a failed in-flight call before releasing the lock, without detached rejections', { timeout: 10000 }, async t => {
  const f = await prepareArtifactRealmFixture(t);
  const entered = deferred(), release = deferred();
  t.after(() => release.resolve());
  let call;
  const scope = api.withLocalWorkflowOwner({ ...options(f), createProviderPhaseHostImpl: async () => {
    entered.resolve(); await release.promise; throw new Error('owner-controlled-failure');
  } }, async owner => { call = owner.runPrepared('launch'); await entered.promise; });
  const rejected = assert.rejects(scope, /owner-controlled-failure/);
  await entered.promise;
  await access(join(f.workspace, 'workflow-run.lock'));
  release.resolve();
  await rejected;
  await assert.rejects(call, /owner-controlled-failure/);
  await assert.rejects(access(join(f.workspace, 'workflow-run.lock')), { code: 'ENOENT' });
});
