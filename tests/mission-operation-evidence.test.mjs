import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertSchema } from '../src/core/schema-validator.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  MISSION_OPERATION_RECEIPT_PROTOCOL_ID,
  buildMissionOperationReceipt,
  createMissionOperationAdapter,
} from '../src/runtime/mission-operation-adapter.mjs';
import {
  MISSION_PROGRAM_PROTOCOL_ID,
  createMissionProgramCoordinator,
} from '../src/runtime/mission-program.mjs';
import {
  MISSION_OPERATION_EVIDENCE_PROTOCOL_ID,
  buildMissionOperationEvidenceProjection,
} from '../src/runtime/mission-operation-evidence.mjs';

const FIXED_TIME = '2026-09-05T13:00:00.000Z';
const digest = (value) => sha256Value(String(value));

function missionInput() {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'evidence-agent',
      identityDigest: digest('evidence-identity'),
      genomeDigest: digest('evidence-genome'),
      keelHeadDigest: digest('evidence-keel'),
    },
    missionDigest: digest('evidence-mission'),
    authorityCeilingDigest: digest('evidence-authority'),
    budget: { maxCompletionTokens: 200, maxResultBytes: 20_000 },
    steps: [
      { stepId: 'review-step', stepIndex: 0, kind: 'review', inputDigest: digest('review-input'), maxCompletionTokens: 40, maxResultBytes: 8_000 },
      { stepId: 'delegation-step', stepIndex: 1, kind: 'delegation', inputDigest: digest('delegation-input'), maxCompletionTokens: 40, maxResultBytes: 8_000 },
    ],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

function sourceDescriptor(kind) {
  return {
    schemaVersion: 1,
    protocolId: `fixture-${kind}-source-v1`,
    sourceKind: `fixture-${kind}`,
    sourceVersion: '1.0.0',
  };
}

function dispatchFromRequest(request) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: request.programId,
    dispatchId: request.dispatchId,
    stepId: request.stepId,
    stepIndex: request.stepIndex,
    kind: request.operationKind,
    inputDigest: request.inputDigest,
    authorityCeilingDigest: request.authorityCeilingDigest,
    maxCompletionTokens: request.maxCompletionTokens,
    maxResultBytes: request.maxResultBytes,
    descriptorDigest: request.missionStepDescriptorDigest,
  };
  return { ...unsigned, dispatchDigest: sha256Value(unsigned) };
}

function completionFor(dispatch, result = 'completed-result') {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: dispatch.programId,
    stepId: dispatch.stepId,
    stepIndex: dispatch.stepIndex,
    kind: dispatch.kind,
    dispatchId: dispatch.dispatchId,
    dispatchDigest: dispatch.dispatchDigest,
    resultDigest: digest(result),
    resultBytes: 24,
    usage: {
      inputTokens: 12,
      cachedInputTokens: 4,
      reasoningTokens: 6,
      visibleOutputTokens: 4,
      completionTokens: 10,
    },
    startedAt: FIXED_TIME,
    completedAt: FIXED_TIME,
  };
  return { ...unsigned, completionDigest: sha256Value(unsigned) };
}

async function operationAdapter(kind, programId, stepId, stepIndex, requests) {
  const descriptor = sourceDescriptor(kind);
  const completion = (request) => completionFor(dispatchFromRequest(request), `${kind}-result`);
  const source = {
    descriptor: async () => descriptor,
    reconcile: async ({ request }) => {
      requests.push({ request, phase: 'reconcile' });
      return { status: 'absent' };
    },
    execute: async ({ request }) => {
      requests.push({ request, phase: 'execute' });
      return { status: 'completed', completion: completion(request) };
    },
  };
  return createMissionOperationAdapter({
    operationKind: kind,
    adapterId: `fixture-${kind}-operation`,
    adapterVersion: '1.0.0',
    sourceDescriptor: descriptor,
    source,
  }).then((adapter) => ({ adapter, sourceDescriptor: descriptor, requests }));
}

function evidenceFor(adapter, requests, recordedAt = FIXED_TIME) {
  const description = adapter.describe();
  const request = requests.find(({ phase }) => phase === 'execute').request;
  const dispatch = dispatchFromRequest(request);
  const completion = completionFor(dispatch, `${request.operationKind}-result`);
  const outcome = { status: 'completed', completion };
  const receipt = buildMissionOperationReceipt({
    description,
    request,
    dispatch,
    outcome,
    sourceEvidenceDigest: digest(`${request.operationKind}-source-evidence`),
    recordedAt,
  });
  return { description, request, dispatch, receipt };
}

