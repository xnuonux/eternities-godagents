import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import {
  verifyMissionExecutorDescriptor,
  verifyMissionPhaseRequest,
  verifyMissionPhaseResult,
} from './mission-phase-contracts.mjs';
import { createMissionOperationAdapter } from './mission-operation-adapter.mjs';

export const REVISION_MISSION_OPERATION_SOURCE_PROTOCOL_ID =
  'eternities-revision-mission-operation-source-v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_RESULT_BYTES = 16_777_216;

export class RevisionMissionOperationAdapterError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'RevisionMissionOperationAdapterError';
    this.code = code;
  }
}

const clone = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function fail(code, message, options = undefined) {
  throw new RevisionMissionOperationAdapterError(code, message, options);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object-invalid', `${label} is invalid`);
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('fields-invalid', `${label} fields are invalid`);
  }
}

function credentialFreeClone(value, label) {
  let copied;
  try {
    copied = clone(value);
    assertNoCredentialFields(copied);
  } catch (error) {
    fail('credential-field', `${label} is not a safe serializable value`, { cause: error });
  }
  return copied;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} is invalid`);
  return value;
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('identifier-invalid', `${label} is invalid`);
  return value;
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} is invalid`);
  }
  return value;
}

function verifyExecutor(value) {
  object(value, 'revision executor');
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof value[method] !== 'function') fail('executor-invalid', `revision executor ${method} is required`);
  }
  return value;
}

function contextInput(request, role) {
  return request.inputs.find((input) => input.role === role) ?? null;
}

function verifyContext(value, request) {
  const context = credentialFreeClone(value, 'revision phase context');
  exactKeys(context, ['admission', 'native', 'review'], 'revision phase context');
  for (const role of ['native', 'review']) {
    const input = contextInput(request, role);
    if (!input || sha256Text(canonicalJson(context[role])) !== input.artifactDigest) {
      fail('context-binding', `revision phase context ${role} is not bound to its request`);
    }
  }
  return deepFreeze(context);
}

function buildSourceDescriptor({ executorDescriptor, phaseRequest, phaseContext, programId, stepId, stepIndex,
  authorityCeilingDigest, maxCompletionTokens, maxResultBytes }) {
  return deepFreeze({
    schemaVersion: 1,
    protocolId: REVISION_MISSION_OPERATION_SOURCE_PROTOCOL_ID,
    sourceKind: 'mission-revision-executor',
    sourceVersion: '1.0.0',
    phase: 'revision',
    round: phaseRequest.round,
    executorDescriptorDigest: executorDescriptor.descriptorDigest,
    phaseRequestDigest: phaseRequest.requestDigest,
    contextDigest: sha256Value(phaseContext),
    programId,
    stepId,
    stepIndex,
    authorityCeilingDigest,
    maxCompletionTokens,
    maxResultBytes,
  });
}

function verifyOperationRequest(request, sourceDescriptor) {
  object(request, 'revision mission-operation request');
  if (request.operationKind !== 'revision'
      || request.programId !== sourceDescriptor.programId
      || request.stepId !== sourceDescriptor.stepId
      || request.stepIndex !== sourceDescriptor.stepIndex
      || request.inputDigest !== sourceDescriptor.phaseRequestDigest
      || request.authorityCeilingDigest !== sourceDescriptor.authorityCeilingDigest
      || request.maxCompletionTokens !== sourceDescriptor.maxCompletionTokens
      || request.maxResultBytes !== sourceDescriptor.maxResultBytes) {
    fail('phase-binding', 'revision operation request does not match the pinned phase');
  }
  return request;
}

function phaseResultToCompletion(phaseResult, { phaseRequest, executorDescriptor, operationRequest }) {
  const verified = verifyMissionPhaseResult(phaseResult, {
    request: phaseRequest,
    descriptor: executorDescriptor,
  });
  const receipt = verified.receipt;
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-long-horizon-mission-program-v1',
    programId: operationRequest.programId,
    stepId: operationRequest.stepId,
    stepIndex: operationRequest.stepIndex,
    kind: operationRequest.operationKind,
    dispatchId: operationRequest.dispatchId,
    dispatchDigest: operationRequest.dispatchDigest,
    resultDigest: receipt.resultDigest,
    resultBytes: receipt.artifactBytes,
    usage: clone(receipt.usage),
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
  };
  return deepFreeze({ ...unsigned, completionDigest: sha256Value(unsigned) });
}

function projectReconciliation(value, options) {
  object(value, 'revision executor reconciliation');
  if (value.status === 'absent' || value.status === 'pending') {
    exactKeys(value, ['status'], 'revision executor non-terminal reconciliation');
    return { status: value.status };
  }
  exactKeys(value, ['status', 'result'], 'revision executor completed reconciliation');
  if (value.status !== 'completed') fail('executor-reconciliation', 'revision executor reconciliation is invalid');
  return {
    status: 'completed',
    completion: phaseResultToCompletion(value.result, options),
  };
}

