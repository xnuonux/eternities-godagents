import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  verifyMissionAdmission,
  verifyMissionPhaseArtifact,
  verifyMissionPhaseRequest,
} from '../runtime/mission-phase-contracts.mjs';
import { verifyGodskillsRelease } from './release-verifier.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MATERIALIZER_PROTOCOL = 'eternities-godskills-deferred-review-materializer-v1';
const PACKAGE_PROTOCOL = 'eternities-godskills-deferred-review-package-v1';
const MAXIMUM_PACKAGE_BYTES = 16_777_216;

const EMPTY_AUTHORITY = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

export class DeferredGodskillsReviewMaterializerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DeferredGodskillsReviewMaterializerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new DeferredGodskillsReviewMaterializerError(code, message);
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
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    fail('digest-invalid', `${label} digest is invalid`);
  }
  return value;
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('identifier-invalid', `${label} is invalid`);
  }
  return value;
}

function requireInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalReference(artifact) {
  const text = canonicalJson(artifact);
  return {
    artifactDigest: sha256Text(text),
    artifactBytes: Buffer.byteLength(text, 'utf8'),
    artifact: clone(artifact),
  };
}

function verifyReference(value, label, phase) {
  exactKeys(value, ['artifactDigest', 'artifactBytes', 'artifact'], label);
  requireDigest(value.artifactDigest, `${label} artifact`);
  requireInteger(value.artifactBytes, `${label} byte count`, { minimum: 1, maximum: MAXIMUM_PACKAGE_BYTES });
  const text = canonicalJson(value.artifact);
  if (sha256Text(text) !== value.artifactDigest
      || Buffer.byteLength(text, 'utf8') !== value.artifactBytes) {
    fail('artifact-digest-invalid', `${label} digest or byte count mismatch`);
  }
  if (phase === 'native') {
    verifyMissionPhaseArtifact(value.artifact, { phase: 'native', inputs: [] });
  } else if (phase === 'review') {
    verifyMissionPhaseArtifact(value.artifact, {
      phase: 'review',
      inputs: [{ role: 'subject', artifactDigest: value.artifact.subjectDigest }],
    });
  } else {
    verifyMissionPhaseArtifact(value.artifact, {
      phase: 'revision',
      inputs: [
        { role: 'native', artifactDigest: value.artifact.nativeArtifactDigest },
        { role: 'review', artifactDigest: value.artifact.reviewArtifactDigest },
      ],
    });
  }
  return value;
}

function verifyMission(value) {
  exactKeys(value, ['missionId', 'objective', 'stopConditions', 'successEvidence'], 'review package mission');
  requireIdentifier(value.missionId, 'review package mission id');
  if (typeof value.objective !== 'string' || value.objective.length < 1 || value.objective.length > 32_768) {
    fail('mission-invalid', 'review package mission objective is invalid');
  }
  for (const [name, values] of [
    ['success evidence', value.successEvidence],
    ['stop conditions', value.stopConditions],
  ]) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 32
        || values.some((entry) => typeof entry !== 'string' || entry.length < 1 || entry.length > 2048)
        || new Set(values).size !== values.length
        || values.some((entry, index) => entry !== [...values].sort((left, right) => left.localeCompare(right))[index])) {
      fail('mission-invalid', `review package mission ${name} are invalid`);
    }
  }
  return value;
}

function verifyMaterializerIdentity(value) {
  exactKeys(value, [
    'protocolId', 'releaseDigest', 'maximumMaterializedBytes', 'materializerDigest',
  ], 'review materializer identity');
  requireDigest(value.releaseDigest, 'review materializer release');
  requireInteger(value.maximumMaterializedBytes, 'review materializer byte ceiling', {
    minimum: 128,
    maximum: MAXIMUM_PACKAGE_BYTES,
  });
  if (value.protocolId !== MATERIALIZER_PROTOCOL) {
    fail('materializer-invalid', 'review materializer protocol is invalid');
  }
  const { materializerDigest, ...unsigned } = value;
  requireDigest(materializerDigest, 'review materializer');
  if (sha256Value(unsigned) !== materializerDigest) {
    fail('materializer-digest-invalid', 'review materializer digest mismatch');
  }
  return value;
}

