import { mkdir, readFile, stat } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import { publishFileExclusive, replaceFileAtomically } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import {
  verifyCodexTaskDispatch,
  verifyCodexTaskReservationReceipt,
  verifyCodexTaskTransportReceipt,
  verifyCodexTaskTransportResult,
} from './codex-bound-turn.mjs';
import { verifyCodexTaskExecutionReceipt } from './codex-task-execution.mjs';
import { verifyAnyCodexBoundTurnReceipt } from './codex-recoverable-turn-contracts.mjs';
import {
  verifyCortexBindingLifecycleReceipt,
  verifyCortexBindingReceipt,
} from './cortex-binding-registry.mjs';

const protocolId = 'eternities-godagent-codex-turn-journal-v1';
const zeroDigest = '0'.repeat(64);
const digestPattern = /^[a-f0-9]{64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const operations = new Set(['create', 'continue', 'compaction-resume']);
const eventTypes = new Set([
  'turn.opened',
  'task.reserved',
  'attempt.prepared',
  'transport.completed',
  'binding.closed',
  'attempt.abandoned',
  'task.cancelled',
  'turn.accepted',
  'turn.quarantined',
]);
const maximumJournalBytes = 8 * 1024 * 1024;
const maximumResponseBytes = 4 * 1024 * 1024;
const maximumEvents = 256;
const clone = (value) => structuredClone(value);
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

export class CodexTurnJournalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CodexTurnJournalError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CodexTurnJournalError(code, message);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntegrityError(`${label} must be an object`);
  }
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new IntegrityError(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (!digestPattern.test(value ?? '')) throw new IntegrityError(`${label} is invalid`);
}

function requireIdentifier(value, label) {
  if (!identifierPattern.test(value ?? '') || value === '.' || value === '..') {
    throw new IntegrityError(`${label} is invalid`);
  }
}

function parseTime(value, label) {
  const milliseconds = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(milliseconds)
      || new Date(milliseconds).toISOString() !== value) {
    throw new IntegrityError(`${label} is invalid`);
  }
  return milliseconds;
}

function clockValue(clock) {
  const value = Number(clock());
  if (!Number.isFinite(value)) throw new TypeError('turn journal clock is invalid');
  return value;
}

function taskValue(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  exactKeys(value, ['taskId', 'hostId'], 'Codex task');
  requireIdentifier(value.taskId, 'Codex task id');
  requireIdentifier(value.hostId, 'Codex host id');
  return deepFreeze(clone(value));
}

function openingValue(value) {
  exactKeys(value, [
    'operation', 'operationId', 'turnId', 'requestDigest', 'parentTurnReceiptDigest',
    'transportDescriptorDigest', 'cortexId', 'task',
  ], 'turn journal opening');
  if (!operations.has(value.operation)) throw new IntegrityError('turn journal operation is invalid');
  requireIdentifier(value.operationId, 'turn journal operation id');
  requireIdentifier(value.turnId, 'turn journal turn id');
  requireIdentifier(value.cortexId, 'turn journal cortex id');
  requireDigest(value.requestDigest, 'turn journal request digest');
  requireDigest(value.parentTurnReceiptDigest, 'turn journal parent receipt digest');
  requireDigest(value.transportDescriptorDigest, 'turn journal transport descriptor digest');
  const task = taskValue(value.task, { nullable: true });
  if (value.operation === 'create') {
    if (task !== null || value.parentTurnReceiptDigest !== zeroDigest) {
      throw new IntegrityError('create journal opening must not preclaim a task or parent');
    }
  } else if (task === null || value.parentTurnReceiptDigest === zeroDigest) {
    throw new IntegrityError('existing-task journal opening requires task and parent');
  }
  return deepFreeze({ ...clone(value), task });
}

function transactionIdFor(identity) {
  return sha256Value({ schemaVersion: 1, protocolId, identity });
}

function operationSlotIdFor(operationId) {
  return sha256Value({ schemaVersion: 1, protocolId, operationId });
}

function eventValue({ events, transactionId, eventType, recordedAt, payload }) {
  if (!eventTypes.has(eventType)) throw new IntegrityError('turn journal event type is invalid');
  if (events.length >= maximumEvents) throw new IntegrityError('turn journal event ceiling exceeded');
  const unsigned = {
    schemaVersion: 1,
    sequence: events.length + 1,
    previousDigest: events.at(-1)?.contentDigest ?? zeroDigest,
    eventType,
    transactionId,
    recordedAt,
    payload: clone(payload),
  };
  const event = { ...unsigned, contentDigest: sha256Value(unsigned) };
  assertSchema('codex-turn-journal-event', event);
  return event;
}

function stateValue({ transactionId, operationSlotId, events }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    transactionId,
    operationSlotId,
    events: clone(events),
    headDigest: events.at(-1)?.contentDigest ?? zeroDigest,
  };
  const state = { ...unsigned, stateDigest: sha256Value(unsigned) };
  assertSchema('codex-turn-journal-state', state);
  return state;
}

function attemptIdFor(transactionId, ordinal, activeReceipt, dispatch) {
  return sha256Value({
    schemaVersion: 1,
    protocolId,
    transactionId,
    ordinal,
    activeReceiptDigest: activeReceipt.receiptDigest,
    dispatchDigest: sha256Value(dispatch),
  });
}

function same(first, second) {
  return canonicalJson(first) === canonicalJson(second);
}

