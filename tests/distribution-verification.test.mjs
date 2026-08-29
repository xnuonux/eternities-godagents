import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { compileDistribution, verifyDistribution } from '../src/foundry/compile.mjs';

async function buildFixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-distribution-'));
  const outputDir = join(root, 'distribution');
  context.after(() => rm(root, { recursive: true, force: true }));
  await compileDistribution({
    genomePath: new URL('../fixtures/agent-genome.json', import.meta.url),
    promptArtifactPath: new URL('../fixtures/prompt-os-artifact.md', import.meta.url),
    realmContractPath: new URL('../fixtures/realm-contract.json', import.meta.url),
    outputDir,
  });
  return { root, outputDir };
}

async function cloneDistribution(context) {
  const fixture = await buildFixture(context);
  const clone = join(fixture.root, `clone-${Math.random().toString(16).slice(2)}`);
  await cp(fixture.outputDir, clone, { recursive: true });
  return clone;
}

test('distribution verifier accepts one exact canonical foundry artifact set', async (context) => {
  const { outputDir } = await buildFixture(context);
  const verified = await verifyDistribution(outputDir);
  assert.match(verified.buildId, /^[a-f0-9]{64}$/);
  assert.equal(verified.artifacts.length, 3);
});

test('distribution verifier rejects unexpected files and noncanonical manifests', async (context) => {
  const extra = await cloneDistribution(context);
  await writeFile(join(extra, 'surprise.txt'), 'no', 'utf8');
  await assert.rejects(() => verifyDistribution(extra), /artifact set mismatch/);

  const noncanonical = await cloneDistribution(context);
  const manifestPath = join(noncanonical, 'distribution-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await assert.rejects(() => verifyDistribution(noncanonical), /manifest is not canonical/);
});

test('distribution verifier rejects changed artifact bytes', async (context) => {
  const prompt = await cloneDistribution(context);
  await writeFile(join(prompt, 'prompt-os-artifact.md'), 'changed\n', 'utf8');
  await assert.rejects(() => verifyDistribution(prompt), /artifact digest mismatch/);

  const genome = await cloneDistribution(context);
  const genomePath = join(genome, 'agent-genome.json');
  const value = JSON.parse(await readFile(genomePath, 'utf8'));
  value.blueprint.version = '9.9.9';
  await writeFile(genomePath, `${canonicalJson(value)}\n`, 'utf8');
  await assert.rejects(() => verifyDistribution(genome), /artifact digest mismatch/);
});

test('distribution verifier rejects manifest artifact substitution and recomputed wrong build identity', async (context) => {
  const substituted = await cloneDistribution(context);
  const substitutedPath = join(substituted, 'distribution-manifest.json');
  const substitutedManifest = JSON.parse(await readFile(substitutedPath, 'utf8'));
  substitutedManifest.artifacts[0].path = 'realm-contract.json';
  await writeFile(substitutedPath, `${canonicalJson(substitutedManifest)}\n`, 'utf8');
  await assert.rejects(() => verifyDistribution(substituted), /artifact manifest mismatch/);

  const wrongBuild = await cloneDistribution(context);
  const wrongBuildPath = join(wrongBuild, 'distribution-manifest.json');
  const wrongBuildManifest = JSON.parse(await readFile(wrongBuildPath, 'utf8'));
  wrongBuildManifest.buildId = 'f'.repeat(64);
  await writeFile(wrongBuildPath, `${canonicalJson(wrongBuildManifest)}\n`, 'utf8');
  await assert.rejects(() => verifyDistribution(wrongBuild), /build id mismatch/);
});
