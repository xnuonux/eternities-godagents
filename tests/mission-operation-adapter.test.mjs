import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import {
  MISSION_OPERATION_ADAPTER_PROTOCOL_ID,
  MISSION_OPERATION_RECEIPT_PROTOCOL_ID,
  MISSION_OPERATION_REQUEST_PROTOCOL_ID,
  MissionOperationAdapterError,
  buildMissionOperationReceipt,
  buildMissionOperationRequest,
  createMissionOperationAdapter,
  verifyMissionOperationDescription,
  verifyMissionOperationReceipt,
  verifyMissionOperationRequest,
} from '../src/runtime/mission-operation-adapter.mjs';
import { MISSION_PROGRAM_PROTOCOL_ID } from '../src/runtime/mission-program.mjs';

const fixedTime = '2026-09-05T10:00:00.000Z';
const digest = (value) => sha256Value(String(value));

function sourceDescriptor(overrides = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-fixture-operation-v1',
    sourceId: 'fixture-operation',
    sourceVersion: '1.0.0',
    capabilities: ['reconcile', 'execute'],
    ...overrides,
  };
  return { ...unsigned, descriptorDigest: sha256Value(unsigned) };
}

function missionInput({ operationKind = 'review', maxCompletionTokens = 40, maxResultBytes = 8_000 } = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'instance-1',
      identityDigest: digest('identity'),
      genomeDigest: digest('genome'),
      keelHeadDigest: digest('keel'),
    },
    missionDigest: digest('mission'),
    authorityCeilingDigest: digest('authority'),
    budget: { maxCompletionTokens, maxResultBytes },
    steps: [{
      stepId: 'operation-step',
      stepIndex: 0,
      kind: operationKind,
      inputDigest: digest('input'),
      maxCompletionTokens,
      maxResultBytes,
    }],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

function completionFromRequest(request, overrides = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: request.programId,
    stepId: request.stepId,
    stepIndex: request.stepIndex,
    kind: request.operationKind,
    dispatchId: request.dispatchId,
    dispatchDigest: request.dispatchDigest,
    resultDigest: digest(`result:${request.dispatchId}`),
    resultBytes: 120,
    usage: {
      inputTokens: 12,
      cachedInputTokens: 4,
      reasoningTokens: 6,
      visibleOutputTokens: 4,
      completionTokens: 10,
    },
    startedAt: fixedTime,
    completedAt: fixedTime,
    ...overrides,
  };
  return { ...unsigned, completionDigest: sha256Value(unsigned) };
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

function makeSource({ descriptor = sourceDescriptor(), reconcile, execute } = {}) {
  const calls = [];
  let liveDescriptor = descriptor;
  const source = {
    descriptor: async () => structuredClone(liveDescriptor),
    reconcile: async ({ request }) => {
      calls.push({ method: 'reconcile', request: structuredClone(request) });
      return reconcile ? reconcile(request) : { status: 'absent' };
    },
    execute: async ({ request }) => {
      calls.push({ method: 'execute', request: structuredClone(request) });
      return execute ? execute(request) : { status: 'completed', completion: completionFromRequest(request) };
    },
    calls,
    setDescriptor(value) {
      liveDescriptor = value;
    },
  };
  return source;
}

async function makeAdapter(options = {}) {
  const source = options.source ?? makeSource();
  const adapter = await createMissionOperationAdapter({
    operationKind: options.operationKind ?? 'review',
    adapterId: options.adapterId ?? 'fixture-bound-operation',
    adapterVersion: options.adapterVersion ?? '1.0.0',
    sourceDescriptor: options.sourceDescriptor ?? sourceDescriptor(),
    source,
  });
  return { adapter, source };
}

test('description is exact, frozen, and binds the source descriptor to the mission step', async () => {
  const { adapter } = await makeAdapter();
  const description = adapter.describe();

  assert.equal(description.protocolId, MISSION_OPERATION_ADAPTER_PROTOCOL_ID);
  assert.equal(description.operationKind, 'review');
  assert.equal(description.sourceDescriptorDigest, sha256Value(sourceDescriptor()));
  assert.equal(description.missionStepDescriptor.protocolId, 'eternities-mission-program-step-adapter-v1');
  assert.equal(description.missionStepDescriptor.adapterId.endsWith(description.sourceDescriptorDigest), true);
  assert.equal(description.authority.realmEffects, 0);
  assert.equal(description.authority.continuityWrites, 0);
  assert.equal(Object.isFrozen(description), true);
  assert.equal(Object.isFrozen(description.missionStepDescriptor), true);
  assert.deepEqual(verifyMissionOperationDescription(description), description);
});