function assertDispatchLinks(identity, task, activeReceipt, dispatch, reservation = null) {
  const createdAt = parseTime(activeReceipt.createdAt, 'active binding createdAt');
  const verifiedAt = parseTime(activeReceipt.lastVerifiedAt, 'active binding lastVerifiedAt');
  const issuedAt = parseTime(activeReceipt.lease.issuedAt, 'active binding issuedAt');
  const expiresAt = parseTime(activeReceipt.lease.expiresAt, 'active binding expiresAt');
  if (createdAt !== issuedAt || verifiedAt < issuedAt || verifiedAt > expiresAt || expiresAt <= issuedAt) {
    throw new IntegrityError('turn journal active binding lease times are invalid');
  }
  requireDigest(activeReceipt.registryEventDigest, 'active binding registry event digest');
  const binding = dispatch.envelope.binding;
  if (dispatch.operation !== identity.operation
      || dispatch.operationId !== identity.operationId
      || dispatch.turnId !== identity.turnId
      || dispatch.cortexId !== identity.cortexId
      || !same(dispatch.task, task)
      || dispatch.bindingReceiptDigest !== activeReceipt.receiptDigest
      || binding.bindingReceiptDigest !== activeReceipt.receiptDigest
      || binding.bindingId !== activeReceipt.bindingId
      || binding.bindingCandidateId !== activeReceipt.bindingCandidateId
      || binding.bindingCandidateDigest !== activeReceipt.bindingCandidateDigest
      || binding.identityDigest !== activeReceipt.identityDigest
      || binding.instanceId !== activeReceipt.instanceId
      || binding.genesisId !== activeReceipt.genesisId
      || binding.genomeDigest !== activeReceipt.genomeDigest
      || binding.distributionDigest !== activeReceipt.distributionDigest
      || binding.realmContractDigest !== activeReceipt.realmContractDigest
      || binding.keelId !== activeReceipt.keelId
      || binding.keelHeadDigest !== activeReceipt.keelHeadDigest
      || binding.taskId !== activeReceipt.taskId
      || binding.hostAdapterId !== activeReceipt.hostAdapterId
      || binding.revocationEpoch !== activeReceipt.revocationEpoch
      || binding.leaseId !== activeReceipt.lease.leaseId
      || binding.expiresAt !== activeReceipt.lease.expiresAt
      || dispatch.envelope.parentTurnReceiptDigest !== identity.parentTurnReceiptDigest
      || dispatch.envelope.transportDescriptorDigest !== identity.transportDescriptorDigest) {
    throw new IntegrityError('turn journal dispatch does not match opening and active binding');
  }
  if (reservation && reservation.instructionChannel !== dispatch.instructionChannel) {
    throw new IntegrityError('turn journal dispatch channel does not match the reservation');
  }
  if (activeReceipt.taskId !== task.taskId
      || activeReceipt.hostAdapterId !== dispatch.envelope.binding.hostAdapterId) {
    throw new IntegrityError('turn journal active binding does not match task');
  }
}

function assertReservationLinks(identity, receipt) {
  if (receipt.status !== 'reserved'
      || receipt.operationId !== identity.operationId
      || receipt.requestDigest !== identity.requestDigest
      || receipt.transportDescriptorDigest !== identity.transportDescriptorDigest) {
    throw new IntegrityError('task reservation does not match turn journal opening');
  }
}

function assertCancellationLinks(projection, receipt) {
  if (receipt.status !== 'cancelled'
      || receipt.operationId !== projection.identity.operationId
      || receipt.parentReceiptDigest !== projection.reservation.receiptDigest
      || receipt.requestDigest !== projection.identity.requestDigest
      || receipt.transportDescriptorDigest !== projection.identity.transportDescriptorDigest
      || !same(receipt.task, projection.task)) {
    throw new IntegrityError('task cancellation does not match the reservation');
  }
}

function assertTransportLinks(attempt, transportReceipt, executionReceipt) {
  const dispatchDigest = sha256Value(attempt.dispatch);
  if (transportReceipt.operation !== attempt.dispatch.operation
      || transportReceipt.operationId !== attempt.dispatch.operationId
      || transportReceipt.turnId !== attempt.dispatch.turnId
      || !same(transportReceipt.task, attempt.dispatch.task)
      || transportReceipt.instructionChannel !== attempt.dispatch.instructionChannel
      || transportReceipt.bindingReceiptDigest !== attempt.dispatch.bindingReceiptDigest
      || transportReceipt.envelopeDigest !== attempt.dispatch.envelopeDigest
      || transportReceipt.cortexId !== attempt.dispatch.cortexId
      || executionReceipt.dispatchDigest !== dispatchDigest
      || executionReceipt.transportReceiptDigest !== transportReceipt.receiptDigest
      || executionReceipt.responseBytes !== transportReceipt.responseBytes
      || executionReceipt.responseDigest !== transportReceipt.responseDigest) {
    throw new IntegrityError('task execution witness does not match transport completion');
  }
  const issuedAt = parseTime(attempt.activeReceipt.lease.issuedAt, 'binding lease issuedAt');
  const expiresAt = parseTime(attempt.activeReceipt.lease.expiresAt, 'binding lease expiresAt');
  const startedAt = parseTime(executionReceipt.startedAt, 'task execution startedAt');
  const completedAt = parseTime(executionReceipt.completedAt, 'task execution completedAt');
  if (startedAt < issuedAt || completedAt > expiresAt) {
    throw new IntegrityError('task execution exceeds the binding lease expiry');
  }
}

