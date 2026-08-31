import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyIdentityBoundNativeTransportDescriptor } from '../runtime/identity-bound-native-contracts.mjs';
import { verifyMissionRevisionTransportDescriptor } from '../runtime/mission-revision-transport-contracts.mjs';
import { verifyGodskillsReviewTransportDescriptor } from '../skills/review-transport-contracts.mjs';
import { createAnthropicMessagesPhaseTransportSuite } from '../transports/anthropic-messages-phase-transport.mjs';
import { createOpenAICompatiblePhaseTransportSuite } from '../transports/openai-compatible-phase-transport.mjs';

const PROTOCOL_ID = 'eternities-provider-phase-host-description-v1';
const CONFIGURATION_KEYS = new Set([
  'family',
  'policyPath',
  'env',
  'runtimeRoot',
  'fetchImpl',
  'clock',
  'checkpoint',
  'lockOptions',
]);
const PHASES = Object.freeze(['native', 'review', 'revision']);
const FAMILIES = Object.freeze({
  'openai-compatible-chat-completions-v1': Object.freeze({
    create: createOpenAICompatiblePhaseTransportSuite,
    descriptorPrefix: 'openai-compatible',
    capabilities: Object.freeze({
      wireProfile: 'openai-compatible-chat-completions',
      phases: PHASES,
      structuredOutputs: true,
      durableExecution: true,
      localDispatchSemantics: 'at-most-once',
      providerEvidenceProfile: 'normalized-completion-usage',
      credentialPreflight: true,
      signedAmbiguityResolutionAvailable: true,
    }),
  }),
  'anthropic-messages-v1': Object.freeze({
    create: createAnthropicMessagesPhaseTransportSuite,
    descriptorPrefix: 'anthropic-messages',
    capabilities: Object.freeze({
      wireProfile: 'anthropic-messages',
      phases: PHASES,
      structuredOutputs: true,
      durableExecution: true,
      localDispatchSemantics: 'at-most-once',
      providerEvidenceProfile: 'completion-bound-sidecar',
      credentialPreflight: true,
      signedAmbiguityResolutionAvailable: false,
    }),
  }),
});
const DIGEST = /^[a-f0-9]{64}$/;

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

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function descriptionFor(family, suite) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    family,
    policyDigest: suite.policyDigest,
    capabilities: clone(FAMILIES[family].capabilities),
    descriptors: clone(suite.descriptors),
  };
  return deepFreeze({ ...unsigned, descriptionDigest: sha256Value(unsigned) });
}

export function verifyProviderPhaseHostDescription(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'family', 'policyDigest', 'capabilities',
    'descriptors', 'descriptionDigest',
  ], 'provider phase host description');
  if (value.schemaVersion !== 1 || value.protocolId !== PROTOCOL_ID
      || !Object.hasOwn(FAMILIES, value.family) || !DIGEST.test(value.policyDigest)
      || !DIGEST.test(value.descriptionDigest)) {
    throw new TypeError('provider phase host description identity is invalid');
  }
  exactKeys(value.capabilities, [
    'wireProfile', 'phases', 'structuredOutputs', 'durableExecution',
    'localDispatchSemantics', 'providerEvidenceProfile', 'credentialPreflight',
    'signedAmbiguityResolutionAvailable',
  ], 'provider phase host capabilities');
  if (canonicalJson(value.capabilities) !== canonicalJson(FAMILIES[value.family].capabilities)) {
    throw new TypeError('provider phase host capabilities are invalid');
  }
  exactKeys(value.descriptors, PHASES, 'provider phase host descriptors');
  verifyIdentityBoundNativeTransportDescriptor(value.descriptors.native);
  verifyGodskillsReviewTransportDescriptor(value.descriptors.review);
  verifyMissionRevisionTransportDescriptor(value.descriptors.revision);
  const prefix = FAMILIES[value.family].descriptorPrefix;
  for (const phase of PHASES) {
    if (value.descriptors[phase].transportId !== `${prefix}-${phase}:${value.policyDigest}`) {
      throw new TypeError('provider phase host descriptor family binding is invalid');
    }
  }
  const { descriptionDigest, ...unsigned } = value;
  if (descriptionDigest !== sha256Value(unsigned)) {
    throw new TypeError('provider phase host description digest is invalid');
  }
  return value;
}

export async function createProviderPhaseHost(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('provider phase host configuration is invalid');
  }
  const keys = Object.keys(options);
  if (keys.some((key) => !CONFIGURATION_KEYS.has(key))) {
    throw new TypeError('provider phase host configuration contains unknown fields');
  }
  const { family, ...configuration } = options;
  if (typeof family !== 'string' || !Object.hasOwn(FAMILIES, family)) {
    throw new TypeError('provider phase host family is invalid');
  }
  const suite = await FAMILIES[family].create(configuration);
  const description = verifyProviderPhaseHostDescription(descriptionFor(family, suite));
  return Object.freeze({
    describe() {
      return deepFreeze(clone(description));
    },
    assertCredentialAbsent(value) {
      return suite.assertCredentialAbsent(value);
    },
    native: suite.native,
    review: suite.review,
    revision: suite.revision,
  });
}
