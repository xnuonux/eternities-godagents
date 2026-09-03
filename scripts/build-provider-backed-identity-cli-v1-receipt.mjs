import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyAdmittedProviderBackedIdentityLauncherReceipt } from './build-admitted-provider-backed-identity-launcher-v1-receipt.mjs';
import { providerBackedMissionHistoricalReceiptPaths } from './build-provider-backed-mission-dependencies-v1-receipt.mjs';
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
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicProviderBackedIdentityCliFixture } from '../tests/helpers/provider-backed-identity-cli-certification-fixture.mjs';

const certificationId = 'provider-backed-identity-cli-v1';
const protocolId = 'eternities-provider-backed-identity-cli-certification-v1';
const fixturePath = 'fixtures/provider-backed-identity-cli-v1.json';
const receiptPath = 'receipts/provider-backed-identity-cli-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-03-provider-backed-identity-cli-certification-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-03-provider-backed-identity-cli-certification-v1.md';
const reviewPath = 'docs/reviews/provider-backed-identity-cli-v1-terra-review.json';
const certificationPath = 'docs/provider-backed-identity-cli-v1-certification.md';
const parentReceiptPath = 'receipts/admitted-provider-backed-identity-launcher-v1.json';
const parentCertificationId = 'admitted-provider-backed-identity-launcher-v1';
const parentReceiptDigest = 'd860d89672179bbe99e3bc28a74142c95731d638d257d2ea28506c85f01314d2';
const parentFileSha256 = '132228297621de4fc2f0e6413cb1c39ee6cb8125904166944a96398238d6827c';
const expectedReviewModel = 'gpt-5.6-terra';
const expectedReviewAgentId = '01a04a0c-ae62-7c83-8f77-9d7b1614f390';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const protectedTrustRoots = Object.freeze({
  'receipts/admitted-provider-backed-identity-launcher-v1.json': parentFileSha256,
  'src/core/canonical-json.mjs': 'ea05c927ef5e8a8e5f48435222731a0530e8b8f7e5263a0d9c8a76d75836ca5e',
  'src/core/digest.mjs': '74db2218c3e54b89648c3f5f0c4464cc1fa7392815a1daa590ea06aeb76ed238',
  'src/core/schema-validator.mjs': 'd968398e16721c562f49dfc07a48086d16eed92fe3a5f85c012eb7afae7fdd91',
  'src/cortex/receipt-safety.mjs': '8857e5b69b2ce3e458fadf9f84a6b4219b44d4040c2dad2d4c86be57f2878fb5',
  'src/host/admitted-identity-boundary.mjs': '61ebce0069df396bc27ad074c9118a372b776bc8148058223b56f7a938aebd65',
  'src/host/admitted-provider-backed-identity-launcher.mjs': 'b5cdca745d30d74b98e370c78aae3bab2b97356dd463c3c70075b37fb2cf07b8',
  'src/host/identity-policy.mjs': '1bbc5c08fe603a3c00e39fcccf91c36ffb6a1b1ffcb0f9ac44859ca1289b1c16',
  'src/host/provider-backed-cli-contracts.mjs': 'db6a71b81d5216267422c47636b75cc7e978a4f20c4ade530f052444e3a96ca9',
  'src/host/provider-backed-cli.mjs': 'f8a1360ff9f6639f67df9265a7dc787c2a2bfd87ef7e925f24437cec0c22eefd',
  'src/host/provider-phase-host-sdk.mjs': '7e4c12deb13210dea0876cf976c736a86d46d1fb05db1d09016deb2650c39953',
  'src/runtime/identity-bound-mission-vessel-contracts.mjs': '906d7494f4816859fd69a2c39ed5d8fbd676f3ac675df2ca13c7d0c302472285',
});

