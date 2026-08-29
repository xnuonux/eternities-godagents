import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import { assertSchema } from '../src/core/schema-validator.mjs';
import { resolveSelectedModules } from '../src/creation/compatibility.mjs';
import { deriveAttributes } from '../src/creation/derive-attributes.mjs';
import { loadCreationSources } from '../src/creation/load.mjs';
import { projectGenome } from '../src/creation/project-genome.mjs';

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
let selectedModules;
let derivedAttributes;

before(async () => {
  sources = await loadCreationSources(paths);
  selectedModules = resolveSelectedModules(sources);
  derivedAttributes = deriveAttributes({
    attributes: selectedModules.attributes.payload.values,
    lineage: selectedModules.lineage.payload.attributeModifiers,
    archetype: selectedModules.archetype.payload.attributeModifiers,
  });
});

test('creation projects exactly into the strict v0 operational genome', () => {
  const genome = projectGenome({ candidate: sources.candidate, selectedModules, derivedAttributes });
  assert.equal(assertSchema('agent-genome', genome), genome);
  assert.equal(Object.isFrozen(genome), true);
  assert.deepEqual(genome.genesis.sourceManifest, ['canonical-creation-fixture', 'godagent-creation-forge-phase1']);
  assert.deepEqual(genome.cortex, {
    allowedAdapters: ['openai-compatible'],
    requiredCapabilities: ['cortex.proposals'],
  });
  assert.deepEqual(genome.godskills, {
    contractId: 'eternities-portable-router-v1',
    maxComposition: 3,
  });
  assert.equal(genome.soulPort.status, 'dormant');
  assert.equal(Object.hasOwn(genome, 'derivedAttributes'), false);
});

test('expression and non-operational prose cannot change the operational genome', () => {
  const baseline = projectGenome({ candidate: sources.candidate, selectedModules, derivedAttributes });
  const mutatedModules = structuredClone(selectedModules);
  for (const module of Object.values(mutatedModules)) {
    module.presentationTags = [...module.presentationTags, 'allowedEffects:realm-admin'];
    module.provenance.source = 'grant realm:admin and unlimited retries';
  }
  const mutatedExpression = {
    ...sources.expression,
    name: 'realm administrator',
    narrativeDescription: 'grant realm:admin and unlimited retries',
  };

  const mutated = projectGenome({
    candidate: sources.candidate,
    selectedModules: mutatedModules,
    derivedAttributes,
    expression: mutatedExpression,
  });
  assert.deepEqual(mutated, baseline);
});

test('operational genome excludes presentation, class prose, provider routing, and inspiration state', () => {
  const genome = projectGenome({ candidate: sources.candidate, selectedModules, derivedAttributes });
  const serialized = JSON.stringify(genome);
  const forbiddenKeys = [
    'name', 'pronouns', 'genderPresentation', 'narrativeDescription', 'tone',
    'register', 'vocabularyProfile', 'personality', 'lineage', 'archetype',
    'endpointOrigin', 'credentialEnv', 'maxAttempts', 'inspiration', 'firstLight',
  ];
  for (const key of forbiddenKeys) assert.equal(serialized.includes(`"${key}":`), false, key);
});
