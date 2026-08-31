import { verifyCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { verifyMissionPhaseArtifact } from './mission-phase-contracts.mjs';
import { verifyMissionNativePackage } from './mission-native-materializer.mjs';

const DESCRIPTOR_PROTOCOL = 'eternities-identity-bound-native-transport-v1';
const DISPATCH_PROTOCOL = 'eternities-identity-bound-native-dispatch-v1';
const COMPLETION_PROTOCOL = 'eternities-identity-bound-native-completion-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MAXIMUM_BYTES = 16_777_216;

export const IDENTITY_BOUND_NATIVE_AUTHORITY = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

export class IdentityBoundNativeContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IdentityBoundNativeContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new IdentityBoundNativeContractError(code, message);
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

function requireInteger(value, label, minimum, maximum) {
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
  exactKeys(value, Object.keys(IDENTITY_BOUND_NATIVE_AUTHORITY), label);
  if (!same(value, IDENTITY_BOUND_NATIVE_AUTHORITY)) fail('authority-invalid', `${label} must remain empty`);
  return value;
}

function verifyUsage(value, maximumCompletionTokens) {
  exactKeys(value, [
    'inputTokens', 'cachedInputTokens', 'reasoningTokens', 'visibleOutputTokens', 'completionTokens',
  ], 'identity-bound native usage');
  for (const [name, count] of Object.entries(value)) {
    requireInteger(count, `identity-bound native usage ${name}`, 0, 10_000_000);
  }
  if (value.cachedInputTokens > value.inputTokens
      || value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens
      || value.completionTokens > maximumCompletionTokens) {
    fail('usage-invalid', 'identity-bound native usage is contradictory or exceeds its ceiling');
  }
  return value;
}

function verifyOuterDispatch(value) {
  assertSchema('mission-native-dispatch', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'requestDigest', 'executorDescriptorDigest',
    'materializerDigest', 'transportDescriptorDigest', 'packageDigest',
    'maxCompletionTokens', 'package', 'authority', 'dispatchDigest',
  ], 'outer mission native dispatch');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-native-dispatch-v1') {
    fail('outer-dispatch-invalid', 'outer mission native dispatch protocol is invalid');
  }
  verifyMissionNativePackage(value.package);
  verifyAuthority(value.authority, 'outer mission native authority');
  if (value.requestDigest !== value.package.requestDigest
      || value.executorDescriptorDigest !== value.package.executorDescriptorDigest
      || value.materializerDigest !== value.package.materializer.materializerDigest
      || value.packageDigest !== value.package.packageDigest
      || value.maxCompletionTokens !== value.package.maxCompletionTokens) {
    fail('outer-dispatch-invalid', 'outer mission native dispatch package binding is invalid');
  }
  const { dispatchDigest, ...unsigned } = value;
  requireDigest(dispatchDigest, 'outer mission native dispatch');
  if (sha256Value(unsigned) !== dispatchDigest) fail('outer-dispatch-invalid', 'outer mission native dispatch digest mismatch');
  return value;
}

function assertMissionIdentity(candidate, outerDispatch) {
  const identityMission = candidate.modelProjection.mission;
  const packageMission = outerDispatch.package.mission;
  for (const key of ['missionId', 'objective']) {
    if (identityMission[key] !== packageMission[key]) {
      fail('mission-binding-invalid', `identity-bound mission ${key} mismatch`);
    }
  }
  for (const key of ['successEvidence', 'stopConditions']) {
    const identityValues = [...identityMission[key]].sort((left, right) => left.localeCompare(right));
    const packageValues = [...packageMission[key]].sort((left, right) => left.localeCompare(right));
    if (!same(identityValues, packageValues)) {
      fail('mission-binding-invalid', `identity-bound mission ${key} mismatch`);
    }
  }
  if (identityMission.budget.maxCompletionTokens < outerDispatch.maxCompletionTokens) {
    fail('mission-binding-invalid', 'identity-bound mission completion budget is narrower than native dispatch');
  }
}

