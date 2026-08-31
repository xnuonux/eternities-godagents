import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { createHttpsTransport } from '../cortex/http-transport.mjs';
import {
  buildIdentityBoundNativeTransportDescriptor,
  verifyIdentityBoundNativeCompletion,
} from '../runtime/identity-bound-native-contracts.mjs';
import {
  buildMissionRevisionTransportDescriptor,
  verifyMissionRevisionTransportCompletion,
} from '../runtime/mission-revision-transport-contracts.mjs';
import {
  buildGodskillsReviewTransportDescriptor,
  verifyGodskillsReviewTransportCompletion,
} from '../skills/review-transport-contracts.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import {
  createOpenAICompatiblePhaseCredentialResolver,
  loadOpenAICompatiblePhaseTransportPolicy,
} from './openai-compatible-phase-policy.mjs';
import {
  compileOpenAICompatiblePhaseRequest,
  completeOpenAICompatiblePhaseResponse,
  OpenAICompatiblePhaseProtocolError,
} from './openai-compatible-phase-protocol.mjs';
import {
  buildOpenAICompatiblePhaseResponseWitness,
  loadOpenAICompatiblePhaseResolutionPolicy,
  OpenAICompatiblePhaseResolutionError,
  verifyOpenAICompatiblePhaseResolutionDecision,
  verifyOpenAICompatiblePhaseResponseWitness,
} from './openai-compatible-phase-resolution.mjs';

const MESSAGES = Object.freeze({
  'credential-in-input': 'OpenAI-compatible phase transport input contains its credential',
  'operation-pending': 'OpenAI-compatible phase transport operation is pending',
  'operation-integrity': 'OpenAI-compatible phase transport operation integrity failed',
  'provider-ambiguous': 'OpenAI-compatible phase provider outcome is ambiguous',
  'provider-rejected': 'OpenAI-compatible phase provider rejected the request',
  'response-over-budget': 'OpenAI-compatible phase provider response exceeded its byte ceiling',
  'response-invalid': 'OpenAI-compatible phase provider response is invalid',
  'credential-reflected': 'OpenAI-compatible phase provider response reflected its credential',
  'operator-abandoned': 'OpenAI-compatible phase operation was abandoned by its operator',
  'resolution-not-pending': 'OpenAI-compatible phase operation is not pending resolution',
});

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PREPARED_PROTOCOL = 'eternities-openai-compatible-phase-prepared-v1';
const ATTEMPT_PROTOCOL = 'eternities-openai-compatible-phase-attempt-v1';
const FAILURE_PROTOCOL = 'eternities-openai-compatible-phase-failure-v1';
const RESOLUTION_PROTOCOL = 'eternities-openai-compatible-phase-resolution-record-v1';
const RESOLUTION_DECISION_PROTOCOL = 'eternities-openai-compatible-phase-resolution-decision-v1';
const PHASES = new Set(['native', 'review', 'revision']);
const RESOLUTION_DISPOSITIONS = new Set(['adopt-response', 'abandon']);
const FAILURE_REASONS = new Set([
  'provider-rejected',
  'response-over-budget',
  'response-invalid',
  'credential-reflected',
  'operator-abandoned',
]);
const OPERATION_FILES = new Set([
  'prepared.json',
  'attempt.json',
  'resolution.json',
  'completion.json',
  'failure.json',
  'execution.lock',
]);

export class OpenAICompatiblePhaseTransportError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('phase transport error code is invalid');
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'OpenAICompatiblePhaseTransportError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new OpenAICompatiblePhaseTransportError(code, cause);
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

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntegrityError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new IntegrityError(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new IntegrityError(`${label} digest is invalid`);
  }
}

function isoNow(clock, label) {
  const value = clock();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw new TypeError(`${label} clock value is invalid`);
  return parsed.toISOString();
}

