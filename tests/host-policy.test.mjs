import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  createCredentialResolver,
  loadHostPolicy,
} from '../src/host/policy.mjs';

const validPolicy = {
  schemaVersion: 1,
  policyId: 'local-networked-fixture',
  provider: {
    adapterId: 'openai-compatible-v1',
    profile: 'chat-completions-json',
    endpointOrigin: 'https://models.example.test',
    endpointPath: '/v1/chat/completions',
    modelIds: ['test-model'],
    selectedModel: 'test-model',
    credentialEnv: 'GODAGENT_TEST_API_KEY',
    timeoutMs: 5000,
    maxResponseBytes: 16384,
    maxProposalTtlMs: 120000,
    maxPromptBytes: 8192,
    maxCompletionTokens: 128,
  },
  inference: {
    maxAttempts: 2,
    retryableReasonCodes: ['connect-failed', 'timeout', 'rate-limited', 'transient-server'],
    maxCycleCompletionTokens: 256,
  },
  runtime: {
    instanceId: 'networked-fixture-1',
    distributionDir: '../dist/networked-fixture-agent',
    journalPath: '../artifacts/networked-runtime/events.jsonl',
    snapshotPath: '../artifacts/networked-runtime/snapshot.json',
    godskillsRelease: {
      adapterProtocol: 'eternities-godskills-adapter-v1',
      repositoryRoot: 'C:/dev/eternities-godskills',
      systemReceipt: { path: 'receipts/godskills-system-certification-v3.json', sha256: '228ba0a63d252f0c37178ff3de8c1278d0ea878e9abeb173e7faea699f28fb57' },
      routerReceipt: { path: 'receipts/agent-native-router-v8.json', sha256: 'b32500d810ba66539334cbe3ae5ef31223dbf712197a061779fc21f75048ebf3' },
      compilerReceipt: { path: 'receipts/intent-compiler-v3.json', sha256: '1ca40ec9138c1d0583068ee4dc3db58f0b77b07f631a2b38d9c47eb28ccce49a' },
      portableReceipt: { path: 'receipts/portable-capability-manifest-v1.json', sha256: 'f78f6aded5198e8db1591af49fe97285307427d93396b34c78dd6e5f2466f33d' },
      portableManifest: { path: 'artifacts/portable-capabilities/manifest.v1.json', sha256: 'ab81495770ceede97522f140260354fbdff54da7b4824ca52046d473c9d5917a', manifestDigest: 'df646600e601dae7208d460135773f5d436b75117c45a3acad85fae6ff91c3c8' },
      semanticEffectBindings: { read: ['local-read'], write: ['local-write'] },
      maximumSelected: 3,
      maximumPackageBytes: 16000
    },
  },
  realmId: 'fixture-workbench',
  authority: ['realm:write'],
  hostContext: {
    permittedEffects: ['local-read', 'local-write'],
    availableAuthority: ['local-read', 'local-write', 'realm:write'],
    availablePreconditions: ['realm-present', 'realm-observed'],
    forbiddenCapabilities: [],
    maximumRisk: 'moderate',
    minimumEvidenceConfidence: 'verified',
    contextBudget: 4000,
    maxCompositionSize: 3,
  },
};

const validActivationPin = {
  protocolId: 'eternities-godskills-activation-v1',
  executableReceipt: {
    path: 'receipts/adaptive-activation-executable-v1.json',
    sha256: '98ebeb63db38b67608cf71b1b511b807cfe2d96e17e9b1bc54e7dbb536f8403f',
    receiptDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
  },
  parentReceipt: {
    path: 'receipts/adaptive-activation-v1.json',
    sha256: '6c6d689ecf9df14823407a917e89a5848776fb50eca3b7acc0d70056ae305f70',
    receiptDigest: 'a28a0af7e588f2abbbe1d51a15775dfbeb8d565109d0a176711bfa73b520440f',
  },
  entrypoint: { path: 'scripts/activation.mjs', sha256: 'e19ceef6a781d1d82a82fb17c519755526dc17fa979474b99f291d6eaa17788a' },
  compiler: { path: 'src/adaptive-activation.mjs', sha256: '9844aee1147f7129f3e37067424ccebb88ff478de1b7a9a9fb7306d5f2fdbd82' },
  dependencies: [
    { path: 'scripts/build-adaptive-activation-executable-receipt.mjs', sha256: 'd35fa44632711c64c1e23f84f80fc0edfb5adbed4261ef88b7d9c32de2d96486' },
    { path: 'src/adaptive-activation-protocol.mjs', sha256: 'e697fe37d18a76de22ca4fdcd8ade6089bceddb20baad971e895bc49c9b0172e' },
    { path: 'src/io.mjs', sha256: '48dca2b203947e12ca3d5500b70a25066a8166d86bc2284aaeed6abf622a5c37' },
    { path: 'src/static-module-closure.mjs', sha256: '3bb0d825e6838b901315e685f9e5b02c94dac316ccb7788f54cd6fd18cd6a6ab' },
  ],
  schemas: {
    request: { path: 'schemas/adaptive-activation-request.v1.schema.json', sha256: 'bcadd846b96809733837183e12dba6f8d094409aa7c16e5676fa63357e3c2cde' },
    result: { path: 'schemas/adaptive-activation-result.v1.schema.json', sha256: '0a069a5eb121e625aa4ea529cbb48783e266e4c7c7f36f93ee24749303dd4391' },
  },
  policy: {
    path: 'policies/adaptive-activation.v1.json',
    sha256: 'b87bbfaddecb42417e57202173220bf240204d27b7de5fffc9e609eb18138939',
    logicalDigest: 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d',
  },
  evidence: {
    path: 'artifacts/adaptive-activation/evidence.v1.json',
    sha256: 'b55a5cb4f7ff039cc7f4027c165b2f151bad723d9030913076a4225342fbe8c5',
    logicalDigest: '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07',
  },
  contract: { path: 'artifacts/adaptive-activation/neutral-contract.json', sha256: 'feade348d3fd31afd5103eb296181f68000186d3193a995e4b77c25a06e57c92' },
};

