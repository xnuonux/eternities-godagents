import { readFile } from 'node:fs/promises';

import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { verifyRoutingEvidenceActivationClassifierDescriptor } from '../skills/routing-evidence-activation-classifier.mjs';
import { verifyTypedCapabilityExecutorDescriptor } from './admitted-typed-execution-contracts.mjs';

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
    throw new Error(`typed execution host policy ${label} must be sorted unique strings`);
  }
}

function validateSemantics(policy) {
  const runtime = policy.runtime;
  for (const [label, value] of [
    ['policy id', policy.policyId], ['instance id', runtime.instanceId],
    ['host adapter id', runtime.hostAdapterId], ['Realm id', policy.realmId],
  ]) {
    if (!IDENTIFIER.test(value) || value === '.' || value === '..') {
      throw new Error(`typed execution host policy ${label} is invalid`);
    }
  }
  for (const [label, value] of [
    ['distribution path', runtime.distributionDir],
    ['journal path', runtime.journalPath],
    ['snapshot path', runtime.snapshotPath],
  ]) {
    if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) {
      throw new Error(`typed execution host policy ${label} is invalid`);
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
    throw new Error('typed execution host policy authority expands beyond host context');
  }
  if (runtime.godskillsRelease?.adapterProtocol !== 'eternities-godskills-adapter-v1'
      || runtime.routingExecutable?.protocolId !== 'eternities-godskills-routing-executable-v1'
      || runtime.typedCompositionRelease?.protocolId !== 'eternities-godskills-typed-composition-consumer-v1'
      || runtime.typedExecutionStepperRelease?.protocolId !== 'eternities-godskills-typed-execution-stepper-consumer-v1') {
    throw new Error('typed execution host policy release pin identity is invalid');
  }
  const executors = runtime.executors.map(verifyTypedCapabilityExecutorDescriptor);
  const capabilityIds = executors.map(({ capabilityId }) => capabilityId);
  if (!same(capabilityIds, [...capabilityIds].sort()) || new Set(capabilityIds).size !== capabilityIds.length) {
    throw new Error('typed execution host policy executors must be sorted and unique');
  }
  if (executors.some((descriptor) => descriptor.maximumInputBytes > runtime.limits.maximumExecutorInputBytes
      || descriptor.maximumOutputBytes > runtime.limits.maximumExecutorOutputBytes)) {
    throw new Error('typed execution host policy executor ceiling exceeds host limit');
  }
  if (executors.length > policy.hostContext.maxCompositionSize
      || executors.length > runtime.limits.maximumTopologyNodes) {
    throw new Error('typed execution host policy executor set exceeds composition ceiling');
  }
  const classifier = verifyRoutingEvidenceActivationClassifierDescriptor(runtime.activationClassifier);
  if (classifier.routingTrustRootDigest !== runtime.routingExecutable.executableReceipt?.receiptDigest
      || classifier.reviewAvailable !== capabilityIds.includes('eternities-muse')) {
    throw new Error('typed execution host policy classifier differs from executable or executor set');
  }
  const limits = runtime.limits;
  const maximumCompletion = limits.nativeCompletionTokens
    + (2 * limits.reviewCompletionTokensPerRound)
    + limits.revisionCompletionTokens;
  if (limits.totalCompletionTokens < limits.nativeCompletionTokens
      || limits.totalCompletionTokens > maximumCompletion
      || limits.maximumGodskillsResultBytes < runtime.godskillsRelease.maximumPackageBytes
      || limits.maxArtifactBytes > limits.maximumExecutorOutputBytes) {
    throw new Error('typed execution host policy limits are incoherent');
  }
}

export async function loadAdmittedTypedExecutionPolicy(path) {
  let text;
  let policy;
  try {
    text = await readFile(path, 'utf8');
    policy = JSON.parse(text);
  } catch {
    throw new Error('typed execution host policy could not be loaded');
  }
  if (text !== `${canonicalJson(policy)}\n`) {
    throw new Error('typed execution host policy is not canonical JSON');
  }
  assertNoCredentialFields(policy);
  assertSchema('admitted-typed-execution-host-policy', policy);
  validateSemantics(policy);
  const frozen = deepFreeze(policy);
  return Object.freeze({ policy: frozen, digest: sha256Text(canonicalJson(frozen)) });
}
