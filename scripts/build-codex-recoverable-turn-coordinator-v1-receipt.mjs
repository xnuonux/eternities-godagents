import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildCodexTaskReservationReceipt,
  buildCodexTaskTransportReceipt,
} from '../src/host/codex-bound-turn.mjs';
import { createRecoverableCodexTurnCoordinator } from '../src/host/codex-recoverable-turn-coordinator.mjs';
import { buildCodexTaskExecutionReceipt } from '../src/host/codex-task-execution.mjs';
import { createCodexTurnJournal } from '../src/host/codex-turn-journal.mjs';
import { inspectCortexBindingRegistry } from '../src/host/cortex-binding-registry.mjs';
import { prepareAdmittedCertificationFixture } from './lib/admitted-certification-fixture.mjs';
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

const protocolId = 'eternities-godagent-codex-recoverable-bound-turn-v1';
const certificationId = 'codex-recoverable-turn-coordinator-v1';
const fixturePath = 'fixtures/codex-recoverable-turn-coordinator-v1.json';
const receiptPath = 'receipts/codex-recoverable-turn-coordinator-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-recoverable-codex-turn-coordinator-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-recoverable-codex-turn-coordinator-v1.md';
const certificationPath = 'docs/codex-recoverable-turn-coordinator-v1-certification.md';
const digestPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/codex-bound-turn-v1.json',
  'receipts/codex-recoverable-turn-journal-v1.json',
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
  'schemas/codex-recoverable-bound-turn-receipt.schema.json',
  'schemas/codex-recoverable-transport-binding.schema.json',
  'schemas/codex-task-execution-receipt.schema.json',
  'schemas/codex-task-recovery-descriptor.schema.json',
  'scripts/build-codex-recoverable-turn-coordinator-v1-receipt.mjs',
  'scripts/lib/admitted-certification-fixture.mjs',
  'scripts/lib/certification-support.mjs',
  specificationPath,
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/binding-compiler.mjs',
  'src/host/codex-bound-turn.mjs',
  'src/host/codex-recoverable-turn-contracts.mjs',
  'src/host/codex-recoverable-turn-coordinator.mjs',
  'src/host/codex-task-execution.mjs',
  'src/host/codex-turn-journal.mjs',
  'src/host/cortex-binding-registry.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/codex-bound-turn.test.mjs',
  'tests/codex-turn-journal.test.mjs',
  'tests/cortex-binding-registry.test.mjs',
  'tests/recoverable-codex-turn-certification.test.mjs',
  'tests/recoverable-codex-turn-contracts.test.mjs',
  'tests/recoverable-codex-turn-coordinator.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/codex-bound-turn.test.mjs',
  'tests/codex-turn-journal.test.mjs',
  'tests/cortex-binding-registry.test.mjs',
  'tests/recoverable-codex-turn-contracts.test.mjs',
  'tests/recoverable-codex-turn-coordinator.test.mjs',
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
  'CRC-001': ['deterministic fixture and coordinator tests: reservation reconciliation precedes one reservation'],
  'CRC-002': ['deterministic fixture and coordinator tests: dispatch reconciliation precedes every dispatch'],
  'CRC-003': ['deterministic fixture: accepted replay performs zero transport calls'],
  'CRC-004': ['tests/recoverable-codex-turn-coordinator.test.mjs: crash after reservation creates one task'],
  'CRC-005': ['tests/recoverable-codex-turn-coordinator.test.mjs: unpublished and published attempts wait for exact lease expiry'],
  'CRC-006': ['tests/recoverable-codex-turn-coordinator.test.mjs: absent orphan dispatch closes and abandons before rebinding'],
  'CRC-007': ['deterministic fixture and crash matrix: completed external dispatch recovers from an expired lease without redispatch'],
  'CRC-008': ['tests/recoverable-codex-turn-coordinator.test.mjs: closure and acceptance crash retries return one exact result'],
  'CRC-009': ['deterministic fixture: create continue and compaction resume preserve actor and task across cortex replacement'],
  'CRC-010': ['tests/recoverable-codex-turn-coordinator.test.mjs: downgrade ambiguity revocation and forged evidence fail closed'],
  'CRC-011': ['tests/recoverable-codex-turn-coordinator.test.mjs: malicious response cannot mint continuity skill Realm or receipt authority'],
  'CRC-012': ['tests/recoverable-codex-turn-certification.test.mjs: fixture receipt manifests and historical links reproduce'],
});

