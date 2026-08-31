import { execFile } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
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
} from '../tests/helpers/mission-review-fixture.mjs';
import {
  assertCommit,
  gitText,
  headCommit,
  historicalAtCommit,
  manifestAtCommit,
  requireCleanExcept,
  resolveSourceCommit,
  runTests,
} from './lib/certification-support.mjs';
import { pinnedGodskillsReviewRelease } from './lib/pinned-godskills-review-release.mjs';

const execFileAsync = promisify(execFile);
const certificationId = 'deferred-godskills-review-materializer-v1';
const protocolId = 'eternities-godskills-deferred-review-package-v1';
const fixturePath = 'fixtures/deferred-godskills-review-materializer-v1.json';
const receiptPath = 'receipts/deferred-godskills-review-materializer-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-deferred-godskills-review-materializer-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-deferred-godskills-review-materializer-v1.md';
const certificationPath = 'docs/deferred-godskills-review-materializer-v1-certification.md';
const defaultGodskillsRoot = 'C:/dev/eternities-godskills';
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/codex-bound-turn-v1.json',
  'receipts/codex-recoverable-turn-coordinator-v1.json',
  'receipts/codex-recoverable-turn-journal-v1.json',
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-specialist-preference-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/resumable-mission-review-kernel-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'schemas/deferred-godskills-review-package.schema.json',
  'scripts/build-deferred-review-materializer-v1-receipt.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  specificationPath,
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/skills/deferred-review-materializer.mjs',
  'src/skills/release-verifier.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/deferred-godskills-review-materializer-certification.test.mjs',
  'tests/deferred-godskills-review-materializer.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/helpers/mission-review-fixture.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/deferred-godskills-review-materializer.test.mjs',
  'tests/godskills-adaptive-activation.test.mjs',
  'tests/godskills-mission-binder.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([
  certificationPath,
  receiptPath,
  'src/certification/verify-ledger.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/release-lineage.test.mjs',
]);

const requirementEvidence = Object.freeze({
  'DRM-001': ['release construction verifies pinned roots while selected review bodies remain unopened'],
  'DRM-002': ['round one opens only the exact selected entrypoint and capability contract'],
  'DRM-003': ['round two binds the exact revision and its exact prior review'],
  'DRM-004': ['changed release, admission, request, descriptor, subject, and prior-review context fail closed'],
  'DRM-005': ['the complete deferred descriptor set is validated before the first body disclosure'],
  'DRM-006': ['unknown fields, authority-shaped artifacts, body drift, and byte overflow fail closed'],
  'DRM-007': ['independent materializations reproduce exact package bytes and logical digest'],
  'DRM-008': ['focused integration, full repository, historical receipt, and lineage gates remain required'],
  'DRM-009': ['caller-preloaded and caller-mutated artifact caches cannot replace verified release state'],
});

const proofLimits = Object.freeze([
  'no-live-model-or-provider-call',
  'no-review-quality-improvement-claim',
  'no-arbitrary-adaptive-evaluator-package-execution',
  'no-standalone-proof-of-durable-journal-commitment',
  'no-revision-executor',
  'no-default-vessel-or-codex-task-integration',
  'no-provider-credential-or-model-route',
  'no-realm-action-or-compensation',
  'no-continuity-admission-or-personal-keel-write',
  'no-lunari-inspiration-or-soul-activation',
  'no-independent-review',
  'release-digest-remains-bound-to-the-local-configured-repository-root',
]);

