import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { loadCreatorCatalog, loadCreatorLibrary } from '../src/creator/catalog.mjs';
import { createCreatorDraft } from '../src/creator/draft.mjs';
import { replayCreatorPreset } from '../src/creator/preset.mjs';
import { previewCreatorDraft } from '../src/creator/preview.mjs';
import {
  CreatorWorkflowError,
  finalizeOperatorPreset,
  loadOperatorCatalog,
  previewOperatorPreset,
} from '../src/creator/operator-workflow.mjs';

const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixtureRoot = new URL('../fixtures/', import.meta.url);
const library = {
  policy: new URL('creation/creation-policy.json', fixtureRoot),
  policyDigest: expectedPolicyDigest,
  modules: new URL('creation/modules/', fixtureRoot),
  expressions: new URL('creator/expressions/', fixtureRoot),
  presets: new URL('creator/presets/', fixtureRoot),
};
const preset = 'preset:aether-architect@1.0.0';
const creator = 'creator:dom';

test('operator catalog is the exact bounded certified catalog', async () => {
  const actual = await loadOperatorCatalog(library);
  const expected = await loadCreatorCatalog({
    policyPath: library.policy,
    expectedPolicyDigest: library.policyDigest,
    moduleDirectory: library.modules,
    expressionDirectory: library.expressions,
    presetDirectory: library.presets,
  });
  assert.deepEqual(actual, expected);
  assert.equal(Object.isFrozen(actual), true);
});

test('operator preset preview is deterministic and bounded', async () => {
  const left = await previewOperatorPreset({ ...library, preset, creator });
  const right = await previewOperatorPreset({ ...library, preset, creator });
  const directLibrary = await loadCreatorLibrary({
    policyPath: library.policy,
    expectedPolicyDigest: library.policyDigest,
    moduleDirectory: library.modules,
    expressionDirectory: library.expressions,
    presetDirectory: library.presets,
  });
  const initial = createCreatorDraft({ catalogDigest: directLibrary.catalog.catalogDigest, creatorRef: creator });
  const directDraft = replayCreatorPreset({ draft: initial, preset: directLibrary.sourceLoader.resolvePreset(preset) });
  const directPreview = previewCreatorDraft({ draft: directDraft, ...directLibrary });
  assert.deepEqual(left, right);
  assert.equal(left.status, 'ready');
  assert.equal(left.presetRef, preset);
  assert.equal(left.previewDigest, directPreview.previewDigest);
  assert.equal(left.creationBuildId, undefined);
  assert.equal(left.candidate, undefined);
  assert.equal(left.genome, undefined);
  assert.deepEqual(Object.keys(left).sort(), [
    'catalogDigest', 'derivedAttributes', 'draftDigest', 'excludedFromAuthority',
    'genomeDigest', 'issues', 'presetRef', 'previewDigest', 'schemaVersion',
    'selection', 'status',
  ]);
});

test('finalization requires the exact current preview digest before writes', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-operator-review-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = join(root, 'source');
  const outputDir = join(root, 'output');
  await assert.rejects(
    () => finalizeOperatorPreset({
      ...library,
      preset,
      creator,
      expectedPreviewDigest: 'f'.repeat(64),
      sourceDir,
      outputDir,
    }),
    (error) => error instanceof CreatorWorkflowError && error.code === 'preview-digest-mismatch',
  );
  await assert.rejects(() => access(sourceDir));
  await assert.rejects(() => access(outputDir));

  const preview = await previewOperatorPreset({ ...library, preset, creator });
  const result = await finalizeOperatorPreset({
    ...library,
    preset,
    creator,
    expectedPreviewDigest: preview.previewDigest,
    sourceDir,
    outputDir,
  });
  assert.equal(result.status, 'finalized');
  assert.equal(result.previewDigest, preview.previewDigest);
  assert.equal(result.creationBuildId, '87168c691b10c2d4f1780c3826b6d3f40cbcee18a63049fea77a1780b857b9f8');
  assert.equal(result.genomeDigest, preview.genomeDigest);
  assert.deepEqual(Object.keys(result).sort(), [
    'catalogDigest', 'creationBuildId', 'draftDigest', 'genomeDigest',
    'previewDigest', 'reviewSealDigest', 'schemaVersion', 'status',
  ]);
  assert.deepEqual(
    JSON.parse(await readFile(join(sourceDir, 'creation-candidate.json'), 'utf8')).blueprint,
    { id: 'aether-architect', version: '1.0.0' },
  );
});

test('unknown presets and malformed creator references become closed workflow failures', async () => {
  await assert.rejects(
    () => previewOperatorPreset({ ...library, preset: 'preset:absent@1.0.0', creator }),
    (error) => error instanceof CreatorWorkflowError && error.code === 'preset-unavailable',
  );
  await assert.rejects(
    () => previewOperatorPreset({ ...library, preset, creator: '../escape' }),
    (error) => error instanceof CreatorWorkflowError && error.code === 'workflow-input-invalid',
  );
});
