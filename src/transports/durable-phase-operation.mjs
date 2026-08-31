import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { verifyIdentityBoundNativeCompletion } from '../runtime/identity-bound-native-contracts.mjs';
import { verifyMissionRevisionTransportCompletion } from '../runtime/mission-revision-transport-contracts.mjs';
import { verifyGodskillsReviewTransportCompletion } from '../skills/review-transport-contracts.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

const MESSAGES = Object.freeze({
  'credential-in-input': 'Durable phase transport input contains its credential',
  'operation-pending': 'Durable phase transport operation is pending',
  'operation-integrity': 'Durable phase transport operation integrity failed',
  'provider-ambiguous': 'Durable phase provider outcome is ambiguous',
  'provider-rejected': 'Durable phase provider rejected the request',
  'response-over-budget': 'Durable phase provider response exceeded its byte ceiling',
  'response-invalid': 'Durable phase provider response is invalid',
  'credential-reflected': 'Durable phase provider response reflected its credential',
});

const DIGEST = /^[a-f0-9]{64}$/;
const PHASES = ['native', 'review', 'revision'];
const PREPARED_PROTOCOL = 'eternities-durable-phase-prepared-v1';
const ATTEMPT_PROTOCOL = 'eternities-durable-phase-attempt-v1';
const EVIDENCE_PROTOCOL = 'eternities-provider-phase-evidence-v1';
const FAILURE_PROTOCOL = 'eternities-durable-phase-failure-v1';
const FAILURE_REASONS = new Set([
  'provider-rejected',
  'response-over-budget',
  'response-invalid',
  'credential-reflected',
]);
const OPERATION_FILES = new Set([
  'prepared.json',
  'attempt.json',
  'provider-evidence.json',
  'completion.json',
  'failure.json',
  'execution.lock',
]);

export class DurablePhaseOperationError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('durable phase operation error code is invalid');
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'DurablePhaseOperationError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new DurablePhaseOperationError(code, cause);
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
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new IntegrityError(`${label} digest is invalid`);
}

function isoNow(clock, label) {
  const parsed = new Date(clock());
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
    'schemaVersion', 'protocolId', 'phase', 'policyDigest', 'transportDescriptorDigest',
    'dispatchDigest', 'requestDigest', 'requestBytes', 'recordDigest',
  ], 'durable phase prepared record');
  const { recordDigest, ...unsigned } = value;
  requireDigest(recordDigest, 'durable phase prepared record');
  if (value.schemaVersion !== 1 || value.protocolId !== PREPARED_PROTOCOL
      || canonicalJson(value) !== canonicalJson(expected)
      || sha256Value(unsigned) !== recordDigest) {
    throw new IntegrityError('durable phase prepared record binding is invalid');
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
  return withRecordDigest({ ...identity, attemptId: sha256Value(identity), startedAt });
}

function verifyAttempt(value, { phase, dispatch, request }) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'phase', 'dispatchDigest', 'requestDigest',
    'attemptId', 'startedAt', 'recordDigest',
  ], 'durable phase attempt record');
  const { recordDigest, attemptId, startedAt, ...identity } = value;
  if (value.schemaVersion !== 1 || value.protocolId !== ATTEMPT_PROTOCOL
      || value.phase !== phase || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== request.requestDigest || attemptId !== sha256Value(identity)
      || !DIGEST.test(attemptId) || !Number.isFinite(Date.parse(startedAt))
      || recordDigest !== sha256Value({ ...identity, attemptId, startedAt })) {
    throw new IntegrityError('durable phase attempt record binding is invalid');
  }
  return value;
}

function providerEvidenceRecord({ phase, policyDigest, dispatch, request, attempt, completion, providerEvidence }) {
  return withRecordDigest({
    schemaVersion: 1,
    protocolId: EVIDENCE_PROTOCOL,
    phase,
    policyDigest,
    dispatchDigest: dispatch.dispatchDigest,
    requestDigest: request.requestDigest,
    attemptId: attempt.attemptId,
    completionDigest: completion.completionDigest,
    providerUsage: clone(providerEvidence),
  });
}

