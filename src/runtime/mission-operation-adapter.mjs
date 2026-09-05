import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

export const MISSION_OPERATION_ADAPTER_PROTOCOL_ID = 'eternities-mission-operation-adapter-v1';
export const MISSION_OPERATION_REQUEST_PROTOCOL_ID = 'eternities-mission-operation-request-v1';
export const MISSION_OPERATION_RECEIPT_PROTOCOL_ID = 'eternities-mission-operation-receipt-v1';
export const MISSION_OPERATION_STEP_PROTOCOL_ID = 'eternities-mission-program-step-adapter-v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/;
const MAX_SOURCE_DESCRIPTOR_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024;

export const MISSION_OPERATION_AUTHORITY = Object.freeze({
  realmEffects: 0,
  continuityWrites: 0,
  identityMutation: 0,
  evolution: 0,
  soul: 0,
});

export const MISSION_OPERATION_CAPABILITIES = Object.freeze({
  descriptorRevalidation: true,
  payloadFreeRequests: true,
  missionProgramProjection: true,
  reconcileBeforeExecute: true,
});

export class MissionOperationAdapterError extends Error {
  constructor(code, message, cause = undefined) {
    super(message);
    this.name = 'MissionOperationAdapterError';
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
  throw new MissionOperationAdapterError(code, message, cause);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object-invalid', `${label} is invalid`);
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

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} is invalid`);
  return value;
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('identifier-invalid', `${label} is invalid`);
  return value;
}

function requireVersion(value, label) {
  if (typeof value !== 'string' || !VERSION.test(value)) fail('version-invalid', `${label} is invalid`);
  return value;
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} is invalid`);
  }
  return value;
}

function requireIso(value, label) {
  if (typeof value !== 'string' || value.length !== 24
      || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('time-invalid', `${label} is invalid`);
  }
  return value;
}

function safeClone(value, label) {
  try {
    return clone(value);
  } catch (error) {
    fail('non-serializable', `${label} is not serializable`, error);
  }
}

function credentialFreeClone(value, label) {
  const copied = safeClone(value, label);
  try {
    assertNoCredentialFields(copied);
  } catch (error) {
    fail('credential-field', `${label} contains a credential-shaped field`, error);
  }
  return copied;
}

function verifyAuthority(value, label) {
  exactKeys(value, Object.keys(MISSION_OPERATION_AUTHORITY), label);
  if (!same(value, MISSION_OPERATION_AUTHORITY)) fail('authority-expansion', `${label} is not empty`);
  return value;
}

function verifyCapabilities(value) {
  exactKeys(value, Object.keys(MISSION_OPERATION_CAPABILITIES), 'mission operation capabilities');
  if (!same(value, MISSION_OPERATION_CAPABILITIES)) fail('capabilities-invalid', 'mission operation capabilities are invalid');
  return value;
}

function verifyMissionStepDescriptor(value) {
  try {
    assertSchema('mission-program-step-descriptor', value);
  } catch (error) {
    fail('step-descriptor-invalid', 'mission operation step descriptor is invalid', error);
  }
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'kind', 'adapterId', 'adapterVersion', 'authority', 'descriptorDigest',
  ], 'mission operation step descriptor');
  if (value.protocolId !== MISSION_OPERATION_STEP_PROTOCOL_ID) fail('step-descriptor-invalid', 'mission operation step protocol is invalid');
  requireIdentifier(value.kind, 'mission operation step kind');
  requireIdentifier(value.adapterId, 'mission operation step adapter id');
  requireVersion(value.adapterVersion, 'mission operation step adapter version');
  verifyAuthority(value.authority, 'mission operation step authority');
  requireDigest(value.descriptorDigest, 'mission operation step descriptor digest');
  const { descriptorDigest, ...unsigned } = value;
  if (sha256Value(unsigned) !== descriptorDigest) fail('step-descriptor-digest', 'mission operation step descriptor digest mismatch');
  return deepFreeze(safeClone(value, 'mission operation step descriptor'));
}

function verifySourceDescriptor(value, label = 'mission operation source descriptor') {
  const copied = credentialFreeClone(value, label);
  object(copied, label);
  if (typeof copied.protocolId !== 'string' || copied.protocolId.length < 1 || copied.protocolId.length > 256) {
    fail('source-descriptor-invalid', `${label} protocol is invalid`);
  }
  let bytes;
  try {
    bytes = Buffer.byteLength(canonicalJson(copied), 'utf8');
  } catch (error) {
    fail('source-descriptor-invalid', `${label} is not canonical JSON`, error);
  }
  if (bytes > MAX_SOURCE_DESCRIPTOR_BYTES) fail('source-descriptor-ceiling', `${label} exceeds its byte ceiling`);
  return deepFreeze(copied);
}

