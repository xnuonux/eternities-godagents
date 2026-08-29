import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { loadCreatorCatalog, loadCreatorLibrary } from '../src/creator/catalog.mjs';

const fixtureRoot = new URL('../fixtures/creation/', import.meta.url);
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';

async function workspace(context, prefix = 'godagent-creator-catalog-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

const choice = (kind, payload) => ({ kind, payload });

function canonicalPreset() {
  return {
    schemaVersion: 1,
    id: 'aether-architect',
    version: '1.0.0',
    choices: [
      choice('set-blueprint', { id: 'aether-architect', version: '1.0.0' }),
      choice('set-genesis', { createdBy: 'dom', sourceManifest: ['catalog-test'] }),
      choice('set-expression', { ref: 'expression:aether-architect@1.0.0' }),
      choice('select-module', { kind: 'lineage', ref: 'lineage:synthetic-explorer@1.0.0' }),
    ],
  };
}

async function libraryFixture(context, suffix) {
  const root = await workspace(context, `godagent-creator-${suffix}-`);
  const modules = join(root, 'modules');
  const expressions = join(root, 'expressions');
  const presets = join(root, 'presets');
  await Promise.all([
    mkdir(modules, { recursive: true }),
    mkdir(expressions, { recursive: true }),
    mkdir(presets, { recursive: true }),
  ]);
  await cp(new URL('modules/', fixtureRoot), modules, { recursive: true });
  const expression = JSON.parse(await readFile(new URL('expression-overlay.json', fixtureRoot), 'utf8'));
  await writeFile(join(expressions, `${suffix}-expression.json`), suffix === 'left'
    ? `${JSON.stringify(expression, null, 2)}\n`
    : canonicalJson(expression), 'utf8');
  const preset = canonicalPreset();
  await writeFile(join(presets, `${suffix}-preset.json`), suffix === 'left'
    ? `${JSON.stringify(preset, null, 2)}\n`
    : canonicalJson(preset), 'utf8');
  return {
    policyPath: new URL('creation-policy.json', fixtureRoot),
    expectedPolicyDigest,
    moduleDirectory: modules,
    expressionDirectory: expressions,
    presetDirectory: presets,
  };
}

test('creator catalog is deterministic and exposes only bounded discovery rows', async (context) => {
  const left = await loadCreatorLibrary(await libraryFixture(context, 'left'));
  const right = await loadCreatorLibrary(await libraryFixture(context, 'right'));
  assert.deepEqual(left.catalog, right.catalog);
  assert.equal(left.catalog.catalogDigest, right.catalog.catalogDigest);
  assert.equal(Object.isFrozen(left.catalog), true);
  assert.equal(Object.hasOwn(left.catalog, 'policy'), false);
  assert.equal(Object.hasOwn(left.catalog, 'sourceLoader'), false);
  assert.ok(left.catalog.modules.length >= 9);
  assert.equal(left.catalog.expressions.length, 1);
  assert.equal(left.catalog.presets.length, 1);
  assert.deepEqual(left.catalog.modules.map((row) => row.ref), [...left.catalog.modules.map((row) => row.ref)].sort());
  assert.deepEqual(Object.keys(left.catalog.modules[0]).sort(), [
    'capabilities', 'kind', 'presentationTags', 'provenance', 'providesTags',
    'ref', 'requiresTags', 'sourceDigest', 'summary',
  ]);
  assert.equal(typeof left.catalog.modules[0].sourceDigest, 'string');
});

test('creator source loader resolves exact frozen clones and cannot enumerate backing maps', async (context) => {
  const { catalog, sourceLoader } = await loadCreatorLibrary(await libraryFixture(context, 'left'));
  assert.equal(sourceLoader.catalogDigest, catalog.catalogDigest);
  assert.deepEqual(Object.keys(sourceLoader).sort(), [
    'catalogDigest', 'resolveExpression', 'resolveModule', 'resolvePreset',
  ]);
  const first = sourceLoader.resolveModule('lineage:synthetic-explorer@1.0.0');
  const second = sourceLoader.resolveModule('lineage:synthetic-explorer@1.0.0');
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.payload), true);
  assert.equal(sourceLoader.resolveExpression('expression:aether-architect@1.0.0').name, 'Aether Architect');
  assert.equal(sourceLoader.resolvePreset('preset:aether-architect@1.0.0').choices.length, 4);
  assert.throws(() => sourceLoader.resolveModule('lineage:missing@1.0.0'), /creator source reference is unavailable/);
  assert.deepEqual(await loadCreatorCatalog(await libraryFixture(context, 'right')), catalog);
});

test('creator catalog rejects every unexpected or ambiguous library entry', async (context) => {
  const unexpected = await libraryFixture(context, 'unexpected');
  await writeFile(join(unexpected.moduleDirectory, 'README.txt'), 'ignored?', 'utf8');
  await assert.rejects(() => loadCreatorLibrary(unexpected), /unexpected creator library entry/);

  const duplicate = await libraryFixture(context, 'duplicate');
  await cp(
    join(duplicate.moduleDirectory, 'lineage.json'),
    join(duplicate.moduleDirectory, 'lineage-copy.json'),
  );
  await assert.rejects(() => loadCreatorLibrary(duplicate), /duplicate creator module reference/);

  const child = await libraryFixture(context, 'child');
  await mkdir(join(child.expressionDirectory, 'nested'));
  await assert.rejects(() => loadCreatorLibrary(child), /unexpected creator library entry/);
});

test('creator catalog rejects policy mismatch and authority-shaped preset choices', async (context) => {
  const mismatch = await libraryFixture(context, 'mismatch');
  await assert.rejects(
    () => loadCreatorLibrary({ ...mismatch, expectedPolicyDigest: 'f'.repeat(64) }),
    /creation policy digest pin mismatch/,
  );

  const attack = await libraryFixture(context, 'attack');
  const preset = canonicalPreset();
  preset.choices[0].payload.credential = 'catalog-secret-canary';
  await writeFile(join(attack.presetDirectory, 'attack-preset.json'), JSON.stringify(preset), 'utf8');
  await assert.rejects(
    () => loadCreatorLibrary(attack),
    (error) => /creator choice is invalid/.test(error.message) && !error.message.includes('catalog-secret-canary'),
  );
});

test('phase 3 fixture catalog exposes two real creation paths', async () => {
  const root = new URL('../fixtures/', import.meta.url);
  const { catalog, sourceLoader } = await loadCreatorLibrary({
    policyPath: new URL('creation/creation-policy.json', root),
    expectedPolicyDigest,
    moduleDirectory: new URL('creation/modules/', root),
    expressionDirectory: new URL('creator/expressions/', root),
    presetDirectory: new URL('creator/presets/', root),
  });
  assert.equal(catalog.modules.length, 14);
  assert.deepEqual(catalog.expressions.map((row) => row.ref), [
    'expression:aether-architect@1.0.0',
    'expression:quiet-cartographer@1.0.0',
  ]);
  assert.deepEqual(catalog.presets.map((row) => row.ref), [
    'preset:aether-architect@1.0.0',
    'preset:quiet-cartographer@1.0.0',
  ]);
  assert.equal(sourceLoader.resolvePreset('preset:aether-architect@1.0.0').choices.length, 17);
  assert.equal(sourceLoader.resolvePreset('preset:quiet-cartographer@1.0.0').choices.length, 17);
});
