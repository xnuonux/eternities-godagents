import { mkdtemp, rm } from 'node:fs/promises';
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

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = join(root, 'fixtures', 'mission-operation-evidence-v1.json');
const fixedTime = '2026-09-05T13:00:00.000Z';
const digest = (value) => sha256Value(String(value));

function missionInput() {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'fixture-evidence-agent',
      identityDigest: digest('fixture-evidence-identity'),
      genomeDigest: digest('fixture-evidence-genome'),
      keelHeadDigest: digest('fixture-evidence-keel'),
    },
    missionDigest: digest('fixture-evidence-mission'),
    authorityCeilingDigest: digest('fixture-evidence-authority'),
    budget: { maxCompletionTokens: 200, maxResultBytes: 20_000 },
    steps: [
      { stepId: 'review-step', stepIndex: 0, kind: 'review', inputDigest: digest('fixture-review-input'), maxCompletionTokens: 40, maxResultBytes: 8_000 },
      { stepId: 'delegation-step', stepIndex: 1, kind: 'delegation', inputDigest: digest('fixture-delegation-input'), maxCompletionTokens: 40, maxResultBytes: 8_000 },
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

function completionFor(dispatch) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: dispatch.programId,
    stepId: dispatch.stepId,
    stepIndex: dispatch.stepIndex,
    kind: dispatch.kind,
    dispatchId: dispatch.dispatchId,
    dispatchDigest: dispatch.dispatchDigest,
    resultDigest: digest(`fixture-${dispatch.kind}-result`),
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

async function operationAdapter(kind, programId, requests) {
  const descriptor = sourceDescriptor(kind);
  const source = {
    descriptor: async () => descriptor,
    reconcile: async ({ request }) => {
      requests.push({ phase: 'reconcile', request });
      return { status: 'absent' };
    },
    execute: async ({ request }) => {
      requests.push({ phase: 'execute', request });
      return { status: 'completed', completion: completionFor(dispatchFromRequest(request)) };
    },
  };
  const adapter = await createMissionOperationAdapter({
    operationKind: kind,
    adapterId: `fixture-${kind}-operation`,
    adapterVersion: '1.0.0',
    sourceDescriptor: descriptor,
    source,
  });
  return { adapter, descriptor, requests, programId };
}

function evidenceFor(adapter, requests, disposition = 'completed') {
  const description = adapter.describe();
  const request = requests.find(({ phase }) => phase === 'execute').request;
  const dispatch = dispatchFromRequest(request);
  const outcome = disposition === 'completed'
    ? { status: 'completed', completion: completionFor(dispatch) }
    : { status: disposition };
  const receipt = buildMissionOperationReceipt({
    description,
    request,
    dispatch,
    outcome,
    sourceEvidenceDigest: disposition === 'completed' ? digest(`${request.operationKind}-evidence`) : null,
    recordedAt: fixedTime,
  });
  return { description, request, dispatch, receipt };
}

export async function buildMissionOperationEvidenceFixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'godagents-operation-evidence-fixture-'));
  try {
    const mission = missionInput();
    const reviewRequests = [];
    const delegationRequests = [];
    const review = await operationAdapter('review', mission.programId, reviewRequests);
    const delegation = await operationAdapter('delegation', mission.programId, delegationRequests);
    const coordinator = await createMissionProgramCoordinator({
      programRoot: join(workspace, 'program'),
      adapters: [delegation.adapter, review.adapter],
      clock: () => fixedTime,
    });
    await coordinator.execute(mission);
    const full = await coordinator.forensics(mission.programId);
    const prefix = await coordinator.forensics(mission.programId, { throughSequence: 2 });
    const reviewEvidence = evidenceFor(review.adapter, reviewRequests);
    const delegationEvidence = evidenceFor(delegation.adapter, delegationRequests);
    const prefixEvidence = evidenceFor(review.adapter, reviewRequests, 'pending');
    const callsBefore = { review: reviewRequests.length, delegation: delegationRequests.length };
    const projection = buildMissionOperationEvidenceProjection({
      missionForensics: full,
      entries: [delegationEvidence, reviewEvidence],
    });
    const replay = buildMissionOperationEvidenceProjection({
      missionForensics: full,
      entries: [reviewEvidence, delegationEvidence],
    });
    const prefixProjection = buildMissionOperationEvidenceProjection({
      missionForensics: prefix,
      entries: [prefixEvidence],
    });
    const callsAfter = { review: reviewRequests.length, delegation: delegationRequests.length };
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-mission-operation-evidence-fixture-v1',
      missionForensics: full,
      prefixForensics: prefix,
      entries: [reviewEvidence, delegationEvidence],
      projection,
      prefixProjection,
      assertions: {
        deterministicProjection: canonicalJson(projection) === canonicalJson(replay),
        sortedByStep: projection.entries.map(({ stepIndex }) => stepIndex).join(',') === '0,1',
        bodyFreeProjection: !JSON.stringify(projection).includes('fixture-review-result')
          && !JSON.stringify(projection).includes('fixture-delegation-result'),
        prefixPendingExact: prefixProjection.status === 'pending'
          && prefixProjection.entries[0].journalStatus === 'pending'
          && prefixProjection.entries[0].disposition === 'pending',
        noAdapterCalls: canonicalJson(callsBefore) === canonicalJson(callsAfter),
        authorityEmpty: projection.entries.every(({ authority }) => Object.values(authority).every((value) => value === 0)),
        exactJoin: [reviewEvidence, delegationEvidence].every((entry) => entry.request.programId === mission.programId
          && projection.entries.some((projected) => projected.requestDigest === entry.request.requestDigest)),
      },
    };
    return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await buildMissionOperationEvidenceFixture();
  await import('node:fs/promises').then(({ writeFile }) => writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8'));
  process.stdout.write(`${canonicalJson({ path: outputPath, fixtureDigest: fixture.fixtureDigest })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
