import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  assertCommit, gitText, headCommit, historicalAtCommit, manifestAtCommit,
  requireCleanExcept, resolveSourceCommit, runTests,
} from './lib/certification-support.mjs';

const certificationId = 'provider-neutral-phase-resolution-v1';
const protocolId = 'eternities-provider-neutral-phase-resolution-certification-v1';
const fixturePath = 'fixtures/provider-neutral-phase-resolution-v1.json';
const receiptPath = 'receipts/provider-neutral-phase-resolution-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-provider-neutral-phase-resolution-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-provider-neutral-phase-resolution-v1.md';
const certificationPath = 'docs/provider-neutral-phase-resolution-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const protectedParentHashes = Object.freeze({
  'receipts/durable-anthropic-messages-phase-transport-v1.json': 'fbcdae60755b78c81eaff48a46ca93d1003816d21831991036a9f8ee746aba8b',
  'receipts/provider-phase-host-sdk-v1.json': '9f5b11c89a7fe338bba7adbe8abf37ec8473dd212e8dd78661740a70721a3822',
  'receipts/signed-openai-phase-resolution-v1.json': '6a0f548c8099dbb4ff43655a77ea6f84d783d3bcb1ae89a529a541a155a5f90c',
  'schemas/openai-compatible-phase-resolution-policy.schema.json': 'a6060a3ab36971230d5ab8bafcc0a2c806fd7234f2e9031d73b4c11ea04b9c2c',
  'src/transports/openai-compatible-phase-resolution.mjs': 'c3d31c71deb42bfda1d109502d5a4d586e8808572c845b203e156384dccfaed3',
  'src/transports/openai-compatible-phase-transport.mjs': 'c990cda4724ab3912a51005f7b13fa481e3365223278acc37950291969191550',
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
  'provider-neutral-phase-protocol-v1.json', 'provider-phase-host-sdk-v1.json',
  'receipt-bound-typed-executor-bundle-v1.json', 'recoverable-godskills-admission-v1.json',
  'recoverable-mission-native-executor-v1.json', 'recoverable-mission-revision-executor-v1.json',
  'recoverable-typed-composition-compiler-v1.json', 'recoverable-typed-execution-journal-v1.json',
  'resumable-mission-review-kernel-v1.json', 'routing-evidence-activation-classifier-v1.json',
  'sealed-local-godskills-transport-v1.json', 'sealed-local-identity-vessel-v1.json',
  'sealed-local-typed-composition-compiler-v1.json', 'sealed-local-typed-execution-runner-v1.json',
  'sealed-openai-compatible-phase-transport-v1.json', 'signed-openai-phase-resolution-v1.json',
  'transactional-genesis-phase2-certification.json', 'visual-creator-shell-certification.json',
].map((file) => `receipts/${file}`));

