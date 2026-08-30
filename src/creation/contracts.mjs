import { assertSchema } from '../core/schema-validator.mjs';

export const MODULE_KINDS = Object.freeze([
  'lineage', 'archetype', 'attributes', 'personality', 'voice',
  'organs', 'godskills', 'cortex', 'embodiment',
]);

export const PAYLOAD_KEYS = Object.freeze({
  lineage: Object.freeze(['attributeModifiers', 'compatibleArchetypeTags', 'defaultOrganIds', 'defaultGodskillEntrypoints']),
  archetype: Object.freeze(['tags', 'attributeModifiers', 'organIds', 'godskillEntrypoints', 'requiredCapabilityFamilies']),
  attributes: Object.freeze(['values']),
  personality: Object.freeze(['dimensions']),
  voice: Object.freeze(['tone', 'register', 'vocabularyProfile', 'pacing']),
  organs: Object.freeze(['organs']),
  godskills: Object.freeze(['protocolId', 'profile', 'preferredFamilies', 'prohibitedFamilies', 'prohibitedCapabilities', 'maxComposition', 'entrypointIds']),
  cortex: Object.freeze(['allowedAdapters', 'requiredCapabilities']),
  embodiment: Object.freeze(['tags', 'requiredRealmCapabilities', 'presentationSurfaces']),
});

export const FORBIDDEN_MODULE_KEYS = Object.freeze(new Set([
  'allowedEffects', 'authority', 'authorityBasis', 'credential', 'credentials',
  'credentialEnv', 'apiKey', 'token', 'password', 'endpointOrigin', 'selectedModel',
  'maxAttempts', 'maxCompletionTokens', 'maxCycleCompletionTokens', 'model',
  'provider', 'host', 'target', 'soulPort', 'soulState', 'inspiration',
  'firstLight', 'endingAuthority',
]));

export const PERSONALITY_DIMENSIONS = Object.freeze([
  'cautiousDaring', 'literalPoetic', 'orderlyImprovisational',
  'patientUrgent', 'reservedExpressive', 'skepticalTrusting',
]);

export const ATTRIBUTE_NAMES = Object.freeze([
  'adaptability', 'autonomy', 'caution', 'creativity', 'initiative',
  'learningVelocity', 'memoryDiscipline', 'perception', 'planning',
  'precision', 'reasoning', 'resilience', 'socialIntelligence',
]);

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MODULE_REFERENCE = /^(lineage|archetype|attributes|personality|voice|organs|godskills|cortex|embodiment):([a-z0-9][a-z0-9._-]{0,127})@([a-z0-9][a-z0-9._-]{0,127})$/;
const FORBIDDEN_CAPABILITY_PART = /(credential|authority|admin|provider|endpoint|secret|token)/i;
const ORGAN_KINDS = new Set(['perception', 'goal', 'planning', 'reconciliation', 'memory', 'social']);
const ORGAN_CADENCES = new Set(['cycle', 'event', 'recovery']);

export const byteCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function pointerPart(part) {
  return String(part).replaceAll('~', '~0').replaceAll('/', '~1');
}

function assertBoundedStructure(value, pointer = '', depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (depth > 32) throw new TypeError(`module structure exceeds maximum depth at ${pointer || '/'}`);
  if (seen.has(value)) throw new TypeError(`module structure repeats an object at ${pointer || '/'}`);
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${pointerPart(key)}`;
    if (FORBIDDEN_MODULE_KEYS.has(key)) {
      throw new TypeError(`forbidden module key ${key} at ${childPointer}`);
    }
    assertBoundedStructure(child, childPointer, depth + 1, seen);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new TypeError(`invalid ${label}`);
  }
  return value;
}

function assertInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`invalid ${label}`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) throw new TypeError(`${label} key ${key} is not allowed`);
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label} key ${key} is required`);
  }
}

