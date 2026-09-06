import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PORTABLE_PHASE_HOST_AUTHORITY,
  assertPortablePhaseHostInstance,
  buildPortablePhaseHostDescription,
  createPortablePhaseHostAdapter,
} from '../src/sdk/portable-phase-host.mjs';
import {
  buildDeterministicPortablePhaseHostAdversarialFixture,
  buildPortableAdversarialDescription,
  buildPortableAdversarialHost,
  buildPortableAdversarialDescriptors,
  buildPortableAdversarialPort,
} from './helpers/portable-phase-host-adversarial-fixture.mjs';

test('hostile campaign rejects counterfeit and shallow-cloned hosts', async () => {
  const { host } = await buildPortableAdversarialHost();
  assert.throws(() => assertPortablePhaseHostInstance({ ...host }), /issued|instance/i);
  assert.equal(assertPortablePhaseHostInstance(host).protocolId, 'eternities-portable-phase-host-v1');
});

test('hostile campaign rejects forged protocol, capability, authority, and credential fields', async () => {
  const source = buildPortableAdversarialDescription();
  for (const mutate of [
    (value) => { value.protocolId = 'forged'; },
    (value) => { value.capabilities.durableExecution = false; },
    (value) => { value.authority.realmEffects = true; },
    (value) => { value.credentials = 'never-public'; },
  ]) {
    const forged = structuredClone(source);
    mutate(forged);
    const { descriptionDigest: _old, ...unsigned } = forged;
    forged.descriptionDigest = 'a'.repeat(64);
    assert.throws(() => buildPortablePhaseHostDescription(unsigned), /protocol|capabilit|authority|field/i);
  }
  assert.deepEqual(source.authority, PORTABLE_PHASE_HOST_AUTHORITY);
});

test('hostile campaign rejects phase descriptor drift before issuing a host', async () => {
  const source = buildPortableAdversarialDescription();
  const descriptors = buildPortableAdversarialDescriptors('drifted');
  await assert.rejects(
    createPortablePhaseHostAdapter({
      description: source,
      native: buildPortableAdversarialPort(descriptors.native),
      review: buildPortableAdversarialPort(source.descriptors.review),
      revision: buildPortableAdversarialPort(source.descriptors.revision),
      assertCredentialAbsent: (value) => value,
      createOperatorResolutionController: () => null,
    }),
    /descriptor/i,
  );
});

test('hostile campaign keeps pinned descriptors stable after source mutation and rejects credentials', async () => {
  const source = structuredClone(buildPortableAdversarialDescription());
  const host = await createPortablePhaseHostAdapter({
    description: source,
    native: buildPortableAdversarialPort(source.descriptors.native),
    review: buildPortableAdversarialPort(source.descriptors.review),
    revision: buildPortableAdversarialPort(source.descriptors.revision),
    assertCredentialAbsent: (value) => value,
    createOperatorResolutionController: () => null,
  });
  const original = await host.native.descriptor();
  source.descriptors.native.transportId = 'mutated-after-construction';
  assert.deepEqual(await host.native.descriptor(), original);
  assert.deepEqual(host.assertCredentialAbsent({ safe: true }), { safe: true });
  assert.throws(() => host.assertCredentialAbsent({ authorization: 'secret' }), /credential/i);
});

test('hostile campaign preserves the exact public surface and empty authority', async () => {
  const { host } = await buildPortableAdversarialHost();
  assert.deepEqual(Object.keys(host).sort(), [
    'assertCredentialAbsent', 'createOperatorResolutionController', 'describe',
    'native', 'review', 'revision',
  ]);
  assert.deepEqual(host.describe().authority, PORTABLE_PHASE_HOST_AUTHORITY);
  assert.equal(host.describe().authority.realmEffects, false);
  assert.equal(host.describe().authority.soul, false);
});

test('hostile campaign fixture is deterministic and body-free', async () => {
  const first = await buildDeterministicPortablePhaseHostAdversarialFixture();
  const second = await buildDeterministicPortablePhaseHostAdversarialFixture();
  assert.deepEqual(first, second);
  assert.equal(first.assertions.providerCalls, 0);
  assert.equal(first.assertions.credentialLeaks, 0);
  assert.equal(first.assertions.authorityExpansions, 0);
  assert.equal(first.assertions.publicSurfaceExact, true);
  assert.equal(Object.hasOwn(first, 'credentials'), false);
  for (const record of first.cases) {
    assert.deepEqual(Object.keys(record).sort(), ['id', 'status']);
    assert.equal(record.status, 'pass');
  }
});
