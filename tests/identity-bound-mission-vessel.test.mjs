import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test from 'node:test';

import { compileCortexBindingCandidate } from '../src/cortex/binding-compiler.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildIdentityBoundMissionVesselAdmission,
  buildIdentityBoundMissionVesselCompletion,
  verifyIdentityBoundMissionVesselAdmission,
  verifyIdentityBoundMissionVesselCompletion,
  verifyIdentityBoundMissionVesselRequest,
} from '../src/runtime/identity-bound-mission-vessel-contracts.mjs';
import {
  buildMissionAdmission,
  buildMissionCompletionReceipt,
  buildMissionVerdict,
} from '../src/runtime/mission-phase-contracts.mjs';
import {
  buildReviewGodskillsBinding,
  buildReviewGodskillsTrustPin,
} from './helpers/mission-review-fixture.mjs';
import {
  cortexBindingRequest,
  setupAdmittedIdentity,
} from './helpers/admitted-identity-fixture.mjs';

function authorityProjection() {
  return {
    availableAuthority: ['realm:write'],
    permittedEffects: ['local-read', 'local-write'],
    availablePreconditions: ['realm-observed'],
    maximumRisk: 'moderate',
    minimumEvidenceConfidence: 'verified',
    contextBudget: 16_000,
  };
}

function vesselRequest(overrides = {}) {
  const binding = cortexBindingRequest();
  const value = {
    schemaVersion: 1,
    task: structuredClone(binding.task),
    mission: {
      missionId: binding.mission.missionId,
      objective: binding.mission.objective,
      successEvidence: structuredClone(binding.mission.successEvidence),
      stopConditions: structuredClone(binding.mission.stopConditions),
    },
    observation: structuredClone(binding.mission.observation),
    requestedAuthority: ['realm:write'],
    explicitMethodRequests: [],
    hostCeiling: {
      availableAuthority: ['realm:write'],
      permittedEffects: ['local-read', 'local-write'],
      availablePreconditions: ['realm-observed'],
      forbiddenCapabilities: [],
      maximumRisk: 'moderate',
      minimumEvidenceConfidence: 'verified',
      contextBudget: 16_000,
      maxCompositionSize: 3,
    },
    budgets: {
      maxArtifactBytes: 8192,
      nativeCompletionTokens: 1000,
      reviewCompletionTokensPerRound: 500,
      revisionCompletionTokens: 800,
      totalCompletionTokens: 2800,
    },
    sourceStateEpoch: 0,
    maxCycles: 4,
    maxProjectionBytes: 65_536,
  };
  return Object.assign(value, structuredClone(overrides));
}

async function state(t) {
  const admitted = await setupAdmittedIdentity(t, 'contracts');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const request = vesselRequest();
  const candidate = await compileCortexBindingCandidate({
    admission: admitted.admission,
    request: {
      schemaVersion: 1,
      task: structuredClone(request.task),
      mission: {
        ...structuredClone(request.mission),
        budget: { maxCycles: request.maxCycles, maxCompletionTokens: request.budgets.totalCompletionTokens },
        observation: structuredClone(request.observation),
      },
      maxProjectionBytes: request.maxProjectionBytes,
    },
  });
  const authority = authorityProjection();
  const binding = buildReviewGodskillsBinding(request.mission.missionId, {
    authority,
    authorityCeilingDigest: sha256Value(authority),
  });
  const routeBinding = { status: 'bound', receipt: binding.receipt, cortexPackage: binding.cortexPackage };
  const missionAdmission = buildMissionAdmission({
    mission: request.mission,
    authorityCeilingDigest: binding.receipt.authorityCeilingDigest,
    budgets: request.budgets,
    godskillsBinding: binding,
    godskillsTrustPin: buildReviewGodskillsTrustPin(binding),
    admittedAt: '2026-08-31T18:30:00.000Z',
  });
  return { request, candidate, routeBinding, missionAdmission };
}

test('vessel request is closed, sorted, bounded, and credential-free', () => {
  const request = vesselRequest();
  assert.deepEqual(verifyIdentityBoundMissionVesselRequest(request), request);

  for (const mutate of [
    (value) => { value.identity = { name: 'forged' }; },
    (value) => { value.provider = 'forbidden'; },
    (value) => { value.sourcePath = 'C:\\copied-agent'; },
    (value) => { value.apiKey = 'do-not-reflect'; },
    (value) => { value.hostCeiling.availableAuthority = ['z', 'a']; },
    (value) => { value.requestedAuthority = ['realm:write', 'realm:write']; },
    (value) => { value.budgets.totalCompletionTokens = 999_999; },
  ]) {
    const changed = structuredClone(request);
    mutate(changed);
    assert.throws(
      () => verifyIdentityBoundMissionVesselRequest(changed),
      (error) => /request|field|credential|path|sorted|unique|budget/i.test(error.message)
        && !error.message.includes('do-not-reflect'),
    );
  }
});

