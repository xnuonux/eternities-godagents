import { sha256Value } from '../core/digest.mjs';
import {
  MODULE_KINDS,
  byteCompare,
  deepFreeze,
  moduleRef,
  validateModuleContract,
} from './contracts.mjs';
import { deriveAttributes } from './derive-attributes.mjs';

function assertSubset(values, allowedValues, label) {
  const allowed = new Set(allowedValues);
  for (const value of values) {
    if (!allowed.has(value)) throw new TypeError(`${label} exceeds creation policy`);
  }
}

function assertContains(values, requiredValues, label) {
  const available = new Set(values);
  for (const value of requiredValues) {
    if (!available.has(value)) throw new TypeError(label);
  }
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
    throw new TypeError('module-ref integrity failed');
  }
  for (const kind of MODULE_KINDS) {
    const module = selectedModules[kind];
    if (module.moduleKind !== kind || moduleRef(module) !== candidate.moduleRefs[kind]) {
      throw new TypeError(`module-ref integrity failed for ${kind}`);
    }
    if (module.baseModuleRefs.length !== 0) {
      throw new TypeError('base module inheritance is not supported in Phase 1');
    }
  }

  const providedCompatibilityTags = Object.values(selectedModules)
    .flatMap((module) => module.compatibility.providesTags);
  for (const module of Object.values(selectedModules)) {
    assertContains(
      providedCompatibilityTags,
      module.compatibility.requiresTags,
      'compatibility tag is unavailable',
    );
  }

  assertSubset(candidate.constitution.allowedEffects, policy.allowedEffects, 'effect');
  assertSubset(candidate.promptOs.allowedAdapters, policy.allowedPromptAdapters, 'Prompt OS adapter');
  for (const module of Object.values(selectedModules)) {
    assertSubset(module.capabilities, policy.allowedCapabilities, 'module capability');
  }

  const cortex = selectedModules.cortex.payload;
  assertSubset(cortex.allowedAdapters, policy.allowedCortexAdapters, 'cortex adapter');
  assertSubset(cortex.requiredCapabilities, policy.allowedCapabilities, 'cortex capability');

  const godskills = selectedModules.godskills.payload;
  assertSubset([godskills.contractId], policy.allowedGodskillsContracts, 'Godskills contract');
  assertSubset(godskills.entrypointIds, policy.allowedGodskillEntrypoints, 'Godskill entrypoint');
  assertSubset(candidate.realm.requiredCapabilities, policy.allowedRealmCapabilities, 'Realm capability');
  assertSubset(selectedModules.embodiment.payload.requiredRealmCapabilities, policy.allowedRealmCapabilities, 'Realm capability');
  if (godskills.maxComposition > policy.maxGodskillsComposition) {
    throw new TypeError('Godskills composition exceeds creation policy');
  }

  const compatibleArchetypeTags = selectedModules.lineage.payload.compatibleArchetypeTags;
  assertContains(compatibleArchetypeTags, selectedModules.archetype.payload.tags, 'archetype tag is incompatible with lineage');

  const organIds = selectedModules.organs.payload.organs.map((organ) => organ.id);
  assertContains(organIds, selectedModules.lineage.payload.defaultOrganIds, 'organ loadout omits a lineage default');
  assertContains(organIds, selectedModules.archetype.payload.organIds, 'organ loadout omits an archetype organ');

  assertContains(godskills.entrypointIds, selectedModules.lineage.payload.defaultGodskillEntrypoints, 'Godskill entrypoint omits a lineage default');
  assertContains(godskills.entrypointIds, selectedModules.archetype.payload.godskillEntrypoints, 'Godskill entrypoint omits an archetype requirement');

  const availableCapabilities = [
    ...candidate.promptOs.requiredCapabilities,
    ...Object.values(selectedModules).flatMap((module) => module.capabilities),
  ];
  assertContains(availableCapabilities, selectedModules.archetype.payload.requiredCapabilityFamilies, 'capability family is unavailable');
  assertContains(candidate.realm.requiredCapabilities, selectedModules.embodiment.payload.requiredRealmCapabilities, 'Realm capability required by embodiment is unavailable');

  deriveAttributes({
    attributes: selectedModules.attributes.payload.values,
    lineage: selectedModules.lineage.payload.attributeModifiers,
    archetype: selectedModules.archetype.payload.attributeModifiers,
  });

  if (candidate.evolution.policy !== 'frozen-v0') throw new TypeError('evolution must remain frozen');
  if (candidate.soulPort.status !== 'dormant') throw new TypeError('Soul port must remain dormant');

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