export async function createRevisionMissionOperationAdapter(options = {}) {
  exactKeys(options, [
    'executor',
    'programId',
    'stepId',
    'stepIndex',
    'authorityCeilingDigest',
    'maxCompletionTokens',
    'maxResultBytes',
    'phaseRequest',
    'phaseContext',
  ], 'revision mission-operation adapter options');
  const executor = verifyExecutor(options.executor);
  requireDigest(options.programId, 'mission program id');
  requireIdentifier(options.stepId, 'mission step id');
  requireInteger(options.stepIndex, 'mission step index', 0, 7);
  requireDigest(options.authorityCeilingDigest, 'authority ceiling digest');
  requireInteger(options.maxCompletionTokens, 'mission completion ceiling', 1, 4_000_000);
  requireInteger(options.maxResultBytes, 'mission result ceiling', 1, MAX_RESULT_BYTES);

  let executorDescriptor;
  try {
    executorDescriptor = verifyMissionExecutorDescriptor(clone(await executor.descriptor()), 'revision');
  } catch (error) {
    if (error instanceof RevisionMissionOperationAdapterError) throw error;
    throw new RevisionMissionOperationAdapterError('executor-descriptor', 'revision executor descriptor is invalid', { cause: error });
  }
  const phaseContext = credentialFreeClone(options.phaseContext, 'revision phase context');
  const phaseRequest = credentialFreeClone(options.phaseRequest, 'revision phase request');
  try {
    verifyMissionPhaseRequest(phaseRequest, {
      admission: phaseContext.admission,
      descriptor: executorDescriptor,
    });
  } catch (error) {
    throw new RevisionMissionOperationAdapterError('phase-request', 'revision phase request is invalid', { cause: error });
  }
  if (phaseRequest.phase !== 'revision'
      || phaseRequest.maxCompletionTokens !== options.maxCompletionTokens
      || phaseContext.admission.authorityCeilingDigest !== options.authorityCeilingDigest) {
    fail('phase-binding', 'revision phase request does not match the operation ceilings');
  }
  const verifiedContext = verifyContext(phaseContext, phaseRequest);
  const pinned = buildSourceDescriptor({
    executorDescriptor,
    phaseRequest,
    phaseContext: verifiedContext,
    programId: options.programId,
    stepId: options.stepId,
    stepIndex: options.stepIndex,
    authorityCeilingDigest: options.authorityCeilingDigest,
    maxCompletionTokens: options.maxCompletionTokens,
    maxResultBytes: options.maxResultBytes,
  });

  function liveSourceDescriptor() {
    return Promise.resolve(executor.descriptor()).then((value) => {
      let liveDescriptor;
      try {
        liveDescriptor = verifyMissionExecutorDescriptor(clone(value), 'revision');
      } catch (error) {
        throw new RevisionMissionOperationAdapterError('executor-descriptor', 'live revision executor descriptor is invalid', { cause: error });
      }
      return buildSourceDescriptor({
        executorDescriptor: liveDescriptor,
        phaseRequest,
        phaseContext: verifiedContext,
        programId: options.programId,
        stepId: options.stepId,
        stepIndex: options.stepIndex,
        authorityCeilingDigest: options.authorityCeilingDigest,
        maxCompletionTokens: options.maxCompletionTokens,
        maxResultBytes: options.maxResultBytes,
      });
    });
  }

  const source = {
    descriptor: liveSourceDescriptor,
    async reconcile({ request }) {
      verifyOperationRequest(request, pinned);
      const currentDescriptor = verifyMissionExecutorDescriptor(clone(await executor.descriptor()), 'revision');
      if (currentDescriptor.descriptorDigest !== pinned.executorDescriptorDigest) {
        fail('source-drift', 'revision executor descriptor changed');
      }
      const outcome = await executor.reconcile(clone(phaseRequest), clone(verifiedContext));
      return projectReconciliation(outcome, {
        phaseRequest,
        executorDescriptor: currentDescriptor,
        operationRequest: request,
      });
    },
    async execute({ request }) {
      verifyOperationRequest(request, pinned);
      const currentDescriptor = verifyMissionExecutorDescriptor(clone(await executor.descriptor()), 'revision');
      if (currentDescriptor.descriptorDigest !== pinned.executorDescriptorDigest) {
        fail('source-drift', 'revision executor descriptor changed');
      }
      const result = await executor.execute(clone(phaseRequest), clone(verifiedContext));
      return {
        status: 'completed',
        completion: phaseResultToCompletion(result, {
          phaseRequest,
          executorDescriptor: currentDescriptor,
          operationRequest: request,
        }),
      };
    },
  };

  const adapter = await createMissionOperationAdapter({
    operationKind: 'revision',
    adapterId: 'eternities-revision-mission-operation',
    adapterVersion: '1.0.0',
    sourceDescriptor: pinned,
    source,
  });
  return Object.freeze({
    ...adapter,
    describeSource() {
      return clone(pinned);
    },
  });
}
