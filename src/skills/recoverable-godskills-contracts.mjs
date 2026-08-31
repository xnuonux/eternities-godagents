import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const TRANSPORT_PROTOCOL = 'eternities-recoverable-godskills-transport-v1';
const DISPATCH_PROTOCOL = 'eternities-recoverable-godskills-dispatch-v1';
const COMPLETION_PROTOCOL = 'eternities-recoverable-godskills-completion-v1';
const INTENT_PROTOCOL = 'eternities-recoverable-godskills-binding-intent-v1';
const RECORD_PROTOCOL = 'eternities-recoverable-godskills-binding-record-v1';
const PENDING_PROTOCOL = 'eternities-recoverable-godskills-pending-v1';
const OUTBOX_PROTOCOL = 'eternities-recoverable-godskills-outbox-v1';
const ADMISSION_PROTOCOL = 'eternities-recoverable-godskills-admission-v1';
const stages = new Set(['route', 'activation']);
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MAX_BYTES = 16_777_216;

export const GODSKILLS_OUTBOX_AUTHORITY = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

export class RecoverableGodskillsContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RecoverableGodskillsContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RecoverableGodskillsContractError(code, message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('object-invalid', `${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('fields-invalid', `${label} fields are invalid`);
  }
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} digest is invalid`);
  return value;
}

function requireStage(value, label = 'Godskills outbox stage') {
  if (!stages.has(value)) fail('stage-invalid', `${label} is invalid`);
  return value;
}

function requireIdentifier(value, label, maximum = 256) {
  if (typeof value !== 'string' || value.length > maximum || !IDENTIFIER.test(value)) {
    fail('identifier-invalid', `${label} is invalid`);
  }
  return value;
}

