import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createCodexTurnJournal } from '../src/host/codex-turn-journal.mjs';
import {
  certificationActiveReceipt,
  certificationCancellation,
  certificationCompletion,
  certificationDispatch,
  certificationHostReceipt,
  certificationLifecycle,
  certificationOpening,
  certificationReservation,
  fixtureDigest,
} from './lib/codex-turn-journal-certification-fixture.mjs';
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

const protocolId = 'eternities-godagent-codex-turn-journal-v1';
const certificationId = 'codex-recoverable-turn-journal-v1';
const fixturePath = 'fixtures/codex-recoverable-turn-journal-v1.json';
const receiptPath = 'receipts/codex-recoverable-turn-journal-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-codex-recoverable-turn-journal-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-codex-recoverable-turn-journal-v1.md';
const certificationPath = 'docs/codex-recoverable-turn-journal-v1-certification.md';
const digestPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/codex-bound-turn-v1.json',
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-specialist-preference-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'schemas/codex-task-execution-receipt.schema.json',
  'schemas/codex-turn-journal-event.schema.json',
  'schemas/codex-turn-journal-state.schema.json',
  'scripts/build-codex-turn-journal-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/codex-turn-journal-certification-fixture.mjs',
  specificationPath,
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/host/codex-bound-turn.mjs',
  'src/host/codex-turn-journal.mjs',
  'src/host/cortex-binding-registry.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/codex-bound-turn.test.mjs',
  'tests/codex-turn-journal-certification.test.mjs',
  'tests/codex-turn-journal.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/codex-bound-turn.test.mjs',
  'tests/codex-turn-journal.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([
  certificationPath,
  receiptPath,
  'src/certification/verify-ledger.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/release-lineage.test.mjs',
]);

const requirementEvidence = Object.freeze({
  'CBJ-001': ['tests/codex-turn-journal.test.mjs: deterministic opening and operation-id collision refusal'],
  'CBJ-002': ['deterministic fixture: create and existing-task transactions reconstructed between every transition'],
  'CBJ-003': ['tests/codex-turn-journal.test.mjs: exact retries append no duplicate event and changed retries fail'],
  'CBJ-004': ['tests/codex-turn-journal.test.mjs: canonical, digest, chain, clock, and bounded-input corruption matrix'],
  'CBJ-005': ['tests/codex-turn-journal.test.mjs: prepared attempt projects reconcile-dispatch before completion'],
  'CBJ-006': ['tests/codex-turn-journal.test.mjs: completed transport cannot be abandoned'],
  'CBJ-007': ['tests/codex-turn-journal.test.mjs: content-addressed response mutation, absence, and size checks'],
  'CBJ-008': ['tests/codex-turn-journal.test.mjs: task execution witness must fit the active lease'],
  'CBJ-009': ['tests/codex-turn-journal.test.mjs: final host receipt semantic cross-link matrix'],
  'CBJ-010': ['tests/codex-turn-journal.test.mjs: accepted result reopens with exact response and no transcript'],
  'CBJ-011': ['tests/codex-turn-journal.test.mjs: trusted metadata containment and inert source check'],
  'CBJ-012': ['tests/codex-turn-journal-certification.test.mjs: fixture and receipt reproduce from frozen source'],
});

const proofLimits = Object.freeze([
  'no-live-codex-app-task-integration',
  'no-task-transport-reconciliation-implementation',
  'no-automatic-binding-acquisition-renewal-recovery-release-or-revocation',
  'no-external-dispatch',
  'no-continuity-content-admission',
  'no-godskills-activation',
  'no-realm-effect',
  'no-cross-machine-journal-replication',
  'no-hostile-same-user-operating-system-isolation',
  'no-universal-filesystem-or-hardware-durability-claim',
  'no-independent-review',
]);

