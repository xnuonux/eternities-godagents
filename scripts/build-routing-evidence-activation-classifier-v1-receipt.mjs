import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicRoutingEvidenceActivationClassifierFixture } from '../tests/helpers/routing-evidence-activation-classifier-certification-fixture.mjs';
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

export { buildDeterministicRoutingEvidenceActivationClassifierFixture };

const certificationId = 'routing-evidence-activation-classifier-v1';
const protocolId = 'eternities-routing-evidence-activation-classifier-certification-v1';
const fixturePath = 'fixtures/routing-evidence-activation-classifier-v1.json';
const receiptPath = 'receipts/routing-evidence-activation-classifier-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-routing-evidence-activation-classifier-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-routing-evidence-activation-classifier-v1.md';
const certificationPath = 'docs/routing-evidence-activation-classifier-v1-certification.md';
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
  'scripts/build-routing-evidence-activation-classifier-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/skills/activation-adapter.mjs',
  'src/skills/godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-process-transport.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/recoverable-godskills-adapter.mjs',
  'src/skills/recoverable-godskills-contracts.mjs',
  'src/skills/recoverable-godskills-outbox.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/routing-evidence-activation-classifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/godskills-routing-executable-verifier.test.mjs',
  'tests/helpers/routing-evidence-activation-classifier-certification-fixture.mjs',
  'tests/local-recoverable-godskills-adapter.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/routing-evidence-activation-classifier-certification.test.mjs',
  'tests/routing-evidence-activation-classifier.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/godskills-routing-executable-verifier.test.mjs',
  'tests/local-recoverable-godskills-adapter.test.mjs',
  'tests/routing-evidence-activation-classifier.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'RAC-001': ['classification cards are captured only while the exact routing executable is verified'],
  'RAC-002': ['the captured card projection is minimal frozen complete ordered and release-bound'],
  'RAC-003': ['task class derives only from verified selected families and mixed classes collapse to general'],
  'RAC-004': ['consequence class derives from the highest verified selected-card risk'],
  'RAC-005': ['review availability is constructor-bound and descriptor-bound'],
  'RAC-006': ['mission prose cannot alter classification'],
  'RAC-007': ['unknown malformed duplicate or unverified evidence fails before activation'],
  'RAC-008': ['the classifier emits no activation mode authority path credential or product authority'],
  'RAC-009': ['real pinned routing selects Muse and real pinned activation chooses deferred review'],
  'RAC-010': ['deterministic fixture full suite append-only ledger and release lineage remain release gates'],
});

const retainedRegressions = Object.freeze([
  'rejects routing evidence without the private verified provenance brand',
  'rejects incomplete duplicate malformed and unknown selected identities',
  'captures exactly twenty-two release-owned routing cards',
  'maps Muse Phoenix Oracle Aegis Forge Mnemosyne and Beacon deterministically',
  'collapses mixed task classes to general independent of selected order',
  'uses the highest selected risk for consequence classification',
  'ignores mission prose for task and consequence classification',
  'binds review availability routing root card digest and taxonomy into one descriptor',
  'routes the certification mission to Muse through the real executable',
  'activates Muse in review mode through the real executable',
  'emits no mode or authority from the classifier',
]);

const proofLimits = Object.freeze([
  'additive-classifier-only',
  'not-yet-default-for-sealed-vessel-or-admitted-host',
  'routing-selection-quality-is-not-proved-by-classification-determinism',
  'family-taxonomy-is-policy-and-may-require-versioned-revision',
  'unknown-verified-families-fall-back-to-general',
  'review-availability-remains-a-constructor-fact',
  'no-live-model-provider-or-output-quality-qualification',
  'no-provider-credential-realm-continuity-keel-evolution-lunari-inspiration-or-soul-authority',
  'no-independent-review',
]);