function assertLifecycleLinks(attempt, lifecycleReceipt) {
  const active = attempt.activeReceipt;
  requireDigest(lifecycleReceipt.registryEventDigest, 'binding lifecycle registry event digest');
  const expectedEpoch = lifecycleReceipt.status === 'revoked'
    ? active.revocationEpoch + 1
    : active.revocationEpoch;
  const recordedAt = parseTime(lifecycleReceipt.recordedAt, 'binding lifecycle recordedAt');
  const issuedAt = parseTime(active.lease.issuedAt, 'active binding issuedAt');
  const expiresAt = parseTime(active.lease.expiresAt, 'active binding expiresAt');
  if (lifecycleReceipt.bindingId !== active.bindingId
      || lifecycleReceipt.instanceId !== active.instanceId
      || lifecycleReceipt.taskId !== active.taskId
      || lifecycleReceipt.revocationEpoch !== expectedEpoch
      || recordedAt < issuedAt
      || (lifecycleReceipt.status === 'expired' && recordedAt < expiresAt)
      || (lifecycleReceipt.status !== 'expired' && recordedAt >= expiresAt)
      || (attempt.transport
        && recordedAt < parseTime(
          attempt.transport.executionReceipt.completedAt,
          'task execution completedAt',
        ))) {
    throw new IntegrityError('binding lifecycle receipt does not match the journal attempt');
  }
}

function assertHostReceiptLinks(projection, attempt, hostReceipt, preAcceptanceJournalHeadDigest) {
  const { identity, reservation, task } = projection;
  const transport = attempt.transport.transportReceipt;
  const lifecycle = attempt.lifecycleReceipt;
  const dispatch = attempt.dispatch;
  if (hostReceipt.operation !== identity.operation
      || hostReceipt.operationId !== identity.operationId
      || hostReceipt.turnId !== identity.turnId
      || hostReceipt.parentTurnReceiptDigest !== identity.parentTurnReceiptDigest
      || hostReceipt.reservationReceiptDigest !== (reservation?.receiptDigest ?? zeroDigest)
      || hostReceipt.transportDescriptorDigest !== identity.transportDescriptorDigest
      || hostReceipt.instructionChannel !== dispatch.instructionChannel
      || hostReceipt.cortexId !== identity.cortexId
      || hostReceipt.task.taskId !== task.taskId
      || hostReceipt.task.hostId !== task.hostId
      || hostReceipt.task.hostAdapterId !== attempt.activeReceipt.hostAdapterId
      || hostReceipt.actor.instanceId !== attempt.activeReceipt.instanceId
      || hostReceipt.actor.genesisId !== attempt.activeReceipt.genesisId
      || hostReceipt.actor.identityDigest !== attempt.activeReceipt.identityDigest
      || hostReceipt.actor.genomeDigest !== attempt.activeReceipt.genomeDigest
      || hostReceipt.actor.distributionDigest !== attempt.activeReceipt.distributionDigest
      || hostReceipt.actor.keelId !== attempt.activeReceipt.keelId
      || hostReceipt.actor.keelHeadDigest !== attempt.activeReceipt.keelHeadDigest
      || hostReceipt.binding.bindingId !== attempt.activeReceipt.bindingId
      || hostReceipt.binding.bindingCandidateId !== attempt.activeReceipt.bindingCandidateId
      || hostReceipt.binding.bindingCandidateDigest !== attempt.activeReceipt.bindingCandidateDigest
      || hostReceipt.binding.activeReceiptDigest !== attempt.activeReceipt.receiptDigest
      || hostReceipt.binding.lifecycleReceiptDigest !== lifecycle.receiptDigest
      || hostReceipt.binding.lifecycleStatus !== lifecycle.status
      || hostReceipt.envelopeDigest !== dispatch.envelopeDigest
      || hostReceipt.modelProjectionDigest !== dispatch.envelope.modelProjectionDigest
      || hostReceipt.transportReceiptDigest !== transport.receiptDigest
      || hostReceipt.responseBytes !== transport.responseBytes
      || hostReceipt.responseDigest !== transport.responseDigest) {
    throw new IntegrityError('bound-turn host receipt does not match journal evidence');
  }
  if (hostReceipt.protocolId === 'eternities-godagent-codex-recoverable-bound-turn-v1'
      && (hostReceipt.recovery.transactionId !== projection.transactionId
        || hostReceipt.recovery.preAcceptanceJournalHeadDigest !== preAcceptanceJournalHeadDigest
        || hostReceipt.recovery.executionReceiptDigest
          !== attempt.transport.executionReceipt.receiptDigest)) {
    throw new IntegrityError('recoverable host receipt does not match journal recovery evidence');
  }
}

function emptyProjection(identity, transactionId) {
  return {
    transactionId,
    identity,
    task: identity.task,
    reservation: null,
    attempts: [],
    terminal: null,
  };
}

function validateOpened(event, state) {
  exactKeys(event.payload, [
    'operation', 'operationId', 'turnId', 'requestDigest', 'parentTurnReceiptDigest',
    'transportDescriptorDigest', 'cortexId', 'task',
  ], 'turn.opened payload');
  const identity = openingValue(event.payload);
  const transactionId = transactionIdFor(identity);
  if (event.transactionId !== transactionId || state.transactionId !== transactionId) {
    throw new IntegrityError('turn journal transaction id mismatch');
  }
  if (state.operationSlotId !== operationSlotIdFor(identity.operationId)) {
    throw new IntegrityError('turn journal operation slot mismatch');
  }
  return emptyProjection(identity, transactionId);
}

