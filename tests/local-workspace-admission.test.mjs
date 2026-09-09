import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, readFile, writeFile, rm, realpath, access } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { admitLocalCreation } from '../src/genesis/local-admission.mjs';
import { readAdmissionBinding } from '../src/host/admitted-identity-boundary.mjs';
import { localGenesisAdmission } from '../src/host/local-genesis-admission.mjs';
import { compileCortexBindingCandidate } from '../src/cortex/binding-compiler.mjs';
import { localArtifactEffectProducer } from '../src/host/structured-effect-producer.mjs';
import { verifyDistributionRealmContract } from '../src/realm/distribution-contract.mjs';
import { createPersistentLocalRealm } from '../src/realm/local-persistent-realm.mjs';
import { inspectArtifactRealmForHost } from '../examples/local-artifact-workflow/realm-binding.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';

const capabilities = ['artifact.publish', 'artifact.verify', 'workspace.export', 'workspace.revise', 'workspace.test'];
const json = value => `${canonicalJson(value)}\n`;
const contract = () => ({ schemaVersion: 3, profile: 'local-workspace-v3', realmId: 'reviewed-workspace',
  version: '1.0.0', trustModel: 'operator-local', capabilities: [...capabilities],
  artifactStore: { operation: 'publish-local-artifact', producerDescriptorDigest: sha256Value(localArtifactEffectProducer),
    relativeRoot: 'artifacts', maximumBytes: 65536, naming: 'sha256-canonical-json',
    publication: 'exclusive-hard-link', replay: 'verify-identical-canonical-json' },
  workspace: { relativeRoot: 'workspace-revisions', maximumFiles: 4, maximumRevisionBytes: 131072,
    browserProfile: 'host-reviewed-browser-local-v1', independentReviewRequired: true, sourceMutation: false },
  privacy: { retention: 'operator-managed', automaticDeletion: false },
});
const request = () => ({ schemaVersion: 1,
  task: { taskId: 'workspace-test', hostAdapterId: 'workspace-host-v1', revocationEpoch: 0 },
  mission: { missionId: 'workspace-mission', objective: 'propose one selected app repair',
    successEvidence: ['independent browser result'], stopConditions: ['host review absent'],
    budget: { maxCycles: 3, maxCompletionTokens: 4096 },
    observation: { observationId: 'workspace-observation', summary: 'selected first-party app', evidenceDigests: ['a'.repeat(64)] } },
  maxProjectionBytes: 65536,
});
async function prepare(t, selectedCapabilities = capabilities) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-workspace-admission-'));
  t.after(async () => {
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child.startsWith('godagents-workspace-admission-') && !child.includes('..') && !isAbsolute(child));
    assert.equal(await realpath(root), resolve(root));
    await rm(root, { recursive: true, force: true });
  });
  const source = join(root, 'creation-source');
  await cp(new URL('../fixtures/creation/', import.meta.url), source, { recursive: true });
  for (const [file, change] of [
    ['creation-candidate.json', value => { value.realm.requiredCapabilities = [...selectedCapabilities]; }],
    ['creation-policy.json', value => { value.allowedRealmCapabilities = [...selectedCapabilities]; }],
    ['modules/embodiment.json', value => { value.payload.requiredRealmCapabilities = [...selectedCapabilities]; }],
  ]) {
    const path = join(source, file), value = JSON.parse(await readFile(path, 'utf8'));
    change(value); await writeFile(path, json(value));
  }
  const policyPath = join(source, 'creation-policy.json');
  const expectedPolicyDigest = sha256Value(JSON.parse(await readFile(policyPath, 'utf8')));
  const creationDir = join(root, 'creation');
  const creation = await compileCreation({ candidatePath: join(source, 'creation-candidate.json'), policyPath,
    expectedPolicyDigest, expressionPath: join(source, 'expression-overlay.json'),
    moduleDirectory: join(source, 'modules'), outputDir: creationDir });
  const realmContractPath = join(root, 'realm.json'), promptArtifactPath = join(root, 'prompt.md');
  await writeFile(realmContractPath, json(contract()));
  await writeFile(promptArtifactPath, '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: workspace-admission.test.json -->\n# Workspace admission fixture\n');
  const workspace = join(root, 'workspace');
  return { root, workspace, input: { creationDir, expectedPolicyDigest, expectedCreationBuildId: creation.manifest.buildId,
    realmContractPath, promptArtifactPath, workspace, instanceId: 'workspace-admission-test', creatorRef: 'creator:dom',
    checkpointPurpose: 'verify inert workspace admission', clock: () => '2026-09-08T12:00:00.000Z' } };
}