async function metadata(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function requireDirectory(path, label) {
  const value = await metadata(path);
  if (!value || !value.isDirectory() || value.isSymbolicLink()) {
    throw new IntegrityError(`${label} is not one local directory`);
  }
}

async function readCanonical(path, label) {
  const value = await metadata(path);
  if (!value) return null;
  if (!value.isFile() || value.isSymbolicLink()) throw new IntegrityError(`${label} is not one regular file`);
  const text = await readFile(path, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new IntegrityError(`${label} is malformed`, { cause: error });
  }
  if (text !== `${canonicalJson(parsed)}\n`) throw new IntegrityError(`${label} is not canonical`);
  return parsed;
}

function withRecordDigest(unsigned) {
  return deepFreeze({ ...unsigned, recordDigest: sha256Value(unsigned) });
}

function preparedRecord({ phase, policyDigest, descriptor, dispatch, request }) {
  return withRecordDigest({
    schemaVersion: 1,
    protocolId: PREPARED_PROTOCOL,
    phase,
    policyDigest,
    transportDescriptorDigest: descriptor.descriptorDigest,
    dispatchDigest: dispatch.dispatchDigest,
    requestDigest: request.requestDigest,
    requestBytes: request.bodyBytes,
  });
}

function verifyPrepared(value, expected) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'phase', 'policyDigest',
    'transportDescriptorDigest', 'dispatchDigest', 'requestDigest',
    'requestBytes', 'recordDigest',
  ], 'phase prepared record');
  const { recordDigest, ...unsigned } = value;
  requireDigest(recordDigest, 'phase prepared record');
  if (value.schemaVersion !== 1 || value.protocolId !== PREPARED_PROTOCOL
      || canonicalJson(value) !== canonicalJson(expected)
      || sha256Value(unsigned) !== recordDigest) {
    throw new IntegrityError('phase prepared record binding is invalid');
  }
  return value;
}

function attemptRecord({ phase, dispatch, request, startedAt }) {
  const identity = {
    schemaVersion: 1,
    protocolId: ATTEMPT_PROTOCOL,
    phase,
    dispatchDigest: dispatch.dispatchDigest,
    requestDigest: request.requestDigest,
  };
  return withRecordDigest({
    ...identity,
    attemptId: sha256Value(identity),
    startedAt,
  });
}

function verifyAttempt(value, { phase, dispatch, request }) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'phase', 'dispatchDigest', 'requestDigest',
    'attemptId', 'startedAt', 'recordDigest',
  ], 'phase attempt record');
  const { recordDigest, startedAt, attemptId, ...identity } = value;
  requireDigest(attemptId, 'phase attempt');
  requireDigest(recordDigest, 'phase attempt record');
  if (value.schemaVersion !== 1 || value.protocolId !== ATTEMPT_PROTOCOL
      || value.phase !== phase || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== request.requestDigest
      || attemptId !== sha256Value(identity)
      || !Number.isFinite(Date.parse(startedAt))
      || recordDigest !== sha256Value({ ...identity, attemptId, startedAt })) {
    throw new IntegrityError('phase attempt record binding is invalid');
  }
  return value;
}

function failureRecord({ phase, dispatch, request, attempt, reasonCode, httpStatus, responseDigest, failedAt }) {
  return withRecordDigest({
    schemaVersion: 1,
    protocolId: FAILURE_PROTOCOL,
    status: 'failed',
    phase,
    dispatchDigest: dispatch.dispatchDigest,
    requestDigest: request.requestDigest,
    attemptId: attempt.attemptId,
    reasonCode,
    httpStatus,
    responseDigest,
    failedAt,
  });
}

function verifyFailure(value, { phase, dispatch, request, attempt }) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'phase', 'dispatchDigest',
    'requestDigest', 'attemptId', 'reasonCode', 'httpStatus',
    'responseDigest', 'failedAt', 'recordDigest',
  ], 'phase failure record');
  const { recordDigest, ...unsigned } = value;
  requireDigest(recordDigest, 'phase failure record');
  if (value.schemaVersion !== 1 || value.protocolId !== FAILURE_PROTOCOL || value.status !== 'failed'
      || value.phase !== phase || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== request.requestDigest || value.attemptId !== attempt.attemptId
      || !FAILURE_REASONS.has(value.reasonCode)
      || (value.httpStatus !== null && (!Number.isInteger(value.httpStatus) || value.httpStatus < 100 || value.httpStatus > 599))
      || (value.responseDigest !== null && !DIGEST.test(value.responseDigest))
      || !Number.isFinite(Date.parse(value.failedAt))
      || sha256Value(unsigned) !== recordDigest) {
    throw new IntegrityError('phase failure record binding is invalid');
  }
  return value;
}

function resolutionRecord({
  phase,
  dispatch,
  request,
  attempt,
  loadedPolicy,
  verifiedDecision,
  responseWitness,
  acceptedAt,
}) {
  return withRecordDigest({
    schemaVersion: 1,
    protocolId: RESOLUTION_PROTOCOL,
    status: 'accepted',
    phase,
    dispatchDigest: dispatch.dispatchDigest,
    requestDigest: request.requestDigest,
    attemptId: attempt.attemptId,
    resolutionPolicyDigest: loadedPolicy.digest,
    decisionDigest: verifiedDecision.decision.decisionDigest,
    disposition: verifiedDecision.decision.disposition,
    signedDecision: clone(verifiedDecision),
    responseWitness: responseWitness === null ? null : clone(responseWitness),
    acceptedAt,
  });
}

