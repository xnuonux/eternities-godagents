import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createResumableMissionReviewKernel } from '../src/runtime/mission-review-kernel.mjs';
import {
  buildReviewGodskillsBinding,
  buildReviewGodskillsTrustPin,
  fixtureDigest,
} from './helpers/mission-review-fixture.mjs';

function mission(missionId = 'mission-kernel-native') {
  return {
    missionId,
    objective: 'produce one bounded artifact and preserve its exact evidence',
    successEvidence: ['artifact committed', 'verdict committed'],
    stopConditions: ['authority changes', 'transport evidence is ambiguous'],
  };
}

function budgets(overrides = {}) {
  return {
    nativeCompletionTokens: 1000,
    reviewCompletionTokensPerRound: 500,
    revisionCompletionTokens: 800,
    totalCompletionTokens: 2800,
    maxArtifactBytes: 8192,
    ...overrides,
  };
}

function input({ missionId = 'mission-kernel-native', review = false, budgetOverrides = {} } = {}) {
  const godskillsBinding = review ? buildReviewGodskillsBinding(missionId) : null;
  return {
    mission: mission(missionId),
    authorityCeilingDigest: review ? fixtureDigest('b') : fixtureDigest('c'),
    budgets: budgets(budgetOverrides),
    godskillsBinding,
    godskillsTrustPin: review ? buildReviewGodskillsTrustPin(godskillsBinding) : null,
  };
}

function usage(completionTokens = 125) {
  return {
    inputTokens: 100,
    cachedInputTokens: 60,
    reasoningTokens: completionTokens - 25,
    visibleOutputTokens: 25,
    completionTokens,
  };
}

function scriptedExecutor({ phase, artifact, pending = false, completionTokens = 125, sharedEvents = [] }) {
  const descriptorValue = buildMissionExecutorDescriptor({ executorId: `kernel-${phase}-fixture-v1`, phase });
  const completions = new Map();
  const calls = [];
  return {
    calls,
    completions,
    pending,
    descriptor() {
      calls.push({ type: 'descriptor' });
      return structuredClone(descriptorValue);
    },
    async reconcile(request) {
      calls.push({ type: 'reconcile', requestDigest: request.requestDigest });
      sharedEvents.push(`${phase}:reconcile:${request.round}`);
      if (this.pending) return { status: 'pending' };
      const result = completions.get(request.requestDigest);
      return result ? { status: 'completed', result: structuredClone(result) } : { status: 'absent' };
    },
    async execute(request, context) {
      calls.push({ type: 'execute', requestDigest: request.requestDigest });
      sharedEvents.push(`${phase}:execute:${request.round}`);
      if (completions.has(request.requestDigest)) throw new Error(`duplicate ${phase} dispatch`);
      const value = typeof artifact === 'function' ? artifact(request, context) : structuredClone(artifact);
      const result = buildMissionPhaseResult({
        request,
        descriptor: descriptorValue,
        artifact: value,
        usage: usage(completionTokens),
        startedAt: `2026-08-31T15:00:0${request.round}.000Z`,
        completedAt: `2026-08-31T15:00:0${request.round}.500Z`,
      });
      completions.set(request.requestDigest, result);
      return structuredClone(result);
    },
  };
}

async function kernelFixture(t, executors, checkpoint = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-mission-review-kernel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse('2026-08-31T15:00:00.000Z');
  const options = {
    journalRoot: root,
    ...executors,
    clock: () => {
      const current = now;
      now += 1000;
      return current;
    },
    checkpoint,
    lockOptions: {
      pid: 52001,
      now: () => now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => 'mission-review-kernel-lock',
    },
  };
  return {
    root,
    options,
    kernel: createResumableMissionReviewKernel(options),
    advance(milliseconds = 1) { now += milliseconds; },
  };
}

test('native-only mission completes once and terminal replay calls no executor', async (t) => {
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'native-only result' },
  });
  const { kernel } = await kernelFixture(t, { nativeExecutor });
  const supplied = input();
  const completed = await kernel.run(supplied);

  assert.equal(completed.status, 'completed');
  assert.equal(completed.receipt.disposition, 'accepted');
  assert.equal(completed.verdict.reason, 'native-no-review');
  assert.equal(completed.artifact.content, 'native-only result');
  assert.deepEqual(nativeExecutor.calls.map(({ type }) => type), ['descriptor', 'reconcile', 'execute']);

  nativeExecutor.calls.length = 0;
  const replayed = await kernel.run(supplied);
  assert.equal(replayed.receipt.receiptDigest, completed.receipt.receiptDigest);
  assert.deepEqual(replayed.artifact, completed.artifact);
  assert.deepEqual(nativeExecutor.calls, []);
});

