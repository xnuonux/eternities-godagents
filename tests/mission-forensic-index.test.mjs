import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertSchema } from '../src/core/schema-validator.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionOperationReceipt,
  createMissionOperationAdapter,
} from '../src/runtime/mission-operation-adapter.mjs';
import {
  MISSION_PROGRAM_PROTOCOL_ID,
  createMissionProgramCoordinator,
} from '../src/runtime/mission-program.mjs';
import { buildMissionOperationEvidenceProjection } from '../src/runtime/mission-operation-evidence.mjs';
import {
  MISSION_FORENSIC_INDEX_PROTOCOL_ID,
  buildMissionForensicIndex,
  verifyMissionForensicIndex,
} from '../src/runtime/mission-forensic-index.mjs';

const FIXED_TIME = '2026-09-05T13:00:00.000Z';
const digest = (value) => sha256Value(String(value));

function missionInput(label) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: `${label}-agent`,
      identityDigest: digest(`${label}-identity`),
      genomeDigest: digest(`${label}-genome`),
      keelHeadDigest: digest(`${label}-keel`),
    },
    missionDigest: digest(`${label}-mission`),
    authorityCeilingDigest: digest(`${label}-authority`),
    budget: { maxCompletionTokens: 200, maxResultBytes: 20_000 },
    steps: [
      { stepId: 'review-step', stepIndex: 0, kind: 'review', inputDigest: digest(`${label}-review-input`), maxCompletionTokens: 40, maxResultBytes: 8_000 },
      { stepId: 'delegation-step', stepIndex: 1, kind: 'delegation', inputDigest: digest(`${label}-delegation-input`), maxCompletionTokens: 40, maxResultBytes: 8_000 },
    ],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
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

