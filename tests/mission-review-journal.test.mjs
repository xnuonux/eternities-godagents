import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildMissionAdmission,
  buildMissionCompletionReceipt,
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
  buildMissionPhaseResult,
  buildMissionVerdict,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createMissionReviewJournal } from '../src/runtime/mission-review-journal.mjs';
import { buildReviewAdmission } from './helpers/mission-review-fixture.mjs';

const digest = (character) => character.repeat(64);

function admission() {
  return buildMissionAdmission({
    mission: {
      missionId: 'mission-review-journal',
      objective: 'prove one durable native artifact',
      successEvidence: ['artifact committed'],
      stopConditions: ['journal ambiguity'],
    },
    authorityCeilingDigest: digest('a'),
    budgets: {
      nativeCompletionTokens: 1000,
      reviewCompletionTokensPerRound: 500,
      revisionCompletionTokens: 800,
      totalCompletionTokens: 2800,
      maxArtifactBytes: 4096,
    },
    admittedAt: '2026-08-31T13:00:00.000Z',
  });
}

function phase() {
  const admitted = admission();
  const descriptor = buildMissionExecutorDescriptor({ executorId: 'journal-native-v1', phase: 'native' });
  const request = buildMissionPhaseRequest({
    admission: admitted,
    phase: 'native',
    round: 1,
    descriptor,
    inputs: [],
    maxCompletionTokens: admitted.budgets.nativeCompletionTokens,
  });
  const result = buildMissionPhaseResult({
    request,
    descriptor,
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'durable native result' },
    usage: {
      inputTokens: 100,
      cachedInputTokens: 80,
      reasoningTokens: 200,
      visibleOutputTokens: 50,
      completionTokens: 250,
    },
    startedAt: '2026-08-31T13:00:01.000Z',
    completedAt: '2026-08-31T13:00:02.000Z',
  });
  return { admitted, descriptor, request, result };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-mission-review-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse('2026-08-31T13:00:00.000Z');
  const journal = createMissionReviewJournal({
    journalRoot: root,
    clock: () => now,
    lockOptions: {
      pid: 51001,
      now: () => now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => 'mission-review-journal-lock',
    },
  });
  return {
    root,
    journal,
    advance(milliseconds = 1) { now += milliseconds; },
    setNow(milliseconds) { now = milliseconds; },
  };
}

test('opening is idempotent, content-addressed, and projects one next legal action', async (t) => {
  const { journal } = await fixture(t);
  const first = await journal.open(admission());
  const second = await journal.open(admission());
  const inspected = await first.inspect();

  assert.equal(first.transactionId, second.transactionId);
  assert.equal(inspected.status, 'admitted');
  assert.equal(inspected.nextAction, 'prepare-native');
  assert.equal(inspected.eventCount, 1);
  assert.equal(inspected.completionTokens, 0);
  assert.equal(Object.hasOwn(inspected, 'artifactBodies'), false);

  const collision = structuredClone(admission());
  collision.mission.objective = 'different objective under the same mission id';
  assert.rejects(() => journal.open(collision), /collision|admission|digest/i);
});

test('phase preparation is durable and changed retries fail closed', async (t) => {
  const { journal } = await fixture(t);
  const { admitted, descriptor, request } = phase();
  const handle = await journal.open(admitted);
  const prepared = await handle.preparePhase({ request, descriptor });
  const repeated = await handle.preparePhase({ request, descriptor });

  assert.deepEqual(repeated, prepared);
  assert.equal((await handle.inspect()).nextAction, 'reconcile-native');

  const changed = structuredClone(request);
  changed.maxCompletionTokens -= 1;
  await assert.rejects(
    () => handle.preparePhase({ request: changed, descriptor }),
    /request|budget|prepared|digest/i,
  );
});

test('phase commit publishes one exact artifact before recording completion', async (t) => {
  const { journal } = await fixture(t);
  const { admitted, descriptor, request, result } = phase();
  const handle = await journal.open(admitted);
  await handle.preparePhase({ request, descriptor });
  const committed = await handle.commitPhase(result);
  const repeated = await handle.commitPhase(result);

  assert.deepEqual(repeated, committed);
  assert.deepEqual(await handle.readArtifact(result.receipt.artifactDigest), result.artifact);
  const inspected = await handle.inspect();
  assert.equal(inspected.status, 'native-committed');
  assert.equal(inspected.nextAction, 'accept-native');
  assert.equal(inspected.completionTokens, 250);
  assert.equal(inspected.native.artifactDigest, result.receipt.artifactDigest);

  const substituted = structuredClone(result);
  substituted.artifact.content = 'substituted artifact';
  await assert.rejects(() => handle.commitPhase(substituted), /artifact|digest|changed/i);
});

