import { execFile } from 'node:child_process';
import { readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import {
  buildIdentityBoundNativeCompletion,
  buildIdentityBoundNativeTransportDescriptor,
} from '../../src/runtime/identity-bound-native-contracts.mjs';
import { createIdentityBoundMissionVessel } from '../../src/runtime/identity-bound-mission-vessel.mjs';
import { createMissionRevisionExecutor } from '../../src/runtime/mission-revision-executor.mjs';
import {
  buildMissionRevisionTransportCompletion,
  buildMissionRevisionTransportDescriptor,
} from '../../src/runtime/mission-revision-transport-contracts.mjs';
import { createDeferredGodskillsReviewExecutor } from '../../src/skills/deferred-review-executor.mjs';
import { createGodskillsAdapter } from '../../src/skills/mission-binder.mjs';
import {
  buildGodskillsReviewTransportCompletion,
  buildGodskillsReviewTransportDescriptor,
} from '../../src/skills/review-transport-contracts.mjs';
import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { cortexBindingRequest, setupAdmittedIdentity } from './admitted-identity-fixture.mjs';

const execFileAsync = promisify(execFile);
const policyDigest = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const evidenceDigest = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';
const fixtureProtocol = 'eternities-identity-bound-mission-vessel-fixture-v1';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`identity-bound vessel fixture failed: ${message}`);
}

function countCalls(calls) {
  return {
    descriptors: calls.filter(({ type }) => type === 'descriptor').length,
    reconciliations: calls.filter(({ type }) => type === 'reconcile').length,
    executions: calls.filter(({ type }) => type === 'execute').length,
  };
}

function countForbiddenKeys(value) {
  const forbidden = new Set([
    'apiKey', 'authorization', 'credential', 'credentials', 'endpoint',
    'provider', 'providerConfig', 'retryPolicy', 'secret',
  ]);
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) {
    return value.reduce((total, child) => total + countForbiddenKeys(child), 0);
  }
  return Object.entries(value).reduce(
    (total, [key, child]) => total + Number(forbidden.has(key)) + countForbiddenKeys(child),
    0,
  );
}

function usage(completionTokens) {
  return {
    inputTokens: 800,
    cachedInputTokens: 600,
    reasoningTokens: completionTokens - 40,
    visibleOutputTokens: 40,
    completionTokens,
  };
}

