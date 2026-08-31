import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { runLocalHost } from '../src/host/local-cli.mjs';

const validPolicy = JSON.parse(await readFile(new URL('../fixtures/host-policy.json', import.meta.url), 'utf8'));
validPolicy.provider.credentialEnv = 'GODAGENT_TEST_API_KEY';
const policyDigest = sha256Text(canonicalJson(validPolicy));
const validEnv = (credential) => ({
  GODAGENT_TEST_API_KEY: credential,
  GODAGENT_POLICY_SHA256: policyDigest,
});

async function fixtureFiles(t) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policyPath = join(root, 'policy.json');
  const missionPath = join(root, 'mission.txt');
  await writeFile(policyPath, `${JSON.stringify(validPolicy, null, 2)}\n`, 'utf8');
  await writeFile(missionPath, 'increment the governed fixture counter once\n', 'utf8');
  return { policyPath, missionPath };
}

function sink() {
  let text = '';
  return { write(chunk) { text += chunk; }, read() { return text; } };
}

test('local host derives mission authority and context only from validated policy', async (t) => {
  const { policyPath, missionPath } = await fixtureFiles(t);
  const stdout = sink();
  const stderr = sink();
  let trustedMission;
  const code = await runLocalHost({
    argv: ['--policy', policyPath, '--mission', missionPath],
    env: { ...validEnv('canary-cli-secret'), GODAGENT_ACTIVATION_ENABLED: 'true' },
    stdout,
    stderr,
    execute: async (options) => {
      const { mission, credentialResolver } = options;
      trustedMission = mission;
      assert.equal(credentialResolver.resolve(), 'canary-cli-secret');
      assert.equal(Object.hasOwn(options, 'activationClassifier'), false);
      assert.equal(Object.hasOwn(options, 'activationTransport'), false);
      return {
        status: 'completed',
        instanceId: 'networked-fixture-1',
        decisionId: 'decision-1',
        actionId: 'action-1',
        discrepancyClass: 'none',
      };
    },
  });

  assert.equal(code, 0);
  assert.deepEqual(trustedMission.authority, ['local-read', 'local-write', 'realm:write']);
  assert.deepEqual(trustedMission.hostContext, validPolicy.hostContext);
  assert.equal(trustedMission.text, 'increment the governed fixture counter once');
  assert.deepEqual(JSON.parse(stdout.read()), {
    status: 'completed',
    instanceId: 'networked-fixture-1',
    decisionId: 'decision-1',
    actionId: 'action-1',
    discrepancyClass: 'none',
  });
  assert.equal(stderr.read(), '');
  assert.equal(`${stdout.read()}${stderr.read()}`.includes('canary-cli-secret'), false);
});

test('local host rejects secret flags and unknown endpoint overrides before execution', async (t) => {
  const { policyPath, missionPath } = await fixtureFiles(t);
  for (const args of [
    ['--policy', policyPath, '--mission', missionPath, '--api-key', 'canary-argument-secret'],
    ['--policy', policyPath, '--mission', missionPath, '--endpoint', 'https://evil.example'],
  ]) {
    const stdout = sink();
    const stderr = sink();
    let executed = false;
    const code = await runLocalHost({
      argv: args,
      env: validEnv('canary-env-secret'),
      stdout,
      stderr,
      execute: async () => { executed = true; },
    });
    assert.equal(code, 2);
    assert.equal(executed, false);
    assert.deepEqual(JSON.parse(stderr.read()), { status: 'failed', reasonCode: 'invalid-arguments' });
    assert.equal(`${stdout.read()}${stderr.read()}`.includes('canary'), false);
  }
});

test('local host reports closed failure codes without provider or credential text', async (t) => {
  const { policyPath, missionPath } = await fixtureFiles(t);
  const stdout = sink();
  const stderr = sink();
  const code = await runLocalHost({
    argv: ['--policy', policyPath, '--mission', missionPath],
    env: validEnv('canary-env-secret'),
    stdout,
    stderr,
    execute: async () => { throw new Error('provider leaked canary-env-secret'); },
  });

  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(stderr.read()), { status: 'failed', reasonCode: 'host-failed' });
  assert.equal(`${stdout.read()}${stderr.read()}`.includes('canary-env-secret'), false);
});

test('local host rejects a credential pasted into mission text before execution or journaling', async (t) => {
  const { policyPath, missionPath } = await fixtureFiles(t);
  await writeFile(missionPath, 'use canary-mission-secret to increment once\n', 'utf8');
  const stdout = sink();
  const stderr = sink();
  let executed = false;
  const code = await runLocalHost({
    argv: ['--policy', policyPath, '--mission', missionPath],
    env: validEnv('canary-mission-secret'),
    stdout,
    stderr,
    execute: async () => { executed = true; },
  });

  assert.equal(code, 1);
  assert.equal(executed, false);
  assert.deepEqual(JSON.parse(stderr.read()), { status: 'failed', reasonCode: 'invalid-mission' });
  assert.equal(`${stdout.read()}${stderr.read()}`.includes('canary-mission-secret'), false);
});

test('local host rejects a policy whose canonical digest differs from the operator pin', async (t) => {
  const { policyPath, missionPath } = await fixtureFiles(t);
  const tampered = { ...validPolicy, provider: { ...validPolicy.provider, endpointOrigin: 'https://attacker.example' } };
  await writeFile(policyPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
  const stdout = sink();
  const stderr = sink();
  let executed = false;
  const code = await runLocalHost({
    argv: ['--policy', policyPath, '--mission', missionPath],
    env: validEnv('canary-policy-pin-secret'),
    stdout,
    stderr,
    execute: async () => { executed = true; },
  });

  assert.equal(code, 1);
  assert.equal(executed, false);
  assert.deepEqual(JSON.parse(stderr.read()), { status: 'failed', reasonCode: 'policy-integrity' });
});
