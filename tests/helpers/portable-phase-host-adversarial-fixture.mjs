import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import {
  PORTABLE_PHASE_HOST_AUTHORITY,
  assertPortablePhaseHostInstance,
  buildPortablePhaseHostDescription,
  createPortablePhaseHostAdapter,
  verifyPortablePhaseHostDescription,
} from '../../src/sdk/portable-phase-host.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { buildIdentityBoundNativeTransportDescriptor } from '../../src/runtime/identity-bound-native-contracts.mjs';
import { buildMissionRevisionTransportDescriptor } from '../../src/runtime/mission-revision-transport-contracts.mjs';
import { buildGodskillsReviewTransportDescriptor } from '../../src/skills/review-transport-contracts.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';

const DIGEST = 'a'.repeat(64);

export function buildPortableAdversarialDescriptors(prefix = 'portable-adversarial') {
  return {
    native: buildIdentityBoundNativeTransportDescriptor({
      transportId: `${prefix}-native:${DIGEST}`,
    }),
    review: buildGodskillsReviewTransportDescriptor({
      transportId: `${prefix}-review:${DIGEST}`,
    }),
    revision: buildMissionRevisionTransportDescriptor({
      transportId: `${prefix}-revision:${DIGEST}`,
    }),
  };
}

export function buildPortableAdversarialDescription(overrides = {}) {
  return buildPortablePhaseHostDescription({
    adapterId: 'portable-adversarial-fixture',
    adapterVersion: '1',
    policyDigest: DIGEST,
    descriptors: buildPortableAdversarialDescriptors(),
    ...overrides,
  });
}

export function buildPortableAdversarialPort(descriptor) {
  return {
    descriptor: async () => descriptor,
    reconcile: async (dispatch) => ({ status: 'absent', dispatchDigest: dispatch.dispatchDigest }),
    execute: async (dispatch) => ({ status: 'completed', dispatchDigest: dispatch.dispatchDigest }),
  };
}

export async function buildPortableAdversarialHost() {
  const description = structuredClone(buildPortableAdversarialDescription());
  const host = await createPortablePhaseHostAdapter({
    description,
    native: buildPortableAdversarialPort(description.descriptors.native),
    review: buildPortableAdversarialPort(description.descriptors.review),
    revision: buildPortableAdversarialPort(description.descriptors.revision),
    assertCredentialAbsent: (value) => value,
    createOperatorResolutionController: (options) => options,
  });
  return { description, host };
}

async function mustReject(action, label) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`${label} was accepted`);
}

