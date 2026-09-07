import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import {
  buildIdentityBoundNativeCompletion,
  buildIdentityBoundNativeTransportDescriptor,
} from '../src/runtime/identity-bound-native-contracts.mjs';
import { createIdentityBoundMissionVessel } from '../src/runtime/identity-bound-mission-vessel.mjs';
import { createGodskillsAdapter } from '../src/skills/mission-binder.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import {
  cortexBindingRequest,
  setupAdmittedIdentity,
} from './helpers/admitted-identity-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const policyDigest = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const evidenceDigest = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';

function vesselRequest() {
  const binding = cortexBindingRequest({
    missionId: 'mission-real-godskills-vessel',
    taskId: 'task-real-godskills-vessel',
    observationId: 'observation-real-godskills-vessel',
  });
  return {
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
}

function routed(request, counters, status = 'selected') {
  counters.route += 1;
  const selectedIds = status === 'selected' ? ['eternities-aegis'] : [];
  return {
    compilerReceipt: {
      requestId: request.requestId,
      envelope: {
        availableAuthority: [...request.context.availableAuthority],
        permittedEffects: [...request.context.permittedEffects],
        availablePreconditions: [...request.context.availablePreconditions],
        forbiddenCapabilities: [...request.context.forbiddenCapabilities],
        maximumRisk: request.context.maximumRisk,
        minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
        contextBudget: request.context.contextBudget,
        maxCompositionSize: request.context.maxCompositionSize,
      },
    },
    routeReceipt: {
      requestId: request.requestId,
      status,
      selectionKind: status === 'selected' ? 'single' : 'none',
      selectedIds,
      selectedEntrypoints: status === 'selected' ? ['skills/eternities-aegis/SKILL.md'] : [],
      requestFeatures: {
        permittedEffects: [...request.context.permittedEffects],
        maximumRisk: request.context.maximumRisk,
        minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
        contextBudget: request.context.contextBudget,
      },
      unresolvedDecisions: status === 'needs-decision' ? ['intent-not-understood'] : [],
    },
  };
}

function activationResult(request) {
  const decisions = request.selected.map(({ selectedId }) => {
    const unsigned = {
      schemaVersion: 1,
      selectedId,
      taskClass: request.classification.taskClass,
      consequenceClass: request.classification.consequenceClass,
      mode: 'native',
      reasonCodes: ['fixture-native'],
      preInferenceDisclosure: 'none',
      deferredReview: false,
      methodEvidence: {
        eligible: false,
        matchedEvaluations: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        criticalRegressions: 0,
        overheadRatio: null,
        failedGates: ['fixture-evidence'],
      },
      policyDigest,
      evidenceDigest,
      authorityProjection: structuredClone(request.authorityProjection),
      authorityExpanded: false,
    };
    return { ...unsigned, decisionDigest: sha256Value(unsigned) };
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: request.protocolId,
    requestId: request.requestId,
    requestDigest: sha256Value(request),
    trustRootDigest: request.trustRootDigest,
    policyDigest,
    evidenceDigest,
    classification: structuredClone(request.classification),
    decisions,
  };
  return { ...unsigned, resultDigest: sha256Value(unsigned) };
}

async function realAdapter(counters, { forbidExternal = false, status = 'selected' } = {}) {
  return createGodskillsAdapter({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    transport: forbidExternal
      ? async () => { counters.route += 1; throw new Error('routing must not run during recovery'); }
      : async (request) => routed(request, counters, status),
    activationClassifier: forbidExternal
      ? () => { counters.classify += 1; throw new Error('classification must not run during recovery'); }
      : () => {
        counters.classify += 1;
        return {
          taskClass: 'verification',
          consequenceClass: 'low',
          reviewAvailable: false,
        };
      },
    activationTransport: forbidExternal
      ? () => { counters.activate += 1; throw new Error('activation must not run during recovery'); }
      : (request) => {
        counters.activate += 1;
        return activationResult(request);
      },
  });
}

function nativeTransport() {
  const descriptor = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'real-godskills-identity-transport-v1',
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
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
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate native execution');
        const completion = buildIdentityBoundNativeCompletion({
          dispatch,
          transportDescriptor: descriptor,
          artifact: {
            schemaVersion: 1,
            artifactType: 'native',
            content: 'native output from the exact identity and adaptive Godskills route',
          },
          usage: {
            inputTokens: 600,
            cachedInputTokens: 500,
            reasoningTokens: 60,
            visibleOutputTokens: 40,
            completionTokens: 100,
          },
          startedAt: '2026-08-31T23:10:00.000Z',
          completedAt: '2026-08-31T23:10:00.500Z',
        });
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

for (const status of ['selected', 'no-qualified-route', 'needs-decision']) {
test(`default vessel preserves ${status} through the real adapter${status === 'needs-decision' ? ' without inference' : ' and recovery'}`, async (t) => {
  const admitted = await setupAdmittedIdentity(t, 'real-godskills');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const request = vesselRequest();
  const native = nativeTransport();
  const firstCounters = { route: 0, classify: 0, activate: 0 };
  const recoveryCounters = { route: 0, classify: 0, activate: 0 };
  let now = Date.parse('2026-08-31T23:00:00.000Z');
  const clock = () => {
    const current = now;
    now += 600_000;
    return current;
  };
  const roots = {
    vesselRoot: join(admitted.root, 'real-godskills-vessels'),
    journalRoot: join(admitted.root, 'real-godskills-journals'),
  };
  const first = createIdentityBoundMissionVessel({
    genesisAdmission: admitted.admission,
    ...roots,
    godskillsAdapter: await realAdapter(firstCounters, { status }),
    nativeTransport: native.adapter,
    clock,
  });
  const completed = await first.run(request);

  if (status === 'needs-decision') {
    assert.equal(completed.status, 'needs-decision');
    assert.deepEqual(completed.unresolvedDecisions, ['intent-not-understood']);
    assert.deepEqual(firstCounters, { route: 1, classify: 0, activate: 0 });
    assert.equal(native.calls.length, 0, 'unresolved intent must never dispatch native inference');
    return;
  }

  assert.equal(completed.status, 'completed');
  const activated = status === 'selected' ? 1 : 0;
  assert.deepEqual(firstCounters, { route: 1, classify: activated, activate: activated });
  const dispatch = native.calls.find(({ type }) => type === 'execute').dispatch;
  if (status === 'no-qualified-route') {
    assert.equal(dispatch.missionPackage.godskills, null);
    assert.equal(native.calls.filter(({ type }) => type === 'execute').length, 1);
  } else {
  assert.deepEqual(dispatch.missionPackage.godskills.cortexPackage.selectedCapabilities, ['eternities-aegis']);
  assert.deepEqual(dispatch.missionPackage.godskills.cortexPackage.selectedPackages, []);
  assert.equal(dispatch.missionPackage.godskills.cortexPackage.activation.decisions[0].mode, 'native');
  }

  const callCount = native.calls.length;
  const recovered = createIdentityBoundMissionVessel({
    genesisAdmission: admitted.admission,
    ...roots,
    godskillsAdapter: await realAdapter(recoveryCounters, { forbidExternal: true }),
    nativeTransport: native.adapter,
    clock,
  });
  assert.deepEqual(await recovered.run(request), completed);
  assert.deepEqual(recoveryCounters, { route: 0, classify: 0, activate: 0 });
  assert.equal(native.calls.length, callCount);
});
}
