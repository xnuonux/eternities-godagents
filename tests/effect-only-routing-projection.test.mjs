import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { compileCortexBindingCandidate } from '../src/cortex/binding-compiler.mjs';
import { buildCortexBindingRequestFromVesselRequest } from '../src/runtime/identity-bound-mission-vessel-contracts.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import * as projectionApi from '../src/skills/effect-only-routing-projection.mjs';
const { buildEffectOnlyRoutingProjection } = projectionApi;
import { sha256Value } from '../src/core/digest.mjs';
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

test('host-only binding retains candidate and policy identity without leaking either to routing', async t => {
  const fixture = await setup(t);
  const projected = buildEffectOnlyRoutingProjection(fixture);
  assert.ok(projected.hostBinding, 'projection retains host-side admission binding');
  assert.equal(projected.hostBinding.candidateDigest, fixture.candidate.candidateDigest);
  assert.equal(projected.hostBinding.policyDigest, sha256Value(fixture.policy));
  assert.equal(projected.hostBinding.requestDigest, sha256Value(fixture.request));
  assert.equal(Object.isFrozen(projected.hostBinding), true);
  const policy = structuredClone(fixture.policy);
  policy.runtime.limits.maxCycles += 1;
  const next = buildEffectOnlyRoutingProjection({ ...fixture, policy });
  assert.deepEqual(next.request, projected.request);
  assert.deepEqual(next.expectedSource, projected.expectedSource);
  assert.notEqual(next.hostBinding.bindingDigest, projected.hostBinding.bindingDigest);
  assert.equal(Object.hasOwn(projected.request, 'hostBinding'), false);
});

test('recovery reconstructs the projection rather than trusting rehashed stored bindings', async t => {
  const fixture = await setup(t);
  assert.equal(typeof projectionApi.verifyEffectOnlyRoutingProjection, 'function', 'host recovery projection verifier exists');
  const projection = buildEffectOnlyRoutingProjection(fixture);
  const recover = (stored, overrides = {}) => projectionApi.verifyEffectOnlyRoutingProjection({ ...fixture, ...overrides, projection: stored });
  const recovered = recover(structuredClone(projection));
  assert.deepEqual(recovered, projection);
  assert.equal(Object.isFrozen(recovered.hostBinding), true);
  for (const field of ['requestDigest', 'candidateDigest', 'policyDigest', 'routingRequestDigest']) {
    const forged = structuredClone(projection);
    forged.hostBinding[field] = '0'.repeat(64);
    const { bindingDigest, ...unsigned } = forged.hostBinding;
    forged.hostBinding.bindingDigest = sha256Value(unsigned);
    assert.throws(() => recover(forged), /recovery.*mismatch/);
  }
  const changedPolicy = structuredClone(fixture.policy);
  changedPolicy.runtime.limits.maxCycles += 1;
  assert.throws(() => recover(projection, { policy: changedPolicy }), /recovery.*mismatch/);
  const changedWire = structuredClone(projection);
  changedWire.request.context.permittedEffects = ['local-read'];
  assert.throws(() => recover(changedWire), /recovery.*mismatch/);
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
