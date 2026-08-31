import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  verifyMissionExecutorDescriptor,
  verifyMissionPhaseArtifact,
} from '../runtime/mission-phase-contracts.mjs';
import { verifyDeferredGodskillsReviewPackage } from './deferred-review-materializer.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DESCRIPTOR_PROTOCOL = 'eternities-godskills-review-transport-v1';
const DISPATCH_PROTOCOL = 'eternities-godskills-review-dispatch-v1';
const COMPLETION_PROTOCOL = 'eternities-godskills-review-transport-completion-v1';
const MAXIMUM_BYTES = 16_777_216;

export const EMPTY_REVIEW_AUTHORITY = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

export class GodskillsReviewTransportContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GodskillsReviewTransportContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new GodskillsReviewTransportContractError(code, message);
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
  exactKeys(value, Object.keys(EMPTY_REVIEW_AUTHORITY), label);
  if (!same(value, EMPTY_REVIEW_AUTHORITY)) fail('authority-invalid', `${label} must remain empty`);
  return value;
}

function verifyUsage(value, maximumCompletionTokens) {
  exactKeys(value, [
    'inputTokens',
    'cachedInputTokens',
    'reasoningTokens',
    'visibleOutputTokens',
    'completionTokens',
  ], 'review transport usage');
  for (const [name, count] of Object.entries(value)) {
    requireInteger(count, `review transport usage ${name}`, { maximum: 10_000_000 });
  }
  if (value.cachedInputTokens > value.inputTokens
      || value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens
      || value.completionTokens > maximumCompletionTokens) {
    fail('usage-invalid', 'review transport token usage is contradictory or exceeds the request ceiling');
  }
  return value;
}

export function buildGodskillsReviewTransportDescriptor({
  transportId,
  maximumCompletionBytes = 1_048_576,
} = {}) {
  requireIdentifier(transportId, 'review transport id');
  requireInteger(maximumCompletionBytes, 'review transport completion byte ceiling', {
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
    authority: clone(EMPTY_REVIEW_AUTHORITY),
  };
  return deepFreeze({ ...unsigned, descriptorDigest: sha256Value(unsigned) });
}

export function verifyGodskillsReviewTransportDescriptor(value) {
  assertSchema('godskills-review-transport-descriptor', value);
  exactKeys(value, [
    'schemaVersion',
    'protocolId',
    'transportId',
    'terminalReconciliation',
    'atomicDeduplication',
    'maximumCompletionBytes',
    'authority',
    'descriptorDigest',
  ], 'review transport descriptor');
  requireIdentifier(value.transportId, 'review transport id');
  requireInteger(value.maximumCompletionBytes, 'review transport completion byte ceiling', {
    minimum: 256,
    maximum: MAXIMUM_BYTES,
  });
  if (value.schemaVersion !== 1 || value.protocolId !== DESCRIPTOR_PROTOCOL
      || value.terminalReconciliation !== 'by-dispatch-digest'
      || value.atomicDeduplication !== true) {
    fail('transport-descriptor-invalid', 'review transport descriptor protocol is invalid');
  }
  verifyAuthority(value.authority, 'review transport authority');
  const { descriptorDigest, ...unsigned } = value;
  requireDigest(descriptorDigest, 'review transport descriptor');
  if (sha256Value(unsigned) !== descriptorDigest) {
    fail('transport-descriptor-invalid', 'review transport descriptor digest mismatch');
  }
  return value;
}

export function buildGodskillsReviewDispatch({
  request,
  executorDescriptor,
  transportDescriptor,
  packageValue,
} = {}) {
  verifyMissionExecutorDescriptor(executorDescriptor, 'review');
  verifyGodskillsReviewTransportDescriptor(transportDescriptor);
  verifyDeferredGodskillsReviewPackage(packageValue);
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
    authority: clone(EMPTY_REVIEW_AUTHORITY),
  };
  const value = { ...unsigned, dispatchDigest: sha256Value(unsigned) };
  verifyGodskillsReviewDispatch(value, { request, executorDescriptor, transportDescriptor });
  return deepFreeze(value);
}

