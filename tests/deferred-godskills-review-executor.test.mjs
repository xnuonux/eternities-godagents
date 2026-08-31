import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseResult,
  buildMissionPhaseRequest,
  verifyMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createResumableMissionReviewKernel } from '../src/runtime/mission-review-kernel.mjs';
import { createDeferredGodskillsReviewExecutor } from '../src/skills/deferred-review-executor.mjs';
import {
  buildGodskillsReviewTransportCompletion,
  buildGodskillsReviewTransportDescriptor,
  verifyGodskillsReviewDispatch,
  verifyGodskillsReviewTransportCompletion,
  verifyGodskillsReviewTransportDescriptor,
} from '../src/skills/review-transport-contracts.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import {
  buildReviewAdmission,
  buildReviewGodskillsBinding,
} from './helpers/mission-review-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const native = Object.freeze({
  schemaVersion: 1,
  artifactType: 'native',
  content: 'committed native subject for provider-neutral review',
});
const firstReview = Object.freeze({
  schemaVersion: 1,
  artifactType: 'review',
  subjectDigest: sha256Text(canonicalJson(native)),
  recommendation: 'revise',
  findings: [{ id: 'executor-proof', severity: 'important', required: true, message: 'bind transport evidence' }],
  summary: 'one bounded revision is required',
});
const revision = Object.freeze({
  schemaVersion: 1,
  artifactType: 'revision',
  nativeArtifactDigest: sha256Text(canonicalJson(native)),
  reviewArtifactDigest: sha256Text(canonicalJson(firstReview)),
  addressedFindingIds: ['executor-proof'],
  content: 'revision with transport evidence bound',
});