const proofLimits = Object.freeze([
  'no-live-codex-app-task-integration',
  'no-provider-credential-handling',
  'trusted-injected-terminal-reconciliation-contract-only',
  'no-task-migration',
  'no-continuity-content-admission-or-personal-keel-content-write',
  'no-godskills-activation',
  'no-realm-effect',
  'no-background-service',
  'no-cross-machine-registry-or-journal-replication',
  'no-hostile-same-user-operating-system-isolation',
  'no-model-quality-claim',
  'no-independent-review',
]);

function turnRequest({ operationId, turnId, objective }) {
  return {
    schemaVersion: 1,
    operationId,
    turnId,
    hostAdapterId: 'codex-desktop-v1',
    revocationEpoch: 0,
    mission: {
      missionId: `mission-${turnId}`,
      objective,
      successEvidence: ['one accepted receipt', 'one exact response'],
      stopConditions: ['binding changes', 'reconciliation becomes ambiguous'],
      budget: { maxCycles: 1, maxCompletionTokens: 2048 },
      observation: {
        observationId: `observation-${turnId}`,
        summary: 'the recoverable certification transport is ready',
        evidenceDigests: ['a'.repeat(64)],
      },
    },
    maxProjectionBytes: 65_536,
    maxResponseBytes: 16_384,
  };
}

function deterministicTransport(time) {
  const calls = [];
  const reservations = new Map();
  const completions = new Map();
  const descriptor = {
    schemaVersion: 1,
    protocolId: 'eternities-codex-task-control-v1',
    hostAdapterId: 'codex-desktop-v1',
    instructionChannel: 'developer',
    suspendedReservation: true,
    boundExecutionReceipt: true,
  };
  const recovery = {
    schemaVersion: 1,
    protocolId: 'eternities-codex-task-recovery-v1',
    reservationReconciliation: 'terminal-by-operation',
    dispatchReconciliation: 'terminal-by-dispatch-digest',
    executionWitness: 'lease-bounded-v1',
  };
  return {
    calls,
    reservations,
    completions,
    descriptorValue: descriptor,
    recoveryValue: recovery,
    resetCalls() { calls.length = 0; },
    descriptor() {
      calls.push({ type: 'descriptor' });
      return structuredClone(descriptor);
    },
    recoveryDescriptor() {
      calls.push({ type: 'recovery-descriptor' });
      return structuredClone(recovery);
    },
    async reconcileReservation(intent) {
      calls.push({ type: 'reconcile-reservation', operationId: intent.operationId });
      const receipt = reservations.get(intent.operationId);
      return receipt ? { status: 'reserved', receipt } : { status: 'absent' };
    },
    async reserveTask(intent) {
      calls.push({ type: 'reserve', operationId: intent.operationId });
      if (reservations.has(intent.operationId)) throw new Error('duplicate certification reservation');
      const receipt = buildCodexTaskReservationReceipt({
        intent,
        task: {
          taskId: `task-${intent.operationId}`,
          hostId: 'codex-recoverable-certification-host',
        },
        instructionChannel: descriptor.instructionChannel,
      });
      reservations.set(intent.operationId, receipt);
      return receipt;
    },
    async cancelReservation() {
      throw new Error('certification cancellation is not expected');
    },
    async reconcileTurn(dispatch) {
      const dispatchDigest = sha256Value(dispatch);
      calls.push({ type: 'reconcile-dispatch', dispatchDigest });
      const completed = completions.get(dispatchDigest);
      return completed ? { status: 'completed', ...completed } : { status: 'absent' };
    },
    async dispatchTurn(dispatch) {
      const dispatchDigest = sha256Value(dispatch);
      calls.push({ type: 'dispatch', dispatchDigest });
      if (completions.has(dispatchDigest)) throw new Error('duplicate certification dispatch');
      const startedAt = new Date(time.now()).toISOString();
      time.advance(100);
      const responseText = `certified recoverable response for ${dispatch.operation}:${dispatch.turnId}`;
      const receipt = buildCodexTaskTransportReceipt({ dispatch, responseText });
      const executionReceipt = buildCodexTaskExecutionReceipt({
        dispatch,
        transportReceipt: receipt,
        responseText,
        startedAt,
        completedAt: new Date(time.now()).toISOString(),
      });
      const completed = { responseText, receipt, executionReceipt };
      completions.set(dispatchDigest, completed);
      return completed;
    },
  };
}