function replayEvent(projection, event) {
  if (projection.terminal) throw new IntegrityError('turn journal contains events after terminal outcome');
  const current = projection.attempts.at(-1) ?? null;
  if (event.eventType === 'task.reserved') {
    exactKeys(event.payload, ['reservationReceipt'], 'task.reserved payload');
    if (projection.identity.operation !== 'create') {
      throw new IntegrityError('existing task transaction cannot record a reservation');
    }
    if (projection.reservation) throw new IntegrityError('turn journal contains duplicate reservation');
    const receipt = verifyCodexTaskReservationReceipt(event.payload.reservationReceipt);
    assertReservationLinks(projection.identity, receipt);
    projection.reservation = receipt;
    projection.task = receipt.task;
    return;
  }
  if (event.eventType === 'attempt.prepared') {
    exactKeys(event.payload, ['ordinal', 'attemptId', 'activeReceipt', 'dispatch'], 'attempt.prepared payload');
    if (!projection.task) throw new IntegrityError('turn journal attempt requires a task');
    if (current && !current.abandoned) throw new IntegrityError('turn journal already has an open attempt');
    const ordinal = projection.attempts.length + 1;
    if (event.payload.ordinal !== ordinal) throw new IntegrityError('turn journal attempt ordinal mismatch');
    const activeReceipt = verifyCortexBindingReceipt(event.payload.activeReceipt);
    const dispatch = verifyCodexTaskDispatch(event.payload.dispatch);
    assertDispatchLinks(
      projection.identity,
      projection.task,
      activeReceipt,
      dispatch,
      projection.reservation,
    );
    const preparedAt = parseTime(event.recordedAt, 'attempt preparation time');
    if (preparedAt < parseTime(activeReceipt.lease.issuedAt, 'active binding issuedAt')
        || preparedAt > parseTime(activeReceipt.lease.expiresAt, 'active binding expiresAt')) {
      throw new IntegrityError('attempt preparation is outside the active binding lease');
    }
    const attemptId = attemptIdFor(projection.transactionId, ordinal, activeReceipt, dispatch);
    if (event.payload.attemptId !== attemptId) throw new IntegrityError('turn journal attempt id mismatch');
    projection.attempts.push({
      ordinal,
      attemptId,
      activeReceipt,
      dispatch,
      transport: null,
      lifecycleReceipt: null,
      abandoned: null,
    });
    return;
  }
  if (event.eventType === 'transport.completed') {
    exactKeys(event.payload, [
      'attemptId', 'transportReceipt', 'executionReceipt', 'response',
    ], 'transport.completed payload');
    if (!current || current.abandoned || current.transport || current.lifecycleReceipt) {
      throw new IntegrityError('transport completion is invalid for the current attempt');
    }
    if (event.payload.attemptId !== current.attemptId) throw new IntegrityError('transport attempt id mismatch');
    exactKeys(event.payload.response, ['bytes', 'digest'], 'transport response reference');
    const transportReceipt = verifyCodexTaskTransportReceipt(event.payload.transportReceipt);
    const executionReceipt = verifyCodexTaskExecutionReceipt(event.payload.executionReceipt);
    if (event.payload.response.bytes !== transportReceipt.responseBytes
        || event.payload.response.digest !== transportReceipt.responseDigest) {
      throw new IntegrityError('transport response reference does not match receipt');
    }
    assertTransportLinks(current, transportReceipt, executionReceipt);
    if (parseTime(event.recordedAt, 'transport completion event time')
        < parseTime(executionReceipt.completedAt, 'task execution completedAt')) {
      throw new IntegrityError('transport completion was journaled before execution completed');
    }
    current.transport = {
      transportReceipt,
      executionReceipt,
      response: clone(event.payload.response),
    };
    return;
  }
  if (event.eventType === 'binding.closed') {
    exactKeys(event.payload, ['attemptId', 'lifecycleReceipt'], 'binding.closed payload');
    if (!current || current.abandoned || current.lifecycleReceipt) {
      throw new IntegrityError('binding closure is invalid for the current attempt');
    }
    if (event.payload.attemptId !== current.attemptId) throw new IntegrityError('binding closure attempt id mismatch');
    const lifecycleReceipt = verifyCortexBindingLifecycleReceipt(event.payload.lifecycleReceipt);
    assertLifecycleLinks(current, lifecycleReceipt);
    if (parseTime(event.recordedAt, 'binding closure event time')
        < parseTime(lifecycleReceipt.recordedAt, 'binding lifecycle recordedAt')) {
      throw new IntegrityError('binding closure was journaled before lifecycle completion');
    }
    current.lifecycleReceipt = lifecycleReceipt;
    return;
  }
  if (event.eventType === 'attempt.abandoned') {
    exactKeys(event.payload, ['attemptId', 'reasonDigest'], 'attempt.abandoned payload');
    if (!current || current.abandoned) throw new IntegrityError('turn journal has no attempt to abandon');
    if (event.payload.attemptId !== current.attemptId) throw new IntegrityError('abandoned attempt id mismatch');
    requireDigest(event.payload.reasonDigest, 'abandoned attempt reason digest');
    if (!current.lifecycleReceipt) throw new IntegrityError('binding must be closed before attempt abandonment');
    if (current.transport) throw new IntegrityError('attempt with completed transport cannot be abandoned');
    current.abandoned = { reasonDigest: event.payload.reasonDigest };
    return;
  }
  if (event.eventType === 'task.cancelled') {
    exactKeys(event.payload, ['cancellationReceipt'], 'task.cancelled payload');
    if (projection.identity.operation !== 'create' || !projection.reservation || projection.attempts.length > 0) {
      throw new IntegrityError('task cancellation is invalid for this journal');
    }
    const receipt = verifyCodexTaskReservationReceipt(event.payload.cancellationReceipt);
    assertCancellationLinks(projection, receipt);
    projection.terminal = { status: 'cancelled', cancellationReceipt: receipt };
    return;
  }
  if (event.eventType === 'turn.accepted') {
    exactKeys(event.payload, ['attemptId', 'hostReceipt'], 'turn.accepted payload');
    if (!current || current.abandoned || !current.transport || !current.lifecycleReceipt) {
      throw new IntegrityError('turn acceptance lacks complete attempt evidence');
    }
    if (event.payload.attemptId !== current.attemptId) throw new IntegrityError('accepted attempt id mismatch');
    const hostReceipt = verifyAnyCodexBoundTurnReceipt(event.payload.hostReceipt);
    const recoverable = hostReceipt.protocolId
      === 'eternities-godagent-codex-recoverable-bound-turn-v1';
    if (current.lifecycleReceipt.status !== 'released'
        && !(recoverable && current.lifecycleReceipt.status === 'expired')) {
      throw new IntegrityError('turn acceptance requires a released or safely expired binding');
    }
    assertHostReceiptLinks(projection, current, hostReceipt, event.previousDigest);
    projection.terminal = { status: 'accepted', hostReceipt, attemptId: current.attemptId };
    return;
  }
  if (event.eventType === 'turn.quarantined') {
    exactKeys(event.payload, ['reasonDigest'], 'turn.quarantined payload');
    requireDigest(event.payload.reasonDigest, 'turn quarantine reason digest');
    if (current && !current.abandoned && !current.lifecycleReceipt) {
      throw new IntegrityError('binding must be closed before turn quarantine');
    }
    projection.terminal = { status: 'quarantined', reasonDigest: event.payload.reasonDigest };
    return;
  }
  throw new IntegrityError('turn journal event order is invalid');
}

