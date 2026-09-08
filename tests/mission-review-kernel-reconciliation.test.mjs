import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildMissionExecutorDescriptor, buildMissionPhaseResult } from '../src/runtime/mission-phase-contracts.mjs';
import { createResumableMissionReviewKernel } from '../src/runtime/mission-review-kernel.mjs';
import { buildReviewGodskillsBinding, buildReviewGodskillsTrustPin, fixtureDigest } from './helpers/mission-review-fixture.mjs';

function executor(phase) {
  const saved = new Map();
  const state = { executions: 0, reconciliations: 0, pending: false, last: null,
    descriptor: buildMissionExecutorDescriptor({ executorId: `reconcile-only-${phase}`, phase }) };
  const complete = () => {
    const request = state.last.request;
    const artifact = phase === 'review'
      ? { schemaVersion: 1, artifactType: 'review', recommendation: 'accept', findings: [], summary: 'accepted',
        subjectDigest: request.inputs.find(row => row.role === 'subject').artifactDigest }
      : { schemaVersion: 1, artifactType: phase, content: 'saved controlled result' };
    const now = new Date().toISOString();
    const result = buildMissionPhaseResult({ request, descriptor: state.descriptor, artifact,
      usage: { inputTokens: 100, cachedInputTokens: 0, reasoningTokens: 10, visibleOutputTokens: 10, completionTokens: 20 },
      startedAt: now, completedAt: now });
    saved.set(request.requestDigest, result);
    return result;
  };
  return { state, complete,
    descriptor: () => structuredClone(state.descriptor),
    async reconcile(request, context) {
      state.reconciliations += 1;
      state.last = { request: structuredClone(request), context: structuredClone(context) };
      if (state.pending) return { status: 'pending' };
      const result = saved.get(request.requestDigest);
      return result ? { status: 'completed', result: structuredClone(result) } : { status: 'absent' };
    },
    async execute() { state.executions += 1; return structuredClone(complete()); },
  };
}

async function fixture(t, { review = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-kernel-reconciliation-'));
  t.after(async () => {
    assert.equal(resolve(dirname(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('godagent-kernel-reconciliation-'));
    await rm(root, { recursive: true, force: true });
  });
  const native = executor('native');
  const reviewer = executor('review');
  const revision = executor('revision');
  const missionId = 'kernel-reconciliation';
  const binding = review ? buildReviewGodskillsBinding(missionId) : null;
  const input = {
    mission: { missionId, objective: 'recover the bounded saved result', successEvidence: ['artifact committed'],
      stopConditions: ['transport ambiguity'] },
    authorityCeilingDigest: fixtureDigest(review ? 'b' : 'c'),
    budgets: { nativeCompletionTokens: 1000, reviewCompletionTokensPerRound: 500,
      revisionCompletionTokens: 800, totalCompletionTokens: 2800, maxArtifactBytes: 8192 },
    godskillsBinding: binding, godskillsTrustPin: review ? buildReviewGodskillsTrustPin(binding) : null,
  };
  const options = { journalRoot: root, nativeExecutor: native,
    ...(review ? { reviewExecutor: reviewer, revisionExecutor: revision } : {}) };
  return { root, input, native, reviewer, revision, kernel: createResumableMissionReviewKernel(options),
    freshKernel: () => createResumableMissionReviewKernel(options) };
}

test('reconcile materializes the exact phase and proves absence without executing it', async t => {
  const { kernel, native, input } = await fixture(t);
  const result = await kernel.reconcile(input);
  assert.equal(result.status, 'absent');
  assert.equal(result.phase, 'native');
  assert.equal(result.round, 1);
  assert.equal(result.missionId, input.mission.missionId);
  assert.equal(result.requestDigest, native.state.last.request.requestDigest);
  assert.deepEqual(native.state.last.context.admission.mission, input.mission);
  assert.equal(native.state.reconciliations, 1, 'absence requires the actual executor reconciliation');
  assert.equal(native.state.executions, 0);
});

test('reconciliation mode is per call and does not disable a subsequent normal run', async t => {
  const { kernel, native, input } = await fixture(t);
  await kernel.reconcile(input);
  const completed = await kernel.run(input);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.artifact.content, 'saved controlled result');
  assert.equal(native.state.executions, 1);
  const calls = native.state.reconciliations;
  assert.deepEqual(await kernel.reconcile(input), completed);
  assert.equal(native.state.reconciliations, calls, 'terminal replay must not call an executor');
  assert.equal(native.state.executions, 1);
});

test('pending never becomes absence and never executes on repeated reconciliation', async t => {
  const { kernel, native, input } = await fixture(t);
  native.state.pending = true;
  const first = await kernel.reconcile(input);
  assert.equal(first.status, 'pending');
  assert.deepEqual(await kernel.reconcile(input), first);
  assert.equal(native.state.executions, 0);
});

test('a fresh kernel recovers completed external evidence without a new execution', async t => {
  const { kernel, freshKernel, native, input } = await fixture(t);
  await kernel.reconcile(input);
  native.complete(); // controlled provider result persisted outside the kernel
  const result = await freshKernel().reconcile(input);
  assert.equal(result.status, 'completed');
  assert.equal(result.receipt.disposition, 'accepted');
  assert.equal(result.artifact.content, 'saved controlled result');
  assert.equal(native.state.executions, 0);
});

test('saved native work may progress to a review boundary but cannot execute that review', async t => {
  const { kernel, native, reviewer, revision, input } = await fixture(t, { review: true });
  await kernel.reconcile(input);
  native.complete();
  const reviewBoundary = await kernel.reconcile(input);
  assert.equal(reviewBoundary.status, 'absent');
  assert.equal(reviewBoundary.phase, 'review');
  assert.equal(reviewer.state.reconciliations, 1);
  assert.equal(native.state.executions + reviewer.state.executions + revision.state.executions, 0);
  reviewer.complete();
  assert.equal((await kernel.reconcile(input)).status, 'completed');
  assert.equal(native.state.executions + reviewer.state.executions + revision.state.executions, 0);
});

test('changed admission and descriptor reject before reconciliation can report absence', async t => {
  const { kernel, native, input } = await fixture(t);
  await kernel.reconcile(input);
  const changed = structuredClone(input);
  changed.mission.objective = 'replace the admitted mission';
  await assert.rejects(kernel.reconcile(changed));
  native.state.descriptor = buildMissionExecutorDescriptor({ executorId: 'different-native-owner', phase: 'native' });
  await assert.rejects(kernel.reconcile(input));
  assert.equal(native.state.reconciliations, 1);
  assert.equal(native.state.executions, 0);
});

test('malformed persisted journal and caller-supplied execution mode fail rather than becoming absence', async t => {
  const { kernel, native, input, root } = await fixture(t);
  await assert.rejects(kernel.reconcile({ ...input, executionMode: 'launch' }));
  assert.equal(native.state.reconciliations, 0);
  await kernel.reconcile(input);
  const slots = await readdir(root);
  assert.equal(slots.length, 1);
  await writeFile(join(root, slots[0], 'journal.json'), '{broken');
  await assert.rejects(kernel.reconcile(input));
  assert.equal(native.state.reconciliations, 1);
  assert.equal(native.state.executions, 0);
});
