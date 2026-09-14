import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, writeFile, readdir, mkdir, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { nativeAdmission } from './helpers/native-host-admission.mjs';
import { sha256Value, sha256Text } from '../src/core/digest.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import * as operator from '../src/host/native-pi-operator.mjs';
import { loadNativeOperatorConfig, parseNativeOperatorArgs } from '../src/host/native-pi-operator-config.mjs';
import { nativePiCli } from '../src/host/native-pi-cli.mjs';
import { nativeSkillOptions } from './helpers/native-godskills-policy.mjs';

async function setup(t) {
  const f = await nativeAdmission(t);
  const admissionRoot = dirname(f.options.admission.transactionDir);
  const binding = JSON.parse(await readFile(join(admissionRoot, 'binding.json'), 'utf8'));
  const request = {
    schemaVersion: 1, protocolId: 'eternities-native-pi-preparation-v1',
    admissionRoot, expectedBindingDigest: binding.bindingDigest,
    piPackageRoot: join(f.root, 'absent-sdk'), authPath: join(f.root, 'absent-auth.json'),
    cwd: f.cwd, sessionRoot: join(f.root, 'new-session'), mission: f.options.request.mission,
    model: { provider: 'xai', id: 'grok-4.6', maxTokens: 16000 },
    grant: { allowedTools: ['read', 'write', 'edit'], maxToolCalls: 60, expiresAt: '2099-01-01T00:00:00.000Z' },
    limits: { maxRunMs: 60000, maxProviderRetries: 1 },
  };
  const outputPath = join(f.root, 'prepared.json');
  const run = (overrides = {}) => {
    assert.equal(typeof operator.prepareNativeOperator, 'function', 'offline preparation is missing');
    return operator.prepareNativeOperator({ request, expectedRequestDigest: sha256Value(request), outputPath, ...overrides });
  };
  return { f, binding, request, outputPath, run };
}

async function tree(root) {
  const result = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of Object.entries(await tree(path))) result[`${entry.name}/${key}`] = value;
    } else result[entry.name] = sha256Text(await readFile(path, 'utf8'));
  }
  return result;
}

test('preparation assembles the admitted actor without creating identity, session or credentials', async t => {
  const x = await setup(t), before = await tree(x.request.admissionRoot);
  const result = await x.run();
  assert.equal(result.status, 'configuration-prepared');
  assert.equal(result.configPath, x.outputPath);
  assert.equal(result.instanceId, 'native-pi-test-actor');
  assert.equal(result.admissionBindingDigest, x.binding.bindingDigest);
  const config = await loadNativeOperatorConfig({ configPath: x.outputPath, expectedConfigDigest: result.configDigest });
  const a = x.request.admissionRoot;
  assert.deepEqual(config.admission, {
    receiptPath: join(a, 'transaction', 'genesis-receipt.json'), creationDir: join(a, 'creation'),
    distributionDir: join(a, 'distribution'), expectedPolicyDigest: x.binding.policyDigest,
    expectedCreationBuildId: x.binding.creationBuildId, instanceId: 'native-pi-test-actor', creatorRef: 'creator:dom',
    transactionDir: join(a, 'transaction'), journalPath: join(a, 'vessel', 'journal.jsonl'), keelRoot: join(a, 'keels'),
  });
  assert.deepEqual(config.mission, x.request.mission);
  assert.deepEqual(config.model, x.request.model);
  assert.deepEqual(config.grant, x.request.grant);
  assert.deepEqual(config.limits, { maxRunMs: 60000, maxProviderRetries: 1 });
  assert.equal(Object.hasOwn(config, 'godskills'), false);
  assert.deepEqual(await tree(a), before);
  for (const path of [x.request.authPath, x.request.piPackageRoot, x.request.sessionRoot]) {
    await assert.rejects(access(path), e => e.code === 'ENOENT');
  }
  assert.doesNotMatch(JSON.stringify(result), /source is on disk|grok-4.6|absent-auth/);
});

test('preparation preserves explicit optional skill policy but rejects a stale release', async t => {
  const x = await setup(t); x.request.godskills = nativeSkillOptions();
  const result = await x.run();
  const config = await loadNativeOperatorConfig({ configPath: x.outputPath, expectedConfigDigest: result.configDigest });
  assert.deepEqual(config.godskills, x.request.godskills);
  x.request.godskills.policy.releasePin.systemReceipt.sha256 = 'a'.repeat(64);
  x.request.godskills.expectedPolicyDigest = sha256Value(x.request.godskills.policy);
  await assert.rejects(x.run({ outputPath: join(x.f.root, 'bad-skills.json') }), /native-godskills:/);
  await assert.rejects(access(join(x.f.root, 'bad-skills.json')), e => e.code === 'ENOENT');
});

for (const [name, mutate, error] of [
  ['changed request pin', () => {}, /request-pin/],
  ['wrong admission fingerprint', r => { r.expectedBindingDigest = 'a'.repeat(64); }, /admission-pin/],
  ['unadmitted shell authority', r => { r.grant.allowedTools.push('powershell'); }, /effect-ceiling/],
  ['expired grant', r => { r.grant.expiresAt = '2000-01-01T00:00:00.000Z'; }, /grant-expired/],
  ['invalid mission', r => { r.mission = { missionId: 'incomplete' }; }, /native-operator:/],
  ['inline credential', r => { r.apiKey = 'never-print-secret'; }, /native-operator:/],
  ['nested credential', r => { r.mission.secret = 'never-print-secret'; }, /credential-field/],
  ['unknown preparation version', r => { r.protocolId = 'unexpected-v2'; }, /preparation-protocol/],
  ['review migration', r => { r.review = {}; }, /preparation-shape/],
]) {
  test(`preparation rejects ${name} without output`, async t => {
    const x = await setup(t); mutate(x.request);
    await assert.rejects(x.run(name === 'changed request pin' ? { expectedRequestDigest: 'a'.repeat(64) } : {}), error);
    await assert.rejects(access(x.outputPath), e => e.code === 'ENOENT');
    await assert.rejects(access(x.request.sessionRoot), e => e.code === 'ENOENT');
  });
}

