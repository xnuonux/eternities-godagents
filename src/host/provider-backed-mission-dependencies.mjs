import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyMissionExecutorDescriptor } from '../runtime/mission-phase-contracts.mjs';
import { createMissionRevisionExecutor } from '../runtime/mission-revision-executor.mjs';
import { createDeferredGodskillsReviewExecutor } from '../skills/deferred-review-executor.mjs';
import {
  assertProviderPhaseHostInstance,
  verifyProviderPhaseHostDescription,
} from './provider-phase-host-sdk.mjs';

const PROTOCOL_ID = 'eternities-provider-backed-mission-dependencies-v1';
const CONFIGURATION_FIELDS = Object.freeze([
  'host', 'releasePin', 'maximumReviewMaterializedBytes',
  'maximumRevisionMaterializedBytes', 'executorIdPrefix', 'artifactCache', 'io',
]);
const HOST_FIELDS = Object.freeze([
  'describe', 'assertCredentialAbsent', 'createOperatorResolutionController',
  'native', 'review', 'revision',
]);
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
  const issuedDescription = assertProviderPhaseHostInstance(host);
  exactKeys(host, HOST_FIELDS, 'provider phase host');
  for (const method of ['describe', 'assertCredentialAbsent', 'createOperatorResolutionController']) {
    if (typeof host[method] !== 'function') throw new TypeError(`provider phase host ${method} is required`);
  }
  for (const phase of ['native', 'review', 'revision']) {
    exactKeys(host[phase], ['descriptor', 'reconcile', 'execute'], `provider ${phase} transport`);
    for (const method of ['descriptor', 'reconcile', 'execute']) {
      if (typeof host[phase][method] !== 'function') {
        throw new TypeError(`provider ${phase} transport ${method} is required`);
      }
    }
  }
  const described = verifyProviderPhaseHostDescription(clone(host.describe()));
  if (!same(issuedDescription, described)) {
    throw new TypeError('SDK-issued provider phase host description changed');
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

export function verifyProviderBackedMissionDependenciesDescription(input) {
  const value = clone(input);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'provider', 'godskills', 'dependencies',
    'limits', 'bindingDigest',
  ], 'provider-backed mission dependency description');
  if (value.schemaVersion !== 1 || value.protocolId !== PROTOCOL_ID
      || !DIGEST.test(value.bindingDigest)) {
    throw new TypeError('provider-backed mission dependency description identity is invalid');
  }
  const provider = verifyProviderPhaseHostDescription(value.provider);
  exactKeys(value.godskills, ['releaseDigest', 'activationTrustRootDigest'], 'provider-backed Godskills binding');
  if (!DIGEST.test(value.godskills.releaseDigest)
      || !DIGEST.test(value.godskills.activationTrustRootDigest)) {
    throw new TypeError('provider-backed Godskills binding is invalid');
  }
  exactKeys(value.dependencies, [
    'nativeTransport', 'reviewExecutor', 'revisionExecutor',
    'reviewTransportDescriptorDigest', 'reviewMaterializerDigest',
    'reviewExecutorBindingDigest', 'revisionTransportDescriptorDigest',
    'revisionMaterializerDigest', 'revisionExecutorBindingDigest',
  ], 'provider-backed mission dependencies');
  if (!same(value.dependencies.nativeTransport, provider.descriptors.native)) {
    throw new TypeError('provider native transport descriptor differs from host description');
  }
  const reviewDescriptor = verifyMissionExecutorDescriptor(value.dependencies.reviewExecutor, 'review');
  const revisionDescriptor = verifyMissionExecutorDescriptor(value.dependencies.revisionExecutor, 'revision');
  for (const name of [
    'reviewTransportDescriptorDigest', 'reviewMaterializerDigest',
    'reviewExecutorBindingDigest', 'revisionTransportDescriptorDigest',
    'revisionMaterializerDigest', 'revisionExecutorBindingDigest',
  ]) {
    if (!DIGEST.test(value.dependencies[name])) {
      throw new TypeError(`provider-backed ${name} is invalid`);
    }
  }
  if (value.dependencies.reviewTransportDescriptorDigest
      !== provider.descriptors.review.descriptorDigest) {
    throw new TypeError('provider review transport descriptor differs from host description');
  }
  if (value.dependencies.revisionTransportDescriptorDigest
      !== provider.descriptors.revision.descriptorDigest) {
    throw new TypeError('provider revision transport descriptor differs from host description');
  }
  exactKeys(value.limits, [
    'maximumReviewMaterializedBytes', 'maximumRevisionMaterializedBytes',
  ], 'provider-backed mission dependency limits');
  const reviewBytes = value.limits.maximumReviewMaterializedBytes;
  const revisionBytes = value.limits.maximumRevisionMaterializedBytes;
  if (!Number.isSafeInteger(reviewBytes) || reviewBytes < 128 || reviewBytes > 16_777_216
      || !Number.isSafeInteger(revisionBytes) || revisionBytes < 1024 || revisionBytes > 16_777_216) {
    throw new TypeError('provider-backed mission dependency limits are invalid');
  }
  const expectedReviewMaterializerDigest = sha256Value({
    protocolId: 'eternities-godskills-deferred-review-materializer-v1',
    releaseDigest: value.godskills.releaseDigest,
    maximumMaterializedBytes: reviewBytes,
  });
  const expectedRevisionMaterializerDigest = sha256Value({
    schemaVersion: 1,
    protocolId: 'eternities-mission-revision-materializer-v1',
    maximumMaterializedBytes: revisionBytes,
  });
  if (value.dependencies.reviewMaterializerDigest !== expectedReviewMaterializerDigest
      || value.dependencies.revisionMaterializerDigest !== expectedRevisionMaterializerDigest) {
    throw new TypeError('provider-backed materializer binding is invalid');
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
    throw new TypeError('provider-backed executor binding is invalid');
  }
  const { bindingDigest, ...unsigned } = value;
  if (bindingDigest !== sha256Value(unsigned)) {
    throw new TypeError('provider-backed mission dependency binding digest is invalid');
  }
  return deepFreeze(value);
}

