import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  verifyMissionAdmission,
  verifyMissionExecutorDescriptor,
  verifyMissionPhaseArtifact,
  verifyMissionPhaseRequest,
} from './mission-phase-contracts.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MATERIALIZER_PROTOCOL = 'eternities-mission-revision-materializer-v1';
const PACKAGE_PROTOCOL = 'eternities-mission-revision-package-v1';
const MAXIMUM_BYTES = 16_777_216;

export const EMPTY_REVISION_AUTHORITY = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

export class MissionRevisionMaterializerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionRevisionMaterializerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionRevisionMaterializerError(code, message);
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

function requireText(value, label, maximum) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.includes('\0')) {
    fail('text-invalid', `${label} is invalid`);
  }
  return value;
}

function requireInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function sortedUniqueStrings(values, label, { minimum = 0, maximum = 128 } = {}) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    fail('set-invalid', `${label} must contain ${minimum} to ${maximum} values`);
  }
  const checked = values.map((value, index) => requireText(value, `${label}[${index}]`, 2048));
  const sorted = [...checked].sort((left, right) => left.localeCompare(right));
  if (new Set(checked).size !== checked.length || checked.some((value, index) => value !== sorted[index])) {
    fail('set-invalid', `${label} must be sorted and unique`);
  }
  return checked;
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

function verifyAuthority(value) {
  exactKeys(value, Object.keys(EMPTY_REVISION_AUTHORITY), 'mission revision authority');
  if (!same(value, EMPTY_REVISION_AUTHORITY)) fail('authority-invalid', 'mission revision authority must remain empty');
}

function verifyMission(value) {
  exactKeys(value, ['missionId', 'objective', 'successEvidence', 'stopConditions'], 'mission revision mission');
  requireIdentifier(value.missionId, 'mission id');
  requireText(value.objective, 'mission objective', 32_768);
  sortedUniqueStrings(value.successEvidence, 'mission success evidence', { minimum: 1, maximum: 32 });
  sortedUniqueStrings(value.stopConditions, 'mission stop conditions', { minimum: 1, maximum: 32 });
  return value;
}

function reference(artifact) {
  const text = canonicalJson(artifact);
  return {
    artifactDigest: sha256Text(text),
    artifactBytes: Buffer.byteLength(text, 'utf8'),
    artifact: clone(artifact),
  };
}

function verifyReference(value, phase, subjectDigest = null) {
  exactKeys(value, ['artifactDigest', 'artifactBytes', 'artifact'], `${phase} revision reference`);
  verifyMissionPhaseArtifact(value.artifact, phase === 'native'
    ? { phase: 'native', inputs: [] }
    : { phase: 'review', inputs: [{ role: 'subject', artifactDigest: subjectDigest }] });
  const text = canonicalJson(value.artifact);
  if (value.artifactDigest !== sha256Text(text)
      || value.artifactBytes !== Buffer.byteLength(text, 'utf8')) {
    fail('artifact-digest-invalid', `${phase} revision reference digest or byte count mismatch`);
  }
  return value;
}

function inputMap(request) {
  return new Map(request.inputs.map(({ role, artifactDigest }) => [role, artifactDigest]));
}

function verifyContext({ admission, request, descriptor, native, review }) {
  verifyMissionAdmission(admission);
  verifyMissionPhaseRequest(request, { admission, descriptor });
  if (request.phase !== 'revision' || request.round !== 1) {
    fail('phase-invalid', 'mission revision materialization requires revision round one');
  }
  const inputs = inputMap(request);
  if (!same([...inputs.keys()], ['native', 'review'])) {
    fail('request-context-invalid', 'mission revision request inputs are invalid');
  }
  const nativeReference = reference(native);
  verifyReference(nativeReference, 'native');
  const reviewReference = reference(review);
  verifyReference(reviewReference, 'review', nativeReference.artifactDigest);
  if (review.recommendation !== 'revise') {
    fail('review-recommendation-invalid', 'mission revision requires one committed revise recommendation');
  }
  if (inputs.get('native') !== nativeReference.artifactDigest
      || inputs.get('review') !== reviewReference.artifactDigest) {
    fail('request-context-invalid', 'mission revision request artifact digest mismatch');
  }
  if (nativeReference.artifactBytes > admission.budgets.maxArtifactBytes
      || reviewReference.artifactBytes > admission.budgets.maxArtifactBytes) {
    fail('artifact-byte-ceiling', 'mission revision context exceeds the admitted artifact byte ceiling');
  }
  const requiredFindingIds = review.findings.filter(({ required }) => required).map(({ id }) => id);
  sortedUniqueStrings(requiredFindingIds, 'required revision findings', { minimum: 1, maximum: 128 });
  return { nativeReference, reviewReference, requiredFindingIds };
}