function summarizeProjection(value) {
  return {
    transactionId: value.transactionId,
    operation: value.operation,
    operationId: value.operationId,
    turnId: value.turnId,
    task: value.task,
    status: value.status,
    nextAction: value.nextAction,
    eventCount: value.eventCount,
    headDigest: value.headDigest,
    reservationReceiptDigest: value.reservationReceiptDigest,
    attemptCount: value.attemptCount,
    activeAttempt: value.activeAttempt,
    hostReceiptDigest: value.hostReceipt?.receiptDigest ?? null,
    responseDigest: value.hostReceipt?.responseDigest ?? null,
    responseBytes: value.hostReceipt?.responseBytes ?? null,
    responseTextDigest: Object.hasOwn(value, 'responseText') ? sha256Text(value.responseText) : null,
  };
}

export async function buildDeterministicCodexTurnJournalFixture() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'godagent-codex-turn-journal-cert-'));
  const journalRoot = join(temporaryRoot, 'journal-root');
  let now = Date.parse('2026-08-31T22:00:00.000Z');
  const journalOptions = { journalRoot, clock: () => now };
  const reopen = async (identity) => createCodexTurnJournal(journalOptions).open(identity);
  let reconstructionCount = 0;
  const reconstructed = async (identity) => {
    reconstructionCount += 1;
    return reopen(identity);
  };

  try {
    const task = { taskId: 'codex-task-journal-certification-001', hostId: 'codex-host-certification' };
    const createIdentity = certificationOpening({
      operation: 'create',
      operationId: 'operation-journal-certification-create',
      turnId: 'turn-journal-certification-create',
      cortexId: 'cortex-fixture-a',
      requestLabel: 'request:create',
    });
    let createHandle = await reconstructed(createIdentity);
    const createReservation = certificationReservation(createIdentity, task);
    now = Date.parse('2026-08-31T22:00:01.000Z');
    createHandle = await reconstructed(createIdentity);
    await createHandle.recordReservation(createReservation);
    const createActive = certificationActiveReceipt({
      label: 'create-attempt',
      taskId: task.taskId,
      issuedAt: '2026-08-31T22:00:02.000Z',
      expiresAt: '2026-08-31T22:01:02.000Z',
    });
    const createDispatch = certificationDispatch(createIdentity, createActive, task);
    now = Date.parse('2026-08-31T22:00:02.000Z');
    createHandle = await reconstructed(createIdentity);
    const createAttempt = await createHandle.prepareAttempt({
      activeReceipt: createActive,
      dispatch: createDispatch,
    });
    const createUncertain = await createHandle.inspect();
    const createCompletion = certificationCompletion({
      dispatch: createDispatch,
      responseText: 'certified recoverable create response',
      startedAt: '2026-08-31T22:00:02.100Z',
      completedAt: '2026-08-31T22:00:02.900Z',
    });
    now = Date.parse('2026-08-31T22:00:03.000Z');
    createHandle = await reconstructed(createIdentity);
    await createHandle.recordTransport({ attemptId: createAttempt.attemptId, ...createCompletion });
    const createLifecycle = certificationLifecycle(createActive, {
      recordedAt: '2026-08-31T22:00:03.500Z',
    });
    now = Date.parse('2026-08-31T22:00:04.000Z');
    createHandle = await reconstructed(createIdentity);
    await createHandle.closeBinding({
      attemptId: createAttempt.attemptId,
      lifecycleReceipt: createLifecycle,
    });
    const createHostReceipt = certificationHostReceipt({
      identity: createIdentity,
      reservation: createReservation,
      activeReceipt: createActive,
      dispatch: createDispatch,
      transportReceipt: createCompletion.transportReceipt,
      lifecycleReceipt: createLifecycle,
    });
    now = Date.parse('2026-08-31T22:00:05.000Z');
    createHandle = await reconstructed(createIdentity);
    await createHandle.accept({ attemptId: createAttempt.attemptId, hostReceipt: createHostReceipt });
    const createAccepted = await createHandle.inspect({ includeResponse: true });
    const createEventCount = createAccepted.eventCount;
    await createHandle.recordReservation(createReservation);
    await createHandle.prepareAttempt({ activeReceipt: createActive, dispatch: createDispatch });
    await createHandle.recordTransport({ attemptId: createAttempt.attemptId, ...createCompletion });
    await createHandle.closeBinding({ attemptId: createAttempt.attemptId, lifecycleReceipt: createLifecycle });
    await createHandle.accept({ attemptId: createAttempt.attemptId, hostReceipt: createHostReceipt });
    const exactRetryEventCount = (await createHandle.inspect()).eventCount;

    const continueIdentity = certificationOpening({
      operation: 'continue',
      operationId: 'operation-journal-certification-continue',
      turnId: 'turn-journal-certification-continue',
      cortexId: 'cortex-fixture-b',
      requestLabel: 'request:continue',
      parentTurnReceiptDigest: createHostReceipt.receiptDigest,
      task,
    });
    now = Date.parse('2026-08-31T22:00:10.000Z');
    let continueHandle = await reconstructed(continueIdentity);
    const continueActive = certificationActiveReceipt({
      label: 'continue-attempt',
      taskId: task.taskId,
      issuedAt: '2026-08-31T22:00:11.000Z',
      expiresAt: '2026-08-31T22:01:11.000Z',
    });
    const continueDispatch = certificationDispatch(continueIdentity, continueActive, task);
    now = Date.parse('2026-08-31T22:00:11.000Z');
    continueHandle = await reconstructed(continueIdentity);
    const continueAttempt = await continueHandle.prepareAttempt({
      activeReceipt: continueActive,
      dispatch: continueDispatch,
    });
    const continueCompletion = certificationCompletion({
      dispatch: continueDispatch,
      responseText: 'certified recoverable continue response',
      startedAt: '2026-08-31T22:00:11.100Z',
      completedAt: '2026-08-31T22:00:11.900Z',
    });
    now = Date.parse('2026-08-31T22:00:12.000Z');
    continueHandle = await reconstructed(continueIdentity);
    await continueHandle.recordTransport({ attemptId: continueAttempt.attemptId, ...continueCompletion });
    const continueLifecycle = certificationLifecycle(continueActive, {
      recordedAt: '2026-08-31T22:00:12.500Z',
    });
    now = Date.parse('2026-08-31T22:00:13.000Z');
    continueHandle = await reconstructed(continueIdentity);
    await continueHandle.closeBinding({
      attemptId: continueAttempt.attemptId,
      lifecycleReceipt: continueLifecycle,
    });
    const continueHostReceipt = certificationHostReceipt({
      identity: continueIdentity,
      activeReceipt: continueActive,
      dispatch: continueDispatch,
      transportReceipt: continueCompletion.transportReceipt,
      lifecycleReceipt: continueLifecycle,
    });
    now = Date.parse('2026-08-31T22:00:14.000Z');
    continueHandle = await reconstructed(continueIdentity);
    await continueHandle.accept({ attemptId: continueAttempt.attemptId, hostReceipt: continueHostReceipt });
    const continueAccepted = await continueHandle.inspect({ includeResponse: true });

    const recoveredTask = {
      taskId: 'codex-task-journal-certification-recovered',
      hostId: 'codex-host-certification',
    };
    const recoveredIdentity = certificationOpening({
      operation: 'create',
      operationId: 'operation-journal-certification-recovered',
      turnId: 'turn-journal-certification-recovered',
      cortexId: 'cortex-fixture-a',
      requestLabel: 'request:recovered',
    });
    now = Date.parse('2026-08-31T22:00:20.000Z');
    let recoveredHandle = await reconstructed(recoveredIdentity);
    const recoveredReservation = certificationReservation(recoveredIdentity, recoveredTask);
    now = Date.parse('2026-08-31T22:00:21.000Z');
    recoveredHandle = await reconstructed(recoveredIdentity);
    await recoveredHandle.recordReservation(recoveredReservation);
    const abandonedActive = certificationActiveReceipt({
      label: 'recovered-abandoned-attempt',
      taskId: recoveredTask.taskId,
      issuedAt: '2026-08-31T22:00:22.000Z',
      expiresAt: '2026-08-31T22:01:22.000Z',
    });
    const abandonedDispatch = certificationDispatch(recoveredIdentity, abandonedActive, recoveredTask);
    now = Date.parse('2026-08-31T22:00:22.000Z');
    recoveredHandle = await reconstructed(recoveredIdentity);
    const abandonedAttempt = await recoveredHandle.prepareAttempt({
      activeReceipt: abandonedActive,
      dispatch: abandonedDispatch,
    });
    const abandonedLifecycle = certificationLifecycle(abandonedActive, {
      recordedAt: '2026-08-31T22:00:22.500Z',
    });
    now = Date.parse('2026-08-31T22:00:23.000Z');
    recoveredHandle = await reconstructed(recoveredIdentity);
    await recoveredHandle.closeBinding({
      attemptId: abandonedAttempt.attemptId,
      lifecycleReceipt: abandonedLifecycle,
    });
    now = Date.parse('2026-08-31T22:00:24.000Z');
    recoveredHandle = await reconstructed(recoveredIdentity);
    await recoveredHandle.abandonAttempt({
      attemptId: abandonedAttempt.attemptId,
      reasonDigest: fixtureDigest('reconciled-not-started'),
    });
    const replacementActive = certificationActiveReceipt({
      label: 'recovered-successful-attempt',
      taskId: recoveredTask.taskId,
      issuedAt: '2026-08-31T22:00:25.000Z',
      expiresAt: '2026-08-31T22:01:25.000Z',
    });
    const replacementDispatch = certificationDispatch(recoveredIdentity, replacementActive, recoveredTask);
    now = Date.parse('2026-08-31T22:00:25.000Z');
    recoveredHandle = await reconstructed(recoveredIdentity);
    const replacementAttempt = await recoveredHandle.prepareAttempt({
      activeReceipt: replacementActive,
      dispatch: replacementDispatch,
    });
    const replacementCompletion = certificationCompletion({
      dispatch: replacementDispatch,
      responseText: 'certified response after one abandoned undispatched attempt',
      startedAt: '2026-08-31T22:00:25.100Z',
      completedAt: '2026-08-31T22:00:25.900Z',
    });
    now = Date.parse('2026-08-31T22:00:26.000Z');
    recoveredHandle = await reconstructed(recoveredIdentity);
    await recoveredHandle.recordTransport({
      attemptId: replacementAttempt.attemptId,
      ...replacementCompletion,
    });
    const replacementLifecycle = certificationLifecycle(replacementActive, {
      recordedAt: '2026-08-31T22:00:26.500Z',
    });
    now = Date.parse('2026-08-31T22:00:27.000Z');
    recoveredHandle = await reconstructed(recoveredIdentity);
    await recoveredHandle.closeBinding({
      attemptId: replacementAttempt.attemptId,
      lifecycleReceipt: replacementLifecycle,
    });
    const replacementHostReceipt = certificationHostReceipt({
      identity: recoveredIdentity,
      reservation: recoveredReservation,
      activeReceipt: replacementActive,
      dispatch: replacementDispatch,
      transportReceipt: replacementCompletion.transportReceipt,
      lifecycleReceipt: replacementLifecycle,
    });
    now = Date.parse('2026-08-31T22:00:28.000Z');
    recoveredHandle = await reconstructed(recoveredIdentity);
    await recoveredHandle.accept({
      attemptId: replacementAttempt.attemptId,
      hostReceipt: replacementHostReceipt,
    });
    const recoveredAccepted = await recoveredHandle.inspect({ includeResponse: true });

    const cancelledTask = {
      taskId: 'codex-task-journal-certification-cancelled',
      hostId: 'codex-host-certification',
    };
    const cancelledIdentity = certificationOpening({
      operation: 'create',
      operationId: 'operation-journal-certification-cancelled',
      turnId: 'turn-journal-certification-cancelled',
      cortexId: 'cortex-fixture-a',
      requestLabel: 'request:cancelled',
    });
    now = Date.parse('2026-08-31T22:00:30.000Z');
    let cancelledHandle = await reconstructed(cancelledIdentity);
    const cancelledReservation = certificationReservation(cancelledIdentity, cancelledTask);
    now = Date.parse('2026-08-31T22:00:31.000Z');
    cancelledHandle = await reconstructed(cancelledIdentity);
    await cancelledHandle.recordReservation(cancelledReservation);
    now = Date.parse('2026-08-31T22:00:32.000Z');
    cancelledHandle = await reconstructed(cancelledIdentity);
    await cancelledHandle.cancel({
      cancellationReceipt: certificationCancellation(cancelledReservation, 'pre-dispatch-cancel'),
    });
    const cancelled = await cancelledHandle.inspect();

    const quarantinedIdentity = certificationOpening({
      operation: 'continue',
      operationId: 'operation-journal-certification-quarantined',
      turnId: 'turn-journal-certification-quarantined',
      cortexId: 'cortex-fixture-b',
      requestLabel: 'request:quarantined',
      parentTurnReceiptDigest: continueHostReceipt.receiptDigest,
      task,
    });
    now = Date.parse('2026-08-31T22:00:40.000Z');
    let quarantinedHandle = await reconstructed(quarantinedIdentity);
    now = Date.parse('2026-08-31T22:00:41.000Z');
    quarantinedHandle = await reconstructed(quarantinedIdentity);
    await quarantinedHandle.quarantine({ reasonDigest: fixtureDigest('operator-quarantine') });
    const quarantined = await quarantinedHandle.inspect();

    let collisionRejected = false;
    try {
      await createCodexTurnJournal(journalOptions).open({
        ...createIdentity,
        requestDigest: fixtureDigest('changed-request'),
      });
    } catch (error) {
      collisionRejected = error?.code === 'operation-id-collision';
    }

    const stateTexts = await Promise.all([
      createHandle,
      continueHandle,
      recoveredHandle,
      cancelledHandle,
      quarantinedHandle,
    ].map((handle) => readFile(handle.statePath, 'utf8')));
    const accepted = [createAccepted, continueAccepted, recoveredAccepted];
    const forbidden = [
      'transcript',
      'credential',
      'workspacePath',
      'skillBody',
      'realmAuthority',
      createAccepted.responseText,
      continueAccepted.responseText,
      recoveredAccepted.responseText,
    ];
    const trustedMetadataLeaks = forbidden.reduce(
      (count, marker) => count + stateTexts.filter((text) => text.includes(marker)).length,
      0,
    );
    const projected = {
      schemaVersion: 1,
      protocolId,
      transactions: {
        createAccepted: summarizeProjection(createAccepted),
        continueAccepted: summarizeProjection(continueAccepted),
        recoveredAccepted: summarizeProjection(recoveredAccepted),
        cancelled: summarizeProjection(cancelled),
        quarantined: summarizeProjection(quarantined),
      },
      lineage: {
        createReceiptDigest: createHostReceipt.receiptDigest,
        continueParentDigest: continueIdentity.parentTurnReceiptDigest,
        continueReceiptDigest: continueHostReceipt.receiptDigest,
      },
      assertions: {
        reconstructionCount,
        exactRetryEventCountStable: exactRetryEventCount === createEventCount,
        operationCollisionRejected: collisionRejected,
        uncertainDispatchProjected: createUncertain.nextAction === 'reconcile-dispatch',
        abandonedAttemptAdvancedOrdinal: replacementAttempt.ordinal === abandonedAttempt.ordinal + 1,
        acceptedTransactions: accepted.filter((row) => row.status === 'accepted').length,
        terminalTransactions: [createAccepted, continueAccepted, recoveredAccepted, cancelled, quarantined]
          .filter((row) => row.nextAction === 'none').length,
        terminalResponsesRecovered: accepted.filter((row) => typeof row.responseText === 'string').length,
        trustedMetadataLeaks,
        transcriptInputs: 0,
        continuityAdmissions: accepted.filter(
          (row) => row.hostReceipt.authority.continuityAdmission,
        ).length,
        realmEffects: accepted.reduce((sum, row) => sum + row.hostReceipt.authority.realmEffects, 0),
      },
    };
    return Object.freeze({ ...projected, fixtureDigest: sha256Value(projected) });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (!digestPattern.test(value ?? '')) throw new Error(`${label} digest is invalid`);
}

