import assert from 'node:assert/strict';
import { readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildIdentityBoundNativeCompletion,
  buildIdentityBoundNativeTransportDescriptor,
} from '../src/runtime/identity-bound-native-contracts.mjs';
import { createIdentityBoundMissionVessel } from '../src/runtime/identity-bound-mission-vessel.mjs';
import { createMissionRevisionExecutor } from '../src/runtime/mission-revision-executor.mjs';
import {
  buildMissionRevisionTransportCompletion,
  buildMissionRevisionTransportDescriptor,
} from '../src/runtime/mission-revision-transport-contracts.mjs';
import { createDeferredGodskillsReviewExecutor } from '../src/skills/deferred-review-executor.mjs';
import {
  buildGodskillsReviewTransportCompletion,
  buildGodskillsReviewTransportDescriptor,
} from '../src/skills/review-transport-contracts.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import {
  buildReviewGodskillsBinding,
} from './helpers/mission-review-fixture.mjs';
import {
  cortexBindingRequest,
  setupAdmittedIdentity,
} from './helpers/admitted-identity-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

function usage(completionTokens) {
  return {
    inputTokens: 800,
    cachedInputTokens: 600,
    reasoningTokens: completionTokens - 40,
    visibleOutputTokens: 40,
    completionTokens,
  };
}

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

function godskillsAdapter(binding, counters, status = 'bound') {
  return Object.freeze({
    releaseDigest: binding.receipt.releaseDigest,
    async bindMission() {
      counters.bind += 1;
      return {
        status,
        receipt: structuredClone(binding.receipt),
        cortexPackage: structuredClone(binding.cortexPackage),
      };
    },
    async rehydrateMission({ receipt }) {
      counters.rehydrate += 1;
      assert.deepEqual(receipt, binding.receipt);
      return {
        status,
        receipt: structuredClone(binding.receipt),
        cortexPackage: structuredClone(binding.cortexPackage),
      };
    },
  });
}

function noQualifiedRoute(binding) {
  const cortexPackage = structuredClone(binding.cortexPackage);
  cortexPackage.selectedCapabilities = [];
  cortexPackage.selectedPackages = [];
  cortexPackage.deferredReviews = [];
  cortexPackage.disclosureBytes = 0;
  delete cortexPackage.activation;
  const receipt = structuredClone(binding.receipt);
  receipt.selectionStatus = 'no-qualified-route';
  receipt.selected = [];
  delete receipt.activation;
  receipt.packageDigest = sha256Text(canonicalJson(cortexPackage));
  return { receipt, cortexPackage };
}

