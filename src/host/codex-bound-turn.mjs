import { resolve } from 'node:path';

import {
  compileCortexBindingCandidate,
  verifyCortexBindingCandidate,
} from '../cortex/binding-compiler.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import {
  acquireCortexBinding,
  defaultCortexBindingRegistryRoot,
  verifyCortexBindingLifecycleReceipt,
  verifyCortexBindingReceipt,
} from './cortex-binding-registry.mjs';
import { defaultLocalInstanceRegistryRoot } from './local-instance-registry.mjs';

const protocolId = 'eternities-godagent-codex-bound-turn-v1';
const transportProtocolId = 'eternities-codex-task-control-v1';
const zeroDigest = '0'.repeat(64);
const digestPattern = /^[a-f0-9]{64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const operations = new Set(['create', 'continue', 'compaction-resume']);
const instructionChannels = new Set(['developer', 'sealed-user-envelope']);
const clone = (value) => structuredClone(value);

export class CodexBoundTurnError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CodexBoundTurnError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CodexBoundTurnError(code, message);
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

function requireKeelId(value, label) {
  if (!/^keel-[a-f0-9]{64}$/.test(value ?? '')) throw new IntegrityError(`${label} is invalid`);
}

function requireIsoTime(value, label) {
  const milliseconds = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(milliseconds)
      || new Date(milliseconds).toISOString() !== value) {
    throw new IntegrityError(`${label} is invalid`);
  }
}

function requireTask(value) {
  exactKeys(value, ['taskId', 'hostId'], 'codex task reference');
  requireIdentifier(value.taskId, 'codex task id');
  requireIdentifier(value.hostId, 'codex host id');
  return deepFreeze(clone(value));
}

function requireTurnRequest(value) {
  const request = clone(value);
  assertSchema('codex-bound-turn-request', request);
  for (const [label, identifier] of [
    ['operation id', request.operationId],
    ['turn id', request.turnId],
    ['host adapter id', request.hostAdapterId],
    ['mission id', request.mission.missionId],
    ['observation id', request.mission.observation.observationId],
  ]) requireIdentifier(identifier, label);
  for (const digest of request.mission.observation.evidenceDigests) {
    requireDigest(digest, 'mission evidence digest');
  }
  return deepFreeze(request);
}

function descriptorValue(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'hostAdapterId', 'instructionChannel', 'suspendedReservation',
    'boundExecutionReceipt',
  ], 'task transport descriptor');
  if (value.schemaVersion !== 1 || value.protocolId !== transportProtocolId
      || !identifierPattern.test(value.hostAdapterId ?? '')
      || !instructionChannels.has(value.instructionChannel)
      || typeof value.suspendedReservation !== 'boolean'
      || value.boundExecutionReceipt !== true) {
    throw new IntegrityError('task transport descriptor is unsupported');
  }
  return deepFreeze(clone(value));
}

async function loadDescriptor(taskTransport, { requireReservation = false } = {}) {
  if (!taskTransport || typeof taskTransport !== 'object' || Array.isArray(taskTransport)
      || typeof taskTransport.descriptor !== 'function'
      || typeof taskTransport.dispatchTurn !== 'function') {
    throw new TypeError('task transport is incomplete');
  }
  const descriptor = descriptorValue(await taskTransport.descriptor());
  if (requireReservation && (!descriptor.suspendedReservation
      || typeof taskTransport.reserveTask !== 'function'
      || typeof taskTransport.cancelReservation !== 'function')) {
    throw new IntegrityError('task transport descriptor lacks suspended reservation');
  }
  return descriptor;
}

function reservationUnsigned({ status, operationId, requestDigest, transportDescriptorDigest,
  task, instructionChannel, parentReceiptDigest, reasonDigest }) {
  return {
    schemaVersion: 1,
    protocolId: transportProtocolId,
    status,
    modelStarted: false,
    operationId,
    requestDigest,
    transportDescriptorDigest,
    task: clone(task),
    instructionChannel,
    parentReceiptDigest,
    reasonDigest,
  };
}

