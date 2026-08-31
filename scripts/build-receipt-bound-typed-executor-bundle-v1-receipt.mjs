import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { buildDeterministicReceiptBoundTypedExecutorBundleHostFixture } from '../tests/helpers/receipt-bound-typed-executor-bundle-fixture.mjs';
import {
  assertCommit, gitText, headCommit, historicalAtCommit, manifestAtCommit,
  requireCleanExcept, resolveSourceCommit, runTests,
} from './lib/certification-support.mjs';

const execFileAsync = promisify(execFile);
const certificationId = 'receipt-bound-typed-executor-bundle-v1';
const protocolId = 'eternities-receipt-bound-typed-executor-bundle-certification-v1';
const sourceBaseCommit = '6961013ac29da9ed2bfcdf472c3cb2412d10c867';
const fixturePath = 'fixtures/receipt-bound-typed-executor-bundle-v1.json';
const receiptPath = 'receipts/receipt-bound-typed-executor-bundle-v1.json';
const reviewPath = 'docs/receipt-bound-typed-executor-bundle-v1-terra-review.json';
const certificationPath = 'docs/receipt-bound-typed-executor-bundle-v1-certification.md';
const specificationPath = 'docs/superpowers/specs/2026-08-31-receipt-bound-typed-executor-bundle-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-receipt-bound-typed-executor-bundle-v1.md';
const parentReceiptPath = 'receipts/admitted-sealed-typed-execution-host-v1.json';
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
  planPath,
  reviewPath,
  specificationPath,
  fixturePath,
  'package.json',
  'scripts/build-receipt-bound-typed-executor-bundle-v1-fixture.mjs',
  'scripts/build-receipt-bound-typed-executor-bundle-v1-receipt.mjs',
  'src/certification/verify-ledger.mjs',
  'src/host/receipt-bound-admitted-sealed-typed-execution-launch.mjs',
  'src/runtime/receipt-bound-typed-executor-bundle.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/receipt-bound-typed-execution-child.mjs',
  'tests/helpers/receipt-bound-typed-executor-bundle-fixture.mjs',
  'tests/receipt-bound-admitted-sealed-typed-execution-launch.test.mjs',
  'tests/receipt-bound-typed-executor-bundle-certification.test.mjs',
  'tests/receipt-bound-typed-executor-bundle.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/receipt-bound-typed-executor-bundle.test.mjs',
  'tests/receipt-bound-admitted-sealed-typed-execution-launch.test.mjs',
  'tests/admitted-sealed-typed-execution-launch.test.mjs',
  'tests/admitted-sealed-typed-execution-host-certification.test.mjs',
  'tests/sealed-local-typed-execution-runner.test.mjs',
  'tests/sealed-local-typed-execution-runner-certification.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  { id: 'RBTEB-001', status: 'pass', evidence: ['one sibling launcher accepts no caller executor functions'] },
  { id: 'RBTEB-002', status: 'pass', evidence: ['one external SHA-256 pins a canonical receipt and exact module bytes'] },
  { id: 'RBTEB-003', status: 'pass', evidence: ['native verifier I/O rejects observed symlinks noncanonical aliases changed bytes and expanded fields on a quiescent filesystem'] },
  { id: 'RBTEB-004', status: 'pass', evidence: ['already verified bytes execute through content-addressed data URLs'] },
  { id: 'RBTEB-005', status: 'pass', evidence: ['bundle-derived descriptors match the admitted policy before execution'] },
  { id: 'RBTEB-006', status: 'pass', evidence: ['persisted Muse recovery runs Forge only and terminal replay runs no executor'] },
  { id: 'RBTEB-007', status: 'pass', evidence: ['historical host runner fixture receipt ledger and lineage remain reproducible'] },
]);
const proofLimits = Object.freeze([
  'Bundle executors are deterministic certification implementations, not live provider or model-quality certification.',
  'Imported executor code runs in the Node process and is not an operating-system sandbox.',
  'Receipt-certified executor behavior remains trusted inside that process.',
  'Hostile same-user filesystem replacement races and hard-link identity are not certified.',
  'Hostile mutation of already executing process memory is not certified.',
  'A node may repeat after executor return and before durable publication.',
  'External exactly-once effects and general executor idempotency remain unproved.',
  'No default adoption CLI provider transport Realm action continuity write evolution Inspiration Lunari or Soul activation is added.',
]);