test('an executor result that predates admission is rejected before journal mutation', async (t) => {
  const { journal } = await fixture(t);
  const { admitted, descriptor, request, result } = phase();
  const handle = await journal.open(admitted);
  await handle.preparePhase({ request, descriptor });
  const invalid = buildMissionPhaseResult({
    request,
    descriptor,
    artifact: result.artifact,
    usage: result.receipt.usage,
    startedAt: '2026-08-31T12:59:58.000Z',
    completedAt: '2026-08-31T12:59:59.000Z',
  });

  await assert.rejects(() => handle.commitPhase(invalid), /predates admission/i);
  const afterRejection = await handle.inspect();
  assert.equal(afterRejection.nextAction, 'reconcile-native');
  assert.equal(afterRejection.eventCount, 2);

  await handle.commitPhase(result);
  assert.equal((await handle.inspect()).nextAction, 'accept-native');
});

test('a backward journal clock is rejected before journal mutation', async (t) => {
  const { journal, setNow } = await fixture(t);
  const { admitted, descriptor, request, result } = phase();
  const handle = await journal.open(admitted);
  await handle.preparePhase({ request, descriptor });

  setNow(Date.parse('2026-08-31T12:59:59.999Z'));
  await assert.rejects(() => handle.commitPhase(result), /time moved backward/i);
  assert.equal((await handle.inspect()).nextAction, 'reconcile-native');

  setNow(Date.parse('2026-08-31T13:00:03.000Z'));
  await handle.commitPhase(result);
  assert.equal((await handle.inspect()).nextAction, 'accept-native');
});

test('missing or changed artifact bytes invalidate journal replay', async (t) => {
  const { journal } = await fixture(t);
  const { admitted, descriptor, request, result } = phase();
  const handle = await journal.open(admitted);
  await handle.preparePhase({ request, descriptor });
  await handle.commitPhase(result);
  const artifactPath = handle.artifactPath(result.receipt.artifactDigest);

  await unlink(artifactPath);
  await assert.rejects(() => handle.inspect(), /artifact.*missing|missing.*artifact/i);

  await writeFile(artifactPath, `${canonicalJson({ ...result.artifact, content: 'changed' })}\n`, 'utf8');
  await assert.rejects(() => handle.inspect(), /artifact.*digest|digest.*artifact/i);
});

test('journal mutation, noncanonical bytes, and illegal transitions fail closed', async (t) => {
  const { journal } = await fixture(t);
  const { admitted, descriptor, request, result } = phase();
  const handle = await journal.open(admitted);
  await assert.rejects(() => handle.commitPhase(result), /prepared|transition/i);
  await assert.rejects(() => handle.bindReview(), /review|transition|native/i);

  await handle.preparePhase({ request, descriptor });
  const stored = JSON.parse(await readFile(handle.statePath, 'utf8'));
  stored.events[0].payload.admission.mission.objective = 'tampered';
  await writeFile(handle.statePath, `${canonicalJson(stored)}\n`, 'utf8');
  await assert.rejects(() => handle.inspect(), /digest|admission|journal/i);

  await writeFile(handle.statePath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
  await assert.rejects(() => handle.inspect(), /canonical|journal/i);
});

function aggregateUsage(results) {
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    visibleOutputTokens: 0,
    completionTokens: 0,
  };
  for (const result of results) {
    for (const key of Object.keys(usage)) usage[key] += result.receipt.usage[key];
  }
  return usage;
}

function completedPhase({ admitted, phase: phaseName, round, inputs, artifact, ordinal }) {
  const descriptor = buildMissionExecutorDescriptor({
    executorId: `journal-${phaseName}-v1`,
    phase: phaseName,
  });
  const request = buildMissionPhaseRequest({
    admission: admitted,
    phase: phaseName,
    round,
    descriptor,
    inputs,
    maxCompletionTokens: phaseName === 'native'
      ? admitted.budgets.nativeCompletionTokens
      : phaseName === 'review'
        ? admitted.budgets.reviewCompletionTokensPerRound
        : admitted.budgets.revisionCompletionTokens,
  });
  const result = buildMissionPhaseResult({
    request,
    descriptor,
    artifact,
    usage: {
      inputTokens: 100 + ordinal,
      cachedInputTokens: 50,
      reasoningTokens: 100,
      visibleOutputTokens: 25,
      completionTokens: 125,
    },
    startedAt: `2026-08-31T14:00:0${ordinal}.000Z`,
    completedAt: `2026-08-31T14:00:0${ordinal}.500Z`,
  });
  return { descriptor, request, result };
}

