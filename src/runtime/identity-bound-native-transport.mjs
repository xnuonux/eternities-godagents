import { verifyCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import {
  buildIdentityBoundNativeDispatch,
  verifyIdentityBoundNativeCompletion,
  verifyIdentityBoundNativeTransportDescriptor,
} from './identity-bound-native-contracts.mjs';
import {
  buildMissionNativeTransportCompletion,
  buildMissionNativeTransportDescriptor,
} from './mission-native-transport-contracts.mjs';

const PROTOCOL_ID = 'eternities-identity-bound-mission-native-wrapper-v1';
const DIGEST = /^[a-f0-9]{64}$/;

export class IdentityBoundMissionNativeTransportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IdentityBoundMissionNativeTransportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new IdentityBoundMissionNativeTransportError(code, message);
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

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function verifyTransport(transport) {
  object(transport, 'identity-bound native transport');
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof transport[method] !== 'function') {
      throw new TypeError(`identity-bound native transport ${method} is required`);
    }
  }
}

function reconciliation(value) {
  object(value, 'identity-bound native reconciliation');
  const completed = value.status === 'completed';
  exactKeys(value, completed ? ['status', 'completion'] : ['status'], 'identity-bound native reconciliation');
  if (!['absent', 'pending', 'completed'].includes(value.status)) {
    fail('reconciliation-invalid', 'identity-bound native reconciliation state is ambiguous');
  }
  return value;
}

export async function createIdentityBoundMissionNativeTransport({
  candidate: inputCandidate,
  vesselAdmissionDigest,
  transport,
} = {}) {
  if (typeof vesselAdmissionDigest !== 'string' || !DIGEST.test(vesselAdmissionDigest)) {
    throw new TypeError('identity-bound vessel admission digest is required');
  }
  verifyTransport(transport);
  const candidate = verifyCortexBindingCandidate(clone(inputCandidate));
  const innerDescriptor = verifyIdentityBoundNativeTransportDescriptor(clone(await transport.descriptor()));
  const bindingDigest = sha256Value({
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    vesselAdmissionDigest,
    bindingCandidateId: candidate.bindingCandidateId,
    candidateDigest: candidate.candidateDigest,
    modelProjectionDigest: candidate.modelProjectionDigest,
    innerTransportDescriptorDigest: innerDescriptor.descriptorDigest,
  });
  const outerDescriptor = buildMissionNativeTransportDescriptor({
    transportId: `identity-bound-native:${bindingDigest}`,
    maximumCompletionBytes: innerDescriptor.maximumCompletionBytes,
  });
  const dispatchCache = new Map();
  const absentReconciliations = new Map();

  function dispatchFor(outerDispatch) {
    if (outerDispatch?.transportDescriptorDigest !== outerDescriptor.descriptorDigest) {
      fail('outer-descriptor-mismatch', 'outer native dispatch targets a different identity-bound transport');
    }
    const cached = dispatchCache.get(outerDispatch?.dispatchDigest);
    const dispatch = buildIdentityBoundNativeDispatch({
      candidate,
      vesselAdmissionDigest,
      outerDispatch,
      transportDescriptor: innerDescriptor,
    });
    if (cached && !same(cached, dispatch)) {
      fail('dispatch-cache-mismatch', 'identity-bound native dispatch changed after materialization');
    }
    if (!cached) dispatchCache.set(dispatch.outerDispatchDigest, deepFreeze(clone(dispatch)));
    return clone(dispatch);
  }

  function outerCompletion(innerCompletion, outerDispatch, innerDispatch) {
    verifyIdentityBoundNativeCompletion(innerCompletion, {
      dispatch: innerDispatch,
      transportDescriptor: innerDescriptor,
    });
    return buildMissionNativeTransportCompletion({
      dispatch: outerDispatch,
      transportDescriptor: outerDescriptor,
      artifact: innerCompletion.artifact,
      usage: innerCompletion.usage,
      startedAt: innerCompletion.startedAt,
      completedAt: innerCompletion.completedAt,
    });
  }

  return Object.freeze({
    protocolId: PROTOCOL_ID,
    bindingDigest,
    candidateDigest: candidate.candidateDigest,
    modelProjectionDigest: candidate.modelProjectionDigest,
    innerTransportDescriptorDigest: innerDescriptor.descriptorDigest,
    descriptor() {
      return clone(outerDescriptor);
    },
    async reconcile(outerDispatch) {
      const innerDispatch = dispatchFor(outerDispatch);
      const value = reconciliation(clone(await transport.reconcile(clone(innerDispatch))));
      if (value.status === 'absent') {
        absentReconciliations.set(innerDispatch.outerDispatchDigest, innerDispatch.dispatchDigest);
        return Object.freeze({ status: 'absent' });
      }
      absentReconciliations.delete(innerDispatch.outerDispatchDigest);
      if (value.status === 'pending') return Object.freeze({ status: 'pending' });
      const completion = outerCompletion(value.completion, outerDispatch, innerDispatch);
      dispatchCache.delete(innerDispatch.outerDispatchDigest);
      return deepFreeze({ status: 'completed', completion });
    },
    async execute(outerDispatch) {
      const innerDispatch = dispatchFor(outerDispatch);
      const marker = absentReconciliations.get(innerDispatch.outerDispatchDigest);
      if (marker !== innerDispatch.dispatchDigest) {
        fail('reconciliation-required', 'exact absent reconciliation is required before identity-bound native execution');
      }
      absentReconciliations.delete(innerDispatch.outerDispatchDigest);
      const value = reconciliation(clone(await transport.execute(clone(innerDispatch))));
      if (value.status !== 'completed') {
        fail('execution-invalid', 'identity-bound native execution did not return one completed result');
      }
      const completion = outerCompletion(value.completion, outerDispatch, innerDispatch);
      dispatchCache.delete(innerDispatch.outerDispatchDigest);
      return deepFreeze({ status: 'completed', completion });
    },
  });
}
