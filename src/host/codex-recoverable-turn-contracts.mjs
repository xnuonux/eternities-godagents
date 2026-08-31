import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import {
  verifyCodexBoundTurnReceipt,
  verifyCodexTaskDispatch,
  verifyCodexTaskTransportDescriptor,
  verifyCodexTaskTransportResult,
} from './codex-bound-turn.mjs';
import { verifyCodexTaskExecutionReceipt } from './codex-task-execution.mjs';
import {
  verifyCortexBindingLifecycleReceipt,
  verifyCortexBindingReceipt,
} from './cortex-binding-registry.mjs';

const transportBindingProtocolId = 'eternities-codex-recoverable-transport-binding-v1';
const recoveryProtocolId = 'eternities-codex-task-recovery-v1';
const receiptProtocolId = 'eternities-godagent-codex-recoverable-bound-turn-v1';
const phaseThreeProtocolId = 'eternities-godagent-codex-bound-turn-v1';
const zeroDigest = '0'.repeat(64);
const digestPattern = /^[a-f0-9]{64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const clone = (value) => structuredClone(value);

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

export function verifyCodexTaskRecoveryDescriptor(value) {
  const descriptor = clone(value);
  try {
    assertSchema('codex-task-recovery-descriptor', descriptor);
  } catch {
    throw new IntegrityError('Codex task recovery descriptor is unsupported');
  }
  exactKeys(descriptor, [
    'schemaVersion', 'protocolId', 'reservationReconciliation',
    'dispatchReconciliation', 'executionWitness',
  ], 'Codex task recovery descriptor');
  if (descriptor.schemaVersion !== 1 || descriptor.protocolId !== recoveryProtocolId
      || descriptor.reservationReconciliation !== 'terminal-by-operation'
      || descriptor.dispatchReconciliation !== 'terminal-by-dispatch-digest'
      || descriptor.executionWitness !== 'lease-bounded-v1') {
    throw new IntegrityError('Codex task recovery descriptor is unsupported');
  }
  return deepFreeze(descriptor);
}

export function buildCodexRecoverableTransportBinding({ taskControl, recovery }) {
  const checkedTaskControl = verifyCodexTaskTransportDescriptor(taskControl);
  const checkedRecovery = verifyCodexTaskRecoveryDescriptor(recovery);
  if (checkedTaskControl.boundExecutionReceipt !== true) {
    throw new IntegrityError('task transport descriptor lacks a bound execution receipt');
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: transportBindingProtocolId,
    taskControl: clone(checkedTaskControl),
    recovery: clone(checkedRecovery),
  };
  const binding = { ...unsigned, bindingDigest: sha256Value(unsigned) };
  assertSchema('codex-recoverable-transport-binding', binding);
  return deepFreeze(binding);
}

export function verifyCodexRecoverableTransportBinding(value) {
  const binding = clone(value);
  assertSchema('codex-recoverable-transport-binding', binding);
  exactKeys(binding, ['schemaVersion', 'protocolId', 'taskControl', 'recovery', 'bindingDigest'],
    'Codex recoverable transport binding');
  const rebuilt = buildCodexRecoverableTransportBinding({
    taskControl: binding.taskControl,
    recovery: binding.recovery,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(binding)) {
    throw new IntegrityError('Codex recoverable transport binding digest mismatch');
  }
  return deepFreeze(binding);
}

function assertReceiptEvidence({ activeReceipt, lifecycleReceipt, dispatch, transport,
  executionReceipt, recoveredAfterInterruption }) {
  const binding = dispatch.envelope.binding;
  if (dispatch.bindingReceiptDigest !== activeReceipt.receiptDigest
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
      || binding.expiresAt !== activeReceipt.lease.expiresAt) {
    throw new IntegrityError('recoverable turn dispatch does not match active binding');
  }
  if (transport.receipt.operation !== dispatch.operation
      || transport.receipt.operationId !== dispatch.operationId
      || transport.receipt.turnId !== dispatch.turnId
      || canonicalJson(transport.receipt.task) !== canonicalJson(dispatch.task)
      || transport.receipt.instructionChannel !== dispatch.instructionChannel
      || transport.receipt.bindingReceiptDigest !== dispatch.bindingReceiptDigest
      || transport.receipt.envelopeDigest !== dispatch.envelopeDigest
      || transport.receipt.cortexId !== dispatch.cortexId
      || executionReceipt.dispatchDigest !== sha256Value(dispatch)
      || executionReceipt.transportReceiptDigest !== transport.receipt.receiptDigest
      || executionReceipt.responseBytes !== transport.receipt.responseBytes
      || executionReceipt.responseDigest !== transport.receipt.responseDigest) {
    throw new IntegrityError('recoverable turn transport evidence mismatch');
  }
  const issuedAt = parseTime(activeReceipt.lease.issuedAt, 'active binding issuedAt');
  const expiresAt = parseTime(activeReceipt.lease.expiresAt, 'active binding expiresAt');
  const startedAt = parseTime(executionReceipt.startedAt, 'execution startedAt');
  const completedAt = parseTime(executionReceipt.completedAt, 'execution completedAt');
  const closedAt = parseTime(lifecycleReceipt.recordedAt, 'binding lifecycle recordedAt');
  if (startedAt < issuedAt || completedAt > expiresAt || completedAt < startedAt) {
    throw new IntegrityError('recoverable turn execution is outside the active binding lease');
  }
  if (lifecycleReceipt.bindingId !== activeReceipt.bindingId
      || lifecycleReceipt.instanceId !== activeReceipt.instanceId
      || lifecycleReceipt.taskId !== activeReceipt.taskId
      || !new Set(['released', 'expired']).has(lifecycleReceipt.status)) {
    throw new IntegrityError('recoverable turn requires a released or expired binding');
  }
  if (lifecycleReceipt.status === 'released') {
    if (lifecycleReceipt.revocationEpoch !== activeReceipt.revocationEpoch
        || closedAt < completedAt || closedAt >= expiresAt) {
      throw new IntegrityError('recoverable turn released lifecycle is invalid');
    }
  } else {
    if (lifecycleReceipt.revocationEpoch !== activeReceipt.revocationEpoch
        || closedAt < expiresAt) {
      throw new IntegrityError('recoverable turn expired lifecycle is invalid');
    }
    if (recoveredAfterInterruption !== true) {
      throw new IntegrityError('expired binding requires reconstructed finalization');
    }
  }
}

export function buildRecoverableCodexBoundTurnReceipt({
  transactionId,
  preAcceptanceJournalHeadDigest,
  reservationReceiptDigest,
  activeReceipt: inputActiveReceipt,
  lifecycleReceipt: inputLifecycleReceipt,
  dispatch: inputDispatch,
  transportReceipt: inputTransportReceipt,
  executionReceipt: inputExecutionReceipt,
  responseText,
  recoveredAfterInterruption,
}) {
  requireDigest(transactionId, 'recoverable turn transaction id');
  requireDigest(preAcceptanceJournalHeadDigest, 'pre-acceptance journal head digest');
  requireDigest(reservationReceiptDigest, 'recoverable turn reservation receipt digest');
  if (typeof recoveredAfterInterruption !== 'boolean') {
    throw new IntegrityError('recoverable turn reconstruction flag is invalid');
  }
  const activeReceipt = verifyCortexBindingReceipt(inputActiveReceipt);
  const lifecycleReceipt = verifyCortexBindingLifecycleReceipt(inputLifecycleReceipt);
  const dispatch = verifyCodexTaskDispatch(inputDispatch);
  const transport = verifyCodexTaskTransportResult({
    responseText,
    receipt: inputTransportReceipt,
  }, dispatch);
  const executionReceipt = verifyCodexTaskExecutionReceipt(inputExecutionReceipt);
  assertReceiptEvidence({
    activeReceipt,
    lifecycleReceipt,
    dispatch,
    transport,
    executionReceipt,
    recoveredAfterInterruption,
  });
  if ((dispatch.operation === 'create') !== (dispatch.envelope.parentTurnReceiptDigest === zeroDigest)
      || (dispatch.operation === 'create') !== (reservationReceiptDigest !== zeroDigest)) {
    throw new IntegrityError('recoverable turn parent or reservation lineage is invalid');
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: receiptProtocolId,
    status: 'accepted',
    operation: dispatch.operation,
    operationId: dispatch.operationId,
    turnId: dispatch.turnId,
    parentTurnReceiptDigest: dispatch.envelope.parentTurnReceiptDigest,
    reservationReceiptDigest,
    transportDescriptorDigest: dispatch.envelope.transportDescriptorDigest,
    instructionChannel: dispatch.instructionChannel,
    task: { ...clone(dispatch.task), hostAdapterId: activeReceipt.hostAdapterId },
    actor: {
      instanceId: activeReceipt.instanceId,
      genesisId: activeReceipt.genesisId,
      identityDigest: activeReceipt.identityDigest,
      genomeDigest: activeReceipt.genomeDigest,
      distributionDigest: activeReceipt.distributionDigest,
      keelId: activeReceipt.keelId,
      keelHeadDigest: activeReceipt.keelHeadDigest,
    },
    binding: {
      bindingId: activeReceipt.bindingId,
      bindingCandidateId: activeReceipt.bindingCandidateId,
      bindingCandidateDigest: activeReceipt.bindingCandidateDigest,
      activeReceiptDigest: activeReceipt.receiptDigest,
      lifecycleReceiptDigest: lifecycleReceipt.receiptDigest,
      lifecycleStatus: lifecycleReceipt.status,
    },
    envelopeDigest: dispatch.envelopeDigest,
    modelProjectionDigest: dispatch.envelope.modelProjectionDigest,
    transportReceiptDigest: transport.receipt.receiptDigest,
    cortexId: dispatch.cortexId,
    responseBytes: transport.receipt.responseBytes,
    responseDigest: transport.receipt.responseDigest,
    recovery: {
      transactionId,
      preAcceptanceJournalHeadDigest,
      executionReceiptDigest: executionReceipt.receiptDigest,
      recoveredAfterInterruption,
    },
    authority: { continuityAdmission: false, realmEffects: 0 },
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('codex-recoverable-bound-turn-receipt', receipt);
  return deepFreeze(receipt);
}

export function verifyRecoverableCodexBoundTurnReceipt(value) {
  const receipt = clone(value);
  assertSchema('codex-recoverable-bound-turn-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  requireDigest(receiptDigest, 'recoverable bound-turn receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) {
    throw new IntegrityError('recoverable bound-turn receipt mismatch');
  }
  requireIdentifier(receipt.operationId, 'recoverable bound-turn operation id');
  requireIdentifier(receipt.turnId, 'recoverable bound-turn turn id');
  requireIdentifier(receipt.cortexId, 'recoverable bound-turn cortex id');
  requireIdentifier(receipt.task.taskId, 'recoverable bound-turn task id');
  requireIdentifier(receipt.task.hostId, 'recoverable bound-turn host id');
  requireIdentifier(receipt.task.hostAdapterId, 'recoverable bound-turn host adapter id');
  requireIdentifier(receipt.actor.instanceId, 'recoverable bound-turn instance id');
  for (const [digest, label] of [
    [receipt.parentTurnReceiptDigest, 'parent receipt digest'],
    [receipt.reservationReceiptDigest, 'reservation receipt digest'],
    [receipt.transportDescriptorDigest, 'transport descriptor digest'],
    [receipt.actor.genesisId, 'actor genesis digest'],
    [receipt.actor.identityDigest, 'actor identity digest'],
    [receipt.actor.genomeDigest, 'actor genome digest'],
    [receipt.actor.distributionDigest, 'actor distribution digest'],
    [receipt.actor.keelHeadDigest, 'actor keel head digest'],
    [receipt.binding.bindingId, 'binding id'],
    [receipt.binding.bindingCandidateId, 'binding candidate id'],
    [receipt.binding.bindingCandidateDigest, 'binding candidate digest'],
    [receipt.binding.activeReceiptDigest, 'active receipt digest'],
    [receipt.binding.lifecycleReceiptDigest, 'lifecycle receipt digest'],
    [receipt.envelopeDigest, 'envelope digest'],
    [receipt.modelProjectionDigest, 'model projection digest'],
    [receipt.transportReceiptDigest, 'transport receipt digest'],
    [receipt.responseDigest, 'response digest'],
    [receipt.recovery.transactionId, 'transaction id'],
    [receipt.recovery.preAcceptanceJournalHeadDigest, 'journal head digest'],
    [receipt.recovery.executionReceiptDigest, 'execution receipt digest'],
  ]) requireDigest(digest, `recoverable bound-turn ${label}`);
  if (!/^keel-[a-f0-9]{64}$/.test(receipt.actor.keelId ?? '')) {
    throw new IntegrityError('recoverable bound-turn keel id is invalid');
  }
  if ((receipt.operation === 'create') !== (receipt.parentTurnReceiptDigest === zeroDigest)
      || (receipt.operation === 'create') !== (receipt.reservationReceiptDigest !== zeroDigest)) {
    throw new IntegrityError('recoverable bound-turn parent or reservation lineage is invalid');
  }
  if (receipt.binding.lifecycleStatus === 'expired'
      && receipt.recovery.recoveredAfterInterruption !== true) {
    throw new IntegrityError('expired binding requires reconstructed finalization');
  }
  return deepFreeze(receipt);
}

export function verifyAnyCodexBoundTurnReceipt(value) {
  if (value?.protocolId === receiptProtocolId) return verifyRecoverableCodexBoundTurnReceipt(value);
  if (value?.protocolId === phaseThreeProtocolId) return verifyCodexBoundTurnReceipt(value);
  throw new IntegrityError('Codex bound-turn receipt protocol is unsupported');
}

