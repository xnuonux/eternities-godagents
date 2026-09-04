import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';

export const REALM_NEGOTIATION_PROTOCOL_ID = 'eternities-realm-negotiation-v1';

const NEGOTIATION_KEYS = [
  'schemaVersion',
  'protocolId',
  'contractDigest',
  'realmId',
  'version',
  'trustModel',
  'capabilities',
  'observations',
  'availableHands',
  'omittedHandIds',
  'resources',
  'privacy',
  'lifecycle',
  'compatibleDistributions',
  'authorityCeiling',
  'negotiationDigest',
];

const AUTHORITY_KEYS = ['availableAuthority', 'permittedEffects'];
const HAND_KEYS = [
  'id',
  'effect',
  'requiredAuthority',
  'idempotent',
  'inputSchema',
  'expectedOutcome',
];
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label);
  const expectedSet = new Set(expected);
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const extra = actual.filter((key) => !expectedSet.has(key));
  if (missing.length || extra.length) {
    throw new Error(`${label} fields do not match the certified shape`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error(`${label} must contain non-empty strings`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function deterministicCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedStrings(values) {
  return [...values].sort(deterministicCompare);
}

function validateAuthority(authority) {
  assertObject(authority, 'Realm authority ceiling');
  assertNoCredentialFields(authority);
  assertExactKeys(authority, AUTHORITY_KEYS, 'Realm authority ceiling');
  assertUniqueStrings(authority.availableAuthority, 'Realm authority ceiling availableAuthority');
  assertUniqueStrings(authority.permittedEffects, 'Realm authority ceiling permittedEffects');
  return {
    availableAuthority: sortedStrings(authority.availableAuthority),
    permittedEffects: sortedStrings(authority.permittedEffects),
  };
}

function validateContract(contract) {
  assertObject(contract, 'Realm contract');
  assertNoCredentialFields(contract);
  assertSchema('realm-contract', contract);
  assertUniqueStrings(contract.capabilities, 'Realm contract capabilities');
  assertUniqueStrings(contract.compatibleDistributions, 'Realm contract compatibleDistributions');

  const observationIds = new Set();
  const observationFields = new Set();
  for (const observation of contract.observations) {
    if (observationIds.has(observation.id)) throw new Error('Realm contract observation ids must be unique');
    observationIds.add(observation.id);
    // The fixture contract names an observation stream `counter.state` while
    // its typed outcome reads the projected payload field `counter`. Preserve
    // that existing contract shape while still requiring the field to belong
    // to a declared observation namespace.
    const segments = observation.id.split('.');
    for (let index = 1; index <= segments.length; index += 1) {
      observationFields.add(segments.slice(0, index).join('.'));
    }
  }

  const handIds = new Set();
  for (const hand of contract.hands) {
    if (handIds.has(hand.id)) throw new Error('Realm contract hand ids must be unique');
    handIds.add(hand.id);
    assertUniqueStrings(hand.requiredAuthority, `Realm hand ${hand.id} requiredAuthority`);

    const requiredInputFields = new Set(hand.inputSchema.required);
    for (const required of hand.inputSchema.required) {
      if (!Object.hasOwn(hand.inputSchema.properties, required)) {
        throw new Error(`Realm hand ${hand.id} required input field is not declared`);
      }
    }
    for (const [outputField, rule] of Object.entries(hand.expectedOutcome.fields)) {
      if (!observationFields.has(rule.observationField)) {
        throw new Error(`Realm hand ${hand.id} output ${outputField} references an undeclared observation`);
      }
      if (!requiredInputFields.has(rule.addInputField)) {
        throw new Error(`Realm hand ${hand.id} output ${outputField} references a non-required input field`);
      }
    }
  }
  return contract;
}

function handIsWithinCeiling(hand, authority) {
  const permittedEffects = new Set(authority.permittedEffects);
  const availableAuthority = new Set(authority.availableAuthority);
  return permittedEffects.has(hand.effect)
    && hand.requiredAuthority.every((requirement) => availableAuthority.has(requirement));
}

function unsignedNegotiation({ contract, authority }) {
  const availableHands = contract.hands
    .filter((hand) => handIsWithinCeiling(hand, authority))
    .map(clone)
    .sort((left, right) => deterministicCompare(left.id, right.id));
  const availableIds = new Set(availableHands.map((hand) => hand.id));

  return {
    schemaVersion: 1,
    protocolId: REALM_NEGOTIATION_PROTOCOL_ID,
    contractDigest: sha256Value(contract),
    realmId: contract.realmId,
    version: contract.version,
    trustModel: contract.trustModel,
    capabilities: sortedStrings(contract.capabilities),
    observations: contract.observations
      .map(clone)
      .sort((left, right) => deterministicCompare(left.id, right.id)),
    availableHands,
    omittedHandIds: sortedStrings(contract.hands
      .map((hand) => hand.id)
      .filter((id) => !availableIds.has(id))),
    resources: clone(contract.resources),
    privacy: clone(contract.privacy),
    lifecycle: clone(contract.lifecycle),
    compatibleDistributions: sortedStrings(contract.compatibleDistributions),
    authorityCeiling: clone(authority),
  };
}

function validateNegotiationShape(value) {
  assertObject(value, 'Realm negotiation');
  assertNoCredentialFields(value);
  assertExactKeys(value, NEGOTIATION_KEYS, 'Realm negotiation');
  assertSchema('realm-negotiation', value);
  if (value.schemaVersion !== 1 || value.protocolId !== REALM_NEGOTIATION_PROTOCOL_ID) {
    throw new Error('Realm negotiation protocol version is unsupported');
  }
  assertDigest(value.contractDigest, 'Realm negotiation contractDigest');
  assertDigest(value.negotiationDigest, 'Realm negotiation negotiationDigest');
  if (typeof value.realmId !== 'string' || value.realmId.length === 0) throw new Error('Realm negotiation realmId is invalid');
  if (typeof value.version !== 'string' || value.version.length === 0) throw new Error('Realm negotiation version is invalid');
  if (value.trustModel !== 'fixture-local') throw new Error('Realm negotiation trust model is unsupported');
  assertUniqueStrings(value.capabilities, 'Realm negotiation capabilities');
  assertUniqueStrings(value.omittedHandIds, 'Realm negotiation omittedHandIds');
  assertUniqueStrings(value.compatibleDistributions, 'Realm negotiation compatibleDistributions');
  if (!Array.isArray(value.observations)) throw new Error('Realm negotiation observations are invalid');
  if (!Array.isArray(value.availableHands)) throw new Error('Realm negotiation availableHands are invalid');
  for (const hand of value.availableHands) {
    assertExactKeys(hand, HAND_KEYS, 'Realm negotiation available hand');
    assertUniqueStrings(hand.requiredAuthority, `Realm negotiation hand ${hand.id} requiredAuthority`);
  }
  return value;
}

export function buildRealmNegotiation(input) {
  assertObject(input, 'Realm negotiation input');
  assertExactKeys(input, ['contract', 'authority'], 'Realm negotiation input');
  const contract = validateContract(input.contract);
  const authority = validateAuthority(input.authority);
  const unsigned = unsignedNegotiation({ contract, authority });
  const negotiation = {
    ...unsigned,
    negotiationDigest: sha256Value(unsigned),
  };
  validateNegotiationShape(negotiation);
  assertNoCredentialFields(negotiation);
  return deepFreeze(negotiation);
}

export function verifyRealmNegotiation(value, input = {}) {
  assertObject(input, 'Realm negotiation verification input');
  assertExactKeys(input, ['contract', 'authority'], 'Realm negotiation verification input');
  validateNegotiationShape(value);
  const expected = buildRealmNegotiation(input);
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new Error('Realm negotiation does not match the exact contract, authority ceiling, or negotiation digest');
  }
  return deepFreeze(clone(value));
}
