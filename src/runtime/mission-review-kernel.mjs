import { canonicalJson } from '../core/canonical-json.mjs';
import { IntegrityError } from '../core/errors.mjs';
import {
  buildMissionAdmission,
  buildMissionCompletionReceipt,
  buildMissionPhaseRequest,
  buildMissionVerdict,
  verifyMissionExecutorDescriptor,
} from './mission-phase-contracts.mjs';
import { createMissionReviewJournal } from './mission-review-journal.mjs';

const clone = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

export class MissionReviewKernelError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionReviewKernelError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionReviewKernelError(code, message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('executor-response-invalid', `${label} fields are invalid`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clockValue(clock) {
  const milliseconds = Number(clock());
  if (!Number.isFinite(milliseconds)) throw new TypeError('mission review kernel clock is invalid');
  return milliseconds;
}

function assertExecutor(executor, phase) {
  object(executor, `${phase} executor`);
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof executor[method] !== 'function') throw new TypeError(`${phase} executor ${method} is required`);
  }
}

async function loadDescriptor(executor, phase) {
  return verifyMissionExecutorDescriptor(clone(await executor.descriptor()), phase);
}

function aggregateUsage(evidence) {
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    visibleOutputTokens: 0,
    completionTokens: 0,
  };
  const entries = [evidence.native, ...evidence.reviews, evidence.revision].filter(Boolean);
  for (const entry of entries) {
    if (!entry.result) continue;
    for (const key of Object.keys(usage)) usage[key] += entry.result.usage[key];
  }
  return usage;
}

function phaseResults(evidence) {
  return {
    nativeResultDigest: evidence.native.result.resultDigest,
    reviewResultDigests: evidence.reviews.map(({ result }) => result.resultDigest),
    revisionResultDigest: evidence.revision?.result?.resultDigest ?? null,
  };
}

function verdictFor(evidence) {
  const common = {
    admission: evidence.admission,
    nativeResultDigest: evidence.native.result.resultDigest,
    reviewResultDigests: evidence.reviews.map(({ result }) => result.resultDigest),
    revisionResultDigest: evidence.revision?.result?.resultDigest ?? null,
  };
  if (evidence.budgetExhaustion) {
    const reason = evidence.budgetExhaustion.phase === 'revision'
      ? 'budget-exhausted-before-revision'
      : evidence.budgetExhaustion.round === 2
        ? 'budget-exhausted-before-final-review'
        : 'budget-exhausted-before-review';
    return buildMissionVerdict({
      ...common,
      disposition: 'rejected',
      reason,
      acceptedArtifactDigest: null,
    });
  }
  if (evidence.reviews.length === 0) {
    return buildMissionVerdict({
      ...common,
      disposition: 'accepted',
      reason: 'native-no-review',
      acceptedArtifactDigest: evidence.native.result.artifactDigest,
    });
  }
  if (evidence.reviews[0].artifact.recommendation === 'accept') {
    return buildMissionVerdict({
      ...common,
      disposition: 'accepted',
      reason: 'review-accepted',
      acceptedArtifactDigest: evidence.native.result.artifactDigest,
    });
  }
  if (evidence.reviews[0].artifact.recommendation === 'reject') {
    return buildMissionVerdict({
      ...common,
      disposition: 'rejected',
      reason: 'review-rejected',
      acceptedArtifactDigest: null,
    });
  }
  const finalRecommendation = evidence.reviews[1].artifact.recommendation;
  return buildMissionVerdict({
    ...common,
    disposition: finalRecommendation === 'accept' ? 'accepted' : 'rejected',
    reason: finalRecommendation === 'accept'
      ? 'revision-review-accepted'
      : finalRecommendation === 'reject' ? 'revision-review-rejected' : 'revision-budget-exhausted',
    acceptedArtifactDigest: finalRecommendation === 'accept' ? evidence.revision.result.artifactDigest : null,
  });
}

function inputsFor(action, evidence) {
  if (action === 'prepare-native') {
    return evidence.admission.godskills === null ? [] : [{
      role: 'godskills-package',
      artifactDigest: evidence.admission.godskills.receipt.packageDigest,
    }];
  }
  if (action === 'prepare-review-1') {
    return [
      { role: 'godskills-binding', artifactDigest: evidence.admission.godskills.bindingDigest },
      { role: 'subject', artifactDigest: evidence.native.result.artifactDigest },
    ];
  }
  if (action === 'prepare-revision') {
    return [
      { role: 'native', artifactDigest: evidence.native.result.artifactDigest },
      { role: 'review', artifactDigest: evidence.reviews[0].result.artifactDigest },
    ];
  }
  if (action === 'prepare-review-2') {
    return [
      { role: 'godskills-binding', artifactDigest: evidence.admission.godskills.bindingDigest },
      { role: 'prior-review', artifactDigest: evidence.reviews[0].result.artifactDigest },
      { role: 'revision', artifactDigest: evidence.revision.result.artifactDigest },
      { role: 'subject', artifactDigest: evidence.revision.result.artifactDigest },
    ];
  }
  throw new IntegrityError(`mission phase input action is unsupported: ${action}`);
}

