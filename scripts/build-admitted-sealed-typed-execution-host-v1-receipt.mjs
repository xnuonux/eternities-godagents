import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicAdmittedSealedTypedExecutionHostFixture } from '../tests/helpers/admitted-sealed-typed-execution-host-fixture.mjs';
import { verifySealedLocalTypedExecutionRunnerReceipt } from './build-sealed-local-typed-execution-runner-v1-receipt.mjs';
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
const certificationId = 'admitted-sealed-typed-execution-host-v1';
const protocolId = 'eternities-admitted-sealed-typed-execution-host-certification-v1';
const fixturePath = 'fixtures/admitted-sealed-typed-execution-host-v1.json';
const receiptPath = 'receipts/admitted-sealed-typed-execution-host-v1.json';
const runnerReceiptPath = 'receipts/sealed-local-typed-execution-runner-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-admitted-sealed-typed-execution-host-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-admitted-sealed-typed-execution-host-v1.md';
const reviewPath = 'docs/admitted-sealed-typed-execution-host-v1-terra-review.json';
const certificationPath = 'docs/admitted-sealed-typed-execution-host-v1-certification.md';
const sourceBaseCommit = '1f0470e43994f804ebcced20c90267bda0310fbd';
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
  'receipts/recoverable-typed-execution-journal-v1.json',
  'receipts/resumable-mission-review-kernel-v1.json',
  'receipts/routing-evidence-activation-classifier-v1.json',
  'receipts/sealed-local-godskills-transport-v1.json',
  'receipts/sealed-local-identity-vessel-v1.json',
  'receipts/sealed-local-typed-composition-compiler-v1.json',
  runnerReceiptPath,
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
  'schemas/admitted-typed-execution-host-completion.schema.json',
  'schemas/admitted-typed-execution-host-policy.schema.json',
  'schemas/typed-capability-executor-descriptor.schema.json',
  'scripts/build-admitted-sealed-typed-execution-host-v1-receipt.mjs',
  'scripts/build-sealed-local-typed-execution-runner-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/cortex/binding-compiler.mjs',
  'src/genesis/verify.mjs',
  'src/host/admitted-identity-boundary.mjs',
  'src/host/admitted-sealed-typed-execution-launch.mjs',
  'src/host/admitted-typed-execution-contracts.mjs',
  'src/host/admitted-typed-execution-policy.mjs',
  'src/host/local-instance-registry.mjs',
  'src/runtime/identity-bound-mission-vessel-contracts.mjs',
  'src/runtime/recoverable-typed-execution-journal.mjs',
  'src/runtime/sealed-local-typed-execution-runner.mjs',
  'src/skills/routing-evidence-activation-classifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/skills/typed-composition-verifier.mjs',
  'src/skills/typed-execution-stepper-verifier.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/admitted-sealed-identity-host-certification.test.mjs',
  'tests/admitted-sealed-typed-execution-host-certification.test.mjs',
  'tests/admitted-sealed-typed-execution-launch.test.mjs',
  'tests/admitted-typed-execution-policy.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-sealed-typed-execution-host-fixture.mjs',
  'tests/receipt-safety.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/sealed-local-typed-execution-runner-certification.test.mjs',
  'tests/sealed-local-typed-execution-runner.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/admitted-sealed-identity-host-certification.test.mjs',
  'tests/admitted-sealed-typed-execution-launch.test.mjs',
  'tests/admitted-typed-execution-policy.test.mjs',
  'tests/receipt-safety.test.mjs',
  'tests/sealed-local-typed-execution-runner-certification.test.mjs',
  'tests/sealed-local-typed-execution-runner.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  { id: 'ASTEH-001', evidence: ['one sibling programmatic host preserves every historical host and default launch path'], status: 'pass' },
  { id: 'ASTEH-002', evidence: ['one external digest pins the canonical identity topology executor and runner policy'], status: 'pass' },
  { id: 'ASTEH-003', evidence: ['transactional genesis personal keel Realm and local residency verify before runner construction'], status: 'pass' },
  { id: 'ASTEH-004', evidence: ['Godskills input derives only from the verified mission request and cortex identity candidate'], status: 'pass' },
  { id: 'ASTEH-005', evidence: ['live authority-empty executor descriptors match policy exactly before execution'], status: 'pass' },
  { id: 'ASTEH-006', evidence: ['caller binding input transports activation result typed method verifier IO lock policy runtime hooks artifact cache registry handle and runner factory are rejected'], status: 'pass' },
  { id: 'ASTEH-007', evidence: ['one local route and activation complete deterministic Muse-to-Forge execution'], status: 'pass' },
  { id: 'ASTEH-008', evidence: ['persisted Muse output recovers with Forge only and no local process relaunch'], status: 'pass' },
  { id: 'ASTEH-009', evidence: ['terminal replay invokes no local process and no node executor'], status: 'pass' },
  { id: 'ASTEH-010', evidence: ['policy path authority topology executor and release drift fail before affected work'], status: 'pass' },
  { id: 'ASTEH-011', evidence: ['durable state contains no typed method credential provider endpoint model or secret field'], status: 'pass' },
  { id: 'ASTEH-012', evidence: ['fixture review receipt ledger and release lineage reproduce from exact commits'], status: 'pass' },
]);
const proofLimits = Object.freeze([
  'Descriptor-bound executor implementations remain trusted.',
  'A node may repeat after executor return and before durable publication.',
  'External exactly-once effects and executor idempotency are not certified.',
  'Live model provider skill and output quality are not certified.',
  'Hostile same-user mutation and operating-system sandboxing are not certified.',
  'No CLI provider transport default launch Realm action continuity write evolution Inspiration Lunari or Soul activation is added.',
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

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'admitted typed host test runs');
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
  if (!same(value.paths, paths) || !same(value.entries?.map(({ path }) => path), paths)) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    requireDigest(entry.sha256, `${label} entry digest`);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry bytes are invalid`);
  });
  requireDigest(value.digest, `${label} digest`);
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
  return value;
}

export function verifyAdmittedSealedTypedExecutionHostFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'policy', 'identity', 'roots', 'completion',
    'recovery', 'durableState', 'guarantees', 'fixtureDigest',
  ], 'admitted typed host fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-admitted-sealed-typed-execution-host-fixture-v1') {
    throw new Error('admitted typed host fixture identity is invalid');
  }
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (value.fixtureDigest !== sha256Value(unsigned)
      || value.fixtureDigest !== 'bce58b98a3554c29796788be975f8a56971a352289a16f2e200e803af829b760') {
    throw new Error('admitted typed host fixture digest mismatch');
  }
  if (value.roots.runnerReceiptDigest !== '7558bed70b3199936f39244d44c0402807818c286b5eaf8c68688d96821ea831'
      || value.roots.routingTrustRootDigest !== '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28'
      || value.roots.activationTrustRootDigest !== 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7'
      || value.roots.typedCompositionReceiptDigest !== 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a'
      || value.roots.stepperReceiptDigest !== '5caff10e19ec98020da451396af11a9e479afa61ba4d43546ce1559b23da2b17'
      || !same(value.policy.executorCapabilities, ['eternities-forge', 'eternities-muse'])
      || value.recovery.crashObserved !== true
      || !same(value.recovery.durableOperations, { activation: 1, route: 1 })
      || !same(value.recovery.firstExecutions, ['eternities-muse'])
      || !same(value.recovery.recoveryExecutions, ['eternities-forge'])
      || value.recovery.recoveredSteps !== 1 || value.recovery.executedSteps !== 1
      || value.recovery.replayExecutedSteps !== 0 || value.recovery.replayRecoveredSteps !== 2
      || !same(value.recovery.replayExecutions, []) || value.recovery.replayReceiptMatched !== true
      || value.durableState.serializedMethodFields !== 0 || value.durableState.forbiddenFields !== 0
      || value.guarantees.policyExecutorBoundDurableNamespace !== true
      || value.guarantees.canonicalResidencyRegistry !== true
      || value.guarantees.callerRuntimeHooks !== false
      || value.guarantees.externalExactlyOnce !== false
      || value.guarantees.authorityExpanded !== false
      || value.guarantees.defaultLaunchEnabled !== false) {
    throw new Error('admitted typed host fixture boundary changed');
  }
  for (const digest of [
    value.policy.digest, value.identity.bindingDigest, value.durableState.structuralManifestDigest,
    ...Object.values(value.roots), ...Object.values(value.completion),
  ]) requireDigest(digest, 'admitted typed host fixture digest');
  return value;
}

async function controlledGit(root, args, options = {}) {
  const environment = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR']) delete environment[name];
  return execFileAsync('git', ['-C', root, ...args], { windowsHide: true, env: environment, ...options });
}

async function reviewedDiffAtCommit(root, sourceCommit) {
  const parentCommit = (await controlledGit(root, ['merge-base', sourceCommit, sourceBaseCommit], { encoding: 'utf8' })).stdout.trim();
  if (parentCommit !== sourceBaseCommit) throw new Error('admitted typed host source base changed');
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
  ], 'admitted typed host Terra review');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-independent-source-review-v1'
      || value.reviewerModel !== 'terra' || value.reviewMode !== 'independent'
      || value.disposition !== 'approved' || value.unresolvedCriticalDefects !== 0
      || value.unresolvedImportantDefects !== 0 || !Array.isArray(value.notes)
      || value.reviewedParentCommit !== expected.parentCommit
      || value.reviewedDiffSha256 !== expected.reviewedDiffSha256
      || !same(value.reviewedPaths, expected.reviewedPaths)) {
    throw new Error('admitted typed host Terra review is invalid');
  }
  return value;
}

export function verifyAdmittedSealedTypedExecutionHostReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'runner',
    'fixture', 'requirements', 'metrics', 'testRuns', 'proofLimits', 'receiptDigest',
  ], 'admitted typed host receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('admitted typed host receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'parentCommit', 'historicalReceiptDigests', 'implementationManifest',
    'testManifest', 'specification', 'plan', 'review',
  ], 'admitted typed host source');
  if (!COMMIT.test(value.source.commit) || !COMMIT.test(value.source.parentCommit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('admitted typed host source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt digest'));
  const implementation = verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  for (const [descriptor, path, label] of [
    [value.source.specification, specificationPath, 'specification'],
    [value.source.plan, planPath, 'plan'],
  ]) {
    exactKeys(descriptor, ['path', 'sha256'], `admitted typed host ${label}`);
    if (descriptor.path !== path || descriptor.sha256 !== implementation.entries.find((entry) => entry.path === path)?.sha256) {
      throw new Error(`admitted typed host ${label} binding is invalid`);
    }
  }
  exactKeys(value.source.review, ['path', 'fileSha256', 'value'], 'admitted typed host review descriptor');
  if (value.source.review.path !== reviewPath
      || value.source.review.fileSha256 !== sha256Text(`${canonicalJson(value.source.review.value)}\n`)) {
    throw new Error('admitted typed host review binding is invalid');
  }
  verifyReview(value.source.review.value, {
    parentCommit: value.source.parentCommit,
    reviewedDiffSha256: value.source.review.value.reviewedDiffSha256,
    reviewedPaths: value.source.review.value.reviewedPaths,
  });
  exactKeys(value.runner, ['path', 'fileSha256', 'receiptDigest', 'sourceCommit', 'fixtureDigest'], 'sealed runner root');
  if (value.runner.path !== runnerReceiptPath
      || value.runner.fileSha256 !== value.source.historicalReceiptDigests[runnerReceiptPath]
      || value.runner.receiptDigest !== value.fixture.value.roots.runnerReceiptDigest
      || !COMMIT.test(value.runner.sourceCommit)) {
    throw new Error('admitted typed host runner binding is invalid');
  }
  Object.values(value.runner).filter((entry) => typeof entry === 'string' && DIGEST.test(entry)).forEach((digest) => requireDigest(digest, 'runner root digest'));
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'admitted typed host fixture descriptor');
  const fixture = verifyAdmittedSealedTypedExecutionHostFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('admitted typed host fixture binding mismatch');
  }
  if (!same(value.requirements, requirements) || !same(value.proofLimits, proofLimits)) {
    throw new Error('admitted typed host claims changed');
  }
  if (!same(value.metrics, {
    routeDurableOperations: 1,
    activationDurableOperations: 1,
    recoveredSteps: 1,
    executedAfterRecovery: 1,
    replayedExecutions: 0,
    serializedMethodFields: 0,
    forbiddenFields: 0,
    authorityExpansions: 0,
    externalExactlyOnceClaims: 0,
    defaultLaunchPathsEnabled: 0,
    callerRuntimeHooksAccepted: 0,
    callerRegistryOverridesAccepted: 0,
  })) throw new Error('admitted typed host metrics changed');
  verifyTestRuns(value.testRuns);
  const unsigned = structuredClone(value);
  delete unsigned.receiptDigest;
  requireDigest(value.receiptDigest, 'admitted typed host receipt digest');
  if (value.receiptDigest !== sha256Value(unsigned)) throw new Error('admitted typed host receipt digest mismatch');
  return value;
}

export async function buildAdmittedSealedTypedExecutionHostReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryPath(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyAdmittedSealedTypedExecutionHostFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('admitted typed host fixture is not canonical');
  const reviewed = await reviewedDiffAtCommit(root, sourceCommit);
  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const review = verifyReview(JSON.parse(reviewText), reviewed);
  if (reviewText !== `${canonicalJson(review)}\n`) throw new Error('admitted typed host review is not canonical');
  const runnerText = await gitText(root, sourceCommit, runnerReceiptPath);
  const runner = verifySealedLocalTypedExecutionRunnerReceipt(JSON.parse(runnerText));
  if (runnerText !== `${canonicalJson(runner)}\n`) throw new Error('sealed runner receipt is not canonical');
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
    runner: {
      path: runnerReceiptPath,
      fileSha256: sha256Text(runnerText),
      receiptDigest: runner.receiptDigest,
      sourceCommit: runner.source.commit,
      fixtureDigest: runner.fixture.logicalDigest,
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements,
    metrics: {
      routeDurableOperations: fixture.recovery.durableOperations.route,
      activationDurableOperations: fixture.recovery.durableOperations.activation,
      recoveredSteps: fixture.recovery.recoveredSteps,
      executedAfterRecovery: fixture.recovery.executedSteps,
      replayedExecutions: fixture.recovery.replayExecutions.length,
      serializedMethodFields: fixture.durableState.serializedMethodFields,
      forbiddenFields: fixture.durableState.forbiddenFields,
      authorityExpansions: fixture.guarantees.authorityExpanded ? 1 : 0,
      externalExactlyOnceClaims: fixture.guarantees.externalExactlyOnce ? 1 : 0,
      defaultLaunchPathsEnabled: fixture.guarantees.defaultLaunchEnabled ? 1 : 0,
      callerRuntimeHooksAccepted: fixture.guarantees.callerRuntimeHooks ? 1 : 0,
      callerRegistryOverridesAccepted: fixture.guarantees.canonicalResidencyRegistry ? 0 : 1,
    },
    testRuns,
    proofLimits,
  };
  return verifyAdmittedSealedTypedExecutionHostReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

async function writeCertification(path, receipt, release) {
  const lines = [
    '# Admitted sealed typed execution host v1 certification',
    '',
    `source commit: \`${receipt.source.commit}\``,
    '',
    `sealed runner receipt: \`${receipt.runner.receiptDigest}\``,
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
    'the sibling programmatic host binds one admitted identity and external policy to the certified sealed typed runner without changing existing launch paths.',
    '',
    'executor implementations remain trusted and external exactly-once effects remain unproved.',
    '',
  ];
  await writeFile(path, lines.join('\n'), 'utf8');
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const fixtureOutput = join(root, ...fixturePath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = verifyAdmittedSealedTypedExecutionHostFixture(
      await buildDeterministicAdmittedSealedTypedExecutionHostFixture(),
    );
    await mkdir(dirname(fixtureOutput), { recursive: true });
    await writeFile(fixtureOutput, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({ status: 'written', fixtureDigest: fixture.fixtureDigest })}\n`);
    return;
  }
  await requireCleanExcept(root, releaseOnlyPaths);
  const outputPath = join(root, ...receiptPath.split('/'));
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({ root, headCommit: head, outputPath, releaseOnlyPaths });
  const committedFixture = JSON.parse(await gitText(root, sourceCommit, fixturePath));
  const liveFixture = await buildDeterministicAdmittedSealedTypedExecutionHostFixture();
  if (canonicalJson(liveFixture) !== canonicalJson(committedFixture)) {
    throw new Error('live admitted typed host fixture differs from committed fixture');
  }
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildAdmittedSealedTypedExecutionHostReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildAdmittedSealedTypedExecutionHostReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/admitted-sealed-typed-execution-host-certification.test.mjs',
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
    process.stderr.write(`admitted sealed typed execution host certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
