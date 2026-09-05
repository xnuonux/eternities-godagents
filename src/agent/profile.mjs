import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

export const GODAGENT_PROFILE_PROTOCOL_ID = 'eternities-godagent-profile-v1';

const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const PROFILES = new Set(['all-rounder', 'specialist']);

const clone = (value) => structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const byteCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!same(actual, wanted)) throw new TypeError(`${label} fields are invalid`);
}

function identifiers(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const entries = [...value];
  if (new Set(entries).size !== entries.length) throw new TypeError(`${label} must not contain duplicate entries`);
  for (const entry of entries) {
    if (typeof entry !== 'string' || !IDENTIFIER.test(entry)) {
      throw new TypeError(`${label} contains an invalid identifier`);
    }
  }
  return entries.sort(byteCompare);
}

export function normalizeGodagentProfile(input) {
  exactKeys(input, [
    'profile', 'preferredFamilies', 'prohibitedFamilies', 'prohibitedCapabilities', 'maxComposition',
  ], 'Godagent profile policy');
  if (!PROFILES.has(input.profile)) throw new TypeError('Godagent profile kind is invalid');
  if (!Number.isInteger(input.maxComposition) || input.maxComposition < 1 || input.maxComposition > 3) {
    throw new TypeError('Godagent profile maxComposition must be between 1 and 3');
  }
  return deepFreeze({
    profile: input.profile,
    preferredFamilies: identifiers(input.preferredFamilies, 'Godagent preferred families'),
    prohibitedFamilies: identifiers(input.prohibitedFamilies, 'Godagent prohibited families'),
    prohibitedCapabilities: identifiers(input.prohibitedCapabilities, 'Godagent prohibited capabilities'),
    maxComposition: input.maxComposition,
  });
}

export function validateGodagentProfilePolicy(input) {
  const policy = normalizeGodagentProfile(input);
  const prohibitedFamilies = new Set(policy.prohibitedFamilies);
  if (policy.profile === 'specialist'
      && policy.preferredFamilies.some((family) => prohibitedFamilies.has(family))) {
    throw new TypeError('specialist preferred and prohibited families are contradictory');
  }
  return policy;
}

function normalizeCatalog(input) {
  const rows = Array.isArray(input) ? input : input?.capabilities;
  if (!Array.isArray(rows)) throw new TypeError('Godagent profile catalog is required');
  const normalized = rows.map((row, index) => {
    exactKeys(row, ['id', 'family'], `Godagent profile catalog row ${index}`);
    if (typeof row.id !== 'string' || !IDENTIFIER.test(row.id)) {
      throw new TypeError('Godagent profile catalog id is invalid');
    }
    if (typeof row.family !== 'string' || !IDENTIFIER.test(row.family)) {
      throw new TypeError('Godagent profile catalog family is invalid');
    }
    return { id: row.id, family: row.family };
  }).sort((left, right) => byteCompare(left.id, right.id));
  if (new Set(normalized.map(({ id }) => id)).size !== normalized.length) {
    throw new TypeError('Godagent profile catalog contains duplicate id entries');
  }
  return normalized;
}

export function evaluateGodagentProfile(input, catalogInput) {
  const policy = validateGodagentProfilePolicy(input);
  const catalog = normalizeCatalog(catalogInput);
  const families = new Set(catalog.map(({ family }) => family));
  for (const family of [...policy.preferredFamilies, ...policy.prohibitedFamilies]) {
    if (!families.has(family)) throw new TypeError(`unknown family: ${family}`);
  }
  const ids = new Set(catalog.map(({ id }) => id));
  for (const id of policy.prohibitedCapabilities) {
    if (!ids.has(id)) throw new TypeError(`unknown capability: ${id}`);
  }

  const prohibited = catalog
    .filter(({ id, family }) => policy.prohibitedFamilies.includes(family)
      || policy.prohibitedCapabilities.includes(id))
    .map(({ id }) => id)
    .sort(byteCompare);
  const prohibitedSet = new Set(prohibited);
  const eligibleIds = catalog
    .filter(({ id }) => !prohibitedSet.has(id))
    .map(({ id }) => id);
  const preferredFamilies = policy.profile === 'specialist'
    ? new Set(policy.preferredFamilies)
    : new Set();
  const preferredIds = catalog
    .filter(({ id, family }) => !prohibitedSet.has(id) && preferredFamilies.has(family))
    .map(({ id }) => id);
  const unsigned = {
    schemaVersion: 1,
    protocolId: GODAGENT_PROFILE_PROTOCOL_ID,
    policyDigest: sha256Value(policy),
    catalogDigest: sha256Value(catalog),
    policy: clone(policy),
    eligibleIds,
    prohibitedIds: prohibited,
    preferredIds,
    maxComposition: policy.maxComposition,
    semantics: {
      allRounderComplete: policy.profile === 'all-rounder' && prohibited.length === 0,
      allRounderPreferencesInert: true,
      explicitProhibitionsAuthoritative: true,
      nonProhibitedCapabilitiesPreserved: eligibleIds.length === catalog.length - prohibited.length,
      preferenceIsNonRestrictive: true,
    },
  };
  const result = deepFreeze({ ...unsigned, resultDigest: sha256Value(unsigned) });
  assertSchema('godagent-profile', result);
  return result;
}
