import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  assertCommit, changedPathsBetween, gitText, headCommit, historicalAtCommit,
  manifestAtCommit, requireCleanExcept, resolveSourceCommit, runTests,
} from './lib/certification-support.mjs';

const certificationId = 'provider-backed-mission-dependencies-v1';
const protocolId = 'eternities-provider-backed-mission-dependencies-certification-v1';
const fixturePath = 'fixtures/provider-backed-mission-dependencies-v1.json';
const receiptPath = 'receipts/provider-backed-mission-dependencies-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-provider-backed-mission-dependencies-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-provider-backed-mission-dependencies-v1.md';
const reviewPath = 'docs/reviews/provider-backed-mission-dependencies-v1-terra-review.json';
const certificationPath = 'docs/provider-backed-mission-dependencies-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const protectedTrustRoots = Object.freeze({
  'receipts/admitted-sealed-identity-host-v1.json': '98e904a14822fb9e66620030a5472c0b64a9948bf3ffa4c0e94a2f17274f2581',
  'receipts/deferred-godskills-review-executor-v1.json': 'e5897311bbeab99eda7b6a093b7c442908c9a03e85217f85979210e29d6a6c9c',
  'receipts/provider-phase-host-sdk-v1.json': '9f5b11c89a7fe338bba7adbe8abf37ec8473dd212e8dd78661740a70721a3822',
  'receipts/recoverable-mission-revision-executor-v1.json': 'fbd6e2bc2f5803f27b82d781694d5c29bedc840b556b91822b0da797b828c4f8',
  'receipts/sealed-local-identity-vessel-v1.json': '59a5030b20c85c538d22e8cd85db693cef7de96ca806123e76c92ba078f779c5',
  'src/host/admitted-sealed-identity-launch.mjs': 'fbe6b59b8f6f28dc4def494c168894e17b8771ae5f2c515d96b4d2bcd86dfb27',
  'src/runtime/mission-revision-executor.mjs': '64f9086603949a0ff6edef3ef66863f64becd7e74af242f2efdd3f8660697e15',
  'src/skills/deferred-review-executor.mjs': '546d912f428de5cf61d16089ba657f023fb86949ff70c00c57d62644be451d4f',
});

const historicalReceiptPaths = Object.freeze([
  'admitted-sealed-identity-host-v1.json',
  'admitted-sealed-typed-execution-host-v1.json',
  'codex-bound-turn-v1.json',
  'codex-recoverable-turn-coordinator-v1.json',
  'codex-recoverable-turn-journal-v1.json',
  'cortex-binding-contracts-v1.json',
  'cortex-binding-registry-v1.json',
  'creation-forge-phase1-certification.json',
  'creator-protocol-phase3-certification.json',
  'deferred-godskills-review-executor-v1.json',
  'deferred-godskills-review-materializer-v1.json',
  'durable-anthropic-messages-phase-transport-v1.json',
  'godagent-v0-certification.json',
  'godskills-adaptive-activation-v1.json',
  'godskills-specialist-preference-v1.json',
  'godskills-typed-composition-consumer-v1.json',
  'godskills-v3-integration.json',
  'identity-bound-mission-vessel-v1.json',
  'local-admission-shell-certification.json',
  'networked-cortex-certification.json',
  'provider-neutral-phase-protocol-v1.json',
  'provider-neutral-phase-resolution-v1.json',
  'provider-phase-host-sdk-v1.json',
  'provider-resolution-authority-handoff-v1.json',
  'provider-resolution-authority-outbox-v1.json',
  'provider-resolution-decision-preparer-v1.json',
  'provider-resolution-profile-v1.json',
  'receipt-bound-typed-executor-bundle-v1.json',
  'recoverable-godskills-admission-v1.json',
  'recoverable-mission-native-executor-v1.json',
  'recoverable-mission-revision-executor-v1.json',
  'recoverable-typed-composition-compiler-v1.json',
  'recoverable-typed-execution-journal-v1.json',
  'resumable-mission-review-kernel-v1.json',
  'routing-evidence-activation-classifier-v1.json',
  'sealed-local-godskills-transport-v1.json',
  'sealed-local-identity-vessel-v1.json',
  'sealed-local-typed-composition-compiler-v1.json',
  'sealed-local-typed-execution-runner-v1.json',
  'sealed-openai-compatible-phase-transport-v1.json',
  'signed-openai-phase-resolution-v1.json',
  'transactional-genesis-phase2-certification.json',
  'visual-creator-shell-certification.json',
].map((file) => `receipts/${file}`).sort());

