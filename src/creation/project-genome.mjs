import { canonicalJson } from '../core/canonical-json.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { byteCompare, deepFreeze } from './contracts.mjs';
import { deriveAttributes } from './derive-attributes.mjs';

export function projectGenome({ candidate, selectedModules, derivedAttributes }) {
  const expectedAttributes = deriveAttributes({
    attributes: selectedModules.attributes.payload.values,
    lineage: selectedModules.lineage.payload.attributeModifiers,
    archetype: selectedModules.archetype.payload.attributeModifiers,
  });
  if (canonicalJson(derivedAttributes) !== canonicalJson(expectedAttributes)) {
    throw new TypeError('derived attributes do not match selected modules');
  }

  const genome = {
    schemaVersion: 1,
    blueprint: structuredClone(candidate.blueprint),
    genesis: {
      createdBy: candidate.genesis.createdBy,
      sourceManifest: [...new Set([
        ...candidate.genesis.sourceManifest,
        'godagent-creation-forge-phase1',
      ])].sort(byteCompare),
    },
    telos: structuredClone(candidate.telos),
    constitution: structuredClone(candidate.constitution),
    promptOs: {
      edition: candidate.promptOs.edition,
      allowedAdapters: [...candidate.promptOs.allowedAdapters].sort(byteCompare),
      requiredCapabilities: [...candidate.promptOs.requiredCapabilities].sort(byteCompare),
    },
    cortex: {
      allowedAdapters: [...selectedModules.cortex.payload.allowedAdapters].sort(byteCompare),
      requiredCapabilities: [...selectedModules.cortex.payload.requiredCapabilities].sort(byteCompare),
    },
    organs: structuredClone(selectedModules.organs.payload.organs)
      .sort((left, right) => byteCompare(left.id, right.id)),
    memory: structuredClone(candidate.memory),
    godskills: {
      protocolId: selectedModules.godskills.payload.protocolId,
      profile: selectedModules.godskills.payload.profile,
      preferredFamilies: [...selectedModules.godskills.payload.preferredFamilies].sort(byteCompare),
      prohibitedFamilies: [...selectedModules.godskills.payload.prohibitedFamilies].sort(byteCompare),
      prohibitedCapabilities: [...selectedModules.godskills.payload.prohibitedCapabilities].sort(byteCompare),
      maxComposition: selectedModules.godskills.payload.maxComposition,
    },
    realm: {
      requiredCapabilities: [...new Set([
        ...candidate.realm.requiredCapabilities,
        ...selectedModules.embodiment.payload.requiredRealmCapabilities,
      ])].sort(byteCompare),
    },
    evolution: { policy: 'frozen-v0' },
    soulPort: { schemaVersion: 1, status: 'dormant' },
  };
  assertSchema('agent-genome', genome);
  return deepFreeze(genome);
}
