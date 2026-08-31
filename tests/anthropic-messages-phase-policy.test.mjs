import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';

async function policyApi() {
  return import('../src/transports/anthropic-messages-phase-policy.mjs');
}

async function writePolicy(t, policy, name = 'anthropic-phase-policy.json') {
  const root = await mkdtemp(join(tmpdir(), 'godagents-anthropic-phase-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, name);
  await writeFile(path, `${canonicalJson(policy)}\n`, 'utf8');
  return path;
}

test('loads one canonical frozen Anthropic policy only under its external digest pin', async (t) => {
  const { loadAnthropicMessagesPhaseTransportPolicy } = await policyApi();
  const policy = validAnthropicMessagesPhasePolicy();
  const digest = sha256Text(canonicalJson(policy));
  const loaded = await loadAnthropicMessagesPhaseTransportPolicy({
    path: await writePolicy(t, policy),
    env: { GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256: digest.toUpperCase() },
  });

  assert.deepEqual(loaded.policy, policy);
  assert.equal(loaded.digest, digest);
  assert.equal(Object.isFrozen(loaded), true);
  assert.equal(Object.isFrozen(loaded.policy.provider), true);
  assert.equal(Object.isFrozen(loaded.policy.phases.revision), true);
  assert.throws(() => { loaded.policy.provider.modelId = 'forged'; }, TypeError);

  await assert.rejects(
    loadAnthropicMessagesPhaseTransportPolicy({
      path: await writePolicy(t, policy, 'wrong-pin.json'),
      env: { GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256: '0'.repeat(64) },
    }),
    (error) => error.code === 'policy-integrity' && !error.message.includes(digest),
  );
});

test('rejects downgrade ambiguous endpoint version model and credential policy before use', async (t) => {
  const { loadAnthropicMessagesPhaseTransportPolicy } = await policyApi();
  const base = validAnthropicMessagesPhasePolicy();
  const cases = [
    ['downgrade', (value) => { value.provider.endpointOrigin = 'http://api.anthropic.com'; }, /https/i],
    ['wrong origin', (value) => { value.provider.endpointOrigin = 'https://proxy.example.test'; }, /anthropic|origin/i],
    ['origin path', (value) => { value.provider.endpointOrigin = 'https://api.anthropic.com/api'; }, /origin/i],
    ['wrong endpoint', (value) => { value.provider.endpointPath = '/v1/complete'; }, /messages|path/i],
    ['endpoint query', (value) => { value.provider.endpointPath = '/v1/messages?x=1'; }, /messages|path|query/i],
    ['api version', (value) => { value.provider.apiVersion = 'latest'; }, /version/i],
    ['model control', (value) => { value.provider.modelId = 'model\nforged'; }, /model/i],
    ['credential variable', (value) => { value.provider.credentialEnv = 'anthropic-key'; }, /credential|variable/i],
    ['timeout ceiling', (value) => { value.provider.timeoutMs = 120_001; }, /timeout|maximum/i],
    ['request ceiling', (value) => { value.provider.maximumRequestBytes = 128; }, /request|minimum/i],
    ['token ceiling', (value) => { value.phases.review.maximumCompletionTokens = 0; }, /completion|token|minimum/i],
    ['embedded secret', (value) => { value.provider.apiKey = 'never'; }, /additionalProperties|apiKey/i],
  ];

  for (const [name, mutate, pattern] of cases) {
    const policy = structuredClone(base);
    mutate(policy);
    const digest = sha256Text(canonicalJson(policy));
    await assert.rejects(
      loadAnthropicMessagesPhaseTransportPolicy({
        path: await writePolicy(t, policy, `${name}.json`),
        env: { GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256: digest },
      }),
      pattern,
      name,
    );
  }
});

test('rejects non-canonical or unavailable Anthropic policy without leaking parser or pin details', async (t) => {
  const { loadAnthropicMessagesPhaseTransportPolicy } = await policyApi();
  const policy = validAnthropicMessagesPhasePolicy();
  const path = await writePolicy(t, policy);
  await writeFile(path, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  await assert.rejects(
    loadAnthropicMessagesPhaseTransportPolicy({
      path,
      env: { GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256: sha256Text(canonicalJson(policy)) },
    }),
    (error) => error.code === 'policy-integrity'
      && error.message === 'Anthropic Messages phase transport policy integrity failed',
  );
  await assert.rejects(
    loadAnthropicMessagesPhaseTransportPolicy({ path: join(tmpdir(), 'missing-anthropic-phase-policy.json'), env: {} }),
    (error) => error.code === 'policy-integrity',
  );
});

test('Anthropic credential resolver is lazy non-serializing rotatable and rejects unsafe values', async () => {
  const { createAnthropicMessagesPhaseCredentialResolver } = await policyApi();
  const env = { GODAGENT_TEST_ANTHROPIC_KEY: 'canary-anthropic-secret-one' };
  const resolver = createAnthropicMessagesPhaseCredentialResolver({
    env,
    variableName: 'GODAGENT_TEST_ANTHROPIC_KEY',
  });
  assert.equal(resolver.resolve(), 'canary-anthropic-secret-one');
  assert.equal(JSON.stringify(resolver).includes('canary'), false);
  env.GODAGENT_TEST_ANTHROPIC_KEY = 'canary-anthropic-secret-two';
  assert.equal(resolver.resolve(), 'canary-anthropic-secret-two');

  for (const value of [undefined, '', 'short', 'line\nbreak', 'nul\0value']) {
    env.GODAGENT_TEST_ANTHROPIC_KEY = value;
    assert.throws(
      () => resolver.resolve(),
      (error) => error.code === 'credential-unavailable'
        && error.message === 'Anthropic Messages phase transport credential is unavailable',
    );
  }
});