test('adapter crosses the mission-program boundary with a minimized request and exact call order', async () => {
  const { adapter, source } = await makeAdapter();
  const input = missionInput();
  const { createMissionProgramCoordinator } = await import('../src/runtime/mission-program.mjs');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: await (async () => {
      const { mkdtemp } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      return mkdtemp(join(tmpdir(), 'mission-operation-adapter-'));
    })(),
    adapters: [adapter],
    clock: () => fixedTime,
  });

  const result = await coordinator.execute(input);

  assert.equal(result.status, 'completed');
  assert.deepEqual(source.calls.map(({ method }) => method), ['reconcile', 'execute']);
  const request = source.calls[0].request;
  assert.deepEqual(Object.keys(request).sort(), [
    'authority', 'authorityCeilingDigest', 'dispatchDigest', 'dispatchId',
    'inputDigest', 'maxCompletionTokens', 'maxResultBytes', 'missionStepDescriptorDigest',
    'operationKind', 'programId', 'protocolId', 'schemaVersion', 'sourceDescriptorDigest',
    'stepId', 'stepIndex', 'requestDigest',
  ].sort());
  assert.equal(Object.hasOwn(request, 'dispatch'), false);
  assert.equal(Object.hasOwn(request, 'input'), false);
  assert.deepEqual(request.authority, {
    realmEffects: 0,
    continuityWrites: 0,
    identityMutation: 0,
    evolution: 0,
    soul: 0,
  });
  assert.equal(request.protocolId, MISSION_OPERATION_REQUEST_PROTOCOL_ID);
  assert.deepEqual(source.calls[0].request, source.calls[1].request);
});

test('pending source work remains pending and is never executed by the adapter', async () => {
  const source = makeSource({ reconcile: () => ({ status: 'pending' }) });
  const { adapter } = await makeAdapter({ source });
  const { createMissionProgramCoordinator } = await import('../src/runtime/mission-program.mjs');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: await mkdtemp(join(tmpdir(), 'mission-operation-pending-')),
    adapters: [adapter],
    clock: () => fixedTime,
  });

  const result = await coordinator.execute(missionInput());

  assert.equal(result.status, 'pending');
  assert.deepEqual(source.calls.map(({ method }) => method), ['reconcile']);
});

test('source descriptor drift fails closed before reconcile or execute', async () => {
  const source = makeSource();
  const { adapter } = await makeAdapter({ source });
  const { createMissionProgramCoordinator } = await import('../src/runtime/mission-program.mjs');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: await mkdtemp(join(tmpdir(), 'mission-operation-drift-')),
    adapters: [adapter],
    clock: () => fixedTime,
  });
  const changed = sourceDescriptor({ sourceVersion: '2.0.0' });
  source.setDescriptor(changed);

  await assert.rejects(
    () => coordinator.execute(missionInput()),
    (error) => error.cause instanceof MissionOperationAdapterError && error.cause.code === 'source-drift',
  );
  assert.deepEqual(source.calls, []);
});

test('malformed or expanded source outcomes fail before mission-program publication', async () => {
  const source = makeSource({
    reconcile: () => ({ status: 'completed', completion: {}, extra: 'forbidden' }),
  });
  const { adapter } = await makeAdapter({ source });
  const { createMissionProgramCoordinator } = await import('../src/runtime/mission-program.mjs');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: await mkdtemp(join(tmpdir(), 'mission-operation-outcome-')),
    adapters: [adapter],
    clock: () => fixedTime,
  });

  await assert.rejects(
    () => coordinator.execute(missionInput()),
    (error) => error.cause instanceof MissionOperationAdapterError && error.cause.code === 'fields-invalid',
  );
});

test('completion binding and ceilings are verified at the adapter boundary', async () => {
  let capturedRequest;
  const source = makeSource({
    execute: (request) => {
      capturedRequest = request;
      return {
        status: 'completed',
        completion: completionFromRequest(request, {
          resultBytes: 9_000,
          usage: {
            inputTokens: 12,
            cachedInputTokens: 4,
            reasoningTokens: 30,
            visibleOutputTokens: 20,
            completionTokens: 50,
          },
        }),
      };
    },
  });
  const { adapter } = await makeAdapter({ source });
  const { createMissionProgramCoordinator } = await import('../src/runtime/mission-program.mjs');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: await mkdtemp(join(tmpdir(), 'mission-operation-ceiling-')),
    adapters: [adapter],
    clock: () => fixedTime,
  });

  await assert.rejects(
    () => coordinator.execute(missionInput()),
    (error) => error.cause instanceof MissionOperationAdapterError && error.cause.code === 'integer-invalid',
  );
  assert.ok(capturedRequest);
});

