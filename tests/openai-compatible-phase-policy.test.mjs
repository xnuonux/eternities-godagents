import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import {
  createOpenAICompatiblePhaseCredentialResolver,
  loadOpenAICompatiblePhaseTransportPolicy,
} from '../src/transports/openai-compatible-phase-policy.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';

async function writePolicy(t, policy, name = 'phase-policy.json') {
  const root = await mkdtemp(join(tmpdir(), 'godagents-phase-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, name);
  await writeFile(path, `${canonicalJson(policy)}\n`, 'utf8');
  return path;
}

test('loads one canonical frozen policy only under its external digest pin', async (t) => {
  const policy = validOpenAICompatiblePhasePolicy();
  const digest = sha256Text(canonicalJson(policy));
  const loaded = await loadOpenAICompatiblePhaseTransportPolicy({
    path: await writePolicy(t, policy),
    env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: digest.toUpperCase() },
  });

  assert.deepEqual(loaded.policy, policy);
  assert.equal(loaded.digest, digest);
  assert.equal(Object.isFrozen(loaded), true);
  assert.equal(Object.isFrozen(loaded.policy), true);
  assert.equal(Object.isFrozen(loaded.policy.provider), true);
  assert.equal(Object.isFrozen(loaded.policy.phases.native), true);
  assert.throws(() => { loaded.policy.provider.modelId = 'forged'; }, TypeError);

  await assert.rejects(
    loadOpenAICompatiblePhaseTransportPolicy({
      path: await writePolicy(t, policy, 'wrong-pin.json'),
      env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: '0'.repeat(64) },
    }),
    (error) => error.code === 'policy-integrity' && !error.message.includes(digest),
  );
});

test('rejects downgrade ambiguous endpoint model and credential policy before use', async (t) => {
  const base = validOpenAICompatiblePhasePolicy();
  const cases = [
    ['downgrade', (value) => { value.provider.endpointOrigin = 'http://models.example.test'; }, /https/i],
    ['origin path', (value) => { value.provider.endpointOrigin = 'https://models.example.test/api'; }, /origin/i],
    ['endpoint query', (value) => { value.provider.endpointPath = '/v1/chat/completions?x=1'; }, /path|query/i],
    ['model control', (value) => { value.provider.modelId = 'model\nforged'; }, /model/i],
    ['credential variable', (value) => { value.provider.credentialEnv = 'phase-key'; }, /credential|variable/i],
    ['timeout ceiling', (value) => { value.provider.timeoutMs = 120_001; }, /timeout|maximum/i],
    ['request ceiling', (value) => { value.provider.maximumRequestBytes = 128; }, /request|minimum/i],
    ['completion ceiling', (value) => { value.phases.native.maximumCompletionBytes = 16_777_217; }, /completion|maximum/i],
    ['token ceiling', (value) => { value.phases.review.maximumCompletionTokens = 0; }, /completion|token|minimum/i],
    ['unknown field', (value) => { value.provider.apiKey = 'never'; }, /additionalProperties|apiKey/i],
  ];

  for (const [name, mutate, pattern] of cases) {
    const policy = structuredClone(base);
    mutate(policy);
    const digest = sha256Text(canonicalJson(policy));
    await assert.rejects(
      loadOpenAICompatiblePhaseTransportPolicy({
        path: await writePolicy(t, policy, `${name}.json`),
        env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: digest },
      }),
      pattern,
      name,
    );
  }
});

test('rejects non-canonical or unavailable policy without leaking parser or pin details', async (t) => {
  const policy = validOpenAICompatiblePhasePolicy();
  const path = await writePolicy(t, policy);
  await writeFile(path, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  await assert.rejects(
    loadOpenAICompatiblePhaseTransportPolicy({
      path,
      env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: sha256Text(canonicalJson(policy)) },
    }),
    (error) => error.code === 'policy-integrity' && error.message === 'OpenAI-compatible phase transport policy integrity failed',
  );
  await assert.rejects(
    loadOpenAICompatiblePhaseTransportPolicy({ path: join(tmpdir(), 'missing-phase-policy.json'), env: {} }),
    (error) => error.code === 'policy-integrity',
  );
});

test('credential resolver is lazy non-serializing rotatable and rejects unsafe values', () => {
  const env = { GODAGENT_TEST_PHASE_KEY: 'canary-phase-secret-one' };
  const resolver = createOpenAICompatiblePhaseCredentialResolver({
    env,
    variableName: 'GODAGENT_TEST_PHASE_KEY',
  });
  assert.equal(resolver.resolve(), 'canary-phase-secret-one');
  assert.equal(JSON.stringify(resolver).includes('canary'), false);
  env.GODAGENT_TEST_PHASE_KEY = 'canary-phase-secret-two';
  assert.equal(resolver.resolve(), 'canary-phase-secret-two');

  for (const value of [undefined, '', 'short', 'line\nbreak', 'nul\0value']) {
    env.GODAGENT_TEST_PHASE_KEY = value;
    assert.throws(
      () => resolver.resolve(),
      (error) => error.code === 'credential-unavailable'
        && error.message === 'OpenAI-compatible phase transport credential is unavailable',
    );
  }
});