const historicalReceiptPaths = Object.freeze([
  ...providerBackedMissionHistoricalReceiptPaths,
  'receipts/provider-backed-mission-dependencies-v1.json',
  parentReceiptPath,
].sort());

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  planPath,
  reviewPath,
  specificationPath,
  'package.json',
  'scripts/build-admitted-provider-backed-identity-launcher-v1-receipt.mjs',
  'scripts/build-provider-backed-identity-cli-v1-fixture.mjs',
  'scripts/build-provider-backed-identity-cli-v1-receipt.mjs',
  'scripts/build-provider-backed-mission-dependencies-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  'src/certification/no-network-guard.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/host/admitted-identity-boundary.mjs',
  'src/host/admitted-provider-backed-identity-launcher.mjs',
  'src/host/identity-policy.mjs',
  'src/host/provider-backed-cli-contracts.mjs',
  'src/host/provider-backed-cli.mjs',
  'src/host/provider-phase-host-sdk.mjs',
  'src/runtime/identity-bound-mission-vessel-contracts.mjs',
  'src/runtime/identity-bound-native-contracts.mjs',
  'src/runtime/mission-revision-transport-contracts.mjs',
  'src/skills/review-transport-contracts.mjs',
  'src/skills/routing-evidence-activation-classifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/transports/anthropic-messages-phase-policy.mjs',
  'src/transports/anthropic-messages-phase-transport.mjs',
  'src/transports/openai-compatible-phase-policy.mjs',
  'src/transports/openai-compatible-phase-transport.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/provider-backed-identity-cli-certification-fixture.mjs',
  'tests/provider-backed-identity-cli-certification.test.mjs',
  'tests/provider-backed-identity-cli-contracts.test.mjs',
  'tests/provider-backed-identity-cli-integration.test.mjs',
  'tests/provider-backed-identity-cli.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/provider-backed-identity-cli-contracts.test.mjs',
  'tests/provider-backed-identity-cli-integration.test.mjs',
  'tests/provider-backed-identity-cli.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirements = Object.freeze([
  ['APBIC-001', 'both supported families pass the same closed CLI boundary with distinct policy pin variables'],
  ['APBIC-002', 'canonical mission and identity digests bind the exact request and admission evidence'],
  ['APBIC-003', 'admission, identity, provider, and request failures happen before host construction or launch'],
  ['APBIC-004', 'explicit materialization ceilings and derived executor prefix are passed exactly to the certified launcher factory'],
  ['APBIC-005', 'no provider call occurs in the injected deterministic fixture'],
  ['APBIC-006', 'terminal projection accepts only linked, schema-valid, digest-valid, authority-empty completion evidence'],
  ['APBIC-007', 'malformed result and child-process parser paths keep stdout empty and emit only closed failure codes'],
  ['APBIC-008', 'credentials, paths, raw artifacts, and provider responses do not enter fixture output or terminal projections'],
  ['APBIC-009', 'two builds, source manifests, parent receipt, protected roots, independent review, ledger, and release lineage reproduce exactly'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));

const proofLimits = Object.freeze([
  'live provider quality, availability, latency, pricing, or truth are not certified',
  'credential possession or credential validity is not certified',
  'remote exactly-once execution is not certified',
  'the CLI does not choose a provider family from ambient state',
  'the CLI does not author, approve, sign, or mutate an identity policy',
  'no Realm, continuity, personal-keel, evolution, Inspiration, Lunari, or Soul authority is added',
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
  if (!same(value.paths, paths) || !Array.isArray(value.entries) || value.entries.length !== paths.length) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
  });
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'provider-backed identity cli test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'provider-backed identity cli test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('provider-backed identity cli test run is invalid');
    }
  }
}

function expectedParent() {
  return {
    path: parentReceiptPath,
    certificationId: parentCertificationId,
    status: 'certified',
    receiptDigest: parentReceiptDigest,
    fileSha256: parentFileSha256,
  };
}

function verifyParentBinding(value) {
  exactKeys(value, ['path', 'certificationId', 'status', 'receiptDigest', 'fileSha256'], 'provider-backed identity cli parent');
  if (!same(value, expectedParent())) throw new Error('provider-backed identity cli parent binding is invalid');
}

function verifyFamily(value, family) {
  exactKeys(value, [
    'family', 'providerPolicyDigest', 'identityPolicyDigest', 'missionRequestDigest',
    'admissionBindingDigest', 'explicitLimits', 'derivedExecutorIdPrefix',
    'hostConstructionCalls', 'providerCalls', 'success', 'assertions',
  ], 'provider-backed identity cli family fixture');
  if (value.family !== family) throw new Error('provider-backed identity cli family is invalid');
  for (const field of [
    'providerPolicyDigest', 'identityPolicyDigest', 'missionRequestDigest', 'admissionBindingDigest',
  ]) digest(value[field], field);
  exactKeys(value.explicitLimits, [
    'maximumReviewMaterializedBytes', 'maximumRevisionMaterializedBytes',
  ], 'provider-backed identity cli limits');
  if (value.explicitLimits.maximumReviewMaterializedBytes !== 65_536
      || value.explicitLimits.maximumRevisionMaterializedBytes !== 32_768
      || value.derivedExecutorIdPrefix !== `cli-${family}`
      || value.hostConstructionCalls !== 1
      || value.providerCalls !== 0) {
    throw new Error('provider-backed identity cli family binding is invalid');
  }
  exactKeys(value.success, ['exitCode', 'stdoutBytes', 'stderrBytes', 'projectionDigest'], 'provider-backed identity cli success');
  if (value.success.exitCode !== 0 || !Number.isSafeInteger(value.success.stdoutBytes)
      || value.success.stdoutBytes < 1 || value.success.stderrBytes !== 0) {
    throw new Error('provider-backed identity cli success evidence is invalid');
  }
  digest(value.success.projectionDigest, 'provider-backed identity cli projection');
  exactKeys(value.assertions, [
    'canonicalSuccessOutput', 'productionAdmissionTreePreflight',
    'productionIdentityPolicyPreflight', 'familyPinMatches', 'wrongFamilyPinAbsent',
    'exactRequestBound', 'exactIdentityDigestBound', 'exactProviderPolicyPathBound',
    'exactExecutorPrefixDerived', 'authorityClosed',
  ], 'provider-backed identity cli family assertions');
  for (const assertion of Object.values(value.assertions)) {
    if (assertion !== true) throw new Error('provider-backed identity cli family assertion is false');
  }
}

function verifyFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'parent', 'families', 'assertions', 'fixtureDigest',
  ], 'provider-backed identity cli fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-provider-backed-identity-cli-fixture-v1') {
    throw new Error('provider-backed identity cli fixture identity is invalid');
  }
  verifyParentBinding(value.parent);
  const families = ['anthropic-messages-v1', 'openai-compatible-chat-completions-v1'];
  if (!same(Object.keys(value.families).sort(), families)) {
    throw new Error('provider-backed identity cli fixture families are invalid');
  }
  for (const family of families) verifyFamily(value.families[family], family);
  const expectedMetrics = {
    authorityExpanded: false,
    deterministicRuns: 2,
    families: 2,
    failureStdoutBytes: 0,
    hostConstructionCalls: 2,
    malformedResultAccepted: 0,
    outputLeaks: 0,
    parentReceiptBound: true,
    providerCalls: 0,
  };
  if (!same(value.assertions, expectedMetrics)) {
    throw new Error('provider-backed identity cli fixture metrics are invalid');
  }
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'provider-backed identity cli fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) {
    throw new Error('provider-backed identity cli fixture digest mismatch');
  }
  return value;
}

function verifyReviewAttestation(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'reviewId', 'reviewer', 'baseCommit',
    'reviewedCommit', 'findings', 'priorFindingsResolved', 'verification',
    'disposition', 'summary', 'attestationDigest',
  ], 'provider-backed identity cli review attestation');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-independent-code-review-attestation-v1'
      || value.reviewId !== 'provider-backed-identity-cli-v1-terra'
      || value.disposition !== 'ready-for-receipt-generation'
      || !COMMIT.test(value.baseCommit)
      || value.baseCommit !== value.reviewedCommit
      || typeof value.summary !== 'string' || value.summary.length < 32
      || value.summary.length > 2_048) {
    throw new Error('provider-backed identity cli review identity is invalid');
  }
  exactKeys(value.reviewer, ['agentId', 'model'], 'provider-backed identity cli reviewer');
  if (value.reviewer.agentId !== expectedReviewAgentId || value.reviewer.model !== expectedReviewModel) {
    throw new Error('provider-backed identity cli reviewer identity is invalid');
  }
  exactKeys(value.findings, ['critical', 'important', 'minor'], 'provider-backed identity cli review findings');
  if (value.findings.critical !== 0 || value.findings.important !== 0
      || !Number.isSafeInteger(value.findings.minor) || value.findings.minor < 0) {
    throw new Error('provider-backed identity cli review has unresolved defects');
  }
  if (!Array.isArray(value.priorFindingsResolved)
      || value.priorFindingsResolved.some((finding) => {
        try {
          exactKeys(finding, ['id', 'severity', 'status'], 'provider-backed identity cli resolved finding');
          return !['critical', 'important', 'minor'].includes(finding.severity)
            || finding.status !== 'resolved'
            || typeof finding.id !== 'string' || finding.id.length < 3;
        } catch {
          return true;
        }
      })) {
    throw new Error('provider-backed identity cli prior finding resolution is invalid');
  }
  if (!Array.isArray(value.verification) || value.verification.length < 1
      || value.verification.some((entry) => {
        try {
          exactKeys(entry, ['command', 'result'], 'provider-backed identity cli review verification');
          return typeof entry.command !== 'string' || entry.command.length < 3
            || typeof entry.result !== 'string' || entry.result.length < 3;
        } catch {
          return true;
        }
      })) {
    throw new Error('provider-backed identity cli review verification is invalid');
  }
  const { attestationDigest, ...unsigned } = value;
  digest(attestationDigest, 'provider-backed identity cli attestation digest');
  if (attestationDigest !== sha256Value(unsigned)) {
    throw new Error('provider-backed identity cli attestation digest mismatch');
  }
  return value;
}