function verifyDispatchEnvelope(value, transportDescriptor) {
  assertNoCredentialFields(value);
  assertSchema('identity-bound-native-dispatch', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'vesselAdmissionDigest', 'outerDispatchDigest',
    'outerPackageDigest', 'transportDescriptorDigest', 'bindingCandidateId',
    'candidateDigest', 'fullEnvelopeDigest', 'modelProjectionDigest',
    'modelProjection', 'missionPackage', 'maxCompletionTokens', 'authority',
    'dispatchDigest',
  ], 'identity-bound native dispatch');
  if (value.schemaVersion !== 1 || value.protocolId !== DISPATCH_PROTOCOL
      || value.transportDescriptorDigest !== transportDescriptor.descriptorDigest) {
    fail('dispatch-binding-invalid', 'identity-bound native dispatch protocol or transport binding is invalid');
  }
  for (const [label, digest] of [
    ['vessel admission', value.vesselAdmissionDigest],
    ['outer dispatch', value.outerDispatchDigest],
    ['outer package', value.outerPackageDigest],
    ['binding candidate', value.bindingCandidateId],
    ['candidate', value.candidateDigest],
    ['full envelope', value.fullEnvelopeDigest],
    ['model projection', value.modelProjectionDigest],
  ]) requireDigest(digest, label);
  assertSchema('cortex-model-projection', value.modelProjection);
  verifyMissionNativePackage(value.missionPackage);
  requireInteger(value.maxCompletionTokens, 'identity-bound native completion ceiling', 1, 1_000_000);
  if (value.bindingCandidateId !== value.modelProjection.bindingCandidateId
      || value.fullEnvelopeDigest !== value.modelProjection.fullEnvelopeDigest
      || value.modelProjectionDigest !== sha256Value(value.modelProjection)
      || value.outerPackageDigest !== value.missionPackage.packageDigest
      || value.maxCompletionTokens !== value.missionPackage.maxCompletionTokens) {
    fail('dispatch-binding-invalid', 'identity-bound native dispatch content binding is invalid');
  }
  verifyAuthority(value.authority, 'identity-bound native dispatch authority');
  const { dispatchDigest, ...unsigned } = value;
  requireDigest(dispatchDigest, 'identity-bound native dispatch');
  if (sha256Value(unsigned) !== dispatchDigest) fail('dispatch-digest-invalid', 'identity-bound native dispatch digest mismatch');
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > transportDescriptor.maximumDispatchBytes) {
    fail('dispatch-byte-ceiling', 'identity-bound native dispatch exceeds its byte ceiling');
  }
  return value;
}

export function buildIdentityBoundNativeTransportDescriptor({
  transportId,
  maximumDispatchBytes = 1_048_576,
  maximumCompletionBytes = 1_048_576,
} = {}) {
  requireIdentifier(transportId, 'identity-bound native transport id');
  requireInteger(maximumDispatchBytes, 'identity-bound native dispatch byte ceiling', 1024, MAXIMUM_BYTES);
  requireInteger(maximumCompletionBytes, 'identity-bound native completion byte ceiling', 256, MAXIMUM_BYTES);
  const unsigned = {
    schemaVersion: 1,
    protocolId: DESCRIPTOR_PROTOCOL,
    transportId,
    terminalReconciliation: 'by-dispatch-digest',
    atomicDeduplication: true,
    maximumDispatchBytes,
    maximumCompletionBytes,
    authority: clone(IDENTITY_BOUND_NATIVE_AUTHORITY),
  };
  return deepFreeze({ ...unsigned, descriptorDigest: sha256Value(unsigned) });
}

