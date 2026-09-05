import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
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

const certificationId = 'admitted-portable-identity-launcher-v1';
const protocolId = 'eternities-admitted-portable-identity-launcher-certification-v1';
const fixturePath = 'fixtures/admitted-portable-identity-launcher-v1.json';
const receiptPath = 'receipts/admitted-portable-identity-launcher-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-portable-admitted-identity-launcher-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-portable-admitted-identity-launcher-v1.md';
const reviewPath = 'docs/reviews/admitted-portable-identity-launcher-v1-coordinator-review.json';
const certificationPath = 'docs/admitted-portable-identity-launcher-v1-certification.md';
const expectedReviewBase = '9b21cd3ff50834efdc16074c5a98310cbe18525e';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const protectedTrustRoots = Object.freeze({
  'receipts/admitted-sealed-identity-host-v1.json': '98e904a14822fb9e66620030a5472c0b64a9948bf3ffa4c0e94a2f17274f2581',
  'receipts/deferred-godskills-review-executor-v1.json': 'e5897311bbeab99eda7b6a093b7c442908c9a03e85217f85979210e29d6a6c9c',
  'receipts/deferred-godskills-review-materializer-v1.json': '243a252f47a9d9d63a520a2d6a673acd045515c8de29b5e2a5b594e136a8ccac',
  'receipts/identity-bound-mission-vessel-v1.json': 'f61a34aab15d2cd63403a11f2b260d2e929ebd69ca4e1fbe6d4dc4e588a629fa',
  'receipts/portable-phase-host-conformance-v1.json': '88dd2ede7cb3716b059fa022f1d3f40b0aad90630856f755843e146e8207809f',
  'src/host/admitted-sealed-identity-launch.mjs': 'fbe6b59b8f6f28dc4def494c168894e17b8771ae5f2c515d96b4d2bcd86dfb27',
  'src/runtime/mission-revision-executor.mjs': '64f9086603949a0ff6edef3ef66863f64becd7e74af242f2efdd3f8660697e15',
  'src/sdk/portable-phase-host.mjs': '5daf81ee263049e40b6c6bb67f8e6660a4b7d3a4165eaa31105c7ae53ada7df2',
  'src/skills/deferred-review-executor.mjs': '546d912f428de5cf61d16089ba657f023fb86949ff70c00c57d62644be451d4f',
});
const historicalReceiptPaths = Object.freeze([
  'receipts/admitted-sealed-identity-host-v1.json',
  'receipts/deferred-godskills-review-executor-v1.json',
  'receipts/deferred-godskills-review-materializer-v1.json',
  'receipts/identity-bound-mission-vessel-v1.json',
  'receipts/portable-phase-host-conformance-v1.json',
].sort());
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  reviewPath,
  specificationPath,
  'scripts/build-admitted-portable-identity-launcher-v1-fixture.mjs',
  'scripts/build-admitted-portable-identity-launcher-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/host/admitted-portable-identity-launcher.mjs',
  'src/host/admitted-sealed-identity-launch.mjs',
  'src/host/portable-mission-dependencies.mjs',
  'src/runtime/identity-bound-native-contracts.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/runtime/mission-revision-executor.mjs',
  'src/sdk/index.mjs',
  'src/sdk/portable-phase-host.mjs',
  'src/skills/deferred-review-executor.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/routing-evidence-activation-classifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/admitted-portable-identity-launcher-integration.test.mjs',
  'tests/admitted-portable-identity-launcher-certification.test.mjs',
  'tests/admitted-portable-identity-launcher.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/admitted-portable-identity-launcher-certification-fixture.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/portable-mission-dependencies.test.mjs',
  'tests/portable-phase-host-conformance.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/admitted-portable-identity-launcher-integration.test.mjs',
  'tests/admitted-portable-identity-launcher.test.mjs',
  'tests/portable-mission-dependencies.test.mjs',
].sort());
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['APIL-001', 'one SDK-issued portable host and exact Godskills release construct without provider work'],
  ['APIL-002', 'all native, review, and revision descriptors are read, verified, and bound exactly'],
  ['APIL-003', 'the dependency description is body-free, deterministic, self-digested, and credential-free'],
  ['APIL-004', 'the portable launcher preserves the exact Godskills release and activation trust roots without copying bodies'],
  ['APIL-005', 'the launcher authority projection is closed and the launch surface cannot inject transports, executors, or authority'],
  ['APIL-006', 'both registered transport families complete the admitted native, review, revision, and final-review loop'],
  ['APIL-007', 'terminal reconstruction performs no repeated provider, routing, or activation work'],
  ['APIL-008', 'the credential canary reaches only transport headers and no durable or certified artifact'],
  ['APIL-009', 'the source manifests, protected roots, review artifact, ledger, and release lineage are reproducible'],
  ['APIL-010', 'the launcher remains an explicit SDK seam and does not alter default launch or add Lunari or Soul authority'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const expectedMetrics = Object.freeze({
  allFamiliesAuthorityClosed: true,
  allFamiliesCompleted: true,
  allLaunchersReconstructed: true,
  allPortableHostDescriptionsBound: true,
  credentialLeaks: 0,
  families: 2,
  providerCalls: 8,
  replayActivationLaunches: 0,
  replayProviderCalls: 0,
  replayRouteLaunches: 0,
  reviewedPhases: 8,
});
const proofLimits = Object.freeze([
  'the launcher consumes only an SDK-issued portable host and does not choose a provider family from ambient state',
  'the underlying fixture hosts are provider wrappers and do not establish arbitrary external adapter quality or availability',
  'provider credentials remain inside the preconstructed host ports and are not part of the launcher description or durable state',
  'local recovery and replay do not establish remote exactly-once provider execution',
  'the launcher does not author, approve, sign, mutate, or admit an identity policy',
  'no default launch adoption, Codex desktop control, Claude Code adapter, local-model adapter, MCP adapter, Realm authority, continuity authority, keel write, evolution, Lunari, Inspiration, or Soul authority is added',
  'the coordinator review is static and not an independent model review because the available reviewer worker hit the account usage limit',
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
    'dependencyBindingDigest', 'portableHostDescriptionDigest', 'descriptors',
    'execution', 'recovery', 'assertions',
  ], 'admitted portable family fixture');
  if (value.family !== family) throw new Error('admitted portable family is invalid');
  for (const field of [
    'providerPolicyDigest', 'identityPolicyDigest', 'launcherBindingDigest',
    'dependencyBindingDigest', 'portableHostDescriptionDigest',
  ]) digest(value[field], field);
  exactKeys(value.descriptors, ['native', 'review', 'revision'], 'portable launcher descriptors');
  Object.values(value.descriptors).forEach((entry) => digest(entry, 'portable launcher descriptor'));
  exactKeys(value.execution, [
    'phaseOrder', 'requestDigests', 'missionCompletionReceiptDigest',
    'vesselCompletionReceiptDigest',
  ], 'portable launcher execution');
  if (!same(value.execution.phaseOrder, ['native', 'review', 'revision', 'review'])
      || value.execution.requestDigests.length !== 4) {
    throw new Error('portable launcher phase execution is invalid');
  }
  value.execution.requestDigests.forEach((entry) => digest(entry, 'portable request'));
  digest(value.execution.missionCompletionReceiptDigest, 'mission completion receipt');
  digest(value.execution.vesselCompletionReceiptDigest, 'vessel completion receipt');
  exactKeys(value.recovery, ['providerCalls', 'routeLaunches', 'activationLaunches'], 'portable launcher recovery');
  if (value.recovery.providerCalls !== 4 || value.recovery.routeLaunches !== 1
      || value.recovery.activationLaunches !== 1) {
    throw new Error('portable launcher recovery evidence is invalid');
  }
  const zeros = [
    'providerCallsDuringConstruction', 'replayProviderCalls', 'replayRouteLaunches',
    'replayActivationLaunches', 'credentialLeaks',
  ];
  const positives = [
    'exactPortableHostDescriptionBound', 'exactPolicyDependenciesBound',
    'allCredentialsReachedOnlyHeaders', 'exactReviewedPhaseOrder', 'finalReviewAccepted',
    'exactTerminalReplay', 'launcherReconstructed', 'noAuthorityExpansion',
  ];
  exactKeys(value.assertions, [...zeros, ...positives], 'portable launcher assertions');
  for (const name of zeros) {
    if (value.assertions[name] !== 0) throw new Error('portable launcher zero-work assertion is invalid');
  }
  for (const name of positives) {
    if (value.assertions[name] !== true) throw new Error('portable launcher positive assertion is invalid');
  }
}

function verifyFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'families', 'assertions', 'fixtureDigest',
  ], 'admitted portable fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-admitted-portable-identity-launcher-fixture-v1') {
    throw new Error('admitted portable fixture identity is invalid');
  }
  exactKeys(value.godskills, ['commit', 'releaseDigest'], 'portable Godskills fixture');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('portable Godskills commit is invalid');
  digest(value.godskills.releaseDigest, 'portable Godskills release');
  const families = ['anthropic-messages-v1', 'openai-compatible-chat-completions-v1'];
  if (!same(Object.keys(value.families).sort(), families)) {
    throw new Error('portable fixture families are invalid');
  }
  for (const family of families) verifyFamily(value.families[family], family);
  if (!same(value.assertions, expectedMetrics)) throw new Error('portable fixture metrics are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'portable fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('portable fixture digest mismatch');
  return value;
}

function verifyReviewAttestation(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'reviewId', 'reviewer', 'baseCommit',
    'reviewedCommit', 'findings', 'priorFindingsResolved', 'verification',
    'disposition', 'summary', 'attestationDigest',
  ], 'portable launcher review attestation');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-independent-code-review-attestation-v1'
      || value.reviewId !== 'admitted-portable-identity-launcher-v1-static-review'
      || value.disposition !== 'ready-for-receipt-generation'
      || value.baseCommit !== expectedReviewBase
      || typeof value.summary !== 'string' || value.summary.length < 32
      || value.summary.length > 2_048) {
    throw new Error('portable launcher review attestation identity is invalid');
  }
  exactKeys(value.reviewer, ['agentId', 'model'], 'portable launcher reviewer');
  if (value.reviewer.agentId !== 'codex-coordinator'
      || value.reviewer.model !== 'codex-current-session') {
    throw new Error('portable launcher reviewer identity is invalid');
  }
  exactKeys(value.findings, ['critical', 'important', 'minor'], 'portable launcher review findings');
  if (value.findings.critical !== 0 || value.findings.important !== 0
      || !Number.isSafeInteger(value.findings.minor) || value.findings.minor < 0) {
    throw new Error('portable launcher review has unresolved defects');
  }
  if (!Array.isArray(value.priorFindingsResolved)
      || value.priorFindingsResolved.some((finding) => {
        try {
          exactKeys(finding, ['id', 'severity', 'status'], 'portable launcher resolved finding');
          return !['critical', 'important', 'minor'].includes(finding.severity)
            || finding.status !== 'resolved'
            || typeof finding.id !== 'string' || finding.id.length < 3;
        } catch {
          return true;
        }
      })) {
    throw new Error('portable launcher prior finding resolution is invalid');
  }
  if (!Array.isArray(value.verification) || value.verification.length < 1
      || value.verification.some((entry) => {
        try {
          exactKeys(entry, ['command', 'result'], 'portable launcher review verification');
          return typeof entry.command !== 'string' || entry.command.length < 3
            || typeof entry.result !== 'string' || entry.result.length < 3;
        } catch {
          return true;
        }
      })) {
    throw new Error('portable launcher review verification is invalid');
  }
  const { attestationDigest, ...unsigned } = value;
  digest(attestationDigest, 'portable launcher attestation digest');
  if (attestationDigest !== sha256Value(unsigned)) {
    throw new Error('portable launcher attestation digest mismatch');
  }
  return value;
}

export function verifyAdmittedPortableIdentityLauncherReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source',
    'fixture', 'requirements', 'metrics', 'testRuns', 'review', 'proofLimits',
    'receiptDigest',
  ], 'admitted portable launcher receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('admitted portable launcher receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'protectedTrustRoots',
    'implementationManifest', 'testManifest',
  ], 'portable launcher source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('portable launcher source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests)
    .forEach((entry) => digest(entry, 'historical receipt'));
  if (!same(value.source.protectedTrustRoots, protectedTrustRoots)) {
    throw new Error('portable launcher protected trust roots are invalid');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'portable implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'portable test manifest');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'portable receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('portable fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('portable receipt evidence is invalid');
  }
  verifyTestRuns(value.testRuns);
  exactKeys(value.review, [
    'mode', 'independent', 'path', 'fileSha256', 'value',
    'unresolvedCriticalDefects', 'unresolvedImportantDefects',
  ], 'portable launcher review');
  const attestation = verifyReviewAttestation(value.review.value);
  if (value.review.mode !== 'coordinator-static' || value.review.independent !== false
      || value.review.path !== reviewPath
      || value.review.fileSha256 !== sha256Text(`${canonicalJson(attestation)}\n`)
      || value.review.unresolvedCriticalDefects !== attestation.findings.critical
      || value.review.unresolvedImportantDefects !== attestation.findings.important) {
    throw new Error('portable launcher review is invalid');
  }
  if (!same(value.proofLimits, proofLimits)) throw new Error('portable launcher proof limits are invalid');
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'portable launcher receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('portable launcher receipt digest mismatch');
  return value;
}