test('preparation verifies source bytes, not only the binding fingerprint', async t => {
  const x = await setup(t);
  await writeFile(join(x.request.admissionRoot, 'creation', 'agent-genome.json'), '{}\n');
  await assert.rejects(x.run(), /native-operator:/);
  await assert.rejects(access(x.outputPath), e => e.code === 'ENOENT');
});

test('preparation compares pinned binding identity with verified genesis identity', async t => {
  const x = await setup(t), { bindingDigest, ...unsigned } = x.binding;
  unsigned.distributionBuildId = 'a'.repeat(64);
  const altered = { ...unsigned, bindingDigest: sha256Value(unsigned) };
  await writeFile(join(x.request.admissionRoot, 'binding.json'), canonicalJson(altered) + '\n');
  x.request.expectedBindingDigest = altered.bindingDigest;
  await assert.rejects(x.run(), /admission-binding/);
  await assert.rejects(access(x.outputPath), e => e.code === 'ENOENT');
});

test('preparation never overwrites a config and concurrent attempts have exactly one winner', async t => {
  const x = await setup(t);
  const results = await Promise.allSettled([x.run(), x.run()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /output-exists/);
  const bytes = await readFile(x.outputPath, 'utf8');
  await assert.rejects(x.run(), /output-exists/);
  assert.equal(await readFile(x.outputPath, 'utf8'), bytes);
});

test('preparation refuses occupied sessions and preserves their existing evidence', async t => {
  const x = await setup(t); await mkdir(x.request.sessionRoot);
  await writeFile(join(x.request.sessionRoot, 'evidence.txt'), 'keep');
  await assert.rejects(x.run(), /session-exists/);
  assert.equal(await readFile(join(x.request.sessionRoot, 'evidence.txt'), 'utf8'), 'keep');
  await assert.rejects(access(x.outputPath), e => e.code === 'ENOENT');
});

for (const target of ['cwd', 'admissionRoot', 'sessionRoot', 'piPackageRoot']) {
  test(`preparation refuses output beneath ${target}`, async t => {
    const x = await setup(t), outputPath = join(x.request[target], 'config.json');
    await assert.rejects(x.run({ outputPath }), /output-boundary|host-path-inside-workspace/);
    await assert.rejects(access(outputPath), e => e.code === 'ENOENT');
  });
}

test('preparation refuses output at credential path and resolves linked parents', async t => {
  const x = await setup(t);
  await assert.rejects(x.run({ outputPath: x.request.authPath }), /output-boundary/);
  const alias = join(x.f.root, 'alias');
  await symlink(x.f.cwd, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(x.run({ outputPath: join(alias, 'config.json') }), /host-path-inside-workspace/);
  await assert.rejects(access(join(x.f.cwd, 'config.json')), e => e.code === 'ENOENT');
});

test('preparation rejects device aliases, alternate streams and normalized-away output names', async t => {
  const x = await setup(t);
  for (const name of ['NUL', 'nul.json', 'CON .json', 'COM¹.json', 'config.json:stream', 'config.json.', 'config.json ']) {
    await assert.rejects(x.run({ outputPath: join(x.f.root, name) }), /preparation-path/, name);
  }
  await assert.rejects(access(join(x.f.root, 'config.json')), e => e.code === 'ENOENT');
});

test('actual preparation CLI produces an ordinary pinned config without installed SDK or auth', async t => {
  const x = await setup(t), requestPath = join(x.f.root, 'request.json');
  await writeFile(requestPath, JSON.stringify(x.request));
  const argv = ['prepare', '--request', requestPath, '--pin', sha256Value(x.request), '--output', x.outputPath];
  const child = spawnSync(process.execPath, ['src/host/native-pi-cli.mjs', ...argv], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.status, 'configuration-prepared');
  const config = await loadNativeOperatorConfig({ configPath: x.outputPath, expectedConfigDigest: result.configDigest });
  assert.equal(config.admission.instanceId, x.binding.instanceId);
  assert.equal(config.limits.maxProviderRetries, 1);
  assert.equal(child.stderr, '');
});

test('preparation CLI rejects mixed flags and screens malformed private requests', async t => {
  const x = await setup(t), requestPath = join(x.f.root, 'request.json');
  const base = ['prepare', '--request', requestPath, '--pin', sha256Value(x.request), '--output', x.outputPath];
  assert.deepEqual(parseNativeOperatorArgs(base), { command: 'prepare', requestPath, expectedRequestDigest: sha256Value(x.request), outputPath: x.outputPath });
  for (const extra of [['--config', requestPath], ['--prompt-file', requestPath], ['--only', 'failed'], ['--output', x.outputPath]]) {
    assert.throws(() => parseNativeOperatorArgs([...base, ...extra]), /native-operator:/);
  }
  await writeFile(requestPath, '{private-request-secret');
  let stdout = '', stderr = '';
  const code = await nativePiCli(base, { stdout: { write: s => { stdout += s; } }, stderr: { write: s => { stderr += s; } } });
  assert.equal(code, 1); assert.equal(stdout, '');
  assert.doesNotMatch(stderr, /private-request-secret/);
  assert.match(stderr, /request-json/);
});
