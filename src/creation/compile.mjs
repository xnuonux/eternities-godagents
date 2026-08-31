import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertCreationCompatibility, resolveSelectedModules } from './compatibility.mjs';
import { byteCompare, deepFreeze, moduleRef } from './contracts.mjs';
import { deriveAttributes } from './derive-attributes.mjs';
import { loadCreationSources } from './load.mjs';
import { projectGenome } from './project-genome.mjs';

const OUTPUT_FILES = Object.freeze([
  'agent-genome.json',
  'creation-build-manifest.json',
  'creation-candidate.json',
  'creation-policy.json',
  'expression-overlay.json',
  'module-manifest.json',
]);

const ARTIFACT_TRUST = Object.freeze({
  'agent-genome.json': 'operational-projection',
  'creation-candidate.json': 'creation-input',
  'creation-policy.json': 'trusted-ceiling',
  'expression-overlay.json': 'presentation-only',
  'module-manifest.json': 'creation-input',
});

const SCHEMAS_BY_ARTIFACT = Object.freeze({
  'agent-genome.json': 'agent-genome',
  'creation-candidate.json': 'creation-candidate',
  'creation-policy.json': 'creation-policy',
  'expression-overlay.json': 'expression-overlay',
  'module-manifest.json': 'module-manifest',
});

const OMITTED_COMPONENTS = Object.freeze(['genesis-receipt', 'keel', 'soul-runtime', 'vessel']);
const jsonBytes = (value) => `${canonicalJson(value)}\n`;
const childPath = (directory, name) => (directory instanceof URL ? new URL(name, directory) : join(directory, name));

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function creationBuildIdProjection(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    artifactId: manifest.artifactId,
    candidateDigest: manifest.candidateDigest,
    policyDigest: manifest.policyDigest,
    expressionDigest: manifest.expressionDigest,
    moduleManifestDigest: manifest.moduleManifestDigest,
    genomeDigest: manifest.genomeDigest,
    derivedAttributes: manifest.derivedAttributes,
    validations: manifest.validations,
    omittedComponents: manifest.omittedComponents,
  };
}

async function assertOutputDirectorySafe(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const existing = (await readdir(outputDir)).sort(byteCompare);
  for (const name of existing) {
    if (!OUTPUT_FILES.includes(name)) throw new IntegrityError(`creation output contains unexpected entry ${name}`);
  }
}

function buildModuleManifest({ candidate, policyDigest, expression, selectedModules, validations }) {
  const modules = Object.values(selectedModules)
    .sort((left, right) => byteCompare(moduleRef(left), moduleRef(right)))
    .map((module) => ({
      ref: moduleRef(module),
      kind: module.moduleKind,
      sha256: sha256Value(module),
    }));
  const manifest = {
    schemaVersion: 1,
    candidateDigest: sha256Value(candidate),
    policyDigest,
    expressionDigest: sha256Value(expression),
    selection: Object.fromEntries(Object.entries(candidate.moduleRefs).sort(([left], [right]) => byteCompare(left, right))),
    modules,
    validations,
  };
  assertSchema('module-manifest', manifest);
  return deepFreeze(manifest);
}

function artifactRows(values) {
  return Object.entries(values)
    .sort(([left], [right]) => byteCompare(left, right))
    .map(([path, value]) => ({
      path,
      sha256: sha256Text(jsonBytes(value)),
      trustClass: ARTIFACT_TRUST[path],
    }));
}

export async function compileCreation({
  candidatePath,
  policyPath,
  expectedPolicyDigest,
  expressionPath,
  moduleDirectory,
  outputDir,
}) {
  const sources = await loadCreationSources({
    candidatePath,
    policyPath,
    expectedPolicyDigest,
    expressionPath,
    moduleDirectory,
  });
  const selectedModules = resolveSelectedModules(sources);
  const validations = assertCreationCompatibility({
    candidate: sources.candidate,
    policy: sources.policy,
    selectedModules,
  });
  const derivedAttributes = deriveAttributes({
    attributes: selectedModules.attributes.payload.values,
    lineage: selectedModules.lineage.payload.attributeModifiers,
    archetype: selectedModules.archetype.payload.attributeModifiers,
  });
  const genome = projectGenome({ candidate: sources.candidate, selectedModules, derivedAttributes });
  const moduleManifest = buildModuleManifest({
    candidate: sources.candidate,
    policyDigest: sources.policyDigest,
    expression: sources.expression,
    selectedModules,
    validations,
  });

  const values = {
    'agent-genome.json': genome,
    'creation-candidate.json': sources.candidate,
    'creation-policy.json': sources.policy,
    'expression-overlay.json': sources.expression,
    'module-manifest.json': moduleManifest,
  };
  const unsigned = {
    schemaVersion: 1,
    artifactId: `${sources.candidate.blueprint.id}@${sources.candidate.blueprint.version}`,
    candidateDigest: sha256Value(sources.candidate),
    policyDigest: sources.policyDigest,
    expressionDigest: sha256Value(sources.expression),
    moduleManifestDigest: sha256Value(moduleManifest),
    genomeDigest: sha256Value(genome),
    derivedAttributes,
    validations,
    omittedComponents: [...OMITTED_COMPONENTS],
  };
  const manifest = deepFreeze({
    ...unsigned,
    buildId: sha256Value(unsigned),
    artifacts: artifactRows(values),
  });
  assertSchema('creation-build-manifest', manifest);

  await assertOutputDirectorySafe(outputDir);
  for (const [name, value] of Object.entries(values)) {
    await writeFile(childPath(outputDir, name), jsonBytes(value), 'utf8');
  }
  await writeFile(childPath(outputDir, 'creation-build-manifest.json'), jsonBytes(manifest), 'utf8');
  const verified = await verifyCreationBuild(outputDir, { expectedPolicyDigest });
  return Object.freeze({ manifest: verified, moduleManifest, genome, outputDir });
}