function verifyResolutionRecord(value, {
  phase,
  dispatch,
  request,
  attempt,
  loadedPolicy,
} = {}) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'phase', 'dispatchDigest',
    'requestDigest', 'attemptId', 'resolutionPolicyDigest', 'decisionDigest',
    'disposition', 'signedDecision', 'responseWitness', 'acceptedAt',
    'recordDigest',
  ], 'phase resolution record');
  const { recordDigest, ...unsigned } = value;
  requireDigest(recordDigest, 'phase resolution record');
  exactKeys(value.signedDecision, ['decision', 'signature'], 'phase resolution signed decision');
  exactKeys(value.signedDecision.decision, [
    'schemaVersion', 'protocolId', 'policyDigest', 'keyId', 'phase',
    'dispatchDigest', 'requestDigest', 'attemptId', 'disposition',
    'responseDigest', 'issuedAt', 'expiresAt', 'nonce', 'decisionDigest',
  ], 'phase resolution decision');
  const decision = value.signedDecision.decision;
  const { decisionDigest, ...decisionUnsigned } = decision;
  const acceptedAt = Date.parse(value.acceptedAt);
  const issuedAt = Date.parse(decision.issuedAt);
  const expiresAt = Date.parse(decision.expiresAt);
  const witness = value.responseWitness === null
    ? null
    : verifyOpenAICompatiblePhaseResponseWitness(value.responseWitness);
  if (value.schemaVersion !== 1 || value.protocolId !== RESOLUTION_PROTOCOL
      || value.status !== 'accepted' || value.phase !== phase
      || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== request.requestDigest
      || value.attemptId !== attempt.attemptId
      || !DIGEST.test(value.resolutionPolicyDigest)
      || value.decisionDigest !== decisionDigest
      || value.disposition !== decision.disposition
      || decision.schemaVersion !== 1 || decision.protocolId !== RESOLUTION_DECISION_PROTOCOL
      || !IDENTIFIER.test(decision.keyId) || !PHASES.has(decision.phase)
      || !RESOLUTION_DISPOSITIONS.has(decision.disposition) || !NONCE.test(decision.nonce)
      || decision.policyDigest !== value.resolutionPolicyDigest
      || decision.phase !== phase || decision.dispatchDigest !== dispatch.dispatchDigest
      || decision.requestDigest !== request.requestDigest || decision.attemptId !== attempt.attemptId
      || decisionDigest !== sha256Value(decisionUnsigned)
      || !Number.isFinite(acceptedAt) || new Date(acceptedAt).toISOString() !== value.acceptedAt
      || !Number.isFinite(issuedAt) || new Date(issuedAt).toISOString() !== decision.issuedAt
      || !Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== decision.expiresAt
      || expiresAt <= issuedAt || acceptedAt < issuedAt || acceptedAt > expiresAt
      || (decision.disposition === 'adopt-response'
        ? !witness || decision.responseDigest !== witness.witnessDigest
        : witness !== null || decision.responseDigest !== null)
      || typeof value.signedDecision.signature !== 'string'
      || Buffer.from(value.signedDecision.signature, 'base64').toString('base64')
        !== value.signedDecision.signature
      || Buffer.from(value.signedDecision.signature, 'base64').length !== 64
      || sha256Value(unsigned) !== recordDigest) {
    throw new IntegrityError('phase resolution record binding is invalid');
  }
  if (loadedPolicy) {
    verifyOpenAICompatiblePhaseResolutionDecision({
      signedDecision: value.signedDecision,
      loadedPolicy,
      operation: { phase, dispatchDigest: dispatch.dispatchDigest, requestDigest: request.requestDigest, attemptId: attempt.attemptId },
      responseDigest: witness?.witnessDigest ?? null,
      now: acceptedAt,
    });
  }
  return value;
}

function verifyCompletion(phase, completion, dispatch, descriptor) {
  if (phase === 'native') return verifyIdentityBoundNativeCompletion(completion, { dispatch, transportDescriptor: descriptor });
  if (phase === 'review') return verifyGodskillsReviewTransportCompletion(completion, { dispatch, transportDescriptor: descriptor });
  return verifyMissionRevisionTransportCompletion(completion, { dispatch, transportDescriptor: descriptor });
}

function operationPaths(root, phase, dispatchDigest) {
  const phaseRoot = join(root, phase);
  const operationRoot = join(phaseRoot, dispatchDigest);
  return {
    phaseRoot,
    operationRoot,
    prepared: join(operationRoot, 'prepared.json'),
    attempt: join(operationRoot, 'attempt.json'),
    resolution: join(operationRoot, 'resolution.json'),
    completion: join(operationRoot, 'completion.json'),
    failure: join(operationRoot, 'failure.json'),
    lock: join(operationRoot, 'execution.lock'),
  };
}

