import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionPhaseRequest,
  verifyMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createMissionRevisionExecutor } from '../src/runtime/mission-revision-executor.mjs';
import { verifyMissionRevisionPackage } from '../src/runtime/mission-revision-materializer.mjs';
import {
  buildMissionRevisionTransportCompletion,
  buildMissionRevisionTransportDescriptor,
  verifyMissionRevisionDispatch,
  verifyMissionRevisionTransportCompletion,
  verifyMissionRevisionTransportDescriptor,
} from '../src/runtime/mission-revision-transport-contracts.mjs';
import { buildReviewAdmission } from './helpers/mission-review-fixture.mjs';

const native = Object.freeze({
  schemaVersion: 1,
  artifactType: 'native',
  content: 'native artifact awaiting exact bounded repair',
});
const review = Object.freeze({
  schemaVersion: 1,
  artifactType: 'review',
  subjectDigest: sha256Text(canonicalJson(native)),
  recommendation: 'revise',
  findings: [
    { id: 'correct-facts', severity: 'important', required: true, message: 'correct the evidence linkage' },
    { id: 'tighten-style', severity: 'advisory', required: false, message: 'remove one redundant sentence' },
  ],
  summary: 'one required repair and one optional refinement',
});

function usage(overrides = {}) {
  return {
    inputTokens: 700,
    cachedInputTokens: 500,
    reasoningTokens: 160,
    visibleOutputTokens: 40,
    completionTokens: 200,
    ...overrides,
  };
}

function revisionArtifact(dispatch, addressedFindingIds = ['correct-facts', 'tighten-style']) {
  return {
    schemaVersion: 1,
    artifactType: 'revision',
    nativeArtifactDigest: dispatch.package.native.artifactDigest,
    reviewArtifactDigest: dispatch.package.review.artifactDigest,
    addressedFindingIds,
    content: 'revised artifact with exact evidence linkage and tighter prose',
  };
}

async function setup({
  reconcileMode = 'absent',
  maximumCompletionBytes = 8192,
  maximumMaterializedBytes = 32_768,
  mutateCompletion = null,
  sharedCompletions = new Map(),
  sharedCalls = [],
} = {}) {
  const transportDescriptor = buildMissionRevisionTransportDescriptor({
    transportId: 'fixture-revision-transport-v1',
    maximumCompletionBytes,
  });
  let lastCompletion = null;
  const makeCompletion = (dispatch) => {
    const built = buildMissionRevisionTransportCompletion({
      dispatch,
      transportDescriptor,
      artifact: revisionArtifact(dispatch),
      usage: usage(),
      startedAt: '2026-08-31T21:00:00.000Z',
      completedAt: '2026-08-31T21:00:00.500Z',
    });
    if (!mutateCompletion) return built;
    const changed = structuredClone(built);
    mutateCompletion(changed, dispatch);
    const { completionDigest: _oldDigest, ...unsigned } = changed;
    changed.completionDigest = sha256Value(unsigned);
    return changed;
  };
  const transport = {
    descriptor() {
      sharedCalls.push({ type: 'descriptor' });
      return structuredClone(transportDescriptor);
    },
    async reconcile(dispatch) {
      sharedCalls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
      if (reconcileMode === 'pending') return { status: 'pending' };
      if (reconcileMode === 'completed') {
        lastCompletion = makeCompletion(dispatch);
        return { status: 'completed', completion: structuredClone(lastCompletion) };
      }
      const completion = sharedCompletions.get(dispatch.dispatchDigest);
      return completion
        ? { status: 'completed', completion: structuredClone(completion) }
        : { status: 'absent' };
    },
    async execute(dispatch) {
      sharedCalls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
      if (sharedCompletions.has(dispatch.dispatchDigest)) throw new Error('duplicate revision transport dispatch');
      lastCompletion = makeCompletion(dispatch);
      sharedCompletions.set(dispatch.dispatchDigest, lastCompletion);
      return { status: 'completed', completion: structuredClone(lastCompletion) };
    },
  };
  const executor = await createMissionRevisionExecutor({
    maximumMaterializedBytes,
    executorIdPrefix: 'fixture-mission-revision',
    transport,
  });
  const admission = buildReviewAdmission('mission-revision-executor');
  const descriptor = executor.descriptor();
  const request = buildMissionPhaseRequest({
    admission,
    phase: 'revision',
    round: 1,
    descriptor,
    inputs: [
      { role: 'native', artifactDigest: sha256Text(canonicalJson(native)) },
      { role: 'review', artifactDigest: sha256Text(canonicalJson(review)) },
    ],
    maxCompletionTokens: admission.budgets.revisionCompletionTokens,
  });
  const context = { admission, native, review };
  return {
    transportDescriptor,
    transport,
    executor,
    admission,
    descriptor,
    request,
    context,
    calls: sharedCalls,
    completions: sharedCompletions,
    get lastCompletion() { return lastCompletion; },
  };
}