function buildMissionStepDescriptor({ operationKind, adapterId, adapterVersion, sourceDescriptorDigest }) {
  const boundAdapterId = `${adapterId}:${sourceDescriptorDigest}`;
  requireIdentifier(boundAdapterId, 'bound mission operation adapter id');
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_OPERATION_STEP_PROTOCOL_ID,
    kind: operationKind,
    adapterId: boundAdapterId,
    adapterVersion,
    authority: clone(MISSION_OPERATION_AUTHORITY),
  };
  return verifyMissionStepDescriptor({ ...unsigned, descriptorDigest: sha256Value(unsigned) });
}

export function buildMissionOperationDescription({
  operationKind,
  adapterId,
  adapterVersion,
  sourceDescriptor,
} = {}) {
  requireIdentifier(operationKind, 'mission operation kind');
  requireIdentifier(adapterId, 'mission operation adapter id');
  requireVersion(adapterVersion, 'mission operation adapter version');
  const source = verifySourceDescriptor(sourceDescriptor);
  const sourceDescriptorDigest = sha256Value(source);
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_OPERATION_ADAPTER_PROTOCOL_ID,
    operationKind,
    sourceDescriptorDigest,
    missionStepDescriptor: buildMissionStepDescriptor({
      operationKind,
      adapterId,
      adapterVersion,
      sourceDescriptorDigest,
    }),
    capabilities: clone(MISSION_OPERATION_CAPABILITIES),
    authority: clone(MISSION_OPERATION_AUTHORITY),
  };
  return verifyMissionOperationDescription({ ...unsigned, descriptionDigest: sha256Value(unsigned) });
}

export function verifyMissionOperationDescription(input) {
  const value = credentialFreeClone(input, 'mission operation description');
  try {
    assertSchema('mission-operation-adapter', value);
  } catch (error) {
    fail('description-invalid', 'mission operation description is invalid', error);
  }
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'operationKind', 'sourceDescriptorDigest',
    'missionStepDescriptor', 'capabilities', 'authority', 'descriptionDigest',
  ], 'mission operation description');
  if (value.schemaVersion !== 1 || value.protocolId !== MISSION_OPERATION_ADAPTER_PROTOCOL_ID) {
    fail('description-invalid', 'mission operation description protocol is invalid');
  }
  requireIdentifier(value.operationKind, 'mission operation kind');
  requireDigest(value.sourceDescriptorDigest, 'mission operation source descriptor digest');
  verifyCapabilities(value.capabilities);
  verifyAuthority(value.authority, 'mission operation authority');
  const step = verifyMissionStepDescriptor(value.missionStepDescriptor);
  if (step.kind !== value.operationKind || !step.adapterId.endsWith(`:${value.sourceDescriptorDigest}`)) {
    fail('description-binding', 'mission operation step descriptor is not bound to the source');
  }
  requireDigest(value.descriptionDigest, 'mission operation description digest');
  const { descriptionDigest, ...unsigned } = value;
  if (sha256Value(unsigned) !== descriptionDigest) fail('description-digest', 'mission operation description digest mismatch');
  return deepFreeze(value);
}

function verifyMissionProgramDispatch(value, description) {
  const dispatch = credentialFreeClone(value, 'mission operation dispatch');
  try {
    assertSchema('mission-program-dispatch', dispatch);
  } catch (error) {
    fail('dispatch-invalid', 'mission operation dispatch is invalid', error);
  }
  if (dispatch.kind !== description.operationKind
      || dispatch.descriptorDigest !== description.missionStepDescriptor.descriptorDigest) {
    fail('dispatch-binding', 'mission operation dispatch is not bound to the adapter');
  }
  requireDigest(dispatch.programId, 'mission operation program id');
  requireDigest(dispatch.dispatchId, 'mission operation dispatch id');
  requireIdentifier(dispatch.stepId, 'mission operation step id');
  requireInteger(dispatch.stepIndex, 'mission operation step index', 0, 7);
  requireDigest(dispatch.inputDigest, 'mission operation input digest');
  requireDigest(dispatch.authorityCeilingDigest, 'mission operation authority ceiling digest');
  requireInteger(dispatch.maxCompletionTokens, 'mission operation completion ceiling', 1, 4_000_000);
  requireInteger(dispatch.maxResultBytes, 'mission operation result ceiling', 1, 16_777_216);
  requireDigest(dispatch.dispatchDigest, 'mission operation dispatch digest');
  const { dispatchDigest, ...unsigned } = dispatch;
  if (sha256Value(unsigned) !== dispatchDigest) fail('dispatch-digest', 'mission operation dispatch digest mismatch');
  return deepFreeze(dispatch);
}

