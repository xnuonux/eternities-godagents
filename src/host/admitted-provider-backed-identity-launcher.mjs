import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import {
  createProviderBackedMissionDependencies,
  verifyProviderBackedMissionDependenciesDescription,
} from './provider-backed-mission-dependencies.mjs';
import { launchAdmittedSealedIdentityMission } from './admitted-sealed-identity-launch.mjs';

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
const LAUNCH_FIELDS = Object.freeze([
  'admissionRoot',
  'policyPath',
  'request',
  'identityPolicyDigest',
  'registryRoot',
  'clock',
  'godskillsClock',
  'checkpoint',
  'lockOptions',
  'godskillsLockOptions',
]);
const DIGEST = /^[a-f0-9]{64}$/;

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
  const artifactCache = configuration.artifactCache ?? new Map();
  const io = configuration.io ?? {};
  const dependencies = await createProviderBackedMissionDependencies({
    ...configuration,
    artifactCache,
    io,
  });
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
    async launch(input = {}) {
      if (!object(input)
          || Object.keys(input).some((key) => !LAUNCH_FIELDS.includes(key))
          || !['admissionRoot', 'policyPath', 'request', 'identityPolicyDigest']
            .every((key) => Object.hasOwn(input, key))) {
        throw new TypeError('admitted provider-backed identity launch request fields are invalid');
      }
      if (!DIGEST.test(input.identityPolicyDigest)) {
        throw new TypeError('admitted provider-backed identity policy digest is invalid');
      }
      const request = clone(input.request);
      return launchAdmittedSealedIdentityMission({
        admissionRoot: input.admissionRoot,
        policyPath: input.policyPath,
        request,
        env: { GODAGENT_IDENTITY_POLICY_SHA256: input.identityPolicyDigest },
        registryRoot: input.registryRoot,
        nativeTransport: dependencies.nativeTransport,
        reviewExecutor: dependencies.reviewExecutor,
        revisionExecutor: dependencies.revisionExecutor,
        clock: input.clock,
        godskillsClock: input.godskillsClock,
        checkpoint: input.checkpoint,
        lockOptions: input.lockOptions,
        godskillsLockOptions: input.godskillsLockOptions,
        artifactCache,
        io,
      });
    },
  });
}
