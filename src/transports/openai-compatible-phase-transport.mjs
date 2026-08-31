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

const MESSAGES = Object.freeze({
  'credential-in-input': 'OpenAI-compatible phase transport input contains its credential',
  'operation-pending': 'OpenAI-compatible phase transport operation is pending',
  'operation-integrity': 'OpenAI-compatible phase transport operation integrity failed',
  'provider-ambiguous': 'OpenAI-compatible phase provider outcome is ambiguous',
  'provider-rejected': 'OpenAI-compatible phase provider rejected the request',
  'response-over-budget': 'OpenAI-compatible phase provider response exceeded its byte ceiling',
  'response-invalid': 'OpenAI-compatible phase provider response is invalid',
  'credential-reflected': 'OpenAI-compatible phase provider response reflected its credential',
});

const DIGEST = /^[a-f0-9]{64}$/;
const PREPARED_PROTOCOL = 'eternities-openai-compatible-phase-prepared-v1';
const ATTEMPT_PROTOCOL = 'eternities-openai-compatible-phase-attempt-v1';
const FAILURE_PROTOCOL = 'eternities-openai-compatible-phase-failure-v1';
const FAILURE_REASONS = new Set([
  'provider-rejected',
  'response-over-budget',
  'response-invalid',
  'credential-reflected',
]);
const OPERATION_FILES = new Set([
  'prepared.json',
  'attempt.json',
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

async function inspectOperation({ paths, phase, dispatch, descriptor, request, expectedPrepared, ignoreLock = false }) {
  if (!await operationExists(paths)) return { status: 'absent' };
  const { writing } = await verifyEntries(paths);
  const lock = await metadata(paths.lock);
  if (lock && (!lock.isFile() || lock.isSymbolicLink())) throw new IntegrityError('phase operation lock is unsafe');
  if (writing.length > 0 && !lock) throw new IntegrityError('phase operation has abandoned publication state');

  const prepared = await readCanonical(paths.prepared, 'phase prepared record');
  const attempt = await readCanonical(paths.attempt, 'phase attempt record');
  const completion = await readCanonical(paths.completion, 'phase completion record');
  const failure = await readCanonical(paths.failure, 'phase failure record');
  if (completion && failure) throw new IntegrityError('phase operation has contradictory terminal records');
  if ((attempt || completion || failure) && !prepared) throw new IntegrityError('phase operation lacks its prepared record');
  if ((completion || failure) && !attempt) throw new IntegrityError('phase operation lacks its attempt record');
  if (prepared) verifyPrepared(prepared, expectedPrepared);
  if (attempt) verifyAttempt(attempt, { phase, dispatch, request });
  if (completion) {
    verifyCompletion(phase, completion, dispatch, descriptor);
    return { status: 'completed', completion };
  }
  if (failure) {
    verifyFailure(failure, { phase, dispatch, request, attempt });
    fail(failure.reasonCode);
  }
  if (attempt || writing.length > 0 || (lock && !ignoreLock)) return { status: 'pending' };
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

  return Object.freeze({
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

  return deepFreeze({
    policyDigest: loaded.digest,
    descriptors,
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
    assertCredentialAbsent,
  });
}
