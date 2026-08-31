import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  verifyMissionAdmission,
  verifyMissionExecutorDescriptor,
  verifyMissionPhaseArtifact,
  verifyMissionPhaseRequest,
} from './mission-phase-contracts.mjs';
import {
  EMPTY_NATIVE_AUTHORITY,
  verifyMissionNativePackage,
} from './mission-native-materializer.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DESCRIPTOR_PROTOCOL = 'eternities-mission-native-transport-v1';
const DISPATCH_PROTOCOL = 'eternities-mission-native-dispatch-v1';
const COMPLETION_PROTOCOL = 'eternities-mission-native-transport-completion-v1';
const MAXIMUM_BYTES = 16_777_216;

export class MissionNativeTransportContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionNativeTransportContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionNativeTransportContractError(code, message);
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

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} digest is invalid`);
  return value;
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('identifier-invalid', `${label} is invalid`);
  return value;
}

function requireInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function requireIso(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('time-invalid', `${label} time is invalid`);
  }
  return value;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
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

function verifyAuthority(value, label) {
  exactKeys(value, Object.keys(EMPTY_NATIVE_AUTHORITY), label);
  if (!same(value, EMPTY_NATIVE_AUTHORITY)) fail('authority-invalid', `${label} must remain empty`);
  return value;
}

function verifyUsage(value, maximumCompletionTokens) {
  exactKeys(value, [
    'inputTokens', 'cachedInputTokens', 'reasoningTokens', 'visibleOutputTokens', 'completionTokens',
  ], 'mission native transport usage');
  for (const [name, count] of Object.entries(value)) {
    requireInteger(count, `mission native transport usage ${name}`, { maximum: 10_000_000 });
  }
  if (value.cachedInputTokens > value.inputTokens
      || value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens
      || value.completionTokens > maximumCompletionTokens) {
    fail('usage-invalid', 'mission native token usage is contradictory or exceeds the request ceiling');
  }
  return value;
}

function requestInputMap(request) {
  return new Map(request.inputs.map(({ role, artifactDigest }) => [role, artifactDigest]));
}

function verifyGodskillsDispatchBinding(packageValue, admission, request) {
  const inputs = requestInputMap(request);
  if (admission.godskills === null) {
    if (packageValue.godskills !== null || inputs.size !== 0) {
      fail('dispatch-binding-invalid', 'native-only dispatch carried Godskills context or phase input');
    }
    return;
  }
  if (packageValue.godskills === null
      || packageValue.godskills.bindingDigest !== admission.godskills.bindingDigest
      || packageValue.godskills.packageDigest !== admission.godskills.receipt.packageDigest
      || !same(packageValue.godskills.cortexPackage, admission.godskills.cortexPackage)
      || inputs.size !== 1
      || inputs.get('godskills-package') !== admission.godskills.receipt.packageDigest) {
    fail('dispatch-binding-invalid', 'mission native Godskills package differs from admission or request');
  }
}

export function buildMissionNativeTransportDescriptor({
  transportId,
  maximumCompletionBytes = 1_048_576,
} = {}) {
  requireIdentifier(transportId, 'mission native transport id');
  requireInteger(maximumCompletionBytes, 'mission native completion byte ceiling', {
    minimum: 256,
    maximum: MAXIMUM_BYTES,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: DESCRIPTOR_PROTOCOL,
    transportId,
    terminalReconciliation: 'by-dispatch-digest',
    atomicDeduplication: true,
    maximumCompletionBytes,
    authority: clone(EMPTY_NATIVE_AUTHORITY),
  };
  return deepFreeze({ ...unsigned, descriptorDigest: sha256Value(unsigned) });
}

export function verifyMissionNativeTransportDescriptor(value) {
  assertSchema('mission-native-transport-descriptor', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'transportId', 'terminalReconciliation',
    'atomicDeduplication', 'maximumCompletionBytes', 'authority', 'descriptorDigest',
  ], 'mission native transport descriptor');
  requireIdentifier(value.transportId, 'mission native transport id');
  requireInteger(value.maximumCompletionBytes, 'mission native completion byte ceiling', {
    minimum: 256,
    maximum: MAXIMUM_BYTES,
  });
  if (value.schemaVersion !== 1 || value.protocolId !== DESCRIPTOR_PROTOCOL
      || value.terminalReconciliation !== 'by-dispatch-digest'
      || value.atomicDeduplication !== true) {
    fail('transport-descriptor-invalid', 'mission native transport descriptor protocol is invalid');
  }
  verifyAuthority(value.authority, 'mission native transport authority');
  const { descriptorDigest, ...unsigned } = value;
  requireDigest(descriptorDigest, 'mission native transport descriptor');
  if (sha256Value(unsigned) !== descriptorDigest) {
    fail('transport-descriptor-invalid', 'mission native transport descriptor digest mismatch');
  }
  return value;
}

export function buildMissionNativeDispatch({
  admission,
  request,
  executorDescriptor,
  transportDescriptor,
  packageValue,
} = {}) {
  verifyMissionExecutorDescriptor(executorDescriptor, 'native');
  verifyMissionAdmission(admission);
  verifyMissionPhaseRequest(request, { admission, descriptor: executorDescriptor });
  verifyMissionNativeTransportDescriptor(transportDescriptor);
  verifyMissionNativePackage(packageValue);
  const unsigned = {
    schemaVersion: 1,
    protocolId: DISPATCH_PROTOCOL,
    requestDigest: request.requestDigest,
    executorDescriptorDigest: executorDescriptor.descriptorDigest,
    materializerDigest: packageValue.materializer.materializerDigest,
    transportDescriptorDigest: transportDescriptor.descriptorDigest,
    packageDigest: packageValue.packageDigest,
    maxCompletionTokens: request.maxCompletionTokens,
    package: clone(packageValue),
    authority: clone(EMPTY_NATIVE_AUTHORITY),
  };
  const value = { ...unsigned, dispatchDigest: sha256Value(unsigned) };
  verifyMissionNativeDispatch(value, { admission, request, executorDescriptor, transportDescriptor });
  return deepFreeze(value);
}

export function verifyMissionNativeDispatch(value, {
  admission,
  request,
  executorDescriptor,
  transportDescriptor,
} = {}) {
  assertSchema('mission-native-dispatch', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'requestDigest', 'executorDescriptorDigest',
    'materializerDigest', 'transportDescriptorDigest', 'packageDigest',
    'maxCompletionTokens', 'package', 'authority', 'dispatchDigest',
  ], 'mission native dispatch');
  verifyMissionExecutorDescriptor(executorDescriptor, 'native');
  verifyMissionAdmission(admission);
  verifyMissionPhaseRequest(request, { admission, descriptor: executorDescriptor });
  verifyMissionNativeTransportDescriptor(transportDescriptor);
  verifyMissionNativePackage(value.package);
  if (request.phase !== 'native' || request.round !== 1
      || value.schemaVersion !== 1 || value.protocolId !== DISPATCH_PROTOCOL
      || value.requestDigest !== request.requestDigest
      || value.executorDescriptorDigest !== executorDescriptor.descriptorDigest
      || value.materializerDigest !== value.package.materializer.materializerDigest
      || value.transportDescriptorDigest !== transportDescriptor.descriptorDigest
      || value.packageDigest !== value.package.packageDigest
      || value.maxCompletionTokens !== request.maxCompletionTokens
      || value.package.requestDigest !== request.requestDigest
      || !same(value.package.mission, admission.mission)
      || value.package.mission.missionId !== request.missionId
      || value.package.admissionDigest !== admission.admissionDigest
      || value.package.admissionDigest !== request.admissionDigest
      || value.package.executorDescriptorDigest !== executorDescriptor.descriptorDigest
      || value.package.maxCompletionTokens !== request.maxCompletionTokens
      || value.package.maxArtifactBytes !== admission.budgets.maxArtifactBytes) {
    fail('dispatch-binding-invalid', 'mission native dispatch identity or package binding is invalid');
  }
  verifyGodskillsDispatchBinding(value.package, admission, request);
  verifyAuthority(value.authority, 'mission native dispatch authority');
  const { dispatchDigest, ...unsigned } = value;
  requireDigest(dispatchDigest, 'mission native dispatch');
  if (sha256Value(unsigned) !== dispatchDigest) fail('dispatch-digest-invalid', 'mission native dispatch digest mismatch');
  return value;
}

export function buildMissionNativeTransportCompletion({
  dispatch,
  transportDescriptor,
  artifact,
  usage,
  startedAt,
  completedAt,
} = {}) {
  verifyMissionNativeTransportDescriptor(transportDescriptor);
  object(dispatch, 'mission native dispatch');
  const unsigned = {
    schemaVersion: 1,
    protocolId: COMPLETION_PROTOCOL,
    status: 'completed',
    dispatchDigest: dispatch.dispatchDigest,
    requestDigest: dispatch.requestDigest,
    executorDescriptorDigest: dispatch.executorDescriptorDigest,
    materializerDigest: dispatch.materializerDigest,
    transportDescriptorDigest: dispatch.transportDescriptorDigest,
    packageDigest: dispatch.packageDigest,
    artifact: clone(artifact),
    usage: clone(usage),
    startedAt,
    completedAt,
    authority: clone(EMPTY_NATIVE_AUTHORITY),
  };
  const value = { ...unsigned, completionDigest: sha256Value(unsigned) };
  verifyMissionNativeTransportCompletion(value, { dispatch, transportDescriptor });
  return deepFreeze(value);
}

export function verifyMissionNativeTransportCompletion(value, {
  dispatch,
  transportDescriptor,
} = {}) {
  assertSchema('mission-native-transport-completion', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'dispatchDigest', 'requestDigest',
    'executorDescriptorDigest', 'materializerDigest', 'transportDescriptorDigest',
    'packageDigest', 'artifact', 'usage', 'startedAt', 'completedAt', 'authority',
    'completionDigest',
  ], 'mission native transport completion');
  verifyMissionNativeTransportDescriptor(transportDescriptor);
  object(dispatch, 'mission native dispatch');
  verifyMissionNativePackage(dispatch.package);
  if (value.schemaVersion !== 1 || value.protocolId !== COMPLETION_PROTOCOL || value.status !== 'completed'
      || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== dispatch.requestDigest
      || value.executorDescriptorDigest !== dispatch.executorDescriptorDigest
      || value.materializerDigest !== dispatch.materializerDigest
      || value.transportDescriptorDigest !== transportDescriptor.descriptorDigest
      || value.transportDescriptorDigest !== dispatch.transportDescriptorDigest
      || value.packageDigest !== dispatch.packageDigest) {
    fail('completion-binding-invalid', 'mission native transport completion binding is invalid');
  }
  verifyMissionPhaseArtifact(value.artifact, { phase: 'native', inputs: [] });
  if (Buffer.byteLength(canonicalJson(value.artifact), 'utf8') > dispatch.package.maxArtifactBytes) {
    fail('artifact-byte-ceiling', 'mission native artifact exceeds the admitted byte ceiling');
  }
  verifyUsage(value.usage, dispatch.maxCompletionTokens);
  requireIso(value.startedAt, 'mission native transport start');
  requireIso(value.completedAt, 'mission native transport completion');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    fail('completion-time-invalid', 'mission native transport completed before it started');
  }
  verifyAuthority(value.authority, 'mission native transport completion authority');
  const { completionDigest, ...unsigned } = value;
  requireDigest(completionDigest, 'mission native transport completion');
  if (sha256Value(unsigned) !== completionDigest) {
    fail('completion-digest-invalid', 'mission native transport completion digest mismatch');
  }
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > transportDescriptor.maximumCompletionBytes) {
    fail('completion-byte-ceiling', 'mission native transport completion exceeds its byte ceiling');
  }
  return value;
}
