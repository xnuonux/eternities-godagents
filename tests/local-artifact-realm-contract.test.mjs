import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { localArtifactEffectProducer } from '../src/host/structured-effect-producer.mjs';
import { compileDistribution, loadVerifiedDistribution } from '../src/foundry/compile.mjs';
import { createPersistentLocalRealm } from '../src/realm/local-persistent-realm.mjs';
const api = await import('../src/realm/distribution-contract.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const fixture = name => new URL(`../fixtures/${name}`, import.meta.url);
const json = value => `${canonicalJson(value)}\n`;
const contract = () => ({
  schemaVersion: 2, profile: 'local-artifact-v2', realmId: 'operator-artifacts', version: '1.0.0',
  trustModel: 'operator-local', capabilities: ['artifact.publish', 'artifact.verify'],
  artifactStore: { operation: 'publish-local-artifact', producerDescriptorDigest: sha256Value(localArtifactEffectProducer),
    relativeRoot: 'artifacts', maximumBytes: 65536, naming: 'sha256-canonical-json',
    publication: 'exclusive-hard-link', replay: 'verify-identical-canonical-json' },
  privacy: { retention: 'operator-managed', automaticDeletion: false },
});
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-artifact-realm-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function build(t, realm = contract()) {
  const root = await temporary(t);
  const genome = JSON.parse(await readFile(fixture('agent-genome.json'), 'utf8'));
  genome.blueprint = { id: 'artifact-contract-test', version: '1.0.0' };
  genome.realm.requiredCapabilities = ['artifact.publish', 'artifact.verify'];
  const genomePath = join(root, 'genome.json');
  const realmContractPath = join(root, 'realm.json');
  await writeFile(genomePath, json(genome));
  await writeFile(realmContractPath, json(realm));
  const outputDir = join(root, 'distribution');
  const result = await compileDistribution({ genomePath, realmContractPath,
    promptArtifactPath: fixture('prompt-os-artifact.md'), outputDir });
  return { root, outputDir, manifest: result.manifest };
}

test('distribution Realm inspection validates and freezes a snapshot without changing caller data', () => {
  assert.equal(typeof api.verifyDistributionRealmContract, 'function');
  const input = contract();
  const inspected = api.verifyDistributionRealmContract(input);
  assert.deepEqual(inspected, { schemaVersion: 2, profile: 'local-artifact-v2',
    contractDigest: sha256Value(input), capabilities: ['artifact.publish', 'artifact.verify'] });
  assert.ok(Object.isFrozen(inspected));
  assert.ok(Object.isFrozen(inspected.capabilities));
  assert.ok(!Object.isFrozen(input));
  input.capabilities.push('filesystem.write');
  assert.deepEqual(inspected.capabilities, ['artifact.publish', 'artifact.verify']);
});

test('unsupported versions, producer, authority, capabilities and storage claims are rejected', () => {
  assert.equal(typeof api.verifyDistributionRealmContract, 'function');
  const cases = [
    value => { value.schemaVersion = 3; }, value => { value.profile = 'general-world'; },
    value => { value.trustModel = 'fixture-local'; }, value => { value.authority = ['admin']; },
    value => { value.capabilities.push('filesystem.write'); }, value => { value.capabilities = ['artifact.publish']; },
    value => { value.capabilities = ['artifact.publish', 'artifact.publish']; },
    value => { value.artifactStore.producerDescriptorDigest = 'a'.repeat(64); },
    value => { value.artifactStore.producerDescriptorDigest = 'G'.repeat(64); },
    value => { value.artifactStore.producerDescriptorDigest = 'short'; },
    value => { value.artifactStore.operation = 'delete-directory'; },
    value => { value.artifactStore.relativeRoot = '../outside'; },
    value => { value.artifactStore.relativeRoot = 'C:/outside'; },
    value => { value.artifactStore.maximumBytes = 0; }, value => { value.artifactStore.maximumBytes = 16777217; },
    value => { value.artifactStore.maximumBytes = 1.5; },
    value => { value.artifactStore.publication = 'overwrite'; },
    value => { value.artifactStore.replay = 'trust-name'; },
    value => { value.artifactStore.naming = 'model-selected-path'; },
    value => { value.privacy.retention = 'test-only'; },
    value => { value.privacy.automaticDeletion = true; }, value => { value.privacy.encrypted = true; },
    value => { delete value.privacy; },
  ];
  for (const mutate of cases) {
    const input = contract(); mutate(input);
    assert.throws(() => api.verifyDistributionRealmContract(input));
  }
  for (const input of [null, [], {}, false]) assert.throws(() => api.verifyDistributionRealmContract(input));
});

test('the local artifact profile compiles and verifies using the existing distribution container', async t => {
  const { outputDir, manifest } = await build(t);
  const loaded = await loadVerifiedDistribution(outputDir);
  assert.equal(loaded.manifest.buildId, manifest.buildId);
  assert.deepEqual(loaded.realmContract, contract());
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.compatibility.schemaRange, '1');
  assert.equal(manifest.sources.find(row => row.role === 'realm').sha256, sha256Text(json(contract())));
});

