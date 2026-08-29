import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import {
  assertCreationCompatibility,
  resolveSelectedModules,
} from '../src/creation/compatibility.mjs';
import { deriveAttributes } from '../src/creation/derive-attributes.mjs';
import { loadCreationSources } from '../src/creation/load.mjs';

const root = new URL('../fixtures/creation/', import.meta.url);
const paths = {
  candidatePath: new URL('creation-candidate.json', root),
  policyPath: new URL('creation-policy.json', root),
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
  contract.godskills.payload.contractId = 'other-router';
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: contract }), /Godskills contract exceeds creation policy/);

  const entrypoint = clone(selected);
  entrypoint.godskills.payload.entrypointIds = ['brainstorm', 'plan', 'publish'];
  assert.throws(() => assertCreationCompatibility({ candidate: sources.candidate, policy: sources.policy, selectedModules: entrypoint }), /Godskill entrypoint exceeds creation policy/);

  const realm = clone(sources.candidate);
  realm.realm.requiredCapabilities = ['network.fetch'];
  assert.throws(() => assertCreationCompatibility({ candidate: realm, policy: sources.policy, selectedModules: selected }), /Realm capability exceeds creation policy/);
});