test('review and one-revision path is fully journaled before a terminal receipt', async (t) => {
  const { journal } = await fixture(t);
  const admitted = buildReviewAdmission('mission-review-kernel');
  const handle = await journal.open(admitted);

  const native = completedPhase({
    admitted,
    phase: 'native',
    round: 1,
    inputs: [{ role: 'godskills-package', artifactDigest: admitted.godskills.receipt.packageDigest }],
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'native draft' },
    ordinal: 1,
  });
  await handle.preparePhase(native);
  await handle.commitPhase(native.result);
  assert.equal((await handle.inspect()).nextAction, 'bind-review');
  await handle.bindReview();
  assert.equal((await handle.inspect()).nextAction, 'prepare-review-1');

  const reviewOne = completedPhase({
    admitted,
    phase: 'review',
    round: 1,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admitted.godskills.bindingDigest },
      { role: 'subject', artifactDigest: native.result.receipt.artifactDigest },
    ],
    artifact: {
      schemaVersion: 1,
      artifactType: 'review',
      subjectDigest: native.result.receipt.artifactDigest,
      recommendation: 'revise',
      findings: [{ id: 'finding-required', severity: 'important', required: true, message: 'repair the proof' }],
      summary: 'one revision is required',
    },
    ordinal: 2,
  });
  await handle.preparePhase(reviewOne);
  await handle.commitPhase(reviewOne.result);
  assert.equal((await handle.inspect()).nextAction, 'prepare-revision');

  const revision = completedPhase({
    admitted,
    phase: 'revision',
    round: 1,
    inputs: [
      { role: 'native', artifactDigest: native.result.receipt.artifactDigest },
      { role: 'review', artifactDigest: reviewOne.result.receipt.artifactDigest },
    ],
    artifact: {
      schemaVersion: 1,
      artifactType: 'revision',
      nativeArtifactDigest: native.result.receipt.artifactDigest,
      reviewArtifactDigest: reviewOne.result.receipt.artifactDigest,
      addressedFindingIds: ['finding-required'],
      content: 'revised draft with proof',
    },
    ordinal: 3,
  });
  await handle.preparePhase(revision);
  await handle.commitPhase(revision.result);
  assert.equal((await handle.inspect()).nextAction, 'prepare-review-2');

  const reviewTwo = completedPhase({
    admitted,
    phase: 'review',
    round: 2,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admitted.godskills.bindingDigest },
      { role: 'prior-review', artifactDigest: reviewOne.result.receipt.artifactDigest },
      { role: 'revision', artifactDigest: revision.result.receipt.artifactDigest },
      { role: 'subject', artifactDigest: revision.result.receipt.artifactDigest },
    ],
    artifact: {
      schemaVersion: 1,
      artifactType: 'review',
      subjectDigest: revision.result.receipt.artifactDigest,
      recommendation: 'accept',
      findings: [],
      summary: 'the bounded revision is accepted',
    },
    ordinal: 4,
  });
  await handle.preparePhase(reviewTwo);
  await handle.commitPhase(reviewTwo.result);
  assert.equal((await handle.inspect()).nextAction, 'accept-revision');
  await handle.acceptArtifact(revision.result.receipt.artifactDigest);

  const verdict = buildMissionVerdict({
    admission: admitted,
    disposition: 'accepted',
    reason: 'revision-review-accepted',
    acceptedArtifactDigest: revision.result.receipt.artifactDigest,
    nativeResultDigest: native.result.receipt.resultDigest,
    reviewResultDigests: [reviewOne.result.receipt.resultDigest, reviewTwo.result.receipt.resultDigest],
    revisionResultDigest: revision.result.receipt.resultDigest,
  });
  await handle.commitVerdict(verdict);
  const beforeCompletion = await handle.inspect();
  const receipt = buildMissionCompletionReceipt({
    admission: admitted,
    transactionId: handle.transactionId,
    preCompletionJournalHeadDigest: beforeCompletion.headDigest,
    verdict,
    phaseResults: {
      nativeResultDigest: native.result.receipt.resultDigest,
      reviewResultDigests: [reviewOne.result.receipt.resultDigest, reviewTwo.result.receipt.resultDigest],
      revisionResultDigest: revision.result.receipt.resultDigest,
    },
    usage: aggregateUsage([native.result, reviewOne.result, revision.result, reviewTwo.result]),
    completedAt: '2026-08-31T14:00:10.000Z',
  });
  await handle.complete(receipt);

  const terminal = await handle.inspect();
  assert.equal(terminal.status, 'completed');
  assert.equal(terminal.nextAction, 'none');
  assert.equal(terminal.missionReceiptDigest, receipt.receiptDigest);
  assert.equal(terminal.acceptedArtifactDigest, revision.result.receipt.artifactDigest);
  const evidence = await handle.recoverEvidence();
  assert.deepEqual(evidence.terminal, receipt);
  assert.deepEqual(evidence.verdict, verdict);
  assert.equal(evidence.reviews.length, 2);
});