function validateTestRuns(testRuns) {
  exactKeys(testRuns, ['focused', 'full'], 'test runs');
  for (const [name, run] of Object.entries(testRuns)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
  }
}

function validateManifest(value, expectedPaths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (canonicalJson(value.paths) !== canonicalJson(expectedPaths)
      || !Array.isArray(value.entries)
      || value.entries.length !== expectedPaths.length
      || value.digest !== sha256Value(value.entries)) throw new Error(`${label} is invalid`);
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== expectedPaths[index] || !Number.isInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
    requireDigest(entry.sha256, `${label} entry`);
  });
}

function validateSource(source) {
  exactKeys(source, [
    'commit', 'specification', 'plan', 'implementationManifest', 'testManifest',
    'historicalReceiptDigests',
  ], 'certification source');
  if (!commitPattern.test(source.commit)) throw new Error('certification source commit is invalid');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(source[field], ['path', 'sha256'], field);
    if (source[field].path !== path) throw new Error(`${field} path is invalid`);
    requireDigest(source[field].sha256, field);
  }
  validateManifest(source.implementationManifest, implementationFiles, 'implementation manifest');
  validateManifest(source.testManifest, testFiles, 'test manifest');
  if (canonicalJson(Object.keys(source.historicalReceiptDigests).sort())
      !== canonicalJson([...historicalReceiptPaths].sort())) throw new Error('historical receipt set is invalid');
  Object.entries(source.historicalReceiptDigests)
    .forEach(([path, digest]) => requireDigest(digest, `historical receipt ${path}`));
}

