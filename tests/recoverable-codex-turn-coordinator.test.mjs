import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { admitLocalCreation } from '../src/genesis/local-admission.mjs';
import {
  buildCodexTaskReservationReceipt,
  buildCodexTaskTransportReceipt,
} from '../src/host/codex-bound-turn.mjs';
import { createRecoverableCodexTurnCoordinator } from '../src/host/codex-recoverable-turn-coordinator.mjs';
import { buildCodexTaskExecutionReceipt } from '../src/host/codex-task-execution.mjs';
import { createCodexTurnJournal } from '../src/host/codex-turn-journal.mjs';
import {
  acquireCortexBinding,
  inspectCortexBindingById,
} from '../src/host/cortex-binding-registry.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';

const creationFixture = new URL('../fixtures/creation/', import.meta.url);
const realmFixture = new URL('../fixtures/realm-contract.json', import.meta.url);
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';

function timeSource() {
  let value = Date.parse('2026-08-31T20:00:00.000Z');
  return {
    now: () => value,
    advance(milliseconds) { value += milliseconds; },
  };
}

function turnRequest({
  operationId = 'operation-recoverable-turn-001',
  turnId = 'turn-recoverable-001',
  objective = 'produce one recoverable evidence-bound proposal',
} = {}) {
  return {
    schemaVersion: 1,
    operationId,
    turnId,
    hostAdapterId: 'codex-desktop-v1',
    revocationEpoch: 0,
    mission: {
      missionId: `mission-${turnId}`,
      objective,
      successEvidence: ['one exact accepted receipt', 'one bounded response'],
      stopConditions: ['binding changes', 'transport evidence becomes ambiguous'],
      budget: { maxCycles: 1, maxCompletionTokens: 2048 },
      observation: {
        observationId: `observation-${turnId}`,
        summary: 'the trusted recoverable transport is ready',
        evidenceDigests: ['a'.repeat(64)],
      },
    },
    maxProjectionBytes: 65_536,
    maxResponseBytes: 16_384,
  };
}