function reviewRequest({ admission, descriptor, round, subject, priorReview = null }) {
  const subjectDigest = sha256Text(canonicalJson(subject));
  return buildMissionPhaseRequest({
    admission,
    phase: 'review',
    round,
    descriptor,
    inputs: round === 1
      ? [
        { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
        { role: 'subject', artifactDigest: subjectDigest },
      ]
      : [
        { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
        { role: 'prior-review', artifactDigest: sha256Text(canonicalJson(priorReview)) },
        { role: 'revision', artifactDigest: subjectDigest },
        { role: 'subject', artifactDigest: subjectDigest },
      ],
    maxCompletionTokens: admission.budgets.reviewCompletionTokensPerRound,
  });
}

function usage(overrides = {}) {
  return {
    inputTokens: 900,
    cachedInputTokens: 700,
    reasoningTokens: 180,
    visibleOutputTokens: 45,
    completionTokens: 225,
    ...overrides,
  };
}

function reviewArtifact(dispatch, recommendation = 'accept') {
  return {
    schemaVersion: 1,
    artifactType: 'review',
    subjectDigest: dispatch.package.subject.artifactDigest,
    recommendation,
    findings: [],
    summary: 'provider-neutral transport accepted the exact subject',
  };
}

function localPhaseExecutor({ phase, artifact }) {
  const descriptorValue = buildMissionExecutorDescriptor({
    executorId: `deferred-review-integration-${phase}-v1`,
    phase,
  });
  const completions = new Map();
  return {
    descriptor() {
      return structuredClone(descriptorValue);
    },
    async reconcile(request) {
      const result = completions.get(request.requestDigest);
      return result ? { status: 'completed', result: structuredClone(result) } : { status: 'absent' };
    },
    async execute(request) {
      if (completions.has(request.requestDigest)) throw new Error(`duplicate ${phase} integration dispatch`);
      const result = buildMissionPhaseResult({
        request,
        descriptor: descriptorValue,
        artifact: structuredClone(artifact),
        usage: usage({ inputTokens: 120, cachedInputTokens: 80, reasoningTokens: 80, visibleOutputTokens: 20, completionTokens: 100 }),
        startedAt: '2026-08-31T18:30:00.000Z',
        completedAt: '2026-08-31T18:30:00.500Z',
      });
      completions.set(request.requestDigest, result);
      return structuredClone(result);
    },
  };
}

async function setup({
  round = 1,
  reconcileMode = 'absent',
  maximumCompletionBytes = 16_384,
  mutateCompletion = null,
} = {}) {
  const reads = [];
  const calls = [];
  const completions = new Map();
  let lastCompletion = null;
  const transportDescriptor = buildGodskillsReviewTransportDescriptor({
    transportId: 'fixture-provider-neutral-review-v1',
    maximumCompletionBytes,
  });
  const makeCompletion = (dispatch) => {
    const built = buildGodskillsReviewTransportCompletion({
      dispatch,
      transportDescriptor,
      artifact: reviewArtifact(dispatch),
      usage: usage(),
      startedAt: `2026-08-31T19:00:0${round}.000Z`,
      completedAt: `2026-08-31T19:00:0${round}.500Z`,
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
      calls.push({ type: 'descriptor' });
      return structuredClone(transportDescriptor);
    },
    async reconcile(dispatch) {
      calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
      if (reconcileMode === 'pending') return { status: 'pending' };
      if (reconcileMode === 'completed') {
        lastCompletion = makeCompletion(dispatch);
        return { status: 'completed', completion: structuredClone(lastCompletion) };
      }
      const completion = completions.get(dispatch.dispatchDigest);
      return completion
        ? { status: 'completed', completion: structuredClone(completion) }
        : { status: 'absent' };
    },
    async execute(dispatch) {
      calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
      if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate review transport dispatch');
      lastCompletion = makeCompletion(dispatch);
      completions.set(dispatch.dispatchDigest, lastCompletion);
      return { status: 'completed', completion: structuredClone(lastCompletion) };
    },
  };
  const io = {
    async readFile(path) {
      reads.push(String(path).replaceAll('\\', '/'));
      return readFile(path);
    },
    realpath,
  };
  const executor = await createDeferredGodskillsReviewExecutor({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'fixture-godskills-review',
    transport,
    io,
  });
  const manifest = JSON.parse(await readFile(
    `${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`,
    'utf8',
  ));
  const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
  const missionId = 'mission-deferred-review-executor';
  const binding = buildReviewGodskillsBinding(missionId, {
    id: capability.id,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
    releaseDigest: executor.releaseDigest,
    activationTrustRootDigest: executor.activationTrustRootDigest,
  });
  const admission = buildReviewAdmission(missionId, { godskillsBinding: binding });
  const descriptor = await executor.descriptor();
  const subject = round === 1 ? native : revision;
  const priorReview = round === 1 ? null : firstReview;
  const request = reviewRequest({ admission, descriptor, round, subject, priorReview });
  const context = {
    admission,
    subject,
    deferredReviews: admission.godskills.deferredReviews,
    godskillsReceipt: admission.godskills.receipt,
    priorReview,
    revision: round === 1 ? null : revision,
  };
  reads.length = 0;
  return {
    reads,
    calls,
    completions,
    transportDescriptor,
    transport,
    io,
    executor,
    admission,
    descriptor,
    request,
    context,
    get lastCompletion() { return lastCompletion; },
  };
}

test('transport descriptor is deterministic, closed, and authority-empty', () => {
  const descriptor = buildGodskillsReviewTransportDescriptor({
    transportId: 'provider-neutral-fixture-v1',
    maximumCompletionBytes: 8192,
  });
  assert.deepEqual(verifyGodskillsReviewTransportDescriptor(descriptor), descriptor);
  assert.deepEqual(
    descriptor,
    buildGodskillsReviewTransportDescriptor({
      transportId: 'provider-neutral-fixture-v1',
      maximumCompletionBytes: 8192,
    }),
  );
  assert.deepEqual(Object.values(descriptor.authority), [false, false, false, false, false, false, false]);

  const changed = structuredClone(descriptor);
  changed.provider = 'forbidden';
  assert.throws(() => verifyGodskillsReviewTransportDescriptor(changed), /fields|additionalProperties/i);
});

test('absent reconciliation materializes once, then exact execution returns an evidenced phase result', async () => {
  const state = await setup();
  const reconciled = await state.executor.reconcile(state.request, state.context);
  assert.deepEqual(reconciled, { status: 'absent' });
  const dispatch = state.calls.find(({ type }) => type === 'reconcile').dispatch;
  assert.deepEqual(verifyGodskillsReviewDispatch(dispatch, {
    request: state.request,
    executorDescriptor: state.descriptor,
    transportDescriptor: state.transportDescriptor,
  }), dispatch);
  const readsAfterReconcile = [...state.reads];
  assert.equal(readsAfterReconcile.length, 2);
  assert.equal(canonicalJson(dispatch).includes(godskillsRoot), false);

  const result = await state.executor.execute(state.request, state.context);
  assert.deepEqual(verifyMissionPhaseResult(result, {
    request: state.request,
    descriptor: state.descriptor,
  }), result);
  assert.equal(result.receipt.executorEvidenceDigest, state.lastCompletion.completionDigest);
  assert.equal(result.artifact.subjectDigest, dispatch.package.subject.artifactDigest);
  assert.deepEqual(state.reads, readsAfterReconcile);
  assert.deepEqual(state.calls.map(({ type }) => type), ['descriptor', 'reconcile', 'execute']);
});

test('round two dispatch binds the exact revision and prior review', async () => {
  const state = await setup({ round: 2 });
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const dispatch = state.calls.find(({ type }) => type === 'reconcile').dispatch;
  assert.equal(dispatch.package.round, 2);
  assert.equal(dispatch.package.subject.artifact.artifactType, 'revision');
  assert.equal(dispatch.package.priorReview.artifact.artifactType, 'review');
  assert.equal(
    dispatch.package.subject.artifact.reviewArtifactDigest,
    dispatch.package.priorReview.artifactDigest,
  );
  const result = await state.executor.execute(state.request, state.context);
  assert.equal(result.artifact.subjectDigest, dispatch.package.subject.artifactDigest);
});

test('pending and completed reconciliation never execute the transport', async () => {
  const pending = await setup({ reconcileMode: 'pending' });
  assert.deepEqual(await pending.executor.reconcile(pending.request, pending.context), { status: 'pending' });
  await assert.rejects(
    pending.executor.execute(pending.request, pending.context),
    /absent reconciliation|required reconciliation/i,
  );
  assert.equal(pending.calls.filter(({ type }) => type === 'execute').length, 0);

  const completed = await setup({ reconcileMode: 'completed' });
  const recovered = await completed.executor.reconcile(completed.request, completed.context);
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.result.receipt.executorEvidenceDigest, completed.lastCompletion.completionDigest);
  assert.equal(completed.calls.filter(({ type }) => type === 'execute').length, 0);
});

test('ambiguous transport reconciliation fails closed without execution', async () => {
  for (const response of [
    { status: 'unknown' },
    { status: 'absent', completion: {} },
    { status: 'completed' },
  ]) {
    const state = await setup();
    state.transport.reconcile = async () => structuredClone(response);
    await assert.rejects(
      state.executor.reconcile(state.request, state.context),
      /reconciliation|status|fields|object/i,
    );
    assert.equal(state.calls.filter(({ type }) => type === 'execute').length, 0);
  }
});

test('execute cannot bypass exact absent reconciliation', async () => {
  const state = await setup();
  await assert.rejects(
    state.executor.execute(state.request, state.context),
    /absent reconciliation|required reconciliation/i,
  );
  assert.equal(state.calls.filter(({ type }) => type === 'execute').length, 0);
  assert.deepEqual(state.reads, []);
});

test('changed and authority-shaped context fails before body reads or transport use', async () => {
  const state = await setup();
  await assert.rejects(
    state.executor.reconcile(state.request, { ...state.context, providerConfig: { model: 'forbidden' } }),
    /fields/i,
  );
  assert.deepEqual(state.reads, []);
  assert.equal(state.calls.filter(({ type }) => type === 'reconcile').length, 0);

  const changedProjection = structuredClone(state.context);
  changedProjection.godskillsReceipt.requestId = 'substituted';
  await assert.rejects(
    state.executor.reconcile(state.request, changedProjection),
    /context|receipt|admission/i,
  );
  assert.deepEqual(state.reads, []);
  assert.equal(state.calls.filter(({ type }) => type === 'reconcile').length, 0);
});

test('completion link and authority mutation fail even when the outer digest is recomputed', async () => {
  for (const [name, mutate, pattern] of [
    ['package', (completion) => { completion.packageDigest = 'f'.repeat(64); }, /package|dispatch|completion/i],
    ['authority', (completion) => { completion.authority.realmEffects = true; }, /authority|realm/i],
    ['usage', (completion) => { completion.usage.completionTokens = 501; }, /usage|token|completion/i],
    ['time', (completion) => { completion.completedAt = '2026-08-31T18:59:59.000Z'; }, /time|before|completion/i],
    ['credential', (completion) => { completion.apiKey = 'forbidden'; }, /field|additionalProperties/i],
  ]) {
    const state = await setup({ mutateCompletion: mutate });
    assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' }, name);
    await assert.rejects(state.executor.execute(state.request, state.context), pattern, name);
  }
});

test('completion verifier rejects bytes above the transport ceiling', async () => {
  const state = await setup({ maximumCompletionBytes: 256 });
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  await assert.rejects(
    state.executor.execute(state.request, state.context),
    /byte ceiling|completion.*bytes/i,
  );
});

test('dispatch and completion verifiers reject post-build mutation', async () => {
  const state = await setup();
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const dispatch = state.calls.find(({ type }) => type === 'reconcile').dispatch;
  const completion = buildGodskillsReviewTransportCompletion({
    dispatch,
    transportDescriptor: state.transportDescriptor,
    artifact: reviewArtifact(dispatch),
    usage: usage(),
    startedAt: '2026-08-31T19:10:00.000Z',
    completedAt: '2026-08-31T19:10:01.000Z',
  });
  assert.deepEqual(verifyGodskillsReviewTransportCompletion(completion, {
    dispatch,
    transportDescriptor: state.transportDescriptor,
  }), completion);

  const changedDispatch = structuredClone(dispatch);
  changedDispatch.package.subject.artifact.content = 'mutated';
  assert.throws(
    () => verifyGodskillsReviewDispatch(changedDispatch, {
      request: state.request,
      executorDescriptor: state.descriptor,
      transportDescriptor: state.transportDescriptor,
    }),
    /package|digest/i,
  );

  const changedCompletion = structuredClone(completion);
  changedCompletion.artifact.summary = 'mutated';
  assert.throws(
    () => verifyGodskillsReviewTransportCompletion(changedCompletion, {
      dispatch,
      transportDescriptor: state.transportDescriptor,
    }),
    /completion|digest/i,
  );
});

test('review dispatch rejects coherently rehashed mission and admission detachment', async () => {
  for (const mutate of [
    (packageValue) => { packageValue.mission.missionId = 'detached-review-mission'; },
    (packageValue) => { packageValue.admissionDigest = 'f'.repeat(64); },
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
    assert.throws(() => verifyGodskillsReviewDispatch(dispatch, {
      request: state.request,
      executorDescriptor: state.descriptor,
      transportDescriptor: state.transportDescriptor,
    }), /mission|admission|binding|dispatch/i);
  }
});

test('kernel reconstruction recovers a completed deferred review without redispatch', async (t) => {
  const state = await setup();
  const journalRoot = await mkdtemp(join(tmpdir(), 'godagent-deferred-review-recovery-'));
  t.after(() => rm(journalRoot, { recursive: true, force: true }));
  const nativeExecutor = localPhaseExecutor({
    phase: 'native',
    artifact: native,
  });
  const revisionExecutor = localPhaseExecutor({
    phase: 'revision',
    artifact: revision,
  });
  const supplied = {
    mission: structuredClone(state.admission.mission),
    authorityCeilingDigest: state.admission.authorityCeilingDigest,
    budgets: structuredClone(state.admission.budgets),
    godskillsBinding: {
      receipt: structuredClone(state.admission.godskills.receipt),
      cortexPackage: structuredClone(state.admission.godskills.cortexPackage),
    },
    godskillsTrustPin: structuredClone(state.admission.godskills.trustPin),
  };
  let now = Date.parse('2026-08-31T18:00:00.000Z');
  let crashed = false;
  const options = {
    journalRoot,
    nativeExecutor,
    reviewExecutor: state.executor,
    revisionExecutor,
    clock: () => {
      const current = now;
      now += 3_600_000;
      return current;
    },
    checkpoint: async (name) => {
      if (!crashed && name === 'after-review-1-execute') {
        crashed = true;
        throw new Error('simulated process death after deferred review transport completion');
      }
    },
    lockOptions: {
      pid: 52011,
      now: () => now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => 'deferred-review-recovery-lock',
    },
  };

  await assert.rejects(
    () => createResumableMissionReviewKernel(options).run(supplied),
    /process death/i,
  );
  assert.equal(state.calls.filter(({ type }) => type === 'execute').length, 1);
  const originalDispatchDigest = state.calls.find(({ type }) => type === 'execute').dispatch.dispatchDigest;

  const reconstructedReviewExecutor = await createDeferredGodskillsReviewExecutor({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'fixture-godskills-review',
    transport: state.transport,
    io: state.io,
  });
  assert.deepEqual(reconstructedReviewExecutor.descriptor(), state.descriptor);
  const completed = await createResumableMissionReviewKernel({
    ...options,
    reviewExecutor: reconstructedReviewExecutor,
    checkpoint: async () => {},
  }).run(supplied);

  assert.equal(completed.status, 'completed');
  assert.equal(completed.verdict.reason, 'review-accepted');
  assert.equal(completed.artifact.content, native.content);
  assert.equal(state.calls.filter(({ type }) => type === 'execute').length, 1);
  const recoveryReconcile = state.calls.filter(({ type }) => type === 'reconcile').at(-1);
  assert.equal(recoveryReconcile.dispatch.dispatchDigest, originalDispatchDigest);
  assert.equal(state.completions.size, 1);
});