function parseContract(text, label) {
  if (typeof text !== 'string' || text.length < 1 || text.length > 1_048_576 || text.includes('\0')) {
    fail('capability-contract-invalid', `${label} contract text is invalid`);
  }
  try {
    const value = JSON.parse(text);
    object(value, `${label} contract`);
    return value;
  } catch (error) {
    if (error instanceof DeferredGodskillsReviewMaterializerError) throw error;
    fail('capability-contract-invalid', `${label} contract is not valid JSON`);
  }
}

function verifyCapabilityPackage(value, index) {
  const label = `review capability ${index}`;
  exactKeys(value, [
    'id',
    'tier',
    'ownerGodskillId',
    'entrypointSha256',
    'contractSha256',
    'entrypoint',
    'contractText',
  ], label);
  requireIdentifier(value.id, `${label} id`);
  requireIdentifier(value.ownerGodskillId, `${label} owner`);
  if (value.tier !== 'godskill' && value.tier !== 'operational-skill') {
    fail('capability-invalid', `${label} tier is invalid`);
  }
  requireDigest(value.entrypointSha256, `${label} entrypoint`);
  requireDigest(value.contractSha256, `${label} contract`);
  if (typeof value.entrypoint !== 'string' || value.entrypoint.length < 1
      || value.entrypoint.length > 1_048_576 || value.entrypoint.includes('\0')) {
    fail('capability-entrypoint-invalid', `${label} entrypoint is invalid`);
  }
  if (sha256Text(value.entrypoint) !== value.entrypointSha256) {
    fail('capability-entrypoint-invalid', `${label} entrypoint digest mismatch`);
  }
  if (sha256Text(value.contractText) !== value.contractSha256) {
    fail('capability-contract-invalid', `${label} contract digest mismatch`);
  }
  const parsed = parseContract(value.contractText, label);
  if (parsed.schemaVersion !== 1 || parsed.name !== value.id) {
    fail('capability-contract-invalid', `${label} contract identity is invalid`);
  }
  return value;
}

function verifyAuthority(value) {
  exactKeys(value, Object.keys(EMPTY_AUTHORITY), 'review package authority');
  if (!same(value, EMPTY_AUTHORITY)) {
    fail('authority-invalid', 'review package authority must remain empty');
  }
  return value;
}

export function verifyDeferredGodskillsReviewPackage(value) {
  assertSchema('deferred-godskills-review-package', value);
  exactKeys(value, [
    'schemaVersion',
    'protocolId',
    'materializer',
    'mission',
    'admissionDigest',
    'requestDigest',
    'executorDescriptorDigest',
    'round',
    'maxCompletionTokens',
    'godskills',
    'capabilities',
    'subject',
    'priorReview',
    'authority',
    'packageDigest',
  ], 'deferred Godskills review package');
  if (value.schemaVersion !== 1 || value.protocolId !== PACKAGE_PROTOCOL) {
    fail('package-protocol-invalid', 'deferred Godskills review package protocol is invalid');
  }
  verifyMaterializerIdentity(value.materializer);
  verifyMission(value.mission);
  requireDigest(value.admissionDigest, 'review package admission');
  requireDigest(value.requestDigest, 'review package request');
  requireDigest(value.executorDescriptorDigest, 'review package executor descriptor');
  requireInteger(value.round, 'review package round', { minimum: 1, maximum: 2 });
  requireInteger(value.maxCompletionTokens, 'review package completion ceiling', { minimum: 1, maximum: 1_000_000 });

  exactKeys(value.godskills, [
    'releaseDigest', 'cycleReceiptDigest', 'bindingDigest', 'activationTrustRootDigest',
  ], 'review package Godskills binding');
  for (const [name, digest] of Object.entries(value.godskills)) requireDigest(digest, `review package Godskills ${name}`);
  if (value.godskills.releaseDigest !== value.materializer.releaseDigest) {
    fail('release-digest-invalid', 'review package release digest mismatches its materializer');
  }

  if (!Array.isArray(value.capabilities) || value.capabilities.length < 1 || value.capabilities.length > 3) {
    fail('capability-set-invalid', 'review package capabilities are invalid');
  }
  value.capabilities.forEach(verifyCapabilityPackage);
  const ids = value.capabilities.map(({ id }) => id);
  const sorted = [...ids].sort((left, right) => left.localeCompare(right));
  if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== sorted[index])) {
    fail('capability-set-invalid', 'review package capabilities must be sorted and unique');
  }

  if (value.round === 1) {
    verifyReference(value.subject, 'review package subject', 'native');
    if (value.priorReview !== null) fail('round-context-invalid', 'round one cannot carry a prior review');
  } else {
    verifyReference(value.subject, 'review package subject', 'revision');
    verifyReference(value.priorReview, 'review package prior review', 'review');
    if (value.subject.artifact.reviewArtifactDigest !== value.priorReview.artifactDigest
        || value.subject.artifact.nativeArtifactDigest !== value.priorReview.artifact.subjectDigest) {
      fail('round-context-invalid', 'round two revision and prior review are not coherently bound');
    }
  }
  verifyAuthority(value.authority);

  const { packageDigest, ...unsigned } = value;
  requireDigest(packageDigest, 'deferred Godskills review package');
  if (sha256Value(unsigned) !== packageDigest) {
    fail('package-digest-invalid', 'deferred Godskills review package digest mismatch');
  }
  const bytes = Buffer.byteLength(canonicalJson(value), 'utf8');
  if (bytes > value.materializer.maximumMaterializedBytes) {
    fail('package-byte-ceiling', 'deferred Godskills review package exceeds its byte ceiling');
  }
  return value;
}