test('review executes only after native artifact commit and can accept it', async (t) => {
  const events = [];
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    sharedEvents: events,
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'reviewed native result' },
  });
  const reviewExecutor = scriptedExecutor({
    phase: 'review',
    sharedEvents: events,
    artifact(request, context) {
      assert.equal(context.subject.artifactType, 'native');
      assert.equal(context.deferredReviews[0].status, 'scheduled-not-executed');
      return {
        schemaVersion: 1,
        artifactType: 'review',
        subjectDigest: request.inputs.find(({ role }) => role === 'subject').artifactDigest,
        recommendation: 'accept',
        findings: [],
        summary: 'accepted after native commitment',
      };
    },
  });
  const revisionExecutor = scriptedExecutor({
    phase: 'revision',
    artifact: { schemaVersion: 1, artifactType: 'revision' },
  });
  const { kernel } = await kernelFixture(t, { nativeExecutor, reviewExecutor, revisionExecutor });
  const completed = await kernel.run(input({ missionId: 'mission-kernel-review-accept', review: true }));

  assert.equal(completed.verdict.reason, 'review-accepted');
  assert.equal(completed.artifact.content, 'reviewed native result');
  assert.equal(reviewExecutor.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(revisionExecutor.calls.filter(({ type }) => type === 'execute').length, 0);
  assert.deepEqual(events, [
    'native:reconcile:1', 'native:execute:1',
    'review:reconcile:1', 'review:execute:1',
  ]);
});

test('one revision receives exact findings and requires a terminal second review', async (t) => {
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'draft zero' },
  });
  const reviewExecutor = scriptedExecutor({
    phase: 'review',
    artifact(request, context) {
      if (request.round === 1) {
        assert.equal(context.subject.content, 'draft zero');
        return {
          schemaVersion: 1,
          artifactType: 'review',
          subjectDigest: request.inputs.find(({ role }) => role === 'subject').artifactDigest,
          recommendation: 'revise',
          findings: [{ id: 'repair-proof', severity: 'important', required: true, message: 'add exact proof' }],
          summary: 'one repair required',
        };
      }
      assert.equal(context.subject.content, 'draft one with exact proof');
      assert.equal(context.priorReview.recommendation, 'revise');
      return {
        schemaVersion: 1,
        artifactType: 'review',
        subjectDigest: request.inputs.find(({ role }) => role === 'subject').artifactDigest,
        recommendation: 'accept',
        findings: [],
        summary: 'revision accepted',
      };
    },
  });
  const revisionExecutor = scriptedExecutor({
    phase: 'revision',
    artifact(request, context) {
      assert.equal(context.native.content, 'draft zero');
      assert.equal(context.review.findings[0].id, 'repair-proof');
      return {
        schemaVersion: 1,
        artifactType: 'revision',
        nativeArtifactDigest: request.inputs.find(({ role }) => role === 'native').artifactDigest,
        reviewArtifactDigest: request.inputs.find(({ role }) => role === 'review').artifactDigest,
        addressedFindingIds: ['repair-proof'],
        content: 'draft one with exact proof',
      };
    },
  });
  const { kernel } = await kernelFixture(t, { nativeExecutor, reviewExecutor, revisionExecutor });
  const completed = await kernel.run(input({ missionId: 'mission-kernel-revision', review: true }));

  assert.equal(completed.verdict.reason, 'revision-review-accepted');
  assert.equal(completed.artifact.content, 'draft one with exact proof');
  assert.equal(reviewExecutor.calls.filter(({ type }) => type === 'execute').length, 2);
  assert.equal(revisionExecutor.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(completed.receipt.phases.reviewResultDigests.length, 2);
});

test('a second revise recommendation terminates as revision-budget-exhausted', async (t) => {
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'draft zero' },
  });
  const reviewExecutor = scriptedExecutor({
    phase: 'review',
    artifact(request) {
      return {
        schemaVersion: 1,
        artifactType: 'review',
        subjectDigest: request.inputs.find(({ role }) => role === 'subject').artifactDigest,
        recommendation: 'revise',
        findings: [{ id: `repair-${request.round}`, severity: 'important', required: true, message: 'still incomplete' }],
        summary: 'revision requested',
      };
    },
  });
  const revisionExecutor = scriptedExecutor({
    phase: 'revision',
    artifact(request) {
      return {
        schemaVersion: 1,
        artifactType: 'revision',
        nativeArtifactDigest: request.inputs.find(({ role }) => role === 'native').artifactDigest,
        reviewArtifactDigest: request.inputs.find(({ role }) => role === 'review').artifactDigest,
        addressedFindingIds: ['repair-1'],
        content: 'bounded revision',
      };
    },
  });
  const { kernel } = await kernelFixture(t, { nativeExecutor, reviewExecutor, revisionExecutor });
  const completed = await kernel.run(input({ missionId: 'mission-kernel-revision-exhausted', review: true }));

  assert.equal(completed.receipt.disposition, 'rejected');
  assert.equal(completed.verdict.reason, 'revision-budget-exhausted');
  assert.equal(completed.artifact, null);
});