function sortedIdentifiers(value, label, { capability = false } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const entries = value.map((entry) => assertIdentifier(entry, `${label} entry`));
  if (new Set(entries).size !== entries.length) throw new TypeError(`${label} must be unique`);
  if (capability) {
    for (const entry of entries) {
      if (FORBIDDEN_CAPABILITY_PART.test(entry)) throw new TypeError('forbidden capability token');
    }
  }
  return entries.sort(byteCompare);
}

function sortedModuleRefs(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const entries = value.map((entry) => {
    parseModuleRef(entry);
    return entry;
  });
  if (new Set(entries).size !== entries.length) throw new TypeError(`${label} must be unique`);
  return entries.sort(byteCompare);
}

function numericMap(value, keys, minimum, maximum, label, { requireAll = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const allowed = new Set(keys);
  const output = {};
  for (const key of Object.keys(value).sort(byteCompare)) {
    if (!allowed.has(key)) throw new TypeError(`${label} key ${key} is not allowed`);
    output[key] = assertInteger(value[key], minimum, maximum, `${label}.${key}`);
  }
  if (requireAll) {
    for (const key of keys) if (!Object.hasOwn(output, key)) throw new TypeError(`${label} key ${key} is required`);
  }
  return output;
}

function validatePayload(kind, payload) {
  assertExactKeys(payload, PAYLOAD_KEYS[kind], `${kind} payload`);

  if (kind === 'lineage') return {
    attributeModifiers: numericMap(payload.attributeModifiers, ATTRIBUTE_NAMES, -25, 25, 'lineage attributeModifiers'),
    compatibleArchetypeTags: sortedIdentifiers(payload.compatibleArchetypeTags, 'lineage compatibleArchetypeTags'),
    defaultOrganIds: sortedIdentifiers(payload.defaultOrganIds, 'lineage defaultOrganIds'),
    defaultGodskillEntrypoints: sortedIdentifiers(payload.defaultGodskillEntrypoints, 'lineage defaultGodskillEntrypoints'),
  };
  if (kind === 'archetype') return {
    tags: sortedIdentifiers(payload.tags, 'archetype tags'),
    attributeModifiers: numericMap(payload.attributeModifiers, ATTRIBUTE_NAMES, -25, 25, 'archetype attributeModifiers'),
    organIds: sortedIdentifiers(payload.organIds, 'archetype organIds'),
    godskillEntrypoints: sortedIdentifiers(payload.godskillEntrypoints, 'archetype godskillEntrypoints'),
    requiredCapabilityFamilies: sortedIdentifiers(payload.requiredCapabilityFamilies, 'archetype requiredCapabilityFamilies', { capability: true }),
  };
  if (kind === 'attributes') return {
    values: numericMap(payload.values, ATTRIBUTE_NAMES, 0, 100, 'attribute values', { requireAll: true }),
  };
  if (kind === 'personality') return {
    dimensions: numericMap(payload.dimensions, PERSONALITY_DIMENSIONS, 0, 100, 'personality dimensions', { requireAll: true }),
  };
  if (kind === 'voice') return {
    tone: assertIdentifier(payload.tone, 'voice tone'),
    register: assertIdentifier(payload.register, 'voice register'),
    vocabularyProfile: assertIdentifier(payload.vocabularyProfile, 'voice vocabularyProfile'),
    pacing: assertIdentifier(payload.pacing, 'voice pacing'),
  };
  if (kind === 'organs') {
    if (!Array.isArray(payload.organs) || payload.organs.length === 0) throw new TypeError('organs must be a non-empty array');
    const organs = payload.organs.map((organ) => {
      assertExactKeys(organ, ['id', 'version', 'cadence', 'kind'], 'organ');
      if (!ORGAN_CADENCES.has(organ.cadence)) throw new TypeError('invalid organ cadence');
      if (!ORGAN_KINDS.has(organ.kind)) throw new TypeError('invalid organ kind');
      return {
        id: assertIdentifier(organ.id, 'organ id'),
        version: assertIdentifier(organ.version, 'organ version'),
        cadence: organ.cadence,
        kind: organ.kind,
      };
    }).sort((left, right) => byteCompare(left.id, right.id));
    if (new Set(organs.map((organ) => organ.id)).size !== organs.length) throw new TypeError('organ ids must be unique');
    return { organs };
  }
  if (kind === 'godskills') return {
    protocolId: payload.protocolId === 'eternities-godskills-adapter-v1' ? payload.protocolId : (() => { throw new TypeError('unsupported godskills protocolId'); })(),
    profile: ['all-rounder', 'specialist'].includes(payload.profile) ? payload.profile : (() => { throw new TypeError('invalid godskills profile'); })(),
    preferredFamilies: sortedIdentifiers(payload.preferredFamilies, 'godskills preferredFamilies'),
    prohibitedFamilies: sortedIdentifiers(payload.prohibitedFamilies, 'godskills prohibitedFamilies'),
    prohibitedCapabilities: sortedIdentifiers(payload.prohibitedCapabilities, 'godskills prohibitedCapabilities', { capability: true }),
    maxComposition: assertInteger(payload.maxComposition, 1, 3, 'godskills maxComposition'),
    entrypointIds: sortedIdentifiers(payload.entrypointIds, 'godskills entrypointIds'),
  };
  if (kind === 'cortex') return {
    allowedAdapters: sortedIdentifiers(payload.allowedAdapters, 'cortex allowedAdapters'),
    requiredCapabilities: sortedIdentifiers(payload.requiredCapabilities, 'cortex requiredCapabilities', { capability: true }),
  };
  return {
    tags: sortedIdentifiers(payload.tags, 'embodiment tags'),
    requiredRealmCapabilities: sortedIdentifiers(payload.requiredRealmCapabilities, 'embodiment requiredRealmCapabilities', { capability: true }),
    presentationSurfaces: sortedIdentifiers(payload.presentationSurfaces, 'embodiment presentationSurfaces'),
  };
}

export function moduleRef(module) {
  const kind = module.moduleKind ?? module.kind;
  if (!MODULE_KINDS.includes(kind)) throw new TypeError('invalid module kind');
  const id = assertIdentifier(module.id, 'module id');
  const version = assertIdentifier(module.version, 'module version');
  return `${kind}:${id}@${version}`;
}

export function parseModuleRef(reference) {
  const match = typeof reference === 'string' ? MODULE_REFERENCE.exec(reference) : null;
  if (!match) throw new TypeError('invalid module reference');
  const parsed = Object.freeze({ kind: match[1], id: match[2], version: match[3] });
  if (moduleRef(parsed) !== reference) throw new TypeError('module reference does not round-trip');
  return parsed;
}

export function expressionRef(expression) {
  return `expression:${assertIdentifier(expression.id, 'expression id')}@${assertIdentifier(expression.version, 'expression version')}`;
}

export function validateModuleContract(module, creationPolicy) {
  assertSchema('creation-module', module);
  assertBoundedStructure(module);
  const ref = moduleRef(module);
  const capabilities = sortedIdentifiers(module.capabilities, 'module capabilities', { capability: true });
  if (creationPolicy) {
    const allowed = new Set(creationPolicy.allowedCapabilities);
    for (const capability of capabilities) {
      if (!allowed.has(capability)) throw new TypeError(`module capability ${capability} exceeds creation policy`);
    }
  }

  const validated = {
    schemaVersion: 1,
    moduleKind: module.moduleKind,
    id: module.id,
    version: module.version,
    provenance: {
      author: assertIdentifier(module.provenance.author, 'module provenance author'),
      source: module.provenance.source,
    },
    baseModuleRefs: sortedModuleRefs(module.baseModuleRefs, 'baseModuleRefs'),
    compatibility: {
      requiresTags: sortedIdentifiers(module.compatibility.requiresTags, 'compatibility requiresTags'),
      providesTags: sortedIdentifiers(module.compatibility.providesTags, 'compatibility providesTags'),
    },
    capabilities,
    presentationTags: sortedIdentifiers(module.presentationTags, 'presentationTags'),
    payload: validatePayload(module.moduleKind, module.payload),
  };
  if (moduleRef(validated) !== ref) throw new TypeError('module identity changed during validation');
  return deepFreeze(validated);
}
