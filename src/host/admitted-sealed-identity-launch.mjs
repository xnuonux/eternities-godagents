import { timingSafeEqual } from 'node:crypto';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { verifyGenesisAdmission } from '../genesis/verify.mjs';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';
import { verifyIdentityBoundNativeTransportDescriptor } from '../runtime/identity-bound-native-contracts.mjs';
import { verifyIdentityBoundMissionVesselRequest } from '../runtime/identity-bound-mission-vessel-contracts.mjs';
import { verifyLocalArtifactEffectRequest } from './structured-effect-producer.mjs';
import { verifyMissionExecutorDescriptor } from '../runtime/mission-phase-contracts.mjs';
import { createSealedLocalIdentityBoundMissionVessel } from '../runtime/sealed-local-identity-bound-mission-vessel.mjs';
import { createRoutingEvidenceActivationClassifier } from '../skills/routing-evidence-activation-classifier.mjs';
import {
  assertAdmissionPolicyBinding,
  assertSafeAdmissionTree,
  readAdmissionBinding,
} from './admitted-identity-boundary.mjs';
import {
  loadIdentityHostPolicy,
  verifyIdentityHostPolicyRouting,
} from './identity-policy.mjs';
import { claimLocalInstanceResidency, defaultLocalInstanceRegistryRoot } from './local-instance-registry.mjs';
import { executeEffectOnlyIdentity } from './effect-only-identity-execution.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const MESSAGES = Object.freeze({
  'input-invalid': 'admitted sealed identity launch input is invalid',
  'admission-invalid': 'admitted sealed identity launch evidence is invalid',
  'policy-integrity': 'admitted sealed identity policy integrity failed',
  'policy-mismatch': 'admitted sealed identity policy does not match admission',
  'request-invalid': 'admitted sealed identity request exceeds policy',
  'dependency-mismatch': 'admitted sealed identity dependency differs from policy',
  'residency-conflict': 'admitted sealed identity is resident elsewhere',
  'launch-failed': 'admitted sealed identity launch failed',
});

export class AdmittedSealedIdentityLaunchError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) {
      throw new TypeError('admitted sealed identity launch error code is invalid');
    }
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'AdmittedSealedIdentityLaunchError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new AdmittedSealedIdentityLaunchError(code, cause);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
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

function verifyTransportShape(value, label) {
  if (!object(value)) throw new TypeError(`${label} must be an object`);
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof value[method] !== 'function') throw new TypeError(`${label} ${method} is required`);
  }
}

function assertAtMost(value, maximum, label) {
  if (value > maximum) throw new Error(`identity host request ${label} exceeds policy ceiling`);
}

export function verifyIdentityHostRequest(policy, inputRequest) {
  if (!object(policy) || !object(policy.runtime)) {
    throw new TypeError('identity host policy is required');
  }
  const request = structuredClone(inputRequest);
  if (request.schemaVersion === 2) {
    if (policy.schemaVersion !== 2
        || policy.runtime.protocolId !== 'eternities-admitted-sealed-identity-host-v2') {
      throw new Error('identity host policy does not support the requested effect protocol');
    }
    verifyLocalArtifactEffectRequest(request, {
      expectedProducerDescriptorDigest: policy.runtime.effectProducerDescriptorDigest,
    });
  } else {
    if (policy.schemaVersion !== 1) throw new Error('identity host request version differs from policy');
    verifyIdentityBoundMissionVesselRequest(request);
  }
  if (request.task.hostAdapterId !== policy.runtime.hostAdapterId
      || request.task.revocationEpoch !== policy.runtime.revocationEpoch) {
    throw new Error('identity host request task identity differs from policy');
  }
  const authority = new Set(policy.authority);
  if (request.requestedAuthority.some((entry) => !authority.has(entry))) {
    throw new Error('identity host request authority exceeds policy');
  }
  if (!same(request.hostCeiling, policy.hostContext)) {
    throw new Error('identity host request ceiling differs from policy');
  }
  const limits = policy.runtime.limits;
  for (const [name, value, maximum] of [
    ['artifact bytes', request.budgets.maxArtifactBytes, limits.maxArtifactBytes],
    ['native completion tokens', request.budgets.nativeCompletionTokens, limits.nativeCompletionTokens],
    ['review completion tokens', request.budgets.reviewCompletionTokensPerRound, limits.reviewCompletionTokensPerRound],
    ['revision completion tokens', request.budgets.revisionCompletionTokens, limits.revisionCompletionTokens],
    ['total completion tokens', request.budgets.totalCompletionTokens, limits.totalCompletionTokens],
    ['projection bytes', request.maxProjectionBytes, limits.maxProjectionBytes],
    ['cycles', request.maxCycles, limits.maxCycles],
  ]) assertAtMost(value, maximum, name);
  return deepFreeze(request);
}