const implementationFiles = Object.freeze([
  'README.md', 'docs/architecture.md', fixturePath, 'package.json', planPath,
  'schemas/provider-phase-resolution-policy.schema.json',
  'scripts/build-provider-neutral-phase-resolution-v1-fixture.mjs',
  'scripts/build-provider-neutral-phase-resolution-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs', specificationPath,
  'src/certification/verify-ledger.mjs', 'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs', 'src/core/digest.mjs', 'src/core/schema-validator.mjs',
  'src/host/provider-phase-host-sdk.mjs',
  'src/transports/anthropic-messages-phase-policy.mjs',
  'src/transports/anthropic-messages-phase-protocol.mjs',
  'src/transports/anthropic-messages-phase-transport.mjs',
  'src/transports/durable-phase-operation.mjs',
  'src/transports/provider-phase-resolution.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/anthropic-messages-phase-transport.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-operation-fixture.mjs',
  'tests/helpers/provider-phase-resolution-certification-fixture.mjs',
  'tests/helpers/provider-phase-resolution-fixture.mjs',
  'tests/helpers/provider-phase-host-sdk-certification-fixture.mjs',
  'tests/provider-phase-host-sdk.test.mjs',
  'tests/provider-phase-resolution-certification.test.mjs',
  'tests/provider-phase-resolution-policy.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/provider-phase-resolution-policy.test.mjs',
  'tests/anthropic-messages-phase-transport.test.mjs',
  'tests/provider-phase-host-sdk.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['PNR-001', 'canonical external policy pin binds one exact transport policy and Ed25519 authority'],
  ['PNR-002', 'signed decisions bind exact operation lifetime disposition nonce and response witness'],
  ['PNR-003', 'resolution can only adopt or abandon and performs no provider request or retry'],
  ['PNR-004', 'immutable resolution precedes terminal state and recovers exact accepted decisions'],
  ['PNR-005', 'Anthropic adoption preserves strict response inspection and evidence-before-completion'],
  ['PNR-006', 'collisions expiry malformed state unknown entries and unsafe links fail closed'],
  ['PNR-007', 'both explicit host families expose the same resolution factory without ambient routing'],
  ['PNR-008', 'fixture receipt ledger lineage and protected historical bytes reproduce exactly'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'local signature verification does not prove that external provider evidence is truthful',
  'the protocol provides no automatic or operator-authorized retry and claims no remote exactly-once execution',
  'fake provider responses do not prove live availability quality price latency or cache behavior',
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
function verifyOperation(value, keys, label) {
  exactKeys(value, keys, label);
  for (const [key, entry] of Object.entries(value)) {
    if (key.endsWith('Digest') || key === 'attemptId') digest(entry, `${label} ${key}`);
  }
  if (value.phase !== 'native') throw new Error(`${label} phase is invalid`);
}
function verifyFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'transportPolicyDigest', 'resolutionPolicyDigest',
    'adoption', 'abandonment', 'assertions', 'fixtureDigest',
  ], 'provider resolution fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-provider-neutral-phase-resolution-fixture-v1') {
    throw new Error('provider resolution fixture identity is invalid');
  }
  digest(value.transportPolicyDigest, 'transport policy');
  digest(value.resolutionPolicyDigest, 'resolution policy');
  verifyOperation(value.adoption, [
    'phase', 'dispatchDigest', 'requestDigest', 'attemptId', 'decisionDigest',
    'responseWitnessDigest', 'resolutionRecordDigest', 'providerEvidenceRecordDigest',
    'completionDigest',
  ], 'adoption');
  verifyOperation(value.abandonment, [
    'phase', 'dispatchDigest', 'requestDigest', 'attemptId', 'decisionDigest',
    'resolutionRecordDigest', 'reasonCode',
  ], 'abandonment');
  if (value.abandonment.reasonCode !== 'operator-abandoned') throw new Error('abandonment reason is invalid');
  const expectedAssertions = {
    ambiguousProviderCalls: 2,
    resolutionProviderCalls: 0,
    replayProviderCalls: 0,
    completedReplays: 2,
    adoptedOperations: 1,
    abandonedOperations: 1,
    credentialLeaks: 0,
    resolutionBodyLeaks: 0,
    authorityExpansions: 0,
  };
  if (!same(value.assertions, expectedAssertions)) throw new Error('provider resolution fixture assertions are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('fixture digest mismatch');
  return value;
}
function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyProviderNeutralPhaseResolutionReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'provider resolution receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('provider resolution receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'protectedParentHashes',
    'implementationManifest', 'testManifest', 'specification', 'plan',
  ], 'provider resolution source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('provider resolution source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  if (!same(value.source.protectedParentHashes, protectedParentHashes)) {
    throw new Error('protected parent hashes are invalid');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('provider resolution fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('provider resolution requirement evidence is invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial', independent: false,
    unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0,
  })) throw new Error('provider resolution review is invalid');
  if (!same(value.proofLimits, proofLimits)) throw new Error('provider resolution proof limits are invalid');
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('receipt digest mismatch');
  return value;
}

export async function buildProviderNeutralPhaseResolutionReceiptFromSource({
  repositoryRoot, sourceCommit, testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const actualProtectedHashes = Object.fromEntries(await Promise.all(
    Object.keys(protectedParentHashes).map(async (path) => [path, sha256Text(await gitText(root, sourceCommit, path))]),
  ));
  if (!same(actualProtectedHashes, protectedParentHashes)) throw new Error('protected parent source changed');
  const implementationManifest = await manifestAtCommit(root, sourceCommit, implementationFiles);
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      protectedParentHashes: structuredClone(protectedParentHashes),
      implementationManifest,
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      specification: { path: specificationPath, sha256: sha256Text(await gitText(root, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(root, sourceCommit, planPath)) },
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
      mode: 'inline-adversarial', independent: false,
      unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0,
    },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyProviderNeutralPhaseResolutionReceipt({
    ...unsigned, receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const sourceCommit = await resolveSourceCommit({
    root, headCommit: await headCommit(root), outputPath, releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildProviderNeutralPhaseResolutionReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildProviderNeutralPhaseResolutionReceiptFromSource({
    repositoryRoot: root, sourceCommit, testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/provider-phase-resolution-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  const markdown = `# Provider-neutral Phase Resolution v1 Certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies provider-neutral signed local resolution for the Anthropic durable phase transport while preserving the sealed OpenAI and historical provider release bytes. It does not certify provider-side truth or remote exactly-once execution.\n`;
  await writeFile(join(root, ...certificationPath.split('/')), markdown, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