function orderedBefore(calls, first, second) {
  let firstIndex = -1;
  for (let index = 0; index < calls.length; index += 1) {
    if (calls[index].type === first) firstIndex = index;
    if (calls[index].type === second && firstIndex < 0) return false;
    if (calls[index].type === second) firstIndex = -1;
  }
  return true;
}

function projectReceipt(receipt) {
  return structuredClone(receipt);
}

function sameActor(left, right) {
  return canonicalJson(left.actor) === canonicalJson(right.actor);
}

function checkpointCrash(target) {
  let crashed = false;
  return async (name) => {
    if (!crashed && name === target) {
      crashed = true;
      const error = new Error(`certification process death at ${target}`);
      error.code = 'simulated-process-death';
      throw error;
    }
  };
}

function coordinatorOptions({ fixture, transport, time, credentials, checkpoint = async () => {} }) {
  let lockOrdinal = 0;
  return {
    taskTransport: transport,
    registryRoot: join(fixture.temporaryRoot, 'binding-registry'),
    instanceRegistryRoot: join(fixture.temporaryRoot, 'instance-registry'),
    journalRoot: join(fixture.temporaryRoot, 'turn-journals'),
    leaseDurationMs: 2_000,
    clock: time.now,
    leaseCredential() {
      const credential = `codex-recoverable-certification-credential-${credentials.length + 1}`;
      credentials.push(credential);
      return credential;
    },
    writerLockOptions: {
      pid: 44001,
      now: time.now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => `codex-recoverable-certification-writer-${++lockOrdinal}`,
    },
    checkpoint,
  };
}