test('process death after completed native dispatch recovers without redispatch', async (t) => {
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'survives process death' },
  });
  let crashed = false;
  const checkpoint = async (name) => {
    if (!crashed && name === 'after-native-execute') {
      crashed = true;
      const error = new Error('simulated process death');
      error.code = 'simulated-process-death';
      throw error;
    }
  };
  const fixture = await kernelFixture(t, { nativeExecutor }, checkpoint);
  const supplied = input({ missionId: 'mission-kernel-crash-native' });
  await assert.rejects(() => fixture.kernel.run(supplied), /process death/i);
  assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'execute').length, 1);

  const recovered = await createResumableMissionReviewKernel({ ...fixture.options, checkpoint: async () => {} }).run(supplied);
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.artifact.content, 'survives process death');
  assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.ok(nativeExecutor.calls.filter(({ type }) => type === 'reconcile').length >= 2);
});

test('pending reconciliation performs no dispatch and returns a stable pending projection', async (t) => {
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    pending: true,
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'must not dispatch' },
  });
  const { kernel } = await kernelFixture(t, { nativeExecutor });
  const result = await kernel.run(input({ missionId: 'mission-kernel-pending' }));

  assert.equal(result.status, 'pending');
  assert.equal(result.phase, 'native');
  assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'execute').length, 0);
  assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'reconcile').length, 1);
});

test('changed admission or executor descriptor fails before a resumed dispatch', async (t) => {
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    pending: true,
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'not dispatched' },
  });
  const fixture = await kernelFixture(t, { nativeExecutor });
  const supplied = input({ missionId: 'mission-kernel-identity-change' });
  await fixture.kernel.run(supplied);

  const changedInput = structuredClone(supplied);
  changedInput.mission.objective = 'changed objective';
  await assert.rejects(() => fixture.kernel.run(changedInput), /admission|mission|collision|digest/i);

  const changedExecutor = {
    ...nativeExecutor,
    descriptor() {
      return buildMissionExecutorDescriptor({ executorId: 'replacement-native-v1', phase: 'native' });
    },
  };
  const changedKernel = createResumableMissionReviewKernel({ ...fixture.options, nativeExecutor: changedExecutor });
  await assert.rejects(() => changedKernel.run(supplied), /descriptor|executor|identity/i);
  assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'execute').length, 0);
});

test('the total token reservation stops a later phase before dispatch', async (t) => {
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'budgeted draft' },
  });
  const reviewExecutor = scriptedExecutor({
    phase: 'review',
    artifact(request) {
      return {
        schemaVersion: 1,
        artifactType: 'review',
        subjectDigest: request.inputs.find(({ role }) => role === 'subject').artifactDigest,
        recommendation: 'revise',
        findings: [{ id: 'budget-repair', severity: 'important', required: true, message: 'revision requested' }],
        summary: 'revision requested under a bounded budget',
      };
    },
  });
  const revisionExecutor = scriptedExecutor({
    phase: 'revision',
    artifact: { schemaVersion: 1, artifactType: 'revision' },
  });
  const { kernel } = await kernelFixture(t, { nativeExecutor, reviewExecutor, revisionExecutor });
  const completed = await kernel.run(input({
    missionId: 'mission-kernel-budget-stop',
    review: true,
    budgetOverrides: { totalCompletionTokens: 1000 },
  }));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.receipt.disposition, 'rejected');
  assert.equal(completed.verdict.reason, 'budget-exhausted-before-revision');
  assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(reviewExecutor.calls.filter(({ type }) => type === 'execute').length, 1);
  assert.equal(revisionExecutor.calls.filter(({ type }) => type === 'execute').length, 0);
});

test('review dependencies and closed run inputs fail before native dispatch', async (t) => {
  const nativeExecutor = scriptedExecutor({
    phase: 'native',
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'must not dispatch' },
  });
  const { kernel } = await kernelFixture(t, { nativeExecutor });
  const reviewed = input({ missionId: 'mission-kernel-missing-review-executor', review: true });
  await assert.rejects(() => kernel.run(reviewed), /review.*executor|executor.*review/i);
  assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'execute').length, 0);

  await assert.rejects(
    () => kernel.run({ ...input({ missionId: 'mission-kernel-secret-field' }), apiKey: 'must-not-cross' }),
    /field|input/i,
  );
  assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'execute').length, 0);
});

