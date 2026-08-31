import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { compileCortexBindingCandidate } from '../src/cortex/binding-compiler.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildRecoverableGodskillsCompletion,
  buildRecoverableGodskillsTransportDescriptor,
} from '../src/skills/recoverable-godskills-contracts.mjs';
import { createRecoverableGodskillsAdapter } from '../src/skills/recoverable-godskills-adapter.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import {
  cortexBindingRequest,
  setupAdmittedIdentity,
} from './helpers/admitted-identity-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const policyDigest = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const evidenceDigest = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';

function routed(request) {
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
      status: 'selected',
      selectionKind: 'single',
      selectedIds: ['eternities-aegis'],
      selectedEntrypoints: ['skills/eternities-aegis/SKILL.md'],
      requestFeatures: {
        permittedEffects: [...request.context.permittedEffects],
        maximumRisk: request.context.maximumRisk,
        minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
        contextBudget: request.context.contextBudget,
      },
      unresolvedDecisions: [],
    },
  };
}

function activated(request) {
  const decisions = request.selected.map(({ selectedId }) => {
    const unsigned = {
      schemaVersion: 1,
      selectedId,
      taskClass: request.classification.taskClass,
      consequenceClass: request.classification.consequenceClass,
      mode: 'review',
      reasonCodes: ['recoverable-fixture-review'],
      preInferenceDisclosure: 'none',
      deferredReview: true,
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

function externalTransport(stage, resultFor, { reconciliation = 'absent' } = {}) {
  const descriptor = buildRecoverableGodskillsTransportDescriptor({
    stage,
    transportId: `recoverable-${stage}-fixture-v1`,
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 262_144,
  });
  const completions = new Map();
  const calls = [];
  return {
    calls,
    completions,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        if (completion) return { status: 'completed', completion: structuredClone(completion) };
        if (reconciliation === 'pending') return { status: 'pending' };
        return { status: reconciliation };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error(`duplicate ${stage} execution`);
        const completion = buildRecoverableGodskillsCompletion({
          dispatch,
          transportDescriptor: descriptor,
          result: resultFor(dispatch.request),
          startedAt: stage === 'route'
            ? '2026-08-31T17:00:00.000Z'
            : '2026-08-31T17:01:00.000Z',
          completedAt: stage === 'route'
            ? '2026-08-31T17:00:00.500Z'
            : '2026-08-31T17:01:00.500Z',
        });
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

function classifier(counters, consequenceClass = 'consequential') {
  return () => {
    counters.classify += 1;
    return { taskClass: 'verification', consequenceClass, reviewAvailable: true };
  };
}

async function bindingState(t, suffix) {
  const admitted = await setupAdmittedIdentity(t, suffix);
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const request = cortexBindingRequest({
    missionId: `mission-recoverable-godskills-${suffix}`,
    taskId: `task-recoverable-godskills-${suffix}`,
    observationId: `observation-recoverable-godskills-${suffix}`,
  });
  const candidate = await compileCortexBindingCandidate({ admission: admitted.admission, request });
  return {
    admitted,
    input: {
      mission: {
        requestId: request.mission.missionId,
        text: request.mission.objective,
        authority: ['realm:write'],
        explicitMethodRequests: [],
      },
      observation: structuredClone(request.mission.observation),
      genomePolicy: structuredClone(candidate.fullEnvelope.capability.godskills),
      hostEnvelope: {
        availableAuthority: ['realm:write'],
        permittedEffects: ['local-read', 'local-write'],
        availablePreconditions: ['realm-observed'],
        forbiddenCapabilities: [],
        maximumRisk: 'moderate',
        minimumEvidenceConfidence: 'verified',
        contextBudget: 16_000,
        maxCompositionSize: 3,
        constitutionAllowedEffects: structuredClone(candidate.fullEnvelope.authority.declaredEffectCeiling),
        realmHandContractDigest: candidate.fullEnvelope.authority.realmContractDigest,
      },
      sourceStateEpoch: 0,
    },
  };
}

async function adapter({ root, route, activation, counters, checkpoint = async () => {}, consequenceClass } = {}) {
  return createRecoverableGodskillsAdapter({
    admissionRoot: root,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingTransport: route.adapter,
    activationClassifier: classifier(counters, consequenceClass),
    activationTransport: activation.adapter,
    checkpoint,
    lockOptions: {
      pid: 64201,
      now: () => Date.parse('2026-08-31T17:02:00.000Z'),
      staleAfterMs: 1,
      isProcessAlive: () => false,
      nonce: () => 'recoverable-godskills-lock',
    },
  });
}

function operationCalls(transport) {
  return transport.calls.filter(({ type }) => type !== 'descriptor').length;
}

test('route completion recovers after process death and final replay bypasses all active stages', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'recoverable-godskills-route-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = await bindingState(t, 'route-crash');
  const route = externalTransport('route', routed);
  const activation = externalTransport('activation', activated);
  const counters = { classify: 0 };
  let crash = true;
  const first = await adapter({
    root,
    route,
    activation,
    counters,
    checkpoint: async (name) => {
      if (crash && name === 'after-godskills-route-execute') {
        crash = false;
        throw new Error('simulated process death after Godskills route');
      }
    },
  });
  await assert.rejects(() => first.bindMission(state.input), /process death/i);
  assert.equal(route.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(activation.calls.filter(({ type }) => type === 'execute').length, 0);
  assert.equal(counters.classify, 0);

  const recovered = await adapter({ root, route, activation, counters });
  const binding = await recovered.bindMission(state.input);
  assert.equal(binding.status, 'bound');
  assert.equal(binding.receipt.activation.decisions[0].mode, 'review');
  assert.equal(route.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(activation.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(counters.classify, 1);

  const beforeReplay = { route: operationCalls(route), activation: operationCalls(activation), classify: counters.classify };
  assert.deepEqual(await recovered.bindMission(state.input), binding);
  assert.deepEqual(
    { route: operationCalls(route), activation: operationCalls(activation), classify: counters.classify },
    beforeReplay,
  );
  const rehydrated = await recovered.rehydrateMission({ receipt: binding.receipt, ...state.input });
  assert.deepEqual(rehydrated, binding);
  assert.deepEqual(
    { route: operationCalls(route), activation: operationCalls(activation), classify: counters.classify },
    beforeReplay,
  );

  const intentText = await readFile(join(root, 'bindings', sha256Value({
    protocolId: 'eternities-recoverable-godskills-admission-v1',
    missionId: state.input.mission.requestId,
  }), 'intent.json'), 'utf8');
  assert.equal(intentText, `${canonicalJson(JSON.parse(intentText))}\n`);
  const changed = structuredClone(state.input);
  changed.observation.summary = 'changed after durable intent publication';
  await assert.rejects(() => recovered.bindMission(changed), /intent|collision|changed/i);
  assert.deepEqual(
    { route: operationCalls(route), activation: operationCalls(activation), classify: counters.classify },
    beforeReplay,
  );
});

test('activation completion recovers without reactivation and classification drift fails closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'recoverable-godskills-activation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = await bindingState(t, 'activation-crash');
  const route = externalTransport('route', routed);
  const activation = externalTransport('activation', activated);
  const counters = { classify: 0 };
  let crash = true;
  const first = await adapter({
    root,
    route,
    activation,
    counters,
    checkpoint: async (name) => {
      if (crash && name === 'after-godskills-activation-execute') {
        crash = false;
        throw new Error('simulated process death after Godskills activation');
      }
    },
  });
  await assert.rejects(() => first.bindMission(state.input), /process death/i);
  assert.equal(route.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(activation.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(counters.classify, 1);

  const changedClassifier = await adapter({
    root,
    route,
    activation,
    counters,
    consequenceClass: 'critical',
  });
  const beforeDrift = { route: operationCalls(route), activation: operationCalls(activation) };
  await assert.rejects(() => changedClassifier.bindMission(state.input), /dispatch|collision|changed/i);
  assert.deepEqual({ route: operationCalls(route), activation: operationCalls(activation) }, beforeDrift);

  const recovered = await adapter({ root, route, activation, counters });
  const binding = await recovered.bindMission(state.input);
  assert.equal(binding.status, 'bound');
  assert.equal(route.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(activation.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(activation.calls.filter(({ type }) => type === 'reconcile').length, 2);
});

test('route pending returns a closed projection and performs no execution', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'recoverable-godskills-pending-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = await bindingState(t, 'pending');
  const route = externalTransport('route', routed, { reconciliation: 'pending' });
  const activation = externalTransport('activation', activated);
  const counters = { classify: 0 };
  const value = await (await adapter({ root, route, activation, counters })).bindMission(state.input);
  assert.equal(value.status, 'pending');
  assert.equal(value.phase, 'route');
  assert.equal(value.authority.realmEffects, false);
  assert.equal(route.calls.some(({ type }) => type === 'execute'), false);
  assert.equal(activation.calls.some(({ type }) => type !== 'descriptor'), false);
  assert.equal(counters.classify, 0);
});
