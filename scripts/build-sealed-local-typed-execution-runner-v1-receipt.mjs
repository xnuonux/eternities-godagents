import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicSealedLocalTypedExecutionRunnerFixture } from '../tests/helpers/sealed-local-typed-execution-runner-fixture.mjs';
import { verifyRecoverableTypedExecutionJournalReceipt } from './build-recoverable-typed-execution-journal-v1-receipt.mjs';
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
import {
  pinnedGodskillsReviewRelease,
  pinnedGodskillsReviewSourceCommit,
} from './lib/pinned-godskills-review-release.mjs';
import {
  pinnedGodskillsRoutingExecutable,
  pinnedGodskillsRoutingSourceCommit,
} from './lib/pinned-godskills-routing-executable.mjs';
import {
  pinnedGodskillsTypedCompositionRelease,
  pinnedGodskillsTypedCompositionSourceCommit,
} from './lib/pinned-godskills-typed-composition.mjs';
import {
  pinnedGodskillsTypedExecutionStepperRelease,
  pinnedGodskillsTypedExecutionStepperSourceCommit,
} from './lib/pinned-godskills-typed-execution-stepper.mjs';

const execFileAsync = promisify(execFile);
const certificationId = 'sealed-local-typed-execution-runner-v1';
const protocolId = 'eternities-sealed-local-typed-execution-runner-certification-v1';
const fixturePath = 'fixtures/sealed-local-typed-execution-runner-v1.json';
const receiptPath = 'receipts/sealed-local-typed-execution-runner-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-sealed-local-typed-execution-runner-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-sealed-local-typed-execution-runner-v1.md';
const reviewPath = 'docs/sealed-local-typed-execution-runner-v1-terra-review.json';
const certificationPath = 'docs/sealed-local-typed-execution-runner-v1-certification.md';
const journalReceiptPath = 'receipts/recoverable-typed-execution-journal-v1.json';
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
  journalReceiptPath,
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
  'scripts/build-sealed-local-typed-execution-runner-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  'scripts/lib/pinned-godskills-typed-composition.mjs',
  'scripts/lib/pinned-godskills-typed-execution-stepper.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/runtime/recoverable-typed-execution-journal.mjs',
  'src/runtime/sealed-local-typed-execution-runner.mjs',
  'src/skills/local-recoverable-godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-process-transport.mjs',
  'src/skills/recoverable-godskills-adapter.mjs',
  'src/skills/recoverable-typed-composition-compiler.mjs',
  'src/skills/recoverable-typed-composition-contracts.mjs',
  'src/skills/typed-composition-verifier.mjs',
  'src/skills/typed-execution-stepper-adapter.mjs',
  'src/skills/typed-execution-stepper-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/recoverable-typed-composition-fixture.mjs',
  'tests/helpers/sealed-local-typed-execution-runner-fixture.mjs',
  'tests/recoverable-typed-execution-journal-certification.test.mjs',
  'tests/recoverable-typed-execution-journal.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/sealed-local-typed-composition-compiler.test.mjs',
  'tests/sealed-local-typed-execution-runner-certification.test.mjs',
  'tests/sealed-local-typed-execution-runner.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/recoverable-typed-execution-journal-certification.test.mjs',
  'tests/recoverable-typed-execution-journal.test.mjs',
  'tests/sealed-local-typed-composition-compiler.test.mjs',
  'tests/sealed-local-typed-execution-runner.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  { id: 'SLTER-001', evidence: ['one closed factory pins the exact local Godskills release and routing activation composition and stepper trust roots'], status: 'pass' },
  { id: 'SLTER-002', evidence: ['caller transport activation-result and typed-method injection are rejected before execution'], status: 'pass' },
  { id: 'SLTER-003', evidence: ['local route and activation children each launch once and their durable completion is reused'], status: 'pass' },
  { id: 'SLTER-004', evidence: ['the recovered binding reconstructs the same plan method and activation result digests'], status: 'pass' },
  { id: 'SLTER-005', evidence: ['Godskills validates node output before the journal publishes durable progress'], status: 'pass' },
  { id: 'SLTER-006', evidence: ['process death after first durable node resumes at the second node without relaunching local children'], status: 'pass' },
  { id: 'SLTER-007', evidence: ['terminal replay performs zero process launches and zero node executions'], status: 'pass' },
  { id: 'SLTER-008', evidence: ['impossible topology and stepper pin drift fail before child launch'], status: 'pass' },
  { id: 'SLTER-009', evidence: ['durable state contains no private typed method body'], status: 'pass' },
  { id: 'SLTER-010', evidence: ['authority expansion default launch and external exactly-once claims remain false'], status: 'pass' },
  { id: 'SLTER-011', evidence: ['fixture source review receipt ledger and release lineage reproduce from exact commits'], status: 'pass' },
]);
const proofLimits = Object.freeze([
  'The activation classifier and typed node executors remain trusted inputs.',
  'A node may repeat when process death occurs after executor return but before durable publication.',
  'External exactly-once effects and executor idempotency are not certified.',
  'Live model provider skill and output quality are not certified.',
  'Hostile same-user mutation and operating-system sandboxing are not certified.',
  'The runner is additive and is not adopted by an existing host vessel CLI or launcher by default.',
  'No Realm continuity keel evolution Lunari Inspiration or Soul authority is granted.',
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
  exactKeys(value, ['focused', 'full'], 'sealed runner test runs');
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

export function verifySealedLocalTypedExecutionRunnerFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'roots', 'compilation', 'execution', 'recovery',
    'durableState', 'guarantees', 'fixtureDigest',
  ], 'sealed runner fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-sealed-local-typed-execution-runner-fixture-v1') {
    throw new Error('sealed runner fixture identity is invalid');
  }
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (value.fixtureDigest !== sha256Value(unsigned)
      || value.fixtureDigest !== '14d5d20d51aaa1b587f273fb0395eb5c03cd257d7a7114f02ba706796d2a09a9') {
    throw new Error('sealed runner fixture digest mismatch');
  }
  Object.values(value.roots).forEach((digest) => requireDigest(digest, 'sealed runner root'));
  if (!same(value.roots, {
    activationTrustRootDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
    godskillsReleaseDigest: 'c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f',
    routingTrustRootDigest: '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28',
    stepperReceiptDigest: '5caff10e19ec98020da451396af11a9e479afa61ba4d43546ce1559b23da2b17',
    typedCompositionReceiptDigest: 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a',
  }) || value.recovery.crashObserved !== true
      || !same(value.recovery.launches, { activation: 1, route: 1 })
      || !same(value.recovery.firstExecutions, ['eternities-muse'])
      || !same(value.recovery.recoveryExecutions, ['eternities-forge'])
      || value.recovery.recoveredSteps !== 1 || value.recovery.executedSteps !== 1
      || value.recovery.replayRecoveredSteps !== 2 || value.recovery.replayExecutedSteps !== 0
      || !same(value.recovery.replayExecutions, [])
      || value.durableState.serializedMethodFields !== 0
      || !same(value.guarantees, {
        authorityExpanded: false,
        callerActivationResultInjection: false,
        callerTransportInjection: false,
        defaultLaunchEnabled: false,
        externalExactlyOnce: false,
        methodSerialized: false,
      })) {
    throw new Error('sealed runner fixture boundary changed');
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
  ], 'sealed runner Terra review');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-independent-source-review-v1'
      || value.reviewerModel !== 'terra' || value.reviewMode !== 'independent'
      || value.disposition !== 'approved' || value.unresolvedCriticalDefects !== 0
      || value.unresolvedImportantDefects !== 0 || !Array.isArray(value.notes)
      || value.reviewedParentCommit !== expected.parentCommit
      || value.reviewedDiffSha256 !== expected.reviewedDiffSha256
      || !same(value.reviewedPaths, expected.reviewedPaths)) {
    throw new Error('sealed runner Terra review is invalid');
  }
  return value;
}