const implementationFiles = Object.freeze([
  'README.md', 'docs/architecture.md', fixturePath, 'package.json', planPath,
  specificationPath, reviewPath,
  'scripts/build-provider-backed-mission-dependencies-v1-fixture.mjs',
  'scripts/build-provider-backed-mission-dependencies-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs', 'src/core/digest.mjs',
  'src/host/admitted-sealed-identity-launch.mjs',
  'src/host/provider-backed-mission-dependencies.mjs',
  'src/host/provider-phase-host-sdk.mjs',
  'src/runtime/identity-bound-mission-vessel.mjs',
  'src/runtime/identity-bound-native-transport.mjs',
  'src/runtime/mission-revision-executor.mjs',
  'src/skills/deferred-review-executor.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/routing-evidence-activation-classifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/transports/anthropic-messages-phase-transport.mjs',
  'src/transports/openai-compatible-phase-transport.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/provider-backed-mission-dependencies-certification-fixture.mjs',
  'tests/provider-backed-mission-dependencies-certification.test.mjs',
  'tests/provider-backed-mission-dependencies-integration.test.mjs',
  'tests/provider-backed-mission-dependencies.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/provider-backed-mission-dependencies.test.mjs',
  'tests/provider-backed-mission-dependencies-integration.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['PBMD-001', 'one closed bridge binds a certified provider host to native review and revision mission dependencies'],
  ['PBMD-002', 'live phase descriptors equal the host description and remain pinned against later drift'],
  ['PBMD-003', 'the description independently verifies provider release materializer executor and ceiling identities'],
  ['PBMD-004', 'construction remains credential-lazy and performs no provider request'],
  ['PBMD-005', 'both provider families complete native review revision and final review through the admitted identity host'],
  ['PBMD-006', 'terminal replay performs no provider routing or activation work'],
  ['PBMD-007', 'unknown authority cache filesystem and cross-phase substitutions fail closed'],
  ['PBMD-008', 'fixture source manifests protected roots independent review ledger and lineage reproduce exactly'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const expectedMetrics = Object.freeze({
  allFamiliesAuthorityClosed: true,
  allFamiliesCompleted: true,
  credentialLeaks: 0,
  families: 2,
  providerCalls: 8,
  replayActivationLaunches: 0,
  replayProviderCalls: 0,
  replayRouteLaunches: 0,
  reviewedPhases: 8,
});
const proofLimits = Object.freeze([
  'the bridge does not choose or construct a provider family from ambient state',
  'the bridge does not author pin approve or launch an identity policy',
  'provider credentials remain inside the preconstructed transport and are first required by execution',
  'provider ambiguity still requires the existing external signature authority controller and outbox',
  'fake provider conformance does not establish live provider quality availability latency pricing or truth',
  'local at-most-once recovery does not establish remote exactly-once provider execution',
  'no Realm continuity identity evolution Inspiration Lunari or Soul authority is added',
]);

const same = (left, right) => canonicalJson(left) === canonicalJson(right);
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}
function digest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}
function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!same(value.paths, paths) || value.entries.length !== paths.length) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256)
        || !Number.isInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
  });
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}
function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'test run');
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error('test run is invalid');
    }
  }
}
function verifyFamily(value, family) {
  exactKeys(value, [
    'family', 'providerPolicyDigest', 'identityPolicyDigest',
    'dependencyBindingDigest', 'providerDescriptionDigest', 'descriptors',
    'execution', 'recovery', 'assertions',
  ], 'provider-backed family fixture');
  if (value.family !== family) throw new Error('provider-backed family identity is invalid');
  for (const field of [
    'providerPolicyDigest', 'identityPolicyDigest', 'dependencyBindingDigest',
    'providerDescriptionDigest',
  ]) digest(value[field], field);
  exactKeys(value.descriptors, ['native', 'review', 'revision'], 'provider-backed descriptors');
  Object.values(value.descriptors).forEach((entry) => digest(entry, 'dependency descriptor'));
  exactKeys(value.execution, [
    'phaseOrder', 'requestDigests', 'missionCompletionReceiptDigest',
    'vesselCompletionReceiptDigest',
  ], 'provider-backed execution');
  if (!same(value.execution.phaseOrder, ['native', 'review', 'revision', 'review'])
      || value.execution.requestDigests.length !== 4) {
    throw new Error('provider-backed phase execution is invalid');
  }
  value.execution.requestDigests.forEach((entry) => digest(entry, 'provider request'));
  digest(value.execution.missionCompletionReceiptDigest, 'mission completion receipt');
  digest(value.execution.vesselCompletionReceiptDigest, 'vessel completion receipt');
  exactKeys(value.recovery, ['providerCalls', 'routeLaunches', 'activationLaunches'], 'provider-backed recovery');
  if (value.recovery.providerCalls !== 4 || value.recovery.routeLaunches !== 1
      || value.recovery.activationLaunches !== 1) {
    throw new Error('provider-backed recovery evidence is invalid');
  }
  exactKeys(value.assertions, [
    'providerCallsDuringConstruction', 'exactHostDescriptionBound',
    'exactPolicyDependenciesBound', 'allCredentialsReachedOnlyHeaders',
    'exactReviewedPhaseOrder', 'finalReviewAccepted', 'exactTerminalReplay',
    'replayProviderCalls', 'replayRouteLaunches', 'replayActivationLaunches',
    'credentialLeaks', 'noAuthorityExpansion',
  ], 'provider-backed family assertions');
  for (const name of [
    'providerCallsDuringConstruction', 'replayProviderCalls', 'replayRouteLaunches',
    'replayActivationLaunches', 'credentialLeaks',
  ]) {
    if (value.assertions[name] !== 0) throw new Error('provider-backed zero-work assertion is invalid');
  }
  for (const name of [
    'exactHostDescriptionBound', 'exactPolicyDependenciesBound',
    'allCredentialsReachedOnlyHeaders', 'exactReviewedPhaseOrder',
    'finalReviewAccepted', 'exactTerminalReplay', 'noAuthorityExpansion',
  ]) {
    if (value.assertions[name] !== true) throw new Error('provider-backed positive assertion is invalid');
  }
}
function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'godskills', 'families', 'assertions', 'fixtureDigest'], 'provider-backed fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-provider-backed-mission-dependencies-fixture-v1') {
    throw new Error('provider-backed fixture identity is invalid');
  }
  exactKeys(value.godskills, ['commit', 'releaseDigest'], 'provider-backed Godskills fixture');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('provider-backed Godskills commit is invalid');
  digest(value.godskills.releaseDigest, 'provider-backed Godskills release');
  const familyNames = ['anthropic-messages-v1', 'openai-compatible-chat-completions-v1'];
  if (!same(Object.keys(value.families).sort(), familyNames)) throw new Error('provider-backed fixture families are invalid');
  for (const family of familyNames) verifyFamily(value.families[family], family);
  if (!same(value.assertions, expectedMetrics)) throw new Error('provider-backed fixture metrics are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'provider-backed fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('provider-backed fixture digest mismatch');
  return value;
}

