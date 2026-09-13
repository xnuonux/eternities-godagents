import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Value } from '../src/core/digest.mjs';
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
const errorCode = fn => assert.throws(fn, /native-operator:/);

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