test('revision must address every required first-review finding', async (t) => {
  const { journal } = await fixture(t);
  const admitted = buildReviewAdmission('mission-review-required-findings');
  const handle = await journal.open(admitted);
  const native = completedPhase({
    admitted,
    phase: 'native',
    round: 1,
    inputs: [{ role: 'godskills-package', artifactDigest: admitted.godskills.receipt.packageDigest }],
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'native draft' },
    ordinal: 1,
  });
  await handle.preparePhase(native);
  await handle.commitPhase(native.result);
  await handle.bindReview();
  const review = completedPhase({
    admitted,
    phase: 'review',
    round: 1,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admitted.godskills.bindingDigest },
      { role: 'subject', artifactDigest: native.result.receipt.artifactDigest },
    ],
    artifact: {
      schemaVersion: 1,
      artifactType: 'review',
      subjectDigest: native.result.receipt.artifactDigest,
      recommendation: 'revise',
      findings: [
        { id: 'finding-a', severity: 'important', required: true, message: 'repair a' },
        { id: 'finding-b', severity: 'critical', required: true, message: 'repair b' },
      ],
      summary: 'two repairs required',
    },
    ordinal: 2,
  });
  await handle.preparePhase(review);
  await handle.commitPhase(review.result);
  const incomplete = completedPhase({
    admitted,
    phase: 'revision',
    round: 1,
    inputs: [
      { role: 'native', artifactDigest: native.result.receipt.artifactDigest },
      { role: 'review', artifactDigest: review.result.receipt.artifactDigest },
    ],
    artifact: {
      schemaVersion: 1,
      artifactType: 'revision',
      nativeArtifactDigest: native.result.receipt.artifactDigest,
      reviewArtifactDigest: review.result.receipt.artifactDigest,
      addressedFindingIds: ['finding-a'],
      content: 'incomplete revision',
    },
    ordinal: 3,
  });
  await handle.preparePhase(incomplete);
  await assert.rejects(() => handle.commitPhase(incomplete.result), /required finding|finding-b|address/i);

  const invented = structuredClone(incomplete.result);
  invented.artifact.addressedFindingIds = ['finding-a', 'finding-b', 'finding-invented'];
  const rebuilt = buildMissionPhaseResult({
    request: incomplete.request,
    descriptor: incomplete.descriptor,
    artifact: invented.artifact,
    usage: invented.receipt.usage,
    startedAt: invented.receipt.startedAt,
    completedAt: invented.receipt.completedAt,
  });
  await assert.rejects(() => handle.commitPhase(rebuilt), /unknown|invented|finding/i);
});

test('journal rejects a phase request whose valid digest points at the wrong prior artifact', async (t) => {
  const { journal } = await fixture(t);
  const admitted = buildReviewAdmission('mission-review-input-substitution');
  const handle = await journal.open(admitted);
  const native = completedPhase({
    admitted,
    phase: 'native',
    round: 1,
    inputs: [{ role: 'godskills-package', artifactDigest: admitted.godskills.receipt.packageDigest }],
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'bound native artifact' },
    ordinal: 1,
  });
  await handle.preparePhase(native);
  await handle.commitPhase(native.result);
  await handle.bindReview();

  const descriptor = buildMissionExecutorDescriptor({ executorId: 'journal-review-v1', phase: 'review' });
  const substituted = buildMissionPhaseRequest({
    admission: admitted,
    phase: 'review',
    round: 1,
    descriptor,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admitted.godskills.bindingDigest },
      { role: 'subject', artifactDigest: digest('f') },
    ],
    maxCompletionTokens: admitted.budgets.reviewCompletionTokensPerRound,
  });
  await assert.rejects(
    () => handle.preparePhase({ request: substituted, descriptor }),
    /input|artifact|journal evidence/i,
  );
});