export function buildCodexTaskReservationReceipt({ intent, task, instructionChannel }) {
  exactKeys(intent, [
    'schemaVersion', 'protocolId', 'operationId', 'requestDigest', 'transportDescriptorDigest',
    'hostAdapterId', 'cortexId',
  ], 'task reservation intent');
  if (intent.schemaVersion !== 1 || intent.protocolId !== protocolId) {
    throw new IntegrityError('task reservation intent is invalid');
  }
  requireIdentifier(intent.operationId, 'task reservation operation id');
  requireIdentifier(intent.hostAdapterId, 'task reservation host adapter id');
  requireIdentifier(intent.cortexId, 'task reservation cortex id');
  requireDigest(intent.requestDigest, 'task reservation request digest');
  requireDigest(intent.transportDescriptorDigest, 'task reservation transport descriptor digest');
  const checkedTask = requireTask(task);
  if (!instructionChannels.has(instructionChannel)) throw new IntegrityError('task reservation channel is invalid');
  const unsigned = reservationUnsigned({
    status: 'reserved',
    operationId: intent.operationId,
    requestDigest: intent.requestDigest,
    transportDescriptorDigest: intent.transportDescriptorDigest,
    task: checkedTask,
    instructionChannel,
    parentReceiptDigest: zeroDigest,
    reasonDigest: zeroDigest,
  });
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('codex-task-reservation-receipt', receipt);
  return deepFreeze(receipt);
}

export function verifyCodexTaskReservationReceipt(value) {
  const receipt = clone(value);
  assertSchema('codex-task-reservation-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  requireDigest(receiptDigest, 'task reservation receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError('task reservation receipt digest mismatch');
  requireIdentifier(receipt.operationId, 'task reservation operation id');
  requireDigest(receipt.requestDigest, 'task reservation request digest');
  requireDigest(receipt.transportDescriptorDigest, 'task reservation transport descriptor digest');
  requireDigest(receipt.parentReceiptDigest, 'task reservation parent receipt digest');
  requireDigest(receipt.reasonDigest, 'task reservation reason digest');
  if (!instructionChannels.has(receipt.instructionChannel)) {
    throw new IntegrityError('task reservation instruction channel is invalid');
  }
  if (receipt.status === 'reserved') {
    if (receipt.parentReceiptDigest !== zeroDigest || receipt.reasonDigest !== zeroDigest) {
      throw new IntegrityError('task reservation receipt lineage is invalid');
    }
  } else if (receipt.parentReceiptDigest === zeroDigest || receipt.reasonDigest === zeroDigest) {
    throw new IntegrityError('task cancellation receipt lineage is invalid');
  }
  requireTask(receipt.task);
  return deepFreeze(receipt);
}

export function buildCodexTaskCancellationReceipt({ reservationReceipt, reasonDigest }) {
  const reserved = verifyCodexTaskReservationReceipt(reservationReceipt);
  if (reserved.status !== 'reserved') throw new IntegrityError('only a suspended reservation can be cancelled');
  requireDigest(reasonDigest, 'task cancellation reason digest');
  if (reasonDigest === zeroDigest) throw new IntegrityError('task cancellation reason digest is empty');
  const unsigned = reservationUnsigned({
    status: 'cancelled',
    operationId: reserved.operationId,
    requestDigest: reserved.requestDigest,
    transportDescriptorDigest: reserved.transportDescriptorDigest,
    task: reserved.task,
    instructionChannel: reserved.instructionChannel,
    parentReceiptDigest: reserved.receiptDigest,
    reasonDigest,
  });
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('codex-task-reservation-receipt', receipt);
  return deepFreeze(receipt);
}

function verifyCancellationReceipt(value, reserved, reasonDigest) {
  const cancelled = verifyCodexTaskReservationReceipt(value);
  if (cancelled.status !== 'cancelled'
      || cancelled.operationId !== reserved.operationId
      || cancelled.requestDigest !== reserved.requestDigest
      || cancelled.transportDescriptorDigest !== reserved.transportDescriptorDigest
      || canonicalJson(cancelled.task) !== canonicalJson(reserved.task)
      || cancelled.instructionChannel !== reserved.instructionChannel
      || cancelled.parentReceiptDigest !== reserved.receiptDigest
      || cancelled.reasonDigest !== reasonDigest) {
    throw new IntegrityError('task cancellation receipt does not match the reservation');
  }
  return cancelled;
}

function bindingRequest(task, request) {
  return {
    schemaVersion: 1,
    task: {
      taskId: task.taskId,
      hostAdapterId: request.hostAdapterId,
      revocationEpoch: request.revocationEpoch,
    },
    mission: clone(request.mission),
    maxProjectionBytes: request.maxProjectionBytes,
  };
}

function bindingProjection(receipt) {
  return {
    bindingId: receipt.bindingId,
    bindingReceiptDigest: receipt.receiptDigest,
    bindingCandidateId: receipt.bindingCandidateId,
    bindingCandidateDigest: receipt.bindingCandidateDigest,
    identityDigest: receipt.identityDigest,
    instanceId: receipt.instanceId,
    genesisId: receipt.genesisId,
    genomeDigest: receipt.genomeDigest,
    distributionDigest: receipt.distributionDigest,
    realmContractDigest: receipt.realmContractDigest,
    keelId: receipt.keelId,
    keelHeadDigest: receipt.keelHeadDigest,
    taskId: receipt.taskId,
    hostAdapterId: receipt.hostAdapterId,
    revocationEpoch: receipt.revocationEpoch,
    leaseId: receipt.lease.leaseId,
    expiresAt: receipt.lease.expiresAt,
  };
}

function buildEnvelope({ operation, request, parentTurnReceiptDigest, transportDescriptorDigest,
  activeReceipt, candidate }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    operation,
    operationId: request.operationId,
    turnId: request.turnId,
    parentTurnReceiptDigest,
    transportDescriptorDigest,
    binding: bindingProjection(activeReceipt),
    modelProjection: clone(candidate.modelProjection),
    modelProjectionDigest: candidate.modelProjectionDigest,
    hostRules: {
      identitySource: 'host-verified',
      modelAuthority: 'proposal-only',
      selfAdmission: false,
      continuityAdmission: false,
      realmEffects: 'none',
      outputMetadataTrust: 'untrusted',
    },
  };
  const envelope = { ...unsigned, envelopeDigest: sha256Value(unsigned) };
  assertSchema('codex-bound-turn-envelope', envelope);
  return deepFreeze(envelope);
}