function inputMap(request) {
  return new Map(request.inputs.map(({ role, artifactDigest }) => [role, artifactDigest]));
}

function verifyReviewContext({ admission, request, descriptor, subject, priorReview }, release) {
  verifyMissionAdmission(admission);
  verifyMissionPhaseRequest(request, { admission, descriptor });
  if (request.phase !== 'review') fail('phase-invalid', 'deferred Godskills materialization requires a review request');
  if (!admission.godskills || admission.godskills.deferredReviews.length < 1) {
    fail('godskills-review-invalid', 'mission admission has no deferred Godskills review');
  }
  if (admission.godskills.receipt.releaseDigest !== release.releaseDigest
      || admission.godskills.trustPin.releaseDigest !== release.releaseDigest) {
    fail('release-digest-invalid', 'mission admission does not bind the verified Godskills release');
  }
  if (!release.activation
      || admission.godskills.trustPin.activationProtocolId !== release.activation.protocolId
      || admission.godskills.trustPin.activationTrustRootDigest !== release.activation.trustRootDigest) {
    fail('activation-root-invalid', 'mission admission does not bind the verified activation trust root');
  }

  const inputs = inputMap(request);
  const expectedRoles = request.round === 1
    ? ['godskills-binding', 'subject']
    : ['godskills-binding', 'prior-review', 'revision', 'subject'];
  if (!same([...inputs.keys()], expectedRoles)) {
    fail('request-context-invalid', `round ${request.round} review request inputs are invalid`);
  }
  if (inputs.get('godskills-binding') !== admission.godskills.bindingDigest) {
    fail('request-context-invalid', 'review request Godskills binding digest mismatch');
  }

  const subjectReference = canonicalReference(subject);
  let priorReviewReference = null;
  if (request.round === 1) {
    verifyReference(subjectReference, 'review subject', 'native');
    if (priorReview !== null) fail('round-context-invalid', 'round one cannot carry a prior review');
  } else {
    verifyReference(subjectReference, 'review subject', 'revision');
    if (priorReview === null) fail('round-context-invalid', 'round two requires a prior review');
    priorReviewReference = canonicalReference(priorReview);
    verifyReference(priorReviewReference, 'review prior review', 'review');
    if (priorReviewReference.artifactBytes > admission.budgets.maxArtifactBytes) {
      fail('artifact-byte-ceiling', 'prior review exceeds the admitted artifact byte ceiling');
    }
    if (subject.reviewArtifactDigest !== priorReviewReference.artifactDigest
        || subject.nativeArtifactDigest !== priorReview.subjectDigest) {
      fail('round-context-invalid', 'round two request, revision, and prior review do not match');
    }
  }
  if (inputs.get('subject') !== subjectReference.artifactDigest) {
    fail('request-context-invalid', 'review request subject digest mismatch');
  }
  if (subjectReference.artifactBytes > admission.budgets.maxArtifactBytes) {
    fail('artifact-byte-ceiling', 'review subject exceeds the admitted artifact byte ceiling');
  }
  if (request.round === 2
      && (inputs.get('revision') !== subjectReference.artifactDigest
        || inputs.get('prior-review') !== priorReviewReference.artifactDigest)) {
    fail('round-context-invalid', 'round two request, revision, and prior review do not match');
  }
  return { subjectReference, priorReviewReference };
}

