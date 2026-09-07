import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { compileCortexBindingCandidate } from '../src/cortex/binding-compiler.mjs';
import { buildCortexBindingRequestFromVesselRequest } from '../src/runtime/identity-bound-mission-vessel-contracts.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import { buildEffectOnlyRoutingProjection } from '../src/skills/effect-only-routing-projection.mjs';
import { setupAdmittedIdentity } from './helpers/admitted-identity-fixture.mjs';

async function setup(t) {
  const vector = JSON.parse(await readFile(new URL('../fixtures/effect-only-golden-vector-v2.json', import.meta.url), 'utf8'));
  const admitted = await setupAdmittedIdentity(t, 'effect-projection');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const { routeMode, ...legacy } = vector.subject;
  const candidate = await compileCortexBindingCandidate({ admission: admitted.admission,
    request: buildCortexBindingRequestFromVesselRequest({ ...legacy, schemaVersion: 1 }) });
  const request = prepareLocalArtifactEffectRequest(vector.subject,
    { expectedProducerDescriptorDigest: vector.digests.producerDescriptorDigest });
  // Minimal already-loaded policy seam. Full policy loading/descriptor closure
  // is exercised independently by admitted-sealed-identity-launch.test.mjs.
  const policy = {
    schemaVersion: 2,
    runtime: { protocolId: 'eternities-admitted-sealed-identity-host-v2',
      hostAdapterId: request.task.hostAdapterId, revocationEpoch: request.task.revocationEpoch,
      effectProducerDescriptorDigest: vector.digests.producerDescriptorDigest,
      limits: { ...request.budgets, maxCycles: request.maxCycles, maxProjectionBytes: request.maxProjectionBytes } },
    authority: request.requestedAuthority, hostContext: request.hostCeiling,
  };
  return { vector, request, policy, candidate };
}

test('effect-only projection agrees with independent golden request and source digests', async t => {
  const fixture = await setup(t);
  const projected = buildEffectOnlyRoutingProjection(fixture);
  assert.deepEqual(projected.request, fixture.vector.request);
  assert.deepEqual(projected.expectedSource, fixture.vector.expectedSource);
  assert.equal(Object.isFrozen(projected.request.context), true);
  assert.equal(Object.hasOwn(projected.request, 'candidate'), false);
  assert.equal(Object.hasOwn(projected.request, 'policy'), false);
});

test('projection rejects changed source and cannot borrow another candidate mission', async t => {
  const fixture = await setup(t);
  const changed = structuredClone(fixture.request);
  changed.mission.objective = 'different mission';
  assert.throws(() => buildEffectOnlyRoutingProjection({ ...fixture, request: changed }));
  const { effectAssessment, ...newSubject } = changed;
  const rebound = prepareLocalArtifactEffectRequest(newSubject, {
    expectedProducerDescriptorDigest: fixture.vector.digests.producerDescriptorDigest,
  });
  assert.throws(() => buildEffectOnlyRoutingProjection({ ...fixture, request: rebound }), /candidate|mission/);
});

test('projection rejects an untrusted producer policy even for a valid assessment', async t => {
  const fixture = await setup(t);
  const policy = structuredClone(fixture.policy);
  policy.runtime.effectProducerDescriptorDigest = 'f'.repeat(64);
  assert.throws(() => buildEffectOnlyRoutingProjection({ ...fixture, policy }), /producer/);
});

test('projection preserves declared write when the host ceiling only permits reads', async t => {
  const fixture = await setup(t);
  const subject = structuredClone(fixture.vector.subject);
  subject.hostCeiling.permittedEffects = ['local-read'];
  subject.hostCeiling.availableAuthority = ['local-read'];
  subject.requestedAuthority = ['local-read'];
  const request = prepareLocalArtifactEffectRequest(subject, {
    expectedProducerDescriptorDigest: fixture.vector.digests.producerDescriptorDigest,
  });
  const policy = structuredClone(fixture.policy);
  policy.authority = ['local-read'];
  policy.hostContext = structuredClone(subject.hostCeiling);
  const projected = buildEffectOnlyRoutingProjection({ ...fixture, request, policy });
  assert.deepEqual(projected.request.context.permittedEffects, ['local-read']);
  assert.deepEqual(projected.request.context.availableAuthority, ['local-read']);
  assert.deepEqual(projected.request.effectAssessment.requestedEffects, ['local-read', 'local-write']);
  assert.notEqual(projected.expectedSource.requestDigest, fixture.vector.expectedSource.requestDigest);
});
