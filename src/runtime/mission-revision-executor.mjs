import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseResult,
  MissionPhaseContractError,
} from './mission-phase-contracts.mjs';
import {
  createMissionRevisionMaterializer,
  MissionRevisionMaterializerError,
} from './mission-revision-materializer.mjs';
import {
  buildMissionRevisionDispatch,
  verifyMissionRevisionDispatch,
  verifyMissionRevisionTransportCompletion,
  verifyMissionRevisionTransportDescriptor,
} from './mission-revision-transport-contracts.mjs';

const EXECUTOR_PROTOCOL = 'eternities-mission-revision-executor-v1';

export class MissionRevisionExecutorError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'MissionRevisionExecutorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionRevisionExecutorError(code, message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
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

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function verifyTransport(transport) {
  object(transport, 'mission revision transport');
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof transport[method] !== 'function') throw new TypeError(`mission revision transport ${method} is required`);
  }
}

function verifyContext(context) {
  exactKeys(context, ['admission', 'native', 'review'], 'mission revision executor context');
  return context;
}

function reconciliation(value) {
  object(value, 'mission revision transport reconciliation');
  const completed = value.status === 'completed';
  exactKeys(value, completed ? ['status', 'completion'] : ['status'], 'mission revision transport reconciliation');
  if (!['absent', 'pending', 'completed'].includes(value.status)) {
    fail('transport-reconciliation-invalid', 'mission revision transport reconciliation state is ambiguous');
  }
  return value;
}

function cacheIdentity(request, context) {
  return {
    requestValueDigest: sha256Value(request),
    contextDigest: sha256Value(context),
  };
}

export async function createMissionRevisionExecutor({
  maximumMaterializedBytes = 1_048_576,
  executorIdPrefix = 'mission-revision',
  transport,
} = {}) {
  verifyTransport(transport);
  const transportDescriptor = verifyMissionRevisionTransportDescriptor(clone(await transport.descriptor()));
  const materializer = createMissionRevisionMaterializer({ maximumMaterializedBytes });
  const bindingDigest = sha256Value({
    protocolId: EXECUTOR_PROTOCOL,
    materializerDigest: materializer.materializerDigest,
    transportDescriptorDigest: transportDescriptor.descriptorDigest,
  });
  const descriptor = buildMissionExecutorDescriptor({
    executorId: `${executorIdPrefix}:${bindingDigest}`,
    phase: 'revision',
  });
  const dispatchCache = new Map();
  const absentReconciliations = new Map();

  function dispatchFor(request, context) {
    verifyContext(context);
    const identity = cacheIdentity(request, context);
    const cached = dispatchCache.get(request?.requestDigest);
    if (cached) {
      if (!same(cached.identity, identity)) {
        fail('dispatch-cache-mismatch', 'revision request or committed context changed after materialization');
      }
      verifyMissionRevisionDispatch(cached.dispatch, {
        admission: context.admission,
        request,
        executorDescriptor: descriptor,
        transportDescriptor,
      });
      return clone(cached.dispatch);
    }
    let packageValue;
    try {
      packageValue = materializer.materialize({
        admission: context.admission,
        request,
        descriptor,
        native: context.native,
        review: context.review,
      });
    } catch (error) {
      if (error instanceof MissionPhaseContractError || error instanceof MissionRevisionMaterializerError) {
        throw new MissionRevisionExecutorError(
          'context-materialization-invalid',
          `mission revision context failed exact verification: ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
    const dispatch = buildMissionRevisionDispatch({
      admission: context.admission,
      request,
      executorDescriptor: descriptor,
      transportDescriptor,
      packageValue,
    });
    dispatchCache.set(request.requestDigest, deepFreeze({ identity, dispatch }));
    return clone(dispatch);
  }

  function resultFromCompletion(completion, request, dispatch) {
    verifyMissionRevisionTransportCompletion(completion, { dispatch, transportDescriptor });
    return buildMissionPhaseResult({
      request,
      descriptor,
      artifact: completion.artifact,
      usage: completion.usage,
      startedAt: completion.startedAt,
      completedAt: completion.completedAt,
      executorEvidenceDigest: completion.completionDigest,
    });
  }

  return Object.freeze({
    materializerDigest: materializer.materializerDigest,
    transportDescriptorDigest: transportDescriptor.descriptorDigest,
    bindingDigest,
    descriptor() {
      return clone(descriptor);
    },
    async reconcile(request, context) {
      const dispatch = dispatchFor(request, context);
      const value = reconciliation(clone(await transport.reconcile(clone(dispatch))));
      if (value.status === 'absent') {
        absentReconciliations.set(request.requestDigest, deepFreeze({
          ...cacheIdentity(request, context),
          dispatchDigest: dispatch.dispatchDigest,
        }));
        return Object.freeze({ status: 'absent' });
      }
      absentReconciliations.delete(request.requestDigest);
      if (value.status === 'pending') return Object.freeze({ status: 'pending' });
      const result = resultFromCompletion(value.completion, request, dispatch);
      dispatchCache.delete(request.requestDigest);
      return deepFreeze({ status: 'completed', result });
    },
    async execute(request, context) {
      const marker = absentReconciliations.get(request?.requestDigest);
      if (!marker) fail('reconciliation-required', 'exact absent reconciliation is required before revision execution');
      absentReconciliations.delete(request.requestDigest);
      const dispatch = dispatchFor(request, context);
      const identity = cacheIdentity(request, context);
      if (marker.dispatchDigest !== dispatch.dispatchDigest
          || marker.requestValueDigest !== identity.requestValueDigest
          || marker.contextDigest !== identity.contextDigest) {
        fail('reconciliation-changed', 'revision request or context changed after absent reconciliation');
      }
      const value = reconciliation(clone(await transport.execute(clone(dispatch))));
      if (value.status !== 'completed') {
        fail('transport-execution-invalid', 'mission revision transport execution did not return one completed result');
      }
      const result = resultFromCompletion(value.completion, request, dispatch);
      dispatchCache.delete(request.requestDigest);
      return result;
    },
  });
}
