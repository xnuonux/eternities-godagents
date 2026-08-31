import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicAdmittedSealedIdentityHostFixture } from '../tests/helpers/admitted-sealed-identity-host-certification-fixture.mjs';
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

export { buildDeterministicAdmittedSealedIdentityHostFixture };

const certificationId = 'admitted-sealed-identity-host-v1';
const protocolId = 'eternities-admitted-sealed-identity-host-certification-v1';
const fixturePath = 'fixtures/admitted-sealed-identity-host-v1.json';
const receiptPath = 'receipts/admitted-sealed-identity-host-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-admitted-sealed-identity-host-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-admitted-sealed-identity-host-v1.md';
const certificationPath = 'docs/admitted-sealed-identity-host-v1-certification.md';
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
  'receipts/routing-evidence-activation-classifier-v1.json',
  'receipts/sealed-local-godskills-transport-v1.json',
  'receipts/sealed-local-identity-vessel-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'schemas/godskills-routing-executable-pin.schema.json',
  'schemas/identity-bound-mission-vessel-request.schema.json',
  'schemas/identity-host-policy.schema.json',
  'scripts/build-admitted-sealed-identity-host-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/genesis/verify.mjs',
  'src/host/admitted-identity-boundary.mjs',
  'src/host/admitted-launch.mjs',
  'src/host/admitted-sealed-identity-launch.mjs',
  'src/host/identity-policy.mjs',
  'src/host/local-instance-registry.mjs',
  'src/keel/local-reference-backend.mjs',
  'src/runtime/identity-bound-mission-vessel-contracts.mjs',
  'src/runtime/identity-bound-mission-vessel.mjs',
  'src/runtime/identity-bound-native-contracts.mjs',
  'src/runtime/identity-bound-native-transport.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/runtime/sealed-local-identity-bound-mission-vessel.mjs',
  'src/skills/local-recoverable-godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-process-transport.mjs',
  'src/skills/routing-evidence-activation-classifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/admitted-launch.test.mjs',
  'tests/admitted-sealed-identity-host-certification.test.mjs',
  'tests/admitted-sealed-identity-launch.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/admitted-sealed-identity-host-certification-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/identity-host-policy.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/routing-evidence-activation-classifier.test.mjs',
  'tests/sealed-local-identity-bound-mission-vessel.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/admitted-launch.test.mjs',
  'tests/admitted-sealed-identity-launch.test.mjs',
  'tests/identity-host-policy.test.mjs',
  'tests/sealed-local-identity-bound-mission-vessel.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'ASH-001': ['one separate programmatic launcher adopts the sealed identity vessel without changing the historical launcher'],
  'ASH-002': ['canonical policy parsing and external digest verification finish before any policy-selected Godskills artifact lookup'],
  'ASH-003': ['policy paths instance Realm genesis personal keel and OS-account residency bind to one admitted identity'],
  'ASH-004': ['request host adapter revocation authority context artifact token projection and cycle values remain beneath policy'],
  'ASH-005': ['native review and revision dependencies match complete non-authoritative descriptors pinned by policy'],
  'ASH-006': ['the host constructs the routing-evidence classifier only from the exact verified routing executable'],
  'ASH-007': ['review availability is true only when both pinned review and revision executors are present'],
  'ASH-008': ['a no-review policy completes a low-risk native-only path without review or revision execution'],
  'ASH-009': ['the real router selects Muse and the real activation executable chooses deferred review'],
  'ASH-010': ['process death after activation success recovers without another route or activation child'],
  'ASH-011': ['native generation two reviews and one revision complete with zero Realm or authority expansion'],
  'ASH-012': ['exact terminal replay performs no classifier process native review or revision work'],
  'ASH-013': ['legacy launch tests retain their prior behavior through the shared admission boundary extraction'],
  'ASH-014': ['deterministic fixture full suite append-only ledger and release lineage remain release gates'],
});

const retainedRegressions = Object.freeze([
  'rejects malformed transport seams before filesystem or policy work',
  'rejects noncanonical and semantically forged identity-host policies',
  'does not dereference policy-selected Godskills artifacts before the external digest pin passes',
  'rejects changed admission binding path instance Realm and policy digest',
  'rejects task identity revocation authority context and every request budget expansion',
  'rejects changed native review revision classifier and routing executable descriptors',
  'requires review and revision descriptors and live executors as one pair',
  'completes a low-risk native-only mission under an explicit no-review policy',
  'routes a consequential visual mission to eternities-muse through the real executable',
  'constructs the reviewed classifier from verified routing evidence rather than mission prose',
  'recovers activation success without another route or activation launch',
  'executes one native two reviews and one revision before final acceptance',
  'performs no external operation on exact terminal replay',
  'discloses no filesystem root provider credential Realm hand continuity writer or personal-keel writer',
  'preserves all historical admitted-launch success recovery contention tamper and residency behavior',
]);