function requireRequestId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || /[\0\r\n]/.test(value)) {
    fail('request-id-invalid', 'Godskills outbox request id is invalid');
  }
  return value;
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} is invalid`);
  }
  return value;
}

function requireIso(value, label) {
  if (typeof value !== 'string' || value !== new Date(value).toISOString()) {
    fail('time-invalid', `${label} is invalid`);
  }
  return value;
}

function verifyAuthority(value, label) {
  if (!same(value, GODSKILLS_OUTBOX_AUTHORITY)) fail('authority-invalid', `${label} must remain empty`);
}

function requestValue(value) {
  object(value, 'Godskills outbox request');
  assertNoCredentialFields(value);
  requireRequestId(value.requestId);
  canonicalJson(value);
  return value;
}

export function recoverableGodskillsOperationId(stage, requestId) {
  requireStage(stage);
  requireRequestId(requestId);
  return sha256Value({ protocolId: OUTBOX_PROTOCOL, stage, requestId });
}

export function recoverableGodskillsBindingSlot(missionId) {
  requireIdentifier(missionId, 'Godskills binding mission id');
  return sha256Value({ protocolId: ADMISSION_PROTOCOL, missionId });
}

export function buildRecoverableGodskillsTransportDescriptor({
  stage,
  transportId,
  maximumDispatchBytes = 1_048_576,
  maximumCompletionBytes = 1_048_576,
} = {}) {
  requireStage(stage);
  requireIdentifier(transportId, 'Godskills outbox transport id');
  requireInteger(maximumDispatchBytes, 'Godskills outbox dispatch byte ceiling', 256, MAX_BYTES);
  requireInteger(maximumCompletionBytes, 'Godskills outbox completion byte ceiling', 256, MAX_BYTES);
  const unsigned = {
    schemaVersion: 1,
    protocolId: TRANSPORT_PROTOCOL,
    stage,
    transportId,
    terminalReconciliation: 'by-dispatch-digest',
    atomicDeduplication: true,
    maximumDispatchBytes,
    maximumCompletionBytes,
    authority: clone(GODSKILLS_OUTBOX_AUTHORITY),
  };
  return deepFreeze({ ...unsigned, descriptorDigest: sha256Value(unsigned) });
}

export function verifyRecoverableGodskillsTransportDescriptor(value) {
  assertNoCredentialFields(value);
  assertSchema('recoverable-godskills-transport-descriptor', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'stage', 'transportId', 'terminalReconciliation',
    'atomicDeduplication', 'maximumDispatchBytes', 'maximumCompletionBytes',
    'authority', 'descriptorDigest',
  ], 'Godskills outbox transport descriptor');
  if (value.schemaVersion !== 1 || value.protocolId !== TRANSPORT_PROTOCOL
      || value.terminalReconciliation !== 'by-dispatch-digest'
      || value.atomicDeduplication !== true) {
    fail('descriptor-invalid', 'Godskills outbox transport descriptor is invalid');
  }
  requireStage(value.stage);
  requireIdentifier(value.transportId, 'Godskills outbox transport id');
  requireInteger(value.maximumDispatchBytes, 'Godskills outbox dispatch byte ceiling', 256, MAX_BYTES);
  requireInteger(value.maximumCompletionBytes, 'Godskills outbox completion byte ceiling', 256, MAX_BYTES);
  verifyAuthority(value.authority, 'Godskills outbox transport');
  const { descriptorDigest, ...unsigned } = value;
  requireDigest(descriptorDigest, 'Godskills outbox transport descriptor');
  if (descriptorDigest !== sha256Value(unsigned)) fail('descriptor-digest-invalid', 'Godskills outbox descriptor digest mismatch');
  return value;
}

function verifyDispatchEnvelope(value, descriptor) {
  assertNoCredentialFields(value);
  assertSchema('recoverable-godskills-dispatch', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'stage', 'operationId', 'requestId',
    'requestDigest', 'request', 'transportDescriptorDigest', 'authority', 'dispatchDigest',
  ], 'recoverable Godskills dispatch');
  requestValue(value.request);
  if (value.schemaVersion !== 1 || value.protocolId !== DISPATCH_PROTOCOL
      || value.stage !== descriptor.stage
      || value.requestId !== value.request.requestId
      || value.operationId !== recoverableGodskillsOperationId(value.stage, value.requestId)
      || value.requestDigest !== sha256Value(value.request)
      || value.transportDescriptorDigest !== descriptor.descriptorDigest) {
    fail('dispatch-binding-invalid', 'recoverable Godskills dispatch binding is invalid');
  }
  verifyAuthority(value.authority, 'recoverable Godskills dispatch');
  const { dispatchDigest, ...unsigned } = value;
  requireDigest(dispatchDigest, 'recoverable Godskills dispatch');
  if (dispatchDigest !== sha256Value(unsigned)) fail('dispatch-digest-invalid', 'recoverable Godskills dispatch digest mismatch');
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > descriptor.maximumDispatchBytes) {
    fail('dispatch-byte-ceiling', 'recoverable Godskills dispatch exceeds its byte ceiling');
  }
  return value;
}

export function buildRecoverableGodskillsDispatch({ request: inputRequest, transportDescriptor } = {}) {
  const descriptor = verifyRecoverableGodskillsTransportDescriptor(clone(transportDescriptor));
  const request = requestValue(clone(inputRequest));
  const unsigned = {
    schemaVersion: 1,
    protocolId: DISPATCH_PROTOCOL,
    stage: descriptor.stage,
    operationId: recoverableGodskillsOperationId(descriptor.stage, request.requestId),
    requestId: request.requestId,
    requestDigest: sha256Value(request),
    request,
    transportDescriptorDigest: descriptor.descriptorDigest,
    authority: clone(GODSKILLS_OUTBOX_AUTHORITY),
  };
  const value = { ...unsigned, dispatchDigest: sha256Value(unsigned) };
  verifyDispatchEnvelope(value, descriptor);
  return deepFreeze(value);
}

export function verifyRecoverableGodskillsDispatch(value, { transportDescriptor } = {}) {
  const descriptor = verifyRecoverableGodskillsTransportDescriptor(clone(transportDescriptor));
  return verifyDispatchEnvelope(value, descriptor);
}

export function buildRecoverableGodskillsCompletion({
  dispatch,
  transportDescriptor,
  result,
  startedAt,
  completedAt,
} = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: COMPLETION_PROTOCOL,
    status: 'completed',
    stage: dispatch?.stage,
    operationId: dispatch?.operationId,
    dispatchDigest: dispatch?.dispatchDigest,
    requestDigest: dispatch?.requestDigest,
    transportDescriptorDigest: transportDescriptor?.descriptorDigest,
    result: clone(result),
    resultDigest: sha256Value(result),
    startedAt,
    completedAt,
    authority: clone(GODSKILLS_OUTBOX_AUTHORITY),
  };
  const value = { ...unsigned, completionDigest: sha256Value(unsigned) };
  verifyRecoverableGodskillsCompletion(value, { dispatch, transportDescriptor });
  return deepFreeze(value);
}

export function verifyRecoverableGodskillsCompletion(value, {
  dispatch: inputDispatch,
  transportDescriptor: inputDescriptor,
} = {}) {
  const descriptor = verifyRecoverableGodskillsTransportDescriptor(clone(inputDescriptor));
  const dispatch = verifyDispatchEnvelope(inputDispatch, descriptor);
  assertNoCredentialFields(value);
  assertSchema('recoverable-godskills-completion', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'stage', 'operationId',
    'dispatchDigest', 'requestDigest', 'transportDescriptorDigest', 'result',
    'resultDigest', 'startedAt', 'completedAt', 'authority', 'completionDigest',
  ], 'recoverable Godskills completion');
  object(value.result, 'recoverable Godskills result');
  if (value.schemaVersion !== 1 || value.protocolId !== COMPLETION_PROTOCOL || value.status !== 'completed'
      || value.stage !== dispatch.stage || value.operationId !== dispatch.operationId
      || value.dispatchDigest !== dispatch.dispatchDigest || value.requestDigest !== dispatch.requestDigest
      || value.transportDescriptorDigest !== descriptor.descriptorDigest
      || value.resultDigest !== sha256Value(value.result)) {
    fail('completion-binding-invalid', 'recoverable Godskills completion binding is invalid');
  }
  requireIso(value.startedAt, 'recoverable Godskills completion start');
  requireIso(value.completedAt, 'recoverable Godskills completion end');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    fail('completion-time-invalid', 'recoverable Godskills completion precedes its start');
  }
  verifyAuthority(value.authority, 'recoverable Godskills completion');
  const { completionDigest, ...unsigned } = value;
  requireDigest(completionDigest, 'recoverable Godskills completion');
  if (completionDigest !== sha256Value(unsigned)) fail('completion-digest-invalid', 'recoverable Godskills completion digest mismatch');
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > descriptor.maximumCompletionBytes) {
    fail('completion-byte-ceiling', 'recoverable Godskills completion exceeds its byte ceiling');
  }
  return value;
}

function bindingInput(value) {
  assertNoCredentialFields(value);
  exactKeys(value, [
    'mission', 'observation', 'genomePolicy', 'hostEnvelope', 'sourceStateEpoch',
  ], 'recoverable Godskills binding input');
  object(value.mission, 'recoverable Godskills mission');
  requireIdentifier(value.mission.requestId, 'Godskills binding mission id');
  object(value.observation, 'recoverable Godskills observation');
  object(value.genomePolicy, 'recoverable Godskills genome policy');
  object(value.hostEnvelope, 'recoverable Godskills host envelope');
  requireInteger(value.sourceStateEpoch, 'Godskills source state epoch', 0, Number.MAX_SAFE_INTEGER);
  canonicalJson(value);
  return value;
}

export function buildRecoverableGodskillsBindingIntent({ input, releaseDigest } = {}) {
  const checked = bindingInput(clone(input));
  requireDigest(releaseDigest, 'Godskills release');
  const unsigned = {
    schemaVersion: 1,
    protocolId: INTENT_PROTOCOL,
    missionId: checked.mission.requestId,
    releaseDigest,
    input: checked,
    inputDigest: sha256Value(checked),
  };
  return deepFreeze({ ...unsigned, intentDigest: sha256Value(unsigned) });
}

export function verifyRecoverableGodskillsBindingIntent(value, { input = null, releaseDigest = null } = {}) {
  assertNoCredentialFields(value);
  assertSchema('recoverable-godskills-binding-intent', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'missionId', 'releaseDigest', 'input',
    'inputDigest', 'intentDigest',
  ], 'recoverable Godskills binding intent');
  bindingInput(value.input);
  if (value.schemaVersion !== 1 || value.protocolId !== INTENT_PROTOCOL
      || value.missionId !== value.input.mission.requestId
      || value.inputDigest !== sha256Value(value.input)) {
    fail('intent-binding-invalid', 'recoverable Godskills binding intent is invalid');
  }
  requireDigest(value.releaseDigest, 'Godskills binding release');
  const { intentDigest, ...unsigned } = value;
  requireDigest(intentDigest, 'Godskills binding intent');
  if (intentDigest !== sha256Value(unsigned)) fail('intent-digest-invalid', 'Godskills binding intent digest mismatch');
  if (input !== null && !same(value.input, bindingInput(clone(input)))) {
    fail('intent-collision', 'recoverable Godskills binding intent changed');
  }
  if (releaseDigest !== null && value.releaseDigest !== releaseDigest) {
    fail('intent-collision', 'recoverable Godskills binding release changed');
  }
  return value;
}

function verifyBinding(value) {
  object(value, 'recoverable Godskills binding');
  if (value.status === 'needs-decision') {
    exactKeys(value, ['status', 'unresolvedDecisions', 'receipt', 'cortexPackage'], 'Godskills decision binding');
    if (!Array.isArray(value.unresolvedDecisions) || value.unresolvedDecisions.length < 1
        || value.receipt !== null || value.cortexPackage !== null) {
      fail('binding-invalid', 'Godskills decision binding is invalid');
    }
    return value;
  }
  exactKeys(value, ['status', 'receipt', 'cortexPackage'], 'Godskills terminal binding');
  if (!['bound', 'no-qualified-route'].includes(value.status)) {
    fail('binding-invalid', 'Godskills binding status is invalid');
  }
  object(value.receipt, 'Godskills binding receipt');
  object(value.cortexPackage, 'Godskills cortex package');
  return value;
}

export function buildRecoverableGodskillsBindingRecord({ intent, releaseDigest, binding } = {}) {
  const checkedIntent = verifyRecoverableGodskillsBindingIntent(clone(intent));
  requireDigest(releaseDigest, 'Godskills release');
  if (checkedIntent.releaseDigest !== releaseDigest) fail('record-binding-invalid', 'binding record release differs from intent');
  const checkedBinding = verifyBinding(clone(binding));
  assertNoCredentialFields(checkedBinding);
  const unsigned = {
    schemaVersion: 1,
    protocolId: RECORD_PROTOCOL,
    status: 'completed',
    intentDigest: checkedIntent.intentDigest,
    releaseDigest,
    binding: checkedBinding,
    bindingDigest: sha256Value(checkedBinding),
  };
  return deepFreeze({ ...unsigned, recordDigest: sha256Value(unsigned) });
}

export function verifyRecoverableGodskillsBindingRecord(value, { intent = null, releaseDigest = null } = {}) {
  assertNoCredentialFields(value);
  assertSchema('recoverable-godskills-binding-record', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'intentDigest', 'releaseDigest',
    'binding', 'bindingDigest', 'recordDigest',
  ], 'recoverable Godskills binding record');
  verifyBinding(value.binding);
  if (value.schemaVersion !== 1 || value.protocolId !== RECORD_PROTOCOL || value.status !== 'completed'
      || value.bindingDigest !== sha256Value(value.binding)) {
    fail('record-binding-invalid', 'recoverable Godskills binding record is invalid');
  }
  requireDigest(value.intentDigest, 'Godskills record intent');
  requireDigest(value.releaseDigest, 'Godskills record release');
  const { recordDigest, ...unsigned } = value;
  requireDigest(recordDigest, 'Godskills binding record');
  if (recordDigest !== sha256Value(unsigned)) fail('record-digest-invalid', 'Godskills binding record digest mismatch');
  if (intent !== null && value.intentDigest !== verifyRecoverableGodskillsBindingIntent(intent).intentDigest) {
    fail('record-binding-invalid', 'Godskills binding record differs from its intent');
  }
  if (releaseDigest !== null && value.releaseDigest !== releaseDigest) {
    fail('record-binding-invalid', 'Godskills binding record release changed');
  }
  return value;
}

export function buildRecoverableGodskillsPending({ phase, operationId, dispatchDigest } = {}) {
  requireStage(phase, 'recoverable Godskills pending phase');
  requireDigest(operationId, 'recoverable Godskills operation');
  requireDigest(dispatchDigest, 'recoverable Godskills dispatch');
  const unsigned = {
    schemaVersion: 1,
    protocolId: PENDING_PROTOCOL,
    status: 'pending',
    phase,
    operationId,
    dispatchDigest,
    authority: clone(GODSKILLS_OUTBOX_AUTHORITY),
  };
  return deepFreeze({ ...unsigned, pendingDigest: sha256Value(unsigned) });
}

export function verifyRecoverableGodskillsPending(value) {
  assertNoCredentialFields(value);
  assertSchema('recoverable-godskills-pending', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'phase', 'operationId',
    'dispatchDigest', 'authority', 'pendingDigest',
  ], 'recoverable Godskills pending projection');
  if (value.schemaVersion !== 1 || value.protocolId !== PENDING_PROTOCOL || value.status !== 'pending') {
    fail('pending-invalid', 'recoverable Godskills pending projection is invalid');
  }
  requireStage(value.phase, 'recoverable Godskills pending phase');
  requireDigest(value.operationId, 'recoverable Godskills pending operation');
  requireDigest(value.dispatchDigest, 'recoverable Godskills pending dispatch');
  verifyAuthority(value.authority, 'recoverable Godskills pending projection');
  const { pendingDigest, ...unsigned } = value;
  requireDigest(pendingDigest, 'recoverable Godskills pending');
  if (pendingDigest !== sha256Value(unsigned)) fail('pending-digest-invalid', 'recoverable Godskills pending digest mismatch');
  return value;
}