function verifyEnvelope(value) {
  const envelope = clone(value);
  assertSchema('codex-bound-turn-envelope', envelope);
  const { envelopeDigest, ...unsigned } = envelope;
  requireDigest(envelopeDigest, 'codex bound-turn envelope digest');
  if (envelopeDigest !== sha256Value(unsigned)) throw new IntegrityError('codex bound-turn envelope digest mismatch');
  requireIdentifier(envelope.operationId, 'codex bound-turn operation id');
  requireIdentifier(envelope.turnId, 'codex bound-turn turn id');
  requireDigest(envelope.parentTurnReceiptDigest, 'codex bound-turn parent receipt digest');
  requireDigest(envelope.transportDescriptorDigest, 'codex bound-turn transport descriptor digest');
  requireDigest(envelope.modelProjectionDigest, 'codex bound-turn model projection digest');
  for (const [field, label] of [
    ['bindingId', 'binding id'],
    ['bindingReceiptDigest', 'binding receipt digest'],
    ['bindingCandidateId', 'binding candidate id'],
    ['bindingCandidateDigest', 'binding candidate digest'],
    ['identityDigest', 'identity digest'],
    ['genesisId', 'genesis id'],
    ['genomeDigest', 'genome digest'],
    ['distributionDigest', 'distribution digest'],
    ['realmContractDigest', 'Realm contract digest'],
    ['keelHeadDigest', 'keel head digest'],
    ['leaseId', 'lease id'],
  ]) requireDigest(envelope.binding[field], `codex bound-turn ${label}`);
  for (const [field, label] of [
    ['instanceId', 'instance id'],
    ['taskId', 'task id'],
    ['hostAdapterId', 'host adapter id'],
  ]) requireIdentifier(envelope.binding[field], `codex bound-turn ${label}`);
  requireKeelId(envelope.binding.keelId, 'codex bound-turn keel id');
  requireIsoTime(envelope.binding.expiresAt, 'codex bound-turn lease expiry');
  if (envelope.modelProjectionDigest !== sha256Value(envelope.modelProjection)) {
    throw new IntegrityError('codex bound-turn model projection digest mismatch');
  }
  const projectedBinding = envelope.modelProjection.binding;
  if (!projectedBinding
      || projectedBinding.bindingCandidateId !== envelope.binding.bindingCandidateId
      || projectedBinding.taskId !== envelope.binding.taskId
      || projectedBinding.hostAdapterId !== envelope.binding.hostAdapterId
      || projectedBinding.revocationEpoch !== envelope.binding.revocationEpoch
      || projectedBinding.instanceId !== envelope.binding.instanceId
      || projectedBinding.genesisId !== envelope.binding.genesisId
      || projectedBinding.keelId !== envelope.binding.keelId
      || projectedBinding.genomeValueDigest !== envelope.binding.genomeDigest
      || projectedBinding.distributionBuildId !== envelope.binding.distributionDigest
      || projectedBinding.currentKeelHeadDigest !== envelope.binding.keelHeadDigest) {
    throw new IntegrityError('codex bound-turn model projection binding mismatch');
  }
  return deepFreeze(envelope);
}