function verifyState(value) {
  assertSchema('codex-turn-journal-state', value);
  const { stateDigest, ...unsignedState } = value;
  if (stateDigest !== sha256Value(unsignedState)) throw new IntegrityError('turn journal state digest mismatch');
  if (value.events.length < 1 || value.events.length > maximumEvents) {
    throw new IntegrityError('turn journal event count is invalid');
  }
  if (value.headDigest !== value.events.at(-1).contentDigest) {
    throw new IntegrityError('turn journal head digest mismatch');
  }
  let previousDigest = zeroDigest;
  let previousTime = -Infinity;
  let projection = null;
  for (let index = 0; index < value.events.length; index += 1) {
    const event = value.events[index];
    assertSchema('codex-turn-journal-event', event);
    if (!eventTypes.has(event.eventType)) throw new IntegrityError('turn journal event type is invalid');
    if (event.sequence !== index + 1 || event.previousDigest !== previousDigest) {
      throw new IntegrityError('turn journal event chain mismatch');
    }
    if (event.transactionId !== value.transactionId) {
      throw new IntegrityError('turn journal event transaction mismatch');
    }
    const { contentDigest, ...unsignedEvent } = event;
    if (contentDigest !== sha256Value(unsignedEvent)) {
      throw new IntegrityError('turn journal event digest mismatch');
    }
    const recordedAt = parseTime(event.recordedAt, 'turn journal event time');
    if (recordedAt < previousTime) throw new IntegrityError('turn journal event time moved backwards');
    if (index === 0) {
      if (event.eventType !== 'turn.opened') throw new IntegrityError('turn journal must begin with turn.opened');
      projection = validateOpened(event, value);
    } else {
      replayEvent(projection, event);
    }
    previousDigest = contentDigest;
    previousTime = recordedAt;
  }
  return { state: value, projection };
}

function nextAction(projection) {
  if (projection.terminal) return 'none';
  if (!projection.task) return 'reserve-task';
  const current = projection.attempts.at(-1) ?? null;
  if (!current || current.abandoned) return 'prepare-attempt';
  if (!current.transport && !current.lifecycleReceipt) return 'reconcile-dispatch';
  if (!current.transport && current.lifecycleReceipt) return 'abandon-attempt';
  if (current.transport && !current.lifecycleReceipt) return 'close-binding';
  if (new Set(['released', 'expired']).has(current.lifecycleReceipt.status)) return 'finalize-turn';
  return 'quarantine';
}

function publicProjection(verified) {
  const { state, projection } = verified;
  const current = projection.attempts.at(-1) ?? null;
  return {
    schemaVersion: 1,
    protocolId,
    transactionId: projection.transactionId,
    operation: projection.identity.operation,
    operationId: projection.identity.operationId,
    turnId: projection.identity.turnId,
    requestDigest: projection.identity.requestDigest,
    parentTurnReceiptDigest: projection.identity.parentTurnReceiptDigest,
    transportDescriptorDigest: projection.identity.transportDescriptorDigest,
    cortexId: projection.identity.cortexId,
    task: clone(projection.task),
    status: projection.terminal?.status ?? (current
      ? (current.abandoned ? 'attempt-abandoned'
        : current.transport
          ? (current.lifecycleReceipt ? 'binding-closed' : 'transport-completed')
          : (current.lifecycleReceipt ? 'binding-closed' : 'attempt-prepared'))
      : (projection.reservation ? 'reserved' : 'opened')),
    nextAction: nextAction(projection),
    eventCount: state.events.length,
    headDigest: state.headDigest,
    reservationReceiptDigest: projection.reservation?.receiptDigest ?? zeroDigest,
    attemptCount: projection.attempts.length,
    activeAttempt: current ? {
      ordinal: current.ordinal,
      attemptId: current.attemptId,
      activeReceiptDigest: current.activeReceipt.receiptDigest,
      dispatchDigest: sha256Value(current.dispatch),
      envelopeDigest: current.dispatch.envelopeDigest,
      transportReceiptDigest: current.transport?.transportReceipt.receiptDigest ?? zeroDigest,
      lifecycleReceiptDigest: current.lifecycleReceipt?.receiptDigest ?? zeroDigest,
      abandoned: current.abandoned !== null,
    } : null,
    hostReceipt: clone(projection.terminal?.hostReceipt ?? null),
  };
}