async function trustRootsAtCommit(root, sourceCommit, fixture) {
  const release = pinnedGodskillsReviewRelease('C:/dev/eternities-godskills');
  const routing = pinnedGodskillsRoutingExecutable();
  const composition = pinnedGodskillsTypedCompositionRelease('C:/dev/eternities-godskills');
  const stepper = pinnedGodskillsTypedExecutionStepperRelease('C:/dev/eternities-godskills');
  const journalText = await gitText(root, sourceCommit, journalReceiptPath);
  const journal = verifyRecoverableTypedExecutionJournalReceipt(JSON.parse(journalText));
  return {
    godskillsRelease: {
      sourceCommit: pinnedGodskillsReviewSourceCommit,
      releaseDigest: fixture.roots.godskillsReleaseDigest,
      systemReceiptFileSha256: release.systemReceipt.sha256,
      routerReceiptFileSha256: release.routerReceipt.sha256,
      compilerReceiptFileSha256: release.compilerReceipt.sha256,
      portableReceiptFileSha256: release.portableReceipt.sha256,
    },
    routingExecutable: {
      sourceCommit: pinnedGodskillsRoutingSourceCommit,
      receiptDigest: routing.executableReceipt.receiptDigest,
      receiptFileSha256: routing.executableReceipt.sha256,
      entrypointFileSha256: routing.entrypoint.sha256,
    },
    activationExecutable: {
      sourceCommit: pinnedGodskillsReviewSourceCommit,
      receiptDigest: release.activation.executableReceipt.receiptDigest,
      receiptFileSha256: release.activation.executableReceipt.sha256,
      entrypointFileSha256: release.activation.entrypoint.sha256,
    },
    typedComposition: {
      sourceCommit: pinnedGodskillsTypedCompositionSourceCommit,
      receiptDigest: composition.releaseReceipt.receiptDigest,
      receiptFileSha256: composition.releaseReceipt.sha256,
      moduleFileSha256: composition.module.sha256,
    },
    typedExecutionStepper: {
      sourceCommit: pinnedGodskillsTypedExecutionStepperSourceCommit,
      receiptDigest: stepper.releaseReceipt.receiptDigest,
      receiptFileSha256: stepper.releaseReceipt.sha256,
      moduleFileSha256: stepper.module.sha256,
    },
    executionJournal: {
      sourceCommit: journal.source.commit,
      receiptDigest: journal.receiptDigest,
      receiptFileSha256: sha256Text(journalText),
    },
  };
}