test('revision transport descriptor is deterministic, closed, and authority-empty', () => {
  const descriptor = buildMissionRevisionTransportDescriptor({
    transportId: 'revision-transport-v1',
    maximumCompletionBytes: 8192,
  });
  assert.deepEqual(verifyMissionRevisionTransportDescriptor(descriptor), descriptor);
  assert.deepEqual(descriptor, buildMissionRevisionTransportDescriptor({
    transportId: 'revision-transport-v1',
    maximumCompletionBytes: 8192,
  }));
  assert.deepEqual(Object.values(descriptor.authority), [false, false, false, false, false, false, false]);
  const changed = structuredClone(descriptor);
  changed.provider = 'forbidden';
  assert.throws(() => verifyMissionRevisionTransportDescriptor(changed), /field|additionalProperties/i);
});

test('exact absent reconciliation materializes one compact package and returns evidenced revision', async () => {
  const state = await setup();
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const dispatch = state.calls.find(({ type }) => type === 'reconcile').dispatch;
  assert.deepEqual(verifyMissionRevisionDispatch(dispatch, {
    admission: state.admission,
    request: state.request,
    executorDescriptor: state.descriptor,
    transportDescriptor: state.transportDescriptor,
  }), dispatch);
  assert.deepEqual(verifyMissionRevisionPackage(dispatch.package), dispatch.package);
  assert.deepEqual(dispatch.package.requiredFindingIds, ['correct-facts']);
  assert.equal(dispatch.package.native.artifact.content, native.content);
  assert.equal(dispatch.package.review.artifact.summary, review.summary);
  assert.equal(canonicalJson(dispatch.package).includes('scheduled-not-executed'), false);
  assert.equal(canonicalJson(dispatch.package).includes('entrypointSha256'), false);

  const result = await state.executor.execute(state.request, state.context);
  assert.deepEqual(verifyMissionPhaseResult(result, {
    request: state.request,
    descriptor: state.descriptor,
  }), result);
  assert.equal(result.receipt.executorEvidenceDigest, state.lastCompletion.completionDigest);
  assert.deepEqual(result.artifact.addressedFindingIds, ['correct-facts', 'tighten-style']);
  assert.deepEqual(state.calls.map(({ type }) => type), ['descriptor', 'reconcile', 'execute']);
});

test('pending and completed revision reconciliation perform no execution', async () => {
  const pending = await setup({ reconcileMode: 'pending' });
  assert.deepEqual(await pending.executor.reconcile(pending.request, pending.context), { status: 'pending' });
  await assert.rejects(() => pending.executor.execute(pending.request, pending.context), /reconciliation/i);
  assert.equal(pending.calls.filter(({ type }) => type === 'execute').length, 0);

  const completed = await setup({ reconcileMode: 'completed' });
  const result = await completed.executor.reconcile(completed.request, completed.context);
  assert.equal(result.status, 'completed');
  assert.equal(result.result.receipt.executorEvidenceDigest, completed.lastCompletion.completionDigest);
  assert.equal(completed.calls.filter(({ type }) => type === 'execute').length, 0);
});

test('ambiguous state and direct execution fail closed', async () => {
  const direct = await setup();
  await assert.rejects(() => direct.executor.execute(direct.request, direct.context), /reconciliation/i);
  assert.equal(direct.calls.filter(({ type }) => type === 'execute').length, 0);

  for (const response of [{ status: 'unknown' }, { status: 'absent', completion: {} }, { status: 'completed' }]) {
    const state = await setup();
    state.transport.reconcile = async () => structuredClone(response);
    await assert.rejects(() => state.executor.reconcile(state.request, state.context), /state|status|field|object/i);
    assert.equal(state.calls.filter(({ type }) => type === 'execute').length, 0);
  }
});

test('changed or authority-shaped context fails before transport use', async () => {
  const state = await setup();
  await assert.rejects(
    () => state.executor.reconcile(state.request, { ...state.context, model: 'forbidden' }),
    /field/i,
  );
  assert.equal(state.calls.filter(({ type }) => type === 'reconcile').length, 0);

  const changed = structuredClone(state.context);
  changed.review.summary = 'substituted review';
  await assert.rejects(() => state.executor.reconcile(state.request, changed), /context|review|digest/i);
  assert.equal(state.calls.filter(({ type }) => type === 'reconcile').length, 0);
});

test('completion requires every required finding and rejects unknown finding ids', async () => {
  for (const [name, addressed] of [
    ['missing', ['tighten-style']],
    ['unknown', ['correct-facts', 'ghost-finding']],
  ]) {
    const state = await setup({
      mutateCompletion(completion) {
        completion.artifact.addressedFindingIds = addressed;
      },
    });
    assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
    await assert.rejects(() => state.executor.execute(state.request, state.context), /finding|address/i, name);
  }
});

