import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { launchProviderBackedIdentity } from '../src/host/provider-backed-cli.mjs';
import { parseProviderBackedIdentityCliArgs } from '../src/host/provider-backed-cli-contracts.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { vesselRequest } from './helpers/identity-bound-mission-vessel-certification-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';

const DIGEST = 'a'.repeat(64);
const FAMILIES = [
  {
    name: 'openai-compatible-chat-completions-v1',
    pin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    policy: validOpenAICompatiblePhasePolicy,
  },
  {
    name: 'anthropic-messages-v1',
    pin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    policy: validAnthropicMessagesPhasePolicy,
  },
];

function identityPolicy() {
  return {
    runtime: {
      godskillsRelease: { release: 'verified-release' },
      reviewExecutor: { executorId: `provider-backed-review:${'b'.repeat(64)}` },
      revisionExecutor: { executorId: `provider-backed-revision:${'c'.repeat(64)}` },
    },
  };
}

function parsedOptions(root, family, identityDigest, missionId) {
  return parseProviderBackedIdentityCliArgs([
    '--family', family,
    '--provider-policy', join(root, 'provider-policy.json'),
    '--admission', root,
    '--policy', join(root, 'identity-host-policy.json'),
    '--identity-policy-digest', identityDigest,
    '--mission', join(root, 'mission-request.json'),
    '--request-id', missionId,
    '--review-materialized-bytes', '65536',
    '--revision-materialized-bytes', '32768',
  ]);
}

test('provider-backed identity runner validates both supported policy families before host construction', async () => {
  for (const definition of FAMILIES) {
    const root = await mkdtemp(join(tmpdir(), 'godagents-provider-backed-cli-'));
    try {
      const request = vesselRequest();
      request.mission.missionId = `mission-${definition.name}`;
      const requestPath = join(root, 'mission-request.json');
      await writeFile(requestPath, `${canonicalJson(request)}\n`, 'utf8');
      const providerPolicy = definition.policy();
      const providerPolicyPath = join(root, 'provider-policy.json');
      await writeFile(providerPolicyPath, `${canonicalJson(providerPolicy)}\n`, 'utf8');
      const policy = identityPolicy();
      const identityDigest = sha256Text(canonicalJson(policy));
      const options = parsedOptions(root, definition.name, identityDigest, request.mission.missionId);
      const hostCalls = [];

      const result = await launchProviderBackedIdentity({
        ...options,
        env: { PROVIDER_KEY: 'memory-only-secret' },
        assertSafeAdmissionTreeImpl: async () => {},
        readAdmissionBindingImpl: async () => ({}),
        loadIdentityHostPolicyImpl: async () => ({ policy, digest: identityDigest }),
        assertAdmissionPolicyBindingImpl: () => {},
        readFileImpl: readFile,
        createProviderPhaseHostImpl: async (value) => {
          hostCalls.push(value);
          return { certified: true };
        },
        createLauncherImpl: async ({ host, ...configuration }) => {
          assert.deepEqual(host, { certified: true });
          assert.equal(configuration.executorIdPrefix, 'provider-backed');
          return { launch: async () => ({ status: 'completed', family: definition.name }) };
        },
      });

      assert.deepEqual(result, { status: 'completed', family: definition.name });
      assert.equal(hostCalls.length, 1);
      assert.equal(hostCalls[0].env[definition.pin], sha256Text(canonicalJson(providerPolicy)));
      assert.equal(hostCalls[0].env.PROVIDER_KEY, 'memory-only-secret');
      const otherPin = definition.pin === FAMILIES[0].pin ? FAMILIES[1].pin : FAMILIES[0].pin;
      assert.equal(Object.hasOwn(hostCalls[0].env, otherPin), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('provider-backed identity runner rejects noncanonical provider policy before host construction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'godagents-provider-backed-cli-invalid-'));
  try {
    const request = vesselRequest();
    request.mission.missionId = 'mission-invalid-provider-policy';
    const missionPath = join(root, 'mission-request.json');
    const providerPath = join(root, 'provider-policy.json');
    await writeFile(missionPath, `${canonicalJson(request)}\n`, 'utf8');
    await writeFile(providerPath, '{"notCanonical":true}\n', 'utf8');
    const policy = identityPolicy();
    const identityDigest = sha256Text(canonicalJson(policy));
    const options = parsedOptions(root, 'openai-compatible-chat-completions-v1', identityDigest, request.mission.missionId);
    let hostCalls = 0;
    await assert.rejects(
      () => launchProviderBackedIdentity({
        ...options,
        assertSafeAdmissionTreeImpl: async () => {},
        readAdmissionBindingImpl: async () => ({}),
        loadIdentityHostPolicyImpl: async () => ({ policy, digest: identityDigest }),
        assertAdmissionPolicyBindingImpl: () => {},
        readFileImpl: readFile,
        createProviderPhaseHostImpl: async () => { hostCalls += 1; return {}; },
      }),
      (error) => error.code === 'provider-policy-integrity',
    );
    assert.equal(hostCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