function repositoryPath(value) {
  return value instanceof URL ? fileURLToPath(value) : resolve(value);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'receipt-bound executor test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'receipt-bound executor test run');
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error('receipt-bound executor test run is invalid');
    }
  }
  if (value.full.tests < value.focused.tests) throw new Error('receipt-bound executor full run is narrower than focused');
}

function requireDigest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}

function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (canonicalJson(value.paths) !== canonicalJson(paths)
      || canonicalJson(value.entries?.map(({ path }) => path)) !== canonicalJson(paths)) {
    throw new Error(`${label} paths are invalid`);
  }
  for (const entry of value.entries) {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    requireDigest(entry.sha256, `${label} entry digest`);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry bytes are invalid`);
  }
  requireDigest(value.digest, `${label} digest`);
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function verifyReceiptSource(value) {
  exactKeys(value, [
    'commit', 'parentCommit', 'historicalReceiptDigests', 'implementationManifest',
    'testManifest', 'specification', 'plan', 'review',
  ], 'receipt-bound executor source');
  if (!COMMIT.test(value.commit) || value.parentCommit !== sourceBaseCommit) {
    throw new Error('receipt-bound executor source identity is invalid');
  }
  if (canonicalJson(Object.keys(value.historicalReceiptDigests).sort())
      !== canonicalJson([...historicalReceiptPaths].sort())) {
    throw new Error('receipt-bound executor historical receipt set is invalid');
  }
  Object.values(value.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt digest'));
  verifyManifest(value.implementationManifest, implementationFiles, 'receipt-bound executor implementation manifest');
  verifyManifest(value.testManifest, testFiles, 'receipt-bound executor test manifest');
  for (const [reference, path] of [[value.specification, specificationPath], [value.plan, planPath]]) {
    exactKeys(reference, ['path', 'sha256'], 'receipt-bound executor source reference');
    if (reference.path !== path) throw new Error('receipt-bound executor source reference path changed');
    requireDigest(reference.sha256, 'receipt-bound executor source reference digest');
  }
  exactKeys(value.review, ['path', 'fileSha256', 'value'], 'receipt-bound executor review reference');
  if (value.review.path !== reviewPath) throw new Error('receipt-bound executor review path changed');
  requireDigest(value.review.fileSha256, 'receipt-bound executor review file digest');
  const review = value.review.value;
  exactKeys(review, [
    'schemaVersion', 'protocolId', 'reviewerModel', 'reviewMode', 'reviewedParentCommit',
    'reviewedDiffSha256', 'reviewedPaths', 'unresolvedCriticalDefects',
    'unresolvedImportantDefects', 'unresolvedMinorDefects', 'disposition', 'notes',
  ], 'receipt-bound executor embedded review');
  if (review.schemaVersion !== 1 || review.protocolId !== 'eternities-independent-source-review-v1'
      || review.reviewerModel !== 'terra' || review.reviewMode !== 'independent'
      || review.reviewedParentCommit !== sourceBaseCommit || review.disposition !== 'approved'
      || review.unresolvedCriticalDefects !== 0 || review.unresolvedImportantDefects !== 0
      || review.unresolvedMinorDefects !== 0 || !Array.isArray(review.notes)
      || !Array.isArray(review.reviewedPaths)
      || canonicalJson(review.reviewedPaths) !== canonicalJson([...review.reviewedPaths].sort())
      || new Set(review.reviewedPaths).size !== review.reviewedPaths.length) {
    throw new Error('receipt-bound executor embedded review is invalid');
  }
  requireDigest(review.reviewedDiffSha256, 'receipt-bound executor reviewed diff digest');
  if (value.review.fileSha256 !== sha256Text(`${canonicalJson(review)}\n`)) {
    throw new Error('receipt-bound executor review file digest mismatch');
  }
}

function verifyFixture(value) {
  assertNoCredentialFields(value);
  if (value?.schemaVersion !== 1
      || value?.protocolId !== 'eternities-receipt-bound-typed-executor-bundle-host-fixture-v1'
      || value?.fixtureDigest !== '7a213edd715b77e25336ac17fd6534362e8a1aec5b904ddf9d55615a2ff6e613') {
    throw new Error('receipt-bound executor fixture identity changed');
  }
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (value.fixtureDigest !== sha256Value(unsigned)
      || value.recovery?.crashObserved !== true
      || value.recovery?.freshProcessRecovery !== true
      || value.recovery?.executedSteps !== 1 || value.recovery?.recoveredSteps !== 1
      || value.recovery?.replayExecutedSteps !== 0 || value.recovery?.replayRecoveredSteps !== 2
      || value.recovery?.replayReceiptMatched !== true
      || value.guarantees?.exactVerifiedBytesExecuted !== true
      || value.guarantees?.callerExecutorsAccepted !== false
      || value.guarantees?.callerLoaderHooksAccepted !== false
      || value.guarantees?.authorityExpanded !== false
      || value.guarantees?.externalExactlyOnce !== false) {
    throw new Error('receipt-bound executor fixture boundary changed');
  }
  return value;
}

function controlledEnvironment() {
  const environment = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR']) delete environment[name];
  return environment;
}

async function reviewedDiff(root, sourceCommit) {
  const parentCommit = (await execFileAsync('git', ['-C', root, 'merge-base', sourceCommit, sourceBaseCommit], {
    encoding: 'utf8', windowsHide: true, env: controlledEnvironment(),
  })).stdout.trim();
  if (parentCommit !== sourceBaseCommit) throw new Error('receipt-bound executor source base changed');
  const pathspec = ['--', '.', `:(exclude)${reviewPath}`];
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
  ], 'receipt-bound executor Terra review');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-independent-source-review-v1'
      || value.reviewerModel !== 'terra' || value.reviewMode !== 'independent'
      || value.reviewedParentCommit !== expected.parentCommit
      || value.reviewedDiffSha256 !== expected.reviewedDiffSha256
      || canonicalJson(value.reviewedPaths) !== canonicalJson(expected.reviewedPaths)
      || value.unresolvedCriticalDefects !== 0 || value.unresolvedImportantDefects !== 0
      || value.unresolvedMinorDefects !== 0 || value.disposition !== 'approved'
      || !Array.isArray(value.notes)) throw new Error('receipt-bound executor Terra review is invalid');
  return value;
}

export function verifyReceiptBoundTypedExecutorBundleReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'parent',
    'fixture', 'requirements', 'metrics', 'testRuns', 'proofLimits', 'receiptDigest',
  ], 'receipt-bound executor certification');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId
      || !COMMIT.test(value.source?.commit) || value.source?.parentCommit !== sourceBaseCommit
      || value.fixture?.logicalDigest !== '7a213edd715b77e25336ac17fd6534362e8a1aec5b904ddf9d55615a2ff6e613'
      || value.parent?.receiptDigest !== 'c79366682c19ac9c597e014c003b6e13a1a126c192f6326428856d76c3833fc0') {
    throw new Error('receipt-bound executor certification identity changed');
  }
  if (canonicalJson(value.requirements) !== canonicalJson(requirements)
      || canonicalJson(value.proofLimits) !== canonicalJson(proofLimits)) {
    throw new Error('receipt-bound executor certification claims changed');
  }
  verifyFixture(value.fixture.value);
  verifyReceiptSource(value.source);
  exactKeys(value.parent, ['path', 'fileSha256', 'receiptDigest', 'sourceCommit'], 'receipt-bound executor parent');
  if (value.parent.path !== parentReceiptPath
      || value.parent.fileSha256 !== 'de5f8b98f4d8cd50e9291948e8a408d6c9e499b0f06e93ab74c7330b3804ec61'
      || value.parent.sourceCommit !== '6ccf40685f202226fe135a33a2678b3bd2208755') {
    throw new Error('receipt-bound executor parent binding changed');
  }
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'receipt-bound executor fixture binding');
  if (value.fixture.path !== fixturePath
      || value.fixture.fileSha256 !== 'cc9e4a24ee4b08f8cd81ffc931e2c118770d389d1adde3c10c0c9e00ccb2a664'
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(value.fixture.value)}\n`)) {
    throw new Error('receipt-bound executor fixture file binding changed');
  }
  verifyTestRuns(value.testRuns);
  exactKeys(value.metrics, [
    'bundleExecutors', 'recoveredSteps', 'executedAfterRecovery', 'replayExecutions',
    'callerExecutorFields', 'authorityExpansions', 'externalExactlyOnceClaims',
  ], 'receipt-bound executor metrics');
  if (canonicalJson(value.metrics) !== canonicalJson({
    bundleExecutors: 2, recoveredSteps: 1, executedAfterRecovery: 1,
    replayExecutions: 0, callerExecutorFields: 0, authorityExpansions: 0,
    externalExactlyOnceClaims: 0,
  })) throw new Error('receipt-bound executor metrics changed');
  const { receiptDigest, ...unsigned } = value;
  if (!DIGEST.test(receiptDigest) || receiptDigest !== sha256Value(unsigned)) {
    throw new Error('receipt-bound executor certification digest mismatch');
  }
  return value;
}

