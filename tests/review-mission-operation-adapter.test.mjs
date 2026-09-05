import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import test from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
  buildMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import {
  createReviewMissionOperationAdapter,
  ReviewMissionOperationAdapterError,
} from '../src/runtime/review-mission-operation-adapter.mjs';
import { MissionOperationAdapterError } from '../src/runtime/mission-operation-adapter.mjs';
import { MISSION_PROGRAM_PROTOCOL_ID, createMissionProgramCoordinator } from '../src/runtime/mission-program.mjs';
import { buildReviewAdmission } from './helpers/mission-review-fixture.mjs';

const digest = (value) => sha256Text(String(value));
const clone = (value) => structuredClone(value);

function makeReviewState() {
  const missionId = 'mission-review-operation-adapter';
  const admission = buildReviewAdmission(missionId);
  const subject = { schemaVersion: 1, artifactType: 'native', content: 'committed review subject' };
  const descriptorValue = buildMissionExecutorDescriptor({
    executorId: 'fixture-review-executor-v1',
    phase: 'review',
  });
  const subjectDigest = sha256Text(canonicalJson(subject));
  const request = buildMissionPhaseRequest({
    admission,
    phase: 'review',
    round: 1,
    descriptor: descriptorValue,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
      { role: 'subject', artifactDigest: subjectDigest },
    ],
    maxCompletionTokens: admission.budgets.reviewCompletionTokensPerRound,
  });
  const context = {
    admission,
    subject,
    deferredReviews: admission.godskills.deferredReviews,
    godskillsReceipt: admission.godskills.receipt,
    priorReview: null,
    revision: null,
  };
  const calls = [];
  const completions = new Map();
  const absent = new Set();
  const lastResult = { value: null };
  const mode = { malformed: false };
  let liveDescriptor = clone(descriptorValue);
  const executor = {
    descriptor() {
      calls.push({ type: 'descriptor' });
      return clone(liveDescriptor);
    },
    async reconcile(phaseRequest, phaseContext) {
      calls.push({ type: 'reconcile', request: clone(phaseRequest), context: clone(phaseContext) });
      const completed = completions.get(phaseRequest.requestDigest);
      if (completed) return { status: 'completed', result: clone(completed) };
      absent.add(phaseRequest.requestDigest);
      return { status: 'absent' };
    },
    async execute(phaseRequest, phaseContext) {
      calls.push({ type: 'execute', request: clone(phaseRequest), context: clone(phaseContext) });
      if (!absent.delete(phaseRequest.requestDigest)) {
        throw new Error('review execution requires absent reconciliation');
      }
      if (mode.malformed) return { malformed: true };
      const artifact = {
        schemaVersion: 1,
        artifactType: 'review',
        subjectDigest,
        recommendation: 'accept',
        findings: [],
        summary: 'fixture review accepted the exact subject',
      };
      const result = buildMissionPhaseResult({
        request: phaseRequest,
        descriptor: descriptorValue,
        artifact,
        usage: {
          inputTokens: 20,
          cachedInputTokens: 10,
          reasoningTokens: 4,
          visibleOutputTokens: 3,
          completionTokens: 7,
        },
        startedAt: '2026-09-05T11:00:00.000Z',
        completedAt: '2026-09-05T11:00:00.100Z',
      });
      completions.set(phaseRequest.requestDigest, result);
      lastResult.value = result;
      return clone(result);
    },
    drift() {
      liveDescriptor = buildMissionExecutorDescriptor({
        executorId: 'fixture-review-executor-drifted-v1',
        phase: 'review',
      });
    },
    calls,
    mode,
  };
  return { admission, request, context, descriptorValue, executor, calls, subjectDigest, lastResult, mode };
}

function makeMissionInput({ request, admission, programId = null, descriptorDigest = null } = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'fixture-review-agent',
      identityDigest: digest('review-identity'),
      genomeDigest: digest('review-genome'),
      keelHeadDigest: digest('review-keel'),
    },
    missionDigest: digest('review-operation-mission'),
    authorityCeilingDigest: admission.authorityCeilingDigest,
    budget: { maxCompletionTokens: 500, maxResultBytes: 4_096 },
    steps: [{
      stepId: 'review',
      stepIndex: 0,
      kind: 'review',
      inputDigest: request.requestDigest,
      maxCompletionTokens: request.maxCompletionTokens,
      maxResultBytes: 4_096,
    }],
  };
  const value = { ...unsigned, programId: programId ?? sha256Value(unsigned) };
  if (descriptorDigest) value.steps[0].descriptorDigest = descriptorDigest;
  return value;
}