test('credential-shaped source metadata and outcomes are rejected', async () => {
  await assert.rejects(
    () => makeAdapter({ sourceDescriptor: sourceDescriptor({ credential: 'canary' }) }),
    /credential|source descriptor/i,
  );

  const source = makeSource({ execute: () => ({ status: 'pending', headers: { authorization: 'canary' } }) });
  const { adapter } = await makeAdapter({ source });
  const { createMissionProgramCoordinator } = await import('../src/runtime/mission-program.mjs');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: await mkdtemp(join(tmpdir(), 'mission-operation-credential-')),
    adapters: [adapter],
    clock: () => fixedTime,
  });
  await assert.rejects(
    () => coordinator.execute(missionInput()),
    (error) => error.cause instanceof MissionOperationAdapterError && error.cause.code === 'credential-field',
  );
});

test('request and compact receipt verify exactly and reject tampering', async () => {
  const { adapter } = await makeAdapter();
  const description = adapter.describe();
  const dispatch = dispatchFromRequest({
    programId: digest('program'),
    dispatchId: digest('dispatch'),
    stepId: 'operation-step',
    stepIndex: 0,
    operationKind: 'review',
    inputDigest: digest('input'),
    authorityCeilingDigest: digest('authority'),
    maxCompletionTokens: 40,
    maxResultBytes: 8_000,
    missionStepDescriptorDigest: description.missionStepDescriptor.descriptorDigest,
  });
  const request = buildMissionOperationRequest({ description, dispatch });
  assert.deepEqual(verifyMissionOperationRequest(request, { description, dispatch }), request);
  const outcome = { status: 'completed', completion: completionFromRequest(request) };
  const receipt = buildMissionOperationReceipt({
    description,
    request,
    dispatch,
    outcome,
    sourceEvidenceDigest: digest('source-evidence'),
    recordedAt: fixedTime,
  });
  assert.equal(receipt.protocolId, MISSION_OPERATION_RECEIPT_PROTOCOL_ID);
  assert.deepEqual(verifyMissionOperationReceipt(receipt, { description, request, dispatch }), receipt);
  assert.throws(
    () => verifyMissionOperationReceipt({ ...receipt, requestDigest: digest('tampered') }, {
      description,
      request,
      dispatch,
    }),
    /receipt|digest|binding/i,
  );
  assert.equal(canonicalJson(receipt).includes('source-evidence'), false);
});

test('raw adapter schemas reject malformed digests, identifiers, nullable values, and timestamps', async () => {
  const { adapter } = await makeAdapter();
  const description = adapter.describe();
  const dispatch = dispatchFromRequest({
    programId: digest('schema-program'),
    dispatchId: digest('schema-dispatch'),
    stepId: 'operation-step',
    stepIndex: 0,
    operationKind: 'review',
    inputDigest: digest('schema-input'),
    authorityCeilingDigest: digest('schema-authority'),
    maxCompletionTokens: 40,
    maxResultBytes: 8_000,
    missionStepDescriptorDigest: description.missionStepDescriptor.descriptorDigest,
  });
  const request = buildMissionOperationRequest({ description, dispatch });
  const receipt = buildMissionOperationReceipt({
    description,
    request,
    dispatch,
    outcome: { status: 'completed', completion: completionFromRequest(request) },
    sourceEvidenceDigest: digest('schema-evidence'),
    recordedAt: fixedTime,
  });

  assert.doesNotThrow(() => assertSchema('mission-operation-adapter', description));
  assert.doesNotThrow(() => assertSchema('mission-operation-request', request));
  assert.doesNotThrow(() => assertSchema('mission-operation-receipt', receipt));
  assert.throws(
    () => assertSchema('mission-operation-adapter', { ...description, operationKind: '!' }),
    /pattern/i,
  );
  assert.throws(
    () => assertSchema('mission-operation-adapter', { ...description, sourceDescriptorDigest: 'x'.repeat(64) }),
    /pattern/i,
  );
  assert.throws(
    () => assertSchema('mission-operation-request', { ...request, dispatchDigest: 'x'.repeat(64) }),
    /pattern/i,
  );
  assert.throws(
    () => assertSchema('mission-operation-receipt', { ...receipt, completionDigest: {} }),
    /oneOf/i,
  );
  assert.throws(
    () => assertSchema('mission-operation-receipt', { ...receipt, sourceEvidenceDigest: { credential: 'canary' } }),
    /oneOf/i,
  );
  assert.throws(
    () => assertSchema('mission-operation-receipt', { ...receipt, recordedAt: 'not-a-time' }),
    /pattern/i,
  );
});
