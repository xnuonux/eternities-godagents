import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  assertCommit, gitText, headCommit, historicalAtCommit, manifestAtCommit,
  requireCleanExcept, resolveSourceCommit, runTests,
} from './lib/certification-support.mjs';

const certificationId = 'provider-resolution-profile-v1';
const protocolId = 'eternities-provider-resolution-profile-certification-v1';
const fixturePath = 'fixtures/provider-resolution-profile-v1.json';
const receiptPath = 'receipts/provider-resolution-profile-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-provider-resolution-profile-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-provider-resolution-profile-v1.md';
const certificationPath = 'docs/provider-resolution-profile-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const families = Object.freeze(['anthropic-messages-v1', 'openai-compatible-chat-completions-v1']);

const protectedTrustRoots = Object.freeze({
  'receipts/durable-anthropic-messages-phase-transport-v1.json': 'fbcdae60755b78c81eaff48a46ca93d1003816d21831991036a9f8ee746aba8b',
  'receipts/provider-neutral-phase-resolution-v1.json': 'd439e6fd0904ecc1dec2424ed1a7b70bc8aee9fb5ea1a7169bfbd05377967d2c',
  'receipts/signed-openai-phase-resolution-v1.json': '6a0f548c8099dbb4ff43655a77ea6f84d783d3bcb1ae89a529a541a155a5f90c',
  'schemas/openai-compatible-phase-resolution-policy.schema.json': 'a6060a3ab36971230d5ab8bafcc0a2c806fd7234f2e9031d73b4c11ea04b9c2c',
  'schemas/provider-phase-resolution-policy.schema.json': 'e9f9eba3e2c27588e2dfd1a124794567ac7718dc10b93680cf6cce060a38ae96',
  'src/transports/anthropic-messages-phase-transport.mjs': '46ee2cb281aff3ef4ae97039b6849904823dff29b563fa2b7debeff40555a000',
  'src/transports/durable-phase-operation.mjs': '134ca9250530d21de0d77863d2e9f4eb34e2322968c5550d0a75ddce2da02367',
  'src/transports/openai-compatible-phase-resolution.mjs': 'c3d31c71deb42bfda1d109502d5a4d586e8808572c845b203e156384dccfaed3',
  'src/transports/openai-compatible-phase-transport.mjs': 'c990cda4724ab3912a51005f7b13fa481e3365223278acc37950291969191550',
  'src/transports/provider-phase-resolution.mjs': '554ada426235ee8f61dbbcccfa9e8886d8137bb6d1450c034d805c5fe60f6e58',
});

const historicalReceiptPaths = Object.freeze([
  'admitted-sealed-identity-host-v1.json', 'admitted-sealed-typed-execution-host-v1.json',
  'codex-bound-turn-v1.json', 'codex-recoverable-turn-coordinator-v1.json',
  'codex-recoverable-turn-journal-v1.json', 'cortex-binding-contracts-v1.json',
  'cortex-binding-registry-v1.json', 'creation-forge-phase1-certification.json',
  'creator-protocol-phase3-certification.json', 'deferred-godskills-review-executor-v1.json',
  'deferred-godskills-review-materializer-v1.json', 'durable-anthropic-messages-phase-transport-v1.json',
  'godagent-v0-certification.json', 'godskills-adaptive-activation-v1.json',
  'godskills-specialist-preference-v1.json', 'godskills-typed-composition-consumer-v1.json',
  'godskills-v3-integration.json', 'identity-bound-mission-vessel-v1.json',
  'local-admission-shell-certification.json', 'networked-cortex-certification.json',
  'provider-neutral-phase-protocol-v1.json', 'provider-neutral-phase-resolution-v1.json',
  'provider-phase-host-sdk-v1.json', 'receipt-bound-typed-executor-bundle-v1.json',
  'recoverable-godskills-admission-v1.json', 'recoverable-mission-native-executor-v1.json',
  'recoverable-mission-revision-executor-v1.json', 'recoverable-typed-composition-compiler-v1.json',
  'recoverable-typed-execution-journal-v1.json', 'resumable-mission-review-kernel-v1.json',
  'routing-evidence-activation-classifier-v1.json', 'sealed-local-godskills-transport-v1.json',
  'sealed-local-identity-vessel-v1.json', 'sealed-local-typed-composition-compiler-v1.json',
  'sealed-local-typed-execution-runner-v1.json', 'sealed-openai-compatible-phase-transport-v1.json',
  'signed-openai-phase-resolution-v1.json', 'transactional-genesis-phase2-certification.json',
  'visual-creator-shell-certification.json',
].map((file) => `receipts/${file}`));

