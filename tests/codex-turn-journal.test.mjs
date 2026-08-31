import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildCodexTaskCancellationReceipt,
  buildCodexTaskReservationReceipt,
  buildCodexTaskTransportReceipt,
} from '../src/host/codex-bound-turn.mjs';
import {
  buildCodexTaskExecutionReceipt,
  createCodexTurnJournal,
  verifyCodexTaskExecutionReceipt,
} from '../src/host/codex-turn-journal.mjs';

const zeroDigest = '0'.repeat(64);
const digest = (character) => character.repeat(64);
const baseTime = Date.parse('2026-08-31T18:00:00.000Z');

function opening(overrides = {}) {
  return {
    operation: 'create',
    operationId: 'operation-journal-001',
    turnId: 'turn-journal-001',
    requestDigest: digest('a'),
    parentTurnReceiptDigest: zeroDigest,
    transportDescriptorDigest: digest('b'),
    cortexId: 'cortex-fixture-a',
    task: null,
    ...overrides,
  };
}

function activeReceipt({
  taskId = 'codex-task-journal-001',
  hostAdapterId = 'codex-desktop-v1',
  bindingId = digest('1'),
  bindingCandidateId = digest('2'),
  bindingCandidateDigest = digest('3'),
  identityDigest = digest('4'),
  instanceId = 'journal-instance-001',
  issuedAt = '2026-08-31T18:00:01.000Z',
  expiresAt = '2026-08-31T18:01:01.000Z',
} = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godagent-cortex-binding-registry-v1',
    status: 'active',
    active: true,
    bindingId,
    bindingCandidateId,
    bindingCandidateDigest,
    identityDigest,
    instanceId,
    genesisId: digest('5'),
    genomeDigest: digest('6'),
    distributionDigest: digest('7'),
    realmContractDigest: digest('8'),
    keelId: `keel-${digest('9')}`,
    keelHeadDigest: digest('a'),
    taskId,
    hostAdapterId,
    revocationEpoch: 0,
    createdAt: issuedAt,
    lastVerifiedAt: issuedAt,
    lease: {
      leaseId: digest('b'),
      mode: 'exclusive-writer',
      issuedAt,
      expiresAt,
    },
    authority: { continuity: 'host-lease-only', realmEffects: 'none' },
    registryEventDigest: digest('c'),
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

function dispatchFor(identity, active, task = { taskId: active.taskId, hostId: 'codex-host-001' }) {
  const modelProjection = {
    binding: {
      bindingCandidateId: active.bindingCandidateId,
      taskId: active.taskId,
      hostAdapterId: active.hostAdapterId,
      revocationEpoch: active.revocationEpoch,
      instanceId: active.instanceId,
      genesisId: active.genesisId,
      keelId: active.keelId,
      genomeValueDigest: active.genomeDigest,
      distributionBuildId: active.distributionDigest,
      currentKeelHeadDigest: active.keelHeadDigest,
    },
  };
  const envelopeUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godagent-codex-bound-turn-v1',
    operation: identity.operation,
    operationId: identity.operationId,
    turnId: identity.turnId,
    parentTurnReceiptDigest: identity.parentTurnReceiptDigest,
    transportDescriptorDigest: identity.transportDescriptorDigest,
    binding: {
      bindingId: active.bindingId,
      bindingReceiptDigest: active.receiptDigest,
      bindingCandidateId: active.bindingCandidateId,
      bindingCandidateDigest: active.bindingCandidateDigest,
      identityDigest: active.identityDigest,
      instanceId: active.instanceId,
      genesisId: active.genesisId,
      genomeDigest: active.genomeDigest,
      distributionDigest: active.distributionDigest,
      realmContractDigest: active.realmContractDigest,
      keelId: active.keelId,
      keelHeadDigest: active.keelHeadDigest,
      taskId: active.taskId,
      hostAdapterId: active.hostAdapterId,
      revocationEpoch: active.revocationEpoch,
      leaseId: active.lease.leaseId,
      expiresAt: active.lease.expiresAt,
    },
    modelProjection,
    modelProjectionDigest: sha256Value(modelProjection),
    hostRules: {
      identitySource: 'host-verified',
      modelAuthority: 'proposal-only',
      selfAdmission: false,
      continuityAdmission: false,
      realmEffects: 'none',
      outputMetadataTrust: 'untrusted',
    },
  };
  const envelope = { ...envelopeUnsigned, envelopeDigest: sha256Value(envelopeUnsigned) };
  return {
    schemaVersion: 1,
    protocolId: 'eternities-codex-task-control-v1',
    operation: identity.operation,
    operationId: identity.operationId,
    turnId: identity.turnId,
    task,
    instructionChannel: 'developer',
    bindingReceiptDigest: active.receiptDigest,
    envelope,
    envelopeDigest: envelope.envelopeDigest,
    cortexId: identity.cortexId,
    maxResponseBytes: 16_384,
  };
}

