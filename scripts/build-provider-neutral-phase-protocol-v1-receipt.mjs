import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  assertCommit, gitText, headCommit, historicalAtCommit, manifestAtCommit,
  requireCleanExcept, resolveSourceCommit, runTests,
} from './lib/certification-support.mjs';

const execFileAsync = promisify(execFile);
const certificationId = 'provider-neutral-phase-protocol-v1';
const protocolId = 'eternities-provider-neutral-phase-protocol-certification-v1';
const sourceBaseCommit = '48bec8e05d4dcae878ed3af75fc4c9fd7376986e';
const fixturePath = 'fixtures/provider-neutral-phase-protocol-v1.json';
const receiptPath = 'receipts/provider-neutral-phase-protocol-v1.json';
const reviewPath = 'docs/provider-neutral-phase-protocol-v1-terra-review.json';
const certificationPath = 'docs/provider-neutral-phase-protocol-v1-certification.md';
const specificationPath = 'docs/superpowers/specs/2026-08-31-provider-neutral-phase-protocol-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-provider-neutral-phase-protocol-v1.md';
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
].sort());

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  planPath,
  reviewPath,
  specificationPath,
  fixturePath,
  'package.json',
  'schemas/anthropic-messages-phase-transport-policy.schema.json',
  'scripts/build-provider-neutral-phase-protocol-v1-fixture.mjs',
  'scripts/build-provider-neutral-phase-protocol-v1-receipt.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/schema-validator.mjs',
  'src/transports/anthropic-messages-phase-policy.mjs',
  'src/transports/anthropic-messages-phase-protocol.mjs',
  'src/transports/openai-compatible-phase-protocol.mjs',
  'src/transports/provider-neutral-phase-semantics.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/anthropic-messages-phase-policy.test.mjs',
  'tests/anthropic-messages-phase-protocol.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/provider-neutral-phase-protocol-certification-fixture.mjs',
  'tests/openai-compatible-phase-policy.test.mjs',
  'tests/openai-compatible-phase-transport-certification.test.mjs',
  'tests/openai-compatible-phase-transport.test.mjs',
  'tests/provider-neutral-phase-protocol-certification.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/anthropic-messages-phase-policy.test.mjs',
  'tests/anthropic-messages-phase-protocol.test.mjs',
  'tests/openai-compatible-phase-policy.test.mjs',
  'tests/openai-compatible-phase-transport.test.mjs',
  'tests/openai-compatible-phase-transport-certification.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  { id: 'PNP-001', status: 'pass', evidence: ['one shared semantic core owns dispatch input schema artifact and completion binding'] },
  { id: 'PNP-002', status: 'pass', evidence: ['the sealed OpenAI-compatible transport fixture and receipt reproduce unchanged'] },
  { id: 'PNP-003', status: 'pass', evidence: ['one canonical externally pinned Anthropic policy binds the exact HTTPS origin Messages path API version model credential variable and ceilings'] },
  { id: 'PNP-004', status: 'pass', evidence: ['Anthropic requests use one cache-stable system block one user block and strict JSON schema output without tools or thinking'] },
  { id: 'PNP-005', status: 'pass', evidence: ['native review and revision produce exact typed artifact host-binding authority and usage parity across both adapters'] },
  { id: 'PNP-006', status: 'pass', evidence: ['Anthropic cache creation and cache reads map without counting creation as a cache hit'] },
  { id: 'PNP-007', status: 'pass', evidence: ['credentials remain lazy rotatable nonserializing absent from requests and rejected on reflection'] },
  { id: 'PNP-008', status: 'pass', evidence: ['model content usage request response and artifact contradictions fail closed within pinned ceilings'] },
  { id: 'PNP-009', status: 'pass', evidence: ['two independent fixture builds reproduce the same exact digest and phase records'] },
  { id: 'PNP-010', status: 'pass', evidence: ['all historical receipts the append-only ledger and release lineage remain exact gates'] },
]);

const proofLimits = Object.freeze([
  'Deterministic fake responses prove protocol compilation and validation, not live Anthropic availability or model quality.',
  'The existing OpenAI-compatible transport remains the only certified durable network transport.',
  'This does not prove arbitrary provider equivalence, pricing, latency, rate limits, or cache-hit probability.',
  'No streaming, tools, thinking, files, images, audio, web search, or provider-hosted effects are enabled.',
  'No public SDK, CLI migration, default adoption, Realm action, continuity write, identity mutation, evolution, Inspiration, Lunari, or Soul activation is added.',
]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}