export function buildMissionOperationRequest({ description: inputDescription, dispatch } = {}) {
  const description = verifyMissionOperationDescription(inputDescription);
  const verifiedDispatch = verifyMissionProgramDispatch(dispatch, description);
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_OPERATION_REQUEST_PROTOCOL_ID,
    operationKind: description.operationKind,
    sourceDescriptorDigest: description.sourceDescriptorDigest,
    missionStepDescriptorDigest: description.missionStepDescriptor.descriptorDigest,
    programId: verifiedDispatch.programId,
    stepId: verifiedDispatch.stepId,
    stepIndex: verifiedDispatch.stepIndex,
    inputDigest: verifiedDispatch.inputDigest,
    dispatchId: verifiedDispatch.dispatchId,
    dispatchDigest: verifiedDispatch.dispatchDigest,
    authorityCeilingDigest: verifiedDispatch.authorityCeilingDigest,
    maxCompletionTokens: verifiedDispatch.maxCompletionTokens,
    maxResultBytes: verifiedDispatch.maxResultBytes,
    authority: clone(MISSION_OPERATION_AUTHORITY),
  };
  const result = { ...unsigned, requestDigest: sha256Value(unsigned) };
  if (Buffer.byteLength(`${canonicalJson(result)}\n`, 'utf8') > MAX_REQUEST_BYTES) {
    fail('request-ceiling', 'mission operation request exceeds its byte ceiling');
  }
  return verifyMissionOperationRequest(result, { description, dispatch: verifiedDispatch });
}

export function verifyMissionOperationRequest(input, { description: inputDescription, dispatch } = {}) {
  const description = verifyMissionOperationDescription(inputDescription);
  const verifiedDispatch = verifyMissionProgramDispatch(dispatch, description);
  const value = credentialFreeClone(input, 'mission operation request');
  try {
    assertSchema('mission-operation-request', value);
  } catch (error) {
    fail('request-invalid', 'mission operation request is invalid', error);
  }
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'operationKind', 'sourceDescriptorDigest',
    'missionStepDescriptorDigest', 'programId', 'stepId', 'stepIndex', 'inputDigest',
    'dispatchId', 'dispatchDigest', 'authorityCeilingDigest', 'maxCompletionTokens',
    'maxResultBytes', 'authority', 'requestDigest',
  ], 'mission operation request');
  if (value.schemaVersion !== 1 || value.protocolId !== MISSION_OPERATION_REQUEST_PROTOCOL_ID
      || value.operationKind !== description.operationKind
      || value.sourceDescriptorDigest !== description.sourceDescriptorDigest
      || value.missionStepDescriptorDigest !== description.missionStepDescriptor.descriptorDigest
      || value.programId !== verifiedDispatch.programId
      || value.stepId !== verifiedDispatch.stepId
      || value.stepIndex !== verifiedDispatch.stepIndex
      || value.inputDigest !== verifiedDispatch.inputDigest
      || value.dispatchId !== verifiedDispatch.dispatchId
      || value.dispatchDigest !== verifiedDispatch.dispatchDigest
      || value.authorityCeilingDigest !== verifiedDispatch.authorityCeilingDigest
      || value.maxCompletionTokens !== verifiedDispatch.maxCompletionTokens
      || value.maxResultBytes !== verifiedDispatch.maxResultBytes) {
    fail('request-binding', 'mission operation request is not bound to its dispatch');
  }
  verifyAuthority(value.authority, 'mission operation request authority');
  requireDigest(value.requestDigest, 'mission operation request digest');
  const { requestDigest, ...unsigned } = value;
  if (sha256Value(unsigned) !== requestDigest) fail('request-digest', 'mission operation request digest mismatch');
  if (Buffer.byteLength(`${canonicalJson(value)}\n`, 'utf8') > MAX_REQUEST_BYTES) {
    fail('request-ceiling', 'mission operation request exceeds its byte ceiling');
  }
  return deepFreeze(value);
}

