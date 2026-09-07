import { readFile } from 'node:fs/promises';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { localArtifactEffectProducer } from './structured-effect-producer.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { verifyIdentityBoundNativeTransportDescriptor } from '../runtime/identity-bound-native-contracts.mjs';
import { verifyMissionExecutorDescriptor } from '../runtime/mission-phase-contracts.mjs';
import { verifyGodskillsRoutingExecutable } from '../skills/routing-executable-verifier.mjs';
import { verifyRoutingEvidenceActivationClassifierDescriptor } from '../skills/routing-evidence-activation-classifier.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sortedUniqueStrings(values, label) {
  if (!Array.isArray(values)
      || values.some((value) => typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value))
      || new Set(values).size !== values.length
      || !same(values, [...values].sort())) {
    throw new Error(`identity host policy ${label} must be sorted unique strings`);
  }
}

function validateSemantics(policy) {
  const runtime = policy.runtime;
  if (policy.schemaVersion === 1) {
    if (runtime.protocolId !== 'eternities-admitted-sealed-identity-host-v1'
        || Object.hasOwn(runtime, 'effectProducerDescriptorDigest')) {
      throw new Error('identity host v1 policy cannot negotiate an effect producer');
    }
  } else if (policy.schemaVersion !== 2
      || runtime.protocolId !== 'eternities-admitted-sealed-identity-host-v2'
      || runtime.effectProducerDescriptorDigest !== sha256Value(localArtifactEffectProducer)) {
    throw new Error('identity host effect producer protocol or descriptor is unsupported');
  }
  for (const [label, value] of [
    ['policy id', policy.policyId],
    ['instance id', runtime.instanceId],
    ['host adapter id', runtime.hostAdapterId],
    ['Realm id', policy.realmId],
  ]) {
    if (!IDENTIFIER.test(value) || value === '.' || value === '..') {
      throw new Error(`identity host policy ${label} is invalid`);
    }
  }
  for (const [label, value] of [
    ['distribution path', runtime.distributionDir],
    ['journal path', runtime.journalPath],
    ['snapshot path', runtime.snapshotPath],
  ]) {
    if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) {
      throw new Error(`identity host policy ${label} is invalid`);
    }
  }
  for (const [label, values] of [
    ['authority', policy.authority],
    ['available authority', policy.hostContext.availableAuthority],
    ['permitted effects', policy.hostContext.permittedEffects],
    ['available preconditions', policy.hostContext.availablePreconditions],
    ['forbidden capabilities', policy.hostContext.forbiddenCapabilities],
  ]) sortedUniqueStrings(values, label);
  const available = new Set(policy.hostContext.availableAuthority);
  if (policy.authority.some((value) => !available.has(value))) {
    throw new Error('identity host policy authority expands beyond host context');
  }
  assertSchema('godskills-release-pin', runtime.godskillsRelease);
  assertSchema('godskills-routing-executable-pin', runtime.routingExecutable);
  if (!runtime.godskillsRelease.activation) {
    throw new Error('identity host policy requires the verified Godskills activation root');
  }
  if (runtime.godskillsRelease.maximumSelected > policy.hostContext.maxCompositionSize) {
    throw new Error('identity host policy Godskills selection exceeds composition ceiling');
  }
  if (runtime.godskillsRelease.maximumPackageBytes > policy.hostContext.contextBudget * 4) {
    throw new Error('identity host policy Godskills package exceeds context budget');
  }
  const classifier = verifyRoutingEvidenceActivationClassifierDescriptor(runtime.activationClassifier);
  if (classifier.routingTrustRootDigest !== runtime.routingExecutable.executableReceipt.receiptDigest) {
    throw new Error('identity host policy classifier differs from routing executable root');
  }
  const native = verifyIdentityBoundNativeTransportDescriptor(runtime.nativeTransport);
  const hasReview = Object.hasOwn(runtime, 'reviewExecutor');
  const hasRevision = Object.hasOwn(runtime, 'revisionExecutor');
  if (hasReview !== hasRevision) {
    throw new Error('identity host policy review and revision descriptors must be paired');
  }
  if (hasReview) {
    verifyMissionExecutorDescriptor(runtime.reviewExecutor, 'review');
    verifyMissionExecutorDescriptor(runtime.revisionExecutor, 'revision');
  }
  if (classifier.reviewAvailable !== (hasReview && hasRevision)) {
    throw new Error('identity host policy classifier review availability differs from executor policy');
  }
  const limits = runtime.limits;
  if (limits.maxArtifactBytes > native.maximumCompletionBytes
      || limits.maxArtifactBytes > limits.maximumNativeMaterializedBytes) {
    throw new Error('identity host policy artifact limit exceeds native transport or materialization limit');
  }
  const maximumCompletion = limits.nativeCompletionTokens
    + (2 * limits.reviewCompletionTokensPerRound)
    + limits.revisionCompletionTokens;
  if (limits.totalCompletionTokens < limits.nativeCompletionTokens
      || limits.totalCompletionTokens > maximumCompletion) {
    throw new Error('identity host policy total completion token limit is incoherent');
  }
  if (limits.maximumGodskillsResultBytes < runtime.godskillsRelease.maximumPackageBytes) {
    throw new Error('identity host policy Godskills result limit is below package ceiling');
  }
}

export async function loadIdentityHostPolicy(path) {
  let text;
  let policy;
  try {
    text = await readFile(path, 'utf8');
    policy = JSON.parse(text);
  } catch {
    throw new Error('identity host policy could not be loaded');
  }
  if (text !== `${canonicalJson(policy)}\n`) {
    throw new Error('identity host policy is not canonical JSON');
  }
  assertSchema(policy.schemaVersion === 2 ? 'identity-host-policy-v2' : 'identity-host-policy', policy);
  validateSemantics(policy);
  const frozen = deepFreeze(policy);
  return Object.freeze({
    policy: frozen,
    digest: sha256Text(canonicalJson(frozen)),
  });
}

export async function verifyIdentityHostPolicyRouting(policy, {
  artifactCache = new Map(),
  io = {},
} = {}) {
  assertSchema(policy.schemaVersion === 2 ? 'identity-host-policy-v2' : 'identity-host-policy', policy);
  validateSemantics(policy);
  const verified = await verifyGodskillsRoutingExecutable({
    releasePin: policy.runtime.godskillsRelease,
    routingPin: policy.runtime.routingExecutable,
    artifactCache,
    io,
  });
  if (verified.routing.trustRootDigest !== policy.runtime.activationClassifier.routingTrustRootDigest) {
    throw new Error('identity host policy classifier differs from verified routing executable root');
  }
  return verified;
}
