import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  MISSION_OPERATION_RECEIPT_PROTOCOL_ID,
  buildMissionOperationReceipt,
  createMissionOperationAdapter,
  MissionOperationAdapterError,
} from '../src/runtime/mission-operation-adapter.mjs';
import { MISSION_PROGRAM_PROTOCOL_ID, createMissionProgramCoordinator } from '../src/runtime/mission-program.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = join(root, 'fixtures', 'mission-operation-adapter-v1.json');
const fixedTime = '2026-09-05T10:00:00.000Z';
const digest = (value) => sha256Value(String(value));
const clone = (value) => structuredClone(value);

const authority = {
  realmEffects: 0,
  continuityWrites: 0,
  identityMutation: 0,
  evolution: 0,
  soul: 0,
};

function makeMissionInput() {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'fixture-agent',
      identityDigest: digest('fixture-identity'),
      genomeDigest: digest('fixture-genome'),
      keelHeadDigest: digest('fixture-keel'),
    },
    missionDigest: digest('fixture-operation-mission'),
    authorityCeilingDigest: digest('fixture-operation-authority'),
    budget: { maxCompletionTokens: 40, maxResultBytes: 4_096 },
    steps: [{
      stepId: 'review',
      stepIndex: 0,
      kind: 'review',
      inputDigest: digest('fixture-operation-input'),
      maxCompletionTokens: 20,
      maxResultBytes: 2_048,
    }],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

function makeSourceDescriptor() {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-fixture-operation-source-v1',
    sourceKind: 'deterministic-fixture',
    sourceVersion: '1.0.0',
    capabilities: ['body-free-completion'],
  };
}

function makeCompletion(request) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: request.programId,
    stepId: request.stepId,
    stepIndex: request.stepIndex,
    kind: request.operationKind,
    dispatchId: request.dispatchId,
    dispatchDigest: request.dispatchDigest,
    resultDigest: digest(`fixture-operation-result:${request.dispatchId}`),
    resultBytes: 64,
    usage: {
      inputTokens: 8,
      cachedInputTokens: 2,
      reasoningTokens: 4,
      visibleOutputTokens: 3,
      completionTokens: 7,
    },
    startedAt: fixedTime,
    completedAt: fixedTime,
  };
  return { ...unsigned, completionDigest: sha256Value(unsigned) };
}

function makeSource(sourceDescriptor) {
  let liveDescriptor = clone(sourceDescriptor);
  const trace = [];
  const requests = [];
  let executeCount = 0;
  const source = {
    descriptor() {
      trace.push('descriptor');
      return clone(liveDescriptor);
    },
    async reconcile({ request }) {
      trace.push('reconcile');
      requests.push({ method: 'reconcile', request: clone(request), keys: Object.keys(request).sort(), requestDigest: request.requestDigest });
      return { status: 'absent' };
    },
    async execute({ request }) {
      trace.push('execute');
      requests.push({ method: 'execute', request: clone(request), keys: Object.keys(request).sort(), requestDigest: request.requestDigest });
      executeCount += 1;
      return { status: 'completed', completion: makeCompletion(request) };
    },
    drift() {
      liveDescriptor = { ...liveDescriptor, sourceVersion: '9.9.9' };
    },
    trace,
    requests,
    get executeCount() { return executeCount; },
  };
  return source;
}

function buildDispatchFromRequest(request, description) {
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
    descriptorDigest: description.missionStepDescriptor.descriptorDigest,
  };
  return { ...unsigned, dispatchDigest: sha256Value(unsigned) };
}

function stripRecoveryFlag(value) {
  const { recovered, ...stable } = value;
  return stable;
}

export async function buildMissionOperationAdapterFixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'godagents-mission-operation-adapter-'));
  try {
    const sourceDescriptor = makeSourceDescriptor();
    const source = makeSource(sourceDescriptor);
    const adapter = await createMissionOperationAdapter({
      operationKind: 'review',
      adapterId: 'fixture-operation-adapter',
      adapterVersion: '1.0.0',
      sourceDescriptor,
      source,
    });
    const description = adapter.describe();
    const mission = makeMissionInput();
    const coordinator = await createMissionProgramCoordinator({
      programRoot: workspaceRoot,
      adapters: [adapter],
      clock: () => fixedTime,
    });
    const first = await coordinator.execute(mission);
    const inspection = await coordinator.inspect(mission.programId);
    const replay = await coordinator.execute(mission);
    const executeRequest = source.requests.find(({ method }) => method === 'execute');
    const reconcileRequest = source.requests.find(({ method }) => method === 'reconcile');
    assert.ok(executeRequest && reconcileRequest);
    const requestSource = executeRequest.request;
    const dispatch = buildDispatchFromRequest(requestSource, description);
    const receipt = buildMissionOperationReceipt({
      description,
      request: requestSource,
      dispatch,
      outcome: { status: 'completed', completion: makeCompletion(requestSource) },
      sourceEvidenceDigest: digest('fixture-operation-evidence'),
      recordedAt: fixedTime,
    });

    const driftSource = makeSource(sourceDescriptor);
    const driftAdapter = await createMissionOperationAdapter({
      operationKind: 'review',
      adapterId: 'fixture-drift-adapter',
      adapterVersion: '1.0.0',
      sourceDescriptor,
      source: driftSource,
    });
    driftSource.drift();
    const driftDescription = driftAdapter.describe();
    const driftDispatch = buildDispatchFromRequest(requestSource, driftDescription);
    let sourceDriftCode = null;
    try {
      await driftAdapter.reconcile({ dispatch: driftDispatch });
    } catch (error) {
      if (error instanceof MissionOperationAdapterError) sourceDriftCode = error.code;
    }

    const stableFirst = stripRecoveryFlag(first);
    const stableReplay = stripRecoveryFlag(replay);
    const executeTraceIndex = source.trace.indexOf('execute');
    const reconcileTraceIndex = source.trace.indexOf('reconcile');
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-mission-operation-adapter-fixture-v1',
      description,
      request: {
        keys: Object.keys(requestSource).sort(),
        requestDigest: requestSource.requestDigest,
        payloadFree: !Object.hasOwn(requestSource, 'payload'),
      },
      receipt: {
        protocolId: receipt.protocolId,
        disposition: receipt.disposition,
        receiptDigest: receipt.receiptDigest,
      },
      execution: {
        firstStatus: first.status,
        inspectionStatus: inspection.status,
        replayStatus: replay.status,
        sourceTrace: source.trace,
        requestMethods: source.requests.map(({ method }) => method),
        executeCount: source.executeCount,
      },
      assertions: {
        descriptorRevalidated: source.trace.filter((entry) => entry === 'descriptor').length >= 3,
        payloadFreeRequests: source.requests.every(({ keys }) => keys.join(',') === [
          'authority', 'authorityCeilingDigest', 'dispatchDigest', 'dispatchId', 'inputDigest',
          'maxCompletionTokens', 'maxResultBytes', 'missionStepDescriptorDigest', 'operationKind',
          'programId', 'protocolId', 'requestDigest', 'schemaVersion', 'sourceDescriptorDigest',
          'stepId', 'stepIndex',
        ].join(',')),
        reconcileBeforeExecute: reconcileTraceIndex >= 0 && executeTraceIndex > reconcileTraceIndex,
        terminalReplayStable: canonicalJson(stableFirst) === canonicalJson(stableReplay) && source.executeCount === 1,
        sourceDriftCode,
        sourceDriftRejected: sourceDriftCode === 'source-drift',
        sourceDriftSourceCalls: driftSource.requests.length,
        authorityExpansions: Object.values(description.authority).reduce((sum, value) => sum + value, 0),
        adapterOwnedWritesAbsent: !['write', 'lock', 'publish', 'replace'].some((key) => Object.hasOwn(adapter, key)),
        missionProgramReceiptBound: receipt.protocolId === MISSION_OPERATION_RECEIPT_PROTOCOL_ID
          && receipt.disposition === 'completed',
      },
    };
    return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await buildMissionOperationAdapterFixture();
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    path: outputPath,
    fixtureDigest: fixture.fixtureDigest,
    bytes: Buffer.byteLength(`${canonicalJson(fixture)}\n`, 'utf8'),
    status: 'built',
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
