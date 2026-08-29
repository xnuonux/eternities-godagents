import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

import { compileDistribution } from '../src/foundry/compile.mjs';
import { inspectPromptArtifact } from '../src/foundry/prompt-os-adapter.mjs';

const fixturePath = (name) => new URL(`../fixtures/${name}`, import.meta.url);

async function manifestDirectory(root) {
  const rows = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else {
        const bytes = await readFile(path);
        rows.push({
          path: relative(root, path).replaceAll('\\', '/'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
  }
  await walk(root);
  return rows;
}

test('Prompt OS adapter extracts bounded metadata and source digest', async () => {
  const inspected = await inspectPromptArtifact(fixturePath('prompt-os-artifact.md'));

  assert.deepEqual(inspected.metadata, {
    product: 'ULTRAGOD Prompt OS',
    version: '1.0.0',
    edition: 'general-intelligence',
    adapter: 'generic',
    receipt: 'fixture.receipt.json',
  });
  assert.equal(inspected.sha256.length, 64);
  assert.ok(inspected.bytes > 100);
  assert.equal(Object.hasOwn(inspected, 'content'), false);
});

test('Prompt OS adapter rejects an unmarked prompt', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-prompt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'unmarked.md');
  await writeFile(path, '# ordinary prompt\n', 'utf8');

  await assert.rejects(() => inspectPromptArtifact(path), /Prompt OS metadata/);
});

test('foundry produces byte-identical distributions from identical sources', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-foundry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = join(root, 'first');
  const second = join(root, 'second');
  const inputs = {
    genomePath: fixturePath('agent-genome.json'),
    promptArtifactPath: fixturePath('prompt-os-artifact.md'),
    realmContractPath: fixturePath('realm-contract.json'),
  };

  const firstResult = await compileDistribution({ ...inputs, outputDir: first });
  const secondResult = await compileDistribution({ ...inputs, outputDir: second });

  assert.deepEqual(await manifestDirectory(first), await manifestDirectory(second));
  assert.equal(firstResult.manifest.buildId, secondResult.manifest.buildId);
  assert.equal(firstResult.manifest.artifactId, 'fixture-agent@0.1.0');
  assert.deepEqual(firstResult.manifest.sources.map((row) => row.path), [
    'agent-genome.json',
    'prompt-os-artifact.md',
    'realm-contract.json',
  ]);
  assert.equal(JSON.stringify(firstResult.manifest).includes('C:\\dev'), false);
});

test('foundry rejects a realm that cannot satisfy the genome', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-incompatible-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const genome = JSON.parse(await readFile(fixturePath('agent-genome.json'), 'utf8'));
  genome.realm.requiredCapabilities.push('missing.capability');
  const genomePath = join(root, 'agent-genome.json');
  await writeFile(genomePath, `${JSON.stringify(genome, null, 2)}\n`, 'utf8');

  await assert.rejects(
    () => compileDistribution({
      genomePath,
      promptArtifactPath: fixturePath('prompt-os-artifact.md'),
      realmContractPath: fixturePath('realm-contract.json'),
      outputDir: join(root, 'dist'),
    }),
    /required realm capability missing\.capability/,
  );
});