function dispatchFor(input, descriptor) {
  const step = input.steps[0];
  const dispatchId = sha256Value({
    programId: input.programId,
    stepId: step.stepId,
    stepIndex: step.stepIndex,
    inputDigest: step.inputDigest,
    descriptorDigest: descriptor.missionStepDescriptor.descriptorDigest,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: input.programId,
    dispatchId,
    stepId: step.stepId,
    stepIndex: step.stepIndex,
    kind: step.kind,
    inputDigest: step.inputDigest,
    authorityCeilingDigest: input.authorityCeilingDigest,
    maxCompletionTokens: step.maxCompletionTokens,
    maxResultBytes: step.maxResultBytes,
    descriptorDigest: descriptor.missionStepDescriptor.descriptorDigest,
  };
  return { ...unsigned, dispatchDigest: sha256Value(unsigned) };
}

async function makeAdapter() {
  const state = makeReviewState();
  const input = makeMissionInput(state);
  const adapter = await createReviewMissionOperationAdapter({
    executor: state.executor,
    programId: input.programId,
    stepId: 'review',
    stepIndex: 0,
    authorityCeilingDigest: state.admission.authorityCeilingDigest,
    maxCompletionTokens: state.request.maxCompletionTokens,
    maxResultBytes: 4_096,
    phaseRequest: state.request,
    phaseContext: state.context,
  });
  return { ...state, input, adapter };
}

test('binds one review phase to a payload-free mission operation', async () => {
  const state = await makeAdapter();
  const description = state.adapter.describe();
  assert.equal(description.operationKind, 'review');
  assert.equal(description.authority.realmEffects, 0);
  assert.equal(state.adapter.describeSource().phaseRequestDigest, state.request.requestDigest);
  assert.equal(state.adapter.describeSource().contextDigest, sha256Value(state.context));

  const dispatch = dispatchFor(state.input, description);
  assert.deepEqual(await state.adapter.reconcile({ dispatch }), { status: 'absent' });
  const completed = await state.adapter.execute({ dispatch });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completion.programId, state.input.programId);
  assert.equal(completed.completion.stepId, 'review');
  assert.equal(completed.completion.resultDigest, state.lastResult.value.receipt.resultDigest);
  assert.equal(completed.completion.resultBytes, state.lastResult.value.receipt.artifactBytes);
  assert.deepEqual(completed.completion.usage, state.lastResult.value.receipt.usage);
  assert.equal(completed.completion.startedAt, state.lastResult.value.receipt.startedAt);
  assert.equal(completed.completion.completedAt, state.lastResult.value.receipt.completedAt);
  const phaseCalls = state.calls.filter(({ type }) => type === 'reconcile' || type === 'execute');
  assert.deepEqual(phaseCalls.map(({ type }) => type), ['reconcile', 'execute']);
  assert.deepEqual(phaseCalls[0].request, state.request);
  assert.deepEqual(phaseCalls[0].context, state.context);
});

test('mission program replay does not duplicate the bound review executor', async () => {
  const state = await makeAdapter();
  const programRoot = await mkdtemp(join(tmpdir(), 'godagents-review-operation-test-'));
  try {
    const coordinator = await createMissionProgramCoordinator({
      programRoot,
      adapters: [state.adapter],
      clock: () => '2026-09-05T11:00:00.000Z',
    });
    const first = await coordinator.execute(state.input);
    const callsAfterFirst = state.calls.filter(({ type }) => type === 'execute').length;
    const replay = await coordinator.execute(state.input);
    assert.equal(first.status, 'completed');
    assert.equal(replay.status, 'completed');
    assert.equal(state.calls.filter(({ type }) => type === 'execute').length, callsAfterFirst);
  } finally {
    await rm(programRoot, { recursive: true, force: true });
  }
});

test('rejects changed executor descriptors before invoking review', async () => {
  const state = await makeAdapter();
  const dispatch = dispatchFor(state.input, state.adapter.describe());
  state.executor.drift();
  await assert.rejects(
    () => state.adapter.reconcile({ dispatch }),
    (error) => error instanceof MissionOperationAdapterError && error.code === 'source-drift',
  );
  assert.equal(state.calls.filter(({ type }) => type === 'reconcile').length, 0);
});

test('rejects mismatched mission identity and ceilings before invoking review', async () => {
  const state = await makeAdapter();
  const dispatch = dispatchFor(state.input, state.adapter.describe());
  const changed = { ...dispatch, programId: digest('foreign-program') };
  const { dispatchDigest: _old, ...unsigned } = changed;
  changed.dispatchDigest = sha256Value(unsigned);
  await assert.rejects(
    () => state.adapter.reconcile({ dispatch: changed }),
    (error) => error instanceof MissionOperationAdapterError
      && error.code === 'source-call'
      && error.cause instanceof ReviewMissionOperationAdapterError
      && error.cause.code === 'phase-binding',
  );
  assert.equal(state.calls.filter(({ type }) => type === 'reconcile').length, 0);
});

