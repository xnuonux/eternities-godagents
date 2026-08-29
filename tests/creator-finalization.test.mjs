import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { loadCreatorLibrary } from '../src/creator/catalog.mjs';
import { createCreatorDraft } from '../src/creator/draft.mjs';
import {
  buildCreatorReviewSeal,
  finalizeCreatorDraft,
} from '../src/creator/finalize.mjs';
import { replayCreatorPreset } from '../src/creator/preset.mjs';
import { previewCreatorDraft } from '../src/creator/preview.mjs';

const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixtureRoot = new URL('../fixtures/', import.meta.url);

async function workspace(context, prefix = 'godagent-creator-finalize-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function options(overrides = {}) {
  return {
    policyPath: new URL('creation/creation-policy.json', fixtureRoot),
    expectedPolicyDigest,
    moduleDirectory: new URL('creation/modules/', fixtureRoot),
    expressionDirectory: new URL('creator/expressions/', fixtureRoot),
    presetDirectory: new URL('creator/presets/', fixtureRoot),
    ...overrides,
  };
}

async function ready(presetRef = 'preset:aether-architect@1.0.0', overrides = {}) {
  const library = await loadCreatorLibrary(options(overrides));
  const initial = createCreatorDraft({ catalogDigest: library.catalog.catalogDigest, creatorRef: 'creator:dom' });
  const draft = replayCreatorPreset({ draft: initial, preset: library.sourceLoader.resolvePreset(presetRef) });
  const preview = previewCreatorDraft({ draft, ...library });
  const reviewSeal = buildCreatorReviewSeal({
    catalogDigest: library.catalog.catalogDigest,
    draftDigest: draft.draftDigest,
    previewDigest: preview.previewDigest,
  });
  return { ...library, draft, preview, reviewSeal };
}

test('creator review seal binds the exact reviewed catalog, draft, and preview', () => {
  const input = {
    catalogDigest: 'a'.repeat(64),
    draftDigest: 'b'.repeat(64),
    previewDigest: 'c'.repeat(64),
  };
  const first = buildCreatorReviewSeal(input);
  const second = buildCreatorReviewSeal({
    previewDigest: input.previewDigest,
    catalogDigest: input.catalogDigest,
    draftDigest: input.draftDigest,
  });
  assert.deepEqual(first, second);
  assert.match(first.sealDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(() => buildCreatorReviewSeal({ ...input, draftDigest: 'bad' }), /creator review seal is invalid/);
});

for (const presetRef of ['preset:aether-architect@1.0.0', 'preset:quiet-cartographer@1.0.0']) {
  test(`${presetRef} finalizes exact reviewed sources through the Phase 1 compiler`, async (context) => {
    const root = await workspace(context);
    const sourceDirectory = join(root, 'source');
    const outputDirectory = join(root, 'output');
    const state = await ready(presetRef);
    const result = await finalizeCreatorDraft({
      ...state,
      reviewSeal: state.reviewSeal,
      sourceDirectory,
      outputDirectory,
      expectedPolicyDigest,
    });
    assert.equal(result.manifest.buildId.length, 64);
    assert.equal(result.manifest.genomeDigest, state.preview.genomeDigest);
    assert.deepEqual(
      JSON.parse(await readFile(join(sourceDirectory, 'creation-candidate.json'), 'utf8')),
      state.preview.candidate,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(sourceDirectory, 'expression-overlay.json'), 'utf8')),
      state.preview.expression,
    );
    assert.deepEqual((await readdir(sourceDirectory)).sort(), [
      'creation-candidate.json',
      'creation-policy.json',
      'expression-overlay.json',
      'modules',
    ]);
    assert.deepEqual(
      JSON.parse(await readFile(join(sourceDirectory, 'creation-policy.json'), 'utf8')),
      state.sourceLoader.resolvePolicy(),
    );
    assert.equal((await readdir(join(sourceDirectory, 'modules'))).length, 9);
    if (presetRef.includes('aether-architect')) {
      assert.equal(result.manifest.buildId, '9837b7c8a8cdcc5e11f5094ef5b0307aa18790e11099860c283057a27e0f0e64');
    }
  });
}

test('incomplete, blocked, and substituted reviewed state fail before filesystem writes', async (context) => {
  const root = await workspace(context);
  const library = await loadCreatorLibrary(options());
  const incompleteDraft = createCreatorDraft({ catalogDigest: library.catalog.catalogDigest, creatorRef: 'creator:dom' });
  const incompletePreview = previewCreatorDraft({ draft: incompleteDraft, ...library });
  const incompleteSeal = buildCreatorReviewSeal({
    catalogDigest: library.catalog.catalogDigest,
    draftDigest: incompleteDraft.draftDigest,
    previewDigest: incompletePreview.previewDigest,
  });
  const base = {
    ...library,
    draft: incompleteDraft,
    preview: incompletePreview,
    reviewSeal: incompleteSeal,
    sourceDirectory: join(root, 'source'),
    outputDirectory: join(root, 'output'),
    expectedPolicyDigest,
  };
  await assert.rejects(() => finalizeCreatorDraft(base), /creator draft is not ready/);
  await assert.rejects(() => access(base.sourceDirectory));
  await assert.rejects(() => access(base.outputDirectory));

  const state = await ready();
  const attacks = [
    { reviewSeal: { ...state.reviewSeal, previewDigest: 'f'.repeat(64) } },
    { reviewSeal: { ...state.reviewSeal, sealDigest: 'f'.repeat(64) } },
    { draft: { ...state.draft, draftDigest: 'f'.repeat(64) } },
    { catalog: { ...state.catalog, catalogDigest: 'f'.repeat(64) } },
    { expectedPolicyDigest: 'f'.repeat(64) },
  ];
  for (let index = 0; index < attacks.length; index += 1) {
    const sourceDirectory = join(root, `attack-source-${index}`);
    const outputDirectory = join(root, `attack-output-${index}`);
    await assert.rejects(() => finalizeCreatorDraft({
      ...base,
      ...state,
      ...attacks[index],
      sourceDirectory,
      outputDirectory,
    }));
    await assert.rejects(() => access(sourceDirectory));
    await assert.rejects(() => access(outputDirectory));
  }
});

