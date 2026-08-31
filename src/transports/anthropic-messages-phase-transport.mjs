import { mkdir, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { createHttpsTransport } from '../cortex/http-transport.mjs';
import { buildIdentityBoundNativeTransportDescriptor } from '../runtime/identity-bound-native-contracts.mjs';
import { buildMissionRevisionTransportDescriptor } from '../runtime/mission-revision-transport-contracts.mjs';
import { buildGodskillsReviewTransportDescriptor } from '../skills/review-transport-contracts.mjs';
import {
  compileAnthropicMessagesPhaseRequest,
  inspectAnthropicMessagesPhaseResponse,
} from './anthropic-messages-phase-protocol.mjs';
import {
  createAnthropicMessagesPhaseCredentialResolver,
  loadAnthropicMessagesPhaseTransportPolicy,
} from './anthropic-messages-phase-policy.mjs';
import { createDurablePhaseOperationSuite, DurablePhaseOperationError } from './durable-phase-operation.mjs';
import { loadProviderPhaseResolutionPolicy } from './provider-phase-resolution.mjs';

const PROVIDER_USAGE_KEYS = [
  'uncachedInputTokens',
  'cacheCreationInputTokens',
  'cacheReadInputTokens',
  'outputTokens',
  'thinkingTokens',
];

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function descriptorsFor(policy, policyDigest) {
  const id = (phase) => `anthropic-messages-${phase}:${policyDigest}`;
  return deepFreeze({
    native: buildIdentityBoundNativeTransportDescriptor({
      transportId: id('native'),
      maximumDispatchBytes: policy.phases.native.maximumDispatchBytes,
      maximumCompletionBytes: policy.phases.native.maximumCompletionBytes,
    }),
    review: buildGodskillsReviewTransportDescriptor({
      transportId: id('review'),
      maximumCompletionBytes: policy.phases.review.maximumCompletionBytes,
    }),
    revision: buildMissionRevisionTransportDescriptor({
      transportId: id('revision'),
      maximumCompletionBytes: policy.phases.revision.maximumCompletionBytes,
    }),
  });
}

function verifyProviderUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join('\0') !== [...PROVIDER_USAGE_KEYS].sort().join('\0')
      || PROVIDER_USAGE_KEYS.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)
      || value.thinkingTokens !== 0) {
    throw new IntegrityError('Anthropic Messages provider usage evidence is invalid');
  }
  return value;
}

export async function createAnthropicMessagesPhaseTransportSuite({
  policyPath,
  env,
  runtimeRoot,
  fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString(),
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof runtimeRoot !== 'string' || runtimeRoot.length === 0 || /[\0\r\n]/.test(runtimeRoot)
      || typeof fetchImpl !== 'function' || typeof clock !== 'function'
      || typeof checkpoint !== 'function' || !lockOptions || typeof lockOptions !== 'object'
      || Array.isArray(lockOptions)) {
    throw new TypeError('Anthropic Messages phase transport configuration is invalid');
  }
  const loaded = await loadAnthropicMessagesPhaseTransportPolicy({ path: policyPath, env });
  const credentialResolver = createAnthropicMessagesPhaseCredentialResolver({
    env,
    variableName: loaded.policy.provider.credentialEnv,
  });
  await mkdir(resolve(runtimeRoot), { recursive: true });
  const root = await realpath(resolve(runtimeRoot));
  const descriptors = descriptorsFor(loaded.policy, loaded.digest);
  const network = createHttpsTransport({ fetchImpl });
  const phases = await createDurablePhaseOperationSuite({
    policy: loaded.policy,
    policyDigest: loaded.digest,
    descriptors,
    runtimeRoot: root,
    credentialResolver,
    compileRequest: compileAnthropicMessagesPhaseRequest,
    inspectResponse: inspectAnthropicMessagesPhaseResponse,
    verifyProviderEvidence: verifyProviderUsage,
    network,
    networkRequest: ({ policy, credential, request }) => ({
      url: `${policy.provider.endpointOrigin}${policy.provider.endpointPath}`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': policy.provider.apiVersion,
        'x-api-key': credential,
      },
      body: request.body,
      timeoutMs: policy.provider.timeoutMs,
      maxResponseBytes: policy.provider.maximumResponseBytes,
    }),
    clock,
    checkpoint,
    checkpointPrefix: 'anthropic-phase',
    lockOptions,
  });

  function assertCredentialAbsent(value) {
    const credential = credentialResolver.resolve();
    let serialized;
    try {
      serialized = canonicalJson(value);
    } catch (error) {
      throw new TypeError('Anthropic Messages phase transport input is not canonical JSON', { cause: error });
    }
    if (serialized.includes(credential)) throw new DurablePhaseOperationError('credential-in-input');
    return clone(value);
  }

  async function createOperatorResolutionController({
    policyPath: resolutionPolicyPath,
    env: resolutionEnv,
  } = {}) {
    const loadedResolutionPolicy = await loadProviderPhaseResolutionPolicy({
      path: resolutionPolicyPath,
      env: resolutionEnv,
      transportPolicyDigest: loaded.digest,
      maximumProviderResponseBytes: loaded.policy.provider.maximumResponseBytes,
    });
    return phases.createOperatorResolutionController(loadedResolutionPolicy);
  }

  return deepFreeze({
    policyDigest: loaded.digest,
    descriptors,
    native: phases.native,
    review: phases.review,
    revision: phases.revision,
    assertCredentialAbsent,
    createOperatorResolutionController,
  });
}