function phaseForAction(action) {
  if (action === 'prepare-native') return { phase: 'native', round: 1 };
  if (action === 'prepare-revision') return { phase: 'revision', round: 1 };
  if (action === 'prepare-review-1') return { phase: 'review', round: 1 };
  if (action === 'prepare-review-2') return { phase: 'review', round: 2 };
  throw new IntegrityError(`mission preparation action is unsupported: ${action}`);
}

function budgetFor(admission, phase) {
  if (phase === 'native') return admission.budgets.nativeCompletionTokens;
  if (phase === 'review') return admission.budgets.reviewCompletionTokensPerRound;
  return admission.budgets.revisionCompletionTokens;
}

function preparedFor(evidence, phase, round) {
  if (phase === 'native') return evidence.native;
  if (phase === 'revision') return evidence.revision;
  return evidence.reviews.find((entry) => entry.request.round === round) ?? null;
}

function contextFor(evidence, phase, round) {
  if (phase === 'native') {
    return deepFreeze({
      admission: clone(evidence.admission),
      mission: clone(evidence.admission.mission),
      godskillsBinding: evidence.admission.godskills === null ? null : {
        receipt: clone(evidence.admission.godskills.receipt),
        cortexPackage: clone(evidence.admission.godskills.cortexPackage),
      },
    });
  }
  if (phase === 'review' && round === 1) {
    return deepFreeze({
      admission: clone(evidence.admission),
      subject: clone(evidence.native.artifact),
      deferredReviews: clone(evidence.admission.godskills.deferredReviews),
      godskillsReceipt: clone(evidence.admission.godskills.receipt),
      priorReview: null,
      revision: null,
    });
  }
  if (phase === 'revision') {
    return deepFreeze({
      admission: clone(evidence.admission),
      native: clone(evidence.native.artifact),
      review: clone(evidence.reviews[0].artifact),
    });
  }
  return deepFreeze({
    admission: clone(evidence.admission),
    subject: clone(evidence.revision.artifact),
    deferredReviews: clone(evidence.admission.godskills.deferredReviews),
    godskillsReceipt: clone(evidence.admission.godskills.receipt),
    priorReview: clone(evidence.reviews[0].artifact),
    revision: clone(evidence.revision.artifact),
  });
}

function reconciliationValue(value) {
  exactKeys(value, value?.status === 'completed' ? ['result', 'status'] : ['status'], 'executor reconciliation');
  if (!['absent', 'pending', 'completed'].includes(value.status)) {
    fail('executor-reconciliation-invalid', 'executor reconciliation status is invalid');
  }
  return value;
}

async function terminalResult(handle, evidence) {
  const artifact = evidence.terminal.acceptedArtifactDigest === null
    ? null
    : await handle.readArtifact(evidence.terminal.acceptedArtifactDigest);
  return deepFreeze({
    status: 'completed',
    receipt: clone(evidence.terminal),
    verdict: clone(evidence.verdict),
    artifact: clone(artifact),
  });
}