test('fresh workspace creation reaches actual admission and the exact inert cortex resource envelope', async t => {
  const prepared = await prepare(t);
  await admitLocalCreation(prepared.input);
  const root = join(prepared.workspace, 'admission'), binding = await readAdmissionBinding(root);
  const result = await compileCortexBindingCandidate({ admission: localGenesisAdmission(root, binding), request: request() });
  assert.equal(result.fullEnvelope.binding.instanceId, 'workspace-admission-test');
  assert.equal(result.fullEnvelope.authority.realmContractDigest, sha256Value(contract()));
  assert.deepEqual(result.fullEnvelope.authority.realmCapabilities, [...capabilities].sort());
  const expectedLimits = { profile: 'local-workspace-v3', maximumArtifactBytes: 65536,
    maximumFiles: 4, maximumRevisionBytes: 131072, browserProfile: 'host-reviewed-browser-local-v1',
    independentReviewRequired: true, sourceMutation: false };
  assert.deepEqual(result.fullEnvelope.authority.resourceLimits, expectedLimits);
  assert.deepEqual(result.modelProjection.authority.resourceLimits, expectedLimits);
  assert.equal(result.fullEnvelope.authority.state, 'inert');
  assert.deepEqual(result.fullEnvelope.authority.grantedEffects, []);
  assert.equal(result.fullEnvelope.binding.active, false);
  assert.ok(Object.isFrozen(result.fullEnvelope.authority.resourceLimits));
  for (const mutate of [
    value => { delete value.maximumFiles; }, value => { value.sourceMutation = true; },
    value => { value.independentReviewRequired = false; }, value => { value.maximumRevisionBytes = 4194305; },
  ]) {
    const changed = structuredClone(result.fullEnvelope); mutate(changed.authority.resourceLimits);
    assert.throws(() => assertSchema('cortex-identity-envelope', changed));
  }
});

test('workspace declarations reject weakened permissions, unsupported bounds and unknown fields', () => {
  const inspected = verifyDistributionRealmContract(contract());
  assert.equal(inspected.profile, 'local-workspace-v3');
  assert.ok(Object.isFrozen(inspected.capabilities));
  for (const mutate of [
    c => { c.profile = 'local-artifact-v2'; }, c => { c.schemaVersion = 4; },
    c => { c.trustModel = 'fixture-local'; }, c => { c.capabilities.pop(); },
    c => { c.capabilities[4] = 'artifact.publish'; }, c => { c.capabilities.push('filesystem.write'); },
    c => { c.authority = ['admin']; }, c => { c.artifactStore.producerDescriptorDigest = 'a'.repeat(64); },
    c => { c.artifactStore.maximumBytes = 0; }, c => { c.artifactStore.operation = 'execute-code'; },
    c => { c.artifactStore.command = 'ignored'; }, c => { c.artifactStore.relativeRoot = '../outside'; },
    c => { c.workspace.relativeRoot = '../outside'; }, c => { c.workspace.maximumFiles = 0; },
    c => { c.workspace.maximumFiles = 17; }, c => { c.workspace.maximumFiles = 1.5; },
    c => { c.workspace.maximumRevisionBytes = 0; }, c => { c.workspace.maximumRevisionBytes = 4194305; },
    c => { c.workspace.maximumRevisionBytes = 1.5; }, c => { c.workspace.browserProfile = 'unrestricted'; },
    c => { c.workspace.independentReviewRequired = false; }, c => { c.workspace.sourceMutation = true; },
    c => { c.workspace.approved = true; }, c => { c.privacy.automaticDeletion = true; },
  ]) {
    const changed = contract(); mutate(changed);
    assert.throws(() => verifyDistributionRealmContract(changed));
  }
  const boundary = contract(); boundary.workspace.maximumFiles = 16; boundary.workspace.maximumRevisionBytes = 4194304;
  assert.equal(verifyDistributionRealmContract(boundary).schemaVersion, 3);
});

test('fresh workspace admission rejects a missing creation capability without publishing an actor', async t => {
  const prepared = await prepare(t, capabilities.filter(value => value !== 'workspace.test'));
  await assert.rejects(() => admitLocalCreation(prepared.input), { code: 'compatibility-invalid' });
  await assert.rejects(() => access(join(prepared.workspace, 'admission', 'binding.json')), { code: 'ENOENT' });
});

test('old artifact and counter hosts cannot use a workspace declaration to gain effects', async t => {
  const prepared = await prepare(t), statePath = join(prepared.root, 'counter.json');
  assert.throws(() => inspectArtifactRealmForHost({ contract: contract(), maximumArtifactBytes: 1024 }), /profile/);
  await assert.rejects(() => createPersistentLocalRealm({ contract: contract(), statePath }));
  await assert.rejects(() => access(statePath), { code: 'ENOENT' });
});

test('changing admitted workspace limits cannot be adopted as a new cortex binding', async t => {
  const prepared = await prepare(t); await admitLocalCreation(prepared.input);
  const root = join(prepared.workspace, 'admission'), binding = await readAdmissionBinding(root);
  const changed = contract(); changed.workspace.maximumFiles = 8;
  await writeFile(join(root, 'distribution', 'realm-contract.json'), json(changed));
  await assert.rejects(() => compileCortexBindingCandidate({ admission: localGenesisAdmission(root, binding), request: request() }), /digest|mismatch|invalid/);
});