function transportUnsigned({ dispatch, responseText }) {
  if (typeof responseText !== 'string') throw new IntegrityError('task transport response must be text');
  const responseBytes = Buffer.byteLength(responseText, 'utf8');
  if (responseBytes > dispatch.maxResponseBytes) throw new IntegrityError('task transport response exceeds maximum size');
  return {
    schemaVersion: 1,
    protocolId: transportProtocolId,
    status: 'completed',
    operation: dispatch.operation,
    operationId: dispatch.operationId,
    turnId: dispatch.turnId,
    task: clone(dispatch.task),
    instructionChannel: dispatch.instructionChannel,
    bindingReceiptDigest: dispatch.bindingReceiptDigest,
    envelopeDigest: dispatch.envelopeDigest,
    cortexId: dispatch.cortexId,
    responseBytes,
    responseDigest: sha256Text(responseText),
  };
}

export function verifyCodexTaskDispatch(value) {
  const dispatch = clone(value);
  exactKeys(dispatch, [
    'schemaVersion', 'protocolId', 'operation', 'operationId', 'turnId', 'task',
    'instructionChannel', 'bindingReceiptDigest', 'envelope', 'envelopeDigest',
    'cortexId', 'maxResponseBytes',
  ], 'task dispatch');
  if (dispatch.schemaVersion !== 1 || dispatch.protocolId !== transportProtocolId
      || !operations.has(dispatch.operation) || !instructionChannels.has(dispatch.instructionChannel)) {
    throw new IntegrityError('task dispatch identity is invalid');
  }
  const envelope = verifyEnvelope(dispatch.envelope);
  if (dispatch.envelopeDigest !== envelope.envelopeDigest
      || dispatch.bindingReceiptDigest !== envelope.binding.bindingReceiptDigest) {
    throw new IntegrityError('task dispatch envelope binding is invalid');
  }
  requireTask(dispatch.task);
  requireIdentifier(dispatch.operationId, 'task dispatch operation id');
  requireIdentifier(dispatch.turnId, 'task dispatch turn id');
  requireIdentifier(dispatch.cortexId, 'task dispatch cortex id');
  requireDigest(dispatch.bindingReceiptDigest, 'task dispatch binding receipt digest');
  if (!Number.isInteger(dispatch.maxResponseBytes) || dispatch.maxResponseBytes < 256
      || dispatch.maxResponseBytes > 4_194_304) {
    throw new IntegrityError('task dispatch response ceiling is invalid');
  }
  return deepFreeze(dispatch);
}

export function buildCodexTaskTransportReceipt({ dispatch: inputDispatch, responseText }) {
  const dispatch = verifyCodexTaskDispatch(inputDispatch);
  const unsigned = transportUnsigned({ dispatch, responseText });
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('codex-task-transport-receipt', receipt);
  return deepFreeze(receipt);
}