const proofLimits = Object.freeze([
  'programmatic-host-only',
  'native-review-and-revision-transports-remain-injected-descriptor-bound-fixtures',
  'no-live-model-provider-endpoint-credential-or-output-quality-qualification',
  'no-cli-or-historical-launcher-default-migration',
  'operator-policy-file-and-external-digest-pin-remain-trusted-local-inputs',
  'no-hostile-same-user-operating-system-isolation',
  'no-universal-exactly-once-execution-before-observable-output',
  'no-provider-realm-action-continuity-keel-evolution-lunari-inspiration-or-soul-authority',
  'no-independent-review',
]);

const expectedAssertions = Object.freeze({
  activationProcessDeathObserved: true,
  externalPolicyDigestPinned: true,
  policyPathsBoundToAdmission: true,
  residencyRecordPresent: true,
  classifierDerivedFromVerifiedRouting: true,
  exactNativeDescriptorPinned: true,
  exactReviewDescriptorPinned: true,
  exactRevisionDescriptorPinned: true,
  routeRecoveredWithoutRelaunch: true,
  activationRecoveredWithoutRelaunch: true,
  actualMuseSelected: true,
  actualMuseReviewMode: true,
  nativeExecutedOnce: true,
  reviewExecutedTwice: true,
  revisionExecutedOnce: true,
  finalReviewAccepted: true,
  runtimeLayoutClosed: true,
  exactTerminalReplay: true,
  replayExternalCalls: 0,
  forbiddenPolicyKeys: 0,
  filesystemRootsDisclosed: 0,
  authorityExpansions: 0,
  realmEffects: 0,
});

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
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function verifyDigestObject(value, keys, label) {
  exactKeys(value, keys, label);
  for (const [name, entry] of Object.entries(value)) {
    if (name === 'policyId' || name === 'instanceId' || name === 'keelId' || name === 'selectedCapabilityId') continue;
    requireDigest(entry, `${label} ${name}`);
  }
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
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'policy', 'identity',
    'execution', 'recovery', 'assertions', 'fixtureDigest',
  ], 'admitted identity host fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-admitted-sealed-identity-host-fixture-v1') {
    throw new Error('admitted identity host fixture identity is invalid');
  }
  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'routingTrustRootDigest', 'activationTrustRootDigest',
  ], 'fixture Godskills');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('fixture Godskills commit is invalid');
  for (const key of ['releaseDigest', 'routingTrustRootDigest', 'activationTrustRootDigest']) {
    requireDigest(value.godskills[key], `fixture Godskills ${key}`);
  }
  verifyDigestObject(value.policy, [
    'policyId', 'policyDigest', 'classifierDescriptorDigest',
    'nativeTransportDescriptorDigest', 'reviewExecutorDescriptorDigest',
    'revisionExecutorDescriptorDigest',
  ], 'fixture policy');
  if (value.policy.policyId !== 'admitted-sealed-identity-host-certification-v1') {
    throw new Error('fixture policy identity is invalid');
  }
  verifyDigestObject(value.identity, [
    'instanceId', 'genesisId', 'keelId', 'candidateDigest', 'modelProjectionDigest',
  ], 'fixture identity');
  if (typeof value.identity.instanceId !== 'string'
      || !/^keel-[a-f0-9]{64}$/.test(value.identity.keelId)) {
    throw new Error('fixture admitted identity is invalid');
  }
  verifyDigestObject(value.execution, [
    'selectedCapabilityId', 'selectedEntrypointSha256', 'selectedContractSha256',
    'activationDecisionDigest', 'nativeDispatchDigest', 'nativeCompletionDigest',
    'firstReviewDispatchDigest', 'revisionDispatchDigest', 'finalReviewDispatchDigest',
    'vesselCompletionReceiptDigest', 'missionCompletionReceiptDigest',
  ], 'fixture execution');
  if (value.execution.selectedCapabilityId !== 'eternities-muse') {
    throw new Error('fixture selected capability is invalid');
  }
  const expectedRecovery = {
    routeLaunches: 1,
    activationLaunches: 1,
    nativeExecutions: 1,
    reviewExecutions: 2,
    revisionExecutions: 1,
    replayExternalCalls: 0,
  };
  if (canonicalJson(value.recovery) !== canonicalJson(expectedRecovery)
      || canonicalJson(value.assertions) !== canonicalJson(expectedAssertions)) {
    throw new Error('fixture recovery or assertions are invalid');
  }
  requireDigest(value.fixtureDigest, 'admitted identity host fixture');
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (sha256Value(unsigned) !== value.fixtureDigest) throw new Error('admitted identity host fixture digest mismatch');
  return value;
}