function verifyCompletion(value, dispatch) {
  const completion = credentialFreeClone(value, 'mission operation completion');
  try {
    assertSchema('mission-program-completion', completion);
  } catch (error) {
    fail('completion-invalid', 'mission operation completion is invalid', error);
  }
  if (completion.programId !== dispatch.programId
      || completion.stepId !== dispatch.stepId
      || completion.stepIndex !== dispatch.stepIndex
      || completion.kind !== dispatch.kind
      || completion.dispatchId !== dispatch.dispatchId
      || completion.dispatchDigest !== dispatch.dispatchDigest) {
    fail('completion-binding', 'mission operation completion is not bound to its dispatch');
  }
  requireDigest(completion.resultDigest, 'mission operation result digest');
  requireInteger(completion.resultBytes, 'mission operation result bytes', 1, dispatch.maxResultBytes);
  const usage = completion.usage;
  for (const key of ['inputTokens', 'cachedInputTokens', 'reasoningTokens', 'visibleOutputTokens', 'completionTokens']) {
    requireInteger(usage[key], `mission operation usage ${key}`, 0, 10_000_000);
  }
  if (usage.cachedInputTokens > usage.inputTokens
      || usage.completionTokens !== usage.reasoningTokens + usage.visibleOutputTokens
      || usage.completionTokens > dispatch.maxCompletionTokens) {
    fail('completion-ceiling', 'mission operation completion usage exceeds its ceiling');
  }
  requireIso(completion.startedAt, 'mission operation completion start');
  requireIso(completion.completedAt, 'mission operation completion time');
  if (Date.parse(completion.completedAt) < Date.parse(completion.startedAt)) {
    fail('completion-time', 'mission operation completion time moved backward');
  }
  requireDigest(completion.completionDigest, 'mission operation completion digest');
  const { completionDigest, ...unsigned } = completion;
  if (sha256Value(unsigned) !== completionDigest) fail('completion-digest', 'mission operation completion digest mismatch');
  return deepFreeze(completion);
}

function verifyOutcome(value, { description, dispatch }) {
  const outcome = credentialFreeClone(value, 'mission operation outcome');
  object(outcome, 'mission operation outcome');
  if (outcome.status === 'absent' || outcome.status === 'pending') {
    exactKeys(outcome, ['status'], 'mission operation non-terminal outcome');
    return deepFreeze(outcome);
  }
  if (outcome.status !== 'completed') fail('outcome-status', 'mission operation outcome status is invalid');
  exactKeys(outcome, ['status', 'completion'], 'mission operation completed outcome');
  const completion = verifyCompletion(outcome.completion, dispatch);
  return deepFreeze({ status: 'completed', completion });
}

export function buildMissionOperationReceipt({
  description: inputDescription,
  request: inputRequest,
  dispatch,
  outcome,
  sourceEvidenceDigest = null,
  recordedAt,
} = {}) {
  const description = verifyMissionOperationDescription(inputDescription);
  const request = verifyMissionOperationRequest(inputRequest, { description, dispatch });
  const verifiedOutcome = verifyOutcome(outcome, { description, dispatch });
  if (sourceEvidenceDigest !== null) requireDigest(sourceEvidenceDigest, 'mission operation source evidence digest');
  requireIso(recordedAt, 'mission operation receipt time');
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_OPERATION_RECEIPT_PROTOCOL_ID,
    operationKind: description.operationKind,
    sourceDescriptorDigest: description.sourceDescriptorDigest,
    descriptionDigest: description.descriptionDigest,
    requestDigest: request.requestDigest,
    dispatchDigest: request.dispatchDigest,
    disposition: verifiedOutcome.status,
    completionDigest: verifiedOutcome.status === 'completed' ? verifiedOutcome.completion.completionDigest : null,
    sourceEvidenceDigest,
    recordedAt,
    authority: clone(MISSION_OPERATION_AUTHORITY),
  };
  return verifyMissionOperationReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }, {
    description,
    request,
    dispatch,
    outcome: verifiedOutcome,
  });
}

