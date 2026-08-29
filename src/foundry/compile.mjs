import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { inspectPromptArtifact } from './prompt-os-adapter.mjs';

function localPath(path) {
  return path instanceof URL ? fileURLToPath(path) : path;
}

async function readJson(path) {
  return JSON.parse(await readFile(localPath(path), 'utf8'));
}

const jsonBytes = (value) => `${canonicalJson(value)}\n`;
const expectedDistributionFiles = Object.freeze([
  'agent-genome.json',
  'distribution-manifest.json',
  'prompt-os-artifact.md',
  'realm-contract.json',
]);

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function distributionBuildProjection({ genome, realm, promptSha256 }) {
  const sources = [
    { role: 'genome', path: 'agent-genome.json', sha256: sha256Text(jsonBytes(genome)) },
    { role: 'prompt-os', path: 'prompt-os-artifact.md', sha256: promptSha256 },
    { role: 'realm', path: 'realm-contract.json', sha256: sha256Text(jsonBytes(realm)) },
  ].sort((left, right) => left.path.localeCompare(right.path));
  return {
    sources,
    buildId: sha256Value({
      schemaVersion: 1,
      artifactId: `${genome.blueprint.id}@${genome.blueprint.version}`,
      sources,
      cortexAdapters: [...genome.cortex.allowedAdapters].sort(),
      realmId: realm.realmId,
    }),
  };
}