async function setup() {
  const mission = missionInput();
  const reviewRequests = [];
  const delegationRequests = [];
  const review = await operationAdapter('review', mission.programId, 'review-step', 0, reviewRequests);
  const delegation = await operationAdapter('delegation', mission.programId, 'delegation-step', 1, delegationRequests);
  const root = await mkdtemp(join(tmpdir(), 'godagents-evidence-'));
  const coordinator = await createMissionProgramCoordinator({
    programRoot: root,
    adapters: [delegation.adapter, review.adapter],
    clock: () => FIXED_TIME,
  });
  await coordinator.execute(mission);
  return {
    root,
    mission,
    coordinator,
    review,
    delegation,
    reviewEvidence: evidenceFor(review.adapter, reviewRequests),
    delegationEvidence: evidenceFor(delegation.adapter, delegationRequests),
  };
}

test('builds a deterministic body-free operation evidence projection', async () => {
  const { root, mission, coordinator, reviewEvidence, delegationEvidence } = await setup();
  try {
    const forensics = await coordinator.forensics(mission.programId);
    const first = buildMissionOperationEvidenceProjection({
      missionForensics: forensics,
      entries: [delegationEvidence, reviewEvidence],
    });
    const second = buildMissionOperationEvidenceProjection({
      missionForensics: forensics,
      entries: [reviewEvidence, delegationEvidence],
    });

    assertSchema('mission-operation-evidence', first);
    assert.deepEqual(second, first);
    assert.equal(first.protocolId, MISSION_OPERATION_EVIDENCE_PROTOCOL_ID);
    assert.equal(first.programId, mission.programId);
    assert.equal(first.entries.length, 2);
    assert.deepEqual(first.entries.map(({ stepId }) => stepId), ['review-step', 'delegation-step']);
    assert.equal(first.entries.every(({ authority }) => authority.realmEffects === 0), true);
    assert.equal(JSON.stringify(first).includes('completed-result'), false);
    assert.equal(JSON.stringify(first).includes(MISSION_OPERATION_RECEIPT_PROTOCOL_ID), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('joins a pending operation without disclosing a later journal prefix', async () => {
  const { root, mission, coordinator, reviewEvidence, delegationEvidence } = await setup();
  try {
    const prepared = await coordinator.forensics(mission.programId, { throughSequence: 2 });
    const pendingReceipt = {
      ...reviewEvidence,
      receipt: buildMissionOperationReceipt({
        description: reviewEvidence.description,
        request: reviewEvidence.request,
        dispatch: reviewEvidence.dispatch,
        outcome: { status: 'pending' },
        recordedAt: FIXED_TIME,
      }),
    };
    const projection = buildMissionOperationEvidenceProjection({
      missionForensics: prepared,
      entries: [pendingReceipt],
    });
    assert.equal(projection.entries[0].journalStatus, 'pending');
    assert.equal(projection.entries[0].disposition, 'pending');
    assert.throws(
      () => buildMissionOperationEvidenceProjection({ missionForensics: prepared, entries: [delegationEvidence] }),
      /future|prepared|sequence|present/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects duplicate, unknown, drifted, credential-shaped, and authority-bearing entries', async () => {
  const { root, mission, coordinator, reviewEvidence } = await setup();
  try {
    const forensics = await coordinator.forensics(mission.programId);
    assert.throws(
      () => buildMissionOperationEvidenceProjection({ missionForensics: forensics, entries: [reviewEvidence, reviewEvidence] }),
      /duplicate/i,
    );
    const unknown = structuredClone(reviewEvidence);
    unknown.request = { ...unknown.request, stepId: 'unknown-step' };
    assert.throws(
      () => buildMissionOperationEvidenceProjection({ missionForensics: forensics, entries: [unknown] }),
      (error) => /bound/.test(error.cause?.message ?? ''),
    );
    const drifted = structuredClone(reviewEvidence);
    drifted.receipt = { ...drifted.receipt, sourceEvidenceDigest: digest('drifted') };
    assert.throws(
      () => buildMissionOperationEvidenceProjection({ missionForensics: forensics, entries: [drifted] }),
      (error) => error.cause?.code === 'receipt-digest',
    );
    const credential = structuredClone(reviewEvidence);
    credential.description.apiKey = 'secret-shaped';
    assert.throws(
      () => buildMissionOperationEvidenceProjection({ missionForensics: forensics, entries: [credential] }),
      (error) => error.code === 'credential-field',
    );
    const authority = structuredClone(reviewEvidence);
    authority.description.authority = { ...authority.description.authority, realmEffects: 1 };
    assert.throws(
      () => buildMissionOperationEvidenceProjection({ missionForensics: forensics, entries: [authority] }),
      (error) => error.cause?.code === 'description-invalid',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