test('ambiguous reconciliation and a digest-consistent authority-bearing artifact fail closed', async (t) => {
  const ambiguous = scriptedExecutor({
    phase: 'native',
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'unreachable' },
  });
  ambiguous.reconcile = async () => ({ status: 'unknown' });
  const ambiguousFixture = await kernelFixture(t, { nativeExecutor: ambiguous });
  await assert.rejects(
    () => ambiguousFixture.kernel.run(input({ missionId: 'mission-kernel-ambiguous' })),
    /reconciliation|status|field/i,
  );
  assert.equal(ambiguous.calls.filter(({ type }) => type === 'execute').length, 0);

  const malicious = scriptedExecutor({
    phase: 'native',
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'apparently valid' },
  });
  const originalExecute = malicious.execute.bind(malicious);
  malicious.execute = async (request, context) => {
    const result = await originalExecute(request, context);
    result.artifact.realmEffects = ['write'];
    const artifactJson = canonicalJson(result.artifact);
    result.receipt.artifactDigest = sha256Text(artifactJson);
    result.receipt.artifactBytes = Buffer.byteLength(artifactJson, 'utf8');
    const { resultDigest, ...unsigned } = result.receipt;
    result.receipt.resultDigest = sha256Value(unsigned);
    return result;
  };
  const maliciousFixture = await kernelFixture(t, { nativeExecutor: malicious });
  await assert.rejects(
    () => maliciousFixture.kernel.run(input({ missionId: 'mission-kernel-malicious-artifact' })),
    /artifact|field|authority|Realm/i,
  );
});

test('every completed external phase recovers across its publication window without redispatch', async (t) => {
  for (const target of [
    'after-native-artifact-publish',
    'after-review-1-execute',
    'after-revision-execute',
    'after-review-2-artifact-publish',
  ]) {
    await t.test(target, async (subtest) => {
      const nativeExecutor = scriptedExecutor({
        phase: 'native',
        artifact: { schemaVersion: 1, artifactType: 'native', content: `draft for ${target}` },
      });
      const reviewExecutor = scriptedExecutor({
        phase: 'review',
        artifact(request) {
          return {
            schemaVersion: 1,
            artifactType: 'review',
            subjectDigest: request.inputs.find(({ role }) => role === 'subject').artifactDigest,
            recommendation: request.round === 1 ? 'revise' : 'accept',
            findings: request.round === 1
              ? [{ id: 'crash-repair', severity: 'important', required: true, message: 'repair across restart' }]
              : [],
            summary: request.round === 1 ? 'revision required' : 'revision accepted',
          };
        },
      });
      const revisionExecutor = scriptedExecutor({
        phase: 'revision',
        artifact(request) {
          return {
            schemaVersion: 1,
            artifactType: 'revision',
            nativeArtifactDigest: request.inputs.find(({ role }) => role === 'native').artifactDigest,
            reviewArtifactDigest: request.inputs.find(({ role }) => role === 'review').artifactDigest,
            addressedFindingIds: ['crash-repair'],
            content: `recovered revision for ${target}`,
          };
        },
      });
      let crashed = false;
      const checkpoint = async (name) => {
        if (!crashed && name === target) {
          crashed = true;
          throw new Error(`simulated process death at ${target}`);
        }
      };
      const fixture = await kernelFixture(subtest, { nativeExecutor, reviewExecutor, revisionExecutor }, checkpoint);
      const supplied = input({ missionId: `mission-${target}`, review: true });
      await assert.rejects(() => fixture.kernel.run(supplied), /simulated process death/i);
      const completed = await createResumableMissionReviewKernel({
        ...fixture.options,
        checkpoint: async () => {},
      }).run(supplied);
      assert.equal(completed.status, 'completed');
      assert.equal(nativeExecutor.calls.filter(({ type }) => type === 'execute').length, 1);
      assert.equal(reviewExecutor.calls.filter(({ type }) => type === 'execute').length, 2);
      assert.equal(revisionExecutor.calls.filter(({ type }) => type === 'execute').length, 1);
      for (const executor of [nativeExecutor, reviewExecutor, revisionExecutor]) {
        const digests = executor.calls.filter(({ type }) => type === 'execute').map(({ requestDigest }) => requestDigest);
        assert.equal(new Set(digests).size, digests.length);
      }
    });
  }
});
