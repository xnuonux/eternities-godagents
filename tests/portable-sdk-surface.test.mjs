import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';

const EXPECTED_EXPORTS = [
  'GODAGENT_SDK_PROTOCOL_ID',
  'GODAGENT_SDK_VERSION',
  'assertProviderPhaseHostInstance',
  'createAdmittedProviderBackedIdentityLauncher',
  'createProviderPhaseHost',
  'describeGodagentSdk',
  'verifyAdmittedProviderBackedIdentityLauncherDescription',
  'verifyProviderPhaseHostDescription',
];

const FAMILIES = Object.freeze([
  {
    id: 'openai-compatible-chat-completions-v1',
    pin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    policy: validOpenAICompatiblePhasePolicy,
  },
  {
    id: 'anthropic-messages-v1',
    pin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    policy: validAnthropicMessagesPhasePolicy,
  },
]);

async function loadSdk() {
  return import('@eternities/godagents');
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

async function providerHost(t, definition) {
  const sdk = await loadSdk();
  const root = await mkdtemp(join(tmpdir(), 'godagents-portable-sdk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = definition.policy();
  const policyPath = join(root, 'provider-policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  let providerCalls = 0;
  const host = await sdk.createProviderPhaseHost({
    family: definition.id,
    policyPath,
    env: {
      [definition.pin]: policyDigest,
      [policy.provider.credentialEnv]: 'portable-sdk-secret-canary',
    },
    runtimeRoot: join(root, 'provider-operations'),
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error('portable SDK construction must not call a provider');
    },
  });
  return { sdk, host, policyDigest, get providerCalls() { return providerCalls; } };
}

test('package root exposes only the closed portable SDK surface', async () => {
  const sdk = await loadSdk();
  assert.deepEqual(Object.keys(sdk).sort(), EXPECTED_EXPORTS);
  assert.equal(sdk.GODAGENT_SDK_PROTOCOL_ID, 'eternities-godagents-sdk-v1');
  assert.equal(sdk.GODAGENT_SDK_VERSION, '0.1.0');
  for (const key of Object.keys(sdk)) {
    assert.equal(/secret|credential|realm|keel|continuity|evolution|soul|lunari|inspiration/i.test(key), false);
  }
  for (const forbidden of [
    'createPersistentVessel',
    'launchAdmittedSealedIdentityMission',
    'createOpenAICompatiblePhaseTransportSuite',
    'createAnthropicMessagesPhaseTransportSuite',
    'createCredentialResolver',
  ]) assert.equal(Object.hasOwn(sdk, forbidden), false, forbidden);
  await assert.rejects(
    import('@eternities/godagents/package.json'),
    (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
});

test('SDK descriptor is deterministic, deeply frozen, and honest about proof limits', async () => {
  const sdk = await loadSdk();
  const first = sdk.describeGodagentSdk();
  const second = sdk.describeGodagentSdk();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    schemaVersion: 1,
    protocolId: 'eternities-godagents-sdk-v1',
    version: '0.1.0',
    status: 'experimental',
    supportedProviderFamilies: [
      'anthropic-messages-v1',
      'openai-compatible-chat-completions-v1',
    ],
    proofLimits: {
      liveProviderQuality: false,
      remoteExactlyOnce: false,
      defaultLaunchAdoption: false,
      publicPublication: false,
      realmAuthority: false,
      continuityAuthority: false,
      evolutionAuthority: false,
      inspirationAuthority: false,
      lunariAuthority: false,
      soulAuthority: false,
    },
  });
  assertDeepFrozen(first);
  assert.equal(canonicalJson(first).includes('portable-sdk-secret-canary'), false);
  assert.equal(Object.hasOwn(first, 'endpoint'), false);
  assert.equal(Object.hasOwn(first, 'model'), false);
  assert.equal(Object.hasOwn(first, 'credential'), false);
});

test('both registered provider families construct through the SDK without provider work', async (t) => {
  const sdk = await loadSdk();
  for (const definition of FAMILIES) {
    const state = await providerHost(t, definition);
    const description = state.host.describe();
    assert.equal(description.family, definition.id);
    assert.equal(description.policyDigest, state.policyDigest);
    assert.deepEqual(sdk.verifyProviderPhaseHostDescription(description), description);
    assert.deepEqual(sdk.assertProviderPhaseHostInstance(state.host), description);
    assert.equal(state.providerCalls, 0);
    assert.equal(canonicalJson(description).includes('portable-sdk-secret-canary'), false);
  }
});

test('SDK launch factory preserves the closed admitted-launcher configuration', async (t) => {
  const state = await providerHost(t, FAMILIES[0]);
  const sdk = state.sdk;
  assert.equal(typeof sdk.createAdmittedProviderBackedIdentityLauncher, 'function');
  assert.equal(typeof sdk.verifyAdmittedProviderBackedIdentityLauncherDescription, 'function');
  await assert.rejects(
    sdk.createAdmittedProviderBackedIdentityLauncher({ unknown: true }),
    /configuration/i,
  );

  const launcher = await sdk.createAdmittedProviderBackedIdentityLauncher({
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    maximumReviewMaterializedBytes: 65_536,
    maximumRevisionMaterializedBytes: 32_768,
    executorIdPrefix: 'portable-sdk-launcher-test',
  });
  const description = launcher.describe();
  assert.deepEqual(Object.keys(launcher).sort(), ['describe', 'launch']);
  assert.deepEqual(
    sdk.verifyAdmittedProviderBackedIdentityLauncherDescription(description),
    description,
  );
  assert.equal(Object.isFrozen(description), true);
  assert.equal(state.providerCalls, 0);

  const changedDescription = structuredClone(description);
  changedDescription.bindingDigest = '0'.repeat(64);
  assert.throws(
    () => sdk.verifyAdmittedProviderBackedIdentityLauncherDescription(changedDescription),
    /binding digest|description/i,
  );

  const launchRequest = {
    admissionRoot: join(tmpdir(), 'missing-portable-sdk-admission'),
    policyPath: join(tmpdir(), 'missing-portable-sdk-policy.json'),
    request: {},
    identityPolicyDigest: 'a'.repeat(64),
  };
  await assert.rejects(
    launcher.launch(launchRequest),
    (error) => error?.name === 'AdmittedSealedIdentityLaunchError'
      && error.code === 'admission-invalid',
  );
  await assert.rejects(
    launcher.launch({ ...launchRequest, reviewExecutor: {} }),
    /launch request fields|launch request.*invalid/i,
  );
  assert.equal(state.providerCalls, 0);
  assert.throws(
    () => sdk.verifyProviderPhaseHostDescription({ schemaVersion: 1 }),
    /fields|identity/i,
  );
  const changedHostDescription = structuredClone(state.host.describe());
  changedHostDescription.descriptionDigest = '0'.repeat(64);
  assert.throws(
    () => sdk.verifyProviderPhaseHostDescription(changedHostDescription),
    /digest|identity/i,
  );
  assert.equal(typeof pinnedGodskillsReviewRelease, 'function');
});
