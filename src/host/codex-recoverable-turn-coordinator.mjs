import { resolve } from 'node:path';

import {
  compileCortexBindingCandidate,
  verifyCortexBindingCandidate,
} from '../cortex/binding-compiler.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import {
  buildCodexBindingRequest,
  buildCodexBoundTurnEnvelope,
  verifyCodexBoundTurnRequest,
  verifyCodexTaskDispatch,
  verifyCodexTaskReservationReceipt,
  verifyCodexTaskTransportResult,
} from './codex-bound-turn.mjs';
import {
  buildCodexRecoverableTransportBinding,
  buildRecoverableCodexBoundTurnReceipt,
  verifyAnyCodexBoundTurnReceipt,
} from './codex-recoverable-turn-contracts.mjs';
import { verifyCodexTaskExecutionReceipt } from './codex-task-execution.mjs';
import {
  acquireCortexBinding,
  defaultCortexBindingRegistryRoot,
  inspectCortexBindingById,
  verifyCortexBindingLifecycleReceipt,
  verifyCortexBindingReceipt,
} from './cortex-binding-registry.mjs';
import {
  createCodexTurnJournal,
  defaultCodexTurnJournalRoot,
} from './codex-turn-journal.mjs';
import { defaultLocalInstanceRegistryRoot } from './local-instance-registry.mjs';

const protocolId = 'eternities-godagent-codex-bound-turn-v1';
const zeroDigest = '0'.repeat(64);
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const operations = new Set(['create', 'continue', 'compaction-resume']);
const clone = (value) => structuredClone(value);

export class CodexRecoverableTurnCoordinatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CodexRecoverableTurnCoordinatorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CodexRecoverableTurnCoordinatorError(code, message);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntegrityError(`${label} must be an object`);
  }
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new IntegrityError(`${label} fields are invalid`);
  }
}

function requireIdentifier(value, label) {
  if (!identifierPattern.test(value ?? '') || value === '.' || value === '..') {
    throw new IntegrityError(`${label} is invalid`);
  }
}

function same(first, second) {
  return canonicalJson(first) === canonicalJson(second);
}

function taskValue(value) {
  exactKeys(value, ['taskId', 'hostId'], 'Codex task');
  requireIdentifier(value.taskId, 'Codex task id');
  requireIdentifier(value.hostId, 'Codex host id');
  return deepFreeze(clone(value));
}

function assertParent(inputParent, task, request) {
  const parent = verifyAnyCodexBoundTurnReceipt(inputParent);
  if (parent.task.taskId !== task.taskId || parent.task.hostId !== task.hostId
      || parent.task.hostAdapterId !== request.hostAdapterId) {
    throw new IntegrityError('parent bound-turn task does not match');
  }
  if (parent.turnId === request.turnId || parent.operationId === request.operationId) {
    throw new IntegrityError('bound-turn identity was already used');
  }
  return parent;
}

function assertActorContinuation(parent, activeReceipt) {
  for (const field of [
    'instanceId', 'genesisId', 'identityDigest', 'genomeDigest', 'distributionDigest', 'keelId',
  ]) {
    if (parent.actor[field] !== activeReceipt[field]) {
      throw new IntegrityError('parent bound-turn actor does not match the admitted identity');
    }
  }
}

function assertCandidateMatchesReceipt(candidate, activeReceipt) {
  if (candidate.candidateDigest !== activeReceipt.bindingCandidateDigest
      || candidate.bindingCandidateId !== activeReceipt.bindingCandidateId
      || candidate.fullEnvelope.sectionDigests.identity !== activeReceipt.identityDigest
      || candidate.fullEnvelope.binding.currentKeelHeadDigest !== activeReceipt.keelHeadDigest) {
    fail('candidate-mismatch', 'active binding does not match the compiled turn candidate');
  }
}

function expectedOpening({ operation, request, task, parent, cortexId, transportBinding }) {
  return deepFreeze({
    operation,
    operationId: request.operationId,
    turnId: request.turnId,
    requestDigest: sha256Value({ request, cortexId }),
    parentTurnReceiptDigest: parent?.receiptDigest ?? zeroDigest,
    transportDescriptorDigest: transportBinding.bindingDigest,
    cortexId,
    task: task ? clone(task) : null,
  });
}