export function vesselRequest() {
  const binding = cortexBindingRequest({
    missionId: 'mission-identity-bound-vessel-certification',
    taskId: 'task-identity-bound-vessel-certification',
    observationId: 'observation-identity-bound-vessel-certification',
    objective: 'produce one reviewed identity-bound certification artifact',
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

export function routed(request, counters) {
  counters.route += 1;
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

export function activationResult(request) {
  const decisions = request.selected.map(({ selectedId }) => {
    const unsigned = {
      schemaVersion: 1,
      selectedId,
      taskClass: request.classification.taskClass,
      consequenceClass: request.classification.consequenceClass,
      mode: 'review',
      reasonCodes: ['fixture-deferred-review'],
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

async function realGodskillsAdapter(root, counters, { forbidExternal = false } = {}) {
  return createGodskillsAdapter({
    releasePin: pinnedGodskillsReviewRelease(root),
    transport: forbidExternal
      ? async () => {
        counters.route += 1;
        throw new Error('routing must not run during recovery');
      }
      : async (request) => routed(request, counters),
    activationClassifier: forbidExternal
      ? () => {
        counters.classify += 1;
        throw new Error('classification must not run during recovery');
      }
      : () => {
        counters.classify += 1;
        return {
          taskClass: 'verification',
          consequenceClass: 'consequential',
          reviewAvailable: true,
        };
      },
    activationTransport: forbidExternal
      ? () => {
        counters.activate += 1;
        throw new Error('activation must not run during recovery');
      }
      : (request) => {
        counters.activate += 1;
        return activationResult(request);
      },
  });
}

export function identityTransport() {
  const descriptor = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'identity-bound-vessel-certification-native-v1',
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  return {
    descriptor,
    completions,
    calls,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
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
        const completion = buildIdentityBoundNativeCompletion({
          dispatch,
          transportDescriptor: descriptor,
          artifact: {
            schemaVersion: 1,
            artifactType: 'native',
            content: `draft by ${dispatch.modelProjection.identity.name} with one ambiguous evidence link`,
          },
          usage: usage(120),
          startedAt: '2026-08-31T23:10:00.000Z',
          completedAt: '2026-08-31T23:10:00.500Z',
        });
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

export function reviewTransport() {
  const descriptor = buildGodskillsReviewTransportDescriptor({
    transportId: 'identity-bound-vessel-certification-review-v1',
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  return {
    descriptor,
    calls,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
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
        const roundOne = dispatch.package.round === 1;
        const completion = buildGodskillsReviewTransportCompletion({
          dispatch,
          transportDescriptor: descriptor,
          artifact: {
            schemaVersion: 1,
            artifactType: 'review',
            subjectDigest: dispatch.package.subject.artifactDigest,
            recommendation: roundOne ? 'revise' : 'accept',
            findings: roundOne
              ? [{
                id: 'bind-exact-evidence',
                severity: 'important',
                required: true,
                message: 'replace the ambiguous evidence link with the exact committed digest',
              }]
              : [],
            summary: roundOne
              ? 'one exact evidence repair is required'
              : 'the identity-bound revision is accepted',
          },
          usage: usage(220),
          startedAt: roundOne
            ? '2026-08-31T23:20:00.000Z'
            : '2026-08-31T23:40:00.000Z',
          completedAt: roundOne
            ? '2026-08-31T23:20:00.500Z'
            : '2026-08-31T23:40:00.500Z',
        });
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

export function revisionTransport() {
  const descriptor = buildMissionRevisionTransportDescriptor({
    transportId: 'identity-bound-vessel-certification-revision-v1',
    maximumCompletionBytes: 16_384,
  });
  const completions = new Map();
  const calls = [];
  return {
    descriptor,
    calls,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
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
        const completion = buildMissionRevisionTransportCompletion({
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
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

export async function executors(root, review, revision) {
  const reviewExecutor = await createDeferredGodskillsReviewExecutor({
    releasePin: pinnedGodskillsReviewRelease(root),
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'identity-bound-vessel-certification-review',
    transport: review.adapter,
    io: { readFile, realpath },
  });
  const revisionExecutor = await createMissionRevisionExecutor({
    maximumMaterializedBytes: 32_768,
    executorIdPrefix: 'identity-bound-vessel-certification-revision',
    transport: revision.adapter,
  });
  return { reviewExecutor, revisionExecutor };
}

async function repositoryCommit(root) {
  const { stdout } = await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const commit = stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Godskills fixture commit is invalid');
  return commit;
}

export async function buildDeterministicIdentityBoundMissionVesselFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const admitted = await setupAdmittedIdentity(null, 'certification');
  try {
    const request = vesselRequest();
    const native = identityTransport();
    const review = reviewTransport();
    const revision = revisionTransport();
    const initialRouting = { route: 0, classify: 0, activate: 0 };
    const recoveryRouting = { route: 0, classify: 0, activate: 0 };
    const firstExecutors = await executors(godskillsRoot, review, revision);
    const initialAdapter = await realGodskillsAdapter(godskillsRoot, initialRouting);
    let now = Date.parse('2026-08-31T23:00:00.000Z');
    const clock = () => {
      const current = now;
      now += 600_000;
      return current;
    };
    const roots = {
      vesselRoot: join(admitted.root, 'certification-vessels'),
      journalRoot: join(admitted.root, 'certification-journals'),
    };
    const lockOptions = {
      pid: 63102,
      now: () => now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => 'identity-bound-certification-lock',
    };
    let crashArmed = true;
    const first = createIdentityBoundMissionVessel({
      genesisAdmission: admitted.admission,
      ...roots,
      godskillsAdapter: initialAdapter,
      nativeTransport: native.adapter,
      reviewExecutor: firstExecutors.reviewExecutor,
      revisionExecutor: firstExecutors.revisionExecutor,
      clock,
      checkpoint: async (name) => {
        if (crashArmed && name === 'after-native-execute') {
          crashArmed = false;
          throw new Error('simulated process death after identity-bound native completion');
        }
      },
      lockOptions,
    });

    let processDeathObserved = false;
    try {
      await first.run(request);
    } catch (error) {
      if (!/process death/i.test(error.message)) throw error;
      processDeathObserved = true;
    }
    const originalDispatch = native.calls.find(({ type }) => type === 'execute')?.dispatch;
    requireCondition(processDeathObserved, 'the interruption was not observed');
    requireCondition(originalDispatch, 'the first native dispatch is missing');
    requireCondition(initialRouting.route === 1 && initialRouting.classify === 1 && initialRouting.activate === 1,
      'initial Godskills activation counts changed');

    const rebuiltExecutors = await executors(godskillsRoot, review, revision);
    const recoveryAdapter = await realGodskillsAdapter(
      godskillsRoot,
      recoveryRouting,
      { forbidExternal: true },
    );
    const recovered = createIdentityBoundMissionVessel({
      genesisAdmission: admitted.admission,
      ...roots,
      godskillsAdapter: recoveryAdapter,
      nativeTransport: native.adapter,
      reviewExecutor: rebuiltExecutors.reviewExecutor,
      revisionExecutor: rebuiltExecutors.revisionExecutor,
      clock,
      checkpoint: async () => {},
      lockOptions,
    });
    const completed = await recovered.run(request);
    const recoveredDispatch = native.calls.filter(({ type }) => type === 'reconcile').at(-1)?.dispatch;
    requireCondition(completed.status === 'completed', 'recovery did not complete');
    requireCondition(completed.mission.verdict.reason === 'revision-review-accepted', 'final review did not accept');
    requireCondition(recoveredDispatch?.dispatchDigest === originalDispatch.dispatchDigest,
      'reconstructed native dispatch changed');
    requireCondition(native.calls.filter(({ type }) => type === 'execute').length === 1,
      'native transport executed more than once');
    requireCondition(review.calls.filter(({ type }) => type === 'execute').length === 2,
      'review transport did not execute exactly twice');
    requireCondition(revision.calls.filter(({ type }) => type === 'execute').length === 1,
      'revision transport did not execute exactly once');
    requireCondition(Object.values(recoveryRouting).every((value) => value === 0),
      'recovery repeated routing, classification, or activation');

    const externalBeforeReplay = {
      native: native.calls.filter(({ type }) => type !== 'descriptor').length,
      review: review.calls.filter(({ type }) => type !== 'descriptor').length,
      revision: revision.calls.filter(({ type }) => type !== 'descriptor').length,
    };
    const replay = await recovered.run(request);
    const externalAfterReplay = {
      native: native.calls.filter(({ type }) => type !== 'descriptor').length,
      review: review.calls.filter(({ type }) => type !== 'descriptor').length,
      revision: revision.calls.filter(({ type }) => type !== 'descriptor').length,
    };
    const replayExternalCalls = Object.keys(externalBeforeReplay).reduce(
      (total, key) => total + externalAfterReplay[key] - externalBeforeReplay[key],
      0,
    );
    const nativeCompletion = native.completions.get(originalDispatch.dispatchDigest);
    const wireText = canonicalJson(originalDispatch);
    const forbiddenWireKeys = countForbiddenKeys(originalDispatch);
    const filesystemRootsDisclosed = [admitted.root, admitted.admissionRoot, admitted.keelRoot]
      .filter((root) => wireText.toLowerCase().includes(root.replaceAll('\\', '/').toLowerCase()))
      .length;
    const authorityExpansions = [
      originalDispatch.authority.authorityExpanded,
      nativeCompletion.authority.authorityExpanded,
      completed.receipt.authority.authorityExpanded,
    ].filter(Boolean).length;
    const realmEffects = [
      originalDispatch.authority.realmEffects,
      nativeCompletion.authority.realmEffects,
      completed.receipt.authority.realmEffects,
    ].filter(Boolean).length;
    const pin = pinnedGodskillsReviewRelease(godskillsRoot);
    const manifest = JSON.parse(await readFile(
      `${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`,
      'utf8',
    ));
    const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
    requireCondition(capability, 'pinned review capability is missing');
    requireCondition(originalDispatch.missionPackage.godskills.cortexPackage.activation.decisions[0].mode === 'review',
      'actual Godskills activation did not defer review');
    requireCondition(originalDispatch.missionPackage.godskills.cortexPackage.selectedPackages.length === 0,
      'deferred review body entered native cognition');
    requireCondition(originalDispatch.modelProjection.identity.name === 'Aether Architect',
      'verified identity projection did not reach native cognition');

    const assertions = {
      processDeathObserved,
      completedAfterReconstruction: completed.status === 'completed',
      exactIdentityDispatchReproduced: recoveredDispatch.dispatchDigest === originalDispatch.dispatchDigest,
      nativeRecoveredWithoutRedispatch: native.calls.filter(({ type }) => type === 'execute').length === 1,
      actualGodskillsActivatedOnce: Object.values(initialRouting).every((value) => value === 1),
      recoveryRehydratedWithoutExternalActivation: Object.values(recoveryRouting).every((value) => value === 0),
      exactIdentityProjectionReachedNative: originalDispatch.modelProjection.identity.name === 'Aether Architect',
      deferredReviewBodyFreeBeforeInference: originalDispatch.missionPackage.godskills.cortexPackage.selectedPackages.length === 0,
      finalReviewAccepted: completed.mission.verdict.reason === 'revision-review-accepted',
      exactTerminalReplay: canonicalJson(replay) === canonicalJson(completed),
      replayExternalCalls,
      forbiddenWireKeys,
      filesystemRootsDisclosed,
      authorityExpansions,
      realmEffects,
    };
    for (const [name, result] of Object.entries(assertions)) {
      const expected = ['replayExternalCalls', 'forbiddenWireKeys', 'filesystemRootsDisclosed',
        'authorityExpansions', 'realmEffects'].includes(name) ? 0 : true;
      requireCondition(result === expected, `assertion ${name} is ${String(result)}`);
    }

    const unsigned = {
      schemaVersion: 1,
      protocolId: fixtureProtocol,
      godskills: {
        commit: await repositoryCommit(godskillsRoot),
        releaseDigest: initialAdapter.releaseDigest,
        activationTrustRootDigest: pin.activation.executableReceipt.receiptDigest,
        capability: {
          id: capability.id,
          entrypointSha256: capability.entrypoint.sha256,
          contractSha256: capability.contract.sha256,
        },
      },
      identity: {
        name: originalDispatch.modelProjection.identity.name,
        instanceId: originalDispatch.modelProjection.binding.instanceId,
        bindingCandidateId: originalDispatch.bindingCandidateId,
        candidateDigest: originalDispatch.candidateDigest,
        fullEnvelopeDigest: originalDispatch.fullEnvelopeDigest,
        modelProjectionDigest: originalDispatch.modelProjectionDigest,
      },
      vessel: {
        vesselAdmissionDigest: completed.receipt.vesselAdmissionDigest,
        completionReceiptDigest: completed.receipt.receiptDigest,
        missionCompletionReceiptDigest: completed.receipt.missionCompletionReceiptDigest,
        acceptedArtifactDigest: completed.receipt.acceptedArtifactDigest,
        verdictReason: completed.mission.verdict.reason,
      },
      execution: {
        innerTransportDescriptorDigest: native.descriptor.descriptorDigest,
        identityDispatchDigest: originalDispatch.dispatchDigest,
        identityCompletionDigest: nativeCompletion.completionDigest,
        nativeCalls: countCalls(native.calls),
        reviewTransportDescriptorDigest: review.descriptor.descriptorDigest,
        reviewCalls: countCalls(review.calls),
        revisionTransportDescriptorDigest: revision.descriptor.descriptorDigest,
        revisionCalls: countCalls(revision.calls),
        initialRouting: structuredClone(initialRouting),
        recoveryRouting: structuredClone(recoveryRouting),
      },
      measurements: {
        identityDispatchBytes: Buffer.byteLength(canonicalJson(originalDispatch), 'utf8'),
        identityCompletionBytes: Buffer.byteLength(canonicalJson(nativeCompletion), 'utf8'),
        modelProjectionBytes: Buffer.byteLength(canonicalJson(originalDispatch.modelProjection), 'utf8'),
      },
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(admitted.root, { recursive: true, force: true });
  }
}
