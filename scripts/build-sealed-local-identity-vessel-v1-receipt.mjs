import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicSealedLocalIdentityVesselFixture } from '../tests/helpers/sealed-local-identity-vessel-certification-fixture.mjs';
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

export { buildDeterministicSealedLocalIdentityVesselFixture };

const certificationId = 'sealed-local-identity-vessel-v1';
const protocolId = 'eternities-sealed-local-identity-vessel-certification-v1';
const fixturePath = 'fixtures/sealed-local-identity-vessel-v1.json';
const receiptPath = 'receipts/sealed-local-identity-vessel-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-sealed-local-identity-vessel-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-sealed-local-identity-vessel-v1.md';
const certificationPath = 'docs/sealed-local-identity-vessel-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/codex-bound-turn-v1.json',
  'receipts/codex-recoverable-turn-coordinator-v1.json',
  'receipts/codex-recoverable-turn-journal-v1.json',
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/deferred-godskills-review-executor-v1.json',
  'receipts/deferred-godskills-review-materializer-v1.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-specialist-preference-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/identity-bound-mission-vessel-v1.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/recoverable-godskills-admission-v1.json',
  'receipts/recoverable-mission-native-executor-v1.json',
  'receipts/recoverable-mission-revision-executor-v1.json',
  'receipts/resumable-mission-review-kernel-v1.json',
  'receipts/sealed-local-godskills-transport-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'scripts/build-sealed-local-identity-vessel-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/runtime/identity-bound-mission-vessel-contracts.mjs',
  'src/runtime/identity-bound-mission-vessel.mjs',
  'src/runtime/identity-bound-native-transport.mjs',
  'src/runtime/mission-native-executor.mjs',
  'src/runtime/mission-review-journal.mjs',
  'src/runtime/mission-review-kernel.mjs',
  'src/runtime/sealed-local-identity-bound-mission-vessel.mjs',
  'src/skills/local-recoverable-godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-process-transport.mjs',
  'src/skills/recoverable-godskills-adapter.mjs',
  'src/skills/recoverable-godskills-contracts.mjs',
  'src/skills/recoverable-godskills-outbox.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/godskills-routing-executable-verifier.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/sealed-local-identity-vessel-certification-fixture.mjs',
  'tests/identity-bound-mission-vessel-certification.test.mjs',
  'tests/identity-bound-mission-vessel-godskills-integration.test.mjs',
  'tests/identity-bound-mission-vessel.test.mjs',
  'tests/local-recoverable-godskills-adapter.test.mjs',
  'tests/local-recoverable-godskills-process-transport.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/sealed-local-godskills-transport-certification.test.mjs',
  'tests/sealed-local-identity-bound-mission-vessel.test.mjs',
  'tests/sealed-local-identity-vessel-certification.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/godskills-routing-executable-verifier.test.mjs',
  'tests/identity-bound-mission-vessel-godskills-integration.test.mjs',
  'tests/identity-bound-mission-vessel.test.mjs',
  'tests/local-recoverable-godskills-adapter.test.mjs',
  'tests/local-recoverable-godskills-process-transport.test.mjs',
  'tests/sealed-local-identity-bound-mission-vessel.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'SLV-001': ['one factory constructs the exact sealed local adapter before the identity-bound vessel'],
  'SLV-002': ['one runtime root derives non-overlapping Godskills vessel-admission and mission-journal roots'],
  'SLV-003': ['partial root pin classifier transport clock lock and cache configuration fails before mission execution'],
  'SLV-004': ['the real Godskills router selects eternities-muse inside the identity-bound mission loop'],
  'SLV-005': ['the real activation executable selects deferred review for the reviewed creative-generation profile'],
  'SLV-006': ['process death after activation success recovers without another route or activation launch'],
  'SLV-007': ['native generation review revision and final review execute in the existing certified order'],
  'SLV-008': ['exact terminal replay performs no process classification native review or revision work'],
  'SLV-009': ['returned metadata binds both trust roots and descriptors without filesystem disclosure'],
  'SLV-010': ['credentials provider routing Realm continuity keel evolution Inspiration Lunari and Soul authority remain absent'],
  'SLV-011': ['deterministic fixture full suite append-only ledger and release lineage remain release gates'],
});