function assertExistingOpening(evidence, expected) {
  const actualWithoutTransport = {
    operation: evidence.identity.operation,
    operationId: evidence.identity.operationId,
    turnId: evidence.identity.turnId,
    requestDigest: evidence.identity.requestDigest,
    parentTurnReceiptDigest: evidence.identity.parentTurnReceiptDigest,
    cortexId: evidence.identity.cortexId,
    task: evidence.identity.task,
  };
  const expectedWithoutTransport = {
    operation: expected.operation,
    operationId: expected.operationId,
    turnId: expected.turnId,
    requestDigest: expected.requestDigest,
    parentTurnReceiptDigest: expected.parentTurnReceiptDigest,
    cortexId: expected.cortexId,
    task: expected.task,
  };
  if (!same(actualWithoutTransport, expectedWithoutTransport)) {
    fail('operation-id-collision', 'turn operation id was already opened with different input');
  }
}

function terminalResult(evidence) {
  if (!evidence.terminal) return null;
  if (evidence.terminal.status === 'cancelled') {
    fail('task-cancelled', 'the suspended task reservation is cancelled');
  }
  if (evidence.terminal.status === 'quarantined') {
    fail('turn-quarantined', 'the recoverable turn is quarantined');
  }
  if (evidence.terminal.status !== 'accepted') {
    throw new IntegrityError('recoverable turn journal terminal state is unsupported');
  }
  const receipt = verifyAnyCodexBoundTurnReceipt(evidence.terminal.hostReceipt);
  const attempt = evidence.attempts.find((candidate) => candidate.attemptId === evidence.terminal.attemptId);
  if (!attempt?.transport || typeof attempt.responseText !== 'string') {
    throw new IntegrityError('accepted recoverable turn lacks exact response evidence');
  }
  return deepFreeze({ task: clone(evidence.task), responseText: attempt.responseText, receipt });
}

function assertReservationMatches(receipt, intent, instructionChannel) {
  if (receipt.status !== 'reserved'
      || receipt.operationId !== intent.operationId
      || receipt.requestDigest !== intent.requestDigest
      || receipt.transportDescriptorDigest !== intent.transportDescriptorDigest
      || receipt.instructionChannel !== instructionChannel) {
    throw new IntegrityError('task reservation does not match the recoverable turn intent');
  }
  return receipt;
}

function reservationReconciliation(value, intent, instructionChannel) {
  if (value?.status === 'absent') {
    exactKeys(value, ['status'], 'task reservation reconciliation');
    return deepFreeze({ status: 'absent' });
  }
  if (value?.status === 'reserved') {
    exactKeys(value, ['status', 'receipt'], 'task reservation reconciliation');
    const receipt = assertReservationMatches(
      verifyCodexTaskReservationReceipt(value.receipt),
      intent,
      instructionChannel,
    );
    return deepFreeze({ status: 'reserved', receipt });
  }
  if (value?.status === 'cancelled') {
    exactKeys(value, ['status', 'reservationReceipt', 'cancellationReceipt'],
      'task reservation reconciliation');
    const reserved = assertReservationMatches(
      verifyCodexTaskReservationReceipt(value.reservationReceipt),
      intent,
      instructionChannel,
    );
    const cancelled = verifyCodexTaskReservationReceipt(value.cancellationReceipt);
    if (cancelled.status !== 'cancelled'
        || cancelled.operationId !== reserved.operationId
        || cancelled.requestDigest !== reserved.requestDigest
        || cancelled.transportDescriptorDigest !== reserved.transportDescriptorDigest
        || !same(cancelled.task, reserved.task)
        || cancelled.instructionChannel !== reserved.instructionChannel
        || cancelled.parentReceiptDigest !== reserved.receiptDigest
        || cancelled.reasonDigest === zeroDigest) {
      throw new IntegrityError('task cancellation does not match the recoverable reservation');
    }
    return deepFreeze({ status: 'cancelled', reservationReceipt: reserved, cancellationReceipt: cancelled });
  }
  throw new IntegrityError('task reservation reconciliation is ambiguous or unsupported');
}

