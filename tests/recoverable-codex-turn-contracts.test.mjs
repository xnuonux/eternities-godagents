import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import {
  buildCodexRecoverableTransportBinding,
  buildRecoverableCodexBoundTurnReceipt,
  verifyAnyCodexBoundTurnReceipt,
  verifyCodexRecoverableTransportBinding,
  verifyCodexTaskRecoveryDescriptor,
  verifyRecoverableCodexBoundTurnReceipt,
} from '../src/host/codex-recoverable-turn-contracts.mjs';
import {
  certificationActiveReceipt,
  certificationCompletion,
  certificationDispatch,
  certificationHostReceipt,
  certificationLifecycle,
  certificationOpening,
  certificationReservation,
  fixtureDigest,
} from '../scripts/lib/codex-turn-journal-certification-fixture.mjs';

const taskControl = Object.freeze({
  schemaVersion: 1,
  protocolId: 'eternities-codex-task-control-v1',
  hostAdapterId: 'codex-desktop-v1',
  instructionChannel: 'developer',
  suspendedReservation: true,
  boundExecutionReceipt: true,
});

const recovery = Object.freeze({
  schemaVersion: 1,
  protocolId: 'eternities-codex-task-recovery-v1',
  reservationReconciliation: 'terminal-by-operation',
  dispatchReconciliation: 'terminal-by-dispatch-digest',
  executionWitness: 'lease-bounded-v1',
});

function evidence({ lifecycleStatus = 'released', recoveredAfterInterruption = false } = {}) {
  const binding = buildCodexRecoverableTransportBinding({ taskControl, recovery });
  const identity = certificationOpening({
    operation: 'create',
    operationId: 'operation-recoverable-contract-001',
    turnId: 'turn-recoverable-contract-001',
    cortexId: 'cortex-fixture-a',
    requestLabel: 'recoverable-contract-request',
  });
  identity.transportDescriptorDigest = binding.bindingDigest;
  const task = { taskId: 'codex-task-recoverable-contract', hostId: 'codex-host-contract' };
  const reservation = certificationReservation(identity, task);
  const activeReceipt = certificationActiveReceipt({
    label: 'recoverable-contract-active',
    taskId: task.taskId,
    issuedAt: '2026-08-31T23:00:00.000Z',
    expiresAt: '2026-08-31T23:01:00.000Z',
  });
  const dispatch = certificationDispatch(identity, activeReceipt, task);
  const completion = certificationCompletion({
    dispatch,
    responseText: 'recoverable contract response',
    startedAt: '2026-08-31T23:00:10.000Z',
    completedAt: '2026-08-31T23:00:20.000Z',
  });
  const lifecycleReceipt = certificationLifecycle(activeReceipt, {
    status: lifecycleStatus,
    recordedAt: lifecycleStatus === 'expired'
      ? '2026-08-31T23:01:01.000Z'
      : '2026-08-31T23:00:21.000Z',
  });
  return {
    binding,
    identity,
    task,
    reservation,
    activeReceipt,
    dispatch,
    completion,
    lifecycleReceipt,
    recoveredAfterInterruption,
  };
}

function buildReceipt(input) {
  return buildRecoverableCodexBoundTurnReceipt({
    transactionId: fixtureDigest('recoverable-contract-transaction'),
    preAcceptanceJournalHeadDigest: fixtureDigest('recoverable-contract-journal-head'),
    reservationReceiptDigest: input.reservation.receiptDigest,
    activeReceipt: input.activeReceipt,
    lifecycleReceipt: input.lifecycleReceipt,
    dispatch: input.dispatch,
    transportReceipt: input.completion.transportReceipt,
    executionReceipt: input.completion.executionReceipt,
    responseText: input.completion.responseText,
    recoveredAfterInterruption: input.recoveredAfterInterruption,
  });
}