test('contract changes alter distribution identity even with the same Realm id', async t => {
  const first = await build(t);
  const altered = contract(); altered.artifactStore.maximumBytes = 32768;
  const second = await build(t, altered);
  assert.notEqual(first.manifest.buildId, second.manifest.buildId);
  assert.deepEqual(first.manifest.compatibility.realmIds, second.manifest.compatibility.realmIds);
});

test('distribution loading rejects valid-but-unpinned Realm bytes and unsupported embedded profiles', async t => {
  const { outputDir } = await build(t);
  const changed = contract(); changed.artifactStore.maximumBytes = 2048;
  await writeFile(join(outputDir, 'realm-contract.json'), json(changed));
  await assert.rejects(() => loadVerifiedDistribution(outputDir), /artifact digest mismatch/);
  changed.profile = 'unimplemented-realm';
  await writeFile(join(outputDir, 'realm-contract.json'), json(changed));
  await assert.rejects(() => loadVerifiedDistribution(outputDir), {
    name: 'SchemaError', schemaName: 'local-artifact-realm-contract', pointer: '/profile', rule: 'const',
  });
});

test('the v1 container compatibility declaration cannot be rewritten as the embedded Realm version', async t => {
  const { outputDir } = await build(t);
  const path = join(outputDir, 'distribution-manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.compatibility.schemaRange = '2';
  await writeFile(path, json(manifest));
  await assert.rejects(() => loadVerifiedDistribution(outputDir), /compatibility mismatch/);
});

test('legacy distributions retain their exact previously measured manifest bytes and inspection profile', async t => {
  assert.equal(typeof api.verifyDistributionRealmContract, 'function');
  const outputDir = await temporary(t);
  const legacy = JSON.parse(await readFile(fixture('realm-contract.json'), 'utf8'));
  assert.equal(api.verifyDistributionRealmContract(legacy).profile, 'fixture-local-v1');
  const result = await compileDistribution({ genomePath: fixture('agent-genome.json'),
    promptArtifactPath: fixture('prompt-os-artifact.md'), realmContractPath: fixture('realm-contract.json'), outputDir });
  assert.equal(result.manifest.buildId, '31d29b12d3747e8190ee1d5590f7cdb1b506a96208f6e98093174acd3c74fc33');
  assert.equal(sha256Text(await readFile(join(outputDir, 'distribution-manifest.json'), 'utf8')),
    '92d244672568601a580a723858e7fbd02b49df1cf95244f623c9d207628ae3e6');
  await loadVerifiedDistribution(outputDir);
});

test('a v2 artifact contract cannot instantiate the legacy counter Realm or create state', async t => {
  const root = await temporary(t);
  const statePath = join(root, 'counter.json');
  await assert.rejects(() => createPersistentLocalRealm({ contract: contract(), statePath }));
  await assert.rejects(() => access(statePath), { code: 'ENOENT' });
});
