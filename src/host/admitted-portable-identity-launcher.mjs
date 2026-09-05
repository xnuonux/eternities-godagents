import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import {
  createPortableMissionDependencies,
  verifyPortableMissionDependenciesDescription,
} from './portable-mission-dependencies.mjs';
import { launchAdmittedSealedIdentityMission } from './admitted-sealed-identity-launch.mjs';

const PROTOCOL_ID = 'eternities-admitted-portable-identity-launcher-v1';
const CONFIGURATION_FIELDS = Object.freeze([
  'host',
  'releasePin',
  'maximumReviewMaterializedBytes',
  'maximumRevisionMaterializedBytes',
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
  if (!object(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
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

function clone(value) { return structuredClone(value); }

export function verifyAdmittedPortableIdentityLauncherDescription(input) {
  const value = clone(input);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'portableDependencies', 'authority', 'bindingDigest',
  ], 'admitted portable identity launcher description');
  if (value.schemaVersion !== 1 || value.protocolId !== PROTOCOL_ID) {
    throw new TypeError('admitted portable identity launcher protocol is invalid');
  }
  value.portableDependencies = clone(
    verifyPortableMissionDependenciesDescription(value.portableDependencies),
  );
  exactKeys(value.authority, Object.keys(AUTHORITY), 'admitted portable authority');
  if (!same(value.authority, AUTHORITY)) {
    throw new TypeError('admitted portable identity launcher authority is invalid');
  }
  const { bindingDigest, ...unsigned } = value;
  if (bindingDigest !== sha256Value(unsigned)) {
    throw new TypeError('admitted portable identity launcher binding digest is invalid');
  }
  return deepFreeze(value);
}

export async function createAdmittedPortableIdentityLauncher(configuration = {}) {
  if (!object(configuration)
      || Object.keys(configuration).some((key) => !CONFIGURATION_FIELDS.includes(key))) {
    throw new TypeError('admitted portable identity launcher configuration is invalid');
  }
  const artifactCache = configuration.artifactCache ?? new Map();
  const io = configuration.io ?? {};
  const dependencies = await createPortableMissionDependencies({
    ...configuration,
    artifactCache,
    io,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    portableDependencies: clone(dependencies.describe()),
    authority: clone(AUTHORITY),
  };
  const description = verifyAdmittedPortableIdentityLauncherDescription({
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
        throw new TypeError('admitted portable identity launch request fields are invalid');
      }
      if (!DIGEST.test(input.identityPolicyDigest)) {
        throw new TypeError('admitted portable identity policy digest is invalid');
      }
      let request;
      try {
        request = clone(input.request);
        configuration.host.assertCredentialAbsent(request);
      } catch (error) {
        throw new TypeError('admitted portable identity launch request credential preflight failed', { cause: error });
      }
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
