import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  assertRecoverableRealmConsequenceHost,
  RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID,
} from '../realm/recoverable-consequence-host.mjs';
import { createMissionOperationAdapter } from './mission-operation-adapter.mjs';

export const REALM_CONSEQUENCE_MISSION_OPERATION_SOURCE_PROTOCOL_ID =
  'eternities-recoverable-realm-consequence-mission-operation-source-v1';

const SOURCE_KIND = 'recoverable-realm-consequence-host';
const SOURCE_VERSION = '1.0.0';
const OPERATION_KIND = 'realm-consequence';
const ZERO_COMPLETION_TOKENS = 1;
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HOST_DESCRIPTOR_KEYS = [
  'protocolId', 'journalProtocolId', 'eventTypes', 'durableAdmission',
  'resumesAdmittedEffect', 'idempotencyBoundary', 'credentialsPersisted',
  'rollbackSupported', 'authorityExpanded', 'defaultLaunchEnabled',
];
const INPUT_KEYS = ['mission', 'proposal', 'contract', 'authority', 'constitution', 'state'];

export class RealmConsequenceMissionOperationAdapterError extends Error {
  constructor(code, message, cause = undefined) {
    super(message);
    this.name = 'RealmConsequenceMissionOperationAdapterError';
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
  throw new RealmConsequenceMissionOperationAdapterError(code, message, cause);
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

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail('integer-invalid', `${label} is invalid`);
}

function positiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail('integer-invalid', `${label} is invalid`);
}

function clockTime(clock) {
  const value = clock();
  const milliseconds = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail('clock-invalid', 'Realm consequence operation clock is invalid');
  return new Date(milliseconds).toISOString();
}

function verifyHostDescriptor(input) {
  const value = safeClone(input, 'recoverable Realm consequence host descriptor');
  exactKeys(value, HOST_DESCRIPTOR_KEYS, 'recoverable Realm consequence host descriptor');
  if (value.protocolId !== RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID
      || value.journalProtocolId !== 'eternities-recoverable-realm-consequence-journal-v1'
      || !same(value.eventTypes, ['consequence.admitted', 'consequence.resulted', 'consequence.receipted'])
      || value.durableAdmission !== true
      || value.resumesAdmittedEffect !== true
      || value.idempotencyBoundary !== 'negotiated-action'
      || value.credentialsPersisted !== false
      || value.rollbackSupported !== false
      || value.authorityExpanded !== false
      || value.defaultLaunchEnabled !== false) {
    fail('host-descriptor', 'recoverable Realm consequence host descriptor is unsupported');
  }
  return deepFreeze(value);
}

function verifyInput(input, host) {
  const value = safeClone(input, 'Realm consequence input');
  try {
    assertNoCredentialFields(value);
  } catch (error) {
    fail('credential-shaped', 'Realm consequence input contains a forbidden credential-shaped field', error);
  }
  exactKeys(value, INPUT_KEYS, 'Realm consequence input');
  try {
    assertSchema('realm-contract', value.contract);
    assertSchema('organ-proposal', value.proposal);
  } catch (error) {
    fail('input-invalid', 'Realm consequence input contract or proposal is invalid', error);
  }
  exactKeys(value.mission, ['missionId', 'authority'], 'Realm consequence mission');
  exactKeys(value.state, ['instanceId', 'epoch', 'now', 'preconditions'], 'Realm consequence state');
  identifier(value.mission.missionId, 'Realm consequence mission id');
  identifier(value.state.instanceId, 'Realm consequence instance id');
  nonNegativeInteger(value.state.epoch, 'Realm consequence state epoch');
  try {
    const executionId = host.executionIdFor(value);
    digest(executionId, 'Realm consequence execution id');
  } catch (error) {
    if (error instanceof RealmConsequenceMissionOperationAdapterError) throw error;
    fail('input-invalid', 'Realm consequence input cannot derive an execution id', error);
  }
  return deepFreeze(value);
}