function verifyProviderEvidenceRecord(value, {
  phase, policyDigest, dispatch, request, attempt, completion, verifyProviderEvidence,
}) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'phase', 'policyDigest', 'dispatchDigest',
    'requestDigest', 'attemptId', 'completionDigest', 'providerUsage', 'recordDigest',
  ], 'durable phase provider evidence record');
  const { recordDigest, ...unsigned } = value;
  requireDigest(recordDigest, 'durable phase provider evidence record');
  requireDigest(value.completionDigest, 'durable phase provider evidence completion');
  verifyProviderEvidence(value.providerUsage);
  if (value.schemaVersion !== 1 || value.protocolId !== EVIDENCE_PROTOCOL || value.phase !== phase
      || value.policyDigest !== policyDigest || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== request.requestDigest || value.attemptId !== attempt.attemptId
      || (completion && value.completionDigest !== completion.completionDigest)
      || sha256Value(unsigned) !== recordDigest) {
    throw new IntegrityError('durable phase provider evidence record binding is invalid');
  }
  return value;
}

function failureRecord({ phase, dispatch, request, attempt, reasonCode, response, failedAt }) {
  return withRecordDigest({
    schemaVersion: 1,
    protocolId: FAILURE_PROTOCOL,
    status: 'failed',
    phase,
    dispatchDigest: dispatch.dispatchDigest,
    requestDigest: request.requestDigest,
    attemptId: attempt.attemptId,
    reasonCode,
    httpStatus: Number.isInteger(response?.status) ? response.status : null,
    responseDigest: typeof response?.bodyText === 'string' ? sha256Text(response.bodyText) : null,
    failedAt,
  });
}

function verifyFailure(value, { phase, dispatch, request, attempt }) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'phase', 'dispatchDigest', 'requestDigest',
    'attemptId', 'reasonCode', 'httpStatus', 'responseDigest', 'failedAt', 'recordDigest',
  ], 'durable phase failure record');
  const { recordDigest, ...unsigned } = value;
  if (value.schemaVersion !== 1 || value.protocolId !== FAILURE_PROTOCOL || value.status !== 'failed'
      || value.phase !== phase || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== request.requestDigest || value.attemptId !== attempt.attemptId
      || !FAILURE_REASONS.has(value.reasonCode)
      || (value.httpStatus !== null && (!Number.isInteger(value.httpStatus) || value.httpStatus < 100 || value.httpStatus > 599))
      || (value.responseDigest !== null && !DIGEST.test(value.responseDigest))
      || !Number.isFinite(Date.parse(value.failedAt)) || sha256Value(unsigned) !== recordDigest) {
    throw new IntegrityError('durable phase failure record binding is invalid');
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
    evidence: join(operationRoot, 'provider-evidence.json'),
    completion: join(operationRoot, 'completion.json'),
    failure: join(operationRoot, 'failure.json'),
    lock: join(operationRoot, 'execution.lock'),
  };
}

async function operationExists(paths) {
  const phase = await metadata(paths.phaseRoot);
  if (!phase) return false;
  if (!phase.isDirectory() || phase.isSymbolicLink()) throw new IntegrityError('durable phase directory is unsafe');
  const operation = await metadata(paths.operationRoot);
  if (!operation) return false;
  if (!operation.isDirectory() || operation.isSymbolicLink()) throw new IntegrityError('durable phase operation slot is unsafe');
  return true;
}

async function ensureOperation(paths) {
  await mkdir(paths.phaseRoot, { recursive: true });
  await requireDirectory(paths.phaseRoot, 'durable phase directory');
  await mkdir(paths.operationRoot, { recursive: true });
  await requireDirectory(paths.operationRoot, 'durable phase operation slot');
}

async function publishRecord(path, value) {
  return publishFileExclusive({ destinationPath: path, content: `${canonicalJson(value)}\n` });
}