function expectedMetrics(fixture) {
  return {
    routeLaunches: fixture.recovery.routeLaunches,
    activationLaunches: fixture.recovery.activationLaunches,
    nativeExecutions: fixture.recovery.nativeExecutions,
    reviewExecutions: fixture.recovery.reviewExecutions,
    revisionExecutions: fixture.recovery.revisionExecutions,
    replayExternalCalls: fixture.recovery.replayExternalCalls,
    forbiddenPolicyKeys: fixture.assertions.forbiddenPolicyKeys,
    filesystemRootsDisclosed: fixture.assertions.filesystemRootsDisclosed,
    authorityExpansions: fixture.assertions.authorityExpansions,
    realmEffects: fixture.assertions.realmEffects,
    retainedInlineRegressions: retainedRegressions.length,
  };
}

export function verifyAdmittedSealedIdentityHostCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'admitted identity host certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('admitted identity host certification identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'admitted identity host certification source');
  if (!COMMIT.test(value.source.commit)
      || canonicalJson(Object.keys(value.source.historicalReceiptDigests))
        !== canonicalJson(historicalReceiptPaths)) {
    throw new Error('admitted identity host certification source history is invalid');
  }
  for (const digest of Object.values(value.source.historicalReceiptDigests)) {
    requireDigest(digest, 'historical receipt');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  for (const [name, artifact, path] of [
    ['specification', value.source.specification, specificationPath],
    ['plan', value.source.plan, planPath],
  ]) {
    exactKeys(artifact, ['path', 'sha256'], `source ${name}`);
    if (artifact.path !== path) throw new Error(`source ${name} path mismatch`);
    requireDigest(artifact.sha256, `source ${name}`);
  }
  exactKeys(value.fixture, [
    'schemaVersion', 'protocolId', 'path', 'fileSha256', 'logicalDigest',
    'policy', 'identity', 'execution', 'recovery', 'assertions',
  ], 'admitted identity host certification fixture');
  if (value.fixture.path !== fixturePath) throw new Error('admitted identity host fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'admitted identity host fixture file');
  requireDigest(value.fixture.logicalDigest, 'admitted identity host fixture logical');
  const fixture = verifyFixture({
    schemaVersion: value.fixture.schemaVersion,
    protocolId: value.fixture.protocolId,
    godskills: structuredClone(value.godskills),
    policy: structuredClone(value.fixture.policy),
    identity: structuredClone(value.fixture.identity),
    execution: structuredClone(value.fixture.execution),
    recovery: structuredClone(value.fixture.recovery),
    assertions: structuredClone(value.fixture.assertions),
    fixtureDigest: value.fixture.logicalDigest,
  });
  if (!Array.isArray(value.requirements)
      || !sameArray(value.requirements.map(({ id }) => id), Object.keys(requirementEvidence))) {
    throw new Error('admitted identity host certification requirements are invalid');
  }
  value.requirements.forEach((row) => {
    exactKeys(row, ['id', 'status', 'evidence'], `requirement ${row.id}`);
    if (row.status !== 'pass' || !sameArray(row.evidence, requirementEvidence[row.id])) {
      throw new Error(`requirement ${row.id} evidence mismatch`);
    }
  });
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics(fixture))) {
    throw new Error('admitted identity host certification metrics are invalid');
  }
  if (!sameArray(value.proofLimits, proofLimits)) {
    throw new Error('admitted identity host certification proof limits mismatch');
  }
  validateTestRuns(value.testRuns);
  exactKeys(value.review, [
    'mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions',
  ], 'admitted identity host certification review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('admitted identity host certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'admitted identity host certification receipt');
  if (receiptDigest !== sha256Value(unsigned)) {
    throw new Error('admitted identity host certification receipt digest mismatch');
  }
  return value;
}

export async function rebuildAdmittedSealedIdentityHostReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('admitted identity host fixture is not canonical');
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
      policy: structuredClone(fixture.policy),
      identity: structuredClone(fixture.identity),
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
  return Object.freeze(verifyAdmittedSealedIdentityHostCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicAdmittedSealedIdentityHostFixture();
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
  const preliminary = await rebuildAdmittedSealedIdentityHostReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildAdmittedSealedIdentityHostReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/admitted-sealed-identity-host-certification.test.mjs',
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