export function verifySealedLocalTypedExecutionRunnerReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'trustRoots',
    'fixture', 'requirements', 'metrics', 'testRuns', 'proofLimits', 'receiptDigest',
  ], 'sealed runner receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('sealed runner receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'parentCommit', 'historicalReceiptDigests', 'implementationManifest',
    'testManifest', 'specification', 'plan', 'review',
  ], 'sealed runner source');
  if (!COMMIT.test(value.source.commit) || !COMMIT.test(value.source.parentCommit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('sealed runner source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt digest'));
  const implementation = verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  for (const [descriptor, path, label] of [
    [value.source.specification, specificationPath, 'specification'],
    [value.source.plan, planPath, 'plan'],
  ]) {
    exactKeys(descriptor, ['path', 'sha256'], `sealed runner ${label}`);
    if (descriptor.path !== path || descriptor.sha256 !== implementation.entries.find((entry) => entry.path === path)?.sha256) {
      throw new Error(`sealed runner ${label} binding is invalid`);
    }
  }
  exactKeys(value.source.review, ['path', 'fileSha256', 'value'], 'sealed runner review descriptor');
  requireDigest(value.source.review.fileSha256, 'sealed runner review file digest');
  if (value.source.review.path !== reviewPath
      || value.source.review.fileSha256 !== sha256Text(`${canonicalJson(value.source.review.value)}\n`)) {
    throw new Error('sealed runner review binding is invalid');
  }
  verifyReview(value.source.review.value, {
    parentCommit: value.source.parentCommit,
    reviewedDiffSha256: value.source.review.value.reviewedDiffSha256,
    reviewedPaths: value.source.review.value.reviewedPaths,
  });
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'sealed runner fixture descriptor');
  const fixture = verifySealedLocalTypedExecutionRunnerFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('sealed runner fixture binding mismatch');
  }
  exactKeys(value.trustRoots, [
    'godskillsRelease', 'routingExecutable', 'activationExecutable',
    'typedComposition', 'typedExecutionStepper', 'executionJournal',
  ], 'sealed runner trust roots');
  const rootFields = {
    godskillsRelease: [
      'sourceCommit', 'releaseDigest', 'systemReceiptFileSha256',
      'routerReceiptFileSha256', 'compilerReceiptFileSha256', 'portableReceiptFileSha256',
    ],
    routingExecutable: ['sourceCommit', 'receiptDigest', 'receiptFileSha256', 'entrypointFileSha256'],
    activationExecutable: ['sourceCommit', 'receiptDigest', 'receiptFileSha256', 'entrypointFileSha256'],
    typedComposition: ['sourceCommit', 'receiptDigest', 'receiptFileSha256', 'moduleFileSha256'],
    typedExecutionStepper: ['sourceCommit', 'receiptDigest', 'receiptFileSha256', 'moduleFileSha256'],
    executionJournal: ['sourceCommit', 'receiptDigest', 'receiptFileSha256'],
  };
  for (const [name, fields] of Object.entries(rootFields)) exactKeys(value.trustRoots[name], fields, `${name} trust root`);
  for (const root of Object.values(value.trustRoots)) {
    Object.entries(root).forEach(([name, digest]) => {
      if (name === 'sourceCommit') {
        if (!COMMIT.test(digest)) throw new Error('sealed runner root source commit is invalid');
      } else requireDigest(digest, `sealed runner root ${name}`);
    });
  }
  if (value.trustRoots.godskillsRelease.releaseDigest !== fixture.roots.godskillsReleaseDigest
      || value.trustRoots.routingExecutable.receiptDigest !== fixture.roots.routingTrustRootDigest
      || value.trustRoots.activationExecutable.receiptDigest !== fixture.roots.activationTrustRootDigest
      || value.trustRoots.typedComposition.receiptDigest !== fixture.roots.typedCompositionReceiptDigest
      || value.trustRoots.typedExecutionStepper.receiptDigest !== fixture.roots.stepperReceiptDigest
      || value.trustRoots.executionJournal.receiptFileSha256 !== value.source.historicalReceiptDigests[journalReceiptPath]) {
    throw new Error('sealed runner trust root binding changed');
  }
  if (!same(value.requirements, requirements) || !same(value.proofLimits, proofLimits)) {
    throw new Error('sealed runner claims changed');
  }
  if (!same(value.metrics, {
    routeLaunches: 1,
    activationLaunches: 1,
    recoveredSteps: 1,
    executedAfterRecovery: 1,
    replayedExecutions: 0,
    serializedMethodFields: 0,
    authorityExpansions: 0,
    externalExactlyOnceClaims: 0,
    defaultLaunchPathsEnabled: 0,
  })) throw new Error('sealed runner metrics changed');
  verifyTestRuns(value.testRuns);
  const unsigned = structuredClone(value);
  delete unsigned.receiptDigest;
  requireDigest(value.receiptDigest, 'sealed runner receipt digest');
  if (value.receiptDigest !== sha256Value(unsigned)) throw new Error('sealed runner receipt digest mismatch');
  return value;
}