test('rejects changed phase request or context at construction', async () => {
  const state = makeReviewState();
  const input = makeMissionInput(state);
  const changedRequestUnsigned = {
    ...state.request,
    inputs: [
      state.request.inputs[0],
      { role: 'subject', artifactDigest: digest('changed-subject') },
    ],
  };
  const { requestDigest: _requestDigest, ...changedRequestBody } = changedRequestUnsigned;
  const changedRequest = { ...changedRequestBody, requestDigest: sha256Value(changedRequestBody) };
  await assert.rejects(
    () => createReviewMissionOperationAdapter({
      executor: state.executor,
      programId: input.programId,
      stepId: 'review',
      stepIndex: 0,
      authorityCeilingDigest: state.admission.authorityCeilingDigest,
      maxCompletionTokens: state.request.maxCompletionTokens,
      maxResultBytes: 4_096,
      phaseRequest: changedRequest,
      phaseContext: state.context,
    }),
    (error) => error instanceof ReviewMissionOperationAdapterError && error.code === 'context-binding',
  );

  const changedContext = {
    ...state.context,
    subject: { schemaVersion: 1, artifactType: 'native', content: 'changed subject' },
  };
  await assert.rejects(
    () => createReviewMissionOperationAdapter({
      executor: state.executor,
      programId: input.programId,
      stepId: 'review',
      stepIndex: 0,
      authorityCeilingDigest: state.admission.authorityCeilingDigest,
      maxCompletionTokens: state.request.maxCompletionTokens,
      maxResultBytes: 4_096,
      phaseRequest: state.request,
      phaseContext: changedContext,
    }),
    (error) => error instanceof ReviewMissionOperationAdapterError && error.code === 'context-binding',
  );
});

test('rejects authority and completion-ceiling drift after construction', async () => {
  const state = await makeAdapter();
  const description = state.adapter.describe();
  const dispatch = dispatchFor(state.input, description);
  for (const field of ['authorityCeilingDigest', 'maxCompletionTokens', 'maxResultBytes']) {
    const changed = {
      ...dispatch,
      [field]: field === 'maxCompletionTokens' ? dispatch[field] + 1
        : field === 'maxResultBytes' ? dispatch[field] - 1 : digest('foreign-ceiling'),
    };
    const { dispatchDigest: _dispatchDigest, ...unsigned } = changed;
    changed.dispatchDigest = sha256Value(unsigned);
    await assert.rejects(
      () => state.adapter.reconcile({ dispatch: changed }),
      (error) => error instanceof MissionOperationAdapterError
        && error.code === 'source-call'
        && error.cause instanceof ReviewMissionOperationAdapterError
        && error.cause.code === 'phase-binding',
    );
  }
  assert.equal(state.calls.filter(({ type }) => type === 'reconcile').length, 0);
});

test('preserves absent-before-execute and rejects malformed phase results', async () => {
  const state = await makeAdapter();
  const dispatch = dispatchFor(state.input, state.adapter.describe());
  await assert.rejects(
    () => state.adapter.execute({ dispatch }),
    (error) => error instanceof MissionOperationAdapterError
      && error.code === 'source-call'
      && /requires absent reconciliation/.test(error.cause?.message ?? ''),
  );
  assert.equal(state.calls.filter(({ type }) => type === 'execute').length, 1);

  await state.adapter.reconcile({ dispatch });
  state.mode.malformed = true;
  await assert.rejects(
    () => state.adapter.execute({ dispatch }),
    (error) => error instanceof MissionOperationAdapterError
      && error.code === 'source-call',
  );
});

test('reconciles a completed underlying review without a second execute', async () => {
  const state = await makeAdapter();
  const dispatch = dispatchFor(state.input, state.adapter.describe());
  await state.adapter.reconcile({ dispatch });
  const first = await state.adapter.execute({ dispatch });
  const recovered = await state.adapter.reconcile({ dispatch });
  assert.equal(first.status, 'completed');
  assert.equal(recovered.status, 'completed');
  assert.deepEqual(recovered.completion, first.completion);
  assert.equal(state.calls.filter(({ type }) => type === 'execute').length, 1);
});

test('rejects invalid adapter construction ceilings and review phase', async () => {
  const state = makeReviewState();
  const input = makeMissionInput(state);
  await assert.rejects(
    () => createReviewMissionOperationAdapter({
      executor: state.executor,
      programId: input.programId,
      stepId: 'review',
      stepIndex: 0,
      authorityCeilingDigest: digest('wrong-authority'),
      maxCompletionTokens: state.request.maxCompletionTokens,
      maxResultBytes: 4_096,
      phaseRequest: state.request,
      phaseContext: state.context,
    }),
    /authority|binding|ceiling/i,
  );
});