const expectedDirect = Object.freeze({
  muse: { taskClass: 'creative-generation', consequenceClass: 'consequential', reviewAvailable: true },
  phoenix: { taskClass: 'debugging-recovery', consequenceClass: 'consequential', reviewAvailable: true },
  oracle: { taskClass: 'research', consequenceClass: 'low', reviewAvailable: true },
  aegis: { taskClass: 'verification', consequenceClass: 'critical', reviewAvailable: true },
  mixed: { taskClass: 'general', consequenceClass: 'critical', reviewAvailable: true },
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
    'schemaVersion', 'protocolId', 'godskills', 'classifier', 'direct',
    'integration', 'assertions', 'fixtureDigest',
  ], 'classifier fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-routing-evidence-activation-classifier-fixture-v1') {
    throw new Error('classifier fixture identity is invalid');
  }
  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'routingTrustRootDigest', 'activationTrustRootDigest',
    'cardsLogicalDigest', 'cardCount',
  ], 'fixture Godskills');
  if (!COMMIT.test(value.godskills.commit) || value.godskills.cardCount !== 22) {
    throw new Error('fixture Godskills source is invalid');
  }
  for (const key of [
    'releaseDigest', 'routingTrustRootDigest', 'activationTrustRootDigest', 'cardsLogicalDigest',
  ]) requireDigest(value.godskills[key], `fixture Godskills ${key}`);
  exactKeys(value.classifier, [
    'schemaVersion', 'protocolId', 'routingTrustRootDigest', 'cardsLogicalDigest',
    'taxonomyDigest', 'reviewAvailable', 'authorityExpanded', 'descriptorDigest',
  ], 'classifier descriptor');
  if (value.classifier.schemaVersion !== 1
      || value.classifier.protocolId !== 'eternities-routing-evidence-activation-classifier-v1'
      || value.classifier.routingTrustRootDigest !== value.godskills.routingTrustRootDigest
      || value.classifier.cardsLogicalDigest !== value.godskills.cardsLogicalDigest
      || value.classifier.reviewAvailable !== true
      || value.classifier.authorityExpanded !== false) throw new Error('classifier descriptor is invalid');
  requireDigest(value.classifier.taxonomyDigest, 'classifier taxonomy');
  requireDigest(value.classifier.descriptorDigest, 'classifier descriptor');
  const unsignedDescriptor = structuredClone(value.classifier);
  delete unsignedDescriptor.descriptorDigest;
  if (sha256Value(unsignedDescriptor) !== value.classifier.descriptorDigest) {
    throw new Error('classifier descriptor digest mismatch');
  }
  if (canonicalJson(value.direct) !== canonicalJson(expectedDirect)) {
    throw new Error('classifier direct classifications are invalid');
  }
  exactKeys(value.integration, [
    'selectedCapabilityIds', 'activationClassification', 'activationModes',
    'activationDecisionDigests', 'routingDescriptorDigest', 'activationDescriptorDigest',
  ], 'classifier integration');
  if (!sameArray(value.integration.selectedCapabilityIds, ['eternities-muse'])
      || canonicalJson(value.integration.activationClassification) !== canonicalJson(expectedDirect.muse)
      || !sameArray(value.integration.activationModes, ['review'])
      || !Array.isArray(value.integration.activationDecisionDigests)
      || value.integration.activationDecisionDigests.length !== 1) {
    throw new Error('classifier integration result is invalid');
  }
  value.integration.activationDecisionDigests.forEach((digest) => requireDigest(digest, 'activation decision'));
  requireDigest(value.integration.routingDescriptorDigest, 'routing descriptor');
  requireDigest(value.integration.activationDescriptorDigest, 'activation descriptor');
  const expectedAssertions = {
    verifiedProvenanceRequired: true,
    exactCardSetCaptured: true,
    classificationDeterministic: true,
    missionProseIgnored: true,
    mixedClassCollapsed: true,
    highestRiskWon: true,
    realMuseRoute: true,
    realMuseReviewActivation: true,
    authorityExpanded: false,
    modeChosenByClassifier: false,
  };
  if (canonicalJson(value.assertions) !== canonicalJson(expectedAssertions)) {
    throw new Error('classifier fixture assertions are invalid');
  }
  requireDigest(value.fixtureDigest, 'classifier fixture');
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (sha256Value(unsigned) !== value.fixtureDigest) throw new Error('classifier fixture digest mismatch');
  return value;
}

function expectedMetrics(fixture) {
  return {
    verifiedCards: fixture.godskills.cardCount,
    directClassifications: Object.keys(fixture.direct).length,
    integratedSelections: fixture.integration.selectedCapabilityIds.length,
    integratedActivationDecisions: fixture.integration.activationDecisionDigests.length,
    authorityExpansions: fixture.assertions.authorityExpanded ? 1 : 0,
    classifierModeSelections: fixture.assertions.modeChosenByClassifier ? 1 : 0,
  };
}

export function verifyRoutingEvidenceActivationClassifierCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'classifier certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('classifier certification identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'classifier certification source');
  if (!COMMIT.test(value.source.commit)
      || canonicalJson(Object.keys(value.source.historicalReceiptDigests))
        !== canonicalJson(historicalReceiptPaths)) {
    throw new Error('classifier certification source history is invalid');
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
    'classifier', 'direct', 'integration', 'assertions',
  ], 'classifier certification fixture');
  if (value.fixture.path !== fixturePath) throw new Error('classifier certification fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'classifier fixture file');
  requireDigest(value.fixture.logicalDigest, 'classifier fixture logical');
  const fixture = verifyFixture({
    schemaVersion: value.fixture.schemaVersion,
    protocolId: value.fixture.protocolId,
    godskills: structuredClone(value.godskills),
    classifier: structuredClone(value.fixture.classifier),
    direct: structuredClone(value.fixture.direct),
    integration: structuredClone(value.fixture.integration),
    assertions: structuredClone(value.fixture.assertions),
    fixtureDigest: value.fixture.logicalDigest,
  });
  if (!Array.isArray(value.requirements)
      || !sameArray(value.requirements.map(({ id }) => id), Object.keys(requirementEvidence))) {
    throw new Error('classifier certification requirements are invalid');
  }
  value.requirements.forEach((row) => {
    exactKeys(row, ['id', 'status', 'evidence'], `requirement ${row.id}`);
    if (row.status !== 'pass' || !sameArray(row.evidence, requirementEvidence[row.id])) {
      throw new Error(`requirement ${row.id} evidence mismatch`);
    }
  });
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics(fixture))) {
    throw new Error('classifier certification metrics are invalid');
  }
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('classifier certification proof limits mismatch');
  validateTestRuns(value.testRuns);
  exactKeys(value.review, [
    'mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions',
  ], 'classifier certification review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('classifier certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'classifier certification receipt');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('classifier certification receipt digest mismatch');
  return value;
}

export async function rebuildRoutingEvidenceActivationClassifierReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('classifier fixture is not canonical');
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
      classifier: structuredClone(fixture.classifier),
      direct: structuredClone(fixture.direct),
      integration: structuredClone(fixture.integration),
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
  return Object.freeze(verifyRoutingEvidenceActivationClassifierCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicRoutingEvidenceActivationClassifierFixture();
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
  const preliminary = await rebuildRoutingEvidenceActivationClassifierReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildRoutingEvidenceActivationClassifierReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/routing-evidence-activation-classifier-certification.test.mjs',
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
