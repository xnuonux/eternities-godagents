import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import {
  buildPortablePhaseHostDescription,
  createPortablePhaseHostAdapter,
} from '../src/sdk/portable-phase-host.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';

async function loadSubject() {
  try {
    return await import('../src/host/admitted-portable-identity-launcher.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

async function portableHost(t) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-admitted-portable-launcher-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = validOpenAICompatiblePhasePolicy();
  const policyPath = join(root, 'provider-policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  let providerCalls = 0;
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const provider = await createProviderPhaseHost({
    family: 'openai-compatible-chat-completions-v1',
    policyPath,
    runtimeRoot: join(root, 'provider-operations'),
    env: {
      GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: policyDigest,
      [policy.provider.credentialEnv]: 'admitted-portable-launcher-secret-canary',
    },
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error('portable launcher construction must not call the provider');
    },
  });
  const description = buildPortablePhaseHostDescription({
    adapterId: 'provider-wrapper-for-admitted-portable-launcher',
    adapterVersion: '1',
    policyDigest,
    descriptors: provider.describe().descriptors,
  });
  const host = await createPortablePhaseHostAdapter({
    description,
    native: provider.native,
    review: provider.review,
    revision: provider.revision,
    assertCredentialAbsent: provider.assertCredentialAbsent,
    createOperatorResolutionController: provider.createOperatorResolutionController,
  });
  return { host, get providerCalls() { return providerCalls; } };
}

test('public effect-only SDK launcher accepts portable issuance without review construction', async t => {
  const sdk = await import('../src/sdk/index.mjs');
  assert.equal(typeof sdk.createAdmittedEffectOnlyIdentityLauncher, 'function');
  const state = await portableHost(t);
  const launcher = sdk.createAdmittedEffectOnlyIdentityLauncher({ host: state.host, hostKind: 'portable' });
  assert.equal(launcher.describe().mode, 'effect-only');
  assert.equal(launcher.describe().hostKind, 'portable');
  assert.equal(state.providerCalls, 0);
  assert.throws(() => sdk.createAdmittedEffectOnlyIdentityLauncher({ host: { ...state.host }, hostKind: 'portable' }), /issued/);
  await assert.rejects(launcher.launch({ admissionRoot: 'unused', policyPath: 'unused',
    identityPolicyDigest: '0'.repeat(64), request: { schemaVersion: 1 } }), /effect-only/);
  assert.equal(state.providerCalls, 0);
});

test('one certified portable dependency stack becomes one frozen explicit admitted launcher', async (t) => {
  const subject = await loadSubject();
  assert.equal(typeof subject.createAdmittedPortableIdentityLauncher, 'function');
  assert.equal(typeof subject.verifyAdmittedPortableIdentityLauncherDescription, 'function');
  const state = await portableHost(t);
  const configuration = {
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    maximumReviewMaterializedBytes: 65_536,
    maximumRevisionMaterializedBytes: 32_768,
  };
  const launcher = await subject.createAdmittedPortableIdentityLauncher(configuration);
  const description = launcher.describe();

  assert.deepEqual(Object.keys(launcher).sort(), ['describe', 'launch']);
  assert.deepEqual(Object.keys(description), [
    'schemaVersion', 'protocolId', 'portableDependencies', 'authority', 'bindingDigest',
  ]);
  assert.equal(description.protocolId, 'eternities-admitted-portable-identity-launcher-v1');
  assert.deepEqual(description.portableDependencies.portableHost, state.host.describe());
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
  assert.deepEqual(subject.verifyAdmittedPortableIdentityLauncherDescription(description), description);
  const reordered = Object.fromEntries(Object.entries(description).reverse());
  assert.deepEqual(subject.verifyAdmittedPortableIdentityLauncherDescription(reordered), description);
  assert.notEqual(launcher.describe(), description);
});

test('portable launcher delegates only explicit policy inputs and rejects injection or drift', async (t) => {
  const subject = await loadSubject();
  const state = await portableHost(t);
  const launcher = await subject.createAdmittedPortableIdentityLauncher({
    host: state.host,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
  });
  const base = {
    admissionRoot: join(tmpdir(), 'missing-admitted-portable-identity'),
    policyPath: join(tmpdir(), 'missing-admitted-portable-policy.json'),
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
  await assert.rejects(
    launcher.launch({ ...base, request: { token: 'sk-or-secret' } }),
    /credential preflight/i,
  );

  const changed = structuredClone(launcher.describe());
  changed.authority.realmMutation = true;
  const { bindingDigest: ignored, ...unsigned } = changed;
  changed.bindingDigest = sha256Value(unsigned);
  assert.throws(
    () => subject.verifyAdmittedPortableIdentityLauncherDescription(changed),
    /authority/i,
  );
  assert.equal(canonicalJson(launcher.describe()).includes('forbidden'), false);
  assert.equal(state.providerCalls, 0);
});
