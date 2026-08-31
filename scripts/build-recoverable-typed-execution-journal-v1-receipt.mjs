import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicRecoverableTypedExecutionJournalFixture } from '../tests/helpers/recoverable-typed-execution-journal-fixture.mjs';
import {
  pinnedGodskillsTypedExecutionStepperRelease,
  pinnedGodskillsTypedExecutionStepperSourceCommit,
} from './lib/pinned-godskills-typed-execution-stepper.mjs';
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

const execFileAsync = promisify(execFile);
const certificationId = 'recoverable-typed-execution-journal-v1';
const protocolId = 'eternities-recoverable-typed-execution-journal-certification-v1';
const fixturePath = 'fixtures/recoverable-typed-execution-journal-v1.json';
const receiptPath = 'receipts/recoverable-typed-execution-journal-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-recoverable-typed-execution-journal-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-recoverable-typed-execution-journal-v1.md';
const reviewPath = 'docs/recoverable-typed-execution-journal-v1-terra-review.json';
const certificationPath = 'docs/recoverable-typed-execution-journal-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const sha256Bytes = (value) => createHash('sha256').update(value).digest('hex');

const historicalReceiptPaths = Object.freeze([
  'receipts/admitted-sealed-identity-host-v1.json',
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
  'receipts/recoverable-godskills-admission-v1.json',
  'receipts/recoverable-mission-native-executor-v1.json',
  'receipts/recoverable-mission-revision-executor-v1.json',
  'receipts/recoverable-typed-composition-compiler-v1.json',
  'receipts/resumable-mission-review-kernel-v1.json',
  'receipts/routing-evidence-activation-classifier-v1.json',
  'receipts/sealed-local-godskills-transport-v1.json',
  'receipts/sealed-local-identity-vessel-v1.json',
  'receipts/sealed-local-typed-composition-compiler-v1.json',
  'receipts/sealed-openai-compatible-phase-transport-v1.json',
  'receipts/signed-openai-phase-resolution-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  planPath,
  specificationPath,
  reviewPath,
  fixturePath,
  'scripts/build-recoverable-typed-execution-journal-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-typed-composition.mjs',
  'scripts/lib/pinned-godskills-typed-execution-stepper.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/runtime/recoverable-typed-execution-journal.mjs',
  'src/skills/typed-composition-verifier.mjs',
  'src/skills/typed-execution-stepper-adapter.mjs',
  'src/skills/typed-execution-stepper-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
]);

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/recoverable-typed-execution-journal-fixture.mjs',
  'tests/recoverable-typed-execution-journal-certification.test.mjs',
  'tests/recoverable-typed-execution-journal.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/godskills-typed-composition-consumer.test.mjs',
  'tests/sealed-local-typed-composition-compiler.test.mjs',
]);

const focusedTestFiles = Object.freeze([
  'tests/recoverable-typed-execution-journal.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  { id: 'RTEJ-001', evidence: ['exact certified Godskills stepper release verifies before import'], status: 'pass' },
  { id: 'RTEJ-002', evidence: ['one execution identity owns one bounded canonical intent'], status: 'pass' },
  { id: 'RTEJ-003', evidence: ['Godskills accepts each output before durable publication'], status: 'pass' },
  { id: 'RTEJ-004', evidence: ['records form one contiguous digest-linked append-only chain'], status: 'pass' },
  { id: 'RTEJ-005', evidence: ['fresh execution replays the durable prefix through fresh private steps'], status: 'pass' },
  { id: 'RTEJ-006', evidence: ['recovery resumes at the first unfinished node'], status: 'pass' },
  { id: 'RTEJ-007', evidence: ['invalid and changed output is not admitted as durable progress'], status: 'pass' },
  { id: 'RTEJ-008', evidence: ['historical completion and execution digests reproduce exactly'], status: 'pass' },
  { id: 'RTEJ-009', evidence: ['the pre-publication repeat window remains explicit'], status: 'pass' },
  { id: 'RTEJ-010', evidence: ['no authority provider effect body or default host path is added'], status: 'pass' },
]);
const proofLimits = Object.freeze([
  'The activation classifier and typed node executors remain trusted inputs.',
  'A node may repeat when process death occurs after executor return but before durable publication.',
  'External exactly-once effects and executor idempotency are not certified.',
  'Live model or provider execution and output quality are not certified.',
  'Hostile same-user mutation and operating-system sandboxing are not certified.',
  'The journal is not adopted by an existing host, vessel, CLI, or launcher by default.',
  'No Realm, continuity, keel, evolution, Lunari, Inspiration, or Soul authority is granted.',
]);

