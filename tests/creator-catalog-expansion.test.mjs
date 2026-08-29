import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { loadOperatorCatalog, previewOperatorPreset, finalizeOperatorPreset } from '../src/creator/operator-workflow.mjs';

const policyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixtureRoot = new URL('../fixtures/', import.meta.url);
const library = {
  policy: new URL('creation/creation-policy.json', fixtureRoot),
  policyDigest,
  modules: new URL('creation/modules/', fixtureRoot),
  expressions: new URL('creator/expressions/', fixtureRoot),
  presets: new URL('creator/presets/', fixtureRoot),
};
const preset = 'preset:luminous-emissary@1.0.0';
const creator = 'creator:dom';

test('catalog includes one coherent third identity path without duplicating operational infrastructure', async () => {
  const catalog = await loadOperatorCatalog(library);
  assert.ok(catalog.presets.some((row) => row.ref === preset));
  assert.ok(catalog.expressions.some((row) => (
    row.ref === 'expression:ilyra-emissary@1.0.0'
      && row.name === 'Ilyra'
      && row.genderPresentation === 'feminine'
  )));
  const counts = Object.fromEntries(Object.entries(Object.groupBy(catalog.modules, (row) => row.kind))
    .map(([kind, rows]) => [kind, rows.length]));
  assert.deepEqual(counts, {
    archetype: 3,
    attributes: 3,
    cortex: 1,
    embodiment: 1,
    godskills: 1,
    lineage: 3,
    organs: 1,
    personality: 3,
    voice: 3,
  });
});

test('luminous emissary resolves as a distinct compatible ready preview', async () => {
  const preview = await previewOperatorPreset({ ...library, preset, creator });
  assert.equal(preview.status, 'ready');
  assert.equal(preview.selection.expressionRef, 'expression:ilyra-emissary@1.0.0');
  assert.equal(preview.selection.moduleRefs.lineage, 'lineage:synthetic-empath@1.0.0');
  assert.equal(preview.selection.moduleRefs.archetype, 'archetype:diplomatic-orchestrator@1.0.0');
  assert.equal(preview.selection.moduleRefs.attributes, 'attributes:social-balanced@1.0.0');
  assert.ok(preview.derivedAttributes.socialIntelligence >= 80);
  assert.match(preview.previewDigest, /^[a-f0-9]{64}$/);
});

test('luminous emissary finalization is reproducible', async (context) => {
  const preview = await previewOperatorPreset({ ...library, preset, creator });
  const root = await mkdtemp(join(tmpdir(), 'godagent-luminous-emissary-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const results = [];
  for (const name of ['left', 'right']) {
    results.push(await finalizeOperatorPreset({
      ...library,
      preset,
      creator,
      expectedPreviewDigest: preview.previewDigest,
      sourceDir: join(root, name, 'source'),
      outputDir: join(root, name, 'output'),
    }));
  }
  assert.equal(results[0].creationBuildId, results[1].creationBuildId);
  assert.equal(results[0].genomeDigest, results[1].genomeDigest);
  assert.match(results[0].creationBuildId, /^[a-f0-9]{64}$/);
});