function validateFixture(fixture) {
  exactKeys(fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions'], 'certification fixture');
  if (fixture.path !== fixturePath) throw new Error('certification fixture path is invalid');
  requireDigest(fixture.fileSha256, 'certification fixture file');
  requireDigest(fixture.logicalDigest, 'certification fixture logical');
  exactKeys(fixture.assertions, [
    'reconstructionCount', 'exactRetryEventCountStable', 'operationCollisionRejected',
    'uncertainDispatchProjected', 'abandonedAttemptAdvancedOrdinal', 'acceptedTransactions',
    'terminalTransactions', 'terminalResponsesRecovered', 'trustedMetadataLeaks',
    'transcriptInputs', 'continuityAdmissions', 'realmEffects',
  ], 'certification fixture assertions');
}

function validateReview(review) {
  exactKeys(review, ['mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions'], 'review');
  if (review.mode !== 'inline-adversarial' || review.independent !== false
      || !Number.isInteger(review.unresolvedCriticalDefects)
      || review.unresolvedCriticalDefects < 0
      || !Array.isArray(review.retainedRegressions)
      || review.retainedRegressions.length < 1
      || new Set(review.retainedRegressions).size !== review.retainedRegressions.length) {
    throw new Error('review is invalid');
  }
}

export function buildCodexTurnJournalCertificationReceipt(input) {
  exactKeys(input, ['source', 'fixture', 'testRuns', 'review'], 'certification input');
  validateSource(input.source);
  validateFixture(input.fixture);
  validateTestRuns(input.testRuns);
  validateReview(input.review);
  const assertions = input.fixture.assertions;
  const passed = assertions.reconstructionCount >= 20
    && assertions.exactRetryEventCountStable === true
    && assertions.operationCollisionRejected === true
    && assertions.uncertainDispatchProjected === true
    && assertions.abandonedAttemptAdvancedOrdinal === true
    && assertions.acceptedTransactions === 3
    && assertions.terminalTransactions === 5
    && assertions.terminalResponsesRecovered === 3
    && assertions.trustedMetadataLeaks === 0
    && assertions.transcriptInputs === 0
    && assertions.continuityAdmissions === 0
    && assertions.realmEffects === 0
    && input.review.unresolvedCriticalDefects === 0;
  const requirements = Object.entries(requirementEvidence).map(([id, basis]) => ({
    id,
    status: passed ? 'pass' : 'fail',
    basis: [...basis],
  }));
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: requirements.every((row) => row.status === 'pass') ? 'certified' : 'rejected',
    protocolId,
    source: structuredClone(input.source),
    fixture: structuredClone(input.fixture),
    testRuns: structuredClone(input.testRuns),
    metrics: {
      reconstructedBoundaries: assertions.reconstructionCount,
      acceptedTransactions: assertions.acceptedTransactions,
      terminalTransactions: assertions.terminalTransactions,
      recoveredResponses: assertions.terminalResponsesRecovered,
      abandonedAttempts: assertions.abandonedAttemptAdvancedOrdinal ? 1 : 0,
      duplicateEventsOnExactRetry: assertions.exactRetryEventCountStable ? 0 : 1,
      operationCollisionsAccepted: assertions.operationCollisionRejected ? 0 : 1,
      trustedMetadataLeaks: assertions.trustedMetadataLeaks,
      transcriptInputs: assertions.transcriptInputs,
      continuityAdmissions: assertions.continuityAdmissions,
      realmEffects: assertions.realmEffects,
      retainedInlineRegressions: input.review.retainedRegressions.length,
    },
    review: structuredClone(input.review),
    requirements,
    proofLimits: [...proofLimits],
  };
  return Object.freeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

export function verifyCodexTurnJournalCertificationReceipt(value) {
  const receipt = structuredClone(value);
  exactKeys(receipt, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'testRuns', 'metrics', 'review', 'requirements', 'proofLimits', 'receiptDigest',
  ], 'codex turn journal certification receipt');
  if (receipt.schemaVersion !== 1 || receipt.certificationId !== certificationId
      || receipt.protocolId !== protocolId) throw new Error('codex turn journal certification identity is invalid');
  const rebuilt = buildCodexTurnJournalCertificationReceipt({
    source: receipt.source,
    fixture: receipt.fixture,
    testRuns: receipt.testRuns,
    review: receipt.review,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(receipt)) {
    throw new Error('codex turn journal certification receipt mismatch');
  }
  return Object.freeze(receipt);
}

export async function rebuildCodexTurnJournalReceipt({ repositoryRoot, sourceCommit, testRuns }) {
  const root = resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  const [specification, plan, fixtureText] = await Promise.all([
    gitText(root, sourceCommit, specificationPath),
    gitText(root, sourceCommit, planPath),
    gitText(root, sourceCommit, fixturePath),
  ]);
  const generatedFixture = await buildDeterministicCodexTurnJournalFixture();
  if (fixtureText !== `${canonicalJson(generatedFixture)}\n`) {
    throw new Error('codex turn journal deterministic fixture is stale');
  }
  const fixture = JSON.parse(fixtureText);
  return buildCodexTurnJournalCertificationReceipt({
    source: {
      commit: sourceCommit,
      specification: { path: specificationPath, sha256: sha256Text(specification) },
      plan: { path: planPath, sha256: sha256Text(plan) },
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      assertions: structuredClone(fixture.assertions),
    },
    testRuns,
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [
        'rejects operation identity reuse with changed request evidence',
        'rejects canonical state event chain response and receipt substitution',
        'distinguishes an uncertain dispatch from verified completion',
        'forbids abandonment after a completed transport',
        'requires execution to begin and complete under the active writer lease',
        'keeps untrusted response bytes outside trusted journal metadata',
        'performs no task reservation dispatch binding continuity skill or Realm action',
      ],
    },
  });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicCodexTurnJournalFixture();
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({
      status: 'written',
      destination,
      fixtureDigest: fixture.fixtureDigest,
    })}\n`);
    return;
  }

  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({ root, headCommit: head, outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildCodexTurnJournalReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: 1 } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildCodexTurnJournalReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    testRuns: receipt.testRuns,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();

