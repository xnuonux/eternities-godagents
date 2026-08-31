import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import {
  verifyMissionAdmission,
  verifyMissionExecutorDescriptor,
  verifyMissionPhaseRequest,
} from './mission-phase-contracts.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MATERIALIZER_PROTOCOL = 'eternities-mission-native-materializer-v1';
const PACKAGE_PROTOCOL = 'eternities-mission-native-package-v1';
const MAXIMUM_BYTES = 16_777_216;

export const EMPTY_NATIVE_AUTHORITY = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

export class MissionNativeMaterializerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionNativeMaterializerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionNativeMaterializerError(code, message);
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

function sortedUniqueStrings(values, label, { minimum = 0, maximum = 32 } = {}) {
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
  exactKeys(value, Object.keys(EMPTY_NATIVE_AUTHORITY), 'mission native authority');
  if (!same(value, EMPTY_NATIVE_AUTHORITY)) fail('authority-invalid', 'mission native authority must remain empty');
}

function verifyMission(value) {
  exactKeys(value, ['missionId', 'objective', 'successEvidence', 'stopConditions'], 'mission native mission');
  requireIdentifier(value.missionId, 'mission id');
  requireText(value.objective, 'mission objective', 32_768);
  sortedUniqueStrings(value.successEvidence, 'mission success evidence', { minimum: 1, maximum: 32 });
  sortedUniqueStrings(value.stopConditions, 'mission stop conditions', { minimum: 1, maximum: 32 });
  return value;
}

function verifyMaterializer(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'maximumMaterializedBytes', 'materializerDigest',
  ], 'mission native materializer');
  requireInteger(value.maximumMaterializedBytes, 'mission native package byte ceiling', {
    minimum: 1024,
    maximum: MAXIMUM_BYTES,
  });
  const { materializerDigest, ...unsigned } = value;
  if (value.schemaVersion !== 1 || value.protocolId !== MATERIALIZER_PROTOCOL
      || sha256Value(unsigned) !== materializerDigest) {
    fail('materializer-invalid', 'mission native materializer identity mismatch');
  }
  requireDigest(materializerDigest, 'mission native materializer');
  return value;
}

function verifyGodskillsProjection(value) {
  if (value === null) return null;
  exactKeys(value, ['bindingDigest', 'packageDigest', 'cortexPackage'], 'mission native Godskills projection');
  requireDigest(value.bindingDigest, 'mission native Godskills binding');
  requireDigest(value.packageDigest, 'mission native Godskills package');
  object(value.cortexPackage, 'mission native Godskills cortex package');
  try {
    assertNoCredentialFields(value.cortexPackage);
  } catch (error) {
    fail('credential-field-invalid', error.message);
  }
  if (value.packageDigest !== sha256Text(canonicalJson(value.cortexPackage))) {
    fail('godskills-package-invalid', 'mission native Godskills package digest mismatch');
  }
  if (!Array.isArray(value.cortexPackage.selectedPackages)
      || !Array.isArray(value.cortexPackage.deferredReviews)) {
    fail('godskills-package-invalid', 'mission native Godskills package projections are invalid');
  }
  const deferredIds = new Set(value.cortexPackage.deferredReviews.map(({ id }) => id));
  if (value.cortexPackage.selectedPackages.some(({ id }) => deferredIds.has(id))) {
    fail('godskills-review-disclosure', 'deferred Godskills review body entered native disclosure');
  }
  return value;
}

function inputMap(request) {
  return new Map(request.inputs.map(({ role, artifactDigest }) => [role, artifactDigest]));
}

function projectionFor(admission) {
  if (admission.godskills === null) return null;
  return {
    bindingDigest: admission.godskills.bindingDigest,
    packageDigest: admission.godskills.receipt.packageDigest,
    cortexPackage: clone(admission.godskills.cortexPackage),
  };
}

function verifyContext({ admission, request, descriptor, mission, godskillsBinding }) {
  verifyMissionAdmission(admission);
  verifyMissionPhaseRequest(request, { admission, descriptor });
  if (request.phase !== 'native' || request.round !== 1) {
    fail('phase-invalid', 'mission native materialization requires native round one');
  }
  if (!same(mission, admission.mission)) {
    fail('mission-binding-invalid', 'mission native context differs from admission');
  }
  const inputs = inputMap(request);
  if (admission.godskills === null) {
    if (godskillsBinding !== null || inputs.size !== 0) {
      fail('godskills-binding-invalid', 'native-only mission carried Godskills context or phase input');
    }
    return null;
  }
  exactKeys(godskillsBinding, ['receipt', 'cortexPackage'], 'mission native Godskills context');
  if (!same(godskillsBinding.receipt, admission.godskills.receipt)
      || !same(godskillsBinding.cortexPackage, admission.godskills.cortexPackage)
      || inputs.size !== 1
      || inputs.get('godskills-package') !== admission.godskills.receipt.packageDigest) {
    fail('godskills-binding-invalid', 'mission native Godskills context differs from admission or request');
  }
  const projection = projectionFor(admission);
  verifyGodskillsProjection(projection);
  return projection;
}

export function verifyMissionNativePackage(value) {
  assertSchema('mission-native-package', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'materializer', 'mission', 'admissionDigest',
    'requestDigest', 'executorDescriptorDigest', 'maxCompletionTokens',
    'maxArtifactBytes', 'godskills', 'authority', 'packageDigest',
  ], 'mission native package');
  verifyMaterializer(value.materializer);
  verifyMission(value.mission);
  requireDigest(value.admissionDigest, 'mission native admission');
  requireDigest(value.requestDigest, 'mission native request');
  requireDigest(value.executorDescriptorDigest, 'mission native executor descriptor');
  requireInteger(value.maxCompletionTokens, 'mission native completion ceiling', {
    minimum: 1,
    maximum: 1_000_000,
  });
  requireInteger(value.maxArtifactBytes, 'mission native artifact byte ceiling', {
    minimum: 1,
    maximum: MAXIMUM_BYTES,
  });
  verifyGodskillsProjection(value.godskills);
  verifyAuthority(value.authority);
  const { packageDigest, ...unsigned } = value;
  requireDigest(packageDigest, 'mission native package');
  if (sha256Value(unsigned) !== packageDigest) fail('package-digest-invalid', 'mission native package digest mismatch');
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > value.materializer.maximumMaterializedBytes) {
    fail('package-byte-ceiling', 'mission native package exceeds its canonical byte ceiling');
  }
  return value;
}

export function createMissionNativeMaterializer({ maximumMaterializedBytes = 1_048_576 } = {}) {
  requireInteger(maximumMaterializedBytes, 'mission native package byte ceiling', {
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
      exactKeys(input, [
        'admission', 'request', 'descriptor', 'mission', 'godskillsBinding',
      ], 'mission native input');
      const { admission, request, descriptor, mission, godskillsBinding } = input;
      verifyMissionExecutorDescriptor(descriptor, 'native');
      const godskills = verifyContext({
        admission, request, descriptor, mission, godskillsBinding,
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
        godskills,
        authority: clone(EMPTY_NATIVE_AUTHORITY),
      };
      const value = { ...unsigned, packageDigest: sha256Value(unsigned) };
      verifyMissionNativePackage(value);
      return deepFreeze(value);
    },
  });
}