async function descriptorOf(value, verifier, label, expectedPhase) {
  verifyTransportShape(value, label);
  const descriptor = structuredClone(await value.descriptor());
  return expectedPhase === undefined
    ? verifier(descriptor)
    : verifier(descriptor, expectedPhase);
}

async function verifyDependencies({
  policy,
  verifiedRoutingExecutable,
  nativeTransport,
  reviewExecutor,
  revisionExecutor,
}) {
  const nativeDescriptor = await descriptorOf(
    nativeTransport,
    verifyIdentityBoundNativeTransportDescriptor,
    'identity-bound native transport',
  );
  if (!same(nativeDescriptor, policy.runtime.nativeTransport)) {
    throw new Error('identity-bound native transport descriptor differs from policy');
  }
  const expectsReview = Object.hasOwn(policy.runtime, 'reviewExecutor');
  if (expectsReview !== Object.hasOwn(policy.runtime, 'revisionExecutor')) {
    throw new Error('identity host policy review pair is incomplete');
  }
  const hasReview = reviewExecutor !== null && reviewExecutor !== undefined;
  const hasRevision = revisionExecutor !== null && revisionExecutor !== undefined;
  if (hasReview !== hasRevision || hasReview !== expectsReview) {
    throw new Error('live review and revision executors differ from policy');
  }
  if (expectsReview) {
    const reviewDescriptor = await descriptorOf(
      reviewExecutor,
      verifyMissionExecutorDescriptor,
      'review executor',
      'review',
    );
    const revisionDescriptor = await descriptorOf(
      revisionExecutor,
      verifyMissionExecutorDescriptor,
      'revision executor',
      'revision',
    );
    if (!same(reviewDescriptor, policy.runtime.reviewExecutor)
        || !same(revisionDescriptor, policy.runtime.revisionExecutor)) {
      throw new Error('live review or revision executor descriptor differs from policy');
    }
  }
  if (policy.schemaVersion === 2) {
    if (expectsReview) throw new Error('effect-only policy cannot activate review executors');
    return Object.freeze({ classifier: null, expectsReview: false });
  }
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable,
    reviewAvailable: expectsReview,
  });
  if (!same(classifier.descriptor, policy.runtime.activationClassifier)) {
    throw new Error('derived activation classifier differs from policy');
  }
  return Object.freeze({ classifier, expectsReview });
}

function validateInputs({
  admissionRoot,
  policyPath,
  nativeTransport,
  reviewExecutor,
  revisionExecutor,
  clock,
  godskillsClock,
  checkpoint,
  lockOptions,
  godskillsLockOptions,
  artifactCache,
  io,
}) {
  if ([admissionRoot, policyPath].some((value) => typeof value !== 'string'
      || value.length === 0 || /[\0\r\n]/.test(value))
      || !object(nativeTransport)
      || (reviewExecutor !== null && reviewExecutor !== undefined && !object(reviewExecutor))
      || (revisionExecutor !== null && revisionExecutor !== undefined && !object(revisionExecutor))
      || typeof clock !== 'function'
      || typeof godskillsClock !== 'function'
      || typeof checkpoint !== 'function'
      || !object(lockOptions)
      || !object(godskillsLockOptions)
      || !(artifactCache instanceof Map)
      || !object(io)) fail('input-invalid');
  try {
    verifyTransportShape(nativeTransport, 'identity-bound native transport');
    if (reviewExecutor !== null && reviewExecutor !== undefined) {
      verifyTransportShape(reviewExecutor, 'review executor');
    }
    if (revisionExecutor !== null && revisionExecutor !== undefined) {
      verifyTransportShape(revisionExecutor, 'revision executor');
    }
  } catch (error) {
    fail('input-invalid', error);
  }
}