export async function buildDeterministicRecoverableCodexTurnCoordinatorFixture({ repositoryRoot }) {
  const root = resolve(repositoryRoot);
  let mainNow = Date.parse('2026-08-31T23:00:00.000Z');
  const mainTime = {
    now: () => mainNow,
    advance(milliseconds) { mainNow += milliseconds; },
  };
  let crashNow = Date.parse('2026-08-31T23:10:00.000Z');
  const crashTime = {
    now: () => crashNow,
    advance(milliseconds) { crashNow += milliseconds; },
  };
  const mainFixture = await prepareAdmittedCertificationFixture({
    repositoryRoot: root,
    prefix: 'godagent-recoverable-turn-main-cert',
    instanceId: 'codex-recoverable-turn-main-certification',
    promptTitle: 'Recoverable Codex turn coordinator certification',
    checkpointPurpose: 'certify recoverable create continue and compaction resume',
    clock: () => new Date(mainTime.now()).toISOString(),
  });
  const crashFixture = await prepareAdmittedCertificationFixture({
    repositoryRoot: root,
    prefix: 'godagent-recoverable-turn-crash-cert',
    instanceId: 'codex-recoverable-turn-crash-certification',
    promptTitle: 'Recoverable Codex turn crash certification',
    checkpointPurpose: 'certify exact recovery after completed external dispatch',
    clock: () => new Date(crashTime.now()).toISOString(),
  });
  const credentials = [];

  try {
    const mainTransport = deterministicTransport(mainTime);
    const coordinator = createRecoverableCodexTurnCoordinator(coordinatorOptions({
      fixture: mainFixture,
      transport: mainTransport,
      time: mainTime,
      credentials,
    }));
    const createInput = {
      admission: mainFixture.admission,
      request: turnRequest({
        operationId: 'operation-recoverable-certification-create',
        turnId: 'turn-recoverable-certification-create',
        objective: 'create one recoverable task around the admitted actor',
      }),
      cortexId: 'cortex-fixture-a',
    };
    const created = await coordinator.create(createInput);
    mainTime.advance(1_000);
    const continued = await coordinator.continue({
      admission: mainFixture.admission,
      task: created.task,
      parentReceipt: created.receipt,
      request: turnRequest({
        operationId: 'operation-recoverable-certification-continue',
        turnId: 'turn-recoverable-certification-continue',
        objective: 'continue the same actor through a replacement cortex',
      }),
      cortexId: 'cortex-fixture-b',
    });
    mainTime.advance(1_000);
    const resumed = await coordinator.resumeAfterCompaction({
      admission: mainFixture.admission,
      task: created.task,
      parentReceipt: continued.receipt,
      request: turnRequest({
        operationId: 'operation-recoverable-certification-resume',
        turnId: 'turn-recoverable-certification-resume',
        objective: 'resume the same actor without transcript replay',
      }),
      cortexId: 'cortex-fixture-c',
    });
    const mainCalls = structuredClone(mainTransport.calls);
    mainTransport.resetCalls();
    const exactReplay = await coordinator.create(createInput);
    const exactReplayCalls = mainTransport.calls.length;
    const mainRegistry = await inspectCortexBindingRegistry({
      registryRoot: join(mainFixture.temporaryRoot, 'binding-registry'),
      clock: mainTime.now,
    });

    const crashTransport = deterministicTransport(crashTime);
    const crashInput = {
      admission: crashFixture.admission,
      request: turnRequest({
        operationId: 'operation-recoverable-certification-crash',
        turnId: 'turn-recoverable-certification-crash',
        objective: 'recover a completed dispatch after process death without redispatch',
      }),
      cortexId: 'cortex-fixture-crash',
    };
    let processDeathObserved = false;
    try {
      await createRecoverableCodexTurnCoordinator(coordinatorOptions({
        fixture: crashFixture,
        transport: crashTransport,
        time: crashTime,
        credentials,
        checkpoint: checkpointCrash('after-dispatch-completed'),
      })).create(crashInput);
    } catch (error) {
      processDeathObserved = error?.code === 'simulated-process-death';
    }
    const crashCallsBeforeRecovery = structuredClone(crashTransport.calls);
    crashTime.advance(3_000);
    crashTransport.resetCalls();
    const recovered = await createRecoverableCodexTurnCoordinator(coordinatorOptions({
      fixture: crashFixture,
      transport: crashTransport,
      time: crashTime,
      credentials,
    })).create(crashInput);
    const crashRecoveryCalls = structuredClone(crashTransport.calls);
    const crashJournal = createCodexTurnJournal({
      journalRoot: join(crashFixture.temporaryRoot, 'turn-journals'),
      clock: crashTime.now,
    });
    const crashState = await (await crashJournal.openExisting(crashInput.request.operationId)).inspect();
    const crashRegistry = await inspectCortexBindingRegistry({
      registryRoot: join(crashFixture.temporaryRoot, 'binding-registry'),
      clock: crashTime.now,
    });

    const turnRows = [created.receipt, continued.receipt, resumed.receipt];
    const projected = {
      schemaVersion: 1,
      protocolId,
      transport: {
        taskControl: structuredClone(mainTransport.descriptorValue),
        recovery: structuredClone(mainTransport.recoveryValue),
        mainCallTypes: mainCalls.map((call) => call.type),
        crashCallTypesBeforeRecovery: crashCallsBeforeRecovery.map((call) => call.type),
        crashRecoveryCallTypes: crashRecoveryCalls.map((call) => call.type),
      },
      turns: {
        create: projectReceipt(created.receipt),
        continue: projectReceipt(continued.receipt),
        compactionResume: projectReceipt(resumed.receipt),
        recoveredAfterDispatch: projectReceipt(recovered.receipt),
      },
      registries: {
        mainStatuses: mainRegistry.bindings.map((row) => row.status),
        crashStatuses: crashRegistry.bindings.map((row) => row.status),
      },
      recovery: {
        processDeathObserved,
        journalStatus: crashState.status,
        attemptCount: crashState.attemptCount,
        lifecycleStatus: recovered.receipt.binding.lifecycleStatus,
        responseDigest: sha256Text(recovered.responseText),
      },
    };
    const allCalls = [...mainCalls, ...crashCallsBeforeRecovery, ...crashRecoveryCalls];
    const serialized = canonicalJson(projected);
    const assertions = {
      reservationReconciledBeforeReserve: orderedBefore(mainCalls, 'reconcile-reservation', 'reserve'),
      dispatchReconciledBeforeDispatch: orderedBefore(allCalls, 'reconcile-dispatch', 'dispatch'),
      exactReplayExternalCalls: exactReplayCalls,
      exactReplayReceiptStable: exactReplay.receipt.receiptDigest === created.receipt.receiptDigest,
      taskStable: turnRows.every((receipt) => receipt.task.taskId === created.task.taskId),
      actorStableAcrossCortexes: sameActor(created.receipt, continued.receipt)
        && sameActor(continued.receipt, resumed.receipt)
        && new Set(turnRows.map((receipt) => receipt.cortexId)).size === 3,
      parentChainExact: created.receipt.parentTurnReceiptDigest === '0'.repeat(64)
        && continued.receipt.parentTurnReceiptDigest === created.receipt.receiptDigest
        && resumed.receipt.parentTurnReceiptDigest === continued.receipt.receiptDigest,
      recoveredAfterProcessDeath: processDeathObserved
        && recovered.receipt.recovery.recoveredAfterInterruption === true
        && recovered.receipt.binding.lifecycleStatus === 'expired',
      duplicateReservations: [...mainTransport.reservations.values()].length === 1
        && [...crashTransport.reservations.values()].length === 1 ? 0 : 1,
      duplicateDispatches: mainTransport.completions.size === 3
        && crashTransport.completions.size === 1 ? 0 : 1,
      activeBindingsAfterCompletion: [...mainRegistry.bindings, ...crashRegistry.bindings]
        .filter((row) => row.active).length,
      credentialLeaks: credentials.filter((credential) => serialized.includes(credential)).length,
      transcriptInputs: serialized.includes('transcript') ? 1 : 0,
      continuityAdmissions: [...turnRows, recovered.receipt]
        .filter((receipt) => receipt.authority.continuityAdmission).length,
      realmEffects: [...turnRows, recovered.receipt]
        .reduce((sum, receipt) => sum + receipt.authority.realmEffects, 0),
    };
    const unsigned = { ...projected, assertions };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await Promise.all([
      rm(mainFixture.temporaryRoot, { recursive: true, force: true }),
      rm(crashFixture.temporaryRoot, { recursive: true, force: true }),
    ]);
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
      !== canonicalJson([...historicalReceiptPaths].sort())) {
    throw new Error('historical receipt set is invalid');
  }
  Object.entries(source.historicalReceiptDigests)
    .forEach(([path, digest]) => requireDigest(digest, `historical receipt ${path}`));
}