function sourceDescriptorFor({ host, input, hostDescriptor, authorityCeilingDigest, maxCompletionTokens, maxResultBytes }) {
  const executionId = host.executionIdFor(input);
  const value = {
    schemaVersion: 1,
    protocolId: REALM_CONSEQUENCE_MISSION_OPERATION_SOURCE_PROTOCOL_ID,
    sourceKind: SOURCE_KIND,
    sourceVersion: SOURCE_VERSION,
    hostDescriptorDigest: sha256Value(hostDescriptor),
    executionId,
    inputDigest: sha256Value(input),
    missionId: input.mission.missionId,
    instanceId: input.state.instanceId,
    stateEpoch: input.state.epoch,
    missionDigest: sha256Value(input.mission),
    proposalDigest: sha256Value(input.proposal),
    contractDigest: sha256Value(input.contract),
    authorityDigest: sha256Value(input.authority),
    constitutionDigest: sha256Value(input.constitution),
    stateDigest: sha256Value(input.state),
    authorityCeilingDigest,
    maxCompletionTokens,
    maxResultBytes,
  };
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'sourceKind', 'sourceVersion',
    'hostDescriptorDigest', 'executionId', 'inputDigest', 'missionId',
    'instanceId', 'stateEpoch', 'missionDigest', 'proposalDigest',
    'contractDigest', 'authorityDigest', 'constitutionDigest', 'stateDigest',
    'authorityCeilingDigest', 'maxCompletionTokens', 'maxResultBytes',
  ], 'Realm consequence operation source descriptor');
  if (value.schemaVersion !== 1
      || value.protocolId !== REALM_CONSEQUENCE_MISSION_OPERATION_SOURCE_PROTOCOL_ID
      || value.sourceKind !== SOURCE_KIND
      || value.sourceVersion !== SOURCE_VERSION) {
    fail('source-identity', 'Realm consequence operation source identity is invalid');
  }
  for (const [key, label] of [
    ['hostDescriptorDigest', 'host descriptor'],
    ['executionId', 'execution id'],
    ['inputDigest', 'input'],
    ['missionDigest', 'mission'],
    ['proposalDigest', 'proposal'],
    ['contractDigest', 'contract'],
    ['authorityDigest', 'authority'],
    ['constitutionDigest', 'constitution'],
    ['stateDigest', 'state'],
    ['authorityCeilingDigest', 'authority ceiling'],
  ]) digest(value[key], label);
  identifier(value.missionId, 'mission id');
  identifier(value.instanceId, 'instance id');
  nonNegativeInteger(value.stateEpoch, 'state epoch');
  positiveInteger(value.maxCompletionTokens, 'completion ceiling', 4_000_000);
  positiveInteger(value.maxResultBytes, 'result ceiling', 16_777_216);
  return deepFreeze(value);
}

function verifyOperationRequest(request, source) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    fail('request-invalid', 'Realm consequence operation request is invalid');
  }
  if (request.operationKind !== OPERATION_KIND
      || request.inputDigest !== source.inputDigest
      || request.authorityCeilingDigest !== source.authorityCeilingDigest
      || request.maxCompletionTokens !== source.maxCompletionTokens
      || request.maxResultBytes !== source.maxResultBytes) {
    fail('request-binding', 'Realm consequence operation request is not bound to the source');
  }
}

function zeroUsage() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    visibleOutputTokens: 0,
    completionTokens: 0,
  };
}

