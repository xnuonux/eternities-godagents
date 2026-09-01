import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import {
  createProviderBackedMissionDependencies,
  verifyProviderBackedMissionDependenciesDescription,
} from './provider-backed-mission-dependencies.mjs';

const PROTOCOL_ID = 'eternities-admitted-provider-backed-identity-launcher-v1';
const CONFIGURATION_FIELDS = Object.freeze([
  'host',
  'releasePin',
  'maximumReviewMaterializedBytes',
  'maximumRevisionMaterializedBytes',
  'executorIdPrefix',
  'artifactCache',
  'io',
]);
const AUTHORITY = Object.freeze({
  providerSelection: false,
  credentialResolution: false,
  policyAuthorship: false,
  signatureCreation: false,
  realmMutation: false,
  continuityAdmission: false,
  identityMutation: false,
  evolution: false,
  inspiration: false,
  lunari: false,
  soul: false,
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!object(value) || canonicalJson(Object.keys(value)) !== canonicalJson(expected)) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
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

export function verifyAdmittedProviderBackedIdentityLauncherDescription(input) {
  const value = clone(input);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'providerBackedDependencies', 'authority', 'bindingDigest',
  ], 'admitted provider-backed identity launcher description');
  if (value.schemaVersion !== 1 || value.protocolId !== PROTOCOL_ID) {
    throw new TypeError('admitted provider-backed identity launcher protocol is invalid');
  }
  value.providerBackedDependencies = clone(
    verifyProviderBackedMissionDependenciesDescription(value.providerBackedDependencies),
  );
  exactKeys(value.authority, Object.keys(AUTHORITY), 'admitted provider-backed authority');
  if (!same(value.authority, AUTHORITY)) {
    throw new TypeError('admitted provider-backed identity launcher authority is invalid');
  }
  const { bindingDigest, ...unsigned } = value;
  if (bindingDigest !== sha256Value(unsigned)) {
    throw new TypeError('admitted provider-backed identity launcher binding digest is invalid');
  }
  return deepFreeze(value);
}

export async function createAdmittedProviderBackedIdentityLauncher(configuration = {}) {
  if (!object(configuration)
      || Object.keys(configuration).some((key) => !CONFIGURATION_FIELDS.includes(key))) {
    throw new TypeError('admitted provider-backed identity launcher configuration is invalid');
  }
  const dependencies = await createProviderBackedMissionDependencies(configuration);
  const unsigned = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    providerBackedDependencies: clone(dependencies.describe()),
    authority: clone(AUTHORITY),
  };
  const description = verifyAdmittedProviderBackedIdentityLauncherDescription({
    ...unsigned,
    bindingDigest: sha256Value(unsigned),
  });
  return Object.freeze({
    describe() {
      return deepFreeze(clone(description));
    },
    async launch() {
      throw new Error('admitted provider-backed identity launch is not implemented');
    },
  });
}