export function verifyIdentityBoundNativeTransportDescriptor(value) {
  assertNoCredentialFields(value);
  assertSchema('identity-bound-native-transport-descriptor', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'transportId', 'terminalReconciliation',
    'atomicDeduplication', 'maximumDispatchBytes', 'maximumCompletionBytes',
    'authority', 'descriptorDigest',
  ], 'identity-bound native transport descriptor');
  requireIdentifier(value.transportId, 'identity-bound native transport id');
  requireInteger(value.maximumDispatchBytes, 'identity-bound native dispatch byte ceiling', 1024, MAXIMUM_BYTES);
  requireInteger(value.maximumCompletionBytes, 'identity-bound native completion byte ceiling', 256, MAXIMUM_BYTES);
  if (value.schemaVersion !== 1 || value.protocolId !== DESCRIPTOR_PROTOCOL
      || value.terminalReconciliation !== 'by-dispatch-digest'
      || value.atomicDeduplication !== true) {
    fail('descriptor-invalid', 'identity-bound native transport descriptor is invalid');
  }
  verifyAuthority(value.authority, 'identity-bound native transport authority');
  const { descriptorDigest, ...unsigned } = value;
  requireDigest(descriptorDigest, 'identity-bound native transport descriptor');
  if (sha256Value(unsigned) !== descriptorDigest) fail('descriptor-invalid', 'identity-bound native transport descriptor digest mismatch');
  return value;
}

export function buildIdentityBoundNativeDispatch({
  candidate: inputCandidate,
  vesselAdmissionDigest,
  outerDispatch: inputOuterDispatch,
  transportDescriptor: inputTransportDescriptor,
} = {}) {
  const candidate = verifyCortexBindingCandidate(clone(inputCandidate));
  const outerDispatch = verifyOuterDispatch(clone(inputOuterDispatch));
  const transportDescriptor = verifyIdentityBoundNativeTransportDescriptor(clone(inputTransportDescriptor));
  requireDigest(vesselAdmissionDigest, 'identity-bound vessel admission');
  assertMissionIdentity(candidate, outerDispatch);
  const unsigned = {
    schemaVersion: 1,
    protocolId: DISPATCH_PROTOCOL,
    vesselAdmissionDigest,
    outerDispatchDigest: outerDispatch.dispatchDigest,
    outerPackageDigest: outerDispatch.packageDigest,
    transportDescriptorDigest: transportDescriptor.descriptorDigest,
    bindingCandidateId: candidate.bindingCandidateId,
    candidateDigest: candidate.candidateDigest,
    fullEnvelopeDigest: candidate.fullEnvelopeDigest,
    modelProjectionDigest: candidate.modelProjectionDigest,
    modelProjection: clone(candidate.modelProjection),
    missionPackage: clone(outerDispatch.package),
    maxCompletionTokens: outerDispatch.maxCompletionTokens,
    authority: clone(IDENTITY_BOUND_NATIVE_AUTHORITY),
  };
  assertNoCredentialFields(unsigned);
  const value = { ...unsigned, dispatchDigest: sha256Value(unsigned) };
  verifyIdentityBoundNativeDispatch(value, {
    candidate,
    vesselAdmissionDigest,
    outerDispatch,
    transportDescriptor,
  });
  return deepFreeze(value);
}

export function verifyIdentityBoundNativeDispatch(value, {
  candidate: inputCandidate,
  vesselAdmissionDigest,
  outerDispatch: inputOuterDispatch,
  transportDescriptor: inputTransportDescriptor,
} = {}) {
  const candidate = verifyCortexBindingCandidate(clone(inputCandidate));
  const outerDispatch = verifyOuterDispatch(clone(inputOuterDispatch));
  const transportDescriptor = verifyIdentityBoundNativeTransportDescriptor(clone(inputTransportDescriptor));
  verifyDispatchEnvelope(value, transportDescriptor);
  requireDigest(vesselAdmissionDigest, 'identity-bound vessel admission');
  assertMissionIdentity(candidate, outerDispatch);
  if (value.schemaVersion !== 1 || value.protocolId !== DISPATCH_PROTOCOL
      || value.vesselAdmissionDigest !== vesselAdmissionDigest
      || value.outerDispatchDigest !== outerDispatch.dispatchDigest
      || value.outerPackageDigest !== outerDispatch.packageDigest
      || value.transportDescriptorDigest !== transportDescriptor.descriptorDigest
      || value.bindingCandidateId !== candidate.bindingCandidateId
      || value.candidateDigest !== candidate.candidateDigest
      || value.fullEnvelopeDigest !== candidate.fullEnvelopeDigest
      || value.modelProjectionDigest !== candidate.modelProjectionDigest
      || !same(value.modelProjection, candidate.modelProjection)
      || !same(value.missionPackage, outerDispatch.package)
      || value.maxCompletionTokens !== outerDispatch.maxCompletionTokens) {
    fail('dispatch-binding-invalid', 'identity-bound native dispatch binding is invalid');
  }
  return value;
}

