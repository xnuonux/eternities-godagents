import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  const sourceRows = [
    { role: 'genome', path: 'agent-genome.json', sha256: sha256Text(genomeContent) },
    { role: 'prompt-os', path: 'prompt-os-artifact.md', sha256: promptInspection.sha256 },
    { role: 'realm', path: 'realm-contract.json', sha256: sha256Text(realmContent) },
  ].sort((left, right) => left.path.localeCompare(right.path));

  const artifacts = sourceRows.map(({ path, sha256 }) => ({ path, sha256 }));
  const buildId = sha256Value({
    schemaVersion: 1,
    artifactId: `${genome.blueprint.id}@${genome.blueprint.version}`,
    sources: sourceRows,
    cortexAdapters: [...genome.cortex.allowedAdapters].sort(),
    realmId: realm.realmId,
  });
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
