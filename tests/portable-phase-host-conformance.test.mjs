import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildIdentityBoundNativeTransportDescriptor,
} from '../src/runtime/identity-bound-native-contracts.mjs';
import { buildMissionRevisionTransportDescriptor } from '../src/runtime/mission-revision-transport-contracts.mjs';
import { buildGodskillsReviewTransportDescriptor } from '../src/skills/review-transport-contracts.mjs';
import {
  PORTABLE_PHASE_HOST_AUTHORITY,
  PORTABLE_PHASE_HOST_CAPABILITIES,
  assertPortablePhaseHostInstance,
  buildPortablePhaseHostDescription,
  createPortablePhaseHostAdapter,
  verifyPortablePhaseHostDescription,
} from '../src/sdk/portable-phase-host.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';

const DIGEST = 'a'.repeat(64);
const PHASES = ['native', 'review', 'revision'];

function descriptors(prefix = 'portable') {
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

function description(overrides = {}) {
  return buildPortablePhaseHostDescription({
    adapterId: 'portable-fixture',
    adapterVersion: '1',
    policyDigest: DIGEST,
    descriptors: descriptors(),
    ...overrides,
  });
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function port(descriptor) {
  return {
    descriptor: async () => descriptor,
    reconcile: async (dispatch) => ({ status: 'absent', dispatchDigest: dispatch.dispatchDigest }),
    execute: async (dispatch) => ({ status: 'completed', dispatchDigest: dispatch.dispatchDigest }),
  };
}

test('portable host description is fixed, canonical, and deeply frozen', () => {
  const value = description();
  assert.deepEqual(Object.keys(value).sort(), [
    'adapterId', 'adapterVersion', 'authority', 'capabilities', 'descriptionDigest',
    'descriptors', 'policyDigest', 'protocolId', 'schemaVersion',
  ]);
  assert.equal(value.protocolId, 'eternities-portable-phase-host-v1');
  assert.deepEqual(value.capabilities, PORTABLE_PHASE_HOST_CAPABILITIES);
  assert.deepEqual(value.authority, PORTABLE_PHASE_HOST_AUTHORITY);
  assert.deepEqual(value.capabilities.phases, PHASES);
  assert.equal(verifyPortablePhaseHostDescription(value), value);
  assertDeepFrozen(value);

  const second = description();
  assert.equal(canonicalJson(value), canonicalJson(second));
  assert.equal(value.descriptionDigest, second.descriptionDigest);
  assert.throws(
    () => buildPortablePhaseHostDescription({ ...second, unknown: true }),
    /configuration/i,
  );
});

test('portable host factory pins descriptors and exposes only the neutral host surface', async () => {
  const source = structuredClone(description());
  let credentialChecks = 0;
  let controllerCalls = 0;
  const host = await createPortablePhaseHostAdapter({
    description: source,
    native: port(source.descriptors.native),
    review: port(source.descriptors.review),
    revision: port(source.descriptors.revision),
    assertCredentialAbsent(value) {
      credentialChecks += 1;
      return value;
    },
    createOperatorResolutionController(options) {
      controllerCalls += 1;
      return options;
    },
  });

  assert.deepEqual(Object.keys(host).sort(), [
    'assertCredentialAbsent', 'createOperatorResolutionController', 'describe',
    'native', 'review', 'revision',
  ]);
  assert.deepEqual(host.describe(), source);
  assert.deepEqual(assertPortablePhaseHostInstance(host), source);
  assert.equal(host.assertCredentialAbsent({ safe: true }).safe, true);
  assert.deepEqual(host.createOperatorResolutionController({ mode: 'test' }), { mode: 'test' });
  assert.equal(credentialChecks, 1);
  assert.equal(controllerCalls, 1);
  assert.deepEqual(await host.native.descriptor(), source.descriptors.native);
  assert.deepEqual(await host.review.descriptor(), source.descriptors.review);
  assert.deepEqual(await host.revision.descriptor(), source.descriptors.revision);

  source.adapterId = 'mutated-after-construction';
  assert.equal(host.describe().adapterId, 'portable-fixture');
  assert.throws(() => assertPortablePhaseHostInstance({ ...host }), /issued|instance/i);
});

test('portable host factory rejects descriptor drift and unsafe descriptions before use', async () => {
  const source = description();
  const changed = buildIdentityBoundNativeTransportDescriptor({
    transportId: `changed-native:${DIGEST}`,
  });
  await assert.rejects(
    createPortablePhaseHostAdapter({
      description: source,
      native: port(changed),
      review: port(source.descriptors.review),
      revision: port(source.descriptors.revision),
      assertCredentialAbsent: (value) => value,
      createOperatorResolutionController: () => null,
    }),
    /descriptor/i,
  );

  for (const mutate of [
    (value) => { value.authority.realmEffects = true; },
    (value) => { value.capabilities.durableExecution = false; },
    (value) => { value.adapterId = 'secret-adapter'; value.credentials = 'nope'; },
  ]) {
    const forged = structuredClone(source);
    mutate(forged);
    const { descriptionDigest: _old, ...unsigned } = forged;
    forged.descriptionDigest = sha256Value(unsigned);
    assert.throws(() => verifyPortablePhaseHostDescription(forged), /authority|capabilit|field|credential|description/i);
  }
});

test('existing provider hosts can be wrapped without provider work or secret disclosure', async (t) => {
  const families = [
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
  ];

  for (const family of families) {
    const root = await mkdtemp(join(tmpdir(), 'portable-phase-host-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const policy = family.policy();
    const policyPath = join(root, 'policy.json');
    const policyDigest = sha256Text(canonicalJson(policy));
    const secret = `portable-host-${family.id}-secret`;
    let providerCalls = 0;
    await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
    const provider = await createProviderPhaseHost({
      family: family.id,
      policyPath,
      env: { [family.pin]: policyDigest, [policy.provider.credentialEnv]: secret },
      runtimeRoot: join(root, 'operations'),
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error('provider call is outside conformance construction');
      },
    });
    const providerDescription = provider.describe();
    const portableDescription = buildPortablePhaseHostDescription({
      adapterId: `provider-wrapper-${family.id}`,
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
    assert.deepEqual(assertPortablePhaseHostInstance(wrapped), portableDescription);
    assert.equal(canonicalJson(wrapped.describe()).includes(secret), false);
    assert.equal(providerCalls, 0);
  }
});