export function buildIdentityBoundNativeCompletion({
  dispatch,
  transportDescriptor,
  artifact,
  usage,
  startedAt,
  completedAt,
} = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: COMPLETION_PROTOCOL,
    status: 'completed',
    dispatchDigest: dispatch?.dispatchDigest,
    outerDispatchDigest: dispatch?.outerDispatchDigest,
    transportDescriptorDigest: transportDescriptor?.descriptorDigest,
    candidateDigest: dispatch?.candidateDigest,
    modelProjectionDigest: dispatch?.modelProjectionDigest,
    artifact: clone(artifact),
    usage: clone(usage),
    startedAt,
    completedAt,
    authority: clone(IDENTITY_BOUND_NATIVE_AUTHORITY),
  };
  const value = { ...unsigned, completionDigest: sha256Value(unsigned) };
  verifyIdentityBoundNativeCompletion(value, { dispatch, transportDescriptor });
  return deepFreeze(value);
}

export function verifyIdentityBoundNativeCompletion(value, {
  dispatch,
  transportDescriptor: inputTransportDescriptor,
} = {}) {
  assertNoCredentialFields(value);
  assertSchema('identity-bound-native-completion', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'dispatchDigest',
    'outerDispatchDigest', 'transportDescriptorDigest', 'candidateDigest',
    'modelProjectionDigest', 'artifact', 'usage', 'startedAt', 'completedAt',
    'authority', 'completionDigest',
  ], 'identity-bound native completion');
  const transportDescriptor = verifyIdentityBoundNativeTransportDescriptor(clone(inputTransportDescriptor));
  verifyDispatchEnvelope(dispatch, transportDescriptor);
  if (value.schemaVersion !== 1 || value.protocolId !== COMPLETION_PROTOCOL || value.status !== 'completed'
      || value.dispatchDigest !== dispatch.dispatchDigest
      || value.outerDispatchDigest !== dispatch.outerDispatchDigest
      || value.transportDescriptorDigest !== transportDescriptor.descriptorDigest
      || value.transportDescriptorDigest !== dispatch.transportDescriptorDigest
      || value.candidateDigest !== dispatch.candidateDigest
      || value.modelProjectionDigest !== dispatch.modelProjectionDigest) {
    fail('completion-binding-invalid', 'identity-bound native completion binding is invalid');
  }
  verifyMissionPhaseArtifact(value.artifact, { phase: 'native', inputs: [] });
  if (Buffer.byteLength(canonicalJson(value.artifact), 'utf8') > dispatch.missionPackage.maxArtifactBytes) {
    fail('artifact-byte-ceiling', 'identity-bound native artifact exceeds the mission ceiling');
  }
  verifyUsage(value.usage, dispatch.maxCompletionTokens);
  requireIso(value.startedAt, 'identity-bound native start');
  requireIso(value.completedAt, 'identity-bound native completion');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    fail('completion-time-invalid', 'identity-bound native completion precedes its start');
  }
  verifyAuthority(value.authority, 'identity-bound native completion authority');
  const { completionDigest, ...unsigned } = value;
  requireDigest(completionDigest, 'identity-bound native completion');
  if (sha256Value(unsigned) !== completionDigest) fail('completion-digest-invalid', 'identity-bound native completion digest mismatch');
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > transportDescriptor.maximumCompletionBytes) {
    fail('completion-byte-ceiling', 'identity-bound native completion exceeds its byte ceiling');
  }
  return value;
}
