import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { assertSchema } from '../src/core/schema-validator.mjs';

const fixtureUrl = (name) => new URL(`../fixtures/creation/${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(fixtureUrl(name), 'utf8'));

const moduleKinds = [
  'lineage',
  'archetype',
  'attributes',
  'personality',
  'voice',
  'organs',
  'godskills',
  'cortex',
  'embodiment',
];

test('creation fixtures satisfy their strict public schemas', async () => {
  const fixtures = [
    ['creation-candidate', 'creation-candidate.json'],
    ['expression-overlay', 'expression-overlay.json'],
    ['creation-policy', 'creation-policy.json'],
  ];

  for (const [schemaName, file] of fixtures) {
    const value = await readJson(file);
    assert.equal(assertSchema(schemaName, value), value);
  }
});

test('all nine creation module fixtures satisfy the common module envelope', async () => {
  const files = (await readdir(fixtureUrl('modules'))).filter((name) => name.endsWith('.json'));
  assert.equal(files.length, 9);

  for (const kind of moduleKinds) {
    const module = await readJson(`modules/${kind}.json`);
    assert.equal(module.moduleKind, kind);
    assert.equal(assertSchema('creation-module', module), module);
  }
});

test('creation schemas reject unknown fields and active Soul state', async () => {
  const candidate = await readJson('creation-candidate.json');

  assert.throws(() => assertSchema('creation-candidate', {
    ...candidate,
    authority: 'self-granted',
  }), /additionalProperties/);

  assert.throws(() => assertSchema('creation-candidate', {
    ...candidate,
    soulPort: { schemaVersion: 1, status: 'active' },
  }), /const/);

  assert.throws(() => assertSchema('creation-candidate', {
    ...candidate,
    evolution: { policy: 'mutable' },
  }), /const/);
});