function verifyMaterializer(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'maximumMaterializedBytes', 'materializerDigest',
  ], 'mission revision materializer');
  requireInteger(value.maximumMaterializedBytes, 'mission revision package byte ceiling', {
    minimum: 1024,
    maximum: MAXIMUM_BYTES,
  });
  const { materializerDigest, ...unsigned } = value;
  if (value.schemaVersion !== 1 || value.protocolId !== MATERIALIZER_PROTOCOL
      || sha256Value(unsigned) !== materializerDigest) {
    fail('materializer-invalid', 'mission revision materializer identity mismatch');
  }
  requireDigest(materializerDigest, 'mission revision materializer');
  return value;
}

export function verifyMissionRevisionPackage(value) {
  assertSchema('mission-revision-package', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'materializer', 'mission', 'admissionDigest',
    'requestDigest', 'executorDescriptorDigest', 'maxCompletionTokens', 'maxArtifactBytes', 'native',
    'review', 'requiredFindingIds', 'authority', 'packageDigest',
  ], 'mission revision package');
  verifyMaterializer(value.materializer);
  verifyMission(value.mission);
  requireDigest(value.admissionDigest, 'mission revision admission');
  requireDigest(value.requestDigest, 'mission revision request');
  requireDigest(value.executorDescriptorDigest, 'mission revision executor descriptor');
  requireInteger(value.maxCompletionTokens, 'mission revision completion ceiling', {
    minimum: 1,
    maximum: 1_000_000,
  });
  requireInteger(value.maxArtifactBytes, 'mission revision artifact byte ceiling', {
    minimum: 1,
    maximum: MAXIMUM_BYTES,
  });
  verifyReference(value.native, 'native');
  verifyReference(value.review, 'review', value.native.artifactDigest);
  if (value.review.artifact.recommendation !== 'revise') {
    fail('review-recommendation-invalid', 'mission revision package requires a revise recommendation');
  }
  const expectedRequired = value.review.artifact.findings
    .filter(({ required }) => required)
    .map(({ id }) => id);
  sortedUniqueStrings(value.requiredFindingIds, 'required revision findings', { minimum: 1, maximum: 128 });
  if (!same(value.requiredFindingIds, expectedRequired)) {
    fail('finding-binding-invalid', 'mission revision required finding set mismatch');
  }
  verifyAuthority(value.authority);
  const { packageDigest, ...unsigned } = value;
  requireDigest(packageDigest, 'mission revision package');
  if (sha256Value(unsigned) !== packageDigest) fail('package-digest-invalid', 'mission revision package digest mismatch');
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > value.materializer.maximumMaterializedBytes) {
    fail('package-byte-ceiling', 'mission revision package exceeds its canonical byte ceiling');
  }
  return value;
}

export function createMissionRevisionMaterializer({ maximumMaterializedBytes = 1_048_576 } = {}) {
  requireInteger(maximumMaterializedBytes, 'mission revision package byte ceiling', {
    minimum: 1024,
    maximum: MAXIMUM_BYTES,
  });
  const identityUnsigned = {
    schemaVersion: 1,
    protocolId: MATERIALIZER_PROTOCOL,
    maximumMaterializedBytes,
  };
  const identity = deepFreeze({
    ...identityUnsigned,
    materializerDigest: sha256Value(identityUnsigned),
  });
  return Object.freeze({
    materializerDigest: identity.materializerDigest,
    maximumMaterializedBytes,
    materialize(input) {
      exactKeys(input, ['admission', 'request', 'descriptor', 'native', 'review'], 'mission revision input');
      const { admission, request, descriptor, native, review } = input;
      verifyMissionExecutorDescriptor(descriptor, 'revision');
      const { nativeReference, reviewReference, requiredFindingIds } = verifyContext({
        admission, request, descriptor, native, review,
      });
      const unsigned = {
        schemaVersion: 1,
        protocolId: PACKAGE_PROTOCOL,
        materializer: clone(identity),
        mission: clone(admission.mission),
        admissionDigest: admission.admissionDigest,
        requestDigest: request.requestDigest,
        executorDescriptorDigest: descriptor.descriptorDigest,
        maxCompletionTokens: request.maxCompletionTokens,
        maxArtifactBytes: admission.budgets.maxArtifactBytes,
        native: nativeReference,
        review: reviewReference,
        requiredFindingIds,
        authority: clone(EMPTY_REVISION_AUTHORITY),
      };
      const value = { ...unsigned, packageDigest: sha256Value(unsigned) };
      verifyMissionRevisionPackage(value);
      return deepFreeze(value);
    },
  });
}