async function operationExists(paths) {
  const phase = await metadata(paths.phaseRoot);
  if (!phase) return false;
  if (!phase.isDirectory() || phase.isSymbolicLink()) throw new IntegrityError('phase operation directory is unsafe');
  const operation = await metadata(paths.operationRoot);
  if (!operation) return false;
  if (!operation.isDirectory() || operation.isSymbolicLink()) throw new IntegrityError('phase operation slot is unsafe');
  return true;
}

async function ensureOperation(paths) {
  await mkdir(paths.phaseRoot, { recursive: true });
  await requireDirectory(paths.phaseRoot, 'phase operation directory');
  await mkdir(paths.operationRoot, { recursive: true });
  await requireDirectory(paths.operationRoot, 'phase operation slot');
}

async function verifyEntries(paths) {
  const entries = await readdir(paths.operationRoot);
  const writing = entries.filter((entry) => entry.endsWith('.writing'));
  const unknown = entries.filter((entry) => !OPERATION_FILES.has(entry) && !entry.endsWith('.writing'));
  if (unknown.length > 0) throw new IntegrityError('phase operation slot contains an unknown entry');
  return { writing };
}

async function inspectOperation({
  paths,
  phase,
  dispatch,
  descriptor,
  request,
  expectedPrepared,
  ignoreLock = false,
  returnFailure = false,
  loadedResolutionPolicy,
}) {
  if (!await operationExists(paths)) return { status: 'absent' };
  const { writing } = await verifyEntries(paths);
  const lock = await metadata(paths.lock);
  if (lock && (!lock.isFile() || lock.isSymbolicLink())) throw new IntegrityError('phase operation lock is unsafe');
  if (writing.length > 0 && !lock) throw new IntegrityError('phase operation has abandoned publication state');

  const prepared = await readCanonical(paths.prepared, 'phase prepared record');
  const attempt = await readCanonical(paths.attempt, 'phase attempt record');
  const resolution = await readCanonical(paths.resolution, 'phase resolution record');
  const completion = await readCanonical(paths.completion, 'phase completion record');
  const failure = await readCanonical(paths.failure, 'phase failure record');
  if (completion && failure) throw new IntegrityError('phase operation has contradictory terminal records');
  if ((attempt || resolution || completion || failure) && !prepared) throw new IntegrityError('phase operation lacks its prepared record');
  if ((resolution || completion || failure) && !attempt) throw new IntegrityError('phase operation lacks its attempt record');
  if (prepared) verifyPrepared(prepared, expectedPrepared);
  if (attempt) verifyAttempt(attempt, { phase, dispatch, request });
  if (resolution) verifyResolutionRecord(resolution, {
    phase,
    dispatch,
    request,
    attempt,
    ...(loadedResolutionPolicy ? { loadedPolicy: loadedResolutionPolicy } : {}),
  });
  if (completion) {
    if (resolution && resolution.disposition !== 'adopt-response') {
      throw new IntegrityError('phase completion contradicts its operator resolution');
    }
    verifyCompletion(phase, completion, dispatch, descriptor);
    return { status: 'completed', completion, prepared, attempt, resolution };
  }
  if (failure) {
    if ((resolution && (resolution.disposition !== 'abandon'
        || failure.reasonCode !== 'operator-abandoned'))
        || (!resolution && failure.reasonCode === 'operator-abandoned')) {
      throw new IntegrityError('phase failure contradicts its operator resolution');
    }
    verifyFailure(failure, { phase, dispatch, request, attempt });
    if (returnFailure) return { status: 'failed', failure, prepared, attempt, resolution };
    fail(failure.reasonCode);
  }
  if (attempt || resolution || writing.length > 0 || (lock && !ignoreLock)) {
    return { status: 'pending', prepared, attempt, resolution };
  }
  return { status: 'absent', prepared };
}

async function publishRecord(path, value) {
  return publishFileExclusive({ destinationPath: path, content: `${canonicalJson(value)}\n` });
}

function descriptorSet(policy, policyDigest) {
  const transportId = (phase) => `openai-compatible-${phase}:${policyDigest}`;
  return deepFreeze({
    native: buildIdentityBoundNativeTransportDescriptor({
      transportId: transportId('native'),
      maximumDispatchBytes: policy.phases.native.maximumDispatchBytes,
      maximumCompletionBytes: policy.phases.native.maximumCompletionBytes,
    }),
    review: buildGodskillsReviewTransportDescriptor({
      transportId: transportId('review'),
      maximumCompletionBytes: policy.phases.review.maximumCompletionBytes,
    }),
    revision: buildMissionRevisionTransportDescriptor({
      transportId: transportId('revision'),
      maximumCompletionBytes: policy.phases.revision.maximumCompletionBytes,
    }),
  });
}

