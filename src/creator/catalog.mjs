import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  byteCompare,
  deepFreeze,
  expressionRef,
  moduleRef,
  validateModuleContract,
} from '../creation/contracts.mjs';
import { loadCreationPolicy } from '../creation/policy.mjs';
import { validateCreatorChoice } from './contracts.mjs';

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const childPath = (directory, name) => (directory instanceof URL ? new URL(name, directory) : join(directory, name));

function frozenClone(value) {
  return deepFreeze(structuredClone(value));
}

async function directJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      throw new TypeError('unexpected creator library entry');
    }
  }
  return entries.map((entry) => entry.name).sort(byteCompare);
}

async function readJson(directory, name) {
  return JSON.parse(await readFile(childPath(directory, name), 'utf8'));
}

function presetRef(preset) {
  if (!IDENTIFIER.test(preset.id) || !IDENTIFIER.test(preset.version)) {
    throw new TypeError('creator preset identity is invalid');
  }
  return `preset:${preset.id}@${preset.version}`;
}

function validatePreset(input) {
  assertSchema('creator-preset', input);
  const choices = input.choices.map((choice) => validateCreatorChoice(choice));
  const preset = {
    schemaVersion: 1,
    id: input.id,
    version: input.version,
    choices,
  };
  presetRef(preset);
  return frozenClone(preset);
}

function moduleRow(module) {
  return {
    ref: moduleRef(module),
    kind: module.moduleKind,
    sourceDigest: sha256Value(module),
    provenance: module.provenance,
    requiresTags: module.compatibility.requiresTags,
    providesTags: module.compatibility.providesTags,
    capabilities: module.capabilities,
    presentationTags: module.presentationTags,
    summary: module.payload,
  };
}

function expressionRow(expression) {
  return {
    ref: expressionRef(expression),
    sourceDigest: sha256Value(expression),
    name: expression.name,
    pronouns: expression.pronouns,
    genderPresentation: expression.genderPresentation,
    voiceDisplayName: expression.voiceDisplayName,
    narrativeDescription: expression.narrativeDescription,
    visual: expression.visual,
    presentationTags: expression.presentationTags,
    provenance: expression.provenance,
  };
}

function presetRow(preset) {
  return {
    ref: presetRef(preset),
    sourceDigest: sha256Value(preset),
    choicesDigest: sha256Value(preset.choices),
    choiceCount: preset.choices.length,
  };
}

function resolver(map) {
  return (ref) => {
    const value = map.get(ref);
    if (!value) throw new TypeError('creator source reference is unavailable');
    return frozenClone(value);
  };
}

export async function loadCreatorLibrary({
  policyPath,
  expectedPolicyDigest,
  moduleDirectory,
  expressionDirectory,
  presetDirectory,
}) {
  const [{ policy, policyDigest }, moduleFiles, expressionFiles, presetFiles] = await Promise.all([
    loadCreationPolicy(policyPath, expectedPolicyDigest),
    directJsonFiles(moduleDirectory),
    directJsonFiles(expressionDirectory),
    presetDirectory === undefined ? [] : directJsonFiles(presetDirectory),
  ]);

  const moduleSources = new Map();
  for (const file of moduleFiles) {
    const module = validateModuleContract(await readJson(moduleDirectory, file), policy);
    const ref = moduleRef(module);
    if (moduleSources.has(ref)) throw new TypeError('duplicate creator module reference');
    moduleSources.set(ref, module);
  }

  const expressionSources = new Map();
  for (const file of expressionFiles) {
    const expression = frozenClone(assertSchema('expression-overlay', await readJson(expressionDirectory, file)));
    const ref = expressionRef(expression);
    if (expressionSources.has(ref)) throw new TypeError('duplicate creator expression reference');
    expressionSources.set(ref, expression);
  }

  const presetSources = new Map();
  for (const file of presetFiles) {
    const preset = validatePreset(await readJson(presetDirectory, file));
    const ref = presetRef(preset);
    if (presetSources.has(ref)) throw new TypeError('duplicate creator preset reference');
    presetSources.set(ref, preset);
  }

  const unsigned = {
    schemaVersion: 1,
    policyDigest,
    modules: [...moduleSources.values()].map(moduleRow).sort((left, right) => byteCompare(left.ref, right.ref)),
    expressions: [...expressionSources.values()].map(expressionRow).sort((left, right) => byteCompare(left.ref, right.ref)),
    presets: [...presetSources.values()].map(presetRow).sort((left, right) => byteCompare(left.ref, right.ref)),
  };
  const catalog = frozenClone({ ...unsigned, catalogDigest: sha256Value(unsigned) });
  const sourceLoader = Object.freeze({
    catalogDigest: catalog.catalogDigest,
    resolvePolicy: () => frozenClone(policy),
    resolveModule: resolver(moduleSources),
    resolveExpression: resolver(expressionSources),
    resolvePreset: resolver(presetSources),
  });
  return Object.freeze({ catalog, sourceLoader });
}

export async function loadCreatorCatalog(options) {
  return (await loadCreatorLibrary(options)).catalog;
}
