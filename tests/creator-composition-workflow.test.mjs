import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  CreatorWorkflowError,
  finalizeOperatorComposition,
  previewOperatorComposition,
  previewOperatorPreset,
} from '../src/creator/operator-workflow.mjs';

const policyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixtureRoot = new URL('../fixtures/', import.meta.url);
const library = {
  policy: new URL('creation/creation-policy.json', fixtureRoot),
  policyDigest,
  modules: new URL('creation/modules/', fixtureRoot),
  expressions: new URL('creator/expressions/', fixtureRoot),
  presets: new URL('creator/presets/', fixtureRoot),
};
const creator = 'creator:dom';

async function defaultComposition(foundation) {
  const preview = await previewOperatorPreset({ ...library, preset: foundation, creator });
  return {
    foundation,
    creator,
    expression: preview.selection.expressionRef,
    moduleRefs: preview.selection.moduleRefs,
  };
}

test('foundation defaults preserve both preset drafts and previews exactly', async () => {
  for (const foundation of [
    'preset:aether-architect@1.0.0',
    'preset:quiet-cartographer@1.0.0',
  ]) {
    const preset = await previewOperatorPreset({ ...library, preset: foundation, creator });
    const composition = await previewOperatorComposition({ ...library, ...await defaultComposition(foundation) });
    assert.equal(composition.foundationRef, foundation);
    assert.equal(composition.draftDigest, preset.draftDigest);
    assert.equal(composition.previewDigest, preset.previewDigest);
    assert.equal(composition.genomeDigest, preset.genomeDigest);
    assert.deepEqual(composition.selection, preset.selection);
  }
});

test('composition identity depends on final selections, not module key insertion order', async () => {
  const input = await defaultComposition('preset:aether-architect@1.0.0');
  input.moduleRefs = { ...input.moduleRefs, voice: 'voice:quiet-precise@1.0.0' };
  const reversed = Object.fromEntries(Object.entries(input.moduleRefs).reverse());
  const left = await previewOperatorComposition({ ...library, ...input });
  const right = await previewOperatorComposition({ ...library, ...input, moduleRefs: reversed });
  assert.equal(left.status, 'ready');
  assert.equal(left.previewDigest, right.previewDigest);
  assert.notEqual(left.previewDigest, (await previewOperatorPreset({
    ...library, preset: input.foundation, creator,
  })).previewDigest);
  assert.equal(left.selection.moduleRefs.voice, 'voice:quiet-precise@1.0.0');
});

test('composition accepts exactly one expression and all nine closed module kinds', async () => {
  const input = await defaultComposition('preset:aether-architect@1.0.0');
  const { voice: _removed, ...missing } = input.moduleRefs;
  for (const invalid of [
    { ...input, moduleRefs: missing },
    { ...input, moduleRefs: { ...input.moduleRefs, secret: 'voice:quiet-precise@1.0.0' } },
    { ...input, expression: 'expression:absent@1.0.0' },
    { ...input, foundation: 'preset:absent@1.0.0' },
  ]) {
    await assert.rejects(
      () => previewOperatorComposition({ ...library, ...invalid }),
      (error) => error instanceof CreatorWorkflowError,
    );
  }
});

test('an incompatible composition is blocked and cannot finalize', async (context) => {
  const input = await defaultComposition('preset:aether-architect@1.0.0');
  input.moduleRefs = { ...input.moduleRefs, lineage: 'lineage:synthetic-cartographer@1.0.0' };
  const preview = await previewOperatorComposition({ ...library, ...input });
  assert.equal(preview.status, 'blocked');
  const root = await mkdtemp(join(tmpdir(), 'godagent-composition-blocked-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => finalizeOperatorComposition({
      ...library,
      ...input,
      expectedPreviewDigest: preview.previewDigest,
      sourceDir: join(root, 'source'),
      outputDir: join(root, 'output'),
    }),
    (error) => error instanceof CreatorWorkflowError && error.code === 'preview-not-ready',
  );
  await assert.rejects(() => access(join(root, 'source')));
});

test('default composition finalizes to the certified Aether creation build', async (context) => {
  const input = await defaultComposition('preset:aether-architect@1.0.0');
  const preview = await previewOperatorComposition({ ...library, ...input });
  const root = await mkdtemp(join(tmpdir(), 'godagent-composition-final-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const finalized = await finalizeOperatorComposition({
    ...library,
    ...input,
    expectedPreviewDigest: preview.previewDigest,
    sourceDir: join(root, 'source'),
    outputDir: join(root, 'output'),
  });
  assert.equal(finalized.creationBuildId, '9837b7c8a8cdcc5e11f5094ef5b0307aa18790e11099860c283057a27e0f0e64');
  assert.equal(finalized.previewDigest, preview.previewDigest);
});
