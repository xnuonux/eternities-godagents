import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileDistribution } from '../src/foundry/compile.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(repositoryRoot, 'dist');
const outputDir = resolve(distRoot, 'fixture-agent');
if (dirname(outputDir) !== distRoot) {
  throw new Error('fixture output escaped the repository dist directory');
}

await rm(outputDir, { recursive: true, force: true });
const { manifest } = await compileDistribution({
  genomePath: resolve(repositoryRoot, 'fixtures', 'agent-genome.json'),
  promptArtifactPath: resolve(repositoryRoot, 'fixtures', 'prompt-os-artifact.md'),
  realmContractPath: resolve(repositoryRoot, 'fixtures', 'realm-contract.json'),
  outputDir,
});

process.stdout.write(`${manifest.buildId}\n`);