test('changed completion links, limits, authority, time, and fields fail with recomputed digest', async () => {
  for (const [name, mutate, pattern] of [
    ['package', (completion) => { completion.packageDigest = 'f'.repeat(64); }, /package|completion/i],
    ['usage', (completion) => { completion.usage.completionTokens = 801; }, /usage|token|completion/i],
    ['authority', (completion) => { completion.authority.continuityAdmission = true; }, /authority|continuity/i],
    ['time', (completion) => { completion.completedAt = '2026-08-31T20:59:59.000Z'; }, /time|before|completion/i],
    ['credential', (completion) => { completion.apiKey = 'forbidden'; }, /field|additionalProperties/i],
    ['artifact-bytes', (completion) => { completion.artifact.content = 'x'.repeat(9000); }, /artifact.*byte|byte.*artifact/i],
  ]) {
    const state = await setup({ mutateCompletion: mutate });
    assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
    await assert.rejects(() => state.executor.execute(state.request, state.context), pattern, name);
  }
});

test('completion verifier enforces bytes and post-build mutation', async () => {
  const small = await setup({ maximumCompletionBytes: 256 });
  assert.deepEqual(await small.executor.reconcile(small.request, small.context), { status: 'absent' });
  await assert.rejects(() => small.executor.execute(small.request, small.context), /byte ceiling|bytes/i);

  const state = await setup();
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const dispatch = state.calls.find(({ type }) => type === 'reconcile').dispatch;
  const completion = buildMissionRevisionTransportCompletion({
    dispatch,
    transportDescriptor: state.transportDescriptor,
    artifact: revisionArtifact(dispatch),
    usage: usage(),
    startedAt: '2026-08-31T21:10:00.000Z',
    completedAt: '2026-08-31T21:10:00.500Z',
  });
  assert.deepEqual(verifyMissionRevisionTransportCompletion(completion, {
    dispatch,
    transportDescriptor: state.transportDescriptor,
  }), completion);
  const changedDispatch = structuredClone(dispatch);
  changedDispatch.package.native.artifact.content = 'mutated';
  assert.throws(() => verifyMissionRevisionDispatch(changedDispatch, {
    admission: state.admission,
    request: state.request,
    executorDescriptor: state.descriptor,
    transportDescriptor: state.transportDescriptor,
  }), /package|digest/i);
  const changedCompletion = structuredClone(completion);
  changedCompletion.artifact.content = 'mutated';
  assert.throws(() => verifyMissionRevisionTransportCompletion(changedCompletion, {
    dispatch,
    transportDescriptor: state.transportDescriptor,
  }), /completion|digest/i);
});

test('revision materialization enforces the complete canonical package ceiling', async () => {
  const state = await setup({ maximumMaterializedBytes: 1024 });
  await assert.rejects(
    () => state.executor.reconcile(state.request, state.context),
    /package.*byte|byte ceiling/i,
  );
  assert.equal(state.calls.filter(({ type }) => type === 'reconcile').length, 0);
});

test('revision dispatch rejects coherently rehashed mission and admission detachment', async () => {
  for (const mutate of [
    (packageValue) => { packageValue.mission.missionId = 'detached-revision-mission'; },
    (packageValue) => { packageValue.admissionDigest = 'f'.repeat(64); },
    (packageValue) => { packageValue.maxArtifactBytes = 16_777_216; },
  ]) {
    const state = await setup();
    assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
    const dispatch = structuredClone(state.calls.find(({ type }) => type === 'reconcile').dispatch);
    mutate(dispatch.package);
    const { packageDigest: _oldPackageDigest, ...packageUnsigned } = dispatch.package;
    dispatch.package.packageDigest = sha256Value(packageUnsigned);
    dispatch.packageDigest = dispatch.package.packageDigest;
    const { dispatchDigest: _oldDispatchDigest, ...dispatchUnsigned } = dispatch;
    dispatch.dispatchDigest = sha256Value(dispatchUnsigned);
    assert.throws(() => verifyMissionRevisionDispatch(dispatch, {
      admission: state.admission,
      request: state.request,
      executorDescriptor: state.descriptor,
      transportDescriptor: state.transportDescriptor,
    }), /mission|admission|binding|dispatch/i);
  }
});

test('executor reconstruction reproduces the dispatch and recovers without redispatch', async () => {
  const calls = [];
  const completions = new Map();
  const first = await setup({ sharedCalls: calls, sharedCompletions: completions });
  assert.deepEqual(await first.executor.reconcile(first.request, first.context), { status: 'absent' });
  const firstResult = await first.executor.execute(first.request, first.context);
  const firstDispatch = calls.find(({ type }) => type === 'execute').dispatch;

  const second = await setup({ sharedCalls: calls, sharedCompletions: completions });
  assert.deepEqual(second.descriptor, first.descriptor);
  const recovered = await second.executor.reconcile(second.request, second.context);
  assert.equal(recovered.status, 'completed');
  assert.deepEqual(recovered.result, firstResult);
  const lastReconcile = calls.filter(({ type }) => type === 'reconcile').at(-1);
  assert.equal(lastReconcile.dispatch.dispatchDigest, firstDispatch.dispatchDigest);
  assert.equal(calls.filter(({ type }) => type === 'execute').length, 1);
});
