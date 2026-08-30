import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import {
  assertCreationCompatibility,
  resolveSelectedModules,
} from '../src/creation/compatibility.mjs';
import { CreationCompatibilityError } from '../src/creation/compatibility-error.mjs';
import { deriveAttributes } from '../src/creation/derive-attributes.mjs';
import { loadCreationSources } from '../src/creation/load.mjs';

const root = new URL('../fixtures/creation/', import.meta.url);
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const paths = {
  candidatePath: new URL('creation-candidate.json', root),
  policyPath: new URL('creation-policy.json', root),
  expectedPolicyDigest,
  expressionPath: new URL('expression-overlay.json', root),
  moduleDirectory: new URL('modules/', root),
};

let sources;
let selected;

const clone = (value) => structuredClone(value);

before(async () => {
  sources = await loadCreationSources(paths);
  selected = resolveSelectedModules(sources);
});

test('attributes derive deterministically from the complete base and modifiers', () => {
  const derived = deriveAttributes({
    attributes: selected.attributes.payload.values,
    lineage: selected.lineage.payload.attributeModifiers,
    archetype: selected.archetype.payload.attributeModifiers,
  });

  assert.equal(derived.adaptability, 66);
  assert.equal(derived.planning, 77);
  assert.equal(derived.precision, 73);
  assert.equal(derived.reasoning, 80);
  assert.equal(derived.resilience, 66);
  assert.equal(Object.isFrozen(derived), true);
  assert.deepEqual(Object.keys(derived), [...Object.keys(derived)].sort());
});

test('attribute derivation refuses overflow and incomplete bases instead of clamping', () => {
  const attributes = clone(selected.attributes.payload.values);
  attributes.reasoning = 90;
  assert.throws(() => deriveAttributes({
    attributes,
    lineage: { reasoning: 20 },
    archetype: {},
  }), /derived attribute reasoning exceeds 100/);

  delete attributes.reasoning;
  assert.throws(() => deriveAttributes({ attributes, lineage: {}, archetype: {} }), /base attribute reasoning is required/);
});

test('canonical creation passes every closed compatibility gate', () => {
  const rows = assertCreationCompatibility({
    candidate: sources.candidate,
    policy: sources.policy,
    selectedModules: selected,
  });
  assert.equal(rows.length, 12);
  assert.equal(rows.every((row) => row.status === 'pass'), true);
  assert.deepEqual(rows.map((row) => row.id), [...rows.map((row) => row.id)].sort());
  assert.equal(Object.isFrozen(rows), true);
});

test('compatibility rejects broken class composition', () => {
  const inheritedVariant = clone(selected);
  inheritedVariant.lineage.baseModuleRefs = ['lineage:synthetic-explorer@0.9.0'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: inheritedVariant }), /base module inheritance/);

  const missingGenericTag = clone(selected);
  missingGenericTag.voice.compatibility.requiresTags = ['missing.compatibility-tag'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: missingGenericTag }), /compatibility tag/);

  const missingTag = clone(selected);
  missingTag.lineage.payload.compatibleArchetypeTags = ['other'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: missingTag }), /archetype tag/);

  const missingFamily = clone(selected);
  missingFamily.archetype.payload.requiredCapabilityFamilies = ['unavailable'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: missingFamily }), /capability family/);

  const missingOrgan = clone(selected);
  missingOrgan.lineage.payload.defaultOrganIds = ['missing-organ'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: missingOrgan }), /organ loadout/);

  const missingEntrypoint = clone(selected);
  missingEntrypoint.lineage.payload.defaultGodskillEntrypoints = ['review'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: missingEntrypoint }), /Godskill entrypoint/);

  const excessiveComposition = clone(selected);
  excessiveComposition.godskills.payload.maxComposition = 4;
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: excessiveComposition }), /composition/);

  const realmMismatch = clone(selected);
  realmMismatch.embodiment.payload.requiredRealmCapabilities = ['filesystem.read', 'network.fetch'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: realmMismatch }), /Realm capability/);
});

test('creation policy remains a ceiling across every authority-bearing surface', () => {
  const candidateEffect = clone(sources.candidate);
  candidateEffect.constitution.allowedEffects = ['realm.admin'];
  assert.throws(() => assertCreationCompatibility({ candidate: candidateEffect, policy: sources.policy, selectedModules: selected }), /effect exceeds creation policy/);

  const promptAdapter = clone(sources.candidate);
  promptAdapter.promptOs.allowedAdapters = ['untrusted-adapter'];
  assert.throws(() => assertCreationCompatibility({ candidate: promptAdapter, policy: sources.policy, selectedModules: selected }), /Prompt OS adapter exceeds creation policy/);

  const moduleCapability = clone(selected);
  moduleCapability.lineage.capabilities = ['network.fetch'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: moduleCapability }), /module capability exceeds creation policy/);

  const cortexAdapter = clone(selected);
  cortexAdapter.cortex.payload.allowedAdapters = ['untrusted-cortex'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: cortexAdapter }), /cortex adapter exceeds creation policy/);

  const cortexCapability = clone(selected);
  cortexCapability.cortex.payload.requiredCapabilities = ['network.fetch'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: cortexCapability }), /cortex capability exceeds creation policy/);

  const contract = clone(selected);
  contract.godskills.payload.protocolId = 'other-protocol';
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: contract }), /Godskills contract exceeds creation policy/);

  const noGodskillsContract = clone(sources.policy);
  noGodskillsContract.allowedGodskillsContracts = [];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: noGodskillsContract, selectedModules: selected }), /Godskills contract exceeds creation policy/);

  const entrypoint = clone(selected);
  entrypoint.godskills.payload.entrypointIds = ['brainstorm', 'plan', 'publish'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: entrypoint }), /Godskill entrypoint exceeds creation policy/);

  const realm = clone(sources.candidate);
  realm.realm.requiredCapabilities = ['network.fetch'];
  assert.throws(() => assertCreationCompatibility({ candidate: realm, policy: sources.policy, selectedModules: selected }), /Realm capability exceeds creation policy/);
});

test('compatibility failures expose closed safe issue codes', () => {
  const cases = [];

  const lineage = clone(selected);
  lineage.lineage.payload.compatibleArchetypeTags = ['other'];
  cases.push(['lineage-archetype-incompatible', lineage, sources.candidate]);

  const organs = clone(selected);
  organs.lineage.payload.defaultOrganIds = ['missing-organ'];
  cases.push(['lineage-organ-missing', organs, sources.candidate]);

  const skills = clone(selected);
  skills.archetype.payload.godskillEntrypoints = ['review'];
  cases.push(['archetype-godskill-missing', skills, sources.candidate]);

  const capabilities = clone(selected);
  capabilities.archetype.payload.requiredCapabilityFamilies = ['unavailable'];
  cases.push(['capability-family-unavailable', capabilities, sources.candidate]);

  const embodimentCandidate = clone(sources.candidate);
  embodimentCandidate.realm.requiredCapabilities = ['filesystem.read'];
  cases.push(['embodiment-realm-unavailable', selected, embodimentCandidate]);

  const authority = clone(sources.candidate);
  authority.constitution.allowedEffects = ['realm.admin'];
  cases.push(['authority-effect-exceeds-policy', selected, authority]);

  for (const [code, modules, candidate] of cases) {
    assert.throws(
      () => assertCreationCompatibility({ candidate, policy: sources.policy, selectedModules: modules }),
      (error) => error instanceof CreationCompatibilityError
        && error.code === code
        && !error.message.includes('missing-organ')
        && !error.message.includes('filesystem.write'),
    );
  }
});