async function setupAdmission(context, suffix, time) {
  const root = await mkdtemp(join(tmpdir(), `godagent-recoverable-coordinator-${suffix}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'creation-source');
  await cp(creationFixture, sourceRoot, { recursive: true });
  const sourceCreationDir = join(root, 'compiled-creation');
  const creation = await compileCreation({
    candidatePath: join(sourceRoot, 'creation-candidate.json'),
    policyPath: join(sourceRoot, 'creation-policy.json'),
    expectedPolicyDigest,
    expressionPath: join(sourceRoot, 'expression-overlay.json'),
    moduleDirectory: join(sourceRoot, 'modules'),
    outputDir: sourceCreationDir,
  });
  const promptArtifactPath = join(root, 'prompt-os.md');
  await writeFile(
    promptArtifactPath,
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: recoverable-coordinator.test.json -->\n# Recoverable coordinator test\n',
    'utf8',
  );
  const realm = JSON.parse(await readFile(realmFixture, 'utf8'));
  realm.capabilities = ['filesystem.read', 'filesystem.write'];
  realm.compatibleDistributions = ['0.2.x'];
  const realmContractPath = join(root, 'realm-contract.json');
  await writeFile(realmContractPath, `${canonicalJson(realm)}\n`, 'utf8');
  const workspace = join(root, 'workspace');
  const instanceId = `recoverable-coordinator-${suffix}`;
  const creatorRef = 'creator:dom';
  await admitLocalCreation({
    creationDir: sourceCreationDir,
    expectedPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    promptArtifactPath,
    realmContractPath,
    workspace,
    instanceId,
    creatorRef,
    checkpointPurpose: 'test recovery-first exact turn coordination',
    clock: () => new Date(time.now()).toISOString(),
  });
  const admissionRoot = join(workspace, 'admission');
  return {
    root,
    journalRoot: join(root, 'turn-journals'),
    registryRoot: join(root, 'binding-registry'),
    instanceRegistryRoot: join(root, 'instance-registry'),
    admission: {
      receiptPath: join(admissionRoot, 'transaction', 'genesis-receipt.json'),
      creationDir: join(admissionRoot, 'creation'),
      distributionDir: join(admissionRoot, 'distribution'),
      expectedPolicyDigest,
      expectedCreationBuildId: creation.manifest.buildId,
      instanceId,
      creatorRef,
      transactionDir: join(admissionRoot, 'transaction'),
      journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
      keelAdapter: createLocalKeelBackend({ root: join(admissionRoot, 'keels') }),
    },
  };
}

function recoverableTransport(time, { responseFor } = {}) {
  const calls = [];
  const reservations = new Map();
  const completions = new Map();
  const tasks = new Set();
  const descriptor = {
    schemaVersion: 1,
    protocolId: 'eternities-codex-task-control-v1',
    hostAdapterId: 'codex-desktop-v1',
    instructionChannel: 'developer',
    suspendedReservation: true,
    boundExecutionReceipt: true,
  };
  const recoveryDescriptor = {
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
    tasks,
    resetCalls() { calls.length = 0; },
    descriptor() {
      calls.push({ type: 'descriptor' });
      return structuredClone(descriptor);
    },
    recoveryDescriptor() {
      calls.push({ type: 'recovery-descriptor' });
      return structuredClone(recoveryDescriptor);
    },
    async reconcileReservation(intent) {
      calls.push({ type: 'reconcile-reservation', intent: structuredClone(intent) });
      const receipt = reservations.get(intent.operationId);
      return receipt ? { status: 'reserved', receipt } : { status: 'absent' };
    },
    async reserveTask(intent) {
      calls.push({ type: 'reserve', intent: structuredClone(intent) });
      if (reservations.has(intent.operationId)) throw new Error('duplicate reservation');
      const task = {
        taskId: `task-${intent.operationId}`,
        hostId: 'local-recoverable-host-001',
      };
      const receipt = buildCodexTaskReservationReceipt({
        intent,
        task,
        instructionChannel: descriptor.instructionChannel,
      });
      reservations.set(intent.operationId, receipt);
      tasks.add(task.taskId);
      return receipt;
    },
    async cancelReservation() {
      throw new Error('fixture cancellation was not expected');
    },
    async reconcileTurn(dispatch) {
      calls.push({ type: 'reconcile-dispatch', dispatchDigest: sha256Value(dispatch) });
      const completed = completions.get(sha256Value(dispatch));
      return completed ? { status: 'completed', ...completed } : { status: 'absent' };
    },
    async dispatchTurn(dispatch) {
      calls.push({ type: 'dispatch', dispatchDigest: sha256Value(dispatch) });
      const dispatchDigest = sha256Value(dispatch);
      if (completions.has(dispatchDigest)) throw new Error('duplicate dispatch');
      const startedAt = new Date(time.now()).toISOString();
      time.advance(100);
      const responseText = responseFor
        ? responseFor(dispatch)
        : `recoverable response for ${dispatch.operation}:${dispatch.turnId}`;
      const receipt = buildCodexTaskTransportReceipt({ dispatch, responseText });
      const executionReceipt = buildCodexTaskExecutionReceipt({
        dispatch,
        transportReceipt: receipt,
        responseText,
        startedAt,
        completedAt: new Date(time.now()).toISOString(),
      });
      const result = { responseText, receipt, executionReceipt };
      completions.set(dispatchDigest, result);
      return result;
    },
  };
}

function coordinatorOptions(fixture, transport, time, checkpoint = async () => {}) {
  let credentialOrdinal = 0;
  let lockOrdinal = 0;
  return {
    taskTransport: transport,
    registryRoot: fixture.registryRoot,
    instanceRegistryRoot: fixture.instanceRegistryRoot,
    journalRoot: fixture.journalRoot,
    leaseDurationMs: 2_000,
    clock: time.now,
    leaseCredential: () => `recoverable-coordinator-credential-${++credentialOrdinal}`,
    writerLockOptions: {
      pid: 43001,
      now: time.now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => `recoverable-writer-${++lockOrdinal}`,
    },
    checkpoint,
  };
}

function crashOnceAt(target) {
  let crashed = false;
  return async (checkpoint) => {
    if (!crashed && checkpoint === target) {
      crashed = true;
      const error = new Error(`simulated process death at ${target}`);
      error.code = 'simulated-process-death';
      throw error;
    }
  };
}

test('create reconciles before mutation and exact accepted retry makes zero transport calls', async (context) => {
  const time = timeSource();
  const fixture = await setupAdmission(context, 'create', time);
  const transport = recoverableTransport(time);
  const coordinator = createRecoverableCodexTurnCoordinator(coordinatorOptions(fixture, transport, time));
  const input = {
    admission: fixture.admission,
    request: turnRequest(),
    cortexId: 'gpt-recoverable-a',
  };

  const result = await coordinator.create(input);
  assert.deepEqual(transport.calls.map((call) => call.type), [
    'descriptor',
    'recovery-descriptor',
    'reconcile-reservation',
    'reserve',
    'reconcile-dispatch',
    'dispatch',
  ]);
  assert.equal(result.receipt.protocolId, 'eternities-godagent-codex-recoverable-bound-turn-v1');
  assert.equal(result.receipt.authority.continuityAdmission, false);
  assert.equal(result.receipt.authority.realmEffects, 0);
  assert.equal(result.receipt.recovery.recoveredAfterInterruption, false);
  assert.equal(transport.tasks.size, 1);
  assert.equal(transport.completions.size, 1);

  transport.resetCalls();
  const replayed = await coordinator.create(input);
  assert.deepEqual(replayed, result);
  assert.deepEqual(transport.calls, []);
});

test('create, continue, and compaction resume preserve one actor while allowing cortex replacement', async (context) => {
  const time = timeSource();
  const fixture = await setupAdmission(context, 'lineage', time);
  const transport = recoverableTransport(time);
  const coordinator = createRecoverableCodexTurnCoordinator(coordinatorOptions(fixture, transport, time));
  const created = await coordinator.create({
    admission: fixture.admission,
    request: turnRequest(),
    cortexId: 'gpt-recoverable-a',
  });
  const continued = await coordinator.continue({
    admission: fixture.admission,
    task: created.task,
    parentReceipt: created.receipt,
    request: turnRequest({ operationId: 'operation-recoverable-turn-002', turnId: 'turn-recoverable-002' }),
    cortexId: 'gpt-recoverable-b',
  });
  const resumed = await coordinator.resumeAfterCompaction({
    admission: fixture.admission,
    task: created.task,
    parentReceipt: continued.receipt,
    request: turnRequest({ operationId: 'operation-recoverable-turn-003', turnId: 'turn-recoverable-003' }),
    cortexId: 'gpt-recoverable-c',
  });

  assert.deepEqual(continued.actor, undefined);
  assert.deepEqual(continued.receipt.actor, created.receipt.actor);
  assert.deepEqual(resumed.receipt.actor, created.receipt.actor);
  assert.equal(continued.receipt.parentTurnReceiptDigest, created.receipt.receiptDigest);
  assert.equal(resumed.receipt.parentTurnReceiptDigest, continued.receipt.receiptDigest);
  assert.equal(resumed.receipt.cortexId, 'gpt-recoverable-c');
  assert.equal(transport.tasks.size, 1);
  assert.equal(transport.completions.size, 3);
});

for (const checkpoint of [
  'after-reservation',
  'after-binding-acquired',
  'after-attempt-prepared',
  'after-dispatch-completed',
  'after-transport-recorded',
  'after-binding-closed',
  'after-accepted',
]) {
  test(`process reconstruction at ${checkpoint} reaches one task and one completed dispatch`, async (context) => {
    const time = timeSource();
    const fixture = await setupAdmission(context, checkpoint, time);
    const transport = recoverableTransport(time);
    const input = {
      admission: fixture.admission,
      request: turnRequest({
        operationId: `operation-${checkpoint}`,
        turnId: `turn-${checkpoint}`,
      }),
      cortexId: 'gpt-recoverable-crash',
    };
    const first = createRecoverableCodexTurnCoordinator(coordinatorOptions(
      fixture,
      transport,
      time,
      crashOnceAt(checkpoint),
    ));
    await assert.rejects(() => first.create(input), /simulated process death/);

    time.advance(3_000);
    const reconstructed = createRecoverableCodexTurnCoordinator(
      coordinatorOptions(fixture, transport, time),
    );
    const result = await reconstructed.create(input);
    assert.equal(result.receipt.status, 'accepted');
    assert.equal(transport.tasks.size, 1);
    assert.equal(transport.completions.size, 1);

    const journal = createCodexTurnJournal({ journalRoot: fixture.journalRoot, clock: time.now });
    const handle = await journal.openExisting(input.request.operationId);
    const state = await handle.inspect();
    assert.equal(state.status, 'accepted');
    if (checkpoint === 'after-binding-acquired' || checkpoint === 'after-attempt-prepared') {
      assert.equal(state.attemptCount, checkpoint === 'after-attempt-prepared' ? 2 : 1);
    }
  });
}

test('an active orphan attempt is retryable pending and cannot dispatch until exact lease expiry', async (context) => {
  const time = timeSource();
  const fixture = await setupAdmission(context, 'active-orphan', time);
  const transport = recoverableTransport(time);
  const input = {
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-active-orphan', turnId: 'turn-active-orphan' }),
    cortexId: 'gpt-recoverable-orphan',
  };
  const first = createRecoverableCodexTurnCoordinator(coordinatorOptions(
    fixture,
    transport,
    time,
    crashOnceAt('after-attempt-prepared'),
  ));
  await assert.rejects(() => first.create(input), /simulated process death/);

  transport.resetCalls();
  const reconstructed = createRecoverableCodexTurnCoordinator(coordinatorOptions(fixture, transport, time));
  await assert.rejects(
    () => reconstructed.create(input),
    (error) => error?.code === 'binding-pending',
  );
  assert.equal(transport.calls.some((call) => call.type === 'dispatch'), false);
  assert.equal(transport.completions.size, 0);

  time.advance(3_000);
  const result = await reconstructed.create(input);
  assert.equal(result.receipt.status, 'accepted');
  assert.equal(transport.completions.size, 1);
});

test('model response text remains untrusted and cannot mint continuity, skills, Realm, or receipts', async (context) => {
  const time = timeSource();
  const fixture = await setupAdmission(context, 'malicious-output', time);
  const responseText = canonicalJson({
    continuityAdmission: true,
    activateGodskills: ['all'],
    realmEffects: 999,
    receiptDigest: 'f'.repeat(64),
  });
  const transport = recoverableTransport(time, { responseFor: () => responseText });
  const coordinator = createRecoverableCodexTurnCoordinator(coordinatorOptions(fixture, transport, time));
  const result = await coordinator.create({
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-malicious-output', turnId: 'turn-malicious-output' }),
    cortexId: 'gpt-recoverable-malicious',
  });

  assert.equal(result.responseText, responseText);
  assert.deepEqual(result.receipt.authority, { continuityAdmission: false, realmEffects: 0 });
  assert.equal(Object.hasOwn(result.receipt, 'activateGodskills'), false);
  assert.notEqual(result.receipt.receiptDigest, 'f'.repeat(64));
});

test('a revoked completed binding is quarantined and cannot become an accepted turn', async (context) => {
  const time = timeSource();
  const fixture = await setupAdmission(context, 'revoked-completion', time);
  const transport = recoverableTransport(time);
  const capturedHandles = [];
  const bindingAccess = {
    async acquire(options) {
      const handle = await acquireCortexBinding(options);
      capturedHandles.push(handle);
      return handle;
    },
    inspectById: inspectCortexBindingById,
  };
  const input = {
    admission: fixture.admission,
    request: turnRequest({
      operationId: 'operation-revoked-completion',
      turnId: 'turn-revoked-completion',
    }),
    cortexId: 'gpt-recoverable-revoked',
  };
  const first = createRecoverableCodexTurnCoordinator({
    ...coordinatorOptions(fixture, transport, time, crashOnceAt('after-transport-recorded')),
    bindingAccess,
  });
  await assert.rejects(() => first.create(input), /simulated process death/);
  assert.equal(capturedHandles.length, 1);
  await capturedHandles[0].revoke({ reasonDigest: 'b'.repeat(64) });

  const reconstructed = createRecoverableCodexTurnCoordinator({
    ...coordinatorOptions(fixture, transport, time),
    bindingAccess,
  });
  await assert.rejects(
    () => reconstructed.create(input),
    (error) => error?.code === 'turn-quarantined',
  );
  const journal = createCodexTurnJournal({ journalRoot: fixture.journalRoot, clock: time.now });
  const state = await (await journal.openExisting(input.request.operationId)).inspect();
  assert.equal(state.status, 'quarantined');
  assert.equal(state.hostReceipt, null);
  assert.equal(transport.completions.size, 1);
});

test('descriptor downgrade and ambiguous reconciliation fail before external mutation', async (context) => {
  const time = timeSource();
  const fixture = await setupAdmission(context, 'ambiguous-reconciliation', time);
  const downgraded = recoverableTransport(time);
  downgraded.recoveryDescriptor = () => ({
    schemaVersion: 1,
    protocolId: 'eternities-codex-task-recovery-v1',
    reservationReconciliation: 'best-effort',
    dispatchReconciliation: 'terminal-by-dispatch-digest',
    executionWitness: 'lease-bounded-v1',
  });
  const input = {
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-descriptor-downgrade', turnId: 'turn-descriptor-downgrade' }),
    cortexId: 'gpt-recoverable-downgrade',
  };
  await assert.rejects(
    () => createRecoverableCodexTurnCoordinator(
      coordinatorOptions(fixture, downgraded, time),
    ).create(input),
    /recovery descriptor is unsupported/,
  );
  assert.equal(downgraded.calls.some((call) => ['reserve', 'dispatch'].includes(call.type)), false);

  const ambiguous = recoverableTransport(time);
  ambiguous.reconcileReservation = async (intent) => {
    ambiguous.calls.push({ type: 'reconcile-reservation', intent });
    return { status: 'pending' };
  };
  const ambiguousInput = {
    ...input,
    request: turnRequest({ operationId: 'operation-ambiguous-reservation', turnId: 'turn-ambiguous-reservation' }),
  };
  await assert.rejects(
    () => createRecoverableCodexTurnCoordinator(
      coordinatorOptions(fixture, ambiguous, time),
    ).create(ambiguousInput),
    /reconciliation is ambiguous or unsupported/,
  );
  assert.equal(ambiguous.calls.some((call) => ['reserve', 'dispatch'].includes(call.type)), false);
});

test('changed response evidence and ambiguous dispatch reconciliation cannot issue a host receipt', async (context) => {
  const time = timeSource();
  const fixture = await setupAdmission(context, 'forged-transport', time);
  const forged = recoverableTransport(time);
  const originalDispatch = forged.dispatchTurn.bind(forged);
  forged.dispatchTurn = async (dispatch) => {
    const completed = await originalDispatch(dispatch);
    return { ...completed, responseText: `${completed.responseText}-changed` };
  };
  const forgedInput = {
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-forged-response', turnId: 'turn-forged-response' }),
    cortexId: 'gpt-recoverable-forged',
  };
  await assert.rejects(
    () => createRecoverableCodexTurnCoordinator(
      coordinatorOptions(fixture, forged, time),
    ).create(forgedInput),
    /transport receipt does not match the bound turn/,
  );
  const forgedJournal = createCodexTurnJournal({ journalRoot: fixture.journalRoot, clock: time.now });
  const forgedState = await (await forgedJournal.openExisting(forgedInput.request.operationId)).inspect();
  assert.equal(forgedState.hostReceipt, null);

  const secondFixture = await setupAdmission(context, 'ambiguous-dispatch', time);
  const ambiguous = recoverableTransport(time);
  ambiguous.reconcileTurn = async (dispatch) => {
    ambiguous.calls.push({ type: 'reconcile-dispatch', dispatchDigest: sha256Value(dispatch) });
    return { status: 'pending' };
  };
  const ambiguousInput = {
    admission: secondFixture.admission,
    request: turnRequest({ operationId: 'operation-ambiguous-dispatch', turnId: 'turn-ambiguous-dispatch' }),
    cortexId: 'gpt-recoverable-ambiguous',
  };
  await assert.rejects(
    () => createRecoverableCodexTurnCoordinator(
      coordinatorOptions(secondFixture, ambiguous, time),
    ).create(ambiguousInput),
    /dispatch reconciliation is ambiguous or unsupported/,
  );
  assert.equal(ambiguous.calls.some((call) => call.type === 'dispatch'), false);
});

test('coordinator source contains no continuity, Godskills, Realm, or global-instruction executor', async () => {
  const source = await readFile(
    new URL('../src/host/codex-recoverable-turn-coordinator.mjs', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'continuityAdmission: true',
    'appendKeel',
    'activateGodskill',
    'invokeRealm',
    'AGENTS.md',
    'config.toml',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
