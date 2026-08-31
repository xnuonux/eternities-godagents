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
  EMPTY_REVISION_AUTHORITY,
  verifyMissionRevisionPackage,
} from './mission-revision-materializer.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DESCRIPTOR_PROTOCOL = 'eternities-mission-revision-transport-v1';
const DISPATCH_PROTOCOL = 'eternities-mission-revision-dispatch-v1';
const COMPLETION_PROTOCOL = 'eternities-mission-revision-transport-completion-v1';
const MAXIMUM_BYTES = 16_777_216;

export class MissionRevisionTransportContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionRevisionTransportContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionRevisionTransportContractError(code, message);
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
  exactKeys(value, Object.keys(EMPTY_REVISION_AUTHORITY), label);
  if (!same(value, EMPTY_REVISION_AUTHORITY)) fail('authority-invalid', `${label} must remain empty`);
  return value;
}

function verifyUsage(value, maximumCompletionTokens) {
  exactKeys(value, [
    'inputTokens', 'cachedInputTokens', 'reasoningTokens', 'visibleOutputTokens', 'completionTokens',
  ], 'mission revision transport usage');
  for (const [name, count] of Object.entries(value)) {
    requireInteger(count, `mission revision transport usage ${name}`, { maximum: 10_000_000 });
  }
  if (value.cachedInputTokens > value.inputTokens
      || value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens
      || value.completionTokens > maximumCompletionTokens) {
    fail('usage-invalid', 'mission revision token usage is contradictory or exceeds the request ceiling');
  }
  return value;
}

function verifyAddressedFindings(artifact, packageValue) {
  const known = new Set(packageValue.review.artifact.findings.map(({ id }) => id));
  const addressed = new Set(artifact.addressedFindingIds);
  const unknown = artifact.addressedFindingIds.filter((id) => !known.has(id));
  const missing = packageValue.requiredFindingIds.filter((id) => !addressed.has(id));
  if (unknown.length > 0 || missing.length > 0) {
    fail('finding-address-invalid', 'mission revision must address every required and only known finding');
  }
}

export function buildMissionRevisionTransportDescriptor({
  transportId,
  maximumCompletionBytes = 1_048_576,
} = {}) {
  requireIdentifier(transportId, 'mission revision transport id');
  requireInteger(maximumCompletionBytes, 'mission revision completion byte ceiling', {
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
    authority: clone(EMPTY_REVISION_AUTHORITY),
  };
  return deepFreeze({ ...unsigned, descriptorDigest: sha256Value(unsigned) });
}

export function verifyMissionRevisionTransportDescriptor(value) {
  assertSchema('mission-revision-transport-descriptor', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'transportId', 'terminalReconciliation',
    'atomicDeduplication', 'maximumCompletionBytes', 'authority', 'descriptorDigest',
  ], 'mission revision transport descriptor');
  requireIdentifier(value.transportId, 'mission revision transport id');
  requireInteger(value.maximumCompletionBytes, 'mission revision completion byte ceiling', {
    minimum: 256,
    maximum: MAXIMUM_BYTES,
  });
  if (value.schemaVersion !== 1 || value.protocolId !== DESCRIPTOR_PROTOCOL
      || value.terminalReconciliation !== 'by-dispatch-digest'
      || value.atomicDeduplication !== true) {
    fail('transport-descriptor-invalid', 'mission revision transport descriptor protocol is invalid');
  }
  verifyAuthority(value.authority, 'mission revision transport authority');
  const { descriptorDigest, ...unsigned } = value;
  requireDigest(descriptorDigest, 'mission revision transport descriptor');
  if (sha256Value(unsigned) !== descriptorDigest) {
    fail('transport-descriptor-invalid', 'mission revision transport descriptor digest mismatch');
  }
  return value;
}

export function buildMissionRevisionDispatch({
  admission,
  request,
  executorDescriptor,
  transportDescriptor,
  packageValue,
} = {}) {
  verifyMissionExecutorDescriptor(executorDescriptor, 'revision');
  verifyMissionAdmission(admission);
  verifyMissionPhaseRequest(request, { admission, descriptor: executorDescriptor });
  verifyMissionRevisionTransportDescriptor(transportDescriptor);
  verifyMissionRevisionPackage(packageValue);
  const unsigned = {
    schemaVersion: 1,
    protocolId: DISPATCH_PROTOCOL,
    requestDigest: request?.requestDigest,
    executorDescriptorDigest: executorDescriptor.descriptorDigest,
    materializerDigest: packageValue.materializer.materializerDigest,
    transportDescriptorDigest: transportDescriptor.descriptorDigest,
    packageDigest: packageValue.packageDigest,
    maxCompletionTokens: request?.maxCompletionTokens,
    package: clone(packageValue),
    authority: clone(EMPTY_REVISION_AUTHORITY),
  };
  const value = { ...unsigned, dispatchDigest: sha256Value(unsigned) };
  verifyMissionRevisionDispatch(value, { admission, request, executorDescriptor, transportDescriptor });
  return deepFreeze(value);
}