const retainedRegressions = Object.freeze([
  'rejects missing runtime root classifier native transport clocks checkpoints lock options and artifact cache',
  'rejects changed routing receipt identity before factory construction',
  'requires the exact adaptive activation root',
  'derives only Godskills vessel-admission and mission-journal runtime subtrees',
  'returns no filesystem root or authority-bearing component',
  'routes the visual mission to eternities-muse through the real executable',
  'activates eternities-muse in deferred review mode through the real executable',
  'recovers activation success without another route or activation launch',
  'executes one native two reviews and one revision before final acceptance',
  'performs no external operation or classification on terminal replay',
  'imports no host policy provider Realm continuity keel evolution Inspiration or Soul dependency',
]);

const proofLimits = Object.freeze([
  'programmatic-factory-only',
  'no-admitted-host-legacy-host-cli-or-policy-migration',
  'no-live-model-provider-or-output-quality-qualification',
  'activation-classifier-remains-an-injected-trusted-host-function',
  'native-review-and-revision-transports-remain-injected-deterministic-fixtures',
  'no-hostile-same-user-operating-system-isolation',
  'no-universal-exactly-once-execution-before-observable-output',
  'no-provider-credential-or-model-routing-implementation',
  'no-realm-action-compensation-or-rollback',
  'no-continuity-admission-or-personal-keel-write',
  'no-identity-evolution-lunari-inspiration-or-soul-activation',
  'no-independent-review',
]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error(`${label} fields are invalid`);
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function requireDigest(value, label) {
  if (!DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!sameArray(value.paths, paths) || !Array.isArray(value.entries) || value.entries.length !== paths.length) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256)
        || !Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry is invalid`);
  });
  requireDigest(value.digest, `${label} digest`);
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function validateTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'certification test runs');
  for (const [name, run] of Object.entries(value)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
  }
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'godskills', 'execution', 'recovery', 'assertions', 'fixtureDigest'], 'fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-sealed-local-identity-vessel-fixture-v1') {
    throw new Error('fixture identity is invalid');
  }
  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'routingTrustRootDigest', 'activationTrustRootDigest',
  ], 'fixture Godskills');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('fixture Godskills commit is invalid');
  for (const key of ['releaseDigest', 'routingTrustRootDigest', 'activationTrustRootDigest']) {
    requireDigest(value.godskills[key], `fixture Godskills ${key}`);
  }
  const executionKeys = [
    'routeMode', 'routeDescriptorDigest', 'activationDescriptorDigest',
    'selectedCapabilityId', 'selectedEntrypointSha256', 'selectedContractSha256',
    'activationDecisionDigest', 'nativeDispatchDigest', 'firstReviewDispatchDigest',
    'revisionDispatchDigest', 'finalReviewDispatchDigest',
    'vesselCompletionReceiptDigest', 'missionCompletionReceiptDigest',
  ];
  exactKeys(value.execution, executionKeys, 'fixture execution');
  if (value.execution.routeMode !== 'default' || value.execution.selectedCapabilityId !== 'eternities-muse') {
    throw new Error('fixture execution selection is invalid');
  }
  for (const key of executionKeys.filter((key) => !['routeMode', 'selectedCapabilityId'].includes(key))) {
    requireDigest(value.execution[key], `fixture execution ${key}`);
  }
  const expectedRecovery = {
    routeLaunches: 1,
    activationLaunches: 1,
    classifications: 2,
    nativeExecutions: 1,
    reviewExecutions: 2,
    revisionExecutions: 1,
    replayExternalCalls: 0,
  };
  if (canonicalJson(value.recovery) !== canonicalJson(expectedRecovery)) throw new Error('fixture recovery metrics are invalid');
  const assertionKeys = [
    'activationProcessDeathObserved', 'routeRecoveredWithoutRelaunch',
    'activationRecoveredWithoutRelaunch', 'actualMuseSelected', 'actualMuseReviewMode',
    'nativeExecutedOnce', 'reviewExecutedTwice', 'revisionExecutedOnce',
    'finalReviewAccepted', 'runtimeLayoutClosed', 'exactTerminalReplay',
    'replayExternalCalls', 'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects',
  ];
  exactKeys(value.assertions, assertionKeys, 'fixture assertions');
  for (const key of assertionKeys) {
    const expected = ['replayExternalCalls', 'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects'].includes(key)
      ? 0 : true;
    if (value.assertions[key] !== expected) throw new Error(`fixture assertion ${key} failed`);
  }
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('fixture digest mismatch');
  return value;
}

function expectedMetrics(fixture) {
  return {
    routeLaunches: fixture.recovery.routeLaunches,
    activationLaunches: fixture.recovery.activationLaunches,
    activationClassifications: fixture.recovery.classifications,
    nativeExecutions: fixture.recovery.nativeExecutions,
    reviewExecutions: fixture.recovery.reviewExecutions,
    revisionExecutions: fixture.recovery.revisionExecutions,
    replayExternalCalls: fixture.recovery.replayExternalCalls,
    filesystemRootsDisclosed: fixture.assertions.filesystemRootsDisclosed,
    authorityExpansions: fixture.assertions.authorityExpansions,
    realmEffects: fixture.assertions.realmEffects,
    retainedInlineRegressions: retainedRegressions.length,
  };
}

export function verifySealedLocalIdentityVesselCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('certification identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'certification source');
  if (!COMMIT.test(value.source.commit)) throw new Error('certification source commit is invalid');
  if (!value.source.historicalReceiptDigests
      || !sameArray(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('historical receipt set mismatch');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt digest'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  for (const [name, expectedPath] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[name], ['path', 'sha256'], `source ${name}`);
    if (value.source[name].path !== expectedPath) throw new Error(`source ${name} path mismatch`);
    requireDigest(value.source[name].sha256, `source ${name} digest`);
  }
  exactKeys(value.fixture, [
    'schemaVersion', 'protocolId', 'path', 'fileSha256', 'logicalDigest',
    'execution', 'recovery', 'assertions',
  ], 'certification fixture');
  if (value.fixture.path !== fixturePath) throw new Error('certification fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'certification fixture file digest');
  const fixture = verifyFixture({
    schemaVersion: value.fixture.schemaVersion,
    protocolId: value.fixture.protocolId,
    godskills: structuredClone(value.godskills),
    execution: structuredClone(value.fixture.execution),
    recovery: structuredClone(value.fixture.recovery),
    assertions: structuredClone(value.fixture.assertions),
    fixtureDigest: value.fixture.logicalDigest,
  });
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
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics(fixture))) throw new Error('certification metrics are invalid');
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('proof limits mismatch');
  validateTestRuns(value.testRuns);
  exactKeys(value.review, ['mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions'], 'review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'certification receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('certification receipt mismatch');
  return value;
}

export async function rebuildSealedLocalIdentityVesselReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(repositoryRoot, sourceCommit, historicalReceiptPaths),
      implementationManifest: await manifestAtCommit(repositoryRoot, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(repositoryRoot, sourceCommit, testFiles),
      specification: {
        path: specificationPath,
        sha256: sha256Text(await gitText(repositoryRoot, sourceCommit, specificationPath)),
      },
      plan: {
        path: planPath,
        sha256: sha256Text(await gitText(repositoryRoot, sourceCommit, planPath)),
      },
    },
    godskills: structuredClone(fixture.godskills),
    fixture: {
      schemaVersion: fixture.schemaVersion,
      protocolId: fixture.protocolId,
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      execution: structuredClone(fixture.execution),
      recovery: structuredClone(fixture.recovery),
      assertions: structuredClone(fixture.assertions),
    },
    requirements: Object.entries(requirementEvidence).map(([id, evidence]) => ({
      id,
      status: 'pass',
      evidence: [...evidence],
    })),
    metrics: expectedMetrics(fixture),
    proofLimits: [...proofLimits],
    testRuns: structuredClone(testRuns),
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [...retainedRegressions],
    },
  };
  return Object.freeze(verifySealedLocalIdentityVesselCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicSealedLocalIdentityVesselFixture();
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({
      status: 'written', destination, fixtureDigest: fixture.fixtureDigest,
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
  const preliminary = await rebuildSealedLocalIdentityVesselReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildSealedLocalIdentityVesselReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/sealed-local-identity-vessel-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    testRuns: receipt.testRuns,
    release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