function completionFor(dispatch, result) {
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

async function operationAdapter(label, kind, requests) {
  const descriptor = {
    schemaVersion: 1,
    protocolId: `fixture-${label}-${kind}-source-v1`,
    sourceKind: `fixture-${label}-${kind}`,
    sourceVersion: '1.0.0',
  };
  return createMissionOperationAdapter({
    operationKind: kind,
    adapterId: `fixture-${label}-${kind}-operation`,
    adapterVersion: '1.0.0',
    sourceDescriptor: descriptor,
    source: {
      descriptor: async () => descriptor,
      reconcile: async ({ request }) => {
        requests.push({ request, phase: 'reconcile' });
        return { status: 'absent' };
      },
      execute: async ({ request }) => {
        requests.push({ request, phase: 'execute' });
        const dispatch = dispatchFromRequest(request);
        return {
          status: 'completed',
          completion: completionFor(dispatch, `${label}-${kind}-result`),
        };
      },
    },
  });
}

function evidenceFor(adapter, requests, label) {
  const description = adapter.describe();
  const request = requests.find(({ phase }) => phase === 'execute').request;
  const dispatch = dispatchFromRequest(request);
  const receipt = buildMissionOperationReceipt({
    description,
    request,
    dispatch,
    outcome: { status: 'completed', completion: completionFor(dispatch, `${label}-${request.operationKind}-result`) },
    sourceEvidenceDigest: digest(`${label}-${request.operationKind}-source-evidence`),
    recordedAt: FIXED_TIME,
  });
  return { description, request, dispatch, receipt };
}

async function setup(label) {
  const mission = missionInput(label);
  const reviewRequests = [];
  const delegationRequests = [];
  const review = await operationAdapter(label, 'review', reviewRequests);
  const delegation = await operationAdapter(label, 'delegation', delegationRequests);
  const root = await mkdtemp(join(tmpdir(), `godagents-index-${label}-`));
  const coordinator = await createMissionProgramCoordinator({
    programRoot: root,
    adapters: [delegation, review],
    clock: () => FIXED_TIME,
  });
  await coordinator.execute(mission);
  const forensics = await coordinator.forensics(mission.programId);
  const entries = [
    evidenceFor(review, reviewRequests, label),
    evidenceFor(delegation, delegationRequests, label),
  ];
  const operationEvidence = buildMissionOperationEvidenceProjection({
    missionForensics: forensics,
    entries,
  });
  const receiptBindings = operationEvidence.entries.map((entry) => ({
    operationReceiptDigest: entry.operationReceiptDigest,
    disposition: entry.disposition,
    completionDigest: entry.completionDigest,
    sourceEvidenceDigest: entry.sourceEvidenceDigest,
  }));
  return {
    root,
    async futureRecord() {
      const prefixForensics = await coordinator.forensics(mission.programId, { throughSequence: 2 });
      return {
        forensics: prefixForensics,
        operationEvidence,
        receiptBindings,
        lifecycle: { status: 'completed', evidenceDigest: null },
      };
    },
    record(lifecycleStatus, evidenceDigest = null) {
      return {
        forensics,
        operationEvidence,
        receiptBindings,
        lifecycle: { status: lifecycleStatus, evidenceDigest },
      };
    },
  };
}

test('builds a deterministic multi-program body-free forensic index', async () => {
  const alpha = await setup('alpha');
  const zeta = await setup('zeta');
  try {
    const first = buildMissionForensicIndex({
      programs: [zeta.record('failed', digest('zeta-failure')), alpha.record('recovered', digest('alpha-recovery'))],
    });
    const second = buildMissionForensicIndex({
      programs: [alpha.record('recovered', digest('alpha-recovery')), zeta.record('failed', digest('zeta-failure'))],
    });

    assertSchema('mission-forensic-index', first);
    assert.deepEqual(first, second);
    assert.equal(first.protocolId, MISSION_FORENSIC_INDEX_PROTOCOL_ID);
    assert.equal(first.programCount, 2);
    assert.deepEqual(first.programs.map(({ programId }) => programId), [...first.programs].map(({ programId }) => programId).sort());
    assert.deepEqual(first.programs.map(({ lifecycleStatus }) => lifecycleStatus).sort(), ['failed', 'recovered']);
    assert.equal(first.programs.every(({ operations }) => operations.length === 2), true);
    assert.equal(JSON.stringify(first).includes('alpha-review-result'), false);
    assert.equal(JSON.stringify(first).includes('fixture-alpha'), false);
    assert.equal(JSON.stringify(first).includes('eternities-mission-operation-receipt-v1'), false);
    verifyMissionForensicIndex(first);
  } finally {
    await Promise.all([rm(alpha.root, { recursive: true, force: true }), rm(zeta.root, { recursive: true, force: true })]);
  }
});

test('rejects duplicate programs, projection drift, receipt drift, future prefixes, and credentials', async () => {
  const alpha = await setup('alpha-rejections');
  try {
    const record = alpha.record('completed');
    assert.throws(
      () => buildMissionForensicIndex({ programs: [record, record] }),
      /duplicate/i,
    );
    const projectionDrift = structuredClone(record);
    projectionDrift.operationEvidence.missionProjectionDigest = digest('wrong-projection');
    assert.throws(
      () => buildMissionForensicIndex({ programs: [projectionDrift, record] }),
      /projection|binding|digest/i,
    );
    const receiptDrift = structuredClone(record);
    receiptDrift.receiptBindings[0].completionDigest = digest('wrong-receipt');
    assert.throws(
      () => buildMissionForensicIndex({ programs: [receiptDrift, record] }),
      /receipt|binding|drift/i,
    );
    const credentialed = structuredClone(record);
    credentialed.apiKey = 'secret-shaped';
    assert.throws(
      () => buildMissionForensicIndex({ programs: [credentialed, record] }),
      /credential|fields/i,
    );
    const future = await alpha.futureRecord();
    assert.throws(
      () => buildMissionForensicIndex({ programs: [future, record] }),
      /future|projection|prefix|sequence/i,
    );
    const authorityBearing = structuredClone(record);
    authorityBearing.operationEvidence.entries[0].authority.realmEffects = 1;
    assert.throws(
      () => buildMissionForensicIndex({ programs: [authorityBearing, record] }),
      /authority|projection|digest/i,
    );
  } finally {
    await rm(alpha.root, { recursive: true, force: true });
  }
});
