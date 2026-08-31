import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildIdentityBoundNativeCompletion,
  buildIdentityBoundNativeTransportDescriptor,
} from '../src/runtime/identity-bound-native-contracts.mjs';
import { createIdentityBoundMissionVessel } from '../src/runtime/identity-bound-mission-vessel.mjs';
import { buildRecoverableGodskillsTransportDescriptor } from '../src/skills/recoverable-godskills-contracts.mjs';
import { createRecoverableGodskillsAdapter } from '../src/skills/recoverable-godskills-adapter.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { cortexBindingRequest, setupAdmittedIdentity } from './helpers/admitted-identity-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

function vesselRequest() {
  const binding = cortexBindingRequest({
    missionId: 'mission-recoverable-godskills-pending-vessel',
    taskId: 'task-recoverable-godskills-pending-vessel',
    observationId: 'observation-recoverable-godskills-pending-vessel',
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

function stageTransport(stage, status = 'pending') {
  const descriptor = buildRecoverableGodskillsTransportDescriptor({
    stage,
    transportId: `pending-vessel-${stage}-v1`,
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 262_144,
  });
  const calls = [];
  return {
    calls,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        return { status };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        throw new Error('pending fixture must never execute');
      },
    },
  };
}

function nativeTransport() {
  const descriptor = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'pending-vessel-native-v1',
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 16_384,
  });
  const calls = [];
  return {
    calls,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        return { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        return {
          status: 'completed',
          completion: buildIdentityBoundNativeCompletion({
            dispatch,
            transportDescriptor: descriptor,
            artifact: { schemaVersion: 1, artifactType: 'native', content: 'must not execute' },
            usage: {
              inputTokens: 1,
              cachedInputTokens: 0,
              reasoningTokens: 0,
              visibleOutputTokens: 1,
              completionTokens: 1,
            },
            startedAt: '2026-08-31T18:00:00.000Z',
            completedAt: '2026-08-31T18:00:00.100Z',
          }),
        };
      },
    },
  };
}

test('identity-bound vessel returns Godskills pending without publishing admission or dispatching native cognition', async (t) => {
  const admitted = await setupAdmittedIdentity(t, 'recoverable-pending-vessel');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const outboxRoot = await mkdtemp(join(tmpdir(), 'recoverable-godskills-vessel-outbox-'));
  t.after(() => rm(outboxRoot, { recursive: true, force: true }));
  const route = stageTransport('route');
  const activation = stageTransport('activation', 'absent');
  const native = nativeTransport();
  const adapter = await createRecoverableGodskillsAdapter({
    admissionRoot: outboxRoot,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingTransport: route.adapter,
    activationClassifier: () => ({
      taskClass: 'verification',
      consequenceClass: 'consequential',
      reviewAvailable: true,
    }),
    activationTransport: activation.adapter,
  });
  const vesselRoot = join(admitted.root, 'pending-mission-vessels');
  const vessel = createIdentityBoundMissionVessel({
    genesisAdmission: admitted.admission,
    vesselRoot,
    journalRoot: join(admitted.root, 'pending-mission-journals'),
    godskillsAdapter: adapter,
    nativeTransport: native.adapter,
  });
  const result = await vessel.run(vesselRequest());

  assert.equal(result.status, 'pending');
  assert.equal(result.phase, 'route');
  assert.equal(result.authority.realmEffects, false);
  assert.equal(route.calls.filter(({ type }) => type === 'reconcile').length, 1);
  assert.equal(route.calls.some(({ type }) => type === 'execute'), false);
  assert.equal(activation.calls.some(({ type }) => type !== 'descriptor'), false);
  assert.equal(native.calls.length, 0);

  const missionSlots = await readdir(vesselRoot);
  assert.equal(missionSlots.length, 1);
  assert.deepEqual(await readdir(join(vesselRoot, missionSlots[0])), []);
});