const implementationFiles = Object.freeze([
  'README.md', 'docs/architecture.md', fixturePath, 'package.json', planPath,
  'scripts/build-provider-resolution-profile-v1-fixture.mjs',
  'scripts/build-provider-resolution-profile-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs', specificationPath,
  'src/certification/verify-ledger.mjs', 'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs', 'src/core/digest.mjs',
  'src/host/provider-phase-host-sdk.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-resolution-fixture.mjs',
  'tests/helpers/provider-phase-resolution-fixture.mjs',
  'tests/helpers/provider-resolution-profile-certification-fixture.mjs',
  'tests/provider-phase-host-sdk.test.mjs',
  'tests/provider-resolution-profile-certification.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/provider-phase-host-sdk.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['PRP-001', 'each family description binds exact signed resolution protocols and pin variable'],
  ['PRP-002', 'response witness decision fields and evidence publication profiles stay explicit'],
  ['PRP-003', 'no-retry zero-provider-call and accepted-recovery guarantees are common and exact'],
  ['PRP-004', 'cross-family resolution profile substitution fails after outer description rehash'],
  ['PRP-005', 'both family profiles construct one common controller surface without provider work'],
  ['PRP-006', 'profile discovery retains no credential endpoint model path private key or routing default'],
  ['PRP-007', 'both existing signed trust roots and durable transports remain byte-identical'],
  ['PRP-008', 'fixture receipt ledger lineage and source manifests reproduce exactly'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'profiles describe but do not translate or merge provider signing protocols',
  'profile integrity does not prove that external provider outcome evidence is truthful',
  'no retry provider routing live quality availability price latency or cache behavior is certified',
  'no default CLI Realm continuity identity evolution Inspiration Lunari or Soul behavior changes',
]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}
function same(left, right) { return canonicalJson(left) === canonicalJson(right); }
function digest(value, label) { if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`); }
function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!same(value.paths, paths) || value.entries.length !== paths.length) throw new Error(`${label} paths are invalid`);
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256)
        || !Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry is invalid`);
  });
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}
function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'test run');
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) throw new Error('test run is invalid');
  }
}
function verifyProfile(value) {
  exactKeys(value, [
    'policyProtocolId', 'decisionProtocolId', 'responseWitnessProtocolId',
    'resolutionRecordProtocolId', 'externalPolicyPinVariable',
    'responseWitnessDigestField', 'dispositions', 'providerEvidencePublicationProfile',
    'automaticRetry', 'providerCallsDuringResolution', 'acceptedDecisionRecoveryAfterExpiry',
  ], 'resolution profile');
  if (!same(value.dispositions, ['adopt-response', 'abandon']) || value.automaticRetry !== false
      || value.providerCallsDuringResolution !== 0 || value.acceptedDecisionRecoveryAfterExpiry !== true) {
    throw new Error('resolution profile safety invariants are invalid');
  }
  for (const key of [
    'policyProtocolId', 'decisionProtocolId', 'responseWitnessProtocolId',
    'resolutionRecordProtocolId', 'externalPolicyPinVariable',
    'responseWitnessDigestField', 'providerEvidencePublicationProfile',
  ]) if (typeof value[key] !== 'string' || value[key].length < 1) throw new Error('resolution profile value is invalid');
}
function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'families', 'assertions', 'fixtureDigest'], 'profile fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-provider-resolution-profile-fixture-v1'
      || !same(Object.keys(value.families), families)) throw new Error('profile fixture identity is invalid');
  for (const family of Object.values(value.families)) {
    exactKeys(family, [
      'transportPolicyDigest', 'descriptionDigest', 'resolutionProfile',
      'resolutionProfileDigest', 'resolutionPolicyDigest', 'authorityKeyId', 'controllerSurface',
    ], 'profile family');
    digest(family.transportPolicyDigest, 'transport policy');
    digest(family.descriptionDigest, 'description');
    digest(family.resolutionPolicyDigest, 'resolution policy');
    digest(family.resolutionProfileDigest, 'resolution profile');
    verifyProfile(family.resolutionProfile);
    if (family.resolutionProfileDigest !== sha256Value(family.resolutionProfile)
        || !same(family.controllerSurface, ['authorityKeyId', 'inspect', 'policyDigest', 'resolve'])
        || typeof family.authorityKeyId !== 'string' || family.authorityKeyId.length < 1) {
      throw new Error('profile family evidence is invalid');
    }
  }
  const expected = {
    families: 2, providerCalls: 0, credentialLeaks: 0, controllerSurfaceParity: true,
    distinctProfileDigests: 2, sharedNoRetry: true, sharedZeroProviderCalls: true,
    sharedAcceptedRecovery: true, explicitDecisionProtocolDifference: true,
    explicitWitnessFieldDifference: true,
  };
  if (!same(value.assertions, expected)) throw new Error('profile fixture assertions are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('profile fixture digest mismatch');
  return value;
}
function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyProviderResolutionProfileReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'profile receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) throw new Error('profile receipt identity is invalid');
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'protectedTrustRoots',
    'implementationManifest', 'testManifest', 'specification', 'plan',
  ], 'profile source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('profile source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  if (!same(value.source.protectedTrustRoots, protectedTrustRoots)) throw new Error('protected trust roots are invalid');
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) throw new Error('profile fixture binding is invalid');
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('profile requirement evidence is invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial', independent: false,
    unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0,
  })) throw new Error('profile review is invalid');
  if (!same(value.proofLimits, proofLimits)) throw new Error('profile proof limits are invalid');
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('profile receipt digest mismatch');
  return value;
}

