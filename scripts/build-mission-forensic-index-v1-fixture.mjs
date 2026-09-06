import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
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
import { buildMissionForensicIndex } from '../src/runtime/mission-forensic-index.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = join(root, 'fixtures', 'mission-forensic-index-v1.json');
const fixedTime = '2026-09-05T13:00:00.000Z';
const digest = (value) => sha256Value(String(value));

function missionInput(label) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: `fixture-${label}-agent`,
      identityDigest: digest(`fixture-${label}-identity`),
      genomeDigest: digest(`fixture-${label}-genome`),
      keelHeadDigest: digest(`fixture-${label}-keel`),
    },
    missionDigest: digest(`fixture-${label}-mission`),
    authorityCeilingDigest: digest(`fixture-${label}-authority`),
    budget: { maxCompletionTokens: 200, maxResultBytes: 20_000 },
    steps: [
      { stepId: 'review-step', stepIndex: 0, kind: 'review', inputDigest: digest(`fixture-${label}-review-input`), maxCompletionTokens: 40, maxResultBytes: 8_000 },
      { stepId: 'delegation-step', stepIndex: 1, kind: 'delegation', inputDigest: digest(`fixture-${label}-delegation-input`), maxCompletionTokens: 40, maxResultBytes: 8_000 },
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

function completionFor(dispatch, label) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: dispatch.programId,
    stepId: dispatch.stepId,
    stepIndex: dispatch.stepIndex,
    kind: dispatch.kind,
    dispatchId: dispatch.dispatchId,
    dispatchDigest: dispatch.dispatchDigest,
    resultDigest: digest(`fixture-${label}-${dispatch.kind}-result`),
    resultBytes: 24,
    usage: {
      inputTokens: 12,
      cachedInputTokens: 4,
      reasoningTokens: 6,
      visibleOutputTokens: 4,
      completionTokens: 10,
    },
    startedAt: fixedTime,
    completedAt: fixedTime,
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
  const adapter = await createMissionOperationAdapter({
    operationKind: kind,
    adapterId: `fixture-${label}-${kind}-operation`,
    adapterVersion: '1.0.0',
    sourceDescriptor: descriptor,
    source: {
      descriptor: async () => descriptor,
      reconcile: async ({ request }) => {
        requests.push({ phase: 'reconcile', request });
        return { status: 'absent' };
      },
      execute: async ({ request }) => {
        requests.push({ phase: 'execute', request });
        const dispatch = dispatchFromRequest(request);
        return { status: 'completed', completion: completionFor(dispatch, label) };
      },
    },
  });
  return adapter;
}

function evidenceFor(adapter, requests, label) {
  const description = adapter.describe();
  const request = requests.find(({ phase }) => phase === 'execute').request;
  const dispatch = dispatchFromRequest(request);
  const receipt = buildMissionOperationReceipt({
    description,
    request,
    dispatch,
    outcome: { status: 'completed', completion: completionFor(dispatch, label) },
    sourceEvidenceDigest: digest(`fixture-${label}-${request.operationKind}-source-evidence`),
    recordedAt: fixedTime,
  });
  return { description, request, dispatch, receipt };
}

async function buildProgram(label, lifecycleStatus) {
  const mission = missionInput(label);
  const reviewRequests = [];
  const delegationRequests = [];
  const review = await operationAdapter(label, 'review', reviewRequests);
  const delegation = await operationAdapter(label, 'delegation', delegationRequests);
  const workspace = await mkdtemp(join(tmpdir(), `godagents-index-fixture-${label}-`));
  try {
    const coordinator = await createMissionProgramCoordinator({
      programRoot: join(workspace, 'program'),
      adapters: [delegation, review],
      clock: () => fixedTime,
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
      program: {
        forensics,
        operationEvidence,
        receiptBindings,
        lifecycle: { status: lifecycleStatus, evidenceDigest: digest(`fixture-${label}-${lifecycleStatus}-evidence`) },
      },
      calls: { review: reviewRequests.length, delegation: delegationRequests.length },
      entries,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function buildMissionForensicIndexFixture() {
  const alpha = await buildProgram('alpha', 'recovered');
  const zeta = await buildProgram('zeta', 'failed');
  const programs = [zeta.program, alpha.program];
  const callsBefore = { alpha: alpha.calls, zeta: zeta.calls };
  const index = buildMissionForensicIndex({ programs });
  const callsAfter = { alpha: alpha.calls, zeta: zeta.calls };
  const replay = buildMissionForensicIndex({ programs: [alpha.program, zeta.program] });
  const assertions = {
    deterministicIndex: canonicalJson(index) === canonicalJson(replay),
    sortedPrograms: index.programs[0].programId < index.programs[1].programId,
    bodyFreeIndex: !JSON.stringify(index).includes('fixture-alpha-review-result')
      && !JSON.stringify(index).includes('fixture-zeta-delegation-result'),
    lifecyclePreserved: index.programs.map(({ lifecycleStatus }) => lifecycleStatus).sort().join(',') === 'failed,recovered',
    exactProgramBindings: index.programs.every((program) => program.operations.length === 2
      && program.sourceReceiptBindings.length === 2
      && program.operations.every((operation) => operation.authority.realmEffects === 0)),
    sourceReceiptBindings: index.programs.every((program) => program.operations.every((operation) => program.sourceReceiptBindings.some(
      (binding) => binding.operationReceiptDigest === operation.operationReceiptDigest,
    ))),
    noAdapterCalls: canonicalJson(callsBefore) === canonicalJson(callsAfter),
    crossProgramIsolation: new Set(index.programs.map(({ programId }) => programId)).size === 2,
  };
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-forensic-index-fixture-v1',
    programs,
    index,
    assertions,
  };
  return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
}

async function main() {
  const fixture = await buildMissionForensicIndexFixture();
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({ path: outputPath, fixtureDigest: fixture.fixtureDigest })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