async function loadDeferredCapabilities(release, admission) {
  const selected = admission.godskills.deferredReviews.map((deferred) => {
    const capability = release.capabilitiesById.get(deferred.id);
    if (!capability || capability.capabilityDoesNotGrantAuthority !== true
        || capability.entrypoint.sha256 !== deferred.entrypointSha256
        || capability.contract.sha256 !== deferred.contractSha256) {
      fail('capability-binding-invalid', `deferred capability ${deferred.id} does not match the verified release`);
    }
    return { deferred, capability };
  });

  const packages = [];
  for (const { deferred, capability } of selected) {
    const entrypointBytes = await release.readSelectedArtifact(
      capability.entrypoint,
      `deferred review entrypoint ${deferred.id}`,
    );
    const contractBytes = await release.readSelectedArtifact(
      capability.contract,
      `deferred review contract ${deferred.id}`,
    );
    const entrypoint = entrypointBytes.toString('utf8');
    const contractText = contractBytes.toString('utf8');
    if (sha256Text(entrypoint) !== capability.entrypoint.sha256
        || sha256Text(contractText) !== capability.contract.sha256) {
      fail('capability-encoding-invalid', `deferred capability ${deferred.id} is not stable UTF-8`);
    }
    const packageValue = {
      id: capability.id,
      tier: capability.tier,
      ownerGodskillId: capability.ownerGodskillId,
      entrypointSha256: capability.entrypoint.sha256,
      contractSha256: capability.contract.sha256,
      entrypoint,
      contractText,
    };
    verifyCapabilityPackage(packageValue, packages.length);
    packages.push(packageValue);
  }
  return packages;
}

export async function createDeferredGodskillsReviewMaterializer({
  releasePin,
  maximumMaterializedBytes = 1_048_576,
  artifactCache,
  io,
} = {}) {
  requireInteger(maximumMaterializedBytes, 'deferred review package byte ceiling', {
    minimum: 128,
    maximum: MAXIMUM_PACKAGE_BYTES,
  });
  const release = await verifyGodskillsRelease(releasePin, { artifactCache, io });
  const identityUnsigned = {
    protocolId: MATERIALIZER_PROTOCOL,
    releaseDigest: release.releaseDigest,
    maximumMaterializedBytes,
  };
  const identity = deepFreeze({
    ...identityUnsigned,
    materializerDigest: sha256Value(identityUnsigned),
  });

  return Object.freeze({
    releaseDigest: release.releaseDigest,
    activationTrustRootDigest: release.activation?.trustRootDigest ?? null,
    materializerDigest: identity.materializerDigest,
    maximumMaterializedBytes,
    async materialize(input) {
      exactKeys(input, ['admission', 'request', 'descriptor', 'subject', 'priorReview'], 'review materialization input');
      const { admission, request, descriptor, subject, priorReview } = input;
      const { subjectReference, priorReviewReference } = verifyReviewContext(
        { admission, request, descriptor, subject, priorReview },
        release,
      );
      const capabilities = await loadDeferredCapabilities(release, admission);
      const unsigned = {
        schemaVersion: 1,
        protocolId: PACKAGE_PROTOCOL,
        materializer: clone(identity),
        mission: clone(admission.mission),
        admissionDigest: admission.admissionDigest,
        requestDigest: request.requestDigest,
        executorDescriptorDigest: descriptor.descriptorDigest,
        round: request.round,
        maxCompletionTokens: request.maxCompletionTokens,
        godskills: {
          releaseDigest: release.releaseDigest,
          cycleReceiptDigest: sha256Value(admission.godskills.receipt),
          bindingDigest: admission.godskills.bindingDigest,
          activationTrustRootDigest: release.activation.trustRootDigest,
        },
        capabilities,
        subject: subjectReference,
        priorReview: priorReviewReference,
        authority: clone(EMPTY_AUTHORITY),
      };
      const packageValue = {
        ...unsigned,
        packageDigest: sha256Value(unsigned),
      };
      verifyDeferredGodskillsReviewPackage(packageValue);
      return deepFreeze(packageValue);
    },
  });
}
