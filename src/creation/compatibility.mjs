import { sha256Value } from '../core/digest.mjs';
import {
  MODULE_KINDS,
  byteCompare,
  deepFreeze,
  moduleRef,
  validateModuleContract,
} from './contracts.mjs';
import { deriveAttributes } from './derive-attributes.mjs';
import { compatibilityFailure } from './compatibility-error.mjs';

function assertSubset(values, allowedValues, code) {
  const allowed = new Set(allowedValues);
  for (const value of values) if (!allowed.has(value)) compatibilityFailure(code);
}

function assertContains(values, requiredValues, code) {
  const available = new Set(values);
  for (const value of requiredValues) if (!available.has(value)) compatibilityFailure(code);
}

export function resolveSelectedModules({ candidate, modulesByRef }) {
  const selected = {};
  for (const kind of MODULE_KINDS) {
    const ref = candidate.moduleRefs[kind];
    const module = modulesByRef.get(ref);
    if (!module) throw new TypeError(`selected module not found for ${kind}`);
    if (module.moduleKind !== kind) throw new TypeError(`module kind mismatch for ${kind}`);
    selected[kind] = module;
  }
  return deepFreeze(selected);
}

export function assertCreationCompatibility({ candidate, policy, selectedModules }) {
  const moduleKeys = Object.keys(selectedModules).sort(byteCompare);
  const expectedKeys = [...MODULE_KINDS].sort(byteCompare);
  if (moduleKeys.length !== expectedKeys.length || moduleKeys.some((key, index) => key !== expectedKeys[index])) {
    compatibilityFailure('module-ref-integrity-failed');
  }
  for (const kind of MODULE_KINDS) {
    const module = selectedModules[kind];
    if (module.moduleKind !== kind || moduleRef(module) !== candidate.moduleRefs[kind]) {
      compatibilityFailure('module-ref-integrity-failed');
    }
    if (module.baseModuleRefs.length !== 0) {
      compatibilityFailure('module-inheritance-unsupported');
    }
  }

  const providedCompatibilityTags = Object.values(selectedModules)
    .flatMap((module) => module.compatibility.providesTags);
  for (const module of Object.values(selectedModules)) {
    assertContains(
      providedCompatibilityTags,
      module.compatibility.requiresTags,
      'compatibility-tag-unavailable',
    );
  }

  assertSubset(candidate.constitution.allowedEffects, policy.allowedEffects, 'authority-effect-exceeds-policy');
  assertSubset(candidate.promptOs.allowedAdapters, policy.allowedPromptAdapters, 'prompt-adapter-exceeds-policy');
  for (const module of Object.values(selectedModules)) {
    assertSubset(module.capabilities, policy.allowedCapabilities, 'module-capability-exceeds-policy');
  }

  const cortex = selectedModules.cortex.payload;
  assertSubset(cortex.allowedAdapters, policy.allowedCortexAdapters, 'cortex-adapter-exceeds-policy');
  assertSubset(cortex.requiredCapabilities, policy.allowedCapabilities, 'cortex-capability-exceeds-policy');

  const godskills = selectedModules.godskills.payload;
  assertSubset([godskills.contractId], policy.allowedGodskillsContracts, 'godskills-contract-exceeds-policy');
  assertSubset(godskills.entrypointIds, policy.allowedGodskillEntrypoints, 'godskills-entrypoint-exceeds-policy');
  assertSubset(candidate.realm.requiredCapabilities, policy.allowedRealmCapabilities, 'realm-capability-exceeds-policy');
  assertSubset(selectedModules.embodiment.payload.requiredRealmCapabilities, policy.allowedRealmCapabilities, 'realm-capability-exceeds-policy');
  if (godskills.maxComposition > policy.maxGodskillsComposition) {
    compatibilityFailure('godskills-composition-exceeds-policy');
  }

  const compatibleArchetypeTags = selectedModules.lineage.payload.compatibleArchetypeTags;
  assertContains(compatibleArchetypeTags, selectedModules.archetype.payload.tags, 'lineage-archetype-incompatible');

  const organIds = selectedModules.organs.payload.organs.map((organ) => organ.id);
  assertContains(organIds, selectedModules.lineage.payload.defaultOrganIds, 'lineage-organ-missing');
  assertContains(organIds, selectedModules.archetype.payload.organIds, 'archetype-organ-missing');

  assertContains(godskills.entrypointIds, selectedModules.lineage.payload.defaultGodskillEntrypoints, 'lineage-godskill-missing');
  assertContains(godskills.entrypointIds, selectedModules.archetype.payload.godskillEntrypoints, 'archetype-godskill-missing');

  const availableCapabilities = [
    ...candidate.promptOs.requiredCapabilities,
    ...Object.values(selectedModules).flatMap((module) => module.capabilities),
  ];
  assertContains(availableCapabilities, selectedModules.archetype.payload.requiredCapabilityFamilies, 'capability-family-unavailable');
  assertContains(candidate.realm.requiredCapabilities, selectedModules.embodiment.payload.requiredRealmCapabilities, 'embodiment-realm-unavailable');

  try {
    deriveAttributes({
      attributes: selectedModules.attributes.payload.values,
      lineage: selectedModules.lineage.payload.attributeModifiers,
      archetype: selectedModules.archetype.payload.attributeModifiers,
    });
  } catch {
    compatibilityFailure('attribute-bounds-invalid');
  }

  if (candidate.evolution.policy !== 'frozen-v0') compatibilityFailure('evolution-not-frozen');
  if (candidate.soulPort.status !== 'dormant') compatibilityFailure('soul-port-not-dormant');

  for (const module of Object.values(selectedModules)) validateModuleContract(module, policy);
  const policyDigest = sha256Value(policy);
  if (!/^[a-f0-9]{64}$/.test(policyDigest)) throw new TypeError('creation policy digest is invalid');

  const rowIds = [
    'module-ref-integrity',
    'lineage-archetype-tags',
    'organ-loadout',
    'godskills-contract',
    'godskills-composition',
    'capability-families',
    'embodiment-realm',
    'attribute-bounds',
    'evolution-frozen',
    'soul-port-dormant',
    'authority-firewall',
    'creation-policy-digest',
  ].sort(byteCompare);
  return deepFreeze(rowIds.map((id) => ({ id, status: 'pass' })));
}