export async function loadVerifiedDistribution(distributionDir) {
  const root = localPath(distributionDir);
  const names = (await readdir(root)).sort();
  if (!sameArray(names, [...expectedDistributionFiles].sort())) {
    throw new Error('distribution artifact set mismatch');
  }

  const manifestText = await readFile(`${root}/distribution-manifest.json`, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error('distribution manifest is not valid JSON');
  }
  if (manifestText !== jsonBytes(manifest)) throw new Error('distribution manifest is not canonical');
  assertSchema('distribution-manifest', manifest);

  const [genomeText, realmText, promptText] = await Promise.all([
    readFile(`${root}/agent-genome.json`, 'utf8'),
    readFile(`${root}/realm-contract.json`, 'utf8'),
    readFile(`${root}/prompt-os-artifact.md`, 'utf8'),
  ]);
  const genome = JSON.parse(genomeText);
  const realm = JSON.parse(realmText);
  if (genomeText !== jsonBytes(genome) || realmText !== jsonBytes(realm)) {
    throw new Error('distribution JSON artifact is not canonical');
  }
  assertSchema('agent-genome', genome);
  assertSchema('realm-contract', realm);

  const contents = {
    'agent-genome.json': genomeText,
    'prompt-os-artifact.md': promptText,
    'realm-contract.json': realmText,
  };
  const expectedArtifacts = Object.entries(contents)
    .map(([path, content]) => ({ path, sha256: sha256Text(content) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const actualArtifacts = [...manifest.artifacts].sort((left, right) => left.path.localeCompare(right.path));
  if (canonicalJson(actualArtifacts) !== canonicalJson(expectedArtifacts)) {
    const declared = new Map(manifest.artifacts.map((row) => [row.path, row.sha256]));
    const changed = expectedArtifacts.some((row) => declared.has(row.path) && declared.get(row.path) !== row.sha256);
    throw new Error(changed ? 'distribution artifact digest mismatch' : 'distribution artifact manifest mismatch');
  }

  const projection = distributionBuildProjection({ genome, realm, promptSha256: sha256Text(promptText) });
  if (canonicalJson(manifest.sources) !== canonicalJson(projection.sources)) {
    throw new Error('distribution source manifest mismatch');
  }
  if (manifest.buildId !== projection.buildId) throw new Error('distribution build id mismatch');
  if (manifest.artifactId !== `${genome.blueprint.id}@${genome.blueprint.version}`) {
    throw new Error('distribution artifact identity mismatch');
  }
  if (manifest.genomeDigest !== sha256Text(genomeText)) throw new Error('distribution genome digest mismatch');
  const expectedCompatibility = {
    cortexAdapters: [...genome.cortex.allowedAdapters].sort(),
    realmIds: [realm.realmId],
    schemaRange: '1',
  };
  if (canonicalJson(manifest.compatibility) !== canonicalJson(expectedCompatibility)) {
    throw new Error('distribution compatibility mismatch');
  }
  if (canonicalJson(manifest.resolvedComponents) !== canonicalJson(['genome', 'prompt-os', 'realm'])) {
    throw new Error('distribution resolved component mismatch');
  }
  if (canonicalJson(manifest.omittedComponents) !== canonicalJson(['soul-runtime'])) {
    throw new Error('distribution omitted component mismatch');
  }
  const expectedValidations = [
    { id: 'agent-genome-schema', status: 'pass' },
    { id: 'prompt-os-metadata', status: 'pass' },
    { id: 'realm-contract-schema', status: 'pass' },
    { id: 'realm-capabilities', status: 'pass' },
    { id: 'soul-port-dormant', status: 'pass' },
  ];
  if (canonicalJson(manifest.validations) !== canonicalJson(expectedValidations)) {
    throw new Error('distribution validation mismatch');
  }
  return deepFreeze({
    manifest: structuredClone(manifest),
    genome: structuredClone(genome),
    realmContract: structuredClone(realm),
    promptArtifact: promptText,
  });
}

export async function verifyDistribution(distributionDir) {
  return (await loadVerifiedDistribution(distributionDir)).manifest;
}

export async function compileDistribution({
  genomePath,
  promptArtifactPath,
  realmContractPath,
  outputDir,
}) {
  const [genome, realm, promptInspection] = await Promise.all([
    readJson(genomePath),
    readJson(realmContractPath),
    inspectPromptArtifact(promptArtifactPath),
  ]);
  assertSchema('agent-genome', genome);
  assertSchema('realm-contract', realm);

  const realmCapabilities = new Set(realm.capabilities);
  for (const capability of genome.realm.requiredCapabilities) {
    if (!realmCapabilities.has(capability)) {
      throw new Error(`required realm capability ${capability} is unavailable`);
    }
  }
  if (!genome.promptOs.allowedAdapters.includes(promptInspection.metadata.adapter)) {
    throw new Error(`Prompt OS adapter ${promptInspection.metadata.adapter} is not allowed by the genome`);
  }
  if (genome.promptOs.edition !== promptInspection.metadata.edition) {
    throw new Error(`Prompt OS edition ${promptInspection.metadata.edition} does not match the genome`);
  }

  const promptContent = await readFile(localPath(promptArtifactPath), 'utf8');
  const genomeContent = jsonBytes(genome);
  const realmContent = jsonBytes(realm);
  const { sources: sourceRows, buildId } = distributionBuildProjection({
    genome,
    realm,
    promptSha256: promptInspection.sha256,
  });

  const artifacts = sourceRows.map(({ path, sha256 }) => ({ path, sha256 }));
  const manifest = {
    schemaVersion: 1,
    artifactId: `${genome.blueprint.id}@${genome.blueprint.version}`,
    buildId,
    genomeDigest: sha256Text(genomeContent),
    sources: sourceRows,
    resolvedComponents: ['genome', 'prompt-os', 'realm'],
    omittedComponents: ['soul-runtime'],
    compatibility: {
      cortexAdapters: [...genome.cortex.allowedAdapters].sort(),
      realmIds: [realm.realmId],
      schemaRange: '1',
    },
    artifacts,
    validations: [
      { id: 'agent-genome-schema', status: 'pass' },
      { id: 'prompt-os-metadata', status: 'pass' },
      { id: 'realm-contract-schema', status: 'pass' },
      { id: 'realm-capabilities', status: 'pass' },
      { id: 'soul-port-dormant', status: 'pass' },
    ],
  };
  assertSchema('distribution-manifest', manifest);

  const resolvedOutput = localPath(outputDir);
  await mkdir(resolvedOutput, { recursive: true });
  await Promise.all([
    writeFile(`${resolvedOutput}/${basename('agent-genome.json')}`, genomeContent, 'utf8'),
    writeFile(`${resolvedOutput}/${basename('prompt-os-artifact.md')}`, promptContent, 'utf8'),
    writeFile(`${resolvedOutput}/${basename('realm-contract.json')}`, realmContent, 'utf8'),
    writeFile(`${resolvedOutput}/distribution-manifest.json`, jsonBytes(manifest), 'utf8'),
  ]);

  return { manifest, outputDir: resolvedOutput };
}
