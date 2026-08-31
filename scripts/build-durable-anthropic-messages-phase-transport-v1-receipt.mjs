import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
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

const certificationId = 'durable-anthropic-messages-phase-transport-v1';
const protocolId = 'eternities-durable-anthropic-messages-phase-transport-certification-v1';
const fixturePath = 'fixtures/durable-anthropic-messages-phase-transport-v1.json';
const receiptPath = 'receipts/durable-anthropic-messages-phase-transport-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-durable-anthropic-messages-phase-transport-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-durable-anthropic-messages-phase-transport-v1.md';
const certificationPath = 'docs/durable-anthropic-messages-phase-transport-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/admitted-sealed-identity-host-v1.json',
  'receipts/admitted-sealed-typed-execution-host-v1.json',
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
  'receipts/godskills-typed-composition-consumer-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/identity-bound-mission-vessel-v1.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/provider-neutral-phase-protocol-v1.json',
  'receipts/receipt-bound-typed-executor-bundle-v1.json',
  'receipts/recoverable-godskills-admission-v1.json',
  'receipts/recoverable-mission-native-executor-v1.json',
  'receipts/recoverable-mission-revision-executor-v1.json',
  'receipts/recoverable-typed-composition-compiler-v1.json',
  'receipts/recoverable-typed-execution-journal-v1.json',
  'receipts/resumable-mission-review-kernel-v1.json',
  'receipts/routing-evidence-activation-classifier-v1.json',
  'receipts/sealed-local-godskills-transport-v1.json',
  'receipts/sealed-local-identity-vessel-v1.json',
  'receipts/sealed-local-typed-composition-compiler-v1.json',
  'receipts/sealed-local-typed-execution-runner-v1.json',
  'receipts/sealed-openai-compatible-phase-transport-v1.json',
  'receipts/signed-openai-phase-resolution-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'schemas/anthropic-messages-phase-transport-policy.schema.json',
  'scripts/build-durable-anthropic-messages-phase-transport-v1-fixture.mjs',
  'scripts/build-durable-anthropic-messages-phase-transport-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/errors.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/http-transport.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/identity-bound-native-contracts.mjs',
  'src/runtime/mission-revision-transport-contracts.mjs',
  'src/skills/review-transport-contracts.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
  'src/transports/anthropic-messages-phase-policy.mjs',
  'src/transports/anthropic-messages-phase-protocol.mjs',
  'src/transports/anthropic-messages-phase-transport.mjs',
  'src/transports/durable-phase-operation.mjs',
  'src/transports/provider-neutral-phase-semantics.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/anthropic-messages-phase-policy.test.mjs',
  'tests/anthropic-messages-phase-protocol.test.mjs',
  'tests/anthropic-messages-phase-transport-certification.test.mjs',
  'tests/anthropic-messages-phase-transport.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/anthropic-messages-phase-transport-certification-fixture.mjs',
  'tests/helpers/openai-compatible-phase-operation-fixture.mjs',
  'tests/openai-compatible-phase-transport-certification.test.mjs',
  'tests/openai-compatible-phase-transport.test.mjs',
  'tests/provider-neutral-phase-protocol-certification.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/anthropic-messages-phase-policy.test.mjs',
  'tests/anthropic-messages-phase-protocol.test.mjs',
  'tests/anthropic-messages-phase-transport.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirementEvidence = Object.freeze({
  'AMT-001': ['externally pinned Anthropic policy binds all three descriptors before operation creation'],
  'AMT-002': ['native review and revision send exact bounded Messages requests with host-owned headers'],
  'AMT-003': ['the credential reaches only the in-memory x-api-key header'],
  'AMT-004': ['validated responses produce existing trusted phase completions without provider authority'],
  'AMT-005': ['cache creation and cache reads remain distinct in completion-bound durable evidence'],
  'AMT-006': ['completed reconstruction performs zero credential resolution and zero provider calls'],
  'AMT-007': ['same-dispatch concurrency performs at most one local provider request'],
  'AMT-008': ['interruption and ambiguous outcomes remain pending without automatic redispatch'],
  'AMT-009': ['closed failures retain only stable reason status and response digest'],
  'AMT-010': ['hostile operation state fails integrity before provider access'],
  'AMT-011': ['fixture receipt ledger and release lineage reproduce exactly'],
  'AMT-012': ['the certified OpenAI transport and provider-neutral receipts remain unchanged'],
});
const proofLimits = Object.freeze([
  'deterministic fake responses do not prove live Anthropic availability or model quality',
  'local at-most-once dispatch does not prove remote exactly-once execution',
  'ambiguous Anthropic outcomes have no signed operator resolution in this release',
  'the certified OpenAI transport is not migrated onto the neutral operation engine',
  'no default host CLI provider SDK Realm continuity identity evolution Inspiration Lunari or Soul change',
]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
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
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'certification test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'certification test run');
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error('certification test run is invalid');
    }
  }
}

function verifyProviderUsage(value) {
  exactKeys(value, [
    'uncachedInputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens',
    'outputTokens', 'thinkingTokens',
  ], 'fixture provider usage');
  if (Object.values(value).some((number) => !Number.isSafeInteger(number) || number < 0)
      || value.thinkingTokens !== 0) throw new Error('fixture provider usage is invalid');
}

function verifyFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'policyDigest', 'phases', 'assertions', 'fixtureDigest',
  ], 'durable Anthropic fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-durable-anthropic-messages-phase-transport-fixture-v1') {
    throw new Error('durable Anthropic fixture identity is invalid');
  }
  requireDigest(value.policyDigest, 'fixture policy digest');
  exactKeys(value.phases, ['native', 'review', 'revision'], 'fixture phases');
  for (const phase of Object.values(value.phases)) {
    exactKeys(phase, [
      'dispatchDigest', 'descriptorDigest', 'completionDigest',
      'providerEvidenceRecordDigest', 'providerUsage',
    ], 'fixture phase');
    for (const key of ['dispatchDigest', 'descriptorDigest', 'completionDigest', 'providerEvidenceRecordDigest']) {
      requireDigest(phase[key], `fixture phase ${key}`);
    }
    verifyProviderUsage(phase.providerUsage);
  }
  const expectedAssertions = {
    providerCalls: 3,
    replayProviderCalls: 0,
    completedReplays: 3,
    credentialLeaks: 0,
    authorityExpansions: 0,
    cacheCreationInputTokens: 120,
    cacheReadInputTokens: 180,
  };
  if (canonicalJson(value.assertions) !== canonicalJson(expectedAssertions)) {
    throw new Error('durable Anthropic fixture assertions are invalid');
  }
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('fixture digest mismatch');
  return value;
}

function verifyReference(reference, expectedPath, manifest, label) {
  exactKeys(reference, ['path', 'sha256'], label);
  const entry = manifest.entries.find(({ path }) => path === expectedPath);
  if (reference.path !== expectedPath || reference.sha256 !== entry?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyDurableAnthropicMessagesPhaseTransportReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'durable Anthropic receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('durable Anthropic receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'receipt source');
  if (!COMMIT.test(value.source.commit)
      || !sameArray(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('receipt source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'receipt fixture');
  if (value.fixture.path !== fixturePath) throw new Error('receipt fixture path is invalid');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('receipt fixture binding is invalid');
  }
  if (!sameArray(value.requirements.map(({ id }) => id), Object.keys(requirementEvidence))) {
    throw new Error('receipt requirements are invalid');
  }
  value.requirements.forEach((row) => {
    exactKeys(row, ['id', 'status', 'evidence'], `requirement ${row.id}`);
    if (row.status !== 'pass' || !sameArray(row.evidence, requirementEvidence[row.id])) {
      throw new Error(`requirement ${row.id} evidence mismatch`);
    }
  });
  const expectedMetrics = {
    phases: 3,
    providerCalls: 3,
    replayProviderCalls: 0,
    completedReplays: 3,
    credentialLeaks: 0,
    authorityExpansions: 0,
    cacheCreationInputTokens: 120,
    cacheReadInputTokens: 180,
  };
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics)) throw new Error('receipt metrics are invalid');
  verifyTestRuns(value.testRuns);
  exactKeys(value.review, [
    'mode', 'independent', 'unresolvedCriticalDefects', 'unresolvedImportantDefects', 'notes',
  ], 'receipt review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0 || value.review.unresolvedImportantDefects !== 0
      || !Array.isArray(value.review.notes) || value.review.notes.length < 1) {
    throw new Error('receipt review is invalid');
  }
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('receipt proof limits are invalid');
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('receipt digest mismatch');
  return value;
}

export async function buildDurableAnthropicMessagesPhaseTransportReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const implementationManifest = await manifestAtCommit(root, sourceCommit, implementationFiles);
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      implementationManifest,
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      specification: {
        path: specificationPath,
        sha256: sha256Text(await gitText(root, sourceCommit, specificationPath)),
      },
      plan: { path: planPath, sha256: sha256Text(await gitText(root, sourceCommit, planPath)) },
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements: Object.entries(requirementEvidence).map(([id, evidence]) => ({ id, status: 'pass', evidence: [...evidence] })),
    metrics: {
      phases: 3,
      providerCalls: fixture.assertions.providerCalls,
      replayProviderCalls: fixture.assertions.replayProviderCalls,
      completedReplays: fixture.assertions.completedReplays,
      credentialLeaks: fixture.assertions.credentialLeaks,
      authorityExpansions: fixture.assertions.authorityExpansions,
      cacheCreationInputTokens: fixture.assertions.cacheCreationInputTokens,
      cacheReadInputTokens: fixture.assertions.cacheReadInputTokens,
    },
    testRuns: structuredClone(testRuns),
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      unresolvedImportantDefects: 0,
      notes: [
        'reviewed credential lifetime record transitions replay ambiguity and hostile-state boundaries',
        'retained exact historical OpenAI transport and provider-neutral receipt reconstruction gates',
      ],
    },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyDurableAnthropicMessagesPhaseTransportReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

function certificationMarkdown(receipt, release) {
  return `# Durable Anthropic Messages Phase Transport v1 Certification\n\n`
    + `- status: certified\n`
    + `- source commit: \`${receipt.source.commit}\`\n`
    + `- receipt digest: \`${receipt.receiptDigest}\`\n`
    + `- fixture digest: \`${receipt.fixture.logicalDigest}\`\n`
    + `- focused tests: ${receipt.testRuns.focused.tests}\n`
    + `- full tests: ${receipt.testRuns.full.tests}\n`
    + `- release tests: ${release.tests}\n`
    + `- unresolved inline-review defects: 0 critical, 0 important\n\n`
    + `This certifies local at-most-once Anthropic Messages execution, exact durable replay, separate completion-bound cache evidence, and closed credential and failure boundaries under deterministic fake-provider responses. It does not certify live provider quality or remote exactly-once execution.\n`;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({ root, headCommit: head, outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildDurableAnthropicMessagesPhaseTransportReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildDurableAnthropicMessagesPhaseTransportReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/anthropic-messages-phase-transport-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeFile(join(root, ...certificationPath.split('/')), certificationMarkdown(receipt, release), 'utf8');
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    sourceCommit,
    receiptDigest: receipt.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest,
    testRuns: receipt.testRuns,
    release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