function completedTransport(value, dispatch, { reconciled = false } = {}) {
  const expectedKeys = reconciled
    ? ['status', 'responseText', 'receipt', 'executionReceipt']
    : ['responseText', 'receipt', 'executionReceipt'];
  exactKeys(value, expectedKeys, 'recoverable task transport completion');
  if (reconciled && value.status !== 'completed') {
    throw new IntegrityError('task dispatch reconciliation is ambiguous or unsupported');
  }
  const transport = verifyCodexTaskTransportResult({
    responseText: value.responseText,
    receipt: value.receipt,
  }, dispatch);
  const executionReceipt = verifyCodexTaskExecutionReceipt(value.executionReceipt);
  if (executionReceipt.dispatchDigest !== sha256Value(dispatch)
      || executionReceipt.transportReceiptDigest !== transport.receipt.receiptDigest
      || executionReceipt.responseBytes !== transport.receipt.responseBytes
      || executionReceipt.responseDigest !== transport.receipt.responseDigest) {
    throw new IntegrityError('task execution receipt does not match the recoverable dispatch');
  }
  return deepFreeze({
    responseText: transport.responseText,
    transportReceipt: transport.receipt,
    executionReceipt,
  });
}

function bindingInspection(value) {
  exactKeys(value, ['status', 'receipt'], 'binding inspection');
  if (value.status === 'active') {
    const receipt = verifyCortexBindingReceipt(value.receipt);
    return deepFreeze({ status: 'active', receipt });
  }
  if (value.status === 'terminal') {
    const receipt = verifyCortexBindingLifecycleReceipt(value.receipt);
    return deepFreeze({ status: 'terminal', receipt });
  }
  throw new IntegrityError('binding inspection status is unsupported');
}

function dispatchReconciliation(value, dispatch) {
  if (value?.status === 'absent') {
    exactKeys(value, ['status'], 'task dispatch reconciliation');
    return deepFreeze({ status: 'absent' });
  }
  if (value?.status === 'completed') {
    return deepFreeze({ status: 'completed', completion: completedTransport(value, dispatch, { reconciled: true }) });
  }
  throw new IntegrityError('task dispatch reconciliation is ambiguous or unsupported');
}

function assertTransportInterface(taskTransport, { requireReservation }) {
  if (!taskTransport || typeof taskTransport !== 'object' || Array.isArray(taskTransport)) {
    throw new TypeError('recoverable task transport is required');
  }
  for (const method of ['descriptor', 'recoveryDescriptor', 'reconcileTurn', 'dispatchTurn']) {
    if (typeof taskTransport[method] !== 'function') {
      throw new TypeError(`recoverable task transport ${method} is required`);
    }
  }
  if (requireReservation) {
    for (const method of ['reconcileReservation', 'reserveTask', 'cancelReservation']) {
      if (typeof taskTransport[method] !== 'function') {
        throw new TypeError(`recoverable task transport ${method} is required`);
      }
    }
  }
}