function assertModuleManifestIntegrity(moduleManifest, candidate, manifest) {
  if (moduleManifest.candidateDigest !== manifest.candidateDigest
      || moduleManifest.policyDigest !== manifest.policyDigest
      || moduleManifest.expressionDigest !== manifest.expressionDigest) {
    throw new IntegrityError('module manifest source digest mismatch');
  }
  if (canonicalJson(moduleManifest.selection) !== canonicalJson(candidate.moduleRefs)) {
    throw new IntegrityError('module manifest selection mismatch');
  }
  const seenKinds = new Set();
  for (const row of moduleManifest.modules) {
    if (seenKinds.has(row.kind)) throw new IntegrityError('module manifest repeats a kind');
    seenKinds.add(row.kind);
    if (moduleManifest.selection[row.kind] !== row.ref) throw new IntegrityError('module manifest ref mismatch');
  }
  if (seenKinds.size !== 9) throw new IntegrityError('module manifest is incomplete');
  if (canonicalJson(moduleManifest.validations) !== canonicalJson(manifest.validations)) {
    throw new IntegrityError('module manifest validation mismatch');
  }
}

export async function loadVerifiedCreationBuild(outputDir, { expectedPolicyDigest } = {}) {
  if (typeof expectedPolicyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedPolicyDigest)) {
    throw new TypeError('creation policy digest pin is required');
  }
  const names = (await readdir(outputDir)).sort(byteCompare);
  if (!sameArray(names, [...OUTPUT_FILES].sort(byteCompare))) {
    throw new IntegrityError('creation output artifact set mismatch');
  }

  const manifestPath = childPath(outputDir, 'creation-build-manifest.json');
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  if (manifestText !== jsonBytes(manifest)) throw new IntegrityError('creation build manifest is not canonical');
  assertSchema('creation-build-manifest', manifest);
  if (manifest.policyDigest !== expectedPolicyDigest) throw new IntegrityError('creation policy digest pin mismatch');

  const rowsByPath = new Map();
  for (const row of manifest.artifacts) {
    if (rowsByPath.has(row.path)) throw new IntegrityError('creation build manifest repeats an artifact');
    if (ARTIFACT_TRUST[row.path] !== row.trustClass) throw new IntegrityError('creation artifact trust class mismatch');
    rowsByPath.set(row.path, row);
  }
  const expectedArtifacts = Object.keys(ARTIFACT_TRUST).sort(byteCompare);
  if (!sameArray([...rowsByPath.keys()].sort(byteCompare), expectedArtifacts)) {
    throw new IntegrityError('creation build manifest artifact set mismatch');
  }

  const values = {};
  for (const name of expectedArtifacts) {
    const text = await readFile(childPath(outputDir, name), 'utf8');
    if (sha256Text(text) !== rowsByPath.get(name).sha256) {
      throw new IntegrityError(`artifact digest mismatch for ${name}`);
    }
    const value = JSON.parse(text);
    if (text !== jsonBytes(value)) throw new IntegrityError(`artifact is not canonical: ${name}`);
    assertSchema(SCHEMAS_BY_ARTIFACT[name], value);
    values[name] = value;
  }

  const candidate = values['creation-candidate.json'];
  const policy = values['creation-policy.json'];
  const expression = values['expression-overlay.json'];
  const moduleManifest = values['module-manifest.json'];
  const genome = values['agent-genome.json'];
  const digestChecks = [
    [manifest.candidateDigest, sha256Value(candidate), 'candidate'],
    [manifest.policyDigest, sha256Value(policy), 'policy'],
    [manifest.expressionDigest, sha256Value(expression), 'expression'],
    [manifest.moduleManifestDigest, sha256Value(moduleManifest), 'module manifest'],
    [manifest.genomeDigest, sha256Value(genome), 'genome'],
  ];
  for (const [actual, expected, label] of digestChecks) {
    if (actual !== expected) throw new IntegrityError(`${label} value digest mismatch`);
  }
  if (manifest.artifactId !== `${candidate.blueprint.id}@${candidate.blueprint.version}`) {
    throw new IntegrityError('creation artifact identity mismatch');
  }
  assertModuleManifestIntegrity(moduleManifest, candidate, manifest);
  if (manifest.buildId !== sha256Value(creationBuildIdProjection(manifest))) {
    throw new IntegrityError('creation build id mismatch');
  }
  return deepFreeze({
    manifest: structuredClone(manifest),
    candidate: structuredClone(candidate),
    policy: structuredClone(policy),
    expression: structuredClone(expression),
    moduleManifest: structuredClone(moduleManifest),
    genome: structuredClone(genome),
  });
}

export async function verifyCreationBuild(outputDir, options = {}) {
  return (await loadVerifiedCreationBuild(outputDir, options)).manifest;
}
