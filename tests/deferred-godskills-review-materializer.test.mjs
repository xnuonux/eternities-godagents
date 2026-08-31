import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
} from '../src/runtime/mission-phase-contracts.mjs';
import {
  createDeferredGodskillsReviewMaterializer,
  verifyDeferredGodskillsReviewPackage,
} from '../src/skills/deferred-review-materializer.mjs';
import {
  buildReviewAdmission,
  buildReviewGodskillsBinding,
} from './helpers/mission-review-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';
const releasePin = (overrides = {}) => pinnedGodskillsReviewRelease(godskillsRoot, overrides);

async function setup({ maximumMaterializedBytes = 65536, io: suppliedIo } = {}) {
  const reads = [];
  const io = suppliedIo ?? {
    async readFile(path) {
      reads.push(String(path).replaceAll('\\', '/'));
      return readFile(path);
    },
    realpath,
  };
  const materializer = await createDeferredGodskillsReviewMaterializer({
    releasePin: releasePin(),
    maximumMaterializedBytes,
    io,
  });
  const constructionReads = [...reads];
  const manifest = JSON.parse(await readFile(`${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`, 'utf8'));
  const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
  const missionId = 'mission-deferred-review-materializer';
  const binding = buildReviewGodskillsBinding(missionId, {
    id: capability.id,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
    releaseDigest: materializer.releaseDigest,
    activationTrustRootDigest: materializer.activationTrustRootDigest,
  });
  const admission = buildReviewAdmission(missionId, { godskillsBinding: binding });
  const descriptor = buildMissionExecutorDescriptor({ executorId: 'review-materializer-test-v1', phase: 'review' });
  reads.length = 0;
  return { reads, constructionReads, io, materializer, capability, admission, descriptor };
}

