import assert from 'node:assert/strict';
import test from 'node:test';

import { loadCreatorLibrary } from '../src/creator/catalog.mjs';
import { applyCreatorCommand, createCreatorDraft } from '../src/creator/draft.mjs';
import { previewCreatorDraft } from '../src/creator/preview.mjs';
import { replayCreatorPreset } from '../src/creator/preset.mjs';

const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';

async function library() {
  const root = new URL('../fixtures/', import.meta.url);
  return loadCreatorLibrary({
    policyPath: new URL('creation/creation-policy.json', root),
    expectedPolicyDigest,
    moduleDirectory: new URL('creation/modules/', root),
    expressionDirectory: new URL('creator/expressions/', root),
    presetDirectory: new URL('creator/presets/', root),
  });
}

test('incomplete creator drafts return sorted closed issue rows and no trusted projections', async () => {
  const { catalog, sourceLoader } = await library();
  const draft = createCreatorDraft({ catalogDigest: catalog.catalogDigest, creatorRef: 'creator:dom' });
  const preview = previewCreatorDraft({ draft, catalog, sourceLoader });
  assert.equal(preview.status, 'incomplete');
  assert.deepEqual(preview.issues.map((row) => row.code), [...preview.issues.map((row) => row.code)].sort());
  assert.ok(preview.issues.some((row) => row.code === 'missing-blueprint'));
  assert.ok(preview.issues.some((row) => row.code === 'missing-module-lineage'));
  for (const key of ['candidate', 'expression', 'genome', 'derivedAttributes']) {
    assert.equal(Object.hasOwn(preview, key), false);
  }
  assert.equal(Object.isFrozen(preview), true);
  assert.match(preview.previewDigest, /^[a-f0-9]{64}$/);
});

test('ready preview is deterministic and projects the exact existing creation contract', async () => {
  const { catalog, sourceLoader } = await library();
  const initial = createCreatorDraft({ catalogDigest: catalog.catalogDigest, creatorRef: 'creator:dom' });
  const draft = replayCreatorPreset({
    draft: initial,
    preset: sourceLoader.resolvePreset('preset:aether-architect@1.0.0'),
  });
  const preview = previewCreatorDraft({ draft, catalog, sourceLoader });
  const repeated = previewCreatorDraft({ draft: structuredClone(draft), catalog, sourceLoader });
  assert.equal(preview.status, 'ready');
  assert.deepEqual(preview.issues, []);
  assert.equal(preview.previewDigest, repeated.previewDigest);
  assert.equal(preview.candidate.blueprint.id, 'aether-architect');
  assert.equal(preview.expression.name, 'Aether Architect');
  assert.deepEqual(
    {
      adaptability: preview.derivedAttributes.adaptability,
      planning: preview.derivedAttributes.planning,
      precision: preview.derivedAttributes.precision,
      reasoning: preview.derivedAttributes.reasoning,
      resilience: preview.derivedAttributes.resilience,
    },
    { adaptability: 66, planning: 77, precision: 73, reasoning: 80, resilience: 66 },
  );
  assert.equal(preview.genome.blueprint.id, 'aether-architect');
  assert.ok(preview.excludedFromAuthority.includes('provider-routing'));
  assert.ok(preview.excludedFromAuthority.includes('soul-runtime'));
});

test('complete incompatible drafts are blocked with one closed issue code', async () => {
  const { catalog, sourceLoader } = await library();
  const initial = createCreatorDraft({ catalogDigest: catalog.catalogDigest, creatorRef: 'creator:dom' });
  const ready = replayCreatorPreset({
    draft: initial,
    preset: sourceLoader.resolvePreset('preset:quiet-cartographer@1.0.0'),
  });
  const incompatible = applyCreatorCommand({
    draft: ready,
    command: {
      schemaVersion: 1,
      kind: 'select-module',
      expectedDraftDigest: ready.draftDigest,
      payload: { kind: 'lineage', ref: 'lineage:synthetic-explorer@1.0.0' },
    },
  });
  const preview = previewCreatorDraft({ draft: incompatible, catalog, sourceLoader });
  assert.equal(preview.status, 'blocked');
  assert.deepEqual(preview.issues, [{ code: 'compatibility-tag-unavailable' }]);
  for (const key of ['genome', 'derivedAttributes']) assert.equal(Object.hasOwn(preview, key), false);
});

test('preview rejects catalog and source substitution before projection', async () => {
  const { catalog, sourceLoader } = await library();
  const draft = createCreatorDraft({ catalogDigest: catalog.catalogDigest, creatorRef: 'creator:dom' });
  assert.throws(
    () => previewCreatorDraft({ draft, catalog: { ...catalog, catalogDigest: 'f'.repeat(64) }, sourceLoader }),
    /creator preview trust boundary mismatch/,
  );
  assert.throws(
    () => previewCreatorDraft({ draft, catalog, sourceLoader: { ...sourceLoader, catalogDigest: 'f'.repeat(64) } }),
    /creator preview trust boundary mismatch/,
  );
});
