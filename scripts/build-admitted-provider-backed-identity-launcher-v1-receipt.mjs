import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  providerBackedMissionHistoricalReceiptPaths,
  verifyProviderBackedMissionDependenciesReceipt,
} from './build-provider-backed-mission-dependencies-v1-receipt.mjs';
import {
  assertCommit,
  changedPathsBetween,
  gitText,
  headCommit,
  historicalAtCommit,
  manifestAtCommit,
  requireCleanExcept,
  resolveSourceCommit,
  runTests,
} from './lib/certification-support.mjs';

const certificationId = 'admitted-provider-backed-identity-launcher-v1';
const protocolId = 'eternities-admitted-provider-backed-identity-launcher-certification-v1';
const fixturePath = 'fixtures/admitted-provider-backed-identity-launcher-v1.json';
const receiptPath = 'receipts/admitted-provider-backed-identity-launcher-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-admitted-provider-backed-identity-launcher-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-admitted-provider-backed-identity-launcher-v1.md';
const reviewPath = 'docs/reviews/admitted-provider-backed-identity-launcher-v1-terra-review.json';
const certificationPath = 'docs/admitted-provider-backed-identity-launcher-v1-certification.md';
const parentReceiptPath = 'receipts/provider-backed-mission-dependencies-v1.json';
const expectedReviewBase = 'c13522f452ee17ac6a787809c32196dc843fe367';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const protectedTrustRoots = Object.freeze({
  'receipts/admitted-sealed-identity-host-v1.json': '98e904a14822fb9e66620030a5472c0b64a9948bf3ffa4c0e94a2f17274f2581',
  'receipts/provider-backed-mission-dependencies-v1.json': '72bed0e153deaddc72a0cd2e62b75c43424f4317ca15b592f81586e78c597215',
  'receipts/provider-phase-host-sdk-v1.json': '9f5b11c89a7fe338bba7adbe8abf37ec8473dd212e8dd78661740a70721a3822',
  'src/host/admitted-sealed-identity-launch.mjs': 'fbe6b59b8f6f28dc4def494c168894e17b8771ae5f2c515d96b4d2bcd86dfb27',
  'src/host/provider-backed-mission-dependencies.mjs': '1f45d8a94283fb4d190d60b37b8ddfe4b667e887950b54d7833feba2a733a6b7',
  'src/host/provider-phase-host-sdk.mjs': '7e4c12deb13210dea0876cf976c736a86d46d1fb05db1d09016deb2650c39953',
});
const historicalReceiptPaths = Object.freeze([
  ...providerBackedMissionHistoricalReceiptPaths,
  parentReceiptPath,
].sort());
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  reviewPath,
  specificationPath,
  'scripts/build-admitted-provider-backed-identity-launcher-v1-fixture.mjs',
  'scripts/build-admitted-provider-backed-identity-launcher-v1-receipt.mjs',
  'scripts/build-provider-backed-mission-dependencies-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/host/admitted-provider-backed-identity-launcher.mjs',
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
  'tests/admitted-provider-backed-identity-launcher-certification.test.mjs',
  'tests/admitted-provider-backed-identity-launcher-integration.test.mjs',
  'tests/admitted-provider-backed-identity-launcher.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/admitted-provider-backed-identity-launcher-certification-fixture.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/release-lineage.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/admitted-provider-backed-identity-launcher.test.mjs',
  'tests/admitted-provider-backed-identity-launcher-integration.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['APBIL-001', 'one SDK-issued provider host and exact Godskills release construct without provider work'],
  ['APBIL-002', 'one frozen self-digested description binds the complete provider-backed dependency stack'],
  ['APBIL-003', 'the launch surface excludes provider credential dependency classifier Realm continuity and Soul injection'],
  ['APBIL-004', 'one explicit identity-policy digest becomes the exact internal policy pin projection'],
  ['APBIL-005', 'every launch uses only the native review and revision handles captured at construction'],
  ['APBIL-006', 'both certified provider families complete native review revision and final review'],
  ['APBIL-007', 'terminal reconstruction and replay perform no provider routing or activation work'],
  ['APBIL-008', 'the credential canary reaches only provider headers and no durable or certified artifact'],
  ['APBIL-009', 'source manifests protected roots independent review ledger and lineage reproduce exactly'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const expectedMetrics = Object.freeze({
  allFamiliesAuthorityClosed: true,
  allFamiliesCompleted: true,
  allLaunchersReconstructed: true,
  credentialLeaks: 0,
  families: 2,
  providerCalls: 8,
  replayActivationLaunches: 0,
  replayProviderCalls: 0,
  replayRouteLaunches: 0,
  reviewedPhases: 8,
});
const proofLimits = Object.freeze([
  'the launcher does not choose or construct a provider family from ambient state',
  'the launcher does not author approve sign or mutate an identity policy',
  'provider credentials remain inside the preconstructed certified provider host',
  'provider ambiguity remains governed by the existing signed resolution controller and authority outbox',
  'fake provider conformance does not establish live provider quality availability latency pricing or truth',
  'local recovery does not establish remote exactly-once provider execution',
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
    'family', 'providerPolicyDigest', 'identityPolicyDigest', 'launcherBindingDigest',
    'dependencyBindingDigest', 'providerDescriptionDigest', 'descriptors',
    'execution', 'recovery', 'assertions',
  ], 'admitted provider-backed family fixture');
  if (value.family !== family) throw new Error('admitted provider-backed family is invalid');
  for (const field of [
    'providerPolicyDigest', 'identityPolicyDigest', 'launcherBindingDigest',
    'dependencyBindingDigest', 'providerDescriptionDigest',
  ]) digest(value[field], field);
  exactKeys(value.descriptors, ['native', 'review', 'revision'], 'launcher descriptors');
  Object.values(value.descriptors).forEach((entry) => digest(entry, 'launcher descriptor'));
  exactKeys(value.execution, [
    'phaseOrder', 'requestDigests', 'missionCompletionReceiptDigest',
    'vesselCompletionReceiptDigest',
  ], 'launcher execution');
  if (!same(value.execution.phaseOrder, ['native', 'review', 'revision', 'review'])
      || value.execution.requestDigests.length !== 4) {
    throw new Error('launcher phase execution is invalid');
  }
  value.execution.requestDigests.forEach((entry) => digest(entry, 'provider request'));
  digest(value.execution.missionCompletionReceiptDigest, 'mission completion receipt');
  digest(value.execution.vesselCompletionReceiptDigest, 'vessel completion receipt');
  exactKeys(value.recovery, ['providerCalls', 'routeLaunches', 'activationLaunches'], 'launcher recovery');
  if (value.recovery.providerCalls !== 4 || value.recovery.routeLaunches !== 1
      || value.recovery.activationLaunches !== 1) {
    throw new Error('launcher recovery evidence is invalid');
  }
  const zeros = [
    'providerCallsDuringConstruction', 'replayProviderCalls', 'replayRouteLaunches',
    'replayActivationLaunches', 'credentialLeaks',
  ];
  const positives = [
    'exactHostDescriptionBound', 'exactPolicyDependenciesBound',
    'allCredentialsReachedOnlyHeaders', 'exactReviewedPhaseOrder', 'finalReviewAccepted',
    'exactTerminalReplay', 'launcherReconstructed', 'noAuthorityExpansion',
  ];
  exactKeys(value.assertions, [...zeros, ...positives], 'launcher assertions');
  for (const name of zeros) {
    if (value.assertions[name] !== 0) throw new Error('launcher zero-work assertion is invalid');
  }
  for (const name of positives) {
    if (value.assertions[name] !== true) throw new Error('launcher positive assertion is invalid');
  }
}

function verifyFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'families', 'assertions', 'fixtureDigest',
  ], 'admitted provider-backed fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-admitted-provider-backed-identity-launcher-fixture-v1') {
    throw new Error('admitted provider-backed fixture identity is invalid');
  }
  exactKeys(value.godskills, ['commit', 'releaseDigest'], 'launcher Godskills fixture');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('launcher Godskills commit is invalid');
  digest(value.godskills.releaseDigest, 'launcher Godskills release');
  const families = ['anthropic-messages-v1', 'openai-compatible-chat-completions-v1'];
  if (!same(Object.keys(value.families).sort(), families)) {
    throw new Error('launcher fixture families are invalid');
  }
  for (const family of families) verifyFamily(value.families[family], family);
  if (!same(value.assertions, expectedMetrics)) throw new Error('launcher fixture metrics are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'launcher fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('launcher fixture digest mismatch');
  return value;
}

function verifyReviewAttestation(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'reviewId', 'reviewer', 'baseCommit',
    'reviewedCommit', 'findings', 'priorFindingsResolved', 'verification',
    'disposition', 'summary', 'attestationDigest',
  ], 'launcher review attestation');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-independent-code-review-attestation-v1'
      || value.reviewId !== 'admitted-provider-backed-identity-launcher-v1-terra'
      || value.disposition !== 'ready-for-receipt-generation'
      || value.baseCommit !== expectedReviewBase
      || !COMMIT.test(value.reviewedCommit)
      || typeof value.summary !== 'string' || value.summary.length < 32
      || value.summary.length > 2_048) {
    throw new Error('launcher review attestation identity is invalid');
  }
  exactKeys(value.reviewer, ['agentId', 'model'], 'launcher reviewer');
  if (value.reviewer.agentId !== '01a05a8a-055d-74d0-bf3f-217d59b8d920'
      || value.reviewer.model !== 'gpt-5.6-terra') {
    throw new Error('launcher reviewer identity is invalid');
  }
  exactKeys(value.findings, ['critical', 'important', 'minor'], 'launcher review findings');
  if (value.findings.critical !== 0 || value.findings.important !== 0
      || !Number.isSafeInteger(value.findings.minor) || value.findings.minor < 0) {
    throw new Error('launcher review has unresolved defects');
  }
  if (!Array.isArray(value.priorFindingsResolved)
      || value.priorFindingsResolved.some((finding) => {
        try {
          exactKeys(finding, ['id', 'severity', 'status'], 'launcher resolved finding');
          return !['critical', 'important', 'minor'].includes(finding.severity)
            || finding.status !== 'resolved'
            || typeof finding.id !== 'string' || finding.id.length < 3;
        } catch {
          return true;
        }
      })) {
    throw new Error('launcher prior finding resolution is invalid');
  }
  if (!Array.isArray(value.verification) || value.verification.length < 1
      || value.verification.some((entry) => {
        try {
          exactKeys(entry, ['command', 'result'], 'launcher review verification');
          return typeof entry.command !== 'string' || entry.command.length < 3
            || typeof entry.result !== 'string' || entry.result.length < 3;
        } catch {
          return true;
        }
      })) {
    throw new Error('launcher review verification is invalid');
  }
  const { attestationDigest, ...unsigned } = value;
  digest(attestationDigest, 'launcher review attestation');
  if (attestationDigest !== sha256Value(unsigned)) {
    throw new Error('launcher review attestation digest mismatch');
  }
  return value;
}

