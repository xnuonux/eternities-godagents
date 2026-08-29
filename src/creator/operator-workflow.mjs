import { loadCreatorLibrary } from './catalog.mjs';
import { createCreatorDraft } from './draft.mjs';
import { buildCreatorReviewSeal, finalizeCreatorDraft } from './finalize.mjs';
import { replayCreatorPreset } from './preset.mjs';
import { previewCreatorDraft } from './preview.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const PRESET_REF = /^preset:[a-z0-9][a-z0-9._-]{0,127}@[a-z0-9][a-z0-9._-]{0,127}$/;
const CREATOR_REF = /^[a-z0-9][a-z0-9:._-]{0,127}$/;
const MESSAGES = Object.freeze({
  'library-invalid': 'creator library is invalid',
  'preset-unavailable': 'creator preset is unavailable',
  'preview-digest-mismatch': 'creator preview digest does not match current review',
  'preview-not-ready': 'creator preview is not ready',
  'workflow-input-invalid': 'creator workflow input is invalid',
});

export class CreatorWorkflowError extends Error {
  constructor(code) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('creator workflow error code is invalid');
    super(MESSAGES[code]);
    this.name = 'CreatorWorkflowError';
    this.code = code;
  }
}

function fail(code) {
  throw new CreatorWorkflowError(code);
}

function libraryOptions(options) {
  if (!options || typeof options !== 'object' || !DIGEST.test(options.policyDigest)) {
    fail('workflow-input-invalid');
  }
  return {
    policyPath: options.policy,
    expectedPolicyDigest: options.policyDigest,
    moduleDirectory: options.modules,
    expressionDirectory: options.expressions,
    presetDirectory: options.presets,
  };
}

async function loadLibrary(options) {
  try {
    return await loadCreatorLibrary(libraryOptions(options));
  } catch (error) {
    if (error instanceof CreatorWorkflowError) throw error;
    fail('library-invalid');
  }
}

function validateReviewInput({ preset, creator }) {
  if (!PRESET_REF.test(preset) || !CREATOR_REF.test(creator)) fail('workflow-input-invalid');
}

async function buildReview(options) {
  validateReviewInput(options);
  const library = await loadLibrary(options);
  let preset;
  try {
    preset = library.sourceLoader.resolvePreset(options.preset);
  } catch {
    fail('preset-unavailable');
  }
  let draft;
  try {
    const initial = createCreatorDraft({
      catalogDigest: library.catalog.catalogDigest,
      creatorRef: options.creator,
    });
    draft = replayCreatorPreset({ draft: initial, preset });
  } catch {
    fail('workflow-input-invalid');
  }
  const preview = previewCreatorDraft({ draft, ...library });
  return Object.freeze({ ...library, draft, preview });
}

function projectReview({ presetRef, preview }) {
  const output = {
    schemaVersion: 1,
    status: preview.status,
    presetRef,
    catalogDigest: preview.catalogDigest,
    draftDigest: preview.draftDigest,
    previewDigest: preview.previewDigest,
    selection: preview.selection,
    issues: preview.issues,
    excludedFromAuthority: preview.excludedFromAuthority,
  };
  if (preview.status === 'ready') {
    output.derivedAttributes = preview.derivedAttributes;
    output.genomeDigest = preview.genomeDigest;
  }
  return Object.freeze(structuredClone(output));
}

export async function loadOperatorCatalog(options) {
  return (await loadLibrary(options)).catalog;
}

export async function previewOperatorPreset(options) {
  const review = await buildReview(options);
  return projectReview({ presetRef: options.preset, preview: review.preview });
}

export async function finalizeOperatorPreset(options) {
  if (!options || !DIGEST.test(options.expectedPreviewDigest)
      || typeof options.sourceDir !== 'string' || options.sourceDir.length === 0
      || typeof options.outputDir !== 'string' || options.outputDir.length === 0) {
    fail('workflow-input-invalid');
  }
  const review = await buildReview(options);
  if (review.preview.status !== 'ready') fail('preview-not-ready');
  if (review.preview.previewDigest !== options.expectedPreviewDigest) fail('preview-digest-mismatch');
  const reviewSeal = buildCreatorReviewSeal({
    catalogDigest: review.catalog.catalogDigest,
    draftDigest: review.draft.draftDigest,
    previewDigest: review.preview.previewDigest,
  });
  const result = await finalizeCreatorDraft({
    draft: review.draft,
    catalog: review.catalog,
    sourceLoader: review.sourceLoader,
    reviewSeal,
    sourceDirectory: options.sourceDir,
    outputDirectory: options.outputDir,
    expectedPolicyDigest: options.policyDigest,
  });
  return Object.freeze({
    schemaVersion: 1,
    status: 'finalized',
    catalogDigest: review.catalog.catalogDigest,
    draftDigest: review.draft.draftDigest,
    previewDigest: review.preview.previewDigest,
    reviewSealDigest: reviewSeal.sealDigest,
    creationBuildId: result.manifest.buildId,
    genomeDigest: result.manifest.genomeDigest,
  });
}