export function createResumableMissionReviewKernel({
  journalRoot,
  nativeExecutor,
  reviewExecutor = null,
  revisionExecutor = null,
  clock = Date.now,
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  assertExecutor(nativeExecutor, 'native');
  if (reviewExecutor !== null) assertExecutor(reviewExecutor, 'review');
  if (revisionExecutor !== null) assertExecutor(revisionExecutor, 'revision');
  if (typeof clock !== 'function' || typeof checkpoint !== 'function') {
    throw new TypeError('mission review kernel clock and checkpoint must be functions');
  }
  const journal = createMissionReviewJournal({ journalRoot, clock, checkpoint, lockOptions });

  async function mark(name, missionId, requestDigest = null) {
    await checkpoint(name, deepFreeze({ missionId, requestDigest }));
  }

  async function executePrepared({ handle, evidence, phase, round, executor, descriptor, mayExecute }) {
    const prepared = preparedFor(evidence, phase, round);
    if (!prepared || prepared.result) throw new IntegrityError('mission recovery lacks its prepared phase');
    if (!same(prepared.descriptor, descriptor)) {
      fail('executor-descriptor-changed', `${phase} executor descriptor changed after preparation`);
    }
    const request = prepared.request;
    const context = contextFor(evidence, phase, round);
    const phaseLabel = phase === 'review' ? `review-${round}` : phase;
    await mark(`before-${phaseLabel}-reconcile`, evidence.admission.mission.missionId, request.requestDigest);
    const reconciled = reconciliationValue(await executor.reconcile(clone(request), context));
    if (reconciled.status === 'pending') {
      return deepFreeze({
        status: 'pending',
        missionId: evidence.admission.mission.missionId,
        phase,
        round,
        requestDigest: request.requestDigest,
      });
    }
    let result;
    if (reconciled.status === 'absent' && !mayExecute) {
      return deepFreeze({ status: 'absent', missionId: evidence.admission.mission.missionId,
        phase, round, requestDigest: request.requestDigest });
    }
    if (reconciled.status === 'completed') {
      result = reconciled.result;
      await mark(`after-${phaseLabel}-reconcile-completed`, evidence.admission.mission.missionId, request.requestDigest);
    } else {
      await mark(`before-${phaseLabel}-execute`, evidence.admission.mission.missionId, request.requestDigest);
      result = await executor.execute(clone(request), context);
      await mark(`after-${phaseLabel}-execute`, evidence.admission.mission.missionId, request.requestDigest);
    }
    await handle.commitPhase(result);
    await mark(`after-${phaseLabel}-commit`, evidence.admission.mission.missionId, request.requestDigest);
    return null;
  }

  async function drive(input = {}, mayExecute) {
    exactKeys(input, [
      'authorityCeilingDigest', 'budgets', 'godskillsBinding', 'godskillsTrustPin', 'mission',
    ], 'mission review kernel input');
    const {
      mission,
      authorityCeilingDigest,
      budgets,
      godskillsBinding,
      godskillsTrustPin,
    } = input;
    object(mission, 'mission');
    let handle = await journal.openExisting(mission.missionId);
    let admission;
    if (handle) {
      const existing = await handle.recoverEvidence();
      admission = buildMissionAdmission({
        mission,
        authorityCeilingDigest,
        budgets,
        godskillsBinding,
        godskillsTrustPin,
        admittedAt: existing.admission.admittedAt,
      });
      if (!same(admission, existing.admission)) fail('admission-changed', 'mission admission changed during recovery');
      if (existing.terminal) return terminalResult(handle, existing);
    } else {
      admission = buildMissionAdmission({
        mission,
        authorityCeilingDigest,
        budgets,
        godskillsBinding,
        godskillsTrustPin,
        admittedAt: new Date(clockValue(clock)).toISOString(),
      });
      handle = await journal.open(admission);
    }

    const reviewRequired = admission.godskills?.deferredReviews.length > 0;
    if (reviewRequired && (!reviewExecutor || !revisionExecutor)) {
      fail('review-executor-missing', 'admitted Godskills review requires review and revision executors');
    }
    const descriptors = {
      native: await loadDescriptor(nativeExecutor, 'native'),
      review: reviewRequired ? await loadDescriptor(reviewExecutor, 'review') : null,
      revision: reviewRequired ? await loadDescriptor(revisionExecutor, 'revision') : null,
    };
    const executors = { native: nativeExecutor, review: reviewExecutor, revision: revisionExecutor };

    for (let transitions = 0; transitions < 32; transitions += 1) {
      const inspected = await handle.inspect();
      if (inspected.nextAction === 'none') return terminalResult(handle, await handle.recoverEvidence());
      const action = inspected.nextAction;
      if (action.startsWith('prepare-')) {
        const evidence = await handle.recoverEvidence();
        const { phase, round } = phaseForAction(action);
        const reservation = budgetFor(admission, phase);
        if (evidence.completionTokens + reservation > admission.budgets.totalCompletionTokens) {
          await handle.recordBudgetExhaustion({ phase, round });
          continue;
        }
        const request = buildMissionPhaseRequest({
          admission,
          phase,
          round,
          descriptor: descriptors[phase],
          inputs: inputsFor(action, evidence),
          maxCompletionTokens: reservation,
        });
        await handle.preparePhase({ request, descriptor: descriptors[phase] });
        await mark(`after-${phase}-prepare`, mission.missionId, request.requestDigest);
        continue;
      }
      if (action.startsWith('reconcile-')) {
        const parts = action.split('-');
        const phase = parts[1];
        const round = phase === 'review' ? Number(parts[2]) : 1;
        const pending = await executePrepared({
          handle,
          evidence: await handle.recoverEvidence(),
          phase,
          round,
          executor: executors[phase],
          descriptor: descriptors[phase],
          mayExecute,
        });
        if (pending) return pending;
        continue;
      }
      if (action === 'bind-review') {
        await handle.bindReview();
        await mark('after-review-bind', mission.missionId);
        continue;
      }
      if (action === 'accept-native' || action === 'accept-revision') {
        const evidence = await handle.recoverEvidence();
        const artifactDigest = action === 'accept-native'
          ? evidence.native.result.artifactDigest
          : evidence.revision.result.artifactDigest;
        await handle.acceptArtifact(artifactDigest);
        continue;
      }
      if (action === 'commit-verdict') {
        const evidence = await handle.recoverEvidence();
        await handle.commitVerdict(verdictFor(evidence));
        continue;
      }
      if (action === 'complete-mission') {
        const evidence = await handle.recoverEvidence();
        const receipt = buildMissionCompletionReceipt({
          admission,
          transactionId: handle.transactionId,
          preCompletionJournalHeadDigest: evidence.headDigest,
          verdict: evidence.verdict,
          phaseResults: phaseResults(evidence),
          usage: aggregateUsage(evidence),
          completedAt: new Date(clockValue(clock)).toISOString(),
        });
        await handle.complete(receipt);
        return terminalResult(handle, await handle.recoverEvidence());
      }
      throw new IntegrityError(`mission review kernel action is unsupported: ${action}`);
    }
    throw new IntegrityError('mission review kernel transition ceiling exceeded');
  }

  return Object.freeze({
    run: input => drive(input, true),
    reconcile: input => drive(input, false),
  });
}
