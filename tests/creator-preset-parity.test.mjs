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

function replayManually(initial, choices) {
  let current = initial;
  for (const choice of choices) {
    current = applyCreatorCommand({
      draft: current,
      command: { schemaVersion: 1, ...choice, expectedDraftDigest: current.draftDigest },
    });
  }
  return current;
}

for (const presetRef of ['preset:aether-architect@1.0.0', 'preset:quiet-cartographer@1.0.0']) {
  test(`${presetRef} is byte-identical to the equivalent manual command stream`, async () => {
    const { catalog, sourceLoader } = await library();
    const preset = sourceLoader.resolvePreset(presetRef);
    const initial = createCreatorDraft({ catalogDigest: catalog.catalogDigest, creatorRef: 'creator:dom' });
    const manual = replayManually(initial, preset.choices);
    const replayed = replayCreatorPreset({ draft: initial, preset });
    assert.deepEqual(replayed, manual);
    const manualPreview = previewCreatorDraft({ draft: manual, catalog, sourceLoader });
    const presetPreview = previewCreatorDraft({ draft: replayed, catalog, sourceLoader });
    assert.equal(manualPreview.status, 'ready');
    assert.equal(presetPreview.previewDigest, manualPreview.previewDigest);
    assert.deepEqual(presetPreview.candidate, manualPreview.candidate);
    assert.deepEqual(presetPreview.expression, manualPreview.expression);
    assert.deepEqual(presetPreview.genome, manualPreview.genome);
  });
}

test('preset replay rejects empty and malformed choice streams', async () => {
  const { catalog } = await library();
  const initial = createCreatorDraft({ catalogDigest: catalog.catalogDigest, creatorRef: 'creator:dom' });
  assert.throws(
    () => replayCreatorPreset({ draft: initial, preset: { schemaVersion: 1, id: 'empty', version: '1.0.0', choices: [] } }),
    /creator preset is invalid/,
  );
  assert.throws(
    () => replayCreatorPreset({
      draft: initial,
      preset: {
        schemaVersion: 1,
        id: 'bad',
        version: '1.0.0',
        choices: [{ kind: 'set-expression', payload: { ref: '../escape' } }],
      },
    }),
    /creator preset is invalid/,
  );
});