function verifyReviewAttestation(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'reviewId', 'reviewer', 'baseCommit',
    'reviewedCommit', 'findings', 'priorFindingsResolved', 'verification',
    'disposition', 'summary', 'attestationDigest',
  ], 'provider-backed review attestation');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-independent-code-review-attestation-v1'
      || value.reviewId !== 'provider-backed-mission-dependencies-v1-terra'
      || value.disposition !== 'ready-for-receipt-generation'
      || typeof value.summary !== 'string' || value.summary.length < 32
      || value.summary.length > 2_048 || !COMMIT.test(value.baseCommit)
      || !COMMIT.test(value.reviewedCommit)) {
    throw new Error('provider-backed review attestation identity is invalid');
  }
  exactKeys(value.reviewer, ['agentId', 'model'], 'provider-backed reviewer');
  if (value.reviewer.agentId !== '01a05a8a-055d-74d0-bf3f-217d59b8d920'
      || value.reviewer.model !== 'gpt-5.6-terra') {
    throw new Error('provider-backed reviewer identity is invalid');
  }
  exactKeys(value.findings, ['critical', 'important', 'minor'], 'provider-backed review findings');
  if (value.findings.critical !== 0 || value.findings.important !== 0
      || !Number.isSafeInteger(value.findings.minor) || value.findings.minor < 0) {
    throw new Error('provider-backed review has unresolved defects');
  }
  if (!Array.isArray(value.priorFindingsResolved) || value.priorFindingsResolved.length < 1
      || value.priorFindingsResolved.some((finding) => {
        try {
          exactKeys(finding, ['id', 'severity', 'status'], 'provider-backed resolved finding');
          return !['critical', 'important'].includes(finding.severity)
            || finding.status !== 'resolved'
            || typeof finding.id !== 'string' || finding.id.length < 3;
        } catch {
          return true;
        }
      })) {
    throw new Error('provider-backed prior finding resolution is invalid');
  }
  if (!Array.isArray(value.verification) || value.verification.length < 1
      || value.verification.some((entry) => {
        try {
          exactKeys(entry, ['command', 'result'], 'provider-backed review verification');
          return typeof entry.command !== 'string' || entry.command.length < 3
            || typeof entry.result !== 'string' || entry.result.length < 3;
        } catch {
          return true;
        }
      })) {
    throw new Error('provider-backed review verification is invalid');
  }
  const { attestationDigest, ...unsigned } = value;
  digest(attestationDigest, 'provider-backed review attestation');
  if (attestationDigest !== sha256Value(unsigned)) {
    throw new Error('provider-backed review attestation digest mismatch');
  }
  return value;
}

export function verifyProviderBackedMissionDependenciesReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source',
    'fixture', 'requirements', 'metrics', 'testRuns', 'review', 'proofLimits',
    'receiptDigest',
  ], 'provider-backed receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('provider-backed receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'protectedTrustRoots',
    'implementationManifest', 'testManifest',
  ], 'provider-backed source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('provider-backed source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  if (!same(value.source.protectedTrustRoots, protectedTrustRoots)) {
    throw new Error('provider-backed protected trust roots are invalid');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'provider-backed receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('provider-backed fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('provider-backed receipt evidence is invalid');
  }
  verifyTestRuns(value.testRuns);
  exactKeys(value.review, [
    'mode', 'independent', 'path', 'fileSha256', 'value',
    'unresolvedCriticalDefects', 'unresolvedImportantDefects',
  ], 'provider-backed review');
  const attestation = verifyReviewAttestation(value.review.value);
  if (value.review.mode !== 'independent-terra' || value.review.independent !== true
      || value.review.path !== reviewPath || !DIGEST.test(value.review.fileSha256)
      || value.review.fileSha256 !== sha256Text(`${canonicalJson(attestation)}\n`)
      || value.review.unresolvedCriticalDefects !== attestation.findings.critical
      || value.review.unresolvedImportantDefects !== attestation.findings.important) {
    throw new Error('provider-backed review is invalid');
  }
  if (!same(value.proofLimits, proofLimits)) throw new Error('provider-backed proof limits are invalid');
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'provider-backed receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('provider-backed receipt digest mismatch');
  return value;
}

export async function buildProviderBackedMissionDependenciesReceiptFromSource({
  repositoryRoot, sourceCommit, testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('provider-backed fixture is not canonical');
  const actualRoots = Object.fromEntries(await Promise.all(Object.keys(protectedTrustRoots)
    .map(async (path) => [path, sha256Text(await gitText(root, sourceCommit, path))])));
  if (!same(actualRoots, protectedTrustRoots)) throw new Error('provider-backed protected trust root changed');
  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const attestation = verifyReviewAttestation(JSON.parse(reviewText));
  if (reviewText !== `${canonicalJson(attestation)}\n`) {
    throw new Error('provider-backed review attestation is not canonical');
  }
  await assertCommit(root, attestation.baseCommit);
  await assertCommit(root, attestation.reviewedCommit);
  if (!same(await changedPathsBetween(root, attestation.reviewedCommit, sourceCommit), [reviewPath])) {
    throw new Error('provider-backed source changed outside the reviewed attestation artifact');
  }
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      protectedTrustRoots: structuredClone(protectedTrustRoots),
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements: structuredClone(requirements),
    metrics: structuredClone(fixture.assertions),
    testRuns: structuredClone(testRuns),
    review: {
      mode: 'independent-terra',
      independent: true,
      path: reviewPath,
      fileSha256: sha256Text(reviewText),
      value: structuredClone(attestation),
      unresolvedCriticalDefects: attestation.findings.critical,
      unresolvedImportantDefects: attestation.findings.important,
    },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyProviderBackedMissionDependenciesReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const sourceCommit = await resolveSourceCommit({
    root,
    headCommit: await headCommit(root),
    outputPath,
    releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildProviderBackedMissionDependenciesReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildProviderBackedMissionDependenciesReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/provider-backed-mission-dependencies-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeFile(join(root, ...certificationPath.split('/')), `# Provider-Backed Mission Dependencies v1 Certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies the exact provider-host dependency bridge for both registered families through the real admitted identity mission and terminal replay. Provider choice, credentials, policy authority, signed ambiguity resolution, and all Realm or continuity authority remain outside the bridge.\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: 'certified',
    sourceCommit,
    receiptDigest: receipt.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest,
    testRuns: receipt.testRuns,
    release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