function phaseTransport({
  phase,
  descriptor,
  policy,
  policyDigest,
  root,
  credentialResolver,
  network,
  clock,
  checkpoint,
  lockOptions,
}) {
  function prepare(dispatch) {
    const request = compileOpenAICompatiblePhaseRequest({ phase, dispatch, descriptor, policy });
    const expectedPrepared = preparedRecord({ phase, policyDigest, descriptor, dispatch, request });
    return { request, expectedPrepared, paths: operationPaths(root, phase, dispatch.dispatchDigest) };
  }

  function assertSecretAbsent(dispatch, request, credential) {
    if (canonicalJson(dispatch).includes(credential) || request.body.includes(credential)) {
      fail('credential-in-input');
    }
  }

  async function closeFailure({ paths, dispatch, request, attempt, reasonCode, response }) {
    const value = failureRecord({
      phase,
      dispatch,
      request,
      attempt,
      reasonCode,
      httpStatus: Number.isInteger(response?.status) ? response.status : null,
      responseDigest: typeof response?.bodyText === 'string' ? sha256Text(response.bodyText) : null,
      failedAt: isoNow(clock, 'phase failure'),
    });
    if (!await publishRecord(paths.failure, value)) {
      const existing = await readCanonical(paths.failure, 'phase failure record');
      verifyFailure(existing, { phase, dispatch, request, attempt });
      if (canonicalJson(existing) !== canonicalJson(value)) {
        throw new IntegrityError('phase failure record changed under one operation');
      }
    }
    await checkpoint('after-openai-phase-failure-persisted', phase, dispatch.dispatchDigest);
    fail(reasonCode);
  }

  const adapter = Object.freeze({
    descriptor() {
      return clone(descriptor);
    },
    async reconcile(dispatch) {
      const { request, expectedPrepared, paths } = prepare(dispatch);
      try {
        const state = await inspectOperation({
          paths,
          phase,
          dispatch,
          descriptor,
          request,
          expectedPrepared,
        });
        return state.status === 'completed'
          ? deepFreeze({ status: 'completed', completion: clone(state.completion) })
          : Object.freeze({ status: state.status });
      } catch (error) {
        if (error instanceof OpenAICompatiblePhaseTransportError
            || error instanceof OpenAICompatiblePhaseProtocolError) throw error;
        fail('operation-integrity', error);
      }
    },
    async execute(dispatch) {
      const { request, expectedPrepared, paths } = prepare(dispatch);
      try {
        if (!await operationExists(paths)) await ensureOperation(paths);
      } catch (error) {
        fail('operation-integrity', error);
      }

      let lock;
      try {
        lock = await acquireFileLock({ ...lockOptions, lockPath: paths.lock });
      } catch (error) {
        if (error instanceof IntegrityError
            && error.message === 'resource is locked by a live or recent owner') {
          fail('operation-pending', error);
        }
        fail('operation-integrity', error);
      }

      try {
        const existing = await inspectOperation({
          paths,
          phase,
          dispatch,
          descriptor,
          request,
          expectedPrepared,
          ignoreLock: true,
        });
        if (existing.status === 'completed') {
          return deepFreeze({ status: 'completed', completion: clone(existing.completion) });
        }
        if (existing.status === 'pending') fail('operation-pending');

        const credential = credentialResolver.resolve();
        assertSecretAbsent(dispatch, request, credential);

        if (!existing.prepared) {
          if (!await publishRecord(paths.prepared, expectedPrepared)) {
            const stored = await readCanonical(paths.prepared, 'phase prepared record');
            verifyPrepared(stored, expectedPrepared);
          }
        }
        await checkpoint('after-openai-phase-prepared', phase, dispatch.dispatchDigest);

        const attempt = attemptRecord({
          phase,
          dispatch,
          request,
          startedAt: isoNow(clock, 'phase attempt'),
        });
        if (!await publishRecord(paths.attempt, attempt)) fail('operation-pending');
        await checkpoint('after-openai-phase-attempt-persisted', phase, dispatch.dispatchDigest);

        let response;
        try {
          response = await network({
            url: `${policy.provider.endpointOrigin}${policy.provider.endpointPath}`,
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${credential}`,
            },
            body: request.body,
            timeoutMs: policy.provider.timeoutMs,
            maxResponseBytes: policy.provider.maximumResponseBytes,
          });
        } catch (error) {
          if (error?.name === 'ResponseTooLargeError') {
            await closeFailure({
              paths,
              dispatch,
              request,
              attempt,
              reasonCode: 'response-over-budget',
              response: null,
            });
          }
          fail('provider-ambiguous', error);
        }
        await checkpoint('after-openai-phase-response-received', phase, dispatch.dispatchDigest);
        if (!Number.isInteger(response?.status) || response.status < 200 || response.status >= 300) {
          await closeFailure({
            paths,
            dispatch,
            request,
            attempt,
            reasonCode: 'provider-rejected',
            response,
          });
        }

        let completion;
        try {
          completion = completeOpenAICompatiblePhaseResponse({
            phase,
            dispatch,
            descriptor,
            policy,
            response,
            credential,
            startedAt: attempt.startedAt,
            completedAt: isoNow(clock, 'phase completion'),
          });
        } catch (error) {
          if (error instanceof OpenAICompatiblePhaseProtocolError
              && ['response-invalid', 'credential-reflected'].includes(error.code)) {
            await closeFailure({
              paths,
              dispatch,
              request,
              attempt,
              reasonCode: error.code,
              response,
            });
          }
          throw error;
        }
        if (!await publishRecord(paths.completion, completion)) {
          const stored = await readCanonical(paths.completion, 'phase completion record');
          verifyCompletion(phase, stored, dispatch, descriptor);
          if (canonicalJson(stored) !== canonicalJson(completion)) {
            throw new IntegrityError('phase completion changed under one operation');
          }
        }
        await checkpoint('after-openai-phase-completion-persisted', phase, dispatch.dispatchDigest);
        return deepFreeze({ status: 'completed', completion: clone(completion) });
      } catch (error) {
        if (error instanceof OpenAICompatiblePhaseTransportError
            || error instanceof OpenAICompatiblePhaseProtocolError) throw error;
        fail('operation-integrity', error);
      } finally {
        try {
          await lock.release();
        } catch (error) {
          if (!(error instanceof OpenAICompatiblePhaseTransportError)) {
            throw new OpenAICompatiblePhaseTransportError('operation-integrity', error);
          }
          throw error;
        }
      }
    },
  });

  function operationProjection(state) {
    return {
      phase,
      dispatchDigest: state.attempt.dispatchDigest,
      requestDigest: state.attempt.requestDigest,
      attemptId: state.attempt.attemptId,
    };
  }

  function resolutionResult(state) {
    const common = {
      decisionDigest: state.resolution.decisionDigest,
      resolutionRecordDigest: state.resolution.recordDigest,
    };
    if (state.status === 'completed') {
      return deepFreeze({ status: 'completed', ...common, completion: clone(state.completion) });
    }
    return deepFreeze({ status: 'abandoned', ...common, reasonCode: state.failure.reasonCode });
  }

  async function acquireOperationLock(paths) {
    try {
      return await acquireFileLock({ ...lockOptions, lockPath: paths.lock });
    } catch (error) {
      if (error instanceof IntegrityError
          && error.message === 'resource is locked by a live or recent owner') {
        fail('operation-pending', error);
      }
      fail('operation-integrity', error);
    }
  }

  async function inspectForResolution(dispatch, loadedPolicy) {
    const { request, expectedPrepared, paths } = prepare(dispatch);
    try {
      const state = await inspectOperation({
        paths,
        phase,
        dispatch,
        descriptor,
        request,
        expectedPrepared,
        returnFailure: true,
        loadedResolutionPolicy: loadedPolicy,
      });
      if (state.status === 'pending' && state.attempt) {
        return deepFreeze({
          status: 'pending',
          operation: operationProjection(state),
          resolutionAccepted: state.resolution !== null,
        });
      }
      if ((state.status === 'completed' || state.status === 'failed') && state.resolution) {
        return resolutionResult(state);
      }
      if (state.status === 'failed') {
        return deepFreeze({ status: 'failed', reasonCode: state.failure.reasonCode });
      }
      return Object.freeze({ status: state.status });
    } catch (error) {
      if (error instanceof OpenAICompatiblePhaseTransportError
          || error instanceof OpenAICompatiblePhaseProtocolError
          || error instanceof OpenAICompatiblePhaseResolutionError) throw error;
      fail('operation-integrity', error);
    }
  }

  async function resolveOperation({ dispatch, signedDecision, response, loadedPolicy }) {
    const { request, expectedPrepared, paths } = prepare(dispatch);
    try {
      if (!await operationExists(paths)) fail('resolution-not-pending');
    } catch (error) {
      if (error instanceof OpenAICompatiblePhaseTransportError) throw error;
      fail('operation-integrity', error);
    }
    const lock = await acquireOperationLock(paths);
    try {
      let state = await inspectOperation({
        paths,
        phase,
        dispatch,
        descriptor,
        request,
        expectedPrepared,
        ignoreLock: true,
        returnFailure: true,
        loadedResolutionPolicy: loadedPolicy,
      });
      if (!state.attempt) fail('resolution-not-pending');
      const operation = operationProjection(state);
      const responseWitness = response === undefined
        ? null
        : buildOpenAICompatiblePhaseResponseWitness(response);
      if (responseWitness && responseWitness.bodyBytes > loadedPolicy.policy.maximumAdoptedResponseBytes) {
        throw new OpenAICompatiblePhaseResolutionError('decision-invalid');
      }

      if (state.status === 'completed' || state.status === 'failed') {
        if (!state.resolution) fail('resolution-not-pending');
        verifyOpenAICompatiblePhaseResolutionDecision({
          signedDecision,
          loadedPolicy,
          operation,
          responseDigest: responseWitness?.witnessDigest ?? null,
          now: Date.parse(state.resolution.acceptedAt),
        });
        if (canonicalJson(state.resolution.signedDecision) !== canonicalJson(signedDecision)
            || canonicalJson(state.resolution.responseWitness) !== canonicalJson(responseWitness)) {
          throw new IntegrityError('phase resolution collision');
        }
        return resolutionResult(state);
      }

      let acceptedAt;
      let verifiedDecision;
      let record;
      if (state.resolution) {
        acceptedAt = state.resolution.acceptedAt;
        verifyResolutionRecord(state.resolution, {
          phase,
          dispatch,
          request,
          attempt: state.attempt,
          loadedPolicy,
        });
        verifiedDecision = verifyOpenAICompatiblePhaseResolutionDecision({
          signedDecision,
          loadedPolicy,
          operation,
          responseDigest: responseWitness?.witnessDigest ?? null,
          now: Date.parse(acceptedAt),
        });
        if (canonicalJson(state.resolution.signedDecision) !== canonicalJson(verifiedDecision)
            || canonicalJson(state.resolution.responseWitness) !== canonicalJson(responseWitness)) {
          throw new IntegrityError('phase resolution collision');
        }
        record = state.resolution;
      } else {
        acceptedAt = isoNow(clock, 'phase resolution');
        verifiedDecision = verifyOpenAICompatiblePhaseResolutionDecision({
          signedDecision,
          loadedPolicy,
          operation,
          responseDigest: responseWitness?.witnessDigest ?? null,
          now: Date.parse(acceptedAt),
        });
        record = resolutionRecord({
          phase,
          dispatch,
          request,
          attempt: state.attempt,
          loadedPolicy,
          verifiedDecision,
          responseWitness,
          acceptedAt,
        });
      }

      let completion = null;
      if (record.disposition === 'adopt-response') {
        if (!responseWitness) throw new OpenAICompatiblePhaseResolutionError('decision-invalid');
        const credential = credentialResolver.resolve();
        completion = completeOpenAICompatiblePhaseResponse({
          phase,
          dispatch,
          descriptor,
          policy,
          response,
          credential,
          startedAt: state.attempt.startedAt,
          completedAt: acceptedAt,
        });
      }

      if (!state.resolution) {
        if (!await publishRecord(paths.resolution, record)) {
          const stored = await readCanonical(paths.resolution, 'phase resolution record');
          verifyResolutionRecord(stored, {
            phase,
            dispatch,
            request,
            attempt: state.attempt,
            loadedPolicy,
          });
          if (canonicalJson(stored) !== canonicalJson(record)) {
            throw new IntegrityError('phase resolution changed under one operation');
          }
          record = stored;
        }
      }
      await checkpoint('after-openai-phase-resolution-persisted', phase, dispatch.dispatchDigest);

      if (record.disposition === 'abandon') {
        const failure = failureRecord({
          phase,
          dispatch,
          request,
          attempt: state.attempt,
          reasonCode: 'operator-abandoned',
          httpStatus: null,
          responseDigest: null,
          failedAt: acceptedAt,
        });
        if (!await publishRecord(paths.failure, failure)) {
          const stored = await readCanonical(paths.failure, 'phase failure record');
          verifyFailure(stored, { phase, dispatch, request, attempt: state.attempt });
          if (canonicalJson(stored) !== canonicalJson(failure)) {
            throw new IntegrityError('phase failure changed under one resolution');
          }
        }
      } else if (!await publishRecord(paths.completion, completion)) {
        const stored = await readCanonical(paths.completion, 'phase completion record');
        verifyCompletion(phase, stored, dispatch, descriptor);
        if (canonicalJson(stored) !== canonicalJson(completion)) {
          throw new IntegrityError('phase completion changed under one resolution');
        }
      }
      await checkpoint('after-openai-phase-resolution-terminal-persisted', phase, dispatch.dispatchDigest);
      state = await inspectOperation({
        paths,
        phase,
        dispatch,
        descriptor,
        request,
        expectedPrepared,
        ignoreLock: true,
        returnFailure: true,
        loadedResolutionPolicy: loadedPolicy,
      });
      return resolutionResult(state);
    } catch (error) {
      if (error instanceof OpenAICompatiblePhaseTransportError
          || error instanceof OpenAICompatiblePhaseProtocolError
          || error instanceof OpenAICompatiblePhaseResolutionError) throw error;
      fail('operation-integrity', error);
    } finally {
      try {
        await lock.release();
      } catch (error) {
        if (!(error instanceof OpenAICompatiblePhaseTransportError)) {
          throw new OpenAICompatiblePhaseTransportError('operation-integrity', error);
        }
        throw error;
      }
    }
  }

  return Object.freeze({
    adapter,
    operator: Object.freeze({
      inspect: inspectForResolution,
      resolve: resolveOperation,
    }),
  });
}

export async function createOpenAICompatiblePhaseTransportSuite({
  policyPath,
  env,
  runtimeRoot,
  fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString(),
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof runtimeRoot !== 'string' || runtimeRoot.length === 0 || /[\0\r\n]/.test(runtimeRoot)
      || typeof fetchImpl !== 'function' || typeof clock !== 'function'
      || typeof checkpoint !== 'function' || !lockOptions || typeof lockOptions !== 'object'
      || Array.isArray(lockOptions)) {
    throw new TypeError('OpenAI-compatible phase transport configuration is invalid');
  }
  const loaded = await loadOpenAICompatiblePhaseTransportPolicy({ path: policyPath, env });
  const credentialResolver = createOpenAICompatiblePhaseCredentialResolver({
    env,
    variableName: loaded.policy.provider.credentialEnv,
  });
  await mkdir(resolve(runtimeRoot), { recursive: true });
  const root = await realpath(resolve(runtimeRoot));
  const descriptors = descriptorSet(loaded.policy, loaded.digest);
  const network = createHttpsTransport({ fetchImpl });
  const phases = {
    native: phaseTransport({
      phase: 'native', descriptor: descriptors.native, policy: loaded.policy,
      policyDigest: loaded.digest, root, credentialResolver, network, clock, checkpoint, lockOptions,
    }),
    review: phaseTransport({
      phase: 'review', descriptor: descriptors.review, policy: loaded.policy,
      policyDigest: loaded.digest, root, credentialResolver, network, clock, checkpoint, lockOptions,
    }),
    revision: phaseTransport({
      phase: 'revision', descriptor: descriptors.revision, policy: loaded.policy,
      policyDigest: loaded.digest, root, credentialResolver, network, clock, checkpoint, lockOptions,
    }),
  };

  function assertCredentialAbsent(value) {
    const credential = credentialResolver.resolve();
    let serialized;
    try {
      serialized = canonicalJson(value);
    } catch (error) {
      throw new TypeError('phase transport input is not canonical JSON', { cause: error });
    }
    if (serialized.includes(credential)) fail('credential-in-input');
    return clone(value);
  }

  async function createOperatorResolutionController({ policyPath: resolutionPolicyPath, env: resolutionEnv } = {}) {
    const loadedResolutionPolicy = await loadOpenAICompatiblePhaseResolutionPolicy({
      path: resolutionPolicyPath,
      env: resolutionEnv,
      transportPolicyDigest: loaded.digest,
      maximumProviderResponseBytes: loaded.policy.provider.maximumResponseBytes,
    });
    function port(phase) {
      if (!Object.hasOwn(phases, phase)) {
        throw new TypeError('OpenAI-compatible phase resolution phase is invalid');
      }
      return phases[phase].operator;
    }
    return deepFreeze({
      policyDigest: loadedResolutionPolicy.digest,
      authorityKeyId: loadedResolutionPolicy.policy.authority.keyId,
      async inspect({ phase, dispatch } = {}) {
        return port(phase).inspect(dispatch, loadedResolutionPolicy);
      },
      async resolve({ phase, dispatch, signedDecision, response } = {}) {
        return port(phase).resolve({
          dispatch,
          signedDecision,
          ...(response === undefined ? {} : { response }),
          loadedPolicy: loadedResolutionPolicy,
        });
      },
    });
  }

  return deepFreeze({
    policyDigest: loaded.digest,
    descriptors,
    native: phases.native.adapter,
    review: phases.review.adapter,
    revision: phases.revision.adapter,
    assertCredentialAbsent,
    createOperatorResolutionController,
  });
}