async function verifyProviderWrapper(family, policyFactory, pinName) {
  const root = await mkdtemp(join(tmpdir(), 'portable-host-adversarial-'));
  try {
    const policy = policyFactory();
    const policyPath = join(root, 'policy.json');
    const policyDigest = sha256Text(canonicalJson(policy));
    const secret = `portable-adversarial-${family}-secret`;
    let providerCalls = 0;
    await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
    const provider = await createProviderPhaseHost({
      family,
      policyPath,
      env: { [pinName]: policyDigest, [policy.provider.credentialEnv]: secret },
      runtimeRoot: join(root, 'operations'),
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error('provider call is outside adversarial construction');
      },
    });
    const providerDescription = provider.describe();
    const portableDescription = buildPortablePhaseHostDescription({
      adapterId: `provider-adversarial-${family}`,
      adapterVersion: '1',
      policyDigest,
      descriptors: providerDescription.descriptors,
    });
    const wrapped = await createPortablePhaseHostAdapter({
      description: portableDescription,
      native: provider.native,
      review: provider.review,
      revision: provider.revision,
      assertCredentialAbsent: provider.assertCredentialAbsent,
      createOperatorResolutionController: provider.createOperatorResolutionController,
    });
    assertPortablePhaseHostInstance(wrapped);
    if (canonicalJson(wrapped.describe()).includes(secret)) {
      throw new Error(`${family} credential leaked into public description`);
    }
    if (providerCalls !== 0) throw new Error(`${family} provider was called during construction`);
    return { providerCalls, credentialLeaks: 0 };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function buildDeterministicPortablePhaseHostAdversarialFixture() {
  const cases = [];
  const pass = (id) => cases.push({ id, status: 'pass' });

  const { host } = await buildPortableAdversarialHost();
  await mustReject(() => assertPortablePhaseHostInstance({ ...host }), 'counterfeit host');
  pass('counterfeit-host');

  const source = buildPortableAdversarialDescription();
  for (const [id, mutate] of [
    ['forged-protocol', (value) => { value.protocolId = 'forged'; }],
    ['forged-capability', (value) => { value.capabilities.durableExecution = false; }],
    ['forged-authority', (value) => { value.authority.realmEffects = true; }],
    ['forged-credential-field', (value) => { value.credentials = 'never-public'; }],
  ]) {
    const forged = structuredClone(source);
    mutate(forged);
    await mustReject(() => verifyPortablePhaseHostDescription(forged), id);
    pass(id);
  }

  const drifted = buildPortableAdversarialDescriptors('drifted');
  await mustReject(() => createPortablePhaseHostAdapter({
    description: source,
    native: buildPortableAdversarialPort(drifted.native),
    review: buildPortableAdversarialPort(source.descriptors.review),
    revision: buildPortableAdversarialPort(source.descriptors.revision),
    assertCredentialAbsent: (value) => value,
    createOperatorResolutionController: () => null,
  }), 'descriptor drift');
  pass('descriptor-drift');

  const mutableSource = structuredClone(source);
  const mutableHost = await createPortablePhaseHostAdapter({
    description: mutableSource,
    native: buildPortableAdversarialPort(mutableSource.descriptors.native),
    review: buildPortableAdversarialPort(mutableSource.descriptors.review),
    revision: buildPortableAdversarialPort(mutableSource.descriptors.revision),
    assertCredentialAbsent: (value) => value,
    createOperatorResolutionController: () => null,
  });
  const pinned = await mutableHost.native.descriptor();
  mutableSource.descriptors.native.transportId = 'mutated-after-construction';
  if (canonicalJson(await mutableHost.native.descriptor()) !== canonicalJson(pinned)) {
    throw new Error('pinned descriptor drifted');
  }
  pass('pinned-descriptor-stability');

  await mustReject(() => host.assertCredentialAbsent({ authorization: 'secret' }), 'credential preflight');
  pass('credential-preflight');

  if (canonicalJson(Object.keys(host).sort()) !== canonicalJson([
    'assertCredentialAbsent', 'createOperatorResolutionController', 'describe',
    'native', 'review', 'revision',
  ])) throw new Error('portable public surface changed');
  if (canonicalJson(host.describe().authority) !== canonicalJson(PORTABLE_PHASE_HOST_AUTHORITY)) {
    throw new Error('portable authority expanded');
  }
  pass('public-surface-and-authority');

  const providers = [
    ['openai-compatible-chat-completions-v1', validOpenAICompatiblePhasePolicy, 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256'],
    ['anthropic-messages-v1', validAnthropicMessagesPhasePolicy, 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256'],
  ];
  let providerCalls = 0;
  let credentialLeaks = 0;
  for (const [family, policyFactory, pinName] of providers) {
    const result = await verifyProviderWrapper(family, policyFactory, pinName);
    providerCalls += result.providerCalls;
    credentialLeaks += result.credentialLeaks;
    pass(`provider-wrapper-${family}`);
  }

  cases.sort((left, right) => left.id.localeCompare(right.id));
  const assertions = {
    cases: cases.length,
    rejectedCases: 7,
    verifiedCases: 4,
    providerFamilies: 2,
    providerCalls,
    credentialLeaks,
    authorityExpansions: 0,
    pinnedDescriptorDrift: 0,
    publicSurfaceExact: true,
  };
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-portable-phase-host-adversarial-fixture-v1',
    cases,
    assertions,
  };
  return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
}