export async function createProviderBackedMissionDependencies(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some((key) => !CONFIGURATION_FIELDS.includes(key))) {
    throw new TypeError('provider-backed mission dependency configuration is invalid');
  }
  const {
    host,
    releasePin,
    maximumReviewMaterializedBytes = 1_048_576,
    maximumRevisionMaterializedBytes = 1_048_576,
    executorIdPrefix = 'provider-backed-mission',
    artifactCache = new Map(),
    io = {},
  } = options;
  const hostDescription = verifyHost(host);
  if (!(artifactCache instanceof Map) || !io || typeof io !== 'object' || Array.isArray(io)
      || typeof executorIdPrefix !== 'string' || executorIdPrefix.length < 1
      || executorIdPrefix.length > 128 || /[\0\r\n]/.test(executorIdPrefix)) {
    throw new TypeError('provider-backed mission dependency policy is invalid');
  }
  if (Object.keys(io).some((key) => !['readFile', 'realpath'].includes(key))
      || ['readFile', 'realpath'].some((key) => Object.hasOwn(io, key) && typeof io[key] !== 'function')) {
    throw new TypeError('provider-backed filesystem io fields are invalid');
  }
  const liveDescriptors = {};
  for (const phase of ['native', 'review', 'revision']) {
    liveDescriptors[phase] = clone(await host[phase].descriptor());
    if (!same(liveDescriptors[phase], hostDescription.descriptors[phase])) {
      throw new TypeError(`provider ${phase} transport descriptor differs from host description`);
    }
  }
  const nativeTransport = pinnedTransport(host.native, liveDescriptors.native);
  const reviewTransport = pinnedTransport(host.review, liveDescriptors.review);
  const revisionTransport = pinnedTransport(host.revision, liveDescriptors.revision);

  const reviewExecutor = await createDeferredGodskillsReviewExecutor({
    releasePin,
    maximumMaterializedBytes: maximumReviewMaterializedBytes,
    executorIdPrefix: `${executorIdPrefix}-review`,
    transport: reviewTransport,
    artifactCache,
    io,
  });
  const revisionExecutor = await createMissionRevisionExecutor({
    maximumMaterializedBytes: maximumRevisionMaterializedBytes,
    executorIdPrefix: `${executorIdPrefix}-revision`,
    transport: revisionTransport,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    provider: clone(hostDescription),
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
  const description = verifyProviderBackedMissionDependenciesDescription({
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
