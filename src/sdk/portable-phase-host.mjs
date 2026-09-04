import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import {
  verifyIdentityBoundNativeTransportDescriptor,
} from '../runtime/identity-bound-native-contracts.mjs';
import {
  verifyMissionRevisionTransportDescriptor,
} from '../runtime/mission-revision-transport-contracts.mjs';
import {
  verifyGodskillsReviewTransportDescriptor,
} from '../skills/review-transport-contracts.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const PROTOCOL_ID = 'eternities-portable-phase-host-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const PHASES = Object.freeze(['native', 'review', 'revision']);
const HOST_FIELDS = Object.freeze([
  'describe',
  'assertCredentialAbsent',
  'createOperatorResolutionController',
  'native',
  'review',
  'revision',
]);
const CONFIGURATION_FIELDS = new Set([
  'description',
  'native',
  'review',
  'revision',
  'assertCredentialAbsent',
  'createOperatorResolutionController',
]);

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

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!same(actual, wanted)) throw new TypeError(`${label} fields are invalid`);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new TypeError(`${label} digest is invalid`);
  }
  return value;
}

function requireIdentifier(value, label, pattern = IDENTIFIER) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

export const PORTABLE_PHASE_HOST_CAPABILITIES = deepFreeze({
  phases: [...PHASES],
  structuredOutputs: true,
  durableExecution: true,
  localDispatchSemantics: 'at-most-once',
  terminalReconciliation: 'by-dispatch-digest',
  credentialPreflight: true,
});

export const PORTABLE_PHASE_HOST_AUTHORITY = deepFreeze({
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  inspiration: false,
  soul: false,
});

export function verifyPortablePhaseHostDescription(input) {
  const value = object(input, 'portable phase host description');
  assertSchema('portable-phase-host-description', value);
  exactKeys(value, [
    'schemaVersion',
    'protocolId',
    'adapterId',
    'adapterVersion',
    'policyDigest',
    'capabilities',
    'descriptors',
    'authority',
    'descriptionDigest',
  ], 'portable phase host description');
  if (value.schemaVersion !== 1 || value.protocolId !== PROTOCOL_ID) {
    throw new TypeError('portable phase host description protocol is invalid');
  }
  requireIdentifier(value.adapterId, 'portable phase host adapter id');
  requireIdentifier(value.adapterVersion, 'portable phase host adapter version', VERSION);
  requireDigest(value.policyDigest, 'portable phase host policy');
  exactKeys(value.capabilities, Object.keys(PORTABLE_PHASE_HOST_CAPABILITIES), 'portable phase host capabilities');
  if (!same(value.capabilities, PORTABLE_PHASE_HOST_CAPABILITIES)) {
    throw new TypeError('portable phase host capabilities are invalid');
  }
  exactKeys(value.authority, Object.keys(PORTABLE_PHASE_HOST_AUTHORITY), 'portable phase host authority');
  if (!same(value.authority, PORTABLE_PHASE_HOST_AUTHORITY)) {
    throw new TypeError('portable phase host authority is invalid');
  }
  exactKeys(value.descriptors, PHASES, 'portable phase host descriptors');
  verifyIdentityBoundNativeTransportDescriptor(value.descriptors.native);
  verifyGodskillsReviewTransportDescriptor(value.descriptors.review);
  verifyMissionRevisionTransportDescriptor(value.descriptors.revision);
  requireDigest(value.descriptionDigest, 'portable phase host description');
  const { descriptionDigest, ...unsigned } = value;
  if (descriptionDigest !== sha256Value(unsigned)) {
    throw new TypeError('portable phase host description digest is invalid');
  }
  return value;
}