function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (canonicalJson(value.paths) !== canonicalJson(paths)
      || canonicalJson(value.entries?.map(({ path }) => path)) !== canonicalJson(paths)) {
    throw new Error(`${label} paths changed`);
  }
  value.entries.forEach((entry) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    requireDigest(entry.sha256, `${label} entry digest`);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry bytes are invalid`);
  });
  requireDigest(value.digest, `${label} digest`);
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
  if (value.full.tests < value.focused.tests) throw new Error('full test run is narrower than focused');
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'policies', 'phases', 'assertions', 'fixtureDigest'], 'fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-provider-neutral-phase-protocol-fixture-v1'
      || canonicalJson(Object.keys(value.phases)) !== canonicalJson(['native', 'review', 'revision'])) {
    throw new Error('fixture identity changed');
  }
  for (const phase of Object.values(value.phases)) {
    exactKeys(phase, [
      'dispatchDigest', 'descriptorDigest', 'openAIRequestDigest', 'anthropicRequestDigest',
      'artifactDigest', 'completionParity', 'anthropicProviderUsage',
    ], 'fixture phase');
    for (const [key, digest] of Object.entries(phase)) {
      if (key.endsWith('Digest')) requireDigest(digest, `fixture phase ${key}`);
    }
    if (phase.completionParity !== true || phase.openAIRequestDigest === phase.anthropicRequestDigest) {
      throw new Error('fixture phase parity changed');
    }
    if (canonicalJson(phase.anthropicProviderUsage) !== canonicalJson({
      uncachedInputTokens: 100,
      cacheCreationInputTokens: 40,
      cacheReadInputTokens: 60,
      outputTokens: 30,
      thinkingTokens: 0,
    })) throw new Error('fixture Anthropic provider usage changed');
  }
  const expectedAssertions = {
    phaseCount: 3,
    exactTypedArtifactParity: true,
    exactHostBindingParity: true,
    exactUsageParity: true,
    authorityExpansions: 0,
    credentialsInRequests: 0,
    cacheCreationInputTokens: 120,
    anthropicSystemCacheBoundary: true,
    strictStructuredOutputs: true,
  };
  if (canonicalJson(value.assertions) !== canonicalJson(expectedAssertions)) throw new Error('fixture assertions changed');
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (value.fixtureDigest !== sha256Value(unsigned)) throw new Error('fixture digest mismatch');
  return value;
}

function controlledEnvironment() {
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR']) delete env[name];
  return env;
}

async function reviewedDiff(root, sourceCommit) {
  const parentCommit = (await execFileAsync('git', ['-C', root, 'merge-base', sourceCommit, sourceBaseCommit], {
    encoding: 'utf8', windowsHide: true, env: controlledEnvironment(),
  })).stdout.trim();
  if (parentCommit !== sourceBaseCommit) throw new Error('provider-neutral protocol source base changed');
  const pathspec = ['--', '.', `:(exclude)${reviewPath}`, `:(exclude)${receiptPath}`, `:(exclude)${certificationPath}`];
  const [{ stdout: diff }, { stdout: names }] = await Promise.all([
    execFileAsync('git', ['-C', root, 'diff', '--binary', '--no-ext-diff', '--no-renames', parentCommit, sourceCommit, ...pathspec], {
      encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: controlledEnvironment(),
    }),
    execFileAsync('git', ['-C', root, 'diff', '--name-only', '--no-renames', parentCommit, sourceCommit, ...pathspec], {
      encoding: 'utf8', windowsHide: true, env: controlledEnvironment(),
    }),
  ]);
  return {
    parentCommit,
    reviewedDiffSha256: createHash('sha256').update(diff).digest('hex'),
    reviewedPaths: names.split(/\r?\n/).filter(Boolean).sort(),
  };
}

function verifyReview(value, expected) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'reviewerModel', 'reviewMode', 'reviewedParentCommit',
    'reviewedDiffSha256', 'reviewedPaths', 'unresolvedCriticalDefects',
    'unresolvedImportantDefects', 'unresolvedMinorDefects', 'disposition', 'notes',
  ], 'Terra review');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-independent-source-review-v1'
      || value.reviewerModel !== 'terra' || value.reviewMode !== 'independent'
      || value.reviewedParentCommit !== expected.parentCommit
      || value.reviewedDiffSha256 !== expected.reviewedDiffSha256
      || canonicalJson(value.reviewedPaths) !== canonicalJson(expected.reviewedPaths)
      || value.unresolvedCriticalDefects !== 0 || value.unresolvedImportantDefects !== 0
      || value.unresolvedMinorDefects !== 0 || value.disposition !== 'approved'
      || !Array.isArray(value.notes) || value.notes.length < 1) {
    throw new Error('Terra review is invalid');
  }
  return value;
}

export function verifyProviderNeutralPhaseProtocolReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'proofLimits', 'receiptDigest',
  ], 'provider-neutral phase protocol receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('provider-neutral phase protocol receipt identity changed');
  }
  exactKeys(value.source, [
    'commit', 'parentCommit', 'historicalReceiptDigests', 'implementationManifest',
    'testManifest', 'specification', 'plan', 'review',
  ], 'receipt source');
  if (!COMMIT.test(value.source.commit) || value.source.parentCommit !== sourceBaseCommit
      || canonicalJson(Object.keys(value.source.historicalReceiptDigests).sort())
        !== canonicalJson(historicalReceiptPaths)) {
    throw new Error('receipt source identity changed');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  const implementationByPath = new Map(
    value.source.implementationManifest.entries.map((entry) => [entry.path, entry]),
  );
  for (const [reference, path] of [[value.source.specification, specificationPath], [value.source.plan, planPath]]) {
    exactKeys(reference, ['path', 'sha256'], 'source reference');
    if (reference.path !== path) throw new Error('source reference path changed');
    requireDigest(reference.sha256, 'source reference digest');
    if (reference.sha256 !== implementationByPath.get(path)?.sha256) {
      throw new Error('source reference differs from implementation manifest');
    }
  }
  exactKeys(value.source.review, ['path', 'fileSha256', 'value'], 'source review');
  if (value.source.review.path !== reviewPath
      || value.source.review.fileSha256 !== sha256Text(`${canonicalJson(value.source.review.value)}\n`)
      || value.source.review.fileSha256 !== implementationByPath.get(reviewPath)?.sha256) {
    throw new Error('source review binding changed');
  }
  verifyReview(value.source.review.value, {
    parentCommit: value.source.parentCommit,
    reviewedDiffSha256: value.source.review.value.reviewedDiffSha256,
    reviewedPaths: value.source.review.value.reviewedPaths,
  });
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'fixture binding');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('fixture binding changed');
  }
  if (canonicalJson(value.requirements) !== canonicalJson(requirements)
      || canonicalJson(value.proofLimits) !== canonicalJson(proofLimits)) {
    throw new Error('receipt claims changed');
  }
  const expectedMetrics = {
    providers: 2,
    phases: 3,
    crossAdapterParityFailures: 0,
    authorityExpansions: 0,
    credentialLeaks: 0,
    cacheCreationInputTokens: 120,
    independentReviewDefects: 0,
  };
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics)) throw new Error('receipt metrics changed');
  verifyTestRuns(value.testRuns);
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('receipt digest mismatch');
  return value;
}

export async function buildProviderNeutralPhaseProtocolReceiptFromSource({
  repositoryRoot, sourceCommit, testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const diff = await reviewedDiff(root, sourceCommit);
  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const review = verifyReview(JSON.parse(reviewText), diff);
  if (reviewText !== `${canonicalJson(review)}\n`) throw new Error('review is not canonical');
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      parentCommit: diff.parentCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      specification: { path: specificationPath, sha256: sha256Text(await gitText(root, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(root, sourceCommit, planPath)) },
      review: { path: reviewPath, fileSha256: sha256Text(reviewText), value: review },
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements: structuredClone(requirements),
    metrics: {
      providers: 2,
      phases: 3,
      crossAdapterParityFailures: 0,
      authorityExpansions: fixture.assertions.authorityExpansions,
      credentialLeaks: fixture.assertions.credentialsInRequests,
      cacheCreationInputTokens: fixture.assertions.cacheCreationInputTokens,
      independentReviewDefects: review.unresolvedCriticalDefects
        + review.unresolvedImportantDefects + review.unresolvedMinorDefects,
    },
    testRuns: structuredClone(testRuns),
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyProviderNeutralPhaseProtocolReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

function certificationMarkdown(receipt, release) {
  return `# Provider-Neutral Phase Protocol v1 Certification\n\n`
    + `- status: certified\n`
    + `- source commit: \`${receipt.source.commit}\`\n`
    + `- receipt digest: \`${receipt.receiptDigest}\`\n`
    + `- fixture digest: \`${receipt.fixture.logicalDigest}\`\n`
    + `- focused tests: ${receipt.testRuns.focused.tests}\n`
    + `- full tests: ${receipt.testRuns.full.tests}\n`
    + `- release tests: ${release.tests}\n`
    + `- independent Terra defects: 0 critical, 0 important, 0 minor\n\n`
    + `This certifies exact native, review, and revision artifact, host-binding, authority, and usage parity between the OpenAI-compatible and Anthropic Messages protocol adapters under deterministic fixtures. It does not certify a live Anthropic network transport or provider quality.\n`;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({
    root, headCommit: head, outputPath, releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildProviderNeutralPhaseProtocolReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildProviderNeutralPhaseProtocolReceiptFromSource({
    repositoryRoot: root, sourceCommit, testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/provider-neutral-phase-protocol-certification.test.mjs',
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