export async function buildSealedLocalTypedExecutionRunnerReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryPath(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifySealedLocalTypedExecutionRunnerFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('sealed runner fixture is not canonical');
  const reviewed = await reviewedDiffAtCommit(root, sourceCommit);
  const reviewText = await gitText(root, sourceCommit, reviewPath);
  const review = verifyReview(JSON.parse(reviewText), reviewed);
  if (reviewText !== `${canonicalJson(review)}\n`) throw new Error('sealed runner review is not canonical');
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
    trustRoots: await trustRootsAtCommit(root, sourceCommit, fixture),
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements,
    metrics: {
      routeLaunches: fixture.recovery.launches.route,
      activationLaunches: fixture.recovery.launches.activation,
      recoveredSteps: fixture.recovery.recoveredSteps,
      executedAfterRecovery: fixture.recovery.executedSteps,
      replayedExecutions: fixture.recovery.replayExecutions.length,
      serializedMethodFields: fixture.durableState.serializedMethodFields,
      authorityExpansions: fixture.guarantees.authorityExpanded ? 1 : 0,
      externalExactlyOnceClaims: fixture.guarantees.externalExactlyOnce ? 1 : 0,
      defaultLaunchPathsEnabled: fixture.guarantees.defaultLaunchEnabled ? 1 : 0,
    },
    testRuns,
    proofLimits,
  };
  return verifySealedLocalTypedExecutionRunnerReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

async function writeCertification(path, receipt, release) {
  const lines = [
    '# Sealed local typed execution runner v1 certification',
    '',
    `source commit: \`${receipt.source.commit}\``,
    '',
    `runner fixture digest: \`${receipt.fixture.logicalDigest}\``,
    '',
    `journal receipt digest: \`${receipt.trustRoots.executionJournal.receiptDigest}\``,
    '',
    `receipt digest: \`${receipt.receiptDigest}\``,
    '',
    `focused tests: ${receipt.testRuns.focused.tests}`,
    '',
    `full tests: ${receipt.testRuns.full.tests}`,
    '',
    `release tests: ${release.tests}`,
    '',
    'the additive runner seals local Godskills routing and activation, deterministic typed compilation, and per-node durable recovery behind one closed factory.',
    '',
    'external exactly-once effects remain explicitly unproved and no default host path changes.',
    '',
  ];
  await writeFile(path, lines.join('\n'), 'utf8');
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const fixtureOutput = join(root, ...fixturePath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = verifySealedLocalTypedExecutionRunnerFixture(
      await buildDeterministicSealedLocalTypedExecutionRunnerFixture(),
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
  const liveFixture = await buildDeterministicSealedLocalTypedExecutionRunnerFixture();
  if (canonicalJson(liveFixture) !== canonicalJson(committedFixture)) {
    throw new Error('live sealed runner fixture differs from committed fixture');
  }
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildSealedLocalTypedExecutionRunnerReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildSealedLocalTypedExecutionRunnerReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/sealed-local-typed-execution-runner-certification.test.mjs',
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
    process.stderr.write(`sealed local typed execution runner certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