function lifecycleReceipt(active, {
  status = 'released',
  recordedAt = '2026-08-31T18:00:04.000Z',
  registryEventDigest = digest('d'),
} = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godagent-cortex-binding-registry-v1',
    status,
    active: false,
    bindingId: active.bindingId,
    instanceId: active.instanceId,
    taskId: active.taskId,
    revocationEpoch: active.revocationEpoch,
    recordedAt,
    registryEventDigest,
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

function hostReceiptFor({ identity, reservation, active, dispatch, transportReceipt, lifecycle }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godagent-codex-bound-turn-v1',
    status: 'accepted',
    operation: identity.operation,
    operationId: identity.operationId,
    turnId: identity.turnId,
    parentTurnReceiptDigest: identity.parentTurnReceiptDigest,
    reservationReceiptDigest: reservation?.receiptDigest ?? zeroDigest,
    transportDescriptorDigest: identity.transportDescriptorDigest,
    instructionChannel: dispatch.instructionChannel,
    task: { ...dispatch.task, hostAdapterId: active.hostAdapterId },
    actor: {
      instanceId: active.instanceId,
      genesisId: active.genesisId,
      identityDigest: active.identityDigest,
      genomeDigest: active.genomeDigest,
      distributionDigest: active.distributionDigest,
      keelId: active.keelId,
      keelHeadDigest: active.keelHeadDigest,
    },
    binding: {
      bindingId: active.bindingId,
      bindingCandidateId: active.bindingCandidateId,
      bindingCandidateDigest: active.bindingCandidateDigest,
      activeReceiptDigest: active.receiptDigest,
      lifecycleReceiptDigest: lifecycle.receiptDigest,
      lifecycleStatus: lifecycle.status,
    },
    envelopeDigest: dispatch.envelopeDigest,
    modelProjectionDigest: dispatch.envelope.modelProjectionDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    cortexId: identity.cortexId,
    responseBytes: transportReceipt.responseBytes,
    responseDigest: transportReceipt.responseDigest,
    authority: { continuityAdmission: false, realmEffects: 0 },
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

function reservationFor(identity, task = { taskId: 'codex-task-journal-001', hostId: 'codex-host-001' }) {
  return buildCodexTaskReservationReceipt({
    intent: {
      schemaVersion: 1,
      protocolId: 'eternities-godagent-codex-bound-turn-v1',
      operationId: identity.operationId,
      requestDigest: identity.requestDigest,
      transportDescriptorDigest: identity.transportDescriptorDigest,
      hostAdapterId: 'codex-desktop-v1',
      cortexId: identity.cortexId,
    },
    task,
    instructionChannel: 'developer',
  });
}

function completedEvidence(identity, active, dispatch, responseText = 'verified fixture response') {
  const transportReceipt = buildCodexTaskTransportReceipt({ dispatch, responseText });
  const executionReceipt = buildCodexTaskExecutionReceipt({
    dispatch,
    transportReceipt,
    responseText,
    startedAt: '2026-08-31T18:00:02.000Z',
    completedAt: '2026-08-31T18:00:03.000Z',
  });
  return { responseText, transportReceipt, executionReceipt };
}

async function journalFixture(context, suffix) {
  const root = await mkdtemp(join(tmpdir(), `godagent-turn-journal-${suffix}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  let tick = 0;
  const options = { journalRoot: root, clock: () => baseTime + tick++ * 1_000 };
  return { root, options, journal: createCodexTurnJournal(options) };
}

test('opening identity is deterministic and the operation slot rejects changed identity', async (context) => {
  const fixture = await journalFixture(context, 'identity');
  const identity = opening();
  const first = await fixture.journal.open(identity);
  const reopened = await createCodexTurnJournal(fixture.options).open(identity);

  assert.equal(reopened.transactionId, first.transactionId);
  assert.deepEqual(await reopened.inspect(), await first.inspect());
  assert.equal((await first.inspect()).eventCount, 1);
  assert.equal((await first.inspect()).nextAction, 'reserve-task');

  await assert.rejects(
    () => fixture.journal.open({ ...identity, requestDigest: digest('f') }),
    /operation id collision/,
  );
  assert.equal((await first.inspect()).eventCount, 1);
});

test('a create transaction survives reconstruction and returns one exact terminal result', async (context) => {
  const fixture = await journalFixture(context, 'accepted');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  const active = activeReceipt();
  const dispatch = dispatchFor(identity, active, reservation.task);
  const completed = completedEvidence(identity, active, dispatch);
  const lifecycle = lifecycleReceipt(active);
  const hostReceipt = hostReceiptFor({
    identity, reservation, active, dispatch, transportReceipt: completed.transportReceipt, lifecycle,
  });

  await handle.recordReservation(reservation);
  const attempt = await handle.prepareAttempt({ activeReceipt: active, dispatch });
  await handle.recordTransport({ attemptId: attempt.attemptId, ...completed });
  await handle.closeBinding({ attemptId: attempt.attemptId, lifecycleReceipt: lifecycle });
  await handle.accept({ attemptId: attempt.attemptId, hostReceipt });

  const restarted = await createCodexTurnJournal(fixture.options).open(identity);
  const recovered = await restarted.inspect({ includeResponse: true });
  assert.equal(recovered.status, 'accepted');
  assert.equal(recovered.nextAction, 'none');
  assert.equal(recovered.eventCount, 6);
  assert.equal(recovered.responseText, completed.responseText);
  assert.deepEqual(recovered.hostReceipt, hostReceipt);

  await restarted.recordReservation(reservation);
  await restarted.prepareAttempt({ activeReceipt: active, dispatch });
  await restarted.recordTransport({ attemptId: attempt.attemptId, ...completed });
  await restarted.closeBinding({ attemptId: attempt.attemptId, lifecycleReceipt: lifecycle });
  await restarted.accept({ attemptId: attempt.attemptId, hostReceipt });
  assert.equal((await restarted.inspect()).eventCount, 6);
});

test('existing-task turns skip reservation and bind their exact parent task', async (context) => {
  const fixture = await journalFixture(context, 'existing');
  const task = { taskId: 'codex-task-existing-001', hostId: 'codex-host-001' };
  const identity = opening({
    operation: 'continue',
    operationId: 'operation-existing-001',
    turnId: 'turn-existing-001',
    parentTurnReceiptDigest: digest('e'),
    task,
  });
  const handle = await fixture.journal.open(identity);
  assert.equal((await handle.inspect()).nextAction, 'prepare-attempt');
  await assert.rejects(() => handle.recordReservation(reservationFor(identity, task)), /existing task/);
});

test('an uncertain dispatch must be reconciled and a completed transport cannot be abandoned', async (context) => {
  const fixture = await journalFixture(context, 'uncertain');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  const active = activeReceipt();
  const dispatch = dispatchFor(identity, active, reservation.task);
  await handle.recordReservation(reservation);
  const attempt = await handle.prepareAttempt({ activeReceipt: active, dispatch });

  assert.equal((await handle.inspect()).nextAction, 'reconcile-dispatch');
  await assert.rejects(
    () => handle.abandonAttempt({ attemptId: attempt.attemptId, reasonDigest: digest('e') }),
    /binding must be closed/,
  );

  const completed = completedEvidence(identity, active, dispatch);
  await handle.recordTransport({ attemptId: attempt.attemptId, ...completed });
  await handle.closeBinding({ attemptId: attempt.attemptId, lifecycleReceipt: lifecycleReceipt(active) });
  await assert.rejects(
    () => handle.abandonAttempt({ attemptId: attempt.attemptId, reasonDigest: digest('e') }),
    /completed transport/,
  );
});

test('a closed undispatched attempt can be abandoned before a fresh ordinal is prepared', async (context) => {
  const fixture = await journalFixture(context, 'abandon');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  await handle.recordReservation(reservation);
  const firstActive = activeReceipt();
  const first = await handle.prepareAttempt({
    activeReceipt: firstActive,
    dispatch: dispatchFor(identity, firstActive, reservation.task),
  });
  await handle.closeBinding({
    attemptId: first.attemptId,
    lifecycleReceipt: lifecycleReceipt(firstActive, { recordedAt: '2026-08-31T18:00:03.000Z' }),
  });
  await handle.abandonAttempt({ attemptId: first.attemptId, reasonDigest: digest('e') });

  const secondActive = activeReceipt({
    bindingId: digest('d'),
    issuedAt: '2026-08-31T18:00:05.000Z',
    expiresAt: '2026-08-31T18:01:05.000Z',
  });
  const second = await handle.prepareAttempt({
    activeReceipt: secondActive,
    dispatch: dispatchFor(identity, secondActive, reservation.task),
  });
  assert.equal(first.ordinal, 1);
  assert.equal(second.ordinal, 2);
  assert.notEqual(first.attemptId, second.attemptId);
});

test('execution witnesses and response blobs are exact, bounded, and lease-scoped', async (context) => {
  const fixture = await journalFixture(context, 'response');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  const active = activeReceipt();
  const dispatch = dispatchFor(identity, active, reservation.task);
  await handle.recordReservation(reservation);
  const attempt = await handle.prepareAttempt({ activeReceipt: active, dispatch });

  const completed = completedEvidence(identity, active, dispatch);
  assert.deepEqual(
    verifyCodexTaskExecutionReceipt(structuredClone(completed.executionReceipt)),
    completed.executionReceipt,
  );
  await handle.recordTransport({ attemptId: attempt.attemptId, ...completed });

  const responsePath = join(handle.transactionDir, 'responses', `${completed.transportReceipt.responseDigest}.txt`);
  await writeFile(responsePath, 'changed response', 'utf8');
  await assert.rejects(() => handle.inspect({ includeResponse: true }), /response blob/);

  const late = buildCodexTaskExecutionReceipt({
    dispatch,
    transportReceipt: completed.transportReceipt,
    responseText: completed.responseText,
    startedAt: '2026-08-31T18:00:02.000Z',
    completedAt: '2026-08-31T18:01:02.000Z',
  });
  const other = await fixture.journal.open(opening({
    operationId: 'operation-journal-late',
    turnId: 'turn-journal-late',
  }));
  const otherReservation = reservationFor(opening({
    operationId: 'operation-journal-late',
    turnId: 'turn-journal-late',
  }), reservation.task);
  await other.recordReservation(otherReservation);
  const otherIdentity = opening({ operationId: 'operation-journal-late', turnId: 'turn-journal-late' });
  const otherDispatch = dispatchFor(otherIdentity, active, reservation.task);
  const otherAttempt = await other.prepareAttempt({ activeReceipt: active, dispatch: otherDispatch });
  const otherTransport = buildCodexTaskTransportReceipt({
    dispatch: otherDispatch,
    responseText: completed.responseText,
  });
  const otherLate = buildCodexTaskExecutionReceipt({
    dispatch: otherDispatch,
    transportReceipt: otherTransport,
    responseText: completed.responseText,
    startedAt: late.startedAt,
    completedAt: late.completedAt,
  });
  await assert.rejects(
    () => other.recordTransport({
      attemptId: otherAttempt.attemptId,
      responseText: completed.responseText,
      transportReceipt: otherTransport,
      executionReceipt: otherLate,
    }),
    /lease expiry/,
  );
});

test('journal corruption and noncanonical bytes fail before another transition', async (context) => {
  const fixture = await journalFixture(context, 'corrupt');
  const handle = await fixture.journal.open(opening());
  const state = JSON.parse(await readFile(handle.statePath, 'utf8'));
  state.events[0].payload.cortexId = 'changed-cortex';
  state.stateDigest = sha256Value(Object.fromEntries(
    Object.entries(state).filter(([key]) => key !== 'stateDigest'),
  ));
  await writeFile(handle.statePath, `${canonicalJson(state)}\n`, 'utf8');
  await assert.rejects(() => handle.inspect(), /event digest mismatch/);

  await writeFile(handle.statePath, `{ "schemaVersion": 1 }\n`, 'utf8');
  await assert.rejects(() => handle.inspect(), /canonical|schema/i);
});

test('final acceptance rejects changed task, actor, response, and lifecycle links', async (context) => {
  const fixture = await journalFixture(context, 'links');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  const active = activeReceipt();
  const dispatch = dispatchFor(identity, active, reservation.task);
  const completed = completedEvidence(identity, active, dispatch);
  const lifecycle = lifecycleReceipt(active);
  await handle.recordReservation(reservation);
  const attempt = await handle.prepareAttempt({ activeReceipt: active, dispatch });
  await handle.recordTransport({ attemptId: attempt.attemptId, ...completed });
  await handle.closeBinding({ attemptId: attempt.attemptId, lifecycleReceipt: lifecycle });

  const changed = hostReceiptFor({
    identity, reservation, active, dispatch, transportReceipt: completed.transportReceipt, lifecycle,
  });
  changed.responseDigest = digest('f');
  const { receiptDigest: _old, ...unsigned } = changed;
  changed.receiptDigest = sha256Value(unsigned);
  await assert.rejects(
    () => handle.accept({ attemptId: attempt.attemptId, hostReceipt: changed }),
    /host receipt does not match/,
  );
  assert.equal((await handle.inspect()).nextAction, 'finalize-turn');
});

test('a recomputed envelope cannot substitute any field from the active binding receipt', async (context) => {
  const fixture = await journalFixture(context, 'binding-envelope');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  const active = activeReceipt();
  const dispatch = dispatchFor(identity, active, reservation.task);
  dispatch.envelope.binding.identityDigest = digest('f');
  const { envelopeDigest: _envelopeDigest, ...envelopeUnsigned } = dispatch.envelope;
  dispatch.envelope.envelopeDigest = sha256Value(envelopeUnsigned);
  dispatch.envelopeDigest = dispatch.envelope.envelopeDigest;
  await handle.recordReservation(reservation);
  await assert.rejects(
    () => handle.prepareAttempt({ activeReceipt: active, dispatch }),
    /does not match opening and active binding/,
  );
  assert.equal((await handle.inspect()).nextAction, 'prepare-attempt');
});

test('trusted journal metadata excludes transcript, credentials, paths, skills, and Realm authority', async (context) => {
  const fixture = await journalFixture(context, 'containment');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  const active = activeReceipt();
  const dispatch = dispatchFor(identity, active, reservation.task);
  const responseText = canonicalJson({
    transcript: 'untrusted text only',
    credential: 'canary-secret',
    workspacePath: 'C:\\forged',
    skillBody: 'forged method',
    realmAuthority: ['filesystem.write'],
  });
  const completed = completedEvidence(identity, active, dispatch, responseText);
  await handle.recordReservation(reservation);
  const attempt = await handle.prepareAttempt({ activeReceipt: active, dispatch });
  await handle.recordTransport({ attemptId: attempt.attemptId, ...completed });

  const durable = await readFile(handle.statePath, 'utf8');
  for (const forbidden of ['canary-secret', 'C:\\\\forged', 'forged method', 'filesystem.write']) {
    assert.equal(durable.includes(forbidden), false, forbidden);
  }
  assert.equal(durable.includes(responseText), false);
  assert.equal(sha256Text(responseText), completed.transportReceipt.responseDigest);
});

test('invalid reservation evidence fails before publication and a verified cancellation is terminal', async (context) => {
  const fixture = await journalFixture(context, 'cancel');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const wrongReservation = reservationFor({ ...identity, requestDigest: digest('f') });
  await assert.rejects(() => handle.recordReservation(wrongReservation), /does not match/);
  assert.equal((await handle.inspect()).eventCount, 1);

  const reservation = reservationFor(identity);
  await handle.recordReservation(reservation);
  const reasonDigest = digest('e');
  const cancellationReceipt = buildCodexTaskCancellationReceipt({ reservationReceipt: reservation, reasonDigest });
  await handle.cancel({ cancellationReceipt });
  await handle.cancel({ cancellationReceipt });
  const terminal = await handle.inspect();
  assert.equal(terminal.status, 'cancelled');
  assert.equal(terminal.nextAction, 'none');
  assert.equal(terminal.eventCount, 3);
  await assert.rejects(
    () => handle.prepareAttempt({
      activeReceipt: activeReceipt(),
      dispatch: dispatchFor(identity, activeReceipt(), reservation.task),
    }),
    /terminal/,
  );
});

test('quarantine is terminal and exact-idempotent', async (context) => {
  const fixture = await journalFixture(context, 'quarantine');
  const handle = await fixture.journal.open(opening());
  await handle.quarantine({ reasonDigest: digest('e') });
  await handle.quarantine({ reasonDigest: digest('e') });
  assert.equal((await handle.inspect()).status, 'quarantined');
  assert.equal((await handle.inspect()).eventCount, 2);
  await assert.rejects(() => handle.quarantine({ reasonDigest: digest('f') }), /terminal/);
});

test('a missing accepted response blob invalidates terminal inspection even without response disclosure', async (context) => {
  const fixture = await journalFixture(context, 'missing-response');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  const active = activeReceipt();
  const dispatch = dispatchFor(identity, active, reservation.task);
  const completed = completedEvidence(identity, active, dispatch);
  const lifecycle = lifecycleReceipt(active);
  const hostReceipt = hostReceiptFor({
    identity, reservation, active, dispatch, transportReceipt: completed.transportReceipt, lifecycle,
  });
  await handle.recordReservation(reservation);
  const attempt = await handle.prepareAttempt({ activeReceipt: active, dispatch });
  await handle.recordTransport({ attemptId: attempt.attemptId, ...completed });
  await handle.closeBinding({ attemptId: attempt.attemptId, lifecycleReceipt: lifecycle });
  await handle.accept({ attemptId: attempt.attemptId, hostReceipt });
  await rm(join(handle.transactionDir, 'responses', `${completed.transportReceipt.responseDigest}.txt`));
  await assert.rejects(() => handle.inspect(), /response blob is missing/);
});

test('deeply recomputed transport substitution is rejected during replay', async (context) => {
  const fixture = await journalFixture(context, 'transport-mutation');
  const identity = opening();
  const handle = await fixture.journal.open(identity);
  const reservation = reservationFor(identity);
  const active = activeReceipt();
  const dispatch = dispatchFor(identity, active, reservation.task);
  const completed = completedEvidence(identity, active, dispatch);
  await handle.recordReservation(reservation);
  const attempt = await handle.prepareAttempt({ activeReceipt: active, dispatch });
  await handle.recordTransport({ attemptId: attempt.attemptId, ...completed });

  const state = JSON.parse(await readFile(handle.statePath, 'utf8'));
  const event = state.events.at(-1);
  event.payload.transportReceipt.task.taskId = 'substituted-task';
  const { receiptDigest: _transportDigest, ...transportUnsigned } = event.payload.transportReceipt;
  event.payload.transportReceipt.receiptDigest = sha256Value(transportUnsigned);
  event.payload.executionReceipt.transportReceiptDigest = event.payload.transportReceipt.receiptDigest;
  const { receiptDigest: _executionDigest, ...executionUnsigned } = event.payload.executionReceipt;
  event.payload.executionReceipt.receiptDigest = sha256Value(executionUnsigned);
  const { contentDigest: _eventDigest, ...eventUnsigned } = event;
  event.contentDigest = sha256Value(eventUnsigned);
  state.headDigest = event.contentDigest;
  const { stateDigest: _stateDigest, ...stateUnsigned } = state;
  state.stateDigest = sha256Value(stateUnsigned);
  await writeFile(handle.statePath, `${canonicalJson(state)}\n`, 'utf8');
  await assert.rejects(() => handle.inspect(), /does not match transport completion/);
});

test('a backwards clock and oversized journal fail without replacing the last valid state', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-turn-journal-clock-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const times = [baseTime, baseTime - 1_000];
  const journal = createCodexTurnJournal({ journalRoot: root, clock: () => times.shift() });
  const identity = opening();
  const handle = await journal.open(identity);
  await assert.rejects(() => handle.recordReservation(reservationFor(identity)), /time moved backwards/);
  assert.equal((await handle.inspect()).eventCount, 1);

  await writeFile(handle.statePath, 'x'.repeat(8 * 1024 * 1024 + 1), 'utf8');
  await assert.rejects(() => handle.inspect(), /exceeds maximum size/);
});

test('the journal source is inert and has no task, binding, continuity, skill, or Realm executor', async () => {
  const source = await readFile(new URL('../src/host/codex-turn-journal.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    'reserveTask(',
    'dispatchTurn(',
    'acquireCortexBinding(',
    'appendKeel',
    'continuityAdmission: true',
    'activateGodskill',
    'invokeRealm',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
