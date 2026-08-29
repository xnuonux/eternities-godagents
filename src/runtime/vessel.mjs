import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { runInference } from '../cortex/inference-runner.mjs';
import { executeCommittedAction } from '../realm/action-gateway.mjs';
import { routeGodskill } from '../skills/godskills-adapter.mjs';
import { createDormantSoulPort } from '../soul/dormant-port.mjs';
import { appendEvent, readVerifiedJournal } from '../state/journal.mjs';
import { restoreState } from '../state/restore.mjs';
import { commitDecision } from './arbiter.mjs';
import { collectProposals } from './scheduler.mjs';

function localDirectory(directory) {
  return directory instanceof URL ? fileURLToPath(directory) : directory;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function initialState(instanceId, constitutionDigest, artifactId) {
  return {
    instanceId,
    constitutionDigest,
    artifactId,
    status: 'created',
    epoch: 0,
    currentMission: null,
    lastObservation: null,
    outstandingDecision: null,
    outstandingAction: null,
    lastDecisionId: null,
    lastActionId: null,
    inferenceAttemptCount: 0,
    lastInference: null,
    acceptedProposal: null,
  };
}

function reduceVessel(state, event) {
  switch (event.eventType) {
    case 'vessel.created':
      return { ...state, status: 'idle' };
    case 'mission.admitted':
      return { ...state, status: 'perceiving', currentMission: event.payload.mission };
    case 'realm.observed':
      return { ...state, status: 'deliberating', lastObservation: event.payload.observation };
    case 'cortex.requested':
      return {
        ...state,
        status: 'inferring',
        inferenceAttemptCount: state.inferenceAttemptCount + 1,
        lastInference: event.payload.inference,
      };
    case 'cortex.failed':
      return { ...state, status: 'inferring', lastInference: event.payload.inference };
    case 'cortex.accepted':
      return {
        ...state,
        status: 'proposal-accepted',
        lastInference: event.payload.inference,
        acceptedProposal: event.payload.proposal,
      };
    case 'proposal.collected':
      return { ...state, status: 'deliberating' };
    case 'godskill.routed':
      return state;
    case 'decision.committed':
      return { ...state, status: 'committed', outstandingDecision: event.payload.decision };
    case 'action.invoking':
      return {
        ...state,
        status: 'acting',
        outstandingAction: event.payload,
      };
    case 'action.receipt':
      return {
        ...state,
        status: 'reconciling',
        lastActionId: event.payload.receipt.actionId,
        outstandingAction: null,
      };
    case 'cycle.completed':
      return {
        ...state,
        status: 'idle',
        epoch: state.epoch + 1,
        lastDecisionId: state.outstandingDecision?.decisionId ?? state.lastDecisionId,
        currentMission: null,
        outstandingDecision: null,
        outstandingAction: null,
        inferenceAttemptCount: 0,
        lastInference: null,
        acceptedProposal: null,
      };
    case 'cycle.aborted':
      return {
        ...state,
        status: 'idle',
        epoch: state.epoch + 1,
        lastDecisionId: state.outstandingDecision?.decisionId ?? state.lastDecisionId,
        currentMission: null,
        outstandingDecision: null,
        outstandingAction: null,
        inferenceAttemptCount: 0,
        lastInference: null,
        acceptedProposal: null,
      };
    default:
      return state;
  }
}

async function loadDistribution(distributionDir) {
  const root = localDirectory(distributionDir);
  const [manifest, genome, realmContract, promptText] = await Promise.all([
    readJson(join(root, 'distribution-manifest.json')),
    readJson(join(root, 'agent-genome.json')),
    readJson(join(root, 'realm-contract.json')),
    readFile(join(root, 'prompt-os-artifact.md'), 'utf8'),
  ]);
  assertSchema('distribution-manifest', manifest);
  assertSchema('agent-genome', genome);
  assertSchema('realm-contract', realmContract);
  const contents = {
    'agent-genome.json': `${canonicalJson(genome)}\n`,
    'prompt-os-artifact.md': promptText,
    'realm-contract.json': `${canonicalJson(realmContract)}\n`,
  };
  for (const artifact of manifest.artifacts) {
    if (!(artifact.path in contents) || sha256Text(contents[artifact.path]) !== artifact.sha256) {
      throw new IntegrityError(`distribution artifact digest mismatch: ${artifact.path}`);
    }
  }
  return { manifest, genome, realmContract };
}

export async function createVessel({
  distributionDir,
  instanceId,
  journalPath,
  snapshotPath,
  cortex,
  realm,
  godskillsTransport,
  clock,
  inferencePolicy = null,
  crashAt = null,
  bypassArbiter = false,
  disableActionReconciliation = false,
}) {
  if (bypassArbiter) throw new Error('arbiter bypass is prohibited by Godagent v0');
  if (disableActionReconciliation) throw new Error('action reconciliation is mandatory in Godagent v0');
  const distribution = await loadDistribution(distributionDir);
  if (!distribution.genome.cortex.allowedAdapters.includes(cortex.adapterId)) {
    throw new Error(`cortex adapter ${cortex.adapterId} is not allowed by the genome`);
  }
  if (!distribution.manifest.compatibility.realmIds.includes(realm.contract.realmId)) {
    throw new Error(`Realm ${realm.contract.realmId} is not compatible with the distribution`);
  }
  if (canonicalJson(realm.contract) !== canonicalJson(distribution.realmContract)) {
    throw new IntegrityError('runtime Realm Contract differs from the compiled distribution');
  }

  const constitutionDigest = sha256Value(distribution.genome.constitution);
  const soulPort = createDormantSoulPort();
  let state = initialState(instanceId, constitutionDigest, distribution.manifest.artifactId);

  const existing = await readVerifiedJournal(journalPath);
  if (existing.lastSequence === 0) {
    const created = await appendEvent({
      journalPath,
      event: {
        schemaVersion: 1,
        instanceId,
        stateEpoch: 0,
        eventType: 'vessel.created',
        sourceClass: 'foundry-distribution',
        sourceRef: distribution.manifest.buildId,
        causationId: instanceId,
        correlationId: instanceId,
        payload: {
          artifactId: distribution.manifest.artifactId,
          buildId: distribution.manifest.buildId,
          constitutionDigest,
          soulPort,
        },
        recordedAt: clock(),
      },
    });
    state = reduceVessel(state, created);
  } else {
    const restored = await restoreState({
      journalPath,
      snapshotPath,
      reduce: reduceVessel,
      initialState: state,
    });
    state = restored.state;
    if (state.instanceId !== instanceId || existing.instanceId !== instanceId) {
      throw new IntegrityError('vessel instance identity does not match the journal');
    }
  }

  async function record(eventType, payload, meta = {}) {
    const event = await appendEvent({
      journalPath,
      event: {
        schemaVersion: 1,
        instanceId,
        stateEpoch: state.epoch,
        eventType,
        sourceClass: meta.sourceClass ?? 'vessel-runtime',
        sourceRef: meta.sourceRef ?? eventType,
        causationId: meta.causationId ?? state.currentMission?.requestId ?? instanceId,
        correlationId: meta.correlationId ?? `${instanceId}:${state.epoch}`,
        payload,
        recordedAt: clock(),
      },
    });
    state = reduceVessel(state, event);
    return event;
  }

  function injectCrash(checkpoint) {
    if (crashAt === checkpoint) throw new Error(`injected crash after ${checkpoint}`);
  }

  function cortexContext(mission, observation) {
    const authority = new Set(mission.authority);
    const hostAuthority = new Set(mission.hostContext.availableAuthority);
    const hostEffects = new Set(mission.hostContext.permittedEffects);
    const hostPreconditions = new Set(mission.hostContext.availablePreconditions);
    return {
      instanceId,
      mission: mission.text,
      missionId: mission.requestId,
      observation,
      stateEpoch: state.epoch,
      now: clock(),
      constraints: {
        allowedHands: distribution.realmContract.hands.map((hand) => hand.id),
        permittedEffects: distribution.genome.constitution.allowedEffects.filter((effect) => hostEffects.has(effect)),
        availableAuthority: [...authority].filter((entry) => hostAuthority.has(entry)).sort(),
        availablePreconditions: ['realm-observed'].filter((entry) => hostPreconditions.has(entry)),
      },
    };
  }

  async function collectNetworkedProposal(mission, observation, existingAttempts = 0, lastAttempt = null) {
    if (!inferencePolicy) throw new Error('networked cortex requires an inference policy');
    return runInference({
      cortex,
      context: cortexContext(mission, observation),
      policy: inferencePolicy,
      existingAttempts,
      lastAttempt,
      record,
      checkpoint: injectCrash,
    });
  }

  async function completeFromProposals(mission, proposals) {
    for (const proposal of proposals) {
      await record('proposal.collected', { proposal }, {
        sourceClass: 'cortex-proposal',
        sourceRef: proposal.proposalId,
      });
    }
    const decision = commitDecision({
      proposals,
      state: {
        epoch: state.epoch,
        missionId: mission.requestId,
        now: clock(),
        preconditions: ['realm-observed'],
      },
      constitution: distribution.genome.constitution,
      authority: mission.authority,
    });
    await record('decision.committed', { decision }, {
      sourceClass: 'constitutional-arbiter',
      sourceRef: decision.decisionId,
    });
    injectCrash('decision');

    const route = await routeGodskill({
      request: { requestId: mission.requestId, text: mission.text },
      hostContext: mission.hostContext,
      transport: godskillsTransport,
    });
    await record('godskill.routed', {
      status: route.status,
      selectedIds: route.selectedIds,
      entrypoints: route.entrypoints,
      unresolvedDecisions: route.unresolvedDecisions,
    }, {
      sourceClass: 'godskills-router',
      sourceRef: mission.requestId,
    });

    const action = {
      actionId: `action:${mission.requestId}:${state.epoch}`,
      idempotencyKey: `${instanceId}:${decision.decisionId}`,
      handId: decision.committedIntent.handId,
      payload: { amount: decision.committedIntent.amount },
    };
    await record('action.invoking', { action, decision, authority: mission.authority }, {
      sourceClass: 'action-gateway',
      sourceRef: action.actionId,
    });
    const receipt = await executeCommittedAction({
      decision,
      action,
      realm,
      authority: mission.authority,
      stateEpoch: state.epoch,
    });
    injectCrash('effect');
    await record('action.receipt', { receipt }, {
      sourceClass: 'realm-consequence',
      sourceRef: receipt.actionId,
    });
    injectCrash('observation');
    await record('cycle.completed', { receiptDigest: receipt.receiptDigest }, {
      sourceClass: 'vessel-runtime',
      sourceRef: mission.requestId,
    });
    return { status: 'completed', decision, route, receipt };
  }

  async function runCycle(mission) {
    if (state.status !== 'idle') throw new Error(`vessel is not idle: ${state.status}`);
    await record('mission.admitted', { mission }, {
      sourceClass: 'user-mission',
      sourceRef: mission.requestId,
      causationId: mission.requestId,
      correlationId: `${instanceId}:${mission.requestId}`,
    });
    injectCrash('admission');

    const observation = await realm.observe();
    await record('realm.observed', { observation }, {
      sourceClass: 'realm-observation',
      sourceRef: observation.observationId,
    });
    if (typeof cortex.prepare === 'function') {
      const inference = await collectNetworkedProposal(mission, observation);
      if (inference.status === 'failed') {
        await record('cycle.aborted', { reason: 'cortex-failed', reasonCode: inference.reasonCode }, {
          sourceClass: 'cortex-failure',
          sourceRef: inference.attemptId,
        });
        return { status: 'failed', inference };
      }
      return completeFromProposals(mission, [inference.proposal]);
    }

    const organ = {
      id: cortex.adapterId,
      propose: () => cortex.infer({
        mission: mission.text,
        missionId: mission.requestId,
        observation,
        stateEpoch: state.epoch,
        now: clock(),
      }),
    };
    const proposals = await collectProposals({
      organs: [organ],
      state: {
        epoch: state.epoch,
        missionId: mission.requestId,
        now: clock(),
        preconditions: ['realm-observed'],
      },
      context: { observationId: observation.observationId },
    });
    return completeFromProposals(mission, proposals);
  }

  async function recover() {
    const restored = await restoreState({
      journalPath,
      snapshotPath,
      reduce: reduceVessel,
      initialState: initialState(instanceId, constitutionDigest, distribution.manifest.artifactId),
    });
    state = restored.state;
    if (state.status === 'idle') return inspect();

    if (state.status === 'proposal-accepted' && state.acceptedProposal) {
      await completeFromProposals(state.currentMission, [state.acceptedProposal]);
      return inspect();
    }

    if (state.status === 'inferring' && typeof cortex.prepare === 'function') {
      const inference = await collectNetworkedProposal(
        state.currentMission,
        state.lastObservation,
        state.inferenceAttemptCount,
        state.lastInference,
      );
      if (inference.status === 'failed') {
        await record('cycle.aborted', { reason: 'cortex-failed', reasonCode: inference.reasonCode }, {
          sourceClass: 'recovery-reconciliation',
          sourceRef: inference.attemptId,
        });
      } else {
        await completeFromProposals(state.currentMission, [inference.proposal]);
      }
      return inspect();
    }

    if (state.status === 'acting') {
      const { action, decision, authority } = state.outstandingAction;
      const receipt = await executeCommittedAction({
        decision,
        action,
        realm,
        authority,
        stateEpoch: decision.sourceStateEpoch,
      });
      await record('action.receipt', { receipt }, {
        sourceClass: 'recovery-reconciliation',
        sourceRef: receipt.actionId,
      });
      await record('cycle.completed', { receiptDigest: receipt.receiptDigest, recovered: true });
      return inspect();
    }

    if (state.status === 'reconciling') {
      await record('cycle.completed', { recovered: true });
      return inspect();
    }

    await record('cycle.aborted', { reason: 'interrupted-before-effect' }, {
      sourceClass: 'recovery-reconciliation',
      sourceRef: state.currentMission?.requestId ?? instanceId,
    });
    return inspect();
  }

  function inspect() {
    return structuredClone({
      instanceId: state.instanceId,
      artifactId: state.artifactId,
      constitutionDigest: state.constitutionDigest,
      status: state.status,
      epoch: state.epoch,
      cortexAdapterId: cortex.adapterId,
      lastDecisionId: state.lastDecisionId,
      lastActionId: state.lastActionId,
      soulPort,
      journalPath,
    });
  }

  return Object.freeze({ runCycle, recover, inspect });
}
