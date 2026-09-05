import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyMissionExecutorDescriptor } from '../runtime/mission-phase-contracts.mjs';
import { createMissionRevisionExecutor } from '../runtime/mission-revision-executor.mjs';
import { createDeferredGodskillsReviewExecutor } from '../skills/deferred-review-executor.mjs';
import {
  assertPortablePhaseHostInstance,
  verifyPortablePhaseHostDescription,
} from '../sdk/portable-phase-host.mjs';
import { verifyIdentityBoundNativeTransportDescriptor } from '../runtime/identity-bound-native-contracts.mjs';
import { verifyMissionRevisionTransportDescriptor } from '../runtime/mission-revision-transport-contracts.mjs';
import { verifyGodskillsReviewTransportDescriptor } from '../skills/review-transport-contracts.mjs';

const PROTOCOL_ID = 'eternities-portable-mission-dependencies-v1';
const CONFIGURATION_FIELDS = Object.freeze([
  'host', 'releasePin', 'maximumReviewMaterializedBytes',
  'maximumRevisionMaterializedBytes', 'artifactCache', 'io',
]);
const HOST_FIELDS = Object.freeze([
  'describe', 'assertCredentialAbsent', 'createOperatorResolutionController',
  'native', 'review', 'revision',
]);
const PHASES = Object.freeze(['native', 'review', 'revision']);
const DIGEST = /^[a-f0-9]{64}$/;

function clone(value) { return structuredClone(value); }

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) { return canonicalJson(left) === canonicalJson(right); }

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function verifyHost(host) {
  const issuedDescription = assertPortablePhaseHostInstance(host);
  exactKeys(host, HOST_FIELDS, 'portable phase host');
  for (const method of ['describe', 'assertCredentialAbsent', 'createOperatorResolutionController']) {
    if (typeof host[method] !== 'function') throw new TypeError(`portable phase host ${method} is required`);
  }
  for (const phase of PHASES) {
    exactKeys(host[phase], ['descriptor', 'reconcile', 'execute'], `portable ${phase} transport`);
    for (const method of ['descriptor', 'reconcile', 'execute']) {
      if (typeof host[phase][method] !== 'function') {
        throw new TypeError(`portable ${phase} transport ${method} is required`);
      }
    }
  }
  const described = verifyPortablePhaseHostDescription(clone(host.describe()));
  if (!same(issuedDescription, described)) {
    throw new TypeError('SDK-issued portable phase host description changed');
  }
  return described;
}

function pinnedTransport(transport, descriptor) {
  const pinned = deepFreeze(clone(descriptor));
  const reconcile = transport.reconcile.bind(transport);
  const execute = transport.execute.bind(transport);
  return Object.freeze({
    descriptor() { return deepFreeze(clone(pinned)); },
    reconcile(dispatch) { return reconcile(dispatch); },
    execute(dispatch) { return execute(dispatch); },
  });
}

function verifyLimits(value) {
  exactKeys(value, ['maximumReviewMaterializedBytes', 'maximumRevisionMaterializedBytes'], 'portable mission dependency limits');
  const reviewBytes = value.maximumReviewMaterializedBytes;
  const revisionBytes = value.maximumRevisionMaterializedBytes;
  if (!Number.isSafeInteger(reviewBytes) || reviewBytes < 128 || reviewBytes > 16_777_216
      || !Number.isSafeInteger(revisionBytes) || revisionBytes < 1024 || revisionBytes > 16_777_216) {
    throw new TypeError('portable mission dependency limits are invalid');
  }
}

