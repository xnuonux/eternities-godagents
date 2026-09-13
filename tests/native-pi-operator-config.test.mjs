import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Value } from '../src/core/digest.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { loadNativeOperatorConfig, parseNativeOperatorArgs, validateNativeOperatorConfig } from '../src/host/native-pi-operator-config.mjs';

const local=part=>join(tmpdir(),'native-op-config-fixture',part);
const base = () => ({
  schemaVersion: 1, protocolId: 'eternities-native-pi-operator-v1',
  piPackageRoot: local('pi'), authPath: local('auth.json'),
  cwd: local('workspace'), sessionRoot: local('sessions'),
  admission: { receiptPath:local('a/r.json'), creationDir:local('a/creation'), distributionDir:local('a/dist'), expectedPolicyDigest:'a'.repeat(64), expectedCreationBuildId:'b'.repeat(64), instanceId:'instance-1', creatorRef:'creator-1', transactionDir:local('a/tx'), journalPath:local('a/journal.json'), keelRoot:local('a/keel') },
  mission: { taskId:'task-1', missionId:'mission-1' }, model: { provider:'xai', id:'grok-4.6', maxTokens:4096 },
  grant: { allowedTools:['read','write'], maxToolCalls:20, expiresAt:'2099-01-01T00:00:00.000Z' }, limits: { maxRunMs:60000 },
});
const errorCode = fn => assert.throws(fn, /native-(?:operator|godskills):/);
const godskillsPolicy = () => ({
  schemaVersion: 1, protocolId: 'eternities-native-godskills-policy-v1',
  releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
  routingPin: pinnedGodskillsRoutingExecutable(), sourceStateEpoch: 0,
  hostEnvelope: {
    availableAuthority: ['local-read','local-write'], permittedEffects: ['local-read','local-write'],
    availablePreconditions: ['repository-present','settled-outcome'], forbiddenCapabilities: [],
    maximumRisk: 'moderate', minimumEvidenceConfidence: 'verified', contextBudget: 16000, maxCompositionSize: 3,
  }, explicitMethodRequests: [], reviewAvailable: false, maximumDisclosureBytes: 32768,
});
const withGodskills = config => ({ ...config, godskills: { policy: godskillsPolicy(), expectedPolicyDigest: sha256Value(godskillsPolicy()) } });

test('parses the exact bounded operator CLI', () => {
  assert.deepEqual(parseNativeOperatorArgs(['launch','--config',local('c.json'),'--pin','a'.repeat(64),'--prompt-file',local('p.txt')]), { command:'launch', configPath:local('c.json'), expectedConfigDigest:'a'.repeat(64), promptPath:local('p.txt') });
  assert.throws(() => parseNativeOperatorArgs(['status','--config',local('c.json'),'--pin','a'.repeat(64),'--wat']), /native-operator:unknown-flag/);
  assert.throws(() => parseNativeOperatorArgs(['status','--config',local('c.json'),'--config',local('d.json'),'--pin','a'.repeat(64)]), /native-operator:duplicate-flag/);
});

test('validates and round-trips an explicit configuration', async t => {
  const config = base();
  assert.deepEqual(validateNativeOperatorConfig(config), config);
  const dir = await mkdtemp(join(tmpdir(), 'native-op-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path = join(dir, 'config.json'); await writeFile(path, JSON.stringify(config));
  assert.deepEqual(await loadNativeOperatorConfig({ configPath:path, expectedConfigDigest:sha256Value(config) }), config);
});

test('accepts an opt-in pinned Godskills policy', () => {
  const config = withGodskills(base());
  assert.deepEqual(validateNativeOperatorConfig(config), config);
});

test('accepts only a bounded operator-pinned transient recovery allowance', () => {
  for(const maxProviderRetries of [0,1,2]) {
    const config=base();config.limits.maxProviderRetries=maxProviderRetries;
    assert.deepEqual(validateNativeOperatorConfig(config),config);
  }
  for(const maxProviderRetries of [-1,3,1.5,'1',null,undefined]) {
    const config=base();config.limits.maxProviderRetries=maxProviderRetries;
    errorCode(()=>validateNativeOperatorConfig(config));
  }
});

test('rejects tampered Godskills pins and unknown wrapper fields', () => {
  const config = withGodskills(base());
  errorCode(() => validateNativeOperatorConfig({ ...config, godskills: { ...config.godskills, expectedPolicyDigest: 'c'.repeat(64) } }));
  errorCode(() => validateNativeOperatorConfig({ ...config, godskills: { ...config.godskills, injectedUnknownWrapper: true } }));
});

test('rejects null or undefined Godskills options when the property is present', () => {
  errorCode(() => validateNativeOperatorConfig({ ...base(), godskills: null }));
  errorCode(() => validateNativeOperatorConfig({ ...base(), godskills: undefined }));
});

test('preserves the old plain configuration exactly', () => {
  const config = base();
  assert.deepEqual(validateNativeOperatorConfig(config), config);
  assert.deepEqual(Object.keys(validateNativeOperatorConfig(config)).sort(), Object.keys(config).sort());
});

test('rejects unsafe shape, authority, paths, limits, and stale pin before use', async t => {
  const invalid = [
    ['inline auth', { authToken:'secret' }], ['relative path', { cwd:'relative' }], ['extra authority', { grant:{ extraAuthority:true } }],
    ['duplicate tools', { grant:{ allowedTools:['read','read'] } }], ['bad tool', { grant:{ allowedTools:['unknown'] } }],
    ['bad limits', { limits:{ maxRunMs:0 } }], ['bad tokens', { model:{ maxTokens:500001 } }], ['bad schema', { schemaVersion:2 }],
  ];
  for (const [, change] of invalid) errorCode(() => validateNativeOperatorConfig({ ...base(), ...change, grant:{...base().grant,...change.grant}, model:{...base().model,...change.model}, limits:{...base().limits,...change.limits} }));
  const dir = await mkdtemp(join(tmpdir(), 'native-op-')); const path = join(dir, 'config.json'); const config=base(); await writeFile(path, JSON.stringify(config));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await assert.rejects(() => loadNativeOperatorConfig({configPath:path, expectedConfigDigest:'c'.repeat(64)}), /native-operator:/);
});