export function verifyMissionRevisionDispatch(value, {
  admission,
  request,
  executorDescriptor,
  transportDescriptor,
} = {}) {
  assertSchema('mission-revision-dispatch', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'requestDigest', 'executorDescriptorDigest',
    'materializerDigest', 'transportDescriptorDigest', 'packageDigest',
    'maxCompletionTokens', 'package', 'authority', 'dispatchDigest',
  ], 'mission revision dispatch');
  verifyMissionExecutorDescriptor(executorDescriptor, 'revision');
  verifyMissionAdmission(admission);
  verifyMissionPhaseRequest(request, { admission, descriptor: executorDescriptor });
  verifyMissionRevisionTransportDescriptor(transportDescriptor);
  verifyMissionRevisionPackage(value.package);
  requireDigest(request?.requestDigest, 'mission revision request');
  requireInteger(request?.maxCompletionTokens, 'mission revision request completion ceiling', {
    minimum: 1,
    maximum: 1_000_000,
  });
  const requestInputs = new Map(request.inputs.map(({ role, artifactDigest }) => [role, artifactDigest]));
  if (request.phase !== 'revision' || request.round !== 1
      || request.executorDescriptorDigest !== executorDescriptor.descriptorDigest
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
      || value.package.maxArtifactBytes !== admission.budgets.maxArtifactBytes
      || value.package.native.artifactDigest !== requestInputs.get('native')
      || value.package.review.artifactDigest !== requestInputs.get('review')) {
    fail('dispatch-binding-invalid', 'mission revision dispatch identity or package binding is invalid');
  }
  verifyAuthority(value.authority, 'mission revision dispatch authority');
  const { dispatchDigest, ...unsigned } = value;
  requireDigest(dispatchDigest, 'mission revision dispatch');
  if (sha256Value(unsigned) !== dispatchDigest) fail('dispatch-digest-invalid', 'mission revision dispatch digest mismatch');
  return value;
}

export function buildMissionRevisionTransportCompletion({
  dispatch,
  transportDescriptor,
  artifact,
  usage,
  startedAt,
  completedAt,
} = {}) {
  verifyMissionRevisionTransportDescriptor(transportDescriptor);
  object(dispatch, 'mission revision dispatch');
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
    authority: clone(EMPTY_REVISION_AUTHORITY),
  };
  const value = { ...unsigned, completionDigest: sha256Value(unsigned) };
  verifyMissionRevisionTransportCompletion(value, { dispatch, transportDescriptor });
  return deepFreeze(value);
}

export function verifyMissionRevisionTransportCompletion(value, {
  dispatch,
  transportDescriptor,
} = {}) {
  assertSchema('mission-revision-transport-completion', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'dispatchDigest', 'requestDigest',
    'executorDescriptorDigest', 'materializerDigest', 'transportDescriptorDigest',
    'packageDigest', 'artifact', 'usage', 'startedAt', 'completedAt', 'authority',
    'completionDigest',
  ], 'mission revision transport completion');
  verifyMissionRevisionTransportDescriptor(transportDescriptor);
  object(dispatch, 'mission revision dispatch');
  verifyMissionRevisionPackage(dispatch.package);
  if (value.schemaVersion !== 1 || value.protocolId !== COMPLETION_PROTOCOL || value.status !== 'completed'
      || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== dispatch.requestDigest
      || value.executorDescriptorDigest !== dispatch.executorDescriptorDigest
      || value.materializerDigest !== dispatch.materializerDigest
      || value.transportDescriptorDigest !== transportDescriptor.descriptorDigest
      || value.transportDescriptorDigest !== dispatch.transportDescriptorDigest
      || value.packageDigest !== dispatch.packageDigest) {
    fail('completion-binding-invalid', 'mission revision transport completion binding is invalid');
  }
  verifyMissionPhaseArtifact(value.artifact, {
    phase: 'revision',
    inputs: [
      { role: 'native', artifactDigest: dispatch.package.native.artifactDigest },
      { role: 'review', artifactDigest: dispatch.package.review.artifactDigest },
    ],
  });
  verifyAddressedFindings(value.artifact, dispatch.package);
  if (Buffer.byteLength(canonicalJson(value.artifact), 'utf8') > dispatch.package.maxArtifactBytes) {
    fail('artifact-byte-ceiling', 'mission revision artifact exceeds the admitted byte ceiling');
  }
  verifyUsage(value.usage, dispatch.maxCompletionTokens);
  requireIso(value.startedAt, 'mission revision transport start');
  requireIso(value.completedAt, 'mission revision transport completion');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    fail('completion-time-invalid', 'mission revision transport completed before it started');
  }
  verifyAuthority(value.authority, 'mission revision transport completion authority');
  const { completionDigest, ...unsigned } = value;
  requireDigest(completionDigest, 'mission revision transport completion');
  if (sha256Value(unsigned) !== completionDigest) {
    fail('completion-digest-invalid', 'mission revision transport completion digest mismatch');
  }
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > transportDescriptor.maximumCompletionBytes) {
    fail('completion-byte-ceiling', 'mission revision transport completion exceeds its byte ceiling');
  }
  return value;
}
