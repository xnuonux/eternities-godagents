import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import {
  buildCodexTaskCancellationReceipt,
  buildCodexTaskReservationReceipt,
  buildCodexTaskTransportReceipt,
} from '../../src/host/codex-bound-turn.mjs';
import { buildCodexTaskExecutionReceipt } from '../../src/host/codex-turn-journal.mjs';

export const zeroDigest = '0'.repeat(64);
export const fixtureDigest = (label) => sha256Text(`codex-turn-journal-certification:${label}`);

export function certificationOpening({
  operation,
  operationId,
  turnId,
  cortexId,
  requestLabel,
  parentTurnReceiptDigest = zeroDigest,
  task = null,
}) {
  return {
    operation,
    operationId,
    turnId,
    requestDigest: fixtureDigest(requestLabel),
    parentTurnReceiptDigest,
    transportDescriptorDigest: fixtureDigest('transport-descriptor-v1'),
    cortexId,
    task,
  };
}

export function certificationReservation(identity, task) {
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

export function certificationCancellation(reservation, reasonLabel) {
  return buildCodexTaskCancellationReceipt({
    reservationReceipt: reservation,
    reasonDigest: fixtureDigest(reasonLabel),
  });
}

export function certificationActiveReceipt({ label, taskId, issuedAt, expiresAt }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godagent-cortex-binding-registry-v1',
    status: 'active',
    active: true,
    bindingId: fixtureDigest(`${label}:binding`),
    bindingCandidateId: fixtureDigest('stable-binding-candidate-id'),
    bindingCandidateDigest: fixtureDigest(`${label}:binding-candidate`),
    identityDigest: fixtureDigest('stable-identity'),
    instanceId: 'codex-turn-journal-certification',
    genesisId: fixtureDigest('stable-genesis'),
    genomeDigest: fixtureDigest('stable-genome'),
    distributionDigest: fixtureDigest('stable-distribution'),
    realmContractDigest: fixtureDigest('stable-realm-contract'),
    keelId: `keel-${fixtureDigest('stable-keel')}`,
    keelHeadDigest: fixtureDigest('stable-keel-head'),
    taskId,
    hostAdapterId: 'codex-desktop-v1',
    revocationEpoch: 0,
    createdAt: issuedAt,
    lastVerifiedAt: issuedAt,
    lease: {
      leaseId: fixtureDigest(`${label}:lease`),
      mode: 'exclusive-writer',
      issuedAt,
      expiresAt,
    },
    authority: { continuity: 'host-lease-only', realmEffects: 'none' },
    registryEventDigest: fixtureDigest(`${label}:registry-event`),
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

export function certificationDispatch(identity, activeReceipt, task) {
  const modelProjection = {
    binding: {
      bindingCandidateId: activeReceipt.bindingCandidateId,
      taskId: activeReceipt.taskId,
      hostAdapterId: activeReceipt.hostAdapterId,
      revocationEpoch: activeReceipt.revocationEpoch,
      instanceId: activeReceipt.instanceId,
      genesisId: activeReceipt.genesisId,
      keelId: activeReceipt.keelId,
      genomeValueDigest: activeReceipt.genomeDigest,
      distributionBuildId: activeReceipt.distributionDigest,
      currentKeelHeadDigest: activeReceipt.keelHeadDigest,
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
      bindingId: activeReceipt.bindingId,
      bindingReceiptDigest: activeReceipt.receiptDigest,
      bindingCandidateId: activeReceipt.bindingCandidateId,
      bindingCandidateDigest: activeReceipt.bindingCandidateDigest,
      identityDigest: activeReceipt.identityDigest,
      instanceId: activeReceipt.instanceId,
      genesisId: activeReceipt.genesisId,
      genomeDigest: activeReceipt.genomeDigest,
      distributionDigest: activeReceipt.distributionDigest,
      realmContractDigest: activeReceipt.realmContractDigest,
      keelId: activeReceipt.keelId,
      keelHeadDigest: activeReceipt.keelHeadDigest,
      taskId: activeReceipt.taskId,
      hostAdapterId: activeReceipt.hostAdapterId,
      revocationEpoch: activeReceipt.revocationEpoch,
      leaseId: activeReceipt.lease.leaseId,
      expiresAt: activeReceipt.lease.expiresAt,
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
    task: structuredClone(task),
    instructionChannel: 'developer',
    bindingReceiptDigest: activeReceipt.receiptDigest,
    envelope,
    envelopeDigest: envelope.envelopeDigest,
    cortexId: identity.cortexId,
    maxResponseBytes: 16_384,
  };
}

export function certificationCompletion({ dispatch, responseText, startedAt, completedAt }) {
  const transportReceipt = buildCodexTaskTransportReceipt({ dispatch, responseText });
  const executionReceipt = buildCodexTaskExecutionReceipt({
    dispatch,
    transportReceipt,
    responseText,
    startedAt,
    completedAt,
  });
  return { responseText, transportReceipt, executionReceipt };
}

export function certificationLifecycle(activeReceipt, { status = 'released', recordedAt }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godagent-cortex-binding-registry-v1',
    status,
    active: false,
    bindingId: activeReceipt.bindingId,
    instanceId: activeReceipt.instanceId,
    taskId: activeReceipt.taskId,
    revocationEpoch: status === 'revoked'
      ? activeReceipt.revocationEpoch + 1
      : activeReceipt.revocationEpoch,
    recordedAt,
    registryEventDigest: fixtureDigest(`${activeReceipt.bindingId}:${status}:${recordedAt}`),
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

export function certificationHostReceipt({
  identity,
  reservation = null,
  activeReceipt,
  dispatch,
  transportReceipt,
  lifecycleReceipt,
}) {
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
    task: { ...structuredClone(dispatch.task), hostAdapterId: activeReceipt.hostAdapterId },
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
    transportReceiptDigest: transportReceipt.receiptDigest,
    cortexId: identity.cortexId,
    responseBytes: transportReceipt.responseBytes,
    responseDigest: transportReceipt.responseDigest,
    authority: { continuityAdmission: false, realmEffects: 0 },
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