export function buildPortablePhaseHostDescription(options = {}) {
  object(options, 'portable phase host configuration');
  if ([...Object.keys(options)].some((key) => ![
    'adapterId', 'adapterVersion', 'policyDigest', 'descriptors',
  ].includes(key))) {
    throw new TypeError('portable phase host configuration contains unknown fields');
  }
  exactKeys(options, ['adapterId', 'adapterVersion', 'policyDigest', 'descriptors'], 'portable phase host configuration');
  const descriptors = clone(options.descriptors);
  const unsigned = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    adapterId: options.adapterId,
    adapterVersion: options.adapterVersion,
    policyDigest: options.policyDigest,
    capabilities: clone(PORTABLE_PHASE_HOST_CAPABILITIES),
    descriptors,
    authority: clone(PORTABLE_PHASE_HOST_AUTHORITY),
  };
  return deepFreeze(verifyPortablePhaseHostDescription({
    ...unsigned,
    descriptionDigest: sha256Value(unsigned),
  }));
}

function verifyPort(value, phase) {
  object(value, `portable ${phase} phase port`);
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`portable ${phase} phase port ${method} is required`);
    }
  }
  return value;
}

function pinnedPort(source, descriptor) {
  const pinned = deepFreeze(clone(descriptor));
  const reconcile = source.reconcile.bind(source);
  const execute = source.execute.bind(source);
  return Object.freeze({
    descriptor() {
      return deepFreeze(clone(pinned));
    },
    reconcile(dispatch) {
      return reconcile(dispatch);
    },
    execute(dispatch) {
      return execute(dispatch);
    },
  });
}

const issuedHosts = new WeakSet();

export async function createPortablePhaseHostAdapter(options = {}) {
  object(options, 'portable phase host adapter configuration');
  if ([...Object.keys(options)].some((key) => !CONFIGURATION_FIELDS.has(key))) {
    throw new TypeError('portable phase host adapter configuration contains unknown fields');
  }
  exactKeys(options, [...CONFIGURATION_FIELDS], 'portable phase host adapter configuration');
  if (typeof options.assertCredentialAbsent !== 'function'
      || typeof options.createOperatorResolutionController !== 'function') {
    throw new TypeError('portable phase host adapter safety functions are required');
  }
  const description = deepFreeze(clone(verifyPortablePhaseHostDescription(options.description)));
  const sources = {};
  const descriptors = {};
  for (const phase of PHASES) {
    sources[phase] = verifyPort(options[phase], phase);
    let live;
    try {
      live = clone(await sources[phase].descriptor());
    } catch (error) {
      throw new TypeError(`portable ${phase} phase descriptor could not be read`, { cause: error });
    }
    const verifier = phase === 'native'
      ? verifyIdentityBoundNativeTransportDescriptor
      : phase === 'review'
        ? verifyGodskillsReviewTransportDescriptor
        : verifyMissionRevisionTransportDescriptor;
    verifier(live);
    if (!same(live, description.descriptors[phase])) {
      throw new TypeError(`portable ${phase} phase descriptor differs from description`);
    }
    descriptors[phase] = live;
  }
  const host = Object.freeze({
    describe() {
      return deepFreeze(clone(description));
    },
    assertCredentialAbsent(value) {
      assertNoCredentialFields(value);
      return options.assertCredentialAbsent(value);
    },
    createOperatorResolutionController(controllerOptions) {
      return options.createOperatorResolutionController(controllerOptions);
    },
    native: pinnedPort(sources.native, descriptors.native),
    review: pinnedPort(sources.review, descriptors.review),
    revision: pinnedPort(sources.revision, descriptors.revision),
  });
  issuedHosts.add(host);
  return host;
}

export function assertPortablePhaseHostInstance(value) {
  if (!value || typeof value !== 'object' || issuedHosts.has(value) !== true) {
    throw new TypeError('portable phase host must be an SDK-issued certified instance');
  }
  exactKeys(value, HOST_FIELDS, 'portable phase host');
  for (const method of ['describe', 'assertCredentialAbsent', 'createOperatorResolutionController']) {
    if (typeof value[method] !== 'function') throw new TypeError(`portable phase host ${method} is required`);
  }
  for (const phase of PHASES) verifyPort(value[phase], phase);
  return verifyPortablePhaseHostDescription(clone(value.describe()));
}

export {
  PROTOCOL_ID as PORTABLE_PHASE_HOST_PROTOCOL_ID,
};