async function readBoundedText(path, maximumBytes, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (metadata.size > maximumBytes) throw new IntegrityError(`${label} exceeds maximum size`);
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > maximumBytes) {
    throw new IntegrityError(`${label} exceeds maximum size`);
  }
  return text;
}

async function readState(statePath) {
  const text = await readBoundedText(statePath, maximumJournalBytes, 'turn journal');
  if (text === null) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new IntegrityError('turn journal is not valid JSON');
  }
  if (text !== jsonBytes(value)) throw new IntegrityError('turn journal is not canonical');
  return verifyState(value);
}

async function writeAndVerifyState(statePath, state) {
  verifyState(clone(state));
  const content = jsonBytes(state);
  if (Buffer.byteLength(content, 'utf8') > maximumJournalBytes) {
    throw new IntegrityError('turn journal exceeds maximum size');
  }
  await replaceFileAtomically({ destinationPath: statePath, content });
  return readState(statePath);
}

async function readResponseBlob(path, expected) {
  const text = await readBoundedText(path, maximumResponseBytes, 'turn response blob');
  if (text === null) throw new IntegrityError('turn response blob is missing');
  if (Buffer.byteLength(text, 'utf8') !== expected.bytes || sha256Text(text) !== expected.digest) {
    throw new IntegrityError('turn response blob does not match journal evidence');
  }
  return text;
}

export function defaultCodexTurnJournalRoot() {
  const profile = userInfo().homedir;
  if (typeof profile !== 'string' || profile.length === 0 || /[\0\r\n]/.test(profile)) {
    throw new IntegrityError('OS account profile directory is unavailable');
  }
  return join(profile, '.eternities', 'godagents', 'codex-turn-journals');
}

export {
  buildCodexTaskExecutionReceipt,
  verifyCodexTaskExecutionReceipt,
} from './codex-task-execution.mjs';

