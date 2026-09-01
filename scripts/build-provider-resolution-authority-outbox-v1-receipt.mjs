import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  assertCommit, gitText, headCommit, historicalAtCommit, manifestAtCommit,
  requireCleanExcept, resolveSourceCommit, runTests,
} from './lib/certification-support.mjs';

const certificationId = 'provider-resolution-authority-outbox-v1';
const protocolId = 'eternities-provider-resolution-authority-outbox-certification-v1';
const fixturePath = 'fixtures/provider-resolution-authority-outbox-v1.json';
const receiptPath = 'receipts/provider-resolution-authority-outbox-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-provider-resolution-authority-outbox-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-provider-resolution-authority-outbox-v1.md';
const certificationPath = 'docs/provider-resolution-authority-outbox-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const protectedTrustRoots = Object.freeze({
  'receipts/provider-neutral-phase-resolution-v1.json': 'd439e6fd0904ecc1dec2424ed1a7b70bc8aee9fb5ea1a7169bfbd05377967d2c',
  'receipts/provider-resolution-authority-handoff-v1.json': '8dd327d11bb21efcb098c176ce48d98b769ffc833df02adb2a83b05a69cec8b0',
  'receipts/provider-resolution-decision-preparer-v1.json': '5c7209a21839e544aa97c2ffb5ab3e0881223ad377c92dcc0c3c2581e2f7159b',
  'receipts/provider-resolution-profile-v1.json': 'fd0a1b06b3057a79049049de1caee94c2845256ad326a98e31d4ed3bd4ffa7bb',
  'receipts/signed-openai-phase-resolution-v1.json': '6a0f548c8099dbb4ff43655a77ea6f84d783d3bcb1ae89a529a541a155a5f90c',
  'src/host/provider-phase-host-sdk.mjs': '4abc35d90b02b47dbb44b42f925099d3e2e9f4c594471197931d5c639ed07523',
  'src/host/provider-phase-resolution-decision-preparer.mjs': 'a8cb457046d25cb2b57df0e2080f0f3f1744eaa3ac427872e6a8e19c379b6a3e',
  'src/host/provider-resolution-authority-handoff.mjs': 'df1f4dfaf7f2a5dbbf99b7f841dc2d84468cacb066900f0858d45e3eb3f06941',
  'src/transports/openai-compatible-phase-resolution.mjs': 'c3d31c71deb42bfda1d109502d5a4d586e8808572c845b203e156384dccfaed3',
  'src/transports/provider-phase-resolution.mjs': '554ada426235ee8f61dbbcccfa9e8886d8137bb6d1450c034d805c5fe60f6e58',
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
  specificationPath, 'scripts/build-provider-resolution-authority-outbox-v1-fixture.mjs',
  'scripts/build-provider-resolution-authority-outbox-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs', 'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs', 'src/core/canonical-json.mjs',
  'src/core/digest.mjs', 'src/host/provider-phase-host-sdk.mjs',
  'src/host/provider-phase-resolution-decision-preparer.mjs',
  'src/host/provider-resolution-authority-handoff.mjs',
  'src/host/provider-resolution-authority-outbox.mjs', 'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs', 'src/transports/openai-compatible-phase-resolution.mjs',
  'src/transports/provider-phase-resolution.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-operation-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-resolution-fixture.mjs',
  'tests/helpers/provider-phase-resolution-fixture.mjs',
  'tests/helpers/provider-resolution-authority-outbox-certification-fixture.mjs',
  'tests/provider-resolution-authority-outbox-certification.test.mjs',
  'tests/provider-resolution-authority-outbox.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/provider-resolution-authority-outbox.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['PRAO-001', 'both provider families publish exact canonical signing requests and signed returns'],
  ['PRAO-002', 'adoption and abandonment resolve through the existing real controllers without redispatch'],
  ['PRAO-003', 'request signed-return and terminal publication survive every injected process boundary'],
  ['PRAO-004', 'raw provider responses credentials private keys and model artifacts never enter outbox state'],
  ['PRAO-005', 'changed signatures responses operation bindings and unknown entries fail closed'],
  ['PRAO-006', 'operation locks prevent concurrent duplicate controller acceptance'],
  ['PRAO-007', 'canonical slots reject reparse roots and authority-expanding input fields'],
  ['PRAO-008', 'fixture source manifests trust roots ledger and release lineage reproduce exactly'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the outbox does not sign decisions own private keys or authenticate external signatures',
  'the existing family controller remains the sole cryptographic and durable resolution authority',
  'local recovery and at-most-once dispatch do not establish provider-side truth or remote exactly-once execution',
  'concurrent callers may receive closed lock contention and retry only through exact local reconciliation',
  'no routing default Realm continuity identity evolution Inspiration Lunari or Soul authority changes',
]);

