import { readFile } from 'node:fs/promises';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const retryableReasons = new Set(['connect-failed', 'timeout', 'rate-limited', 'transient-server']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function unique(values) {
  return new Set(values).size === values.length;
}

function validateSemantics(policy) {
  const origin = new URL(policy.provider.endpointOrigin);
  if (origin.protocol !== 'https:') throw new Error('host policy provider origin requires HTTPS');
  if (origin.origin !== policy.provider.endpointOrigin || origin.pathname !== '/') {
    throw new Error('host policy endpointOrigin must contain only an HTTPS origin');
  }
  if (!policy.provider.endpointPath.startsWith('/') || /[?#]/.test(policy.provider.endpointPath)) {
    throw new Error('host policy endpointPath must be a query-free absolute path');
  }
  if (policy.provider.modelIds.length === 0 || !unique(policy.provider.modelIds)) {
    throw new Error('host policy modelIds must be a non-empty unique allowlist');
  }
  if (!policy.provider.modelIds.includes(policy.provider.selectedModel)) {
    throw new Error('host policy selected model is outside modelIds');
  }
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(policy.provider.credentialEnv)) {
    throw new Error('host policy credentialEnv is invalid');
  }
  if (policy.provider.timeoutMs < 100 || policy.provider.timeoutMs > 120_000) {
    throw new Error('host policy timeoutMs is outside bounds');
  }
  if (policy.provider.maxResponseBytes < 256 || policy.provider.maxResponseBytes > 4_194_304) {
    throw new Error('host policy maxResponseBytes is outside bounds');
  }
  if (policy.provider.maxProposalTtlMs < 1_000 || policy.provider.maxProposalTtlMs > 600_000) {
    throw new Error('host policy maxProposalTtlMs is outside bounds');
  }
  if (policy.provider.maxPromptBytes < 256 || policy.provider.maxPromptBytes > 1_048_576) {
    throw new Error('host policy maxPromptBytes is outside bounds');
  }
  if (policy.provider.maxCompletionTokens < 1 || policy.provider.maxCompletionTokens > 8_192) {
    throw new Error('host policy maxCompletionTokens is outside bounds');
  }
  if (policy.inference.maxAttempts > 3) throw new Error('host policy maxAttempts exceeds 3');
  if (policy.inference.maxCycleCompletionTokens < policy.provider.maxCompletionTokens
    || policy.inference.maxCycleCompletionTokens > 24_576) {
    throw new Error('host policy maxCycleCompletionTokens is outside bounds');
  }
  if (!unique(policy.inference.retryableReasonCodes)
    || policy.inference.retryableReasonCodes.some((reason) => !retryableReasons.has(reason))) {
    throw new Error('host policy retryableReasonCodes are invalid');
  }
  if (!unique(policy.authority) || !unique(policy.hostContext.availableAuthority)) {
    throw new Error('host policy authority values must be unique');
  }
  const hostAuthority = new Set(policy.hostContext.availableAuthority);
  if (policy.authority.some((authority) => !hostAuthority.has(authority))) {
    throw new Error('host policy authority expands beyond hostContext');
  }
}

export async function loadHostPolicy(path) {
  let policy;
  try {
    policy = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('host policy could not be loaded');
  }
  assertSchema('host-policy', policy);
  validateSemantics(policy);
  const digest = sha256Text(canonicalJson(policy));
  return Object.freeze({ policy: deepFreeze(policy), digest });
}

export function createCredentialResolver({ env, variableName }) {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(variableName ?? '')) throw new Error('credential variable name is invalid');
  const value = env?.[variableName];
  if (typeof value !== 'string' || value.length === 0) throw new Error('credential is unavailable');
  return Object.freeze({
    resolve() {
      return value;
    },
  });
}