function validateFixture(fixture) {
  exactKeys(fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions'], 'certification fixture');
  if (fixture.path !== fixturePath) throw new Error('certification fixture path is invalid');
  requireDigest(fixture.fileSha256, 'certification fixture file');
  requireDigest(fixture.logicalDigest, 'certification fixture logical');
  exactKeys(fixture.assertions, [
    'reservationReconciledBeforeReserve', 'dispatchReconciledBeforeDispatch',
    'exactReplayExternalCalls', 'exactReplayReceiptStable', 'taskStable',
    'actorStableAcrossCortexes', 'parentChainExact', 'recoveredAfterProcessDeath',
    'duplicateReservations', 'duplicateDispatches', 'activeBindingsAfterCompletion',
    'credentialLeaks', 'transcriptInputs', 'continuityAdmissions', 'realmEffects',
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

export function buildRecoverableCodexTurnCoordinatorCertificationReceipt(input) {
  exactKeys(input, ['source', 'fixture', 'testRuns', 'review'], 'certification input');
  validateSource(input.source);
  validateFixture(input.fixture);
  validateTestRuns(input.testRuns);
  validateReview(input.review);
  const assertions = input.fixture.assertions;
  const passed = assertions.reservationReconciledBeforeReserve === true
    && assertions.dispatchReconciledBeforeDispatch === true
    && assertions.exactReplayExternalCalls === 0
    && assertions.exactReplayReceiptStable === true
    && assertions.taskStable === true
    && assertions.actorStableAcrossCortexes === true
    && assertions.parentChainExact === true
    && assertions.recoveredAfterProcessDeath === true
    && assertions.duplicateReservations === 0
    && assertions.duplicateDispatches === 0
    && assertions.activeBindingsAfterCompletion === 0
    && assertions.credentialLeaks === 0
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
      certifiedTurns: 4,
      recoveredProcessDeaths: assertions.recoveredAfterProcessDeath ? 1 : 0,
      duplicateReservations: assertions.duplicateReservations,
      duplicateDispatches: assertions.duplicateDispatches,
      exactReplayExternalCalls: assertions.exactReplayExternalCalls,
      activeBindingsAfterCompletion: assertions.activeBindingsAfterCompletion,
      credentialLeaks: assertions.credentialLeaks,
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

export function verifyRecoverableCodexTurnCoordinatorCertificationReceipt(value) {
  const receipt = structuredClone(value);
  exactKeys(receipt, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'testRuns', 'metrics', 'review', 'requirements', 'proofLimits', 'receiptDigest',
  ], 'recoverable Codex turn coordinator certification receipt');
  if (receipt.schemaVersion !== 1 || receipt.certificationId !== certificationId
      || receipt.protocolId !== protocolId) {
    throw new Error('recoverable Codex turn coordinator certification identity is invalid');
  }
  const rebuilt = buildRecoverableCodexTurnCoordinatorCertificationReceipt({
    source: receipt.source,
    fixture: receipt.fixture,
    testRuns: receipt.testRuns,
    review: receipt.review,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(receipt)) {
    throw new Error('recoverable Codex turn coordinator certification receipt mismatch');
  }
  return Object.freeze(receipt);
}

export async function rebuildRecoverableCodexTurnCoordinatorReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
}) {
  const root = resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  const [specification, plan, fixtureText] = await Promise.all([
    gitText(root, sourceCommit, specificationPath),
    gitText(root, sourceCommit, planPath),
    gitText(root, sourceCommit, fixturePath),
  ]);
  const generatedFixture = await buildDeterministicRecoverableCodexTurnCoordinatorFixture({
    repositoryRoot: root,
  });
  if (fixtureText !== `${canonicalJson(generatedFixture)}\n`) {
    throw new Error('recoverable Codex turn coordinator deterministic fixture is stale');
  }
  const fixture = JSON.parse(fixtureText);
  return buildRecoverableCodexTurnCoordinatorCertificationReceipt({
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
        'reconciles reservation before mutation and dispatch before execution',
        'recovers seven process interruption windows without duplicate task or dispatch',
        'blocks an active orphan until exact lease expiry',
        'quarantines revoked completion',
        'rejects downgraded ambiguous and forged transport evidence',
        'preserves task and actor across cortex replacement and compaction resume',
        'keeps model output outside continuity Godskills Realm and receipt authority',
      ],
    },
  });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicRecoverableCodexTurnCoordinatorFixture({ repositoryRoot: root });
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
  const preliminary = await rebuildRecoverableCodexTurnCoordinatorReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: 1 } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildRecoverableCodexTurnCoordinatorReceipt({
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