export async function buildProviderResolutionProfileReceiptFromSource({ repositoryRoot, sourceCommit, testRuns } = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const actualTrustRoots = Object.fromEntries(await Promise.all(
    Object.keys(protectedTrustRoots).map(async (path) => [path, sha256Text(await gitText(root, sourceCommit, path))]),
  ));
  if (!same(actualTrustRoots, protectedTrustRoots)) throw new Error('protected trust root changed');
  const implementationManifest = await manifestAtCommit(root, sourceCommit, implementationFiles);
  const unsigned = {
    schemaVersion: 1, certificationId, status: 'certified', protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      protectedTrustRoots: structuredClone(protectedTrustRoots),
      implementationManifest,
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      specification: { path: specificationPath, sha256: sha256Text(await gitText(root, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(root, sourceCommit, planPath)) },
    },
    fixture: { path: fixturePath, fileSha256: sha256Text(fixtureText), logicalDigest: fixture.fixtureDigest, value: fixture },
    requirements: structuredClone(requirements),
    metrics: structuredClone(fixture.assertions),
    testRuns: structuredClone(testRuns),
    review: { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyProviderResolutionProfileReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const sourceCommit = await resolveSourceCommit({
    root, headCommit: await headCommit(root), outputPath, releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildProviderResolutionProfileReceiptFromSource({
    repositoryRoot: root, sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildProviderResolutionProfileReceiptFromSource({
    repositoryRoot: root, sourceCommit, testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/provider-resolution-profile-certification.test.mjs',
    'tests/certification-ledger.test.mjs', 'tests/release-lineage.test.mjs',
  ], root);
  const markdown = `# Provider Resolution Profile v1 Certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies exact machine-readable signed-resolution discovery for both provider families while preserving both signed trust roots byte-for-byte. It does not translate signatures or prove provider-side outcome truth.\n`;
  await writeFile(join(root, ...certificationPath.split('/')), markdown, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