function projectCompletion(result, request, source, clock) {
  if (!result || result.status !== 'completed') fail('result-invalid', 'recoverable Realm consequence host did not complete');
  exactKeys(result, ['status', 'executionId', 'recovered', 'journalHeadDigest', 'consequence', 'receipt'], 'Realm consequence host result');
  if (result.executionId !== source.executionId) fail('result-binding', 'Realm consequence execution identity changed');
  digest(result.journalHeadDigest, 'Realm consequence journal head');
  assertSchema('recoverable-realm-consequence-receipt', result.receipt);
  if (result.receipt.executionId !== source.executionId
      || result.receipt.inputDigest !== source.inputDigest
      || result.receipt.consequenceDigest !== sha256Value(result.consequence)
      || result.receipt.consequenceReceiptDigest !== result.consequence.receipt.receiptDigest
      || result.receipt.actionReceiptDigest !== result.consequence.actionReceipt.receiptDigest) {
    fail('result-binding', 'Realm consequence host receipt is not bound to the source result');
  }
  const projection = {
    schemaVersion: 1,
    protocolId: RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID,
    executionId: result.executionId,
    journalHeadDigest: result.journalHeadDigest,
    hostReceiptDigest: result.receipt.receiptDigest,
    consequenceDigest: result.receipt.consequenceDigest,
    consequenceReceiptDigest: result.receipt.consequenceReceiptDigest,
    actionReceiptDigest: result.receipt.actionReceiptDigest,
    invocationStatus: result.receipt.invocationStatus,
    discrepancyClass: result.receipt.discrepancyClass,
    disposition: result.receipt.disposition,
  };
  const resultDigest = sha256Value(projection);
  const resultBytes = Buffer.byteLength(canonicalJson(projection), 'utf8');
  if (resultBytes > request.maxResultBytes) fail('result-ceiling', 'Realm consequence projection exceeds the mission result ceiling');
  const now = clockTime(clock);
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-long-horizon-mission-program-v1',
    programId: request.programId,
    stepId: request.stepId,
    stepIndex: request.stepIndex,
    kind: request.operationKind,
    dispatchId: request.dispatchId,
    dispatchDigest: request.dispatchDigest,
    resultDigest,
    resultBytes,
    usage: zeroUsage(),
    startedAt: now,
    completedAt: now,
  };
  return {
    status: 'completed',
    completion: { ...unsigned, completionDigest: sha256Value(unsigned) },
  };
}

export async function createRealmConsequenceMissionOperationAdapter(options = {}) {
  exactKeys(options, [
    'host', 'consequenceInput', 'programId', 'stepId', 'stepIndex',
    'authorityCeilingDigest', 'maxCompletionTokens', 'maxResultBytes', 'clock',
  ], 'Realm consequence mission-operation adapter options');
  const {
    host,
    consequenceInput,
    programId,
    stepId,
    stepIndex,
    authorityCeilingDigest,
    maxCompletionTokens,
    maxResultBytes,
    clock,
  } = options;
  assertRecoverableRealmConsequenceHost(host);
  digest(programId, 'mission program id');
  identifier(stepId, 'mission step id');
  nonNegativeInteger(stepIndex, 'mission step index');
  if (stepIndex > 7) fail('integer-invalid', 'mission step index is invalid');
  digest(authorityCeilingDigest, 'mission authority ceiling');
  if (maxCompletionTokens !== ZERO_COMPLETION_TOKENS) {
    fail('ceiling-mismatch', 'Realm consequence operations admit exactly one completion token ceiling');
  }
  positiveInteger(maxResultBytes, 'mission result ceiling', 16_777_216);
  if (typeof clock !== 'function') fail('clock-invalid', 'Realm consequence operation clock is required');
  const input = verifyInput(consequenceInput, host);
  const hostDescriptor = verifyHostDescriptor(host.descriptor);
  const initialSource = sourceDescriptorFor({
    host,
    input,
    hostDescriptor,
    authorityCeilingDigest,
    maxCompletionTokens,
    maxResultBytes,
  });

  const source = {
    descriptor() {
      const liveDescriptor = verifyHostDescriptor(host.descriptor);
      return sourceDescriptorFor({
        host,
        input,
        hostDescriptor: liveDescriptor,
        authorityCeilingDigest,
        maxCompletionTokens,
        maxResultBytes,
      });
    },
    async reconcile({ request } = {}) {
      verifyOperationRequest(request, initialSource);
      const inspection = await host.inspect(initialSource.executionId);
      if (inspection.status === 'absent') return { status: 'absent' };
      const result = await host.recover(initialSource.executionId);
      return projectCompletion(result, request, initialSource, clock);
    },
    async execute({ request } = {}) {
      verifyOperationRequest(request, initialSource);
      const result = await host.execute(input);
      return projectCompletion(result, request, initialSource, clock);
    },
  };

  const adapter = await createMissionOperationAdapter({
    operationKind: OPERATION_KIND,
    adapterId: 'eternities-realm-consequence-mission-operation',
    adapterVersion: SOURCE_VERSION,
    sourceDescriptor: initialSource,
    source,
  });
  return Object.freeze({
    ...adapter,
    describeSource() {
      return safeClone(initialSource, 'Realm consequence source descriptor');
    },
  });
}