export function verifyCodexTaskTransportReceipt(value) {
  const receipt = clone(value);
  assertSchema('codex-task-transport-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  requireDigest(receiptDigest, 'task transport receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError('task transport receipt digest mismatch');
  requireTask(receipt.task);
  requireIdentifier(receipt.operationId, 'task transport operation id');
  requireIdentifier(receipt.turnId, 'task transport turn id');
  requireIdentifier(receipt.cortexId, 'task transport cortex id');
  requireDigest(receipt.bindingReceiptDigest, 'task transport binding receipt digest');
  requireDigest(receipt.envelopeDigest, 'task transport envelope digest');
  requireDigest(receipt.responseDigest, 'task transport response digest');
  return deepFreeze(receipt);
}

export function verifyCodexTaskTransportResult(value, inputDispatch) {
  const dispatch = verifyCodexTaskDispatch(inputDispatch);
  exactKeys(value, ['responseText', 'receipt'], 'task transport result');
  if (typeof value.responseText !== 'string') throw new IntegrityError('task transport response must be text');
  const receipt = verifyCodexTaskTransportReceipt(value.receipt);
  const expected = buildCodexTaskTransportReceipt({ dispatch, responseText: value.responseText });
  if (canonicalJson(receipt) !== canonicalJson(expected)) {
    throw new IntegrityError('task transport receipt does not match the bound turn');
  }
  return { responseText: value.responseText, receipt };
}

function hostReceipt({ operation, request, task, parentTurnReceiptDigest, reservationReceiptDigest,
  transportDescriptorDigest, instructionChannel, activeReceipt, lifecycleReceipt, envelope,
  transportReceipt, cortexId }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    status: 'accepted',
    operation,
    operationId: request.operationId,
    turnId: request.turnId,
    parentTurnReceiptDigest,
    reservationReceiptDigest,
    transportDescriptorDigest,
    instructionChannel,
    task: { ...clone(task), hostAdapterId: request.hostAdapterId },
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
    envelopeDigest: envelope.envelopeDigest,
    modelProjectionDigest: envelope.modelProjectionDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    cortexId,
    responseBytes: transportReceipt.responseBytes,
    responseDigest: transportReceipt.responseDigest,
    authority: { continuityAdmission: false, realmEffects: 0 },
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('codex-bound-turn-receipt', receipt);
  return deepFreeze(receipt);
}

export function verifyCodexBoundTurnReceipt(value) {
  const receipt = clone(value);
  assertSchema('codex-bound-turn-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  requireDigest(receiptDigest, 'codex bound-turn receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError('codex bound-turn receipt digest mismatch');
  if ((receipt.operation === 'create') !== (receipt.parentTurnReceiptDigest === zeroDigest)) {
    throw new IntegrityError('codex bound-turn parent lineage is invalid');
  }
  if ((receipt.operation === 'create') !== (receipt.reservationReceiptDigest !== zeroDigest)) {
    throw new IntegrityError('codex bound-turn reservation lineage is invalid');
  }
  requireIdentifier(receipt.operationId, 'codex bound-turn operation id');
  requireIdentifier(receipt.turnId, 'codex bound-turn turn id');
  requireIdentifier(receipt.task.hostAdapterId, 'codex bound-turn host adapter id');
  requireIdentifier(receipt.actor.instanceId, 'codex bound-turn actor instance id');
  requireIdentifier(receipt.cortexId, 'codex bound-turn cortex id');
  for (const [valueToCheck, label] of [
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
  ]) requireDigest(valueToCheck, `codex bound-turn ${label}`);
  requireKeelId(receipt.actor.keelId, 'codex bound-turn actor keel id');
  if (!instructionChannels.has(receipt.instructionChannel)) {
    throw new IntegrityError('codex bound-turn instruction channel is invalid');
  }
  requireTask({ taskId: receipt.task.taskId, hostId: receipt.task.hostId });
  return deepFreeze(receipt);
}

function assertParent(parentReceipt, task, request) {
  const parent = verifyCodexBoundTurnReceipt(parentReceipt);
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

export function createCodexBoundTurnHost({
  taskTransport,
  registryRoot = defaultCortexBindingRegistryRoot(),
  instanceRegistryRoot = defaultLocalInstanceRegistryRoot(),
  leaseDurationMs,
  clock = Date.now,
  leaseCredential,
  writerLockOptions = {},
} = {}) {
  if (typeof registryRoot !== 'string' || typeof instanceRegistryRoot !== 'string') {
    throw new TypeError('bound-turn registry roots are invalid');
  }
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 86_400_000) {
    throw new TypeError('bound-turn lease duration is invalid');
  }
  if (typeof clock !== 'function') throw new TypeError('bound-turn clock is required');

  async function execute({ operation, admission, task, request, cortexId, descriptor,
    parent = null, reservationReceiptDigest = zeroDigest, onDispatchStart = () => {} }) {
    let handle;
    try {
      const phaseOneRequest = bindingRequest(task, request);
      handle = await acquireCortexBinding({
        registryRoot: resolve(registryRoot),
        instanceRegistryRoot: resolve(instanceRegistryRoot),
        admission,
        request: phaseOneRequest,
        leaseDurationMs,
        clock,
        ...(leaseCredential === undefined ? {} : { leaseCredential }),
        writerLockOptions,
      });
      const activeReceipt = verifyCortexBindingReceipt(handle.receipt);
      if (parent) assertActorContinuation(parent, activeReceipt);
      const candidate = await compileCortexBindingCandidate({ admission, request: phaseOneRequest });
      verifyCortexBindingCandidate(candidate);
      if (candidate.candidateDigest !== activeReceipt.bindingCandidateDigest
          || candidate.bindingCandidateId !== activeReceipt.bindingCandidateId
          || candidate.fullEnvelope.sectionDigests.identity !== activeReceipt.identityDigest
          || candidate.fullEnvelope.binding.currentKeelHeadDigest !== activeReceipt.keelHeadDigest) {
        fail('candidate-mismatch', 'active binding does not match the compiled turn candidate');
      }
      const parentTurnReceiptDigest = parent?.receiptDigest ?? zeroDigest;
      const transportDescriptorDigest = sha256Value(descriptor);
      const envelope = buildEnvelope({
        operation, request, parentTurnReceiptDigest, transportDescriptorDigest, activeReceipt, candidate,
      });
      const dispatch = deepFreeze({
        schemaVersion: 1,
        protocolId: transportProtocolId,
        operation,
        operationId: request.operationId,
        turnId: request.turnId,
        task: clone(task),
        instructionChannel: descriptor.instructionChannel,
        bindingReceiptDigest: activeReceipt.receiptDigest,
        envelope,
        envelopeDigest: envelope.envelopeDigest,
        cortexId,
        maxResponseBytes: request.maxResponseBytes,
      });
      onDispatchStart();
      const transportResult = verifyCodexTaskTransportResult(
        await taskTransport.dispatchTurn(dispatch),
        dispatch,
      );
      const lifecycleReceipt = verifyCortexBindingLifecycleReceipt(await handle.release());
      handle = null;
      const receipt = hostReceipt({
        operation,
        request,
        task,
        parentTurnReceiptDigest,
        reservationReceiptDigest,
        transportDescriptorDigest,
        instructionChannel: descriptor.instructionChannel,
        activeReceipt,
        lifecycleReceipt,
        envelope,
        transportReceipt: transportResult.receipt,
        cortexId,
      });
      return deepFreeze({ task: clone(task), responseText: transportResult.responseText, receipt });
    } catch (error) {
      if (handle) {
        try { await handle.release(); } catch { /* preserve the primary failure */ }
      }
      throw error;
    }
  }

  async function create({ admission, request: inputRequest, cortexId } = {}) {
    const request = requireTurnRequest(inputRequest);
    requireIdentifier(cortexId, 'bound-turn cortex id');
    const descriptor = await loadDescriptor(taskTransport, { requireReservation: true });
    if (descriptor.hostAdapterId !== request.hostAdapterId) {
      throw new IntegrityError('task transport descriptor host adapter does not match the request');
    }
    const intent = deepFreeze({
      schemaVersion: 1,
      protocolId,
      operationId: request.operationId,
      requestDigest: sha256Value({ request, cortexId }),
      transportDescriptorDigest: sha256Value(descriptor),
      hostAdapterId: request.hostAdapterId,
      cortexId,
    });
    let reservation;
    let dispatchStarted = false;
    try {
      reservation = verifyCodexTaskReservationReceipt(await taskTransport.reserveTask(intent));
      if (reservation.status !== 'reserved'
          || reservation.operationId !== intent.operationId
          || reservation.requestDigest !== intent.requestDigest
          || reservation.transportDescriptorDigest !== intent.transportDescriptorDigest
          || reservation.instructionChannel !== descriptor.instructionChannel) {
        throw new IntegrityError('task reservation does not match the bound-turn intent');
      }
      return await execute({
        operation: 'create',
        admission,
        task: reservation.task,
        request,
        cortexId,
        descriptor,
        reservationReceiptDigest: reservation.receiptDigest,
        onDispatchStart: () => { dispatchStarted = true; },
      });
    } catch (error) {
      if (reservation?.status === 'reserved' && !dispatchStarted) {
        const reasonDigest = sha256Value({ schemaVersion: 1, protocolId, code: 'pre-dispatch-failure' });
        const cancellation = await taskTransport.cancelReservation({
          reservationReceipt: reservation,
          reasonDigest,
        });
        verifyCancellationReceipt(cancellation, reservation, reasonDigest);
      }
      throw error;
    }
  }

  async function runExisting(operation, { admission, task: inputTask, parentReceipt,
    request: inputRequest, cortexId } = {}) {
    const request = requireTurnRequest(inputRequest);
    const task = requireTask(inputTask);
    requireIdentifier(cortexId, 'bound-turn cortex id');
    const parent = assertParent(parentReceipt, task, request);
    const descriptor = await loadDescriptor(taskTransport);
    if (descriptor.hostAdapterId !== request.hostAdapterId) {
      throw new IntegrityError('task transport descriptor host adapter does not match the request');
    }
    return execute({ operation, admission, task, request, cortexId, descriptor, parent });
  }

  return Object.freeze({
    create,
    continue(input) { return runExisting('continue', input); },
    resumeAfterCompaction(input) { return runExisting('compaction-resume', input); },
  });
}