function normalizePath(value) {
  return String(value).replaceAll('\\', '/');
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

async function gitCommit(repositoryRoot) {
  const { stdout } = await execFileAsync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const commit = stdout.trim();
  if (!COMMIT.test(commit)) throw new Error('Godskills source commit is invalid');
  return commit;
}

export async function buildDeterministicDeferredReviewMaterializerFixture({
  godskillsRoot = process.env.ETERNITIES_GODSKILLS_ROOT ?? defaultGodskillsRoot,
} = {}) {
  const reads = [];
  const io = {
    async readFile(path) {
      reads.push(normalizePath(path));
      return readFile(path);
    },
    realpath: async (path) => normalizePath(await realpath(path)),
  };
  const materializer = await createDeferredGodskillsReviewMaterializer({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    maximumMaterializedBytes: 65_536,
    io,
  });
  const constructionReads = [...reads];
  const manifest = JSON.parse(await readFile(
    join(godskillsRoot, 'artifacts', 'portable-capabilities', 'manifest.v1.json'),
    'utf8',
  ));
  const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
  if (!capability) throw new Error('certification capability is absent from the pinned Godskills release');
  const selectedPaths = [capability.entrypoint.path, capability.contract.path]
    .map((path) => normalizePath(join(godskillsRoot, ...path.split('/'))))
    .sort();
  const missionId = 'mission-deferred-review-materializer-certification';
  const binding = buildReviewGodskillsBinding(missionId, {
    id: capability.id,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
    releaseDigest: materializer.releaseDigest,
    activationTrustRootDigest: materializer.activationTrustRootDigest,
  });
  const admission = buildReviewAdmission(missionId, { godskillsBinding: binding });
  const descriptor = buildMissionExecutorDescriptor({
    executorId: 'deferred-review-materializer-certification-v1',
    phase: 'review',
  });
  const native = {
    schemaVersion: 1,
    artifactType: 'native',
    content: 'certified native subject before deferred Godskills review',
  };
  const firstReview = {
    schemaVersion: 1,
    artifactType: 'review',
    subjectDigest: sha256Text(canonicalJson(native)),
    recommendation: 'revise',
    findings: [{
      id: 'certification-proof',
      severity: 'important',
      required: true,
      message: 'bind the exact materialization proof',
    }],
    summary: 'one bounded certification repair is required',
  };
  const revision = {
    schemaVersion: 1,
    artifactType: 'revision',
    nativeArtifactDigest: sha256Text(canonicalJson(native)),
    reviewArtifactDigest: sha256Text(canonicalJson(firstReview)),
    addressedFindingIds: ['certification-proof'],
    content: 'certified revision with exact materialization proof',
  };

  const requestOne = reviewRequest({ admission, descriptor, round: 1, subject: native });
  reads.length = 0;
  const roundOne = await materializer.materialize({
    admission,
    request: requestOne,
    descriptor,
    subject: native,
    priorReview: null,
  });
  const roundOneReads = [...reads].sort();

  const requestTwo = reviewRequest({
    admission,
    descriptor,
    round: 2,
    subject: revision,
    priorReview: firstReview,
  });
  reads.length = 0;
  const roundTwo = await materializer.materialize({
    admission,
    request: requestTwo,
    descriptor,
    subject: revision,
    priorReview: firstReview,
  });
  const roundTwoReads = [...reads].sort();

  const repeatedMaterializer = await createDeferredGodskillsReviewMaterializer({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    maximumMaterializedBytes: 65_536,
  });
  const repeatedRoundOne = await repeatedMaterializer.materialize({
    admission,
    request: requestOne,
    descriptor,
    subject: native,
    priorReview: null,
  });
  verifyDeferredGodskillsReviewPackage(roundOne);
  verifyDeferredGodskillsReviewPackage(roundTwo);
  const roundOneText = canonicalJson(roundOne);
  const roundTwoText = canonicalJson(roundTwo);
  const rootText = normalizePath(godskillsRoot);
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    godskills: {
      commit: await gitCommit(godskillsRoot),
      releaseDigest: materializer.releaseDigest,
      activationTrustRootDigest: materializer.activationTrustRootDigest,
      capability: {
        id: capability.id,
        entrypointSha256: capability.entrypoint.sha256,
        contractSha256: capability.contract.sha256,
      },
    },
    materializer: {
      materializerDigest: materializer.materializerDigest,
      maximumMaterializedBytes: materializer.maximumMaterializedBytes,
    },
    roundOne: {
      requestDigest: requestOne.requestDigest,
      packageDigest: roundOne.packageDigest,
      packageBytes: Buffer.byteLength(roundOneText, 'utf8'),
      subjectDigest: roundOne.subject.artifactDigest,
    },
    roundTwo: {
      requestDigest: requestTwo.requestDigest,
      packageDigest: roundTwo.packageDigest,
      packageBytes: Buffer.byteLength(roundTwoText, 'utf8'),
      subjectDigest: roundTwo.subject.artifactDigest,
      priorReviewDigest: roundTwo.priorReview.artifactDigest,
    },
    disclosure: {
      selectedBodyPaths: capability.id === 'eternities-aegis' ? selectedPaths.map((path) => path.slice(rootText.length + 1)) : [],
      constructionSelectedBodyReads: constructionReads.filter((path) => selectedPaths.includes(path)).length,
      roundOneReads: roundOneReads.map((path) => path.slice(rootText.length + 1)),
      roundTwoReads: roundTwoReads.map((path) => path.slice(rootText.length + 1)),
    },
    assertions: {
      constructionBodyFree: constructionReads.every((path) => !selectedPaths.includes(path)),
      roundOneExactDisclosure: sameArray(roundOneReads, selectedPaths),
      roundTwoExactDisclosure: sameArray(roundTwoReads, selectedPaths),
      roundOneReproduced: canonicalJson(roundOne) === canonicalJson(repeatedRoundOne),
      authorityExpansions: Object.values(roundOne.authority).filter(Boolean).length
        + Object.values(roundTwo.authority).filter(Boolean).length,
      realmEffects: Number(roundOne.authority.realmEffects) + Number(roundTwo.authority.realmEffects),
      filesystemRootsDisclosed: Number(roundOneText.includes(rootText)) + Number(roundTwoText.includes(rootText)),
      roundTwoContextBound: roundTwo.subject.artifact.reviewArtifactDigest === roundTwo.priorReview.artifactDigest
        && roundTwo.subject.artifact.nativeArtifactDigest === roundTwo.priorReview.artifact.subjectDigest,
    },
  };
  return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} digest is invalid`);
}

function validateTestRuns(testRuns) {
  exactKeys(testRuns, ['focused', 'full'], 'test runs');
  for (const [name, run] of Object.entries(testRuns)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
  }
  if (testRuns.full.tests < testRuns.focused.tests) throw new Error('full test run is smaller than focused run');
}

function validateManifest(value, expectedPaths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!sameArray(value.paths, expectedPaths) || value.entries.length !== expectedPaths.length) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry ${index}`);
    if (entry.path !== expectedPaths[index] || !DIGEST.test(entry.sha256)
        || !Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry is invalid`);
  });
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function validateFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'materializer', 'roundOne', 'roundTwo',
    'disclosure', 'assertions', 'fixtureDigest',
  ], 'deferred review fixture');
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'deferred review fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== protocolId
      || sha256Value(unsigned) !== fixtureDigest) throw new Error('deferred review fixture digest mismatch');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('deferred review Godskills commit is invalid');
  for (const digest of [
    value.godskills.releaseDigest,
    value.godskills.activationTrustRootDigest,
    value.godskills.capability.entrypointSha256,
    value.godskills.capability.contractSha256,
    value.materializer.materializerDigest,
    value.roundOne.requestDigest,
    value.roundOne.packageDigest,
    value.roundOne.subjectDigest,
    value.roundTwo.requestDigest,
    value.roundTwo.packageDigest,
    value.roundTwo.subjectDigest,
    value.roundTwo.priorReviewDigest,
  ]) requireDigest(digest, 'deferred review fixture field');
  if (value.assertions.constructionBodyFree !== true
      || value.assertions.roundOneExactDisclosure !== true
      || value.assertions.roundTwoExactDisclosure !== true
      || value.assertions.roundOneReproduced !== true
      || value.assertions.roundTwoContextBound !== true
      || value.assertions.authorityExpansions !== 0
      || value.assertions.realmEffects !== 0
      || value.assertions.filesystemRootsDisclosed !== 0) {
    throw new Error('deferred review fixture assertions are not closed');
  }
  return value;
}

function validateSourceBoundary(value) {
  exactKeys(value, [
    'credentialImports', 'keelImports', 'modelTransportImports', 'providerImports', 'realmImports',
  ], 'source boundary');
  if (Object.values(value).some((count) => count !== 0)) throw new Error('source boundary widened');
}

function sourceBoundary(sourceText) {
  const specifiers = [...sourceText.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1].toLowerCase());
  const count = (pattern) => specifiers.filter((value) => pattern.test(value)).length;
  return {
    credentialImports: count(/credential|secret/),
    keelImports: count(/keel|continuity/),
    modelTransportImports: count(/cortex|executor|transport/),
    providerImports: count(/provider|http/),
    realmImports: count(/realm/),
  };
}

export function verifyDeferredReviewMaterializerCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'deferred review certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('deferred review certification identity mismatch');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan', 'sourceBoundary',
  ], 'deferred review certification source');
  if (!COMMIT.test(value.source.commit)) throw new Error('deferred review certification source commit is invalid');
  validateManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  validateManifest(value.source.testManifest, testFiles, 'test manifest');
  validateSourceBoundary(value.source.sourceBoundary);
  if (!sameArray(Object.keys(value.source.historicalReceiptDigests).sort(), historicalReceiptPaths)) {
    throw new Error('historical receipt set mismatch');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt'));
  exactKeys(value.source.specification, ['path', 'sha256'], 'specification');
  exactKeys(value.source.plan, ['path', 'sha256'], 'plan');
  if (value.source.specification.path !== specificationPath || value.source.plan.path !== planPath) {
    throw new Error('specification or plan path mismatch');
  }
  requireDigest(value.source.specification.sha256, 'specification');
  requireDigest(value.source.plan.sha256, 'plan');

  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions', 'measurements'], 'fixture binding');
  if (value.fixture.path !== fixturePath) throw new Error('fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'fixture file');
  requireDigest(value.fixture.logicalDigest, 'fixture logical');
  if (value.fixture.assertions.authorityExpansions !== 0
      || value.fixture.assertions.realmEffects !== 0
      || value.fixture.assertions.filesystemRootsDisclosed !== 0
      || value.fixture.assertions.constructionBodyFree !== true
      || value.fixture.assertions.roundOneExactDisclosure !== true
      || value.fixture.assertions.roundTwoExactDisclosure !== true
      || value.fixture.assertions.roundOneReproduced !== true
      || value.fixture.assertions.roundTwoContextBound !== true) {
    throw new Error('fixture binding assertions are invalid');
  }

  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'activationTrustRootDigest', 'capability',
  ], 'Godskills dependency');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('Godskills dependency commit is invalid');
  requireDigest(value.godskills.releaseDigest, 'Godskills release');
  requireDigest(value.godskills.activationTrustRootDigest, 'Godskills activation root');
  exactKeys(value.godskills.capability, [
    'id', 'entrypointSha256', 'contractSha256',
  ], 'Godskills capability');
  requireDigest(value.godskills.capability.entrypointSha256, 'Godskills capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'Godskills capability contract');

  if (!Array.isArray(value.requirements)
      || !sameArray(value.requirements.map(({ id }) => id), Object.keys(requirementEvidence))) {
    throw new Error('certification requirements are invalid');
  }
  value.requirements.forEach((row) => {
    exactKeys(row, ['id', 'status', 'evidence'], `requirement ${row.id}`);
    if (row.status !== 'pass' || !sameArray(row.evidence, requirementEvidence[row.id])) {
      throw new Error(`requirement ${row.id} evidence mismatch`);
    }
  });
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('proof limits mismatch');
  validateTestRuns(value.testRuns);
  exactKeys(value.metrics, [
    'authorityExpansions', 'filesystemRootsDisclosed', 'materializedPackages', 'realmEffects',
    'retainedInlineRegressions', 'selectedBodiesReadPerRound',
  ], 'certification metrics');
  if (value.metrics.authorityExpansions !== 0 || value.metrics.realmEffects !== 0
      || value.metrics.filesystemRootsDisclosed !== 0 || value.metrics.materializedPackages !== 2
      || value.metrics.selectedBodiesReadPerRound !== 2 || value.metrics.retainedInlineRegressions !== 12) {
    throw new Error('certification metrics are invalid');
  }
  exactKeys(value.review, [
    'mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions',
  ], 'certification review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !Array.isArray(value.review.retainedRegressions)
      || value.review.retainedRegressions.length !== 12) throw new Error('certification review is invalid');
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'deferred review certification receipt');
  if (sha256Value(unsigned) !== receiptDigest) throw new Error('deferred review certification receipt mismatch');
  return value;
}

export async function rebuildDeferredReviewMaterializerReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = validateFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const implementationManifest = await manifestAtCommit(repositoryRoot, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(repositoryRoot, sourceCommit, testFiles);
  const materializerSource = await gitText(
    repositoryRoot,
    sourceCommit,
    'src/skills/deferred-review-materializer.mjs',
  );
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(repositoryRoot, sourceCommit, historicalReceiptPaths),
      implementationManifest,
      testManifest,
      specification: {
        path: specificationPath,
        sha256: sha256Text(await gitText(repositoryRoot, sourceCommit, specificationPath)),
      },
      plan: {
        path: planPath,
        sha256: sha256Text(await gitText(repositoryRoot, sourceCommit, planPath)),
      },
      sourceBoundary: sourceBoundary(materializerSource),
    },
    godskills: structuredClone(fixture.godskills),
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      assertions: structuredClone(fixture.assertions),
      measurements: {
        roundOnePackageBytes: fixture.roundOne.packageBytes,
        roundTwoPackageBytes: fixture.roundTwo.packageBytes,
        selectedBodiesReadPerRound: fixture.disclosure.selectedBodyPaths.length,
      },
    },
    requirements: Object.entries(requirementEvidence).map(([id, evidence]) => ({
      id,
      status: 'pass',
      evidence: [...evidence],
    })),
    metrics: {
      materializedPackages: 2,
      selectedBodiesReadPerRound: fixture.disclosure.selectedBodyPaths.length,
      retainedInlineRegressions: 12,
      authorityExpansions: fixture.assertions.authorityExpansions,
      realmEffects: fixture.assertions.realmEffects,
      filesystemRootsDisclosed: fixture.assertions.filesystemRootsDisclosed,
    },
    proofLimits: [...proofLimits],
    testRuns: structuredClone(testRuns),
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [
        'rejects selected body disclosure during release construction',
        'rejects changed subject and prior-review digests before disclosure',
        'rejects descriptor and request substitution before disclosure',
        'rejects unknown materialization fields before disclosure',
        'rejects authority-shaped artifacts before disclosure',
        'rejects a coherently rehashed stale capability descriptor',
        'prevalidates every deferred descriptor before opening the first body',
        'rejects selected body drift at the exact read boundary',
        'rejects output above the complete canonical byte ceiling',
        'rejects post-materialization mutation and recomputed extra fields',
        'ignores caller-preloaded forged release cache entries',
        'prevents caller mutation of capability maps from poisoning later cache hits',
      ],
    },
  };
  return Object.freeze(verifyDeferredReviewMaterializerCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicDeferredReviewMaterializerFixture();
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({
      status: 'written',
      destination,
      fixtureDigest: fixture.fixtureDigest,
    })}\n`);
    return;
  }

  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({
    root,
    headCommit: head,
    outputPath,
    releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildDeferredReviewMaterializerReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildDeferredReviewMaterializerReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    testRuns: receipt.testRuns,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
