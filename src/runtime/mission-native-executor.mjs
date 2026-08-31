import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseResult,
  MissionPhaseContractError,
} from './mission-phase-contracts.mjs';
import {
  createMissionNativeMaterializer,
  MissionNativeMaterializerError,
} from './mission-native-materializer.mjs';
import {
  buildMissionNativeDispatch,
  verifyMissionNativeDispatch,
  verifyMissionNativeTransportCompletion,
  verifyMissionNativeTransportDescriptor,
} from './mission-native-transport-contracts.mjs';

const EXECUTOR_PROTOCOL = 'eternities-mission-native-executor-v1';

export class MissionNativeExecutorError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'MissionNativeExecutorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionNativeExecutorError(code, message);
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
  object(transport, 'mission native transport');
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof transport[method] !== 'function') throw new TypeError(`mission native transport ${method} is required`);
  }
}

function verifyContext(context) {
  exactKeys(context, ['admission', 'mission', 'godskillsBinding'], 'mission native executor context');
  return context;
}

function reconciliation(value) {
  object(value, 'mission native transport reconciliation');
  const completed = value.status === 'completed';
  exactKeys(value, completed ? ['status', 'completion'] : ['status'], 'mission native transport reconciliation');
  if (!['absent', 'pending', 'completed'].includes(value.status)) {
    fail('transport-reconciliation-invalid', 'mission native transport reconciliation state is ambiguous');
  }
  return value;
}

function cacheIdentity(request, context) {
  return {
    requestValueDigest: sha256Value(request),
    contextDigest: sha256Value(context),
  };
}

export async function createMissionNativeExecutor({
  maximumMaterializedBytes = 1_048_576,
  executorIdPrefix = 'mission-native',
  transport,
} = {}) {
  verifyTransport(transport);
  const transportDescriptor = verifyMissionNativeTransportDescriptor(clone(await transport.descriptor()));
  const materializer = createMissionNativeMaterializer({ maximumMaterializedBytes });
  const bindingDigest = sha256Value({
    protocolId: EXECUTOR_PROTOCOL,
    materializerDigest: materializer.materializerDigest,
    transportDescriptorDigest: transportDescriptor.descriptorDigest,
  });
  const descriptor = buildMissionExecutorDescriptor({
    executorId: `${executorIdPrefix}:${bindingDigest}`,
    phase: 'native',
  });
  const dispatchCache = new Map();
  const absentReconciliations = new Map();

  function dispatchFor(request, context) {
    verifyContext(context);
    const identity = cacheIdentity(request, context);
    const cached = dispatchCache.get(request?.requestDigest);
    if (cached) {
      if (!same(cached.identity, identity)) {
        fail('dispatch-cache-mismatch', 'native request or admitted context changed after materialization');
      }
      verifyMissionNativeDispatch(cached.dispatch, {
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
        mission: context.mission,
        godskillsBinding: context.godskillsBinding,
      });
    } catch (error) {
      if (error instanceof MissionPhaseContractError || error instanceof MissionNativeMaterializerError) {
        throw new MissionNativeExecutorError(
          'context-materialization-invalid',
          `mission native context failed exact verification: ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
    const dispatch = buildMissionNativeDispatch({
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
    verifyMissionNativeTransportCompletion(completion, { dispatch, transportDescriptor });
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
      if (!marker) fail('reconciliation-required', 'exact absent reconciliation is required before native execution');
      absentReconciliations.delete(request.requestDigest);
      const dispatch = dispatchFor(request, context);
      const identity = cacheIdentity(request, context);
      if (marker.dispatchDigest !== dispatch.dispatchDigest
          || marker.requestValueDigest !== identity.requestValueDigest
          || marker.contextDigest !== identity.contextDigest) {
        fail('reconciliation-changed', 'native request or context changed after absent reconciliation');
      }
      const value = reconciliation(clone(await transport.execute(clone(dispatch))));
      if (value.status !== 'completed') {
        fail('transport-execution-invalid', 'mission native transport execution did not return one completed result');
      }
      const result = resultFromCompletion(value.completion, request, dispatch);
      dispatchCache.delete(request.requestDigest);
      return result;
    },
  });
}