const same = (left, right) => canonicalJson(left) === canonicalJson(right);
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) throw new Error(`${label} fields are invalid`);
}
function digest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}
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
function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'families', 'assertions', 'fixtureDigest'], 'outbox fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-provider-resolution-authority-outbox-fixture-v1'
      || !same(Object.keys(value.families), ['anthropic-messages-v1', 'openai-compatible-chat-completions-v1'])) {
    throw new Error('outbox fixture identity is invalid');
  }
  const outcomes = [];
  for (const family of Object.values(value.families)) {
    exactKeys(family, [
      'hostDescriptionDigest', 'transportPolicyDigest', 'resolutionPolicyDigest', 'operationId',
      'requestDigest', 'decisionDigest', 'envelopeDigest', 'terminalDigest', 'outcomeStatus',
      'fileSet', 'providerCalls', 'durableRecordDigest',
    ], 'outbox family');
    for (const field of [
      'hostDescriptionDigest', 'transportPolicyDigest', 'resolutionPolicyDigest', 'operationId',
      'requestDigest', 'decisionDigest', 'envelopeDigest', 'terminalDigest', 'durableRecordDigest',
    ]) digest(family[field], field);
    if (!['completed', 'abandoned'].includes(family.outcomeStatus)
        || !same(family.fileSet, ['request.json', 'signed-return.json', 'terminal.json'])
        || family.providerCalls !== 1) throw new Error('outbox family evidence is invalid');
    outcomes.push(family.outcomeStatus);
  }
  if (!same(outcomes.sort(), ['abandoned', 'completed'])) throw new Error('outbox outcomes are invalid');
  const expectedMetrics = {
    families: 2, operations: 2, signingRequests: 2, signedReturns: 2, resolvedTerminals: 2,
    adoptedResponses: 1, abandonedOperations: 1, providerCalls: 2, additionalProviderCalls: 0,
    rawResponseBodiesRetained: 0, credentialsRetained: 0, privateKeysRetained: 0, automaticRetries: 0,
  };
  if (!same(value.assertions, expectedMetrics)) throw new Error('outbox fixture metrics are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('outbox fixture digest mismatch');
  return value;
}

export function verifyProviderResolutionAuthorityOutboxReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'outbox receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) throw new Error('outbox receipt identity is invalid');
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'protectedTrustRoots', 'implementationManifest', 'testManifest',
  ], 'outbox source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) throw new Error('outbox history is invalid');
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  if (!same(value.source.protectedTrustRoots, protectedTrustRoots)) throw new Error('protected trust roots are invalid');
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) throw new Error('outbox fixture binding is invalid');
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) throw new Error('outbox evidence is invalid');
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial', independent: false,
    unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0,
  })) throw new Error('outbox review is invalid');
  if (!same(value.proofLimits, proofLimits)) throw new Error('outbox proof limits are invalid');
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('outbox receipt digest mismatch');
  return value;
}

export async function buildProviderResolutionAuthorityOutboxReceiptFromSource({
  repositoryRoot, sourceCommit, testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const actualRoots = Object.fromEntries(await Promise.all(Object.keys(protectedTrustRoots)
    .map(async (path) => [path, sha256Text(await gitText(root, sourceCommit, path))])));
  if (!same(actualRoots, protectedTrustRoots)) throw new Error('protected trust root changed');
  const unsigned = {
    schemaVersion: 1, certificationId, status: 'certified', protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      protectedTrustRoots: structuredClone(protectedTrustRoots),
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
    },
    fixture: {
      path: fixturePath, fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest, value: fixture,
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
  return Object.freeze(verifyProviderResolutionAuthorityOutboxReceipt({
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
  const preliminary = await buildProviderResolutionAuthorityOutboxReceiptFromSource({
    repositoryRoot: root, sourceCommit, testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildProviderResolutionAuthorityOutboxReceiptFromSource({
    repositoryRoot: root, sourceCommit, testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/provider-resolution-authority-outbox-certification.test.mjs',
    'tests/certification-ledger.test.mjs', 'tests/release-lineage.test.mjs',
  ], root);
  await writeFile(join(root, ...certificationPath.split('/')), `# Provider Resolution Authority Outbox v1 Certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies one local crash-safe, authority-neutral signing outbox across both provider families. External signing and the existing provider controller remain the trust boundary.\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