export function verifyAdmittedProviderBackedIdentityLauncherReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source',
    'fixture', 'requirements', 'metrics', 'testRuns', 'review', 'proofLimits',
    'receiptDigest',
  ], 'admitted provider-backed launcher receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('admitted provider-backed launcher receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'protectedTrustRoots',
    'implementationManifest', 'testManifest',
  ], 'launcher source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('launcher source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests)
    .forEach((entry) => digest(entry, 'historical receipt'));
  if (!same(value.source.protectedTrustRoots, protectedTrustRoots)) {
    throw new Error('launcher protected trust roots are invalid');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'launcher receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('launcher fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('launcher receipt evidence is invalid');
  }
  verifyTestRuns(value.testRuns);
  exactKeys(value.review, [
    'mode', 'independent', 'path', 'fileSha256', 'value',
    'unresolvedCriticalDefects', 'unresolvedImportantDefects',
  ], 'launcher review');
  const attestation = verifyReviewAttestation(value.review.value);
  if (value.review.mode !== 'independent-terra' || value.review.independent !== true
      || value.review.path !== reviewPath
      || value.review.fileSha256 !== sha256Text(`${canonicalJson(attestation)}\n`)
      || value.review.unresolvedCriticalDefects !== attestation.findings.critical
      || value.review.unresolvedImportantDefects !== attestation.findings.important) {
    throw new Error('launcher review is invalid');
  }
  if (!same(value.proofLimits, proofLimits)) throw new Error('launcher proof limits are invalid');
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'launcher receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('launcher receipt digest mismatch');
  return value;
}

export async function buildAdmittedProviderBackedIdentityLauncherReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) {
    throw new Error('launcher fixture is not canonical');
  }
  const actualRoots = Object.fromEntries(await Promise.all(
    Object.keys(protectedTrustRoots).map(async (path) => [
      path,
      sha256Text(await gitText(root, sourceCommit, path)),
    ]),
  ));
  if (!same(actualRoots, protectedTrustRoots)) throw new Error('launcher protected trust root changed');
  const parentText = await gitText(root, sourceCommit, parentReceiptPath);
  verifyProviderBackedMissionDependenciesReceipt(JSON.parse(parentText));
  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const attestation = verifyReviewAttestation(JSON.parse(reviewText));
  if (reviewText !== `${canonicalJson(attestation)}\n`) {
    throw new Error('launcher review attestation is not canonical');
  }
  await assertCommit(root, attestation.baseCommit);
  await assertCommit(root, attestation.reviewedCommit);
  await changedPathsBetween(root, attestation.baseCommit, attestation.reviewedCommit);
  if (!same(await changedPathsBetween(root, attestation.reviewedCommit, sourceCommit), [reviewPath])) {
    throw new Error('launcher source changed outside the reviewed attestation artifact');
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
  return Object.freeze(verifyAdmittedProviderBackedIdentityLauncherReceipt({
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
  const preliminary = await buildAdmittedProviderBackedIdentityLauncherReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildAdmittedProviderBackedIdentityLauncherReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/admitted-provider-backed-identity-launcher-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeFile(join(root, ...certificationPath.split('/')), `# Admitted Provider-Backed Identity Launcher v1 Certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies the exact provider-backed admitted launcher for both registered provider families through the real identity-bound mission and terminal reconstruction. Provider choice, credentials, policy authority, signed ambiguity resolution, and all Realm or continuity authority remain outside the launcher.\n`, 'utf8');
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