async function writePolicy(t, policy, name = 'policy.json') {
  const root = await mkdtemp(join(tmpdir(), 'godagent-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, name);
  await writeFile(path, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  return path;
}

test('host policy loads as frozen validated authority with a canonical digest', async (t) => {
  const path = await writePolicy(t, validPolicy);
  const loaded = await loadHostPolicy(path);

  assert.equal(loaded.policy.policyId, 'local-networked-fixture');
  assert.equal(loaded.digest.length, 64);
  assert.equal(Object.isFrozen(loaded.policy), true);
  assert.equal(Object.isFrozen(loaded.policy.provider), true);
  assert.throws(() => { loaded.policy.authority.push('realm:admin'); }, TypeError);
});

test('host policy accepts a complete optional activation root and rejects partial or unknown roots', async (t) => {
  const adaptivePolicy = structuredClone(validPolicy);
  adaptivePolicy.runtime.godskillsRelease.activation = structuredClone(validActivationPin);
  const adaptivePath = await writePolicy(t, adaptivePolicy, 'adaptive-policy.json');
  const loaded = await loadHostPolicy(adaptivePath);
  assert.equal(loaded.policy.runtime.godskillsRelease.activation.protocolId,
    'eternities-godskills-activation-v1');
  assert.equal(Object.isFrozen(loaded.policy.runtime.godskillsRelease.activation), true);

  const partial = structuredClone(adaptivePolicy);
  delete partial.runtime.godskillsRelease.activation.evidence;
  await assert.rejects(
    loadHostPolicy(await writePolicy(t, partial, 'partial-activation.json')),
    /activation.*evidence|required/i,
  );

  const unknown = structuredClone(adaptivePolicy);
  unknown.runtime.godskillsRelease.activation.activationMode = 'method';
  await assert.rejects(
    loadHostPolicy(await writePolicy(t, unknown, 'unknown-activation.json')),
    /activationMode|additionalProperties/i,
  );
});

test('host policy rejects endpoint downgrade, arbitrary model, excessive retry, and credential values', async (t) => {
  const cases = [
    ['HTTP endpoint', { ...validPolicy, provider: { ...validPolicy.provider, endpointOrigin: 'http://models.example.test' } }, /HTTPS/],
    ['model outside allowlist', { ...validPolicy, provider: { ...validPolicy.provider, selectedModel: 'other-model' } }, /selected model/],
    ['excessive retry', { ...validPolicy, inference: { ...validPolicy.inference, maxAttempts: 9 } }, /maxAttempts/],
    ['insufficient cycle budget', { ...validPolicy, inference: { ...validPolicy.inference, maxCycleCompletionTokens: 64 } }, /maxCycleCompletionTokens/],
    ['credential value', { ...validPolicy, provider: { ...validPolicy.provider, apiKey: 'canary-policy-secret' } }, /apiKey/],
    ['authority expansion', { ...validPolicy, authority: ['realm:write', 'realm:admin'] }, /authority/],
    ['legacy bare repository', { ...validPolicy, runtime: { ...validPolicy.runtime, godskillsRelease: undefined, godskillsRepository: 'C:/dev/eternities-godskills' } }, /godskillsRelease|additionalProperties/],
    ['incomplete release pin', { ...validPolicy, runtime: { ...validPolicy.runtime, godskillsRelease: { adapterProtocol: 'eternities-godskills-adapter-v1' } } }, /repositoryRoot|required/],
    ['release composition expansion', { ...validPolicy, runtime: { ...validPolicy.runtime, godskillsRelease: { ...validPolicy.runtime.godskillsRelease, maximumSelected: 4 } } }, /maximum 3/],
    ['package exceeds context', { ...validPolicy, runtime: { ...validPolicy.runtime, godskillsRelease: { ...validPolicy.runtime.godskillsRelease, maximumPackageBytes: 16001 } } }, /package.*context/i],
  ];

  for (const [name, policy, pattern] of cases) {
    const path = await writePolicy(t, policy, `${name.replaceAll(' ', '-')}.json`);
    await assert.rejects(() => loadHostPolicy(path), pattern, name);
  }
});

test('credential resolver exposes one value only through resolve and never serializes it', () => {
  const resolver = createCredentialResolver({
    env: { GODAGENT_TEST_API_KEY: 'canary-resolver-secret' },
    variableName: 'GODAGENT_TEST_API_KEY',
  });

  assert.equal(resolver.resolve(), 'canary-resolver-secret');
  assert.equal(JSON.stringify(resolver).includes('canary-resolver-secret'), false);
  assert.deepEqual(Object.keys(resolver), ['resolve']);
  assert.throws(() => createCredentialResolver({ env: {}, variableName: 'GODAGENT_TEST_API_KEY' }), /unavailable/);
});

test('policy digest utility emits the canonical operator pin', async (t) => {
  const path = await writePolicy(t, validPolicy);
  const loaded = await loadHostPolicy(path);
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/hash-host-policy.mjs', import.meta.url)), path], {
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => resolvePromise({ code, stdout }));
  });

  assert.deepEqual(result, { code: 0, stdout: `${loaded.digest}\n` });
});