function repositoryPath(value) {
  return value instanceof URL ? fileURLToPath(value) : resolve(value);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'typed execution journal test runs');
  for (const [name, run] of Object.entries(value)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
  }
  if (value.full.tests < value.focused.tests) throw new Error('full test run is narrower than focused');
}

function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!same(value.paths, paths) || !Array.isArray(value.entries)
      || !same(value.entries.map(({ path }) => path), paths)) throw new Error(`${label} paths are invalid`);
  value.entries.forEach((entry) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    requireDigest(entry.sha256, `${label} entry digest`);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry bytes are invalid`);
  });
  requireDigest(value.digest, `${label} digest`);
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
  return value;
}

export function verifyRecoverableTypedExecutionJournalFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'godskills', 'execution', 'recovery', 'guarantees', 'fixtureDigest'], 'typed execution journal fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-recoverable-typed-execution-journal-fixture-v1') {
    throw new Error('typed execution journal fixture identity is invalid');
  }
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (value.fixtureDigest !== sha256Value(unsigned)) throw new Error('typed execution journal fixture digest mismatch');
  if (value.godskills.stepperSourceCommit !== pinnedGodskillsTypedExecutionStepperSourceCommit
      || value.godskills.stepperTrustRootDigest !== '5caff10e19ec98020da451396af11a9e479afa61ba4d43546ce1559b23da2b17'
      || value.execution.executionDigest !== 'dce249713684b029ffae62bb8b4b8e55b2d394a7b4a49f3ddbb846421e914bf7'
      || value.recovery.crashObserved !== true
      || !same(value.recovery.firstExecutions, ['eternities-muse'])
      || !same(value.recovery.recoveryExecutions, ['eternities-forge'])
      || value.recovery.recoveredSteps !== 1 || value.recovery.executedSteps !== 1
      || value.recovery.recordDigests.length !== 2
      || value.guarantees.persistedAfterGodskillsValidation !== true
      || value.guarantees.resumesFirstUnfinishedNode !== true
      || value.guarantees.externalExactlyOnce !== false
      || value.guarantees.authorityExpanded !== false
      || value.guarantees.defaultLaunchEnabled !== false) {
    throw new Error('typed execution journal fixture boundary changed');
  }
  return value;
}

async function controlledGit(root, args, options = {}) {
  const environment = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR']) delete environment[name];
  return execFileAsync('git', ['-C', root, ...args], { windowsHide: true, env: environment, ...options });
}

async function reviewedDiffAtCommit(root, sourceCommit) {
  const parentCommit = (await controlledGit(root, ['rev-parse', `${sourceCommit}^`], { encoding: 'utf8' })).stdout.trim();
  const pathspec = ['--', '.', `:(exclude)${reviewPath}`];
  const [{ stdout: diff }, { stdout: names }] = await Promise.all([
    controlledGit(root, ['diff', '--binary', '--no-ext-diff', '--no-renames', parentCommit, sourceCommit, ...pathspec], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }),
    controlledGit(root, ['diff', '--name-only', '--no-renames', parentCommit, sourceCommit, ...pathspec], { encoding: 'utf8' }),
  ]);
  return {
    parentCommit,
    reviewedDiffSha256: sha256Bytes(diff),
    reviewedPaths: names.split(/\r?\n/).filter(Boolean).sort(),
  };
}

function verifyReview(value, expected) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'reviewerModel', 'reviewMode', 'reviewedParentCommit',
    'reviewedDiffSha256', 'reviewedPaths', 'unresolvedCriticalDefects',
    'unresolvedImportantDefects', 'disposition', 'notes',
  ], 'typed execution journal Terra review');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-independent-source-review-v1'
      || value.reviewerModel !== 'terra' || value.reviewMode !== 'independent'
      || value.disposition !== 'approved' || value.unresolvedCriticalDefects !== 0
      || value.unresolvedImportantDefects !== 0 || !Array.isArray(value.notes)
      || value.reviewedParentCommit !== expected.parentCommit
      || value.reviewedDiffSha256 !== expected.reviewedDiffSha256
      || !same(value.reviewedPaths, expected.reviewedPaths)) {
    throw new Error('typed execution journal Terra review is invalid');
  }
  return value;
}

export function verifyRecoverableTypedExecutionJournalReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'testRuns', 'proofLimits', 'receiptDigest',
  ], 'typed execution journal receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) throw new Error('typed execution journal receipt identity is invalid');
  exactKeys(value.source, [
    'commit', 'parentCommit', 'historicalReceiptDigests', 'implementationManifest',
    'testManifest', 'specification', 'plan', 'review',
  ], 'typed execution journal source');
  if (!COMMIT.test(value.source?.commit) || !COMMIT.test(value.source?.parentCommit)) throw new Error('typed execution journal source commit is invalid');
  if (!same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) throw new Error('typed execution journal historical receipt set is invalid');
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt digest'));
  const implementationManifest = verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  for (const [descriptor, expectedPath, label] of [
    [value.source.specification, specificationPath, 'specification'],
    [value.source.plan, planPath, 'plan'],
  ]) {
    exactKeys(descriptor, ['path', 'sha256'], `typed execution journal ${label}`);
    requireDigest(descriptor.sha256, `typed execution journal ${label} digest`);
    const manifestEntry = implementationManifest.entries.find(({ path }) => path === expectedPath);
    if (descriptor.path !== expectedPath || descriptor.sha256 !== manifestEntry?.sha256) {
      throw new Error(`typed execution journal ${label} binding is invalid`);
    }
  }
  exactKeys(value.source.review, ['path', 'fileSha256', 'value'], 'typed execution journal review descriptor');
  requireDigest(value.source.review.fileSha256, 'typed execution journal review file digest');
  verifyReview(value.source.review.value, {
    parentCommit: value.source.parentCommit,
    reviewedDiffSha256: value.source.review.value.reviewedDiffSha256,
    reviewedPaths: value.source.review.value.reviewedPaths,
  });
  if (value.source.review.path !== reviewPath || value.source.review.fileSha256 !== sha256Text(`${canonicalJson(value.source.review.value)}\n`)) {
    throw new Error('typed execution journal review binding is invalid');
  }
  const pin = pinnedGodskillsTypedExecutionStepperRelease('C:/dev/eternities-godskills');
  if (!same(value.godskills, {
    sourceCommit: pin.sourceCommit,
    receiptDigest: pin.releaseReceipt.receiptDigest,
    receiptFileSha256: pin.releaseReceipt.sha256,
    fixtureDigest: pin.expected.fixtureDigest,
    parentTypedCompositionReceiptDigest: pin.expected.parentReceiptDigest,
  })) throw new Error('typed execution journal Godskills root is invalid');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'typed execution journal fixture descriptor');
  requireDigest(value.fixture.fileSha256, 'typed execution journal fixture file digest');
  requireDigest(value.fixture.logicalDigest, 'typed execution journal fixture logical digest');
  verifyRecoverableTypedExecutionJournalFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== value.fixture.value.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(value.fixture.value)}\n`)) throw new Error('typed execution journal fixture binding mismatch');
  if (!same(value.requirements, requirements) || !same(value.proofLimits, proofLimits)) throw new Error('typed execution journal claims changed');
  if (!same(value.metrics, {
    durableRecords: 2,
    recoveredSteps: 1,
    executedAfterRecovery: 1,
    repeatedPersistedNodes: 0,
    authorityExpansions: 0,
    externalExactlyOnceClaims: 0,
  })) throw new Error('typed execution journal metrics changed');
  verifyTestRuns(value.testRuns);
  const unsigned = structuredClone(value);
  delete unsigned.receiptDigest;
  requireDigest(value.receiptDigest, 'typed execution journal receipt digest');
  if (value.receiptDigest !== sha256Value(unsigned)) throw new Error('typed execution journal receipt digest mismatch');
  return value;
}

export async function buildRecoverableTypedExecutionJournalReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryPath(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyRecoverableTypedExecutionJournalFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('typed execution journal fixture is not canonical');
  const reviewed = await reviewedDiffAtCommit(root, sourceCommit);
  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const review = verifyReview(JSON.parse(reviewText), reviewed);
  if (reviewText !== `${canonicalJson(review)}\n`) throw new Error('typed execution journal review is not canonical');
  const pin = pinnedGodskillsTypedExecutionStepperRelease('C:/dev/eternities-godskills');
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      parentCommit: reviewed.parentCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      specification: { path: specificationPath, sha256: sha256Text(await gitText(root, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(root, sourceCommit, planPath)) },
      review: { path: reviewPath, fileSha256: sha256Text(reviewText), value: review },
    },
    godskills: {
      sourceCommit: pin.sourceCommit,
      receiptDigest: pin.releaseReceipt.receiptDigest,
      receiptFileSha256: pin.releaseReceipt.sha256,
      fixtureDigest: pin.expected.fixtureDigest,
      parentTypedCompositionReceiptDigest: pin.expected.parentReceiptDigest,
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements,
    metrics: {
      durableRecords: 2,
      recoveredSteps: 1,
      executedAfterRecovery: 1,
      repeatedPersistedNodes: 0,
      authorityExpansions: 0,
      externalExactlyOnceClaims: 0,
    },
    testRuns,
    proofLimits,
  };
  return verifyRecoverableTypedExecutionJournalReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

async function writeCertification(path, receipt, release) {
  const lines = [
    '# Recoverable typed execution journal v1 certification',
    '',
    `source commit: \`${receipt.source.commit}\``,
    '',
    `Godskills stepper receipt: \`${receipt.godskills.receiptDigest}\``,
    '',
    `fixture digest: \`${receipt.fixture.logicalDigest}\``,
    '',
    `receipt digest: \`${receipt.receiptDigest}\``,
    '',
    `focused tests: ${receipt.testRuns.focused.tests}`,
    '',
    `full tests: ${receipt.testRuns.full.tests}`,
    '',
    `release tests: ${release.tests}`,
    '',
    'The certified boundary resumes after durable typed output without claiming external exactly-once effects.',
    '',
  ];
  await writeFile(path, lines.join('\n'), 'utf8');
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const fixtureOutput = join(root, ...fixturePath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicRecoverableTypedExecutionJournalFixture();
    await mkdir(dirname(fixtureOutput), { recursive: true });
    await writeFile(fixtureOutput, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({ status: 'written', fixtureDigest: fixture.fixtureDigest })}\n`);
    return;
  }
  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({
    root,
    headCommit: head,
    outputPath: join(root, ...receiptPath.split('/')),
    releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildRecoverableTypedExecutionJournalReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await mkdir(dirname(join(root, ...receiptPath.split('/'))), { recursive: true });
  await writeFile(join(root, ...receiptPath.split('/')), `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildRecoverableTypedExecutionJournalReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(join(root, ...receiptPath.split('/')), `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/recoverable-typed-execution-journal-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeCertification(join(root, ...certificationPath.split('/')), receipt, release);
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
if (import.meta.url === invoked) {
  main().catch((error) => {
    process.stderr.write(`recoverable typed execution journal certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
