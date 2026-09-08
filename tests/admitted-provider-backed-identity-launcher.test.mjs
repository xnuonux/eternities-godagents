import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createProviderBackedMissionDependencies } from '../src/host/provider-backed-mission-dependencies.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';

async function loadSubject() {
  try {
    return await import('../src/host/admitted-provider-backed-identity-launcher.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

async function providerHost(t, family = 'openai-compatible-chat-completions-v1') {
  const root = await mkdtemp(join(tmpdir(), 'godagents-admitted-provider-launcher-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const anthropic = family === 'anthropic-messages-v1';
  const policy = anthropic ? validAnthropicMessagesPhasePolicy() : validOpenAICompatiblePhasePolicy();
  const policyPath = join(root, 'provider-policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  let providerCalls = 0;
  const host = await createProviderPhaseHost({
    family,
    policyPath,
    runtimeRoot: join(root, 'provider-operations'),
    env: {
      [anthropic ? 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256' : 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256']: policyDigest,
      [policy.provider.credentialEnv]: 'admitted-launcher-secret-canary',
    },
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error('launcher construction must not call the provider');
    },
  });
  return { host, get providerCalls() { return providerCalls; } };
}

test('effect-only launcher accepts an issued native host without skill review dependencies', async t => {
  const subject = await import('../src/host/admitted-effect-only-identity-launcher.mjs').catch(() => ({}));
  assert.equal(typeof subject.createAdmittedEffectOnlyIdentityLauncher, 'function');
  const state = await providerHost(t);
  const launcher = subject.createAdmittedEffectOnlyIdentityLauncher({ host: state.host, hostKind: 'provider' });
  assert.equal(launcher.describe().schemaVersion, 2);
  assert.equal(launcher.describe().mode, 'effect-only');
  assert.equal(launcher.describe().nativeTransport.descriptorDigest, state.host.describe().descriptors.native.descriptorDigest);
  assert.equal(state.providerCalls, 0);
  assert.throws(() => subject.createAdmittedEffectOnlyIdentityLauncher({ host: { ...state.host }, hostKind: 'provider' }), /issued/);
  assert.throws(() => subject.createAdmittedEffectOnlyIdentityLauncher({ host: state.host, hostKind: 'portable' }), /issued/);
  assert.throws(() => subject.createAdmittedEffectOnlyIdentityLauncher({ host: state.host, hostKind: 'provider', releasePin: {} }), /configuration/);
  await assert.rejects(launcher.launch({ admissionRoot: 'unused', policyPath: 'unused', identityPolicyDigest: 'f'.repeat(64),
    request: { schemaVersion: 1 } }), /effect-only/);
  await assert.rejects(launcher.launch({ admissionRoot: 'unused', policyPath: 'unused', identityPolicyDigest: 'f'.repeat(64),
    request: { schemaVersion: 2, routeMode: 'effect-only' }, nativeTransport: state.host.native }), /fields/);
  assert.equal(state.providerCalls, 0);
});

for (const family of ['openai-compatible-chat-completions-v1', 'anthropic-messages-v1']) {
  test(`effect-only ${family} screens credentials before admission or dispatch`, async t => {
    const { createAdmittedEffectOnlyIdentityLauncher } = await import('../src/sdk/index.mjs');
    const state = await providerHost(t, family);
    const launcher = createAdmittedEffectOnlyIdentityLauncher({ host: state.host, hostKind: 'provider' });
    await assert.rejects(launcher.launch({ admissionRoot: 'unused', policyPath: 'unused',
      identityPolicyDigest: 'f'.repeat(64), request: { schemaVersion: 2, routeMode: 'effect-only',
        text: 'admitted-launcher-secret-canary' } }), /credential|secret/i);
    assert.equal(state.providerCalls, 0);
  });
}

test('one certified provider dependency stack becomes one frozen admitted launcher', async (t) => {
  const subject = await loadSubject();
  assert.equal(typeof subject.createAdmittedProviderBackedIdentityLauncher, 'function');
  assert.equal(typeof subject.verifyAdmittedProviderBackedIdentityLauncherDescription, 'function');
  const state = await providerHost(t);
  const releasePin = pinnedGodskillsReviewRelease('C:/dev/eternities-godskills');
  const configuration = {
    host: state.host,
    releasePin,
    maximumReviewMaterializedBytes: 65_536,
    maximumRevisionMaterializedBytes: 32_768,
    executorIdPrefix: 'admitted-provider-launcher-test',
  };
  const expectedDependencies = await createProviderBackedMissionDependencies(configuration);
  const launcher = await subject.createAdmittedProviderBackedIdentityLauncher(configuration);
  const description = launcher.describe();

  assert.deepEqual(Object.keys(launcher).sort(), ['describe', 'launch']);
  assert.deepEqual(Object.keys(description), [
    'schemaVersion', 'protocolId', 'providerBackedDependencies', 'authority', 'bindingDigest',
  ]);
  assert.equal(description.schemaVersion, 1);
  assert.equal(
    description.protocolId,
    'eternities-admitted-provider-backed-identity-launcher-v1',
  );
  assert.deepEqual(description.providerBackedDependencies, expectedDependencies.describe());
  assert.deepEqual(description.authority, {
    providerSelection: false,
    credentialResolution: false,
    policyAuthorship: false,
    signatureCreation: false,
    realmMutation: false,
    continuityAdmission: false,
    identityMutation: false,
    evolution: false,
    inspiration: false,
    lunari: false,
    soul: false,
  });
  assert.equal(state.providerCalls, 0);
  assert.equal(Object.isFrozen(description), true);
  assert.equal(Object.isFrozen(description.providerBackedDependencies), true);
  assert.deepEqual(
    subject.verifyAdmittedProviderBackedIdentityLauncherDescription(description),
    description,
  );
  assert.notEqual(launcher.describe(), description);
});

test('launcher description and construction reject dependency or authority substitution', async (t) => {
  const subject = await loadSubject();
  assert.equal(typeof subject.createAdmittedProviderBackedIdentityLauncher, 'function');
  const state = await providerHost(t);
  const launcher = await subject.createAdmittedProviderBackedIdentityLauncher({
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
  });
  const changedDependency = structuredClone(launcher.describe());
  changedDependency.providerBackedDependencies.limits.maximumReviewMaterializedBytes += 1;
  const { bindingDigest: ignoredDependencyDigest, ...changedDependencyUnsigned } = changedDependency;
  changedDependency.bindingDigest = sha256Value(changedDependencyUnsigned);
  assert.throws(
    () => subject.verifyAdmittedProviderBackedIdentityLauncherDescription(changedDependency),
    /provider-backed|dependency|description/i,
  );

  const changedAuthority = structuredClone(launcher.describe());
  changedAuthority.authority.realmMutation = true;
  const { bindingDigest: ignoredAuthorityDigest, ...changedAuthorityUnsigned } = changedAuthority;
  changedAuthority.bindingDigest = sha256Value(changedAuthorityUnsigned);
  assert.throws(
    () => subject.verifyAdmittedProviderBackedIdentityLauncherDescription(changedAuthority),
    /authority/i,
  );
  await assert.rejects(
    subject.createAdmittedProviderBackedIdentityLauncher({
      host: state.host,
      releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
      credentials: 'forbidden',
    }),
    /configuration|unknown/i,
  );
  assert.equal(state.providerCalls, 0);
});

test('launch surface delegates only explicit policy-pinned inputs and rejects dependency injection', async (t) => {
  const subject = await loadSubject();
  const state = await providerHost(t);
  const launcher = await subject.createAdmittedProviderBackedIdentityLauncher({
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
  });
  const base = {
    admissionRoot: join(tmpdir(), 'missing-admitted-provider-backed-identity'),
    policyPath: join(tmpdir(), 'missing-admitted-provider-backed-policy.json'),
    request: {},
    identityPolicyDigest: 'a'.repeat(64),
  };

  await assert.rejects(
    launcher.launch(base),
    (error) => error?.name === 'AdmittedSealedIdentityLaunchError'
      && error.code === 'admission-invalid',
  );
  for (const [field, value] of [
    ['env', { PROVIDER_SECRET: 'forbidden' }],
    ['providerFamily', 'openai-compatible-chat-completions-v1'],
    ['credentials', 'forbidden'],
    ['releasePin', {}],
    ['nativeTransport', {}],
    ['reviewExecutor', {}],
    ['revisionExecutor', {}],
    ['activationClassifier', {}],
    ['realm', {}],
    ['continuity', {}],
    ['soul', {}],
  ]) {
    await assert.rejects(
      launcher.launch({ ...base, [field]: value }),
      /launch request fields|launch request.*invalid/i,
      field,
    );
  }
  await assert.rejects(
    launcher.launch({ ...base, identityPolicyDigest: 'A'.repeat(64) }),
    /identity policy digest/i,
  );
  assert.equal(state.providerCalls, 0);
});