export function createCodexTurnJournal({
  journalRoot = defaultCodexTurnJournalRoot(),
  clock = Date.now,
  lockOptions = {},
} = {}) {
  if (typeof journalRoot !== 'string' || journalRoot.length === 0 || /[\0\r\n]/.test(journalRoot)) {
    throw new TypeError('turn journal root is invalid');
  }
  if (typeof clock !== 'function') throw new TypeError('turn journal clock is required');
  const root = resolve(journalRoot);

  async function open(inputIdentity) {
    const identity = openingValue(inputIdentity);
    const transactionId = transactionIdFor(identity);
    const operationSlotId = operationSlotIdFor(identity.operationId);
    const transactionDir = join(root, operationSlotId);
    const statePath = join(transactionDir, 'journal.json');
    const lockPath = join(transactionDir, 'journal.lock');
    const responsesDir = join(transactionDir, 'responses');

    async function underLock(operation) {
      await mkdir(transactionDir, { recursive: true });
      const lock = await acquireFileLock({ ...lockOptions, lockPath });
      try {
        return await operation(await readState(statePath));
      } finally {
        await lock.release();
      }
    }

    const opened = await underLock(async (existing) => {
      if (existing) {
        if (existing.projection.transactionId !== transactionId
            || !same(existing.projection.identity, identity)) {
          fail('operation-id-collision', 'turn journal operation id collision');
        }
        return existing;
      }
      const event = eventValue({
        events: [],
        transactionId,
        eventType: 'turn.opened',
        recordedAt: new Date(clockValue(clock)).toISOString(),
        payload: identity,
      });
      return writeAndVerifyState(statePath, stateValue({
        transactionId,
        operationSlotId,
        events: [event],
      }));
    });
    if (!opened) throw new IntegrityError('turn journal failed to open');

    async function mutate(callback) {
      return underLock(async (verified) => {
        if (!verified) throw new IntegrityError('turn journal disappeared');
        if (verified.projection.transactionId !== transactionId
            || !same(verified.projection.identity, identity)) {
          fail('operation-id-collision', 'turn journal operation id collision');
        }
        const result = await callback(verified);
        if (!result?.eventType) return result;
        const events = clone(verified.state.events);
        events.push(eventValue({
          events,
          transactionId,
          eventType: result.eventType,
          recordedAt: new Date(clockValue(clock)).toISOString(),
          payload: result.payload,
        }));
        const next = await writeAndVerifyState(statePath, stateValue({
          transactionId,
          operationSlotId,
          events,
        }));
        return result.project(next);
      });
    }

    async function inspect({ includeResponse = false } = {}) {
      if (typeof includeResponse !== 'boolean') throw new TypeError('includeResponse must be boolean');
      const verified = await readState(statePath);
      if (!verified) throw new IntegrityError('turn journal is missing');
      const result = publicProjection(verified);
      const current = verified.projection.attempts.at(-1) ?? null;
      if ((includeResponse || verified.projection.terminal?.status === 'accepted') && current?.transport) {
        const responsePath = join(responsesDir, `${current.transport.response.digest}.txt`);
        const responseText = await readResponseBlob(responsePath, current.transport.response);
        if (verified.projection.terminal?.status === 'accepted') result.responseText = responseText;
      }
      return deepFreeze(result);
    }

    async function recoverEvidence() {
      const verified = await readState(statePath);
      if (!verified) throw new IntegrityError('turn journal is missing');
      const recovered = {
        transactionId: verified.projection.transactionId,
        identity: clone(verified.projection.identity),
        task: clone(verified.projection.task),
        reservation: clone(verified.projection.reservation),
        attempts: clone(verified.projection.attempts),
        terminal: clone(verified.projection.terminal),
        eventCount: verified.state.events.length,
        headDigest: verified.state.headDigest,
      };
      for (let index = 0; index < recovered.attempts.length; index += 1) {
        const attempt = recovered.attempts[index];
        if (!attempt.transport) continue;
        attempt.responseText = await readResponseBlob(
          join(responsesDir, `${attempt.transport.response.digest}.txt`),
          attempt.transport.response,
        );
      }
      return deepFreeze(recovered);
    }

    async function recordReservation(inputReceipt) {
      const receipt = verifyCodexTaskReservationReceipt(inputReceipt);
      return mutate(async (verified) => {
        const projection = verified.projection;
        if (projection.identity.operation !== 'create') {
          throw new IntegrityError('existing task transaction cannot record a reservation');
        }
        if (projection.reservation) {
          if (!same(projection.reservation, receipt)) throw new IntegrityError('changed task reservation retry');
          return clone(projection.reservation);
        }
        if (projection.terminal || projection.attempts.length > 0) {
          throw new IntegrityError('task reservation is too late');
        }
        assertReservationLinks(projection.identity, receipt);
        return {
          eventType: 'task.reserved',
          payload: { reservationReceipt: receipt },
          project: (next) => clone(next.projection.reservation),
        };
      });
    }

    async function prepareAttempt({ activeReceipt: inputActiveReceipt, dispatch: inputDispatch } = {}) {
      const activeReceipt = verifyCortexBindingReceipt(inputActiveReceipt);
      const dispatch = verifyCodexTaskDispatch(inputDispatch);
      return mutate(async (verified) => {
        const projection = verified.projection;
        const current = projection.attempts.at(-1) ?? null;
        if (current && !current.abandoned) {
          if (same(current.activeReceipt, activeReceipt) && same(current.dispatch, dispatch)) {
            return { ordinal: current.ordinal, attemptId: current.attemptId };
          }
          throw new IntegrityError('turn journal already has an open attempt');
        }
        if (projection.terminal) throw new IntegrityError('turn journal is terminal');
        if (!projection.task) throw new IntegrityError('turn journal attempt requires a task');
        assertDispatchLinks(identity, projection.task, activeReceipt, dispatch, projection.reservation);
        const ordinal = projection.attempts.length + 1;
        const attemptId = attemptIdFor(transactionId, ordinal, activeReceipt, dispatch);
        return {
          eventType: 'attempt.prepared',
          payload: { ordinal, attemptId, activeReceipt, dispatch },
          project: () => ({ ordinal, attemptId }),
        };
      });
    }

    async function recordTransport({
      attemptId,
      responseText,
      transportReceipt: inputTransportReceipt,
      executionReceipt: inputExecutionReceipt,
    } = {}) {
      requireDigest(attemptId, 'transport attempt id');
      if (typeof responseText !== 'string') throw new TypeError('turn response must be text');
      const responseBytes = Buffer.byteLength(responseText, 'utf8');
      if (responseBytes > maximumResponseBytes) throw new IntegrityError('turn response exceeds maximum size');
      const transportReceipt = verifyCodexTaskTransportReceipt(inputTransportReceipt);
      const executionReceipt = verifyCodexTaskExecutionReceipt(inputExecutionReceipt);
      return mutate(async (verified) => {
        const current = verified.projection.attempts.at(-1) ?? null;
        if (!current || current.attemptId !== attemptId) throw new IntegrityError('transport attempt is not current');
        const checked = verifyCodexTaskTransportResult({ responseText, receipt: transportReceipt }, current.dispatch);
        assertTransportLinks(current, checked.receipt, executionReceipt);
        const response = { bytes: responseBytes, digest: sha256Text(responseText) };
        if (current.transport) {
          if (!same(current.transport, {
            transportReceipt: checked.receipt,
            executionReceipt,
            response,
          })) throw new IntegrityError('changed transport completion retry');
          await readResponseBlob(join(responsesDir, `${response.digest}.txt`), response);
          return clone(current.transport);
        }
        if (current.lifecycleReceipt || current.abandoned) {
          throw new IntegrityError('transport completion arrived after attempt closure');
        }
        await mkdir(responsesDir, { recursive: true });
        const responsePath = join(responsesDir, `${response.digest}.txt`);
        const published = await publishFileExclusive({ destinationPath: responsePath, content: responseText });
        if (!published) await readResponseBlob(responsePath, response);
        return {
          eventType: 'transport.completed',
          payload: {
            attemptId,
            transportReceipt: checked.receipt,
            executionReceipt,
            response,
          },
          project: (next) => clone(next.projection.attempts.at(-1).transport),
        };
      });
    }

    async function closeBinding({ attemptId, lifecycleReceipt: inputLifecycleReceipt } = {}) {
      requireDigest(attemptId, 'binding closure attempt id');
      const lifecycleReceipt = verifyCortexBindingLifecycleReceipt(inputLifecycleReceipt);
      return mutate(async (verified) => {
        const current = verified.projection.attempts.at(-1) ?? null;
        if (!current || current.attemptId !== attemptId) throw new IntegrityError('binding closure attempt is not current');
        assertLifecycleLinks(current, lifecycleReceipt);
        if (current.lifecycleReceipt) {
          if (!same(current.lifecycleReceipt, lifecycleReceipt)) throw new IntegrityError('changed binding closure retry');
          return clone(current.lifecycleReceipt);
        }
        if (current.abandoned || verified.projection.terminal) throw new IntegrityError('binding closure is too late');
        return {
          eventType: 'binding.closed',
          payload: { attemptId, lifecycleReceipt },
          project: (next) => clone(next.projection.attempts.at(-1).lifecycleReceipt),
        };
      });
    }

    async function abandonAttempt({ attemptId, reasonDigest } = {}) {
      requireDigest(attemptId, 'abandoned attempt id');
      requireDigest(reasonDigest, 'abandoned attempt reason digest');
      return mutate(async (verified) => {
        const current = verified.projection.attempts.at(-1) ?? null;
        if (!current || current.attemptId !== attemptId) throw new IntegrityError('abandoned attempt is not current');
        if (!current.lifecycleReceipt) throw new IntegrityError('binding must be closed before attempt abandonment');
        if (current.transport) throw new IntegrityError('attempt with completed transport cannot be abandoned');
        if (current.abandoned) {
          if (current.abandoned.reasonDigest !== reasonDigest) throw new IntegrityError('changed abandonment retry');
          return clone(current.abandoned);
        }
        return {
          eventType: 'attempt.abandoned',
          payload: { attemptId, reasonDigest },
          project: (next) => clone(next.projection.attempts.at(-1).abandoned),
        };
      });
    }

    async function accept({ attemptId, hostReceipt: inputHostReceipt } = {}) {
      requireDigest(attemptId, 'accepted attempt id');
      const hostReceipt = verifyAnyCodexBoundTurnReceipt(inputHostReceipt);
      return mutate(async (verified) => {
        const projection = verified.projection;
        if (projection.terminal) {
          if (projection.terminal.status === 'accepted'
              && projection.terminal.attemptId === attemptId
              && same(projection.terminal.hostReceipt, hostReceipt)) {
            return clone(projection.terminal.hostReceipt);
          }
          throw new IntegrityError('turn journal is terminal');
        }
        const current = projection.attempts.at(-1) ?? null;
        if (!current || current.attemptId !== attemptId || current.abandoned
            || !current.transport || !current.lifecycleReceipt) {
          throw new IntegrityError('turn acceptance lacks complete attempt evidence');
        }
        const recoverable = hostReceipt.protocolId
          === 'eternities-godagent-codex-recoverable-bound-turn-v1';
        if (current.lifecycleReceipt.status !== 'released'
            && !(recoverable && current.lifecycleReceipt.status === 'expired')) {
          throw new IntegrityError('turn acceptance requires a released or safely expired binding');
        }
        assertHostReceiptLinks(projection, current, hostReceipt, verified.state.headDigest);
        await readResponseBlob(
          join(responsesDir, `${current.transport.response.digest}.txt`),
          current.transport.response,
        );
        return {
          eventType: 'turn.accepted',
          payload: { attemptId, hostReceipt },
          project: (next) => clone(next.projection.terminal.hostReceipt),
        };
      });
    }

    async function cancel({ cancellationReceipt: inputCancellationReceipt } = {}) {
      const cancellationReceipt = verifyCodexTaskReservationReceipt(inputCancellationReceipt);
      return mutate(async (verified) => {
        const projection = verified.projection;
        if (projection.terminal) {
          if (projection.terminal.status === 'cancelled'
              && same(projection.terminal.cancellationReceipt, cancellationReceipt)) {
            return clone(projection.terminal.cancellationReceipt);
          }
          throw new IntegrityError('turn journal is terminal');
        }
        if (projection.identity.operation !== 'create' || !projection.reservation
            || projection.attempts.length > 0) {
          throw new IntegrityError('task cancellation is invalid for this journal');
        }
        assertCancellationLinks(projection, cancellationReceipt);
        return {
          eventType: 'task.cancelled',
          payload: { cancellationReceipt },
          project: (next) => clone(next.projection.terminal.cancellationReceipt),
        };
      });
    }

    async function quarantine({ reasonDigest } = {}) {
      requireDigest(reasonDigest, 'turn quarantine reason digest');
      return mutate(async (verified) => {
        if (verified.projection.terminal) {
          if (verified.projection.terminal.status === 'quarantined'
              && verified.projection.terminal.reasonDigest === reasonDigest) {
            return { reasonDigest };
          }
          throw new IntegrityError('turn journal is terminal');
        }
        const current = verified.projection.attempts.at(-1) ?? null;
        if (current && !current.abandoned && !current.lifecycleReceipt) {
          throw new IntegrityError('binding must be closed before turn quarantine');
        }
        return {
          eventType: 'turn.quarantined',
          payload: { reasonDigest },
          project: () => ({ reasonDigest }),
        };
      });
    }

    return Object.freeze({
      transactionId,
      transactionDir,
      statePath,
      inspect,
      recoverEvidence,
      recordReservation,
      prepareAttempt,
      recordTransport,
      closeBinding,
      abandonAttempt,
      accept,
      cancel,
      quarantine,
    });
  }

  async function openExisting(operationId) {
    requireIdentifier(operationId, 'turn journal operation id');
    const operationSlotId = operationSlotIdFor(operationId);
    const existing = await readState(join(root, operationSlotId, 'journal.json'));
    if (!existing) return null;
    if (existing.projection.identity.operationId !== operationId) {
      throw new IntegrityError('turn journal operation slot mismatch');
    }
    return open(existing.projection.identity);
  }

  return Object.freeze({ open, openExisting });
}