function reviewRequest({ admission, descriptor, round, subject, priorReview = null }) {
  const subjectDigest = sha256Text(canonicalJson(subject));
  const inputs = round === 1
    ? [
      { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
      { role: 'subject', artifactDigest: subjectDigest },
    ]
    : [
      { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
      { role: 'prior-review', artifactDigest: sha256Text(canonicalJson(priorReview)) },
      { role: 'revision', artifactDigest: subjectDigest },
      { role: 'subject', artifactDigest: subjectDigest },
    ];
  return buildMissionPhaseRequest({
    admission,
    phase: 'review',
    round,
    descriptor,
    inputs,
    maxCompletionTokens: admission.budgets.reviewCompletionTokensPerRound,
  });
}

const native = Object.freeze({ schemaVersion: 1, artifactType: 'native', content: 'native subject for exact review' });
const firstReview = Object.freeze({
  schemaVersion: 1,
  artifactType: 'review',
  subjectDigest: sha256Text(canonicalJson(native)),
  recommendation: 'revise',
  findings: [{ id: 'proof-gap', severity: 'important', required: true, message: 'bind the recovery proof' }],
  summary: 'one bounded repair is required',
});
const revision = Object.freeze({
  schemaVersion: 1,
  artifactType: 'revision',
  nativeArtifactDigest: sha256Text(canonicalJson(native)),
  reviewArtifactDigest: sha256Text(canonicalJson(firstReview)),
  addressedFindingIds: ['proof-gap'],
  content: 'revision with exact recovery proof',
});

test('construction verifies release metadata without reading deferred skill bodies', async () => {
  const { constructionReads, materializer, capability } = await setup();
  assert.match(materializer.releaseDigest, /^[a-f0-9]{64}$/);
  assert.match(materializer.materializerDigest, /^[a-f0-9]{64}$/);
  assert.equal(constructionReads.includes(`${godskillsRoot}/${capability.entrypoint.path}`), false);
  assert.equal(constructionReads.includes(`${godskillsRoot}/${capability.contract.path}`), false);
});

test('round one opens only exact deferred bodies and emits one verified authority-empty package', async () => {
  const { reads, materializer, capability, admission, descriptor } = await setup();
  const request = reviewRequest({ admission, descriptor, round: 1, subject: native });
  const packageValue = await materializer.materialize({
    admission,
    request,
    descriptor,
    subject: native,
    priorReview: null,
  });

  assert.deepEqual(reads.sort(), [
    `${godskillsRoot}/${capability.contract.path}`,
    `${godskillsRoot}/${capability.entrypoint.path}`,
  ].sort());
  assert.deepEqual(verifyDeferredGodskillsReviewPackage(packageValue), packageValue);
  assert.equal(packageValue.round, 1);
  assert.equal(packageValue.subject.artifactDigest, sha256Text(canonicalJson(native)));
  assert.equal(packageValue.priorReview, null);
  assert.equal(packageValue.capabilities[0].id, 'eternities-aegis');
  assert.match(packageValue.capabilities[0].entrypoint, /name:\s*eternities-aegis/);
  assert.equal(JSON.parse(packageValue.capabilities[0].contractText).name, 'eternities-aegis');
  assert.equal(Object.hasOwn(packageValue.capabilities[0], 'contract'), false);
  assert.deepEqual(Object.values(packageValue.authority), [false, false, false, false, false, false, false]);
  assert.equal(JSON.stringify(packageValue).includes(godskillsRoot), false);
});

test('round two binds the exact revision subject and prior review', async () => {
  const { materializer, admission, descriptor } = await setup();
  const request = reviewRequest({ admission, descriptor, round: 2, subject: revision, priorReview: firstReview });
  const packageValue = await materializer.materialize({
    admission,
    request,
    descriptor,
    subject: revision,
    priorReview: firstReview,
  });

  assert.equal(packageValue.round, 2);
  assert.equal(packageValue.subject.artifact.artifactType, 'revision');
  assert.equal(packageValue.priorReview.artifact.artifactType, 'review');
  assert.equal(packageValue.subject.artifactDigest, request.inputs.find(({ role }) => role === 'subject').artifactDigest);
  assert.equal(packageValue.priorReview.artifactDigest, request.inputs.find(({ role }) => role === 'prior-review').artifactDigest);
});

test('changed request context, release identity, and authority-shaped artifacts fail before disclosure', async () => {
  const { reads, materializer, admission, descriptor } = await setup();
  const request = reviewRequest({ admission, descriptor, round: 1, subject: native });
  const changedSubject = { ...native, content: 'substituted subject' };
  await assert.rejects(
    materializer.materialize({ admission, request, descriptor, subject: changedSubject, priorReview: null }),
    /subject.*digest|request.*subject/i,
  );
  assert.deepEqual(reads, []);

  const authorityShaped = { ...native, realmEffects: 1 };
  await assert.rejects(
    materializer.materialize({ admission, request, descriptor, subject: authorityShaped, priorReview: null }),
    /artifact|fields|authority/i,
  );
  assert.deepEqual(reads, []);

  const changedAdmission = structuredClone(admission);
  changedAdmission.godskills.receipt.releaseDigest = 'f'.repeat(64);
  await assert.rejects(
    materializer.materialize({ admission: changedAdmission, request, descriptor, subject: native, priorReview: null }),
    /admission|digest|release/i,
  );
  assert.deepEqual(reads, []);
});

test('round context, output ceiling, and package mutation fail closed', async () => {
  const regular = await setup();
  const request = reviewRequest({ admission: regular.admission, descriptor: regular.descriptor, round: 1, subject: native });
  await assert.rejects(
    regular.materializer.materialize({
      admission: regular.admission,
      request,
      descriptor: regular.descriptor,
      subject: native,
      priorReview: firstReview,
    }),
    /round one|prior review/i,
  );

  const oversizedReview = {
    ...firstReview,
    summary: 'x'.repeat(8150),
  };
  const oversizedRevision = {
    ...revision,
    reviewArtifactDigest: sha256Text(canonicalJson(oversizedReview)),
  };
  const oversizedRequest = reviewRequest({
    admission: regular.admission,
    descriptor: regular.descriptor,
    round: 2,
    subject: oversizedRevision,
    priorReview: oversizedReview,
  });
  await assert.rejects(
    regular.materializer.materialize({
      admission: regular.admission,
      request: oversizedRequest,
      descriptor: regular.descriptor,
      subject: oversizedRevision,
      priorReview: oversizedReview,
    }),
    /prior review.*byte ceiling/i,
  );
  assert.deepEqual(regular.reads, []);

  const tiny = await setup({ maximumMaterializedBytes: 128 });
  const tinyRequest = reviewRequest({ admission: tiny.admission, descriptor: tiny.descriptor, round: 1, subject: native });
  await assert.rejects(
    tiny.materializer.materialize({
      admission: tiny.admission,
      request: tinyRequest,
      descriptor: tiny.descriptor,
      subject: native,
      priorReview: null,
    }),
    /byte ceiling/i,
  );

  const packageValue = await regular.materializer.materialize({
    admission: regular.admission,
    request,
    descriptor: regular.descriptor,
    subject: native,
    priorReview: null,
  });
  const changed = structuredClone(packageValue);
  changed.subject.artifact.content = 'mutated after materialization';
  assert.throws(() => verifyDeferredGodskillsReviewPackage(changed), /digest|package/i);
});

test('descriptor substitution and unknown materialization fields fail before disclosure', async () => {
  const { reads, materializer, admission, descriptor } = await setup();
  const request = reviewRequest({ admission, descriptor, round: 1, subject: native });
  const changedDescriptor = buildMissionExecutorDescriptor({
    executorId: 'substituted-review-materializer-v1',
    phase: 'review',
  });
  await assert.rejects(
    materializer.materialize({
      admission,
      request,
      descriptor: changedDescriptor,
      subject: native,
      priorReview: null,
    }),
    /descriptor|request/i,
  );
  assert.deepEqual(reads, []);

  await assert.rejects(
    materializer.materialize({
      admission,
      request,
      descriptor,
      subject: native,
      priorReview: null,
      providerConfig: { model: 'unbound' },
    }),
    /fields/i,
  );
  assert.deepEqual(reads, []);
});

test('a coherently rebound stale capability descriptor fails before body disclosure', async () => {
  const regular = await setup();
  const missionId = 'mission-stale-deferred-capability';
  const staleBinding = buildReviewGodskillsBinding(missionId, {
    id: regular.capability.id,
    entrypointSha256: 'f'.repeat(64),
    contractSha256: regular.capability.contract.sha256,
    releaseDigest: regular.materializer.releaseDigest,
    activationTrustRootDigest: regular.materializer.activationTrustRootDigest,
  });
  const admission = buildReviewAdmission(missionId, { godskillsBinding: staleBinding });
  const descriptor = buildMissionExecutorDescriptor({ executorId: 'stale-capability-review-v1', phase: 'review' });
  const request = reviewRequest({ admission, descriptor, round: 1, subject: native });
  regular.reads.length = 0;

  await assert.rejects(
    regular.materializer.materialize({ admission, request, descriptor, subject: native, priorReview: null }),
    /capability.*verified release|binding/i,
  );
  assert.deepEqual(regular.reads, []);
});

test('every deferred descriptor is validated before the first selected body is opened', async () => {
  const regular = await setup();
  const manifest = JSON.parse(await readFile(
    `${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`,
    'utf8',
  ));
  const laterCapability = manifest.capabilities.find(({ id }) => id === 'eternities-oracle');
  const missionId = 'mission-multi-capability-preflight';
  const binding = buildReviewGodskillsBinding(missionId, {
    selections: [
      {
        id: regular.capability.id,
        entrypointSha256: regular.capability.entrypoint.sha256,
        contractSha256: regular.capability.contract.sha256,
      },
      {
        id: laterCapability.id,
        entrypointSha256: 'e'.repeat(64),
        contractSha256: laterCapability.contract.sha256,
      },
    ],
    releaseDigest: regular.materializer.releaseDigest,
    activationTrustRootDigest: regular.materializer.activationTrustRootDigest,
  });
  const admission = buildReviewAdmission(missionId, { godskillsBinding: binding });
  const descriptor = buildMissionExecutorDescriptor({ executorId: 'multi-capability-review-v1', phase: 'review' });
  const request = reviewRequest({ admission, descriptor, round: 1, subject: native });
  regular.reads.length = 0;

  await assert.rejects(
    regular.materializer.materialize({ admission, request, descriptor, subject: native, priorReview: null }),
    /capability.*verified release|binding/i,
  );
  assert.deepEqual(regular.reads, []);
});

test('selected body drift after construction fails at the exact disclosure boundary', async () => {
  const bodyReads = [];
  let drift = false;
  const io = {
    async readFile(path) {
      const normalized = String(path).replaceAll('\\', '/');
      const bytes = await readFile(path);
      if (drift && normalized.endsWith('/skills/eternities-aegis/SKILL.md')) {
        bodyReads.push(normalized);
        return Buffer.concat([bytes, Buffer.from('\npost-verification drift\n')]);
      }
      return bytes;
    },
    realpath,
  };
  const { materializer, admission, descriptor } = await setup({ io });
  const request = reviewRequest({ admission, descriptor, round: 1, subject: native });
  drift = true;

  await assert.rejects(
    materializer.materialize({ admission, request, descriptor, subject: native, priorReview: null }),
    /entrypoint.*digest mismatch/i,
  );
  assert.equal(bodyReads.length, 1);
});

test('independent materializations reproduce exact bytes and reject recomputed extra fields', async () => {
  const left = await setup();
  const right = await setup();
  const leftRequest = reviewRequest({
    admission: left.admission,
    descriptor: left.descriptor,
    round: 1,
    subject: native,
  });
  const rightRequest = reviewRequest({
    admission: right.admission,
    descriptor: right.descriptor,
    round: 1,
    subject: native,
  });
  const leftPackage = await left.materializer.materialize({
    admission: left.admission,
    request: leftRequest,
    descriptor: left.descriptor,
    subject: native,
    priorReview: null,
  });
  const rightPackage = await right.materializer.materialize({
    admission: right.admission,
    request: rightRequest,
    descriptor: right.descriptor,
    subject: native,
    priorReview: null,
  });
  assert.equal(canonicalJson(leftPackage), canonicalJson(rightPackage));

  const changed = structuredClone(leftPackage);
  changed.providerConfig = { model: 'unbound' };
  const { packageDigest: _oldDigest, ...unsigned } = changed;
  changed.packageDigest = sha256Text(canonicalJson(unsigned));
  assert.throws(() => verifyDeferredGodskillsReviewPackage(changed), /additionalProperties|fields/i);
});