export function verifyMissionOperationReceipt(input, {
  description: inputDescription,
  request: inputRequest,
  dispatch,
  outcome = undefined,
} = {}) {
  const description = verifyMissionOperationDescription(inputDescription);
  const request = verifyMissionOperationRequest(inputRequest, { description, dispatch });
  const value = credentialFreeClone(input, 'mission operation receipt');
  try {
    assertSchema('mission-operation-receipt', value);
  } catch (error) {
    fail('receipt-invalid', 'mission operation receipt is invalid', error);
  }
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'operationKind', 'sourceDescriptorDigest',
    'descriptionDigest', 'requestDigest', 'dispatchDigest', 'disposition',
    'completionDigest', 'sourceEvidenceDigest', 'recordedAt', 'authority', 'receiptDigest',
  ], 'mission operation receipt');
  if (value.schemaVersion !== 1 || value.protocolId !== MISSION_OPERATION_RECEIPT_PROTOCOL_ID
      || value.operationKind !== description.operationKind
      || value.sourceDescriptorDigest !== description.sourceDescriptorDigest
      || value.descriptionDigest !== description.descriptionDigest
      || value.requestDigest !== request.requestDigest
      || value.dispatchDigest !== request.dispatchDigest) {
    fail('receipt-binding', 'mission operation receipt is not bound to its request');
  }
  if (!['absent', 'pending', 'completed'].includes(value.disposition)) fail('receipt-disposition', 'mission operation receipt disposition is invalid');
  if (value.completionDigest !== null) requireDigest(value.completionDigest, 'mission operation receipt completion digest');
  if (value.sourceEvidenceDigest !== null) requireDigest(value.sourceEvidenceDigest, 'mission operation receipt source evidence digest');
  if ((value.disposition === 'completed') !== (value.completionDigest !== null)) {
    fail('receipt-disposition', 'mission operation receipt completion binding is invalid');
  }
  if (outcome !== undefined) {
    const verifiedOutcome = verifyOutcome(outcome, { description, dispatch });
    if (verifiedOutcome.status !== value.disposition
        || (verifiedOutcome.status === 'completed' && verifiedOutcome.completion.completionDigest !== value.completionDigest)) {
      fail('receipt-outcome', 'mission operation receipt outcome differs');
    }
  }
  verifyAuthority(value.authority, 'mission operation receipt authority');
  requireIso(value.recordedAt, 'mission operation receipt time');
  requireDigest(value.receiptDigest, 'mission operation receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (sha256Value(unsigned) !== receiptDigest) fail('receipt-digest', 'mission operation receipt digest mismatch');
  return deepFreeze(value);
}

export async function createMissionOperationAdapter({
  operationKind,
  adapterId,
  adapterVersion,
  sourceDescriptor,
  source,
} = {}) {
  const optionKeys = ['operationKind', 'adapterId', 'adapterVersion', 'sourceDescriptor', 'source'];
  if (!source || typeof source !== 'object' || Array.isArray(source)
      || Object.keys(arguments[0] ?? {}).some((key) => !optionKeys.includes(key))) {
    throw new TypeError('mission operation adapter configuration is invalid');
  }
  if (typeof source.descriptor !== 'function'
      || typeof source.reconcile !== 'function'
      || typeof source.execute !== 'function') {
    throw new TypeError('mission operation source methods are required');
  }
  const pinnedSourceDescriptor = verifySourceDescriptor(sourceDescriptor);
  let liveSourceDescriptor;
  try {
    liveSourceDescriptor = verifySourceDescriptor(await source.descriptor(), 'live mission operation source descriptor');
  } catch (error) {
    if (error instanceof MissionOperationAdapterError) throw error;
    throw new TypeError('mission operation source descriptor could not be read', { cause: error });
  }
  if (!same(liveSourceDescriptor, pinnedSourceDescriptor)) {
    fail('source-binding', 'mission operation source descriptor differs from the pinned descriptor');
  }
  const description = buildMissionOperationDescription({
    operationKind,
    adapterId,
    adapterVersion,
    sourceDescriptor: pinnedSourceDescriptor,
  });
  const descriptor = description.missionStepDescriptor;

  async function verifyLiveSource() {
    let live;
    try {
      live = verifySourceDescriptor(await source.descriptor(), 'live mission operation source descriptor');
    } catch (error) {
      if (error instanceof MissionOperationAdapterError) throw error;
      fail('source-descriptor-call', 'mission operation source descriptor could not be read', error);
    }
    if (!same(live, pinnedSourceDescriptor)) fail('source-drift', 'mission operation source descriptor changed');
  }

  async function invoke(method, dispatch) {
    const verifiedDispatch = verifyMissionProgramDispatch(dispatch, description);
    await verifyLiveSource();
    const request = buildMissionOperationRequest({ description, dispatch: verifiedDispatch });
    let response;
    try {
      response = await source[method]({ request: deepFreeze(clone(request)) });
    } catch (error) {
      if (error instanceof MissionOperationAdapterError) throw error;
      throw new MissionOperationAdapterError('source-call', `mission operation source ${method} failed`, error);
    }
    return verifyOutcome(response, { description, dispatch: verifiedDispatch });
  }

  return Object.freeze({
    describe() {
      return deepFreeze(clone(description));
    },
    descriptor() {
      return deepFreeze(clone(descriptor));
    },
    reconcile({ dispatch } = {}) {
      return invoke('reconcile', dispatch);
    },
    execute({ dispatch } = {}) {
      return invoke('execute', dispatch);
    },
  });
}