export function verifyPortableMissionDependenciesDescription(input) {
  const value = clone(input);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'portableHost', 'godskills', 'dependencies',
    'limits', 'bindingDigest',
  ], 'portable mission dependency description');
  if (value.schemaVersion !== 1 || value.protocolId !== PROTOCOL_ID
      || !DIGEST.test(value.bindingDigest)) {
    throw new TypeError('portable mission dependency description identity is invalid');
  }
  const portableHost = verifyPortablePhaseHostDescription(value.portableHost);
  exactKeys(value.godskills, ['releaseDigest', 'activationTrustRootDigest'], 'portable Godskills binding');
  if (!DIGEST.test(value.godskills.releaseDigest)
      || !DIGEST.test(value.godskills.activationTrustRootDigest)) {
    throw new TypeError('portable Godskills binding is invalid');
  }
  exactKeys(value.dependencies, [
    'nativeTransport', 'reviewExecutor', 'revisionExecutor',
    'reviewTransportDescriptorDigest', 'reviewMaterializerDigest',
    'reviewExecutorBindingDigest', 'revisionTransportDescriptorDigest',
    'revisionMaterializerDigest', 'revisionExecutorBindingDigest',
  ], 'portable mission dependencies');
  if (!same(value.dependencies.nativeTransport, portableHost.descriptors.native)) {
    throw new TypeError('portable native transport descriptor differs from host description');
  }
  verifyIdentityBoundNativeTransportDescriptor(value.dependencies.nativeTransport);
  const reviewDescriptor = verifyMissionExecutorDescriptor(value.dependencies.reviewExecutor, 'review');
  const revisionDescriptor = verifyMissionExecutorDescriptor(value.dependencies.revisionExecutor, 'revision');
  for (const name of [
    'reviewTransportDescriptorDigest', 'reviewMaterializerDigest',
    'reviewExecutorBindingDigest', 'revisionTransportDescriptorDigest',
    'revisionMaterializerDigest', 'revisionExecutorBindingDigest',
  ]) {
    if (!DIGEST.test(value.dependencies[name])) {
      throw new TypeError(`portable ${name} is invalid`);
    }
  }
  if (value.dependencies.reviewTransportDescriptorDigest
      !== portableHost.descriptors.review.descriptorDigest) {
    throw new TypeError('portable review transport descriptor differs from host description');
  }
  if (value.dependencies.revisionTransportDescriptorDigest
      !== portableHost.descriptors.revision.descriptorDigest) {
    throw new TypeError('portable revision transport descriptor differs from host description');
  }
  verifyGodskillsReviewTransportDescriptor(portableHost.descriptors.review);
  verifyMissionRevisionTransportDescriptor(portableHost.descriptors.revision);
  verifyLimits(value.limits);
  const expectedReviewMaterializerDigest = sha256Value({
    protocolId: 'eternities-godskills-deferred-review-materializer-v1',
    releaseDigest: value.godskills.releaseDigest,
    maximumMaterializedBytes: value.limits.maximumReviewMaterializedBytes,
  });
  const expectedRevisionMaterializerDigest = sha256Value({
    schemaVersion: 1,
    protocolId: 'eternities-mission-revision-materializer-v1',
    maximumMaterializedBytes: value.limits.maximumRevisionMaterializedBytes,
  });
  if (value.dependencies.reviewMaterializerDigest !== expectedReviewMaterializerDigest
      || value.dependencies.revisionMaterializerDigest !== expectedRevisionMaterializerDigest) {
    throw new TypeError('portable materializer binding is invalid');
  }
  const expectedReviewBindingDigest = sha256Value({
    protocolId: 'eternities-deferred-godskills-review-executor-v1',
    releaseDigest: value.godskills.releaseDigest,
    activationTrustRootDigest: value.godskills.activationTrustRootDigest,
    materializerDigest: value.dependencies.reviewMaterializerDigest,
    transportDescriptorDigest: value.dependencies.reviewTransportDescriptorDigest,
  });
  const expectedRevisionBindingDigest = sha256Value({
    protocolId: 'eternities-mission-revision-executor-v1',
    materializerDigest: value.dependencies.revisionMaterializerDigest,
    transportDescriptorDigest: value.dependencies.revisionTransportDescriptorDigest,
  });
  if (value.dependencies.reviewExecutorBindingDigest !== expectedReviewBindingDigest
      || value.dependencies.revisionExecutorBindingDigest !== expectedRevisionBindingDigest
      || !reviewDescriptor.executorId.endsWith(`:${expectedReviewBindingDigest}`)
      || !revisionDescriptor.executorId.endsWith(`:${expectedRevisionBindingDigest}`)) {
    throw new TypeError('portable executor binding is invalid');
  }
  const { bindingDigest, ...unsigned } = value;
  if (bindingDigest !== sha256Value(unsigned)) {
    throw new TypeError('portable mission dependency binding digest is invalid');
  }
  return deepFreeze(value);
}

