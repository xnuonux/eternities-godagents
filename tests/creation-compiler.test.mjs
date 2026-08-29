import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { compileCreation, verifyCreationBuild } from '../src/creation/compile.mjs';

const root = new URL('../fixtures/creation/', import.meta.url);
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const baseOptions = {
  candidatePath: new URL('creation-candidate.json', root),
  policyPath: new URL('creation-policy.json', root),
  expressionPath: new URL('expression-overlay.json', root),
  moduleDirectory: new URL('modules/', root),
  expectedPolicyDigest,
};
const artifactNames = [
  'agent-genome.json',
  'creation-build-manifest.json',
  'creation-candidate.json',
  'creation-policy.json',
  'expression-overlay.json',
  'module-manifest.json',
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function temporaryOutput(context) {
  const outputDir = await mkdtemp(join(tmpdir(), 'godagent-build-'));
  context.after(() => rm(outputDir, { recursive: true, force: true }));
  return outputDir;
}

async function byteManifest(directory) {
  const files = (await readdir(directory)).sort();
  return Object.fromEntries(await Promise.all(files.map(async (file) => [
    file,
    sha256(await readFile(join(directory, file))),
  ])));
}

test('identical creation inputs produce byte-identical verified artifacts', async (context) => {
  const left = await temporaryOutput(context);
  const right = await temporaryOutput(context);
  const first = await compileCreation({ ...baseOptions, outputDir: left });
  const second = await compileCreation({ ...baseOptions, outputDir: right });

  assert.deepEqual((await readdir(left)).sort(), artifactNames);
  assert.deepEqual(await byteManifest(left), await byteManifest(right));
  assert.equal(first.manifest.buildId, second.manifest.buildId);
  assert.equal((await verifyCreationBuild(left, { expectedPolicyDigest })).buildId, first.manifest.buildId);
});

test('property order and formatting cannot change creation identity', async (context) => {
  const manualOutput = await temporaryOutput(context);
  const presetOutput = await temporaryOutput(context);
  const manual = await compileCreation({ ...baseOptions, outputDir: manualOutput });
  const preset = await compileCreation({
    ...baseOptions,
    candidatePath: new URL('presets/aether-architect.json', root),
    outputDir: presetOutput,
  });

  assert.equal(preset.manifest.buildId, manual.manifest.buildId);
  assert.equal(preset.manifest.genomeDigest, manual.manifest.genomeDigest);
  assert.equal(preset.manifest.expressionDigest, manual.manifest.expressionDigest);
  assert.equal(preset.manifest.moduleManifestDigest, manual.manifest.moduleManifestDigest);
  assert.deepEqual(await byteManifest(presetOutput), await byteManifest(manualOutput));
});

test('emitted source artifacts preserve independently canonicalized inputs', async (context) => {
  const outputDir = await temporaryOutput(context);
  await compileCreation({ ...baseOptions, outputDir });

  const comparisons = [
    ['creation-candidate.json', baseOptions.candidatePath],
    ['creation-policy.json', baseOptions.policyPath],
    ['expression-overlay.json', baseOptions.expressionPath],
  ];
  for (const [artifact, source] of comparisons) {
    const sourceValue = JSON.parse(await readFile(source, 'utf8'));
    const emitted = await readFile(join(outputDir, artifact), 'utf8');
    assert.equal(emitted, `${canonicalJson(sourceValue)}\n`);
  }
});

test('on-disk corruption invalidates a previously verified build', async (context) => {
  const outputDir = await temporaryOutput(context);
  await compileCreation({ ...baseOptions, outputDir });
  const genomePath = join(outputDir, 'agent-genome.json');
  const bytes = await readFile(genomePath, 'utf8');
  await writeFile(genomePath, bytes.replace('"schemaVersion":1', '"schemaVersion":2'), 'utf8');

  await assert.rejects(() => verifyCreationBuild(outputDir, { expectedPolicyDigest }), /artifact digest mismatch/);
});

test('creation-policy authority ceiling requires and enforces an independent digest pin', async (context) => {
  const parent = await mkdtemp(join(tmpdir(), 'godagent-policy-attack-'));
  const sourceRoot = join(parent, 'creation');
  context.after(() => rm(parent, { recursive: true, force: true }));
  await cp(root, sourceRoot, { recursive: true });

  const policyPath = join(sourceRoot, 'creation-policy.json');
  const candidatePath = join(sourceRoot, 'creation-candidate.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  policy.allowedEffects.push('realm-admin');
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
  candidate.constitution.allowedEffects.push('realm-admin');
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');

  const attackOptions = {
    candidatePath,
    policyPath,
    expressionPath: join(sourceRoot, 'expression-overlay.json'),
    moduleDirectory: join(sourceRoot, 'modules'),
    outputDir: await temporaryOutput(context),
  };
  await assert.rejects(() => compileCreation({
    ...attackOptions,
    expectedPolicyDigest,
  }), /creation policy digest pin mismatch/);
  await assert.rejects(() => compileCreation(attackOptions), /creation policy digest pin is required/);
});