async function inspectOperation({
  paths, phase, policyDigest, dispatch, descriptor, request, expectedPrepared,
  verifyProviderEvidence, ignoreLock = false,
}) {
  if (!await operationExists(paths)) return { status: 'absent' };
  const entries = await readdir(paths.operationRoot);
  const writing = entries.filter((entry) => entry.endsWith('.writing'));
  const unknown = entries.filter((entry) => !OPERATION_FILES.has(entry) && !entry.endsWith('.writing'));
  if (unknown.length > 0) throw new IntegrityError('durable phase operation slot contains an unknown entry');
  const lock = await metadata(paths.lock);
  if (lock && (!lock.isFile() || lock.isSymbolicLink())) throw new IntegrityError('durable phase operation lock is unsafe');
  if (writing.length > 0 && !lock) throw new IntegrityError('durable phase operation has abandoned publication state');

  const prepared = await readCanonical(paths.prepared, 'durable phase prepared record');
  const attempt = await readCanonical(paths.attempt, 'durable phase attempt record');
  const evidence = await readCanonical(paths.evidence, 'durable phase provider evidence record');
  const completion = await readCanonical(paths.completion, 'durable phase completion record');
  const failure = await readCanonical(paths.failure, 'durable phase failure record');
  if (completion && failure) throw new IntegrityError('durable phase operation has contradictory terminal records');
  if ((attempt || evidence || completion || failure) && !prepared) throw new IntegrityError('durable phase operation lacks its prepared record');
  if ((evidence || completion || failure) && !attempt) throw new IntegrityError('durable phase operation lacks its attempt record');
  if (completion && !evidence) throw new IntegrityError('durable phase completion lacks provider evidence');
  if (failure && evidence) throw new IntegrityError('durable phase failure contradicts provider evidence');
  if (prepared) verifyPrepared(prepared, expectedPrepared);
  if (attempt) verifyAttempt(attempt, { phase, dispatch, request });
  if (evidence && !completion) {
    verifyProviderEvidenceRecord(evidence, {
      phase, policyDigest, dispatch, request, attempt, completion: null, verifyProviderEvidence,
    });
  }
  if (completion) {
    verifyCompletion(phase, completion, dispatch, descriptor);
    verifyProviderEvidenceRecord(evidence, {
      phase, policyDigest, dispatch, request, attempt, completion, verifyProviderEvidence,
    });
    return { status: 'completed', completion, evidence, prepared, attempt };
  }
  if (failure) {
    verifyFailure(failure, { phase, dispatch, request, attempt });
    fail(failure.reasonCode);
  }
  if (attempt || evidence || writing.length > 0 || (lock && !ignoreLock)) {
    return { status: 'pending', prepared, attempt, evidence };
  }
  return { status: 'absent', prepared };
}