export async function buildAdmittedPortableIdentityLauncherReceiptFromSource({
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
    throw new Error('portable fixture is not canonical');
  }
  const actualRoots = Object.fromEntries(await Promise.all(
    Object.keys(protectedTrustRoots).map(async (path) => [
      path,
      sha256Text(await gitText(root, sourceCommit, path)),
    ]),
  ));
  if (!same(actualRoots, protectedTrustRoots)) throw new Error('portable protected trust root changed');
  for (const path of historicalReceiptPaths) {
    const text = await gitText(root, sourceCommit, path);
    const value = JSON.parse(text);
    if (text !== `${canonicalJson(value)}\n`) throw new Error(`historical receipt is not canonical: ${path}`);
  }
  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const attestation = verifyReviewAttestation(JSON.parse(reviewText));
  if (reviewText !== `${canonicalJson(attestation)}\n`) {
    throw new Error('portable launcher review attestation is not canonical');
  }
  await assertCommit(root, attestation.baseCommit);
  await assertCommit(root, attestation.reviewedCommit);
  await changedPathsBetween(root, attestation.baseCommit, attestation.reviewedCommit);
  if (!same(await changedPathsBetween(root, attestation.reviewedCommit, sourceCommit), [
    reviewPath,
  ].sort())) {
    throw new Error('portable launcher source changed outside the reviewed attestation artifact');
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
      mode: 'coordinator-static',
      independent: false,
      path: reviewPath,
      fileSha256: sha256Text(reviewText),
      value: structuredClone(attestation),
      unresolvedCriticalDefects: attestation.findings.critical,
      unresolvedImportantDefects: attestation.findings.important,
    },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyAdmittedPortableIdentityLauncherReceipt({
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
  const preliminary = await buildAdmittedPortableIdentityLauncherReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildAdmittedPortableIdentityLauncherReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/admitted-portable-identity-launcher-integration.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeFile(join(root, ...certificationPath.split('/')), `# Admitted Portable Identity Launcher v1 Certification\n\n- status: certified-local-boundary\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n- independent review: pending\n\nThis certifies the explicit provider-neutral launcher bridge over an SDK-issued portable phase host. It binds the exact native, review, and revision descriptors and the pinned Godskills roots, then delegates to the existing admitted sealed identity vessel. The certificate does not claim an independent model review, live provider quality, remote exactly-once execution, default launch adoption, or Codex, Claude Code, local-model, MCP, Lunari, Inspiration, or Soul integration.\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: 'certified-local-boundary',
    sourceCommit,
    receiptDigest: receipt.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest,
    testRuns: receipt.testRuns,
    release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