test('recovery and task-control descriptors form one deterministic closed binding', () => {
  const first = buildCodexRecoverableTransportBinding({ taskControl, recovery });
  const second = buildCodexRecoverableTransportBinding({
    recovery: structuredClone(recovery),
    taskControl: structuredClone(taskControl),
  });
  assert.deepEqual(first, second);
  assert.deepEqual(verifyCodexRecoverableTransportBinding(structuredClone(first)), first);
  assert.deepEqual(verifyCodexTaskRecoveryDescriptor(structuredClone(recovery)), recovery);
  assert.equal(first.bindingDigest, sha256Value(Object.fromEntries(
    Object.entries(first).filter(([key]) => key !== 'bindingDigest'),
  )));

  assert.throws(
    () => verifyCodexTaskRecoveryDescriptor({ ...recovery, dispatchReconciliation: 'best-effort' }),
    /recovery descriptor/,
  );
  assert.throws(
    () => buildCodexRecoverableTransportBinding({
      taskControl: { ...taskControl, boundExecutionReceipt: false },
      recovery,
    }),
    /task transport descriptor/,
  );
});

test('ordinary release produces one recoverable host receipt with zero admitted authority', () => {
  const input = evidence();
  const receipt = buildReceipt(input);
  assert.equal(receipt.binding.lifecycleStatus, 'released');
  assert.equal(receipt.recovery.recoveredAfterInterruption, false);
  assert.equal(receipt.authority.continuityAdmission, false);
  assert.equal(receipt.authority.realmEffects, 0);
  assert.deepEqual(verifyRecoverableCodexBoundTurnReceipt(structuredClone(receipt)), receipt);
  assert.deepEqual(verifyAnyCodexBoundTurnReceipt(structuredClone(receipt)), receipt);
});

test('process-death expiry can finalize only from an in-lease execution witness and recovered flag', () => {
  const input = evidence({ lifecycleStatus: 'expired', recoveredAfterInterruption: true });
  const receipt = buildReceipt(input);
  assert.equal(receipt.binding.lifecycleStatus, 'expired');
  assert.equal(receipt.recovery.recoveredAfterInterruption, true);
  assert.deepEqual(verifyRecoverableCodexBoundTurnReceipt(structuredClone(receipt)), receipt);

  assert.throws(
    () => buildReceipt({ ...input, recoveredAfterInterruption: false }),
    /expired binding requires reconstructed finalization/,
  );
  const late = structuredClone(input.completion.executionReceipt);
  late.completedAt = '2026-08-31T23:01:01.000Z';
  const { receiptDigest: _old, ...unsigned } = late;
  late.receiptDigest = sha256Value(unsigned);
  assert.throws(
    () => buildRecoverableCodexBoundTurnReceipt({
      transactionId: fixtureDigest('recoverable-contract-transaction'),
      preAcceptanceJournalHeadDigest: fixtureDigest('recoverable-contract-journal-head'),
      reservationReceiptDigest: input.reservation.receiptDigest,
      activeReceipt: input.activeReceipt,
      lifecycleReceipt: input.lifecycleReceipt,
      dispatch: input.dispatch,
      transportReceipt: input.completion.transportReceipt,
      executionReceipt: late,
      responseText: input.completion.responseText,
      recoveredAfterInterruption: true,
    }),
    /lease/,
  );
});

test('revoked completion and deeply recomputed receipt substitution fail closed', () => {
  const revoked = evidence({ lifecycleStatus: 'revoked', recoveredAfterInterruption: true });
  assert.throws(() => buildReceipt(revoked), /released or expired/);

  const receipt = structuredClone(buildReceipt(evidence()));
  receipt.actor.identityDigest = 'z'.repeat(64);
  const { receiptDigest: _old, ...unsigned } = receipt;
  receipt.receiptDigest = sha256Value(unsigned);
  assert.throws(
    () => verifyRecoverableCodexBoundTurnReceipt(receipt),
    /receipt mismatch|identity/,
  );
});

test('generic parent verification retains the phase-3 receipt format', () => {
  const input = evidence();
  const phaseThree = certificationHostReceipt({
    identity: input.identity,
    reservation: input.reservation,
    activeReceipt: input.activeReceipt,
    dispatch: input.dispatch,
    transportReceipt: input.completion.transportReceipt,
    lifecycleReceipt: input.lifecycleReceipt,
  });
  assert.deepEqual(verifyAnyCodexBoundTurnReceipt(structuredClone(phaseThree)), phaseThree);
});