export async function buildReceiptBoundTypedExecutorBundleReceiptFromSource({
  repositoryRoot, sourceCommit, testRuns,
} = {}) {
  const root = repositoryPath(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('receipt-bound executor fixture is not canonical');
  const diff = await reviewedDiff(root, sourceCommit);
  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const review = verifyReview(JSON.parse(reviewText), diff);
  if (reviewText !== `${canonicalJson(review)}\n`) throw new Error('receipt-bound executor review is not canonical');
  const parentText = await gitText(root, sourceCommit, parentReceiptPath);
  const parent = JSON.parse(parentText);
  if (parentText !== `${canonicalJson(parent)}\n` || parent.receiptDigest !== 'c79366682c19ac9c597e014c003b6e13a1a126c192f6326428856d76c3833fc0') {
    throw new Error('receipt-bound executor parent receipt changed');
  }
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
    parent: {
      path: parentReceiptPath,
      fileSha256: sha256Text(parentText),
      receiptDigest: parent.receiptDigest,
      sourceCommit: parent.source.commit,
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements,
    metrics: {
      bundleExecutors: fixture.bundle.executors.length,
      recoveredSteps: fixture.recovery.recoveredSteps,
      executedAfterRecovery: fixture.recovery.executedSteps,
      replayExecutions: fixture.recovery.replayExecutedSteps,
      callerExecutorFields: fixture.guarantees.callerExecutorsAccepted ? 1 : 0,
      authorityExpansions: fixture.guarantees.authorityExpanded ? 1 : 0,
      externalExactlyOnceClaims: fixture.guarantees.externalExactlyOnce ? 1 : 0,
    },
    testRuns,
    proofLimits,
  };
  return verifyReceiptBoundTypedExecutorBundleReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

async function writeCertification(path, receipt, release) {
  const text = `# Receipt-bound typed executor bundle v1 certification

source commit: \`${receipt.source.commit}\`

parent host receipt: \`${receipt.parent.receiptDigest}\`

fixture digest: \`${receipt.fixture.logicalDigest}\`

receipt digest: \`${receipt.receiptDigest}\`

focused tests: ${receipt.testRuns.focused.tests}

full tests: ${receipt.testRuns.full.tests}

release tests: ${release.tests}

the sibling launcher executes only exact receipt-bound module bytes whose derived descriptors match the admitted host policy. no existing launch path changes.

external exactly-once effects, live model quality, operating-system sandboxing, and default adoption remain unproved.
`;
  await writeFile(path, text, 'utf8');
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({ root, headCommit: head, outputPath, releaseOnlyPaths });
  const committedFixture = verifyFixture(JSON.parse(await gitText(root, sourceCommit, fixturePath)));
  const liveFixture = await buildDeterministicReceiptBoundTypedExecutorBundleHostFixture();
  if (canonicalJson(liveFixture) !== canonicalJson(committedFixture)) {
    throw new Error('live receipt-bound executor fixture differs from committed fixture');
  }
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildReceiptBoundTypedExecutorBundleReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildReceiptBoundTypedExecutorBundleReceiptFromSource({
    repositoryRoot: root, sourceCommit, testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/receipt-bound-typed-executor-bundle-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeCertification(join(root, ...certificationPath.split('/')), receipt, release);
  process.stdout.write(`${canonicalJson({
    status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main().catch((error) => {
    process.stderr.write(`receipt-bound typed executor certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