export function createRecoverableCodexTurnCoordinator({
  taskTransport,
  registryRoot = defaultCortexBindingRegistryRoot(),
  instanceRegistryRoot = defaultLocalInstanceRegistryRoot(),
  journalRoot = defaultCodexTurnJournalRoot(),
  leaseDurationMs,
  clock = Date.now,
  leaseCredential,
  writerLockOptions = {},
  journalLockOptions = {},
  bindingAccess = {
    acquire: acquireCortexBinding,
    inspectById: inspectCortexBindingById,
  },
  checkpoint = async () => {},
} = {}) {
  if (typeof registryRoot !== 'string' || typeof instanceRegistryRoot !== 'string'
      || typeof journalRoot !== 'string') {
    throw new TypeError('recoverable turn roots are invalid');
  }
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 86_400_000) {
    throw new TypeError('recoverable turn lease duration is invalid');
  }
  if (typeof clock !== 'function' || typeof checkpoint !== 'function') {
    throw new TypeError('recoverable turn clock and checkpoint must be functions');
  }
  if (!bindingAccess || typeof bindingAccess !== 'object'
      || typeof bindingAccess.acquire !== 'function'
      || typeof bindingAccess.inspectById !== 'function') {
    throw new TypeError('recoverable binding access is incomplete');
  }
  const resolvedRegistryRoot = resolve(registryRoot);
  const resolvedInstanceRegistryRoot = resolve(instanceRegistryRoot);
  const journal = createCodexTurnJournal({
    journalRoot: resolve(journalRoot),
    clock,
    lockOptions: journalLockOptions,
  });
  const liveHandles = new Map();

  async function transportBinding(requireReservation) {
    assertTransportInterface(taskTransport, { requireReservation });
    const binding = buildCodexRecoverableTransportBinding({
      taskControl: await taskTransport.descriptor(),
      recovery: await taskTransport.recoveryDescriptor(),
    });
    if (requireReservation && binding.taskControl.suspendedReservation !== true) {
      throw new IntegrityError('recoverable task transport lacks suspended reservation');
    }
    return binding;
  }

  async function hit(name, operationId) {
    await checkpoint(name, deepFreeze({ operationId }));
  }

  async function openOperation({ operation, request, task, parent, cortexId }) {
    const skeletal = {
      operation,
      operationId: request.operationId,
      turnId: request.turnId,
      requestDigest: sha256Value({ request, cortexId }),
      parentTurnReceiptDigest: parent?.receiptDigest ?? zeroDigest,
      cortexId,
      task: task ? clone(task) : null,
    };
    let handle = await journal.openExisting(request.operationId);
    if (handle) {
      const evidence = await handle.recoverEvidence();
      assertExistingOpening(evidence, skeletal);
      const terminal = terminalResult(evidence);
      if (terminal) return { handle, evidence, terminal, binding: null };
      const binding = await transportBinding(operation === 'create');
      if (binding.taskControl.hostAdapterId !== request.hostAdapterId
          || evidence.identity.transportDescriptorDigest !== binding.bindingDigest) {
        throw new IntegrityError('recoverable transport binding does not match the open turn');
      }
      return { handle, evidence, terminal: null, binding };
    }

    const binding = await transportBinding(operation === 'create');
    if (binding.taskControl.hostAdapterId !== request.hostAdapterId) {
      throw new IntegrityError('task transport descriptor host adapter does not match the request');
    }
    const opening = expectedOpening({ operation, request, task, parent, cortexId, transportBinding: binding });
    handle = await journal.open(opening);
    return { handle, evidence: await handle.recoverEvidence(), terminal: null, binding };
  }

  async function reserveCreateTask(handle, evidence, request, cortexId, binding) {
    if (evidence.task) return evidence;
    const intent = deepFreeze({
      schemaVersion: 1,
      protocolId,
      operationId: request.operationId,
      requestDigest: sha256Value({ request, cortexId }),
      transportDescriptorDigest: binding.bindingDigest,
      hostAdapterId: request.hostAdapterId,
      cortexId,
    });
    const reconciled = reservationReconciliation(
      await taskTransport.reconcileReservation(intent),
      intent,
      binding.taskControl.instructionChannel,
    );
    if (reconciled.status === 'cancelled') {
      await handle.recordReservation(reconciled.reservationReceipt);
      await handle.cancel({ cancellationReceipt: reconciled.cancellationReceipt });
      fail('task-cancelled', 'the suspended task reservation is cancelled');
    }
    let receipt = reconciled.receipt;
    if (reconciled.status === 'absent') {
      receipt = assertReservationMatches(
        verifyCodexTaskReservationReceipt(await taskTransport.reserveTask(intent)),
        intent,
        binding.taskControl.instructionChannel,
      );
      await hit('after-reservation', request.operationId);
    }
    await handle.recordReservation(receipt);
    return handle.recoverEvidence();
  }

  async function prepareAttempt({ handle, evidence, admission, request, parent, cortexId, binding }) {
    const task = taskValue(evidence.task);
    const phaseOneRequest = buildCodexBindingRequest({ task, request });
    const bindingHandle = await bindingAccess.acquire({
      registryRoot: resolvedRegistryRoot,
      instanceRegistryRoot: resolvedInstanceRegistryRoot,
      admission,
      request: phaseOneRequest,
      leaseDurationMs,
      clock,
      ...(leaseCredential === undefined ? {} : { leaseCredential }),
      writerLockOptions,
    });
    if (!bindingHandle || typeof bindingHandle !== 'object' || typeof bindingHandle.release !== 'function') {
      throw new IntegrityError('binding acquisition did not return a releasable handle');
    }
    const activeReceipt = verifyCortexBindingReceipt(bindingHandle.receipt);
    let dispatch;
    try {
      if (parent) assertActorContinuation(parent, activeReceipt);
      const candidate = verifyCortexBindingCandidate(
        await compileCortexBindingCandidate({ admission, request: phaseOneRequest }),
      );
      assertCandidateMatchesReceipt(candidate, activeReceipt);
      const envelope = buildCodexBoundTurnEnvelope({
        operation: evidence.identity.operation,
        request,
        parentTurnReceiptDigest: parent?.receiptDigest ?? zeroDigest,
        transportDescriptorDigest: binding.bindingDigest,
        activeReceipt,
        candidate,
      });
      dispatch = verifyCodexTaskDispatch({
        schemaVersion: 1,
        protocolId: 'eternities-codex-task-control-v1',
        operation: evidence.identity.operation,
        operationId: request.operationId,
        turnId: request.turnId,
        task,
        instructionChannel: binding.taskControl.instructionChannel,
        bindingReceiptDigest: activeReceipt.receiptDigest,
        envelope,
        envelopeDigest: envelope.envelopeDigest,
        cortexId,
        maxResponseBytes: request.maxResponseBytes,
      });
    } catch (error) {
      try { await bindingHandle.release(); } catch { /* preserve the primary failure */ }
      throw error;
    }
    liveHandles.set(activeReceipt.bindingId, bindingHandle);
    await hit('after-binding-acquired', request.operationId);
    let attempt;
    try {
      attempt = await handle.prepareAttempt({ activeReceipt, dispatch });
    } catch (error) {
      liveHandles.delete(activeReceipt.bindingId);
      try { await bindingHandle.release(); } catch { /* preserve the primary failure */ }
      throw error;
    }
    await hit('after-attempt-prepared', request.operationId);
    return { attempt, activeReceipt, dispatch };
  }

  async function quarantine(handle, reason) {
    const reasonDigest = sha256Value({ schemaVersion: 1, protocolId, reason });
    await handle.quarantine({ reasonDigest });
    fail('turn-quarantined', 'the recoverable turn is quarantined');
  }

  async function execute(operation, input = {}) {
    if (!operations.has(operation)) throw new IntegrityError('recoverable turn operation is invalid');
    const request = verifyCodexBoundTurnRequest(input.request);
    requireIdentifier(input.cortexId, 'recoverable turn cortex id');
    const task = operation === 'create' ? null : taskValue(input.task);
    const parent = operation === 'create' ? null : assertParent(input.parentReceipt, task, request);
    const opened = await openOperation({ operation, request, task, parent, cortexId: input.cortexId });
    if (opened.terminal) return opened.terminal;
    const { handle, binding } = opened;
    let evidence = opened.evidence;
    if (operation === 'create') {
      evidence = await reserveCreateTask(handle, evidence, request, input.cortexId, binding);
    }
    const createdAttemptIds = new Set();
    let reconciledCompletion = false;

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const terminal = terminalResult(evidence);
      if (terminal) return terminal;
      let current = evidence.attempts.at(-1) ?? null;
      if (!current || current.abandoned) {
        const prepared = await prepareAttempt({
          handle,
          evidence,
          admission: input.admission,
          request,
          parent,
          cortexId: input.cortexId,
          binding,
        });
        createdAttemptIds.add(prepared.attempt.attemptId);
        evidence = await handle.recoverEvidence();
        current = evidence.attempts.at(-1);
      }

      if (!current.transport) {
        const reconciled = dispatchReconciliation(
          await taskTransport.reconcileTurn(current.dispatch),
          current.dispatch,
        );
        if (reconciled.status === 'completed') {
          reconciledCompletion = true;
          await handle.recordTransport({
            attemptId: current.attemptId,
            ...reconciled.completion,
          });
          await hit('after-transport-recorded', request.operationId);
          evidence = await handle.recoverEvidence();
          current = evidence.attempts.at(-1);
        } else {
          const bindingHandle = liveHandles.get(current.activeReceipt.bindingId);
          if (bindingHandle) {
            const completion = completedTransport(
              await taskTransport.dispatchTurn(current.dispatch),
              current.dispatch,
            );
            await hit('after-dispatch-completed', request.operationId);
            await handle.recordTransport({ attemptId: current.attemptId, ...completion });
            await hit('after-transport-recorded', request.operationId);
            evidence = await handle.recoverEvidence();
            current = evidence.attempts.at(-1);
          } else {
            const bindingState = bindingInspection(await bindingAccess.inspectById({
              registryRoot: resolvedRegistryRoot,
              bindingId: current.activeReceipt.bindingId,
              clock,
            }));
            if (bindingState.status === 'active') {
              fail('binding-pending', 'the orphan binding is still active');
            }
            const lifecycleReceipt = verifyCortexBindingLifecycleReceipt(bindingState.receipt);
            await handle.closeBinding({ attemptId: current.attemptId, lifecycleReceipt });
            if (lifecycleReceipt.status === 'revoked') {
              await quarantine(handle, 'revoked-undispatched-binding');
            }
            await handle.abandonAttempt({
              attemptId: current.attemptId,
              reasonDigest: sha256Value({
                schemaVersion: 1,
                protocolId,
                reason: 'terminal-undispatched-binding',
                bindingId: current.activeReceipt.bindingId,
                lifecycleStatus: lifecycleReceipt.status,
              }),
            });
            evidence = await handle.recoverEvidence();
            continue;
          }
        }
      }

      current = (await handle.recoverEvidence()).attempts.at(-1);
      if (!current.lifecycleReceipt) {
        const bindingHandle = liveHandles.get(current.activeReceipt.bindingId);
        let lifecycleReceipt;
        if (bindingHandle) {
          lifecycleReceipt = verifyCortexBindingLifecycleReceipt(await bindingHandle.release());
          liveHandles.delete(current.activeReceipt.bindingId);
        } else {
          const bindingState = bindingInspection(await bindingAccess.inspectById({
            registryRoot: resolvedRegistryRoot,
            bindingId: current.activeReceipt.bindingId,
            clock,
          }));
          if (bindingState.status === 'active') {
            fail('binding-pending', 'the completed orphan binding is still active');
          }
          lifecycleReceipt = verifyCortexBindingLifecycleReceipt(bindingState.receipt);
        }
        await handle.closeBinding({ attemptId: current.attemptId, lifecycleReceipt });
        await hit('after-binding-closed', request.operationId);
      }

      evidence = await handle.recoverEvidence();
      current = evidence.attempts.at(-1);
      if (current.lifecycleReceipt.status === 'revoked') {
        await quarantine(handle, 'revoked-completed-binding');
      }
      if (!new Set(['released', 'expired']).has(current.lifecycleReceipt.status)) {
        throw new IntegrityError('completed binding lifecycle is unsupported');
      }
      const recoveredAfterInterruption = current.lifecycleReceipt.status === 'expired'
        || !createdAttemptIds.has(current.attemptId)
        || reconciledCompletion;
      const hostReceipt = buildRecoverableCodexBoundTurnReceipt({
        transactionId: evidence.transactionId,
        preAcceptanceJournalHeadDigest: evidence.headDigest,
        reservationReceiptDigest: evidence.reservation?.receiptDigest ?? zeroDigest,
        activeReceipt: current.activeReceipt,
        lifecycleReceipt: current.lifecycleReceipt,
        dispatch: current.dispatch,
        transportReceipt: current.transport.transportReceipt,
        executionReceipt: current.transport.executionReceipt,
        responseText: current.responseText,
        recoveredAfterInterruption,
      });
      await handle.accept({ attemptId: current.attemptId, hostReceipt });
      await hit('after-accepted', request.operationId);
      const finalEvidence = await handle.recoverEvidence();
      return terminalResult(finalEvidence);
    }
    fail('recovery-cycle-limit', 'recoverable turn exceeded its bounded recovery cycle');
  }

  return Object.freeze({
    create(input) { return execute('create', input); },
    continue(input) { return execute('continue', input); },
    resumeAfterCompaction(input) { return execute('compaction-resume', input); },
  });
}