test('immutable vessel admission binds request, identity, Godskills, and mission admission', async (t) => {
  const fixture = await state(t);
  const first = buildIdentityBoundMissionVesselAdmission(fixture);
  const second = buildIdentityBoundMissionVesselAdmission(fixture);

  assert.deepEqual(first, second);
  assert.deepEqual(verifyIdentityBoundMissionVesselAdmission(first, fixture), first);
  assert.equal(first.requestDigest, sha256Value(fixture.request));
  assert.equal(first.identity.candidateDigest, fixture.candidate.candidateDigest);
  assert.equal(first.identity.modelProjectionDigest, fixture.candidate.modelProjectionDigest);
  assert.equal(first.godskills.receiptDigest, sha256Value(fixture.routeBinding.receipt));
  assert.equal(first.missionAdmissionDigest, fixture.missionAdmission.admissionDigest);
  assert.equal(first.vesselAdmissionDigest.length, 64);
  assert.equal(JSON.stringify(first).includes(fixture.candidate.fullEnvelope.identity.name), false);

  for (const mutate of [
    (value) => { value.requestDigest = 'f'.repeat(64); },
    (value) => { value.identity.modelProjectionDigest = 'e'.repeat(64); },
    (value) => { value.godskills.status = 'no-qualified-route'; },
    (value) => { value.missionAdmissionDigest = 'd'.repeat(64); },
  ]) {
    const changed = structuredClone(first);
    mutate(changed);
    const { vesselAdmissionDigest: _ignored, ...unsigned } = changed;
    changed.vesselAdmissionDigest = sha256Value(unsigned);
    assert.throws(
      () => verifyIdentityBoundMissionVesselAdmission(changed, fixture),
      /request|identity|Godskills|mission|binding/i,
    );
  }
});

test('a different admitted identity cannot reuse an existing vessel admission', async (t) => {
  const fixture = await state(t);
  const record = buildIdentityBoundMissionVesselAdmission(fixture);
  const other = await setupAdmittedIdentity(t, 'contracts-other', { variant: true });
  t.after(() => rm(other.root, { recursive: true, force: true }));
  const differentCandidate = await compileCortexBindingCandidate({
    admission: other.admission,
    request: {
      schemaVersion: 1,
      task: structuredClone(fixture.request.task),
      mission: {
        ...structuredClone(fixture.request.mission),
        budget: {
          maxCycles: fixture.request.maxCycles,
          maxCompletionTokens: fixture.request.budgets.totalCompletionTokens,
        },
        observation: structuredClone(fixture.request.observation),
      },
      maxProjectionBytes: fixture.request.maxProjectionBytes,
    },
  });
  assert.throws(
    () => verifyIdentityBoundMissionVesselAdmission(record, {
      ...fixture,
      candidate: differentCandidate,
    }),
    /identity|candidate|admission/i,
  );
});

test('vessel completion binds an accepted or rejected terminal mission without minting authority', async (t) => {
  const fixture = await state(t);
  const vesselAdmission = buildIdentityBoundMissionVesselAdmission(fixture);
  const nativeResultDigest = '1'.repeat(64);
  const reviewResultDigest = '2'.repeat(64);
  const verdict = buildMissionVerdict({
    admission: fixture.missionAdmission,
    disposition: 'rejected',
    reason: 'review-rejected',
    acceptedArtifactDigest: null,
    nativeResultDigest,
    reviewResultDigests: [reviewResultDigest],
    revisionResultDigest: null,
  });
  const receipt = buildMissionCompletionReceipt({
    admission: fixture.missionAdmission,
    transactionId: '3'.repeat(64),
    preCompletionJournalHeadDigest: '4'.repeat(64),
    verdict,
    phaseResults: {
      nativeResultDigest,
      reviewResultDigests: [reviewResultDigest],
      revisionResultDigest: null,
    },
    usage: {
      inputTokens: 100,
      cachedInputTokens: 80,
      reasoningTokens: 20,
      visibleOutputTokens: 10,
      completionTokens: 30,
    },
    completedAt: '2026-08-31T18:31:00.000Z',
  });
  const missionResult = { status: 'completed', receipt, verdict, artifact: null };
  const completion = buildIdentityBoundMissionVesselCompletion({ vesselAdmission, missionResult });

  assert.deepEqual(verifyIdentityBoundMissionVesselCompletion(completion, {
    vesselAdmission,
    missionResult,
  }), completion);
  assert.equal(completion.acceptedArtifactDigest, null);
  assert.equal(completion.authority.realmEffects, false);
  assert.equal(completion.authority.continuityAdmission, false);
});