export async function launchAdmittedSealedIdentityMission({
  admissionRoot,
  policyPath,
  request: inputRequest,
  env,
  registryRoot,
  nativeTransport,
  reviewExecutor = null,
  revisionExecutor = null,
  clock = Date.now,
  godskillsClock = () => new Date().toISOString(),
  checkpoint = async () => {},
  lockOptions = {},
  godskillsLockOptions = {},
  artifactCache = new Map(),
  io = {},
} = {}) {
  validateInputs({
    admissionRoot,
    policyPath,
    nativeTransport,
    reviewExecutor,
    revisionExecutor,
    clock,
    godskillsClock,
    checkpoint,
    lockOptions,
    godskillsLockOptions,
    artifactCache,
    io,
  });
  const root = resolve(admissionRoot);
  const resolvedPolicyPath = resolve(policyPath);
  let binding;
  try {
    await assertSafeAdmissionTree(root);
    binding = await readAdmissionBinding(root);
  } catch (error) {
    fail('admission-invalid', error);
  }

  let loaded;
  try {
    loaded = await loadIdentityHostPolicy(resolvedPolicyPath);
  } catch (error) {
    fail('policy-integrity', error);
  }
  const rawPin = env?.GODAGENT_IDENTITY_POLICY_SHA256;
  const pinnedDigest = typeof rawPin === 'string' ? rawPin.toLowerCase() : '';
  if (!DIGEST.test(pinnedDigest)
      || !timingSafeEqual(Buffer.from(pinnedDigest, 'hex'), Buffer.from(loaded.digest, 'hex'))) {
    fail('policy-integrity');
  }
  try {
    assertAdmissionPolicyBinding({
      policy: loaded.policy,
      policyPath: resolvedPolicyPath,
      admissionRoot: root,
      binding,
    });
  } catch (error) {
    fail('policy-mismatch', error);
  }

  const genesisAdmission = {
    receiptPath: join(root, 'transaction', 'genesis-receipt.json'),
    creationDir: join(root, 'creation'),
    distributionDir: join(root, 'distribution'),
    expectedPolicyDigest: binding.policyDigest,
    expectedCreationBuildId: binding.creationBuildId,
    instanceId: binding.instanceId,
    creatorRef: binding.creatorRef,
    transactionDir: join(root, 'transaction'),
    journalPath: join(root, 'vessel', 'journal.jsonl'),
    snapshotPath: join(root, 'vessel', 'snapshot.json'),
    keelAdapter: createLocalKeelBackend({ root: join(root, 'keels') }),
  };
  let verifiedAdmission;
  try {
    verifiedAdmission = await verifyGenesisAdmission(genesisAdmission);
  } catch (error) {
    fail('admission-invalid', error);
  }
  if (loaded.policy.realmId !== verifiedAdmission.distributionSnapshot.realmContract.realmId) {
    fail('policy-mismatch');
  }

  try {
    await claimLocalInstanceResidency({
      registryRoot: registryRoot ?? defaultLocalInstanceRegistryRoot(),
      binding,
      admissionRoot: root,
    });
  } catch (error) {
    fail('residency-conflict', error);
  }

  let request;
  try {
    request = verifyIdentityHostRequest(loaded.policy, inputRequest);
  } catch (error) {
    fail('request-invalid', error);
  }
  let dependencies;
  let verifiedRoutingExecutable;
  try {
    verifiedRoutingExecutable = await verifyIdentityHostPolicyRouting(
      loaded.policy,
      { artifactCache, io },
    );
  } catch (error) {
    fail('policy-integrity', error);
  }
  try {
    dependencies = await verifyDependencies({
      policy: loaded.policy,
      verifiedRoutingExecutable,
      nativeTransport,
      reviewExecutor,
      revisionExecutor,
    });
  } catch (error) {
    fail('dependency-mismatch', error);
  }

  const limits = loaded.policy.runtime.limits;
  try {
    if (loaded.policy.schemaVersion === 2) {
      return await executeEffectOnlyIdentity({ root, policy: loaded.policy, request, genesisAdmission,
        verifiedPair: verifiedRoutingExecutable, nativeTransport, clock, checkpoint, lockOptions });
    }
    const vessel = await createSealedLocalIdentityBoundMissionVessel({
      genesisAdmission,
      runtimeRoot: join(root, 'vessel', 'sealed-identity-v1'),
      releasePin: loaded.policy.runtime.godskillsRelease,
      routingPin: loaded.policy.runtime.routingExecutable,
      activationClassifier: dependencies.classifier.classify,
      nativeTransport,
      reviewExecutor: dependencies.expectsReview ? reviewExecutor : null,
      revisionExecutor: dependencies.expectsReview ? revisionExecutor : null,
      timeoutMs: limits.timeoutMs,
      maximumGodskillsDispatchBytes: limits.maximumGodskillsDispatchBytes,
      maximumGodskillsCompletionBytes: limits.maximumGodskillsCompletionBytes,
      maximumGodskillsResultBytes: limits.maximumGodskillsResultBytes,
      maximumNativeMaterializedBytes: limits.maximumNativeMaterializedBytes,
      clock,
      godskillsClock,
      checkpoint,
      lockOptions,
      godskillsLockOptions,
      artifactCache,
      io,
    });
    return await vessel.run(request);
  } catch (error) {
    if (error instanceof AdmittedSealedIdentityLaunchError) throw error;
    fail('launch-failed', error);
  }
}
