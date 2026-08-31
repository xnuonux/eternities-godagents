import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseResult,
  MissionPhaseContractError,
} from '../runtime/mission-phase-contracts.mjs';
import {
  createDeferredGodskillsReviewMaterializer,
  DeferredGodskillsReviewMaterializerError,
} from './deferred-review-materializer.mjs';
import {
  buildGodskillsReviewDispatch,
  verifyGodskillsReviewDispatch,
  verifyGodskillsReviewTransportCompletion,
  verifyGodskillsReviewTransportDescriptor,
} from './review-transport-contracts.mjs';

const EXECUTOR_PROTOCOL = 'eternities-deferred-godskills-review-executor-v1';

export class DeferredGodskillsReviewExecutorError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'DeferredGodskillsReviewExecutorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new DeferredGodskillsReviewExecutorError(code, message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
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
  object(transport, 'Godskills review transport');
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof transport[method] !== 'function') throw new TypeError(`Godskills review transport ${method} is required`);
  }
}

function verifyReviewContext(context, request) {
  exactKeys(context, [
    'admission',
    'subject',
    'deferredReviews',
    'godskillsReceipt',
    'priorReview',
    'revision',
  ], 'Godskills review executor context');
  if (!context.admission?.godskills
      || !same(context.deferredReviews, context.admission.godskills.deferredReviews)
      || !same(context.godskillsReceipt, context.admission.godskills.receipt)) {
    fail('context-binding-invalid', 'Godskills review context does not match its admission');
  }
  if (request.round === 1) {
    if (context.priorReview !== null || context.revision !== null) {
      fail('context-round-invalid', 'round one review context cannot carry revision history');
    }
  } else if (request.round === 2) {
    if (context.priorReview === null || context.revision === null || !same(context.subject, context.revision)) {
      fail('context-round-invalid', 'round two review context lacks its exact revision history');
    }
  } else {
    fail('context-round-invalid', 'Godskills review context round is invalid');
  }
  return context;
}

function reconciliation(value) {
  object(value, 'Godskills review transport reconciliation');
  const completed = value.status === 'completed';
  exactKeys(value, completed ? ['status', 'completion'] : ['status'], 'Godskills review transport reconciliation');
  if (!['absent', 'pending', 'completed'].includes(value.status)) {
    fail('transport-reconciliation-invalid', 'Godskills review transport reconciliation is ambiguous');
  }
  return value;
}

function cacheIdentity(request, context) {
  return {
    requestValueDigest: sha256Value(request),
    contextDigest: sha256Value(context),
  };
}

export async function createDeferredGodskillsReviewExecutor({
  releasePin,
  maximumMaterializedBytes = 1_048_576,
  executorIdPrefix = 'godskills-review',
  transport,
  artifactCache,
  io,
} = {}) {
  verifyTransport(transport);
  const transportDescriptor = verifyGodskillsReviewTransportDescriptor(clone(await transport.descriptor()));
  const materializer = await createDeferredGodskillsReviewMaterializer({
    releasePin,
    maximumMaterializedBytes,
    artifactCache,
    io,
  });
  const bindingDigest = sha256Value({
    protocolId: EXECUTOR_PROTOCOL,
    releaseDigest: materializer.releaseDigest,
    activationTrustRootDigest: materializer.activationTrustRootDigest,
    materializerDigest: materializer.materializerDigest,
    transportDescriptorDigest: transportDescriptor.descriptorDigest,
  });
  const descriptor = buildMissionExecutorDescriptor({
    executorId: `${executorIdPrefix}:${bindingDigest}`,
    phase: 'review',
  });
  const dispatchCache = new Map();
  const absentReconciliations = new Map();

  async function dispatchFor(request, context) {
    verifyReviewContext(context, request);
    const identity = cacheIdentity(request, context);
    const cached = dispatchCache.get(request?.requestDigest);
    if (cached) {
      if (!same(cached.identity, identity)) {
        fail('dispatch-cache-mismatch', 'review request or committed context changed after materialization');
      }
      verifyGodskillsReviewDispatch(cached.dispatch, {
        request,
        executorDescriptor: descriptor,
        transportDescriptor,
      });
      return clone(cached.dispatch);
    }
    let packageValue;
    try {
      packageValue = await materializer.materialize({
        admission: context.admission,
        request,
        descriptor,
        subject: context.subject,
        priorReview: context.priorReview,
      });
    } catch (error) {
      if (error instanceof MissionPhaseContractError
          || error instanceof DeferredGodskillsReviewMaterializerError) {
        throw new DeferredGodskillsReviewExecutorError(
          'context-materialization-invalid',
          `Godskills review context or admission failed exact verification: ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
    const dispatch = buildGodskillsReviewDispatch({
      request,
      executorDescriptor: descriptor,
      transportDescriptor,
      packageValue,
    });
    dispatchCache.set(request.requestDigest, deepFreeze({ identity, dispatch }));
    return clone(dispatch);
  }

  function resultFromCompletion(completion, request, dispatch) {
    verifyGodskillsReviewTransportCompletion(completion, { dispatch, transportDescriptor });
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
    releaseDigest: materializer.releaseDigest,
    activationTrustRootDigest: materializer.activationTrustRootDigest,
    materializerDigest: materializer.materializerDigest,
    transportDescriptorDigest: transportDescriptor.descriptorDigest,
    bindingDigest,
    descriptor() {
      return clone(descriptor);
    },
    async reconcile(request, context) {
      const dispatch = await dispatchFor(request, context);
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
      if (!marker) fail('reconciliation-required', 'exact absent reconciliation is required before review execution');
      absentReconciliations.delete(request.requestDigest);
      const dispatch = await dispatchFor(request, context);
      const identity = cacheIdentity(request, context);
      if (marker.dispatchDigest !== dispatch.dispatchDigest
          || marker.requestValueDigest !== identity.requestValueDigest
          || marker.contextDigest !== identity.contextDigest) {
        fail('reconciliation-changed', 'review request or context changed after absent reconciliation');
      }
      const value = reconciliation(clone(await transport.execute(clone(dispatch))));
      if (value.status !== 'completed') {
        fail('transport-execution-invalid', 'review transport execution did not return one completed result');
      }
      const result = resultFromCompletion(value.completion, request, dispatch);
      dispatchCache.delete(request.requestDigest);
      return result;
    },
  });
}