export async function createPortableMissionDependencies(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some((key) => !CONFIGURATION_FIELDS.includes(key))) {
    throw new TypeError('portable mission dependency configuration is invalid');
  }
  const {
    host,
    releasePin,
    maximumReviewMaterializedBytes = 1_048_576,
    maximumRevisionMaterializedBytes = 1_048_576,
    artifactCache = new Map(),
    io = {},
  } = options;
  const hostDescription = verifyHost(host);
  try {
    host.assertCredentialAbsent({
      adapterId: hostDescription.adapterId,
      adapterVersion: hostDescription.adapterVersion,
      policyDigest: hostDescription.policyDigest,
    });
  } catch (error) {
    throw new TypeError('portable mission dependency host credential preflight failed', { cause: error });
  }
  if (!(artifactCache instanceof Map) || !io || typeof io !== 'object' || Array.isArray(io)) {
    throw new TypeError('portable mission dependency policy is invalid');
  }
  if (Object.keys(io).some((key) => !['readFile', 'realpath'].includes(key))
      || ['readFile', 'realpath'].some((key) => Object.hasOwn(io, key) && typeof io[key] !== 'function')) {
    throw new TypeError('portable filesystem io fields are invalid');
  }
  const liveDescriptors = {};
  for (const phase of PHASES) {
    liveDescriptors[phase] = clone(await host[phase].descriptor());
    const verifier = phase === 'native'
      ? verifyIdentityBoundNativeTransportDescriptor
      : phase === 'review'
        ? verifyGodskillsReviewTransportDescriptor
        : verifyMissionRevisionTransportDescriptor;
    verifier(liveDescriptors[phase]);
    if (!same(liveDescriptors[phase], hostDescription.descriptors[phase])) {
      throw new TypeError(`portable ${phase} transport descriptor differs from host description`);
    }
  }
  const nativeTransport = pinnedTransport(host.native, liveDescriptors.native);
  const reviewTransport = pinnedTransport(host.review, liveDescriptors.review);
  const revisionTransport = pinnedTransport(host.revision, liveDescriptors.revision);

  const reviewExecutor = await createDeferredGodskillsReviewExecutor({
    releasePin,
    maximumMaterializedBytes: maximumReviewMaterializedBytes,
    executorIdPrefix: 'portable-mission-review',
    transport: reviewTransport,
    artifactCache,
    io,
  });
  const revisionExecutor = await createMissionRevisionExecutor({
    maximumMaterializedBytes: maximumRevisionMaterializedBytes,
    executorIdPrefix: 'portable-mission-revision',
    transport: revisionTransport,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    portableHost: clone(hostDescription),
    godskills: {
      releaseDigest: reviewExecutor.releaseDigest,
      activationTrustRootDigest: reviewExecutor.activationTrustRootDigest,
    },
    dependencies: {
      nativeTransport: clone(await nativeTransport.descriptor()),
      reviewExecutor: clone(await reviewExecutor.descriptor()),
      revisionExecutor: clone(await revisionExecutor.descriptor()),
      reviewTransportDescriptorDigest: reviewExecutor.transportDescriptorDigest,
      reviewMaterializerDigest: reviewExecutor.materializerDigest,
      reviewExecutorBindingDigest: reviewExecutor.bindingDigest,
      revisionTransportDescriptorDigest: revisionExecutor.transportDescriptorDigest,
      revisionMaterializerDigest: revisionExecutor.materializerDigest,
      revisionExecutorBindingDigest: revisionExecutor.bindingDigest,
    },
    limits: {
      maximumReviewMaterializedBytes,
      maximumRevisionMaterializedBytes,
    },
  };
  const description = verifyPortableMissionDependenciesDescription({
    ...unsigned,
    bindingDigest: sha256Value(unsigned),
  });
  return Object.freeze({
    describe() { return deepFreeze(clone(description)); },
    nativeTransport,
    reviewExecutor,
    revisionExecutor,
  });
}