function verifyRequirements(value) {
  if (!same(value, requirements)) throw new Error('provider-backed identity cli requirements are invalid');
}

function verifyReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'parent', 'source',
    'fixture', 'requirements', 'metrics', 'testRuns', 'review', 'proofLimits',
    'receiptDigest',
  ], 'provider-backed identity cli receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('provider-backed identity cli receipt identity is invalid');
  }
  verifyParentBinding(value.parent);
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'protectedTrustRoots',
    'implementationManifest', 'testManifest',
  ], 'provider-backed identity cli source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('provider-backed identity cli source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  if (!same(value.source.protectedTrustRoots, protectedTrustRoots)) {
    throw new Error('provider-backed identity cli protected trust roots are invalid');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'provider-backed identity cli implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'provider-backed identity cli test manifest');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'provider-backed identity cli receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('provider-backed identity cli fixture binding is invalid');
  }
  verifyRequirements(value.requirements);
  if (!same(value.metrics, fixture.assertions)) {
    throw new Error('provider-backed identity cli receipt metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  exactKeys(value.review, [
    'mode', 'independent', 'path', 'fileSha256', 'value',
    'unresolvedCriticalDefects', 'unresolvedImportantDefects',
  ], 'provider-backed identity cli receipt review');
  const attestation = verifyReviewAttestation(value.review.value);
  if (value.review.mode !== 'independent-terra' || value.review.independent !== true
      || value.review.path !== reviewPath
      || value.review.fileSha256 !== sha256Text(`${canonicalJson(attestation)}\n`)
      || value.review.unresolvedCriticalDefects !== attestation.findings.critical
      || value.review.unresolvedImportantDefects !== attestation.findings.important) {
    throw new Error('provider-backed identity cli review binding is invalid');
  }
  if (!same(value.proofLimits, proofLimits)) {
    throw new Error('provider-backed identity cli proof limits are invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'provider-backed identity cli receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) {
    throw new Error('provider-backed identity cli receipt digest mismatch');
  }
  return value;
}

export function verifyProviderBackedIdentityCliReceipt(value) {
  return verifyReceipt(value);
}

export async function buildProviderBackedIdentityCliReceiptFromSource({
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
    throw new Error('provider-backed identity cli fixture is not canonical');
  }

  const parentText = await gitText(root, sourceCommit, parentReceiptPath);
  const parentReceipt = JSON.parse(parentText);
  verifyAdmittedProviderBackedIdentityLauncherReceipt(parentReceipt);
  if (sha256Text(parentText) !== parentFileSha256
      || parentReceipt.certificationId !== parentCertificationId
      || parentReceipt.status !== 'certified'
      || parentReceipt.receiptDigest !== parentReceiptDigest) {
    throw new Error('provider-backed identity cli parent receipt changed');
  }
  if (!same(fixture.parent, expectedParent())) {
    throw new Error('provider-backed identity cli fixture parent is not canonical');
  }

  const actualRoots = Object.fromEntries(await Promise.all(
    Object.keys(protectedTrustRoots).map(async (path) => [
      path,
      sha256Text(await gitText(root, sourceCommit, path)),
    ]),
  ));
  if (!same(actualRoots, protectedTrustRoots)) {
    throw new Error('provider-backed identity cli protected trust root changed');
  }

  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const attestation = verifyReviewAttestation(JSON.parse(reviewText));
  if (reviewText !== `${canonicalJson(attestation)}\n`) {
    throw new Error('provider-backed identity cli review attestation is not canonical');
  }
  await assertCommit(root, attestation.baseCommit);
  await assertCommit(root, attestation.reviewedCommit);
  if (!same(await changedPathsBetween(root, attestation.baseCommit, attestation.reviewedCommit), [])) {
    throw new Error('provider-backed identity cli review base is not the reviewed candidate');
  }
  if (!same(await changedPathsBetween(root, attestation.reviewedCommit, sourceCommit), [reviewPath])) {
    throw new Error('provider-backed identity cli source changed outside the review artifact');
  }

  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    parent: expectedParent(),
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
  return Object.freeze(verifyReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
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
  const preliminary = await buildProviderBackedIdentityCliReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildProviderBackedIdentityCliReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/provider-backed-identity-cli-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeFile(join(root, ...certificationPath.split('/')), `# provider-backed identity cli v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies the bounded provider-backed identity CLI operator surface for both registered provider families. It includes real admission and identity-policy preflight, SDK-issued host construction, deterministic no-network execution, closed output and failure behavior, and source-bound evidence. It does not certify live provider quality or add authority to the existing identity-bound launcher.\n`, 'utf8');
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