export function verifyGodskillsReviewDispatch(value, {
  request,
  executorDescriptor,
  transportDescriptor,
} = {}) {
  assertSchema('godskills-review-dispatch', value);
  exactKeys(value, [
    'schemaVersion',
    'protocolId',
    'requestDigest',
    'executorDescriptorDigest',
    'materializerDigest',
    'transportDescriptorDigest',
    'packageDigest',
    'maxCompletionTokens',
    'package',
    'authority',
    'dispatchDigest',
  ], 'Godskills review dispatch');
  verifyMissionExecutorDescriptor(executorDescriptor, 'review');
  verifyGodskillsReviewTransportDescriptor(transportDescriptor);
  verifyDeferredGodskillsReviewPackage(value.package);
  requireDigest(request?.requestDigest, 'review request');
  requireInteger(request?.maxCompletionTokens, 'review request completion ceiling', { minimum: 1, maximum: 1_000_000 });
  const requestInputs = new Map(request.inputs.map(({ role, artifactDigest }) => [role, artifactDigest]));
  if (request.phase !== 'review'
      || request.executorDescriptorDigest !== executorDescriptor.descriptorDigest
      || value.schemaVersion !== 1
      || value.protocolId !== DISPATCH_PROTOCOL
      || value.requestDigest !== request.requestDigest
      || value.executorDescriptorDigest !== executorDescriptor.descriptorDigest
      || value.materializerDigest !== value.package.materializer.materializerDigest
      || value.transportDescriptorDigest !== transportDescriptor.descriptorDigest
      || value.packageDigest !== value.package.packageDigest
      || value.maxCompletionTokens !== request.maxCompletionTokens
      || value.package.requestDigest !== request.requestDigest
      || value.package.mission.missionId !== request.missionId
      || value.package.admissionDigest !== request.admissionDigest
      || value.package.executorDescriptorDigest !== executorDescriptor.descriptorDigest
      || value.package.round !== request.round
      || value.package.maxCompletionTokens !== request.maxCompletionTokens) {
    fail('dispatch-binding-invalid', 'Godskills review dispatch identity or package binding is invalid');
  }
  if (value.package.godskills.bindingDigest !== requestInputs.get('godskills-binding')
      || value.package.subject.artifactDigest !== requestInputs.get('subject')
      || (request.round === 2
        && (value.package.subject.artifactDigest !== requestInputs.get('revision')
          || value.package.priorReview.artifactDigest !== requestInputs.get('prior-review')))) {
    fail('dispatch-context-invalid', 'Godskills review dispatch artifact context is detached from its request');
  }
  verifyAuthority(value.authority, 'Godskills review dispatch authority');
  const { dispatchDigest, ...unsigned } = value;
  requireDigest(dispatchDigest, 'Godskills review dispatch');
  if (sha256Value(unsigned) !== dispatchDigest) fail('dispatch-digest-invalid', 'Godskills review dispatch digest mismatch');
  return value;
}

export function buildGodskillsReviewTransportCompletion({
  dispatch,
  transportDescriptor,
  artifact,
  usage,
  startedAt,
  completedAt,
} = {}) {
  verifyGodskillsReviewTransportDescriptor(transportDescriptor);
  object(dispatch, 'Godskills review dispatch');
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
    authority: clone(EMPTY_REVIEW_AUTHORITY),
  };
  const value = { ...unsigned, completionDigest: sha256Value(unsigned) };
  verifyGodskillsReviewTransportCompletion(value, { dispatch, transportDescriptor });
  return deepFreeze(value);
}

export function verifyGodskillsReviewTransportCompletion(value, {
  dispatch,
  transportDescriptor,
} = {}) {
  assertSchema('godskills-review-transport-completion', value);
  exactKeys(value, [
    'schemaVersion',
    'protocolId',
    'status',
    'dispatchDigest',
    'requestDigest',
    'executorDescriptorDigest',
    'materializerDigest',
    'transportDescriptorDigest',
    'packageDigest',
    'artifact',
    'usage',
    'startedAt',
    'completedAt',
    'authority',
    'completionDigest',
  ], 'Godskills review transport completion');
  verifyGodskillsReviewTransportDescriptor(transportDescriptor);
  object(dispatch, 'Godskills review dispatch');
  if (value.schemaVersion !== 1 || value.protocolId !== COMPLETION_PROTOCOL || value.status !== 'completed'
      || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== dispatch.requestDigest
      || value.executorDescriptorDigest !== dispatch.executorDescriptorDigest
      || value.materializerDigest !== dispatch.materializerDigest
      || value.transportDescriptorDigest !== transportDescriptor.descriptorDigest
      || value.transportDescriptorDigest !== dispatch.transportDescriptorDigest
      || value.packageDigest !== dispatch.packageDigest) {
    fail('completion-binding-invalid', 'Godskills review transport completion binding is invalid');
  }
  verifyMissionPhaseArtifact(value.artifact, {
    phase: 'review',
    inputs: [{ role: 'subject', artifactDigest: dispatch.package.subject.artifactDigest }],
  });
  verifyUsage(value.usage, dispatch.maxCompletionTokens);
  requireIso(value.startedAt, 'review transport start');
  requireIso(value.completedAt, 'review transport completion');
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    fail('completion-time-invalid', 'review transport completed before it started');
  }
  verifyAuthority(value.authority, 'review transport completion authority');
  const { completionDigest, ...unsigned } = value;
  requireDigest(completionDigest, 'review transport completion');
  if (sha256Value(unsigned) !== completionDigest) {
    fail('completion-digest-invalid', 'Godskills review transport completion digest mismatch');
  }
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > transportDescriptor.maximumCompletionBytes) {
    fail('completion-byte-ceiling', 'Godskills review transport completion exceeds its byte ceiling');
  }
  return value;
}