test('unexpected target entries and changed reviewed libraries fail closed', async (context) => {
  const root = await workspace(context);
  const state = await ready();
  const occupiedSource = join(root, 'occupied-source');
  await mkdir(occupiedSource);
  await writeFile(join(occupiedSource, 'surprise.txt'), 'unexpected', 'utf8');
  await assert.rejects(() => finalizeCreatorDraft({
    ...state,
    sourceDirectory: occupiedSource,
    outputDirectory: join(root, 'unused-output'),
    expectedPolicyDigest,
  }), /creator finalization target is not empty/);

  const libraryRoot = join(root, 'library');
  await mkdir(libraryRoot);
  await Promise.all([
    cp(new URL('creation/modules/', fixtureRoot), join(libraryRoot, 'modules'), { recursive: true }),
    cp(new URL('creator/expressions/', fixtureRoot), join(libraryRoot, 'expressions'), { recursive: true }),
    cp(new URL('creator/presets/', fixtureRoot), join(libraryRoot, 'presets'), { recursive: true }),
    cp(new URL('creation/creation-policy.json', fixtureRoot), join(libraryRoot, 'policy.json')),
  ]);
  const localOptions = options({
    policyPath: join(libraryRoot, 'policy.json'),
    moduleDirectory: join(libraryRoot, 'modules'),
    expressionDirectory: join(libraryRoot, 'expressions'),
    presetDirectory: join(libraryRoot, 'presets'),
  });
  const local = await ready('preset:aether-architect@1.0.0', localOptions);
  const expressionPath = join(libraryRoot, 'expressions', 'aether-architect.json');
  const expression = JSON.parse(await readFile(expressionPath, 'utf8'));
  expression.narrativeDescription = 'changed after review';
  await writeFile(expressionPath, JSON.stringify(expression), 'utf8');
  const sourceDirectory = join(root, 'stale-source');
  const outputDirectory = join(root, 'stale-output');
  await assert.rejects(() => finalizeCreatorDraft({
    ...local,
    sourceDirectory,
    outputDirectory,
    expectedPolicyDigest,
  }), /creator source library changed after review/);
  await assert.rejects(() => access(sourceDirectory));
  await assert.rejects(() => access(outputDirectory));
});

test('a source race after freshness verification cannot enter the finalized build', async (context) => {
  const root = await workspace(context, 'godagent-creator-race-');
  const libraryRoot = join(root, 'library');
  await mkdir(libraryRoot);
  await Promise.all([
    cp(new URL('creation/modules/', fixtureRoot), join(libraryRoot, 'modules'), { recursive: true }),
    cp(new URL('creator/expressions/', fixtureRoot), join(libraryRoot, 'expressions'), { recursive: true }),
    cp(new URL('creator/presets/', fixtureRoot), join(libraryRoot, 'presets'), { recursive: true }),
    cp(new URL('creation/creation-policy.json', fixtureRoot), join(libraryRoot, 'policy.json')),
  ]);
  const localOptions = options({
    policyPath: join(libraryRoot, 'policy.json'),
    moduleDirectory: join(libraryRoot, 'modules'),
    expressionDirectory: join(libraryRoot, 'expressions'),
    presetDirectory: join(libraryRoot, 'presets'),
  });
  const state = await ready('preset:aether-architect@1.0.0', localOptions);
  const personalityPath = join(libraryRoot, 'modules', 'personality.json');
  const racingLoader = {
    ...state.sourceLoader,
    async verifyCurrent() {
      await state.sourceLoader.verifyCurrent();
      const personality = JSON.parse(await readFile(personalityPath, 'utf8'));
      personality.provenance.source = 'changed after the freshness check';
      await writeFile(personalityPath, JSON.stringify(personality), 'utf8');
      return true;
    },
  };
  const sourceDirectory = join(root, 'source');
  const outputDirectory = join(root, 'output');
  const result = await finalizeCreatorDraft({
    ...state,
    sourceLoader: racingLoader,
    sourceDirectory,
    outputDirectory,
    expectedPolicyDigest,
  });
  assert.equal(result.manifest.buildId, '9837b7c8a8cdcc5e11f5094ef5b0307aa18790e11099860c283057a27e0f0e64');
  const finalizedPersonality = JSON.parse(await readFile(join(sourceDirectory, 'modules', 'personality.json'), 'utf8'));
  assert.equal(finalizedPersonality.provenance.source, 'canonical creation fixture');
});
