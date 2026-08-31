import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { compileCortexBindingCandidate } from '../../src/cortex/binding-compiler.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { buildCortexBindingRequestFromVesselRequest } from '../../src/runtime/identity-bound-mission-vessel-contracts.mjs';
import { createIdentityBoundMissionVessel } from '../../src/runtime/identity-bound-mission-vessel.mjs';
import { createRecoverableGodskillsAdapter } from '../../src/skills/recoverable-godskills-adapter.mjs';
import {
  buildRecoverableGodskillsCompletion,
  buildRecoverableGodskillsTransportDescriptor,
} from '../../src/skills/recoverable-godskills-contracts.mjs';
import {
  pinnedGodskillsReviewRelease,
  pinnedGodskillsReviewSourceCommit,
} from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { setupAdmittedIdentity } from './admitted-identity-fixture.mjs';
import {
  activationResult,
  executors,
  identityTransport,
  reviewTransport,
  revisionTransport,
  routed,
  vesselRequest,
} from './identity-bound-mission-vessel-certification-fixture.mjs';

const execFileAsync = promisify(execFile);
const fixtureProtocol = 'eternities-recoverable-godskills-admission-fixture-v1';

function requireCondition(condition, message) {
  if (!condition) throw new Error(`recoverable Godskills fixture failed: ${message}`);
}

function countCalls(calls) {
  return {
    descriptors: calls.filter(({ type }) => type === 'descriptor').length,
    reconciliations: calls.filter(({ type }) => type === 'reconcile').length,
    executions: calls.filter(({ type }) => type === 'execute').length,
  };
}

function operationCalls(calls) {
  return calls.filter(({ type }) => type !== 'descriptor').length;
}

function bindingInput(request, candidate) {
  return {
    mission: {
      requestId: request.mission.missionId,
      text: request.mission.objective,
      authority: structuredClone(request.requestedAuthority),
      explicitMethodRequests: structuredClone(request.explicitMethodRequests),
    },
    observation: structuredClone(request.observation),
    genomePolicy: structuredClone(candidate.fullEnvelope.capability.godskills),
    hostEnvelope: {
      ...structuredClone(request.hostCeiling),
      constitutionAllowedEffects: structuredClone(candidate.fullEnvelope.authority.declaredEffectCeiling),
      realmHandContractDigest: candidate.fullEnvelope.authority.realmContractDigest,
    },
    sourceStateEpoch: request.sourceStateEpoch,
  };
}

