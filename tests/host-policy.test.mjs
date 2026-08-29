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
    godskillsRepository: 'C:/dev/eternities-godskills',
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

test('host policy rejects endpoint downgrade, arbitrary model, excessive retry, and credential values', async (t) => {
  const cases = [
    ['HTTP endpoint', { ...validPolicy, provider: { ...validPolicy.provider, endpointOrigin: 'http://models.example.test' } }, /HTTPS/],
    ['model outside allowlist', { ...validPolicy, provider: { ...validPolicy.provider, selectedModel: 'other-model' } }, /selected model/],
    ['excessive retry', { ...validPolicy, inference: { ...validPolicy.inference, maxAttempts: 9 } }, /maxAttempts/],
    ['insufficient cycle budget', { ...validPolicy, inference: { ...validPolicy.inference, maxCycleCompletionTokens: 64 } }, /maxCycleCompletionTokens/],
    ['credential value', { ...validPolicy, provider: { ...validPolicy.provider, apiKey: 'canary-policy-secret' } }, /apiKey/],
    ['authority expansion', { ...validPolicy, authority: ['realm:write', 'realm:admin'] }, /authority/],
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
