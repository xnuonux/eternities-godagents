import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { compileCreation, verifyCreationBuild } from '../creation/compile.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import { previewCreatorDraft } from './preview.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

function sealProjection(seal) {
  return {
    schemaVersion: seal.schemaVersion,
    catalogDigest: seal.catalogDigest,
    draftDigest: seal.draftDigest,
    previewDigest: seal.previewDigest,
  };
}

function assertSeal(seal) {
  try {
    assertSchema('creator-review-seal', seal);
    for (const key of ['catalogDigest', 'draftDigest', 'previewDigest', 'sealDigest']) {
      if (!DIGEST.test(seal[key])) throw new TypeError();
    }
    if (sha256Value(sealProjection(seal)) !== seal.sealDigest) throw new TypeError();
    return seal;
  } catch {
    throw new TypeError('creator review seal is invalid');
  }
}

async function assertEmptyTarget(path) {
  try {
    if ((await readdir(path)).length !== 0) throw new TypeError('creator finalization target is not empty');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}

export function buildCreatorReviewSeal({ catalogDigest, draftDigest, previewDigest }) {
  const unsigned = { schemaVersion: 1, catalogDigest, draftDigest, previewDigest };
  const seal = { ...unsigned, sealDigest: sha256Value(unsigned) };
  assertSeal(seal);
  return deepFreeze(structuredClone(seal));
}

export async function finalizeCreatorDraft({
  draft,
  catalog,
  sourceLoader,
  reviewSeal,
  sourceDirectory,
  outputDirectory,
  policyPath,
  expectedPolicyDigest,
  moduleDirectory,
}) {
  if (typeof sourceDirectory !== 'string' || typeof outputDirectory !== 'string'
      || resolve(sourceDirectory) === resolve(outputDirectory)) {
    throw new TypeError('creator finalization directories are invalid');
  }
  const preview = previewCreatorDraft({ draft, catalog, sourceLoader });
  if (preview.status !== 'ready') throw new TypeError('creator draft is not ready');
  const acceptedSeal = assertSeal(reviewSeal);
  if (acceptedSeal.catalogDigest !== catalog.catalogDigest
      || acceptedSeal.draftDigest !== draft.draftDigest
      || acceptedSeal.previewDigest !== preview.previewDigest) {
    throw new TypeError('creator review seal does not match current state');
  }
  if (expectedPolicyDigest !== catalog.policyDigest) {
    throw new TypeError('creator policy digest pin mismatch');
  }
  if (typeof sourceLoader.verifyCurrent !== 'function') {
    throw new TypeError('creator source freshness verifier is required');
  }
  await sourceLoader.verifyCurrent();
  await assertEmptyTarget(sourceDirectory);
  await assertEmptyTarget(outputDirectory);

  await mkdir(sourceDirectory, { recursive: true });
  const candidatePath = join(sourceDirectory, 'creation-candidate.json');
  const expressionPath = join(sourceDirectory, 'expression-overlay.json');
  await writeFile(candidatePath, jsonBytes(preview.candidate), 'utf8');
  await writeFile(expressionPath, jsonBytes(preview.expression), 'utf8');

  const compiled = await compileCreation({
    candidatePath,
    policyPath,
    expectedPolicyDigest,
    expressionPath,
    moduleDirectory,
    outputDir: outputDirectory,
  });
  const manifest = await verifyCreationBuild(outputDirectory, { expectedPolicyDigest });
  if (manifest.buildId !== compiled.manifest.buildId || manifest.genomeDigest !== preview.genomeDigest) {
    throw new TypeError('finalized creation differs from reviewed preview');
  }
  return deepFreeze(structuredClone({
    reviewSeal: acceptedSeal,
    sourceDirectory,
    outputDirectory,
    manifest,
  }));
}