function identityTransport() {
  const descriptor = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'identity-bound-vessel-integration-native-v1',
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  const complete = (dispatch) => buildIdentityBoundNativeCompletion({
    dispatch,
    transportDescriptor: descriptor,
    artifact: {
      schemaVersion: 1,
      artifactType: 'native',
      content: `draft by ${dispatch.modelProjection.identity.name} with an evidence link requiring repair`,
    },
    usage: usage(120),
    startedAt: '2026-08-31T23:10:00.000Z',
    completedAt: '2026-08-31T23:10:00.500Z',
  });
  return {
    calls,
    completions,
    adapter: {
      descriptor: () => structuredClone(descriptor),
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate identity-bound native execution');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

function reviewTransport() {
  const descriptor = buildGodskillsReviewTransportDescriptor({
    transportId: 'identity-bound-vessel-integration-review-v1',
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  const complete = (dispatch) => buildGodskillsReviewTransportCompletion({
    dispatch,
    transportDescriptor: descriptor,
    artifact: {
      schemaVersion: 1,
      artifactType: 'review',
      subjectDigest: dispatch.package.subject.artifactDigest,
      recommendation: dispatch.package.round === 1 ? 'revise' : 'accept',
      findings: dispatch.package.round === 1
        ? [{
          id: 'bind-exact-evidence',
          severity: 'important',
          required: true,
          message: 'replace the ambiguous evidence link with the exact committed digest',
        }]
        : [],
      summary: dispatch.package.round === 1
        ? 'one exact evidence repair is required'
        : 'the identity-bound revision is accepted',
    },
    usage: usage(220),
    startedAt: dispatch.package.round === 1
      ? '2026-08-31T23:20:00.000Z'
      : '2026-08-31T23:40:00.000Z',
    completedAt: dispatch.package.round === 1
      ? '2026-08-31T23:20:00.500Z'
      : '2026-08-31T23:40:00.500Z',
  });
  return {
    calls,
    adapter: {
      descriptor: () => structuredClone(descriptor),
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate review execution');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

function revisionTransport() {
  const descriptor = buildMissionRevisionTransportDescriptor({
    transportId: 'identity-bound-vessel-integration-revision-v1',
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  const complete = (dispatch) => buildMissionRevisionTransportCompletion({
    dispatch,
    transportDescriptor: descriptor,
    artifact: {
      schemaVersion: 1,
      artifactType: 'revision',
      nativeArtifactDigest: dispatch.package.native.artifactDigest,
      reviewArtifactDigest: dispatch.package.review.artifactDigest,
      addressedFindingIds: ['bind-exact-evidence'],
      content: `identity-bound revision using ${dispatch.package.native.artifactDigest}`,
    },
    usage: usage(300),
    startedAt: '2026-08-31T23:30:00.000Z',
    completedAt: '2026-08-31T23:30:00.500Z',
  });
  return {
    calls,
    adapter: {
      descriptor: () => structuredClone(descriptor),
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate revision execution');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

async function reviewedBinding(missionId, reviewExecutor) {
  const manifest = JSON.parse(await readFile(
    `${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`,
    'utf8',
  ));
  const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
  const authority = authorityProjection();
  return buildReviewGodskillsBinding(missionId, {
    id: capability.id,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
    releaseDigest: reviewExecutor.releaseDigest,
    activationTrustRootDigest: reviewExecutor.activationTrustRootDigest,
    authority,
    authorityCeilingDigest: sha256Value(authority),
  });
}

async function executors(review, revision) {
  const reviewExecutor = await createDeferredGodskillsReviewExecutor({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'identity-bound-vessel-review',
    transport: review.adapter,
    io: { readFile, realpath },
  });
  const revisionExecutor = await createMissionRevisionExecutor({
    maximumMaterializedBytes: 32_768,
    executorIdPrefix: 'identity-bound-vessel-revision',
    transport: revision.adapter,
  });
  return { reviewExecutor, revisionExecutor };
}

test('default vessel recovers identity-bound native work and completes the real review loop', async (t) => {
  const admitted = await setupAdmittedIdentity(t, 'integration');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const request = vesselRequest();
  const native = identityTransport();
  const review = reviewTransport();
  const revision = revisionTransport();
  const built = await executors(review, revision);
  const binding = await reviewedBinding(request.mission.missionId, built.reviewExecutor);
  const godskillsCounters = { bind: 0, rehydrate: 0 };
  let now = Date.parse('2026-08-31T23:00:00.000Z');
  const clock = () => {
    const current = now;
    now += 600_000;
    return current;
  };
  const lockOptions = {
    pid: 63101,
    now: () => now,
    staleAfterMs: 500,
    isProcessAlive: () => false,
    nonce: () => 'identity-bound-vessel-lock',
  };
  const roots = {
    vesselRoot: join(admitted.root, 'mission-vessels'),
    journalRoot: join(admitted.root, 'mission-journals'),
  };
  let crashed = false;
  const first = createIdentityBoundMissionVessel({
    genesisAdmission: admitted.admission,
    ...roots,
    godskillsAdapter: godskillsAdapter(binding, godskillsCounters),
    nativeTransport: native.adapter,
    reviewExecutor: built.reviewExecutor,
    revisionExecutor: built.revisionExecutor,
    clock,
    checkpoint: async (name) => {
      if (!crashed && name === 'after-native-execute') {
        crashed = true;
        throw new Error('simulated process death after identity-bound native completion');
      }
    },
    lockOptions,
  });

  await assert.rejects(() => first.run(request), /process death/i);
  assert.equal(godskillsCounters.bind, 1);
  assert.equal(godskillsCounters.rehydrate, 0);
  assert.equal(native.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(review.calls.filter(({ type }) => type === 'execute').length, 0);
  const originalDispatch = native.calls.find(({ type }) => type === 'execute').dispatch;
  assert.equal(originalDispatch.modelProjection.identity.name, 'Aether Architect');
  assert.equal(originalDispatch.modelProjection.binding.instanceId, admitted.admission.instanceId);

  const rebuilt = await executors(review, revision);
  const recovered = createIdentityBoundMissionVessel({
    genesisAdmission: admitted.admission,
    ...roots,
    godskillsAdapter: godskillsAdapter(binding, godskillsCounters),
    nativeTransport: native.adapter,
    reviewExecutor: rebuilt.reviewExecutor,
    revisionExecutor: rebuilt.revisionExecutor,
    clock,
    checkpoint: async () => {},
    lockOptions,
  });
  const completed = await recovered.run(request);

  assert.equal(completed.status, 'completed');
  assert.equal(completed.mission.verdict.reason, 'revision-review-accepted');
  assert.match(completed.mission.artifact.content, /^identity-bound revision using [a-f0-9]{64}$/);
  assert.equal(completed.receipt.bindingCandidateId, originalDispatch.bindingCandidateId);
  assert.equal(completed.receipt.candidateDigest, originalDispatch.candidateDigest);
  assert.equal(completed.receipt.modelProjectionDigest, originalDispatch.modelProjectionDigest);
  assert.equal(completed.receipt.missionCompletionReceiptDigest, completed.mission.receipt.receiptDigest);
  assert.equal(completed.receipt.authority.realmEffects, false);
  assert.equal(godskillsCounters.bind, 1);
  assert.equal(godskillsCounters.rehydrate, 1);
  assert.equal(native.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(review.calls.filter(({ type }) => type === 'execute').length, 2);
  assert.equal(revision.calls.filter(({ type }) => type === 'execute').length, 1);
  const recoveredDispatch = native.calls.filter(({ type }) => type === 'reconcile').at(-1).dispatch;
  assert.equal(recoveredDispatch.dispatchDigest, originalDispatch.dispatchDigest);

  const callCounts = {
    native: native.calls.length,
    review: review.calls.length,
    revision: revision.calls.length,
    bind: godskillsCounters.bind,
  };
  const replay = await recovered.run(request);
  assert.deepEqual(replay, completed);
  assert.deepEqual({
    native: native.calls.length,
    review: review.calls.length,
    revision: revision.calls.length,
    bind: godskillsCounters.bind,
  }, callCounts);
});

test('changed request and changed admitted identity fail before transport use', async (t) => {
  const admitted = await setupAdmittedIdentity(t, 'tamper');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const request = vesselRequest({
    mission: {
      ...vesselRequest().mission,
      missionId: 'mission-identity-bound-tamper',
    },
  });
  request.task.taskId = 'task-identity-bound-tamper';
  request.observation.observationId = 'observation-identity-bound-tamper';
  const native = identityTransport();
  const review = reviewTransport();
  const revision = revisionTransport();
  const built = await executors(review, revision);
  const binding = await reviewedBinding(request.mission.missionId, built.reviewExecutor);
  const counters = { bind: 0, rehydrate: 0 };
  let now = Date.parse('2026-08-31T23:00:00.000Z');
  const clock = () => {
    const current = now;
    now += 600_000;
    return current;
  };
  const options = {
    genesisAdmission: admitted.admission,
    vesselRoot: join(admitted.root, 'tamper-vessels'),
    journalRoot: join(admitted.root, 'tamper-journals'),
    godskillsAdapter: godskillsAdapter(binding, counters),
    nativeTransport: native.adapter,
    reviewExecutor: built.reviewExecutor,
    revisionExecutor: built.revisionExecutor,
    clock,
    checkpoint: async () => {},
  };
  const vessel = createIdentityBoundMissionVessel(options);
  const completed = await vessel.run(request);
  assert.equal(completed.status, 'completed');
  const before = native.calls.length;

  const changed = structuredClone(request);
  changed.observation.summary = 'changed after immutable admission';
  await assert.rejects(() => vessel.run(changed), /request|admission|collision|changed/i);
  assert.equal(native.calls.length, before);

  const other = await setupAdmittedIdentity(t, 'tamper-other', { variant: true });
  t.after(() => rm(other.root, { recursive: true, force: true }));
  const impersonator = createIdentityBoundMissionVessel({ ...options, genesisAdmission: other.admission });
  await assert.rejects(() => impersonator.run(request), /identity|candidate|admission|collision/i);
  assert.equal(native.calls.length, before);
});

test('no-qualified route stays explicit while the kernel runs native-only and replays without external work', async (t) => {
  const admitted = await setupAdmittedIdentity(t, 'no-route');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const request = vesselRequest({
    mission: { ...vesselRequest().mission, missionId: 'mission-identity-bound-no-route' },
  });
  request.task.taskId = 'task-identity-bound-no-route';
  request.observation.observationId = 'observation-identity-bound-no-route';
  const base = buildReviewGodskillsBinding(request.mission.missionId, {
    authority: authorityProjection(),
    authorityCeilingDigest: sha256Value(authorityProjection()),
  });
  const binding = noQualifiedRoute(base);
  const counters = { bind: 0, rehydrate: 0 };
  const native = identityTransport();
  let now = Date.parse('2026-08-31T23:00:00.000Z');
  const clock = () => {
    const current = now;
    now += 600_000;
    return current;
  };
  const vessel = createIdentityBoundMissionVessel({
    genesisAdmission: admitted.admission,
    vesselRoot: join(admitted.root, 'no-route-vessels'),
    journalRoot: join(admitted.root, 'no-route-journals'),
    godskillsAdapter: godskillsAdapter(binding, counters, 'no-qualified-route'),
    nativeTransport: native.adapter,
    clock,
    checkpoint: async () => {},
  });
  const completed = await vessel.run(request);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.mission.verdict.reason, 'native-no-review');
  assert.equal(native.calls.find(({ type }) => type === 'execute').dispatch.missionPackage.godskills, null);
  assert.deepEqual(counters, { bind: 1, rehydrate: 0 });

  const count = native.calls.length;
  assert.deepEqual(await vessel.run(request), completed);
  assert.equal(native.calls.length, count);
  assert.deepEqual(counters, { bind: 1, rehydrate: 1 });
});

test('an unresolved Godskills decision creates no native dispatch', async (t) => {
  const admitted = await setupAdmittedIdentity(t, 'needs-decision');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const request = vesselRequest({
    mission: { ...vesselRequest().mission, missionId: 'mission-identity-bound-needs-decision' },
  });
  request.task.taskId = 'task-identity-bound-needs-decision';
  request.observation.observationId = 'observation-identity-bound-needs-decision';
  const native = identityTransport();
  const adapter = {
    releaseDigest: '8'.repeat(64),
    async bindMission() {
      return { status: 'needs-decision', unresolvedDecisions: ['effect-authority'] };
    },
    async rehydrateMission() {
      throw new Error('unresolved mission must not rehydrate');
    },
  };
  const vessel = createIdentityBoundMissionVessel({
    genesisAdmission: admitted.admission,
    vesselRoot: join(admitted.root, 'decision-vessels'),
    journalRoot: join(admitted.root, 'decision-journals'),
    godskillsAdapter: adapter,
    nativeTransport: native.adapter,
  });
  assert.deepEqual(await vessel.run(request), {
    status: 'needs-decision',
    unresolvedDecisions: ['effect-authority'],
  });
  assert.deepEqual(native.calls, []);
});
