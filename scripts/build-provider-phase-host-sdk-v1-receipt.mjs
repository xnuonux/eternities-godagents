import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  assertCommit, gitText, headCommit, historicalAtCommit, manifestAtCommit,
  requireCleanExcept, resolveSourceCommit, runTests,
} from './lib/certification-support.mjs';

const certificationId = 'provider-phase-host-sdk-v1';
const protocolId = 'eternities-provider-phase-host-sdk-certification-v1';
const fixturePath = 'fixtures/provider-phase-host-sdk-v1.json';
const receiptPath = 'receipts/provider-phase-host-sdk-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-provider-phase-host-sdk-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-provider-phase-host-sdk-v1.md';
const certificationPath = 'docs/provider-phase-host-sdk-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const families = Object.freeze(['anthropic-messages-v1', 'openai-compatible-chat-completions-v1']);
const expectedCapabilities = Object.freeze({
  'anthropic-messages-v1': Object.freeze({
    credentialPreflight: true,
    durableExecution: true,
    localDispatchSemantics: 'at-most-once',
    phases: Object.freeze(['native', 'review', 'revision']),
    providerEvidenceProfile: 'completion-bound-sidecar',
    signedAmbiguityResolutionAvailable: false,
    structuredOutputs: true,
    wireProfile: 'anthropic-messages',
  }),
  'openai-compatible-chat-completions-v1': Object.freeze({
    credentialPreflight: true,
    durableExecution: true,
    localDispatchSemantics: 'at-most-once',
    phases: Object.freeze(['native', 'review', 'revision']),
    providerEvidenceProfile: 'normalized-completion-usage',
    signedAmbiguityResolutionAvailable: true,
    structuredOutputs: true,
    wireProfile: 'openai-compatible-chat-completions',
  }),
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
  'provider-neutral-phase-protocol-v1.json', 'receipt-bound-typed-executor-bundle-v1.json',
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
  'scripts/build-provider-phase-host-sdk-v1-fixture.mjs',
  'scripts/build-provider-phase-host-sdk-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs', specificationPath,
  'src/certification/verify-ledger.mjs', 'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs', 'src/core/digest.mjs',
  'src/host/provider-phase-host-sdk.mjs',
  'src/transports/anthropic-messages-phase-transport.mjs',
  'src/transports/openai-compatible-phase-transport.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-operation-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/provider-phase-host-conformance.mjs',
  'tests/helpers/provider-phase-host-sdk-certification-fixture.mjs',
  'tests/provider-phase-host-sdk-certification.test.mjs',
  'tests/provider-phase-host-sdk.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/provider-phase-host-sdk.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['PHS-001', 'provider family selection is explicit closed and never ambient'],
  ['PHS-002', 'both certified families expose one exact common host surface'],
  ['PHS-003', 'descriptions bind family policy capabilities and exact phase descriptors'],
  ['PHS-004', 'cross-family descriptor substitution fails after outer rehash'],
  ['PHS-005', 'one harness proves native review revision and exact replay for both families'],
  ['PHS-006', 'credential preflight and descriptions retain no credential or provider work'],
  ['PHS-007', 'capability differences remain explicit and provider-specific extensions stay outside'],
  ['PHS-008', 'fixture receipt ledger lineage and historical provider receipts reproduce exactly'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'fake provider responses do not prove live availability quality price latency or equivalence',
  'the sdk performs no automatic provider selection fallback or failover',
  'provider-specific signed resolution is not exposed through the common host',
  'no default host CLI Realm continuity identity evolution Inspiration Lunari or Soul change',
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
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256) || !Number.isInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
  });
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}
function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'test runs');
  for (const run of Object.values(value)) {
    if (!same(Object.keys(run).sort(), ['status', 'tests']) || run.status !== 'pass'
        || !Number.isInteger(run.tests) || run.tests < 1) throw new Error('test run is invalid');
  }
}
function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'families', 'assertions', 'fixtureDigest'], 'sdk fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-provider-phase-host-sdk-fixture-v1'
      || !same(Object.keys(value.families), families)) throw new Error('sdk fixture identity is invalid');
  for (const [family, record] of Object.entries(value.families)) {
    exactKeys(record, [
      'policyDigest', 'descriptionDigest', 'capabilities', 'descriptorDigests',
      'completedPhases', 'completionDigests', 'providerCalls', 'replayProviderCalls', 'authorityExpansions',
    ], 'sdk family');
    digest(record.policyDigest, 'family policy'); digest(record.descriptionDigest, 'family description');
    if (!same(Object.keys(record.descriptorDigests), ['native', 'review', 'revision'])
        || !same(Object.keys(record.completionDigests), ['native', 'review', 'revision'])) throw new Error('sdk phase set is invalid');
    Object.values(record.descriptorDigests).forEach((value) => digest(value, 'descriptor'));
    Object.values(record.completionDigests).forEach((value) => digest(value, 'completion'));
    if (!same(record.capabilities, expectedCapabilities[family])
        || !same(record.completedPhases, ['native', 'review', 'revision']) || record.providerCalls !== 3
        || record.replayProviderCalls !== 0 || record.authorityExpansions !== 0
        || record.capabilities.signedAmbiguityResolutionAvailable !== family.startsWith('openai-')) {
      throw new Error('sdk family conformance is invalid');
    }
  }
  const expected = {
    families: 2, completedPhases: 6, providerCalls: 6, replayProviderCalls: 0,
    authorityExpansions: 0, credentialLeaks: 0, explicitCapabilityDifferences: true, commonSurfaceParity: true,
  };
  if (!same(value.assertions, expected)) throw new Error('sdk fixture assertions are invalid');
  const { fixtureDigest, ...unsigned } = value; digest(fixtureDigest, 'fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('fixture digest mismatch');
  return value;
}
function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyProviderPhaseHostSdkReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'sdk receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) throw new Error('sdk receipt identity is invalid');
  exactKeys(value.source, ['commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest', 'specification', 'plan'], 'sdk source');
  if (!COMMIT.test(value.source.commit) || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('sdk source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((value) => digest(value, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'sdk receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) throw new Error('sdk fixture binding is invalid');
  if (!same(value.requirements, requirements)) throw new Error('sdk requirements are invalid');
  if (!same(value.metrics, fixture.assertions)) throw new Error('sdk metrics are invalid');
  verifyTestRuns(value.testRuns);
  if (!same(value.review, { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 })) {
    throw new Error('sdk review is invalid');
  }
  if (!same(value.proofLimits, proofLimits)) throw new Error('sdk proof limits are invalid');
  const { receiptDigest, ...unsigned } = value; digest(receiptDigest, 'receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('receipt digest mismatch');
  return value;
}

export async function buildProviderPhaseHostSdkReceiptFromSource({ repositoryRoot, sourceCommit, testRuns } = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit); verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const implementationManifest = await manifestAtCommit(root, sourceCommit, implementationFiles);
  const unsigned = {
    schemaVersion: 1, certificationId, status: 'certified', protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      implementationManifest,
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      specification: { path: specificationPath, sha256: sha256Text(await gitText(root, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(root, sourceCommit, planPath)) },
    },
    fixture: { path: fixturePath, fileSha256: sha256Text(fixtureText), logicalDigest: fixture.fixtureDigest, value: fixture },
    requirements: structuredClone(requirements), metrics: structuredClone(fixture.assertions),
    testRuns: structuredClone(testRuns),
    review: { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyProviderPhaseHostSdkReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const sourceCommit = await resolveSourceCommit({
    root, headCommit: await headCommit(root), outputPath, releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildProviderPhaseHostSdkReceiptFromSource({
    repositoryRoot: root, sourceCommit, testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildProviderPhaseHostSdkReceiptFromSource({ repositoryRoot: root, sourceCommit, testRuns: { focused, full } });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/provider-phase-host-sdk-certification.test.mjs',
    'tests/certification-ledger.test.mjs', 'tests/release-lineage.test.mjs',
  ], root);
  const markdown = `# Provider Phase Host SDK v1 Certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies explicit cross-family construction and common three-phase conformance under deterministic fake-provider responses. It does not certify live provider quality or automatic selection.\n`;
  await writeFile(join(root, ...certificationPath.split('/')), markdown, 'utf8');
  process.stdout.write(`${canonicalJson({ status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest, fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release })}\n`);
}
const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