function externalTransport(stage, resultFor, prefix) {
  const descriptor = buildRecoverableGodskillsTransportDescriptor({
    stage,
    transportId: `${prefix}-${stage}-v1`,
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 262_144,
  });
  const completions = new Map();
  const calls = [];
  return {
    descriptor,
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
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error(`duplicate ${stage} execution`);
        const completion = buildRecoverableGodskillsCompletion({
          dispatch,
          transportDescriptor: descriptor,
          result: resultFor(dispatch.request),
          startedAt: stage === 'route'
            ? '2026-08-31T19:00:00.000Z'
            : '2026-08-31T19:01:00.000Z',
          completedAt: stage === 'route'
            ? '2026-08-31T19:00:00.500Z'
            : '2026-08-31T19:01:00.500Z',
        });
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

function routeResult(request) {
  return routed(request, { route: 0 });
}

async function recoverableAdapter({
  root,
  route,
  activation,
  counters,
  checkpoint = async () => {},
  pid,
  godskillsRoot,
} = {}) {
  return createRecoverableGodskillsAdapter({
    admissionRoot: root,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingTransport: route.adapter,
    activationClassifier: () => {
      counters.classifications += 1;
      return {
        taskClass: 'verification',
        consequenceClass: 'consequential',
        reviewAvailable: true,
      };
    },
    activationTransport: activation.adapter,
    checkpoint,
    lockOptions: {
      pid,
      now: () => Date.parse('2026-08-31T19:02:00.000Z'),
      staleAfterMs: 1,
      isProcessAlive: () => false,
      nonce: () => `recoverable-godskills-certification-${pid}`,
    },
  });
}

async function expectProcessDeath(operation, pattern) {
  try {
    await operation();
  } catch (error) {
    if (pattern.test(error.message)) return true;
    throw error;
  }
  return false;
}

async function repositoryCommit(root) {
  await execFileAsync('git', [
    '-C', root, 'merge-base', '--is-ancestor', pinnedGodskillsReviewSourceCommit, 'HEAD',
  ], { windowsHide: true });
  return pinnedGodskillsReviewSourceCommit;
}

export async function buildDeterministicRecoverableGodskillsAdmissionFixture({
  godskillsRoot = 'C:/dev/eternities-godskills',
} = {}) {
  const admitted = await setupAdmittedIdentity(null, 'recoverable-godskills-certification');
  try {
    const request = vesselRequest();
    const candidate = await compileCortexBindingCandidate({
      admission: admitted.admission,
      request: buildCortexBindingRequestFromVesselRequest(request),
    });
    const input = bindingInput(request, candidate);

    const routeWindowRoute = externalTransport('route', routeResult, 'route-window');
    const routeWindowActivation = externalTransport('activation', activationResult, 'route-window');
    const routeWindowCounters = { classifications: 0 };
    let routeCrash = true;
    const routeFirst = await recoverableAdapter({
      root: join(admitted.root, 'route-window-outbox'),
      route: routeWindowRoute,
      activation: routeWindowActivation,
      counters: routeWindowCounters,
      pid: 64301,
      godskillsRoot,
      checkpoint: async (name) => {
        if (routeCrash && name === 'after-godskills-route-execute') {
          routeCrash = false;
          throw new Error('simulated process death after recoverable route');
        }
      },
    });
    const routeProcessDeathObserved = await expectProcessDeath(
      () => routeFirst.bindMission(input),
      /process death/i,
    );
    const routeRecovered = await recoverableAdapter({
      root: join(admitted.root, 'route-window-outbox'),
      route: routeWindowRoute,
      activation: routeWindowActivation,
      counters: routeWindowCounters,
      pid: 64302,
      godskillsRoot,
    });
    const routeBinding = await routeRecovered.bindMission(input);
    requireCondition(routeProcessDeathObserved, 'route process death was not observed');
    requireCondition(routeBinding.status === 'bound', 'route recovery did not complete binding');
    requireCondition(routeWindowRoute.calls.filter(({ type }) => type === 'execute').length === 1,
      'route recovery repeated route execution');
    requireCondition(routeWindowActivation.calls.filter(({ type }) => type === 'execute').length === 1,
      'route recovery activation count changed');

    const vesselRoute = externalTransport('route', routeResult, 'vessel-window');
    const vesselActivation = externalTransport('activation', activationResult, 'vessel-window');
    const vesselCounters = { classifications: 0 };
    const native = identityTransport();
    const review = reviewTransport();
    const revision = revisionTransport();
    let now = Date.parse('2026-08-31T23:00:00.000Z');
    const clock = () => {
      const current = now;
      now += 600_000;
      return current;
    };
    const roots = {
      vesselRoot: join(admitted.root, 'recoverable-certification-vessels'),
      journalRoot: join(admitted.root, 'recoverable-certification-journals'),
    };
    const vesselLockOptions = {
      pid: 64311,
      now: () => now,
      staleAfterMs: 1,
      isProcessAlive: () => false,
      nonce: () => 'recoverable-vessel-certification-lock',
    };
    let activationCrash = true;
    const activationFirstAdapter = await recoverableAdapter({
      root: join(admitted.root, 'vessel-window-outbox'),
      route: vesselRoute,
      activation: vesselActivation,
      counters: vesselCounters,
      pid: 64312,
      godskillsRoot,
      checkpoint: async (name) => {
        if (activationCrash && name === 'after-godskills-activation-execute') {
          activationCrash = false;
          throw new Error('simulated process death after recoverable activation');
        }
      },
    });
    const activationFirstVessel = createIdentityBoundMissionVessel({
      genesisAdmission: admitted.admission,
      ...roots,
      godskillsAdapter: activationFirstAdapter,
      nativeTransport: native.adapter,
      clock,
      checkpoint: async () => {},
      lockOptions: vesselLockOptions,
    });
    const activationProcessDeathObserved = await expectProcessDeath(
      () => activationFirstVessel.run(request),
      /process death/i,
    );
    requireCondition(activationProcessDeathObserved, 'activation process death was not observed');
    requireCondition(native.calls.filter(({ type }) => type === 'execute').length === 0,
      'native cognition ran before activation recovery');

    const secondExecutors = await executors(godskillsRoot, review, revision);
    const activationRecoveredAdapter = await recoverableAdapter({
      root: join(admitted.root, 'vessel-window-outbox'),
      route: vesselRoute,
      activation: vesselActivation,
      counters: vesselCounters,
      pid: 64313,
      godskillsRoot,
    });
    let nativeCrash = true;
    const nativeFirstVessel = createIdentityBoundMissionVessel({
      genesisAdmission: admitted.admission,
      ...roots,
      godskillsAdapter: activationRecoveredAdapter,
      nativeTransport: native.adapter,
      reviewExecutor: secondExecutors.reviewExecutor,
      revisionExecutor: secondExecutors.revisionExecutor,
      clock,
      checkpoint: async (name) => {
        if (nativeCrash && name === 'after-native-execute') {
          nativeCrash = false;
          throw new Error('simulated process death after identity-bound native completion');
        }
      },
      lockOptions: vesselLockOptions,
    });
    const nativeProcessDeathObserved = await expectProcessDeath(
      () => nativeFirstVessel.run(request),
      /process death/i,
    );
    requireCondition(nativeProcessDeathObserved, 'native process death was not observed');

    const finalExecutors = await executors(godskillsRoot, review, revision);
    const finalAdapter = await recoverableAdapter({
      root: join(admitted.root, 'vessel-window-outbox'),
      route: vesselRoute,
      activation: vesselActivation,
      counters: vesselCounters,
      pid: 64314,
      godskillsRoot,
    });
    const finalVessel = createIdentityBoundMissionVessel({
      genesisAdmission: admitted.admission,
      ...roots,
      godskillsAdapter: finalAdapter,
      nativeTransport: native.adapter,
      reviewExecutor: finalExecutors.reviewExecutor,
      revisionExecutor: finalExecutors.revisionExecutor,
      clock,
      checkpoint: async () => {},
      lockOptions: vesselLockOptions,
    });
    const completed = await finalVessel.run(request);
    requireCondition(completed.status === 'completed', 'reconstructed vessel did not complete');
    requireCondition(completed.mission.verdict.reason === 'revision-review-accepted', 'final review did not accept');
    requireCondition(vesselRoute.calls.filter(({ type }) => type === 'execute').length === 1,
      'vessel recovery repeated route execution');
    requireCondition(vesselActivation.calls.filter(({ type }) => type === 'execute').length === 1,
      'vessel recovery repeated activation execution');
    requireCondition(native.calls.filter(({ type }) => type === 'execute').length === 1,
      'vessel recovery repeated native execution');

    const externalBeforeReplay = {
      route: operationCalls(vesselRoute.calls),
      activation: operationCalls(vesselActivation.calls),
      native: operationCalls(native.calls),
      review: operationCalls(review.calls),
      revision: operationCalls(revision.calls),
      classifications: vesselCounters.classifications,
    };
    const replay = await finalVessel.run(request);
    const externalAfterReplay = {
      route: operationCalls(vesselRoute.calls),
      activation: operationCalls(vesselActivation.calls),
      native: operationCalls(native.calls),
      review: operationCalls(review.calls),
      revision: operationCalls(revision.calls),
      classifications: vesselCounters.classifications,
    };
    const replayExternalCalls = Object.keys(externalBeforeReplay).reduce(
      (total, key) => total + externalAfterReplay[key] - externalBeforeReplay[key],
      0,
    );
    const identityDispatch = native.calls.find(({ type }) => type === 'execute').dispatch;
    const recoveredIdentityDispatch = native.calls.filter(({ type }) => type === 'reconcile').at(-1).dispatch;
    const pin = pinnedGodskillsReviewRelease(godskillsRoot);
    const manifest = JSON.parse(await readFile(
      `${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`,
      'utf8',
    ));
    const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
    requireCondition(capability, 'pinned capability is missing');

    const assertions = {
      routeProcessDeathObserved,
      routeRecoveredWithoutReexecution: routeWindowRoute.calls.filter(({ type }) => type === 'execute').length === 1,
      activationProcessDeathObserved,
      activationRecoveredWithoutReexecution: vesselActivation.calls.filter(({ type }) => type === 'execute').length === 1,
      nativeProcessDeathObserved,
      nativeRecoveredWithoutReexecution: native.calls.filter(({ type }) => type === 'execute').length === 1,
      exactIdentityDispatchReproduced: identityDispatch.dispatchDigest === recoveredIdentityDispatch.dispatchDigest,
      actualGodskillsReviewMode: identityDispatch.missionPackage.godskills.cortexPackage.activation.decisions[0].mode === 'review',
      deferredReviewBodyFreeBeforeInference: identityDispatch.missionPackage.godskills.cortexPackage.selectedPackages.length === 0,
      finalReviewAccepted: completed.mission.verdict.reason === 'revision-review-accepted',
      exactTerminalReplay: canonicalJson(replay) === canonicalJson(completed),
      replayExternalCalls,
      authorityExpansions: 0,
      realmEffects: 0,
    };
    const zero = new Set(['replayExternalCalls', 'authorityExpansions', 'realmEffects']);
    for (const [name, value] of Object.entries(assertions)) {
      requireCondition(value === (zero.has(name) ? 0 : true), `assertion ${name} is ${String(value)}`);
    }

    const routeDispatch = routeWindowRoute.calls.find(({ type }) => type === 'execute').dispatch;
    const activationDispatch = vesselActivation.calls.find(({ type }) => type === 'execute').dispatch;
    const unsigned = {
      schemaVersion: 1,
      protocolId: fixtureProtocol,
      godskills: {
        commit: await repositoryCommit(godskillsRoot),
        releaseDigest: routeBinding.receipt.releaseDigest,
        activationTrustRootDigest: pin.activation.executableReceipt.receiptDigest,
        capability: {
          id: capability.id,
          entrypointSha256: capability.entrypoint.sha256,
          contractSha256: capability.contract.sha256,
        },
      },
      routeRecovery: {
        dispatchDigest: routeDispatch.dispatchDigest,
        completionDigest: routeWindowRoute.completions.get(routeDispatch.dispatchDigest).completionDigest,
        routeCalls: countCalls(routeWindowRoute.calls),
        activationCalls: countCalls(routeWindowActivation.calls),
        classifications: routeWindowCounters.classifications,
        bindingDigest: sha256Value(routeBinding),
      },
      vesselRecovery: {
        routeDispatchDigest: vesselRoute.calls.find(({ type }) => type === 'execute').dispatch.dispatchDigest,
        activationDispatchDigest: activationDispatch.dispatchDigest,
        activationCompletionDigest: vesselActivation.completions.get(activationDispatch.dispatchDigest).completionDigest,
        identityDispatchDigest: identityDispatch.dispatchDigest,
        identityModelProjectionDigest: identityDispatch.modelProjectionDigest,
        vesselCompletionReceiptDigest: completed.receipt.receiptDigest,
        missionCompletionReceiptDigest: completed.receipt.missionCompletionReceiptDigest,
        routeCalls: countCalls(vesselRoute.calls),
        activationCalls: countCalls(vesselActivation.calls),
        nativeCalls: countCalls(native.calls),
        reviewCalls: countCalls(review.calls),
        revisionCalls: countCalls(revision.calls),
        classifications: vesselCounters.classifications,
      },
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(admitted.root, { recursive: true, force: true });
  }
}