export async function createDurablePhaseOperationSuite({
  policy,
  policyDigest,
  descriptors,
  runtimeRoot,
  credentialResolver,
  compileRequest,
  inspectResponse,
  verifyProviderEvidence,
  network,
  networkRequest,
  clock = () => new Date().toISOString(),
  checkpoint = async () => {},
  checkpointPrefix = 'provider-phase',
  lockOptions = {},
} = {}) {
  if (!policy || typeof policy !== 'object' || !DIGEST.test(policyDigest ?? '')
      || !descriptors || typeof descriptors !== 'object'
      || typeof runtimeRoot !== 'string' || runtimeRoot.length === 0 || /[\0\r\n]/.test(runtimeRoot)
      || !credentialResolver || typeof credentialResolver.resolve !== 'function'
      || typeof compileRequest !== 'function' || typeof inspectResponse !== 'function'
      || typeof verifyProviderEvidence !== 'function' || typeof network !== 'function'
      || typeof networkRequest !== 'function' || typeof clock !== 'function'
      || typeof checkpoint !== 'function' || !lockOptions || typeof lockOptions !== 'object'
      || Array.isArray(lockOptions) || typeof checkpointPrefix !== 'string' || checkpointPrefix.length === 0) {
    throw new TypeError('durable phase operation configuration is invalid');
  }
  await mkdir(resolve(runtimeRoot), { recursive: true });
  const root = await realpath(resolve(runtimeRoot));

  function phaseAdapter(phase) {
    const descriptor = descriptors[phase];
    function prepare(dispatch) {
      const request = compileRequest({ phase, dispatch, descriptor, policy });
      return {
        request,
        expectedPrepared: preparedRecord({ phase, policyDigest, descriptor, dispatch, request }),
        paths: operationPaths(root, phase, dispatch.dispatchDigest),
      };
    }
    function assertSecretAbsent(dispatch, request, credential) {
      if (canonicalJson(dispatch).includes(credential) || request.body.includes(credential)) fail('credential-in-input');
    }
    async function closeFailure({ paths, dispatch, request, attempt, reasonCode, response }) {
      const value = failureRecord({
        phase, dispatch, request, attempt, reasonCode, response,
        failedAt: isoNow(clock, 'durable phase failure'),
      });
      if (!await publishRecord(paths.failure, value)) {
        const stored = await readCanonical(paths.failure, 'durable phase failure record');
        verifyFailure(stored, { phase, dispatch, request, attempt });
        if (canonicalJson(stored) !== canonicalJson(value)) {
          throw new IntegrityError('durable phase failure record changed under one operation');
        }
      }
      await checkpoint(`after-${checkpointPrefix}-failure-persisted`, phase, dispatch.dispatchDigest);
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
            paths, phase, policyDigest, dispatch, descriptor, request, expectedPrepared, verifyProviderEvidence,
          });
          return state.status === 'completed'
            ? deepFreeze({ status: 'completed', completion: clone(state.completion) })
            : Object.freeze({ status: state.status });
        } catch (error) {
          if (error instanceof DurablePhaseOperationError || error?.code?.startsWith('response-')
              || error?.code === 'credential-reflected' || error?.code === 'dispatch-invalid'
              || error?.code === 'request-over-budget') throw error;
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
          if (error instanceof IntegrityError && error.message === 'resource is locked by a live or recent owner') {
            fail('operation-pending', error);
          }
          fail('operation-integrity', error);
        }
        try {
          const existing = await inspectOperation({
            paths, phase, policyDigest, dispatch, descriptor, request, expectedPrepared,
            verifyProviderEvidence, ignoreLock: true,
          });
          if (existing.status === 'completed') {
            return deepFreeze({ status: 'completed', completion: clone(existing.completion) });
          }
          if (existing.status === 'pending') fail('operation-pending');

          const credential = credentialResolver.resolve();
          assertSecretAbsent(dispatch, request, credential);
          if (!existing.prepared && !await publishRecord(paths.prepared, expectedPrepared)) {
            verifyPrepared(await readCanonical(paths.prepared, 'durable phase prepared record'), expectedPrepared);
          }
          await checkpoint(`after-${checkpointPrefix}-prepared`, phase, dispatch.dispatchDigest);

          const attempt = attemptRecord({
            phase, dispatch, request, startedAt: isoNow(clock, 'durable phase attempt'),
          });
          if (!await publishRecord(paths.attempt, attempt)) fail('operation-pending');
          await checkpoint(`after-${checkpointPrefix}-attempt-persisted`, phase, dispatch.dispatchDigest);

          let response;
          try {
            response = await network(networkRequest({ policy, credential, request }));
          } catch (error) {
            if (error?.name === 'ResponseTooLargeError') {
              await closeFailure({
                paths, dispatch, request, attempt, reasonCode: 'response-over-budget', response: null,
              });
            }
            fail('provider-ambiguous', error);
          }
          await checkpoint(`after-${checkpointPrefix}-response-received`, phase, dispatch.dispatchDigest);
          if (!Number.isInteger(response?.status) || response.status < 200 || response.status >= 300) {
            await closeFailure({ paths, dispatch, request, attempt, reasonCode: 'provider-rejected', response });
          }

          let inspected;
          try {
            inspected = inspectResponse({
              phase, dispatch, descriptor, policy, response, credential,
              startedAt: attempt.startedAt,
              completedAt: isoNow(clock, 'durable phase completion'),
            });
          } catch (error) {
            if (error?.code === 'response-invalid' || error?.code === 'credential-reflected') {
              await closeFailure({ paths, dispatch, request, attempt, reasonCode: error.code, response });
            }
            throw error;
          }
          const completion = inspected?.completion;
          const providerEvidence = inspected?.providerUsage;
          verifyCompletion(phase, completion, dispatch, descriptor);
          verifyProviderEvidence(providerEvidence);
          const evidence = providerEvidenceRecord({
            phase, policyDigest, dispatch, request, attempt, completion, providerEvidence,
          });
          if (!await publishRecord(paths.evidence, evidence)) {
            const stored = await readCanonical(paths.evidence, 'durable phase provider evidence record');
            verifyProviderEvidenceRecord(stored, {
              phase, policyDigest, dispatch, request, attempt, completion, verifyProviderEvidence,
            });
            if (canonicalJson(stored) !== canonicalJson(evidence)) {
              throw new IntegrityError('durable phase provider evidence changed under one operation');
            }
          }
          await checkpoint(`after-${checkpointPrefix}-provider-evidence-persisted`, phase, dispatch.dispatchDigest);
          if (!await publishRecord(paths.completion, completion)) {
            const stored = await readCanonical(paths.completion, 'durable phase completion record');
            verifyCompletion(phase, stored, dispatch, descriptor);
            if (canonicalJson(stored) !== canonicalJson(completion)) {
              throw new IntegrityError('durable phase completion changed under one operation');
            }
          }
          await checkpoint(`after-${checkpointPrefix}-completion-persisted`, phase, dispatch.dispatchDigest);
          return deepFreeze({ status: 'completed', completion: clone(completion) });
        } catch (error) {
          if (error instanceof DurablePhaseOperationError || error?.code?.startsWith('response-')
              || error?.code === 'credential-reflected' || error?.code === 'dispatch-invalid'
              || error?.code === 'request-over-budget') throw error;
          fail('operation-integrity', error);
        } finally {
          try {
            await lock.release();
          } catch (error) {
            throw new DurablePhaseOperationError('operation-integrity', error);
          }
        }
      },
    });
  }

  const adapters = Object.fromEntries(PHASES.map((phase) => [phase, phaseAdapter(phase)]));
  return deepFreeze(adapters);
}
