import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import {
  assertBoundedDelegationCoordinator,
  BOUNDED_DELEGATION_COMPLETION_PROTOCOL_ID,
} from './bounded-delegation.mjs';
import {
  createMissionOperationAdapter,
  MISSION_OPERATION_AUTHORITY,
} from './mission-operation-adapter.mjs';
import { MISSION_PROGRAM_PROTOCOL_ID } from './mission-program.mjs';

export const DELEGATION_MISSION_OPERATION_SOURCE_PROTOCOL_ID =
  'eternities-bounded-delegation-mission-operation-source-v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SOURCE_KIND = 'bounded-delegation-coordinator';
const SOURCE_VERSION = '1.0.0';

export class DelegationMissionOperationAdapterError extends Error {
  constructor(code, message, cause = undefined) {
    super(message);
    this.name = 'DelegationMissionOperationAdapterError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

const clone = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(code, message, cause = undefined) {
  throw new DelegationMissionOperationAdapterError(code, message, cause);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    fail('shape-invalid', `${label} fields are invalid`);
  }
}

function safeClone(value, label) {
  try {
    return clone(value);
  } catch (error) {
    fail('non-serializable', `${label} is not serializable`, error);
  }
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} is invalid`);
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('identifier-invalid', `${label} is invalid`);
}

function integer(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail('integer-invalid', `${label} is invalid`);
}

function clockTime(clock) {
  const value = clock();
  const milliseconds = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail('clock-invalid', 'delegation operation clock is invalid');
  return new Date(milliseconds).toISOString();
}

function verifySourceDescriptor(input) {
  const value = safeClone(input, 'delegation operation source descriptor');
  try {
    assertNoCredentialFields(value);
  } catch (error) {
    fail('credential-shaped', 'delegation operation source descriptor contains a forbidden field', error);
  }
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'sourceKind', 'sourceVersion',
    'delegationId', 'delegationInputDigest', 'delegationAuthorityDigest',
    'workerSetDigest', 'workerIds', 'workerCount', 'maxCompletionTokens',
    'maxResultBytes', 'missionAuthorityCeilingDigest',
  ], 'delegation operation source descriptor');
  if (value.schemaVersion !== 1
      || value.protocolId !== DELEGATION_MISSION_OPERATION_SOURCE_PROTOCOL_ID
      || value.sourceKind !== SOURCE_KIND
      || value.sourceVersion !== SOURCE_VERSION) {
    fail('source-identity', 'delegation operation source descriptor identity is invalid');
  }
  for (const [key, label] of [
    ['delegationId', 'delegation id'],
    ['delegationInputDigest', 'delegation input'],
    ['delegationAuthorityDigest', 'delegation authority'],
    ['workerSetDigest', 'worker set'],
    ['missionAuthorityCeilingDigest', 'mission authority ceiling'],
  ]) digest(value[key], label);
  if (!Array.isArray(value.workerIds) || value.workerIds.length < 1 || value.workerIds.length > 3
      || value.workerIds.some((workerId) => typeof workerId !== 'string' || !IDENTIFIER.test(workerId))
      || !same(value.workerIds, [...value.workerIds].sort())
      || new Set(value.workerIds).size !== value.workerIds.length
      || value.workerCount !== value.workerIds.length) {
    fail('worker-set', 'delegation operation worker set is invalid');
  }
  integer(value.maxCompletionTokens, 'delegation completion ceiling', 100_000);
  integer(value.maxResultBytes, 'delegation result ceiling', 1_048_576);
  return deepFreeze(value);
}

function sourceDescriptorFor(coordinator, delegationInput, missionAuthorityCeilingDigest) {
  let description;
  try {
    description = coordinator.describe(delegationInput);
  } catch (error) {
    throw error;
  }
  const value = {
    schemaVersion: 1,
    protocolId: DELEGATION_MISSION_OPERATION_SOURCE_PROTOCOL_ID,
    sourceKind: SOURCE_KIND,
    sourceVersion: SOURCE_VERSION,
    delegationId: description.delegationId,
    delegationInputDigest: description.inputDigest,
    delegationAuthorityDigest: description.authorityDigest,
    workerSetDigest: description.workerSetDigest,
    workerIds: description.workerIds,
    workerCount: description.workerCount,
    maxCompletionTokens: description.maxCompletionTokens,
    maxResultBytes: description.maxResultBytes,
    missionAuthorityCeilingDigest,
  };
  return verifySourceDescriptor(value);
}

function verifyOperationRequest(request, source) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    fail('request-invalid', 'delegation operation request is invalid');
  }
  if (request.inputDigest !== source.delegationInputDigest
      || request.authorityCeilingDigest !== source.missionAuthorityCeilingDigest
      || request.maxCompletionTokens !== source.maxCompletionTokens
      || request.maxResultBytes !== source.maxResultBytes) {
    fail('request-binding', 'delegation operation request is not bound to the source');
  }
}

function usageProjection(value) {
  exactKeys(value, [
    'inputTokens', 'cachedInputTokens', 'reasoningTokens',
    'visibleOutputTokens', 'completionTokens',
  ], 'delegation aggregate usage');
  for (const key of Object.keys(value)) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail('usage-invalid', 'delegation aggregate usage is invalid');
  }
  if (value.cachedInputTokens > value.inputTokens
      || value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens) {
    fail('usage-invalid', 'delegation aggregate usage is incoherent');
  }
  return safeClone(value, 'delegation aggregate usage');
}

function projectCompletion(result, dispatch, source, clock) {
  if (!result || result.status !== 'completed') fail('result-invalid', 'delegation source did not complete');
  exactKeys(result, ['status', 'delegationId', 'aggregateDigest', 'results', 'usage', 'recovered'], 'delegation source result');
  if (result.delegationId !== source.delegationId) fail('result-binding', 'delegation result identity mismatch');
  digest(result.aggregateDigest, 'delegation aggregate digest');
  if (!Array.isArray(result.results)
      || !same(result.results.map(({ workerId }) => workerId), source.workerIds)) {
    fail('result-binding', 'delegation result worker order mismatch');
  }
  const projection = {
    schemaVersion: 1,
    protocolId: BOUNDED_DELEGATION_COMPLETION_PROTOCOL_ID,
    delegationId: result.delegationId,
    aggregateDigest: result.aggregateDigest,
    workerIds: [...source.workerIds],
    usage: usageProjection(result.usage),
  };
  const resultDigest = sha256Value(projection);
  const resultBytes = Buffer.byteLength(canonicalJson(projection), 'utf8');
  if (resultBytes > dispatch.maxResultBytes) fail('result-ceiling', 'delegation projection exceeds the mission result ceiling');
  const now = clockTime(clock);
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: dispatch.programId,
    stepId: dispatch.stepId,
    stepIndex: dispatch.stepIndex,
    kind: dispatch.kind ?? dispatch.operationKind,
    dispatchId: dispatch.dispatchId,
    dispatchDigest: dispatch.dispatchDigest,
    resultDigest,
    resultBytes,
    usage: projection.usage,
    startedAt: now,
    completedAt: now,
  };
  return {
    status: 'completed',
    completion: { ...unsigned, completionDigest: sha256Value(unsigned) },
  };
}

export async function createDelegationMissionOperationAdapter({
  coordinator,
  delegationInput,
  programId,
  stepId,
  stepIndex,
  authorityCeilingDigest,
  maxCompletionTokens,
  maxResultBytes,
  clock = Date.now,
} = {}) {
  const options = arguments[0] ?? {};
  const allowed = [
    'coordinator', 'delegationInput', 'programId', 'stepId', 'stepIndex',
    'authorityCeilingDigest', 'maxCompletionTokens', 'maxResultBytes', 'clock',
  ];
  if (Object.keys(options).some((key) => !allowed.includes(key))) {
    throw new TypeError('delegation mission operation adapter options are invalid');
  }
  assertBoundedDelegationCoordinator(coordinator);
  if (typeof coordinator.describe !== 'function') throw new TypeError('bounded delegation coordinator lacks description support');
  if (typeof clock !== 'function') throw new TypeError('delegation operation clock is required');
  digest(authorityCeilingDigest, 'mission authority ceiling');
  integer(maxCompletionTokens, 'mission completion ceiling', 100_000);
  integer(maxResultBytes, 'mission result ceiling', 16_777_216);
  const frozenInput = deepFreeze(safeClone(delegationInput, 'delegation input'));
  const initialSource = sourceDescriptorFor(coordinator, frozenInput, authorityCeilingDigest);
  if (initialSource.maxCompletionTokens !== maxCompletionTokens
      || initialSource.maxResultBytes !== maxResultBytes) {
    throw new TypeError('mission operation ceilings must equal the bounded delegation budget');
  }

  const source = {
    descriptor() {
      return sourceDescriptorFor(coordinator, frozenInput, authorityCeilingDigest);
    },
    async reconcile({ request } = {}) {
      const current = sourceDescriptorFor(coordinator, frozenInput, authorityCeilingDigest);
      verifyOperationRequest(request, current);
      const inspection = await coordinator.inspect(current.delegationId);
      if (inspection.status === 'absent') return { status: 'absent' };
      const result = await coordinator.execute(frozenInput);
      if (result.status === 'pending') return { status: 'pending' };
      return projectCompletion(result, request, current, clock);
    },
    async execute({ request } = {}) {
      const current = sourceDescriptorFor(coordinator, frozenInput, authorityCeilingDigest);
      verifyOperationRequest(request, current);
      const result = await coordinator.execute(frozenInput);
      if (result.status === 'pending') return { status: 'pending' };
      return projectCompletion(result, request, current, clock);
    },
  };
  const adapter = await createMissionOperationAdapter({
    operationKind: 'delegation',
    adapterId: 'eternities-delegation-mission-operation',
    adapterVersion: SOURCE_VERSION,
    sourceDescriptor: initialSource,
    source,
  });
  return Object.freeze({
    describe: adapter.describe,
    descriptor: adapter.descriptor,
    reconcile: adapter.reconcile,
    execute: adapter.execute,
    describeSource() {
      return safeClone(initialSource, 'delegation operation source descriptor');
    },
  });
}
