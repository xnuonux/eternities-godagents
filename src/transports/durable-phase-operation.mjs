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
import {
  buildProviderPhaseResponseWitness,
  ProviderPhaseResolutionError,
  verifyProviderPhaseResolutionDecision,
  verifyProviderPhaseResponseWitness,
} from './provider-phase-resolution.mjs';

const MESSAGES = Object.freeze({
  'credential-in-input': 'Durable phase transport input contains its credential',
  'operation-pending': 'Durable phase transport operation is pending',
  'operation-integrity': 'Durable phase transport operation integrity failed',
  'provider-ambiguous': 'Durable phase provider outcome is ambiguous',
  'provider-rejected': 'Durable phase provider rejected the request',
  'response-over-budget': 'Durable phase provider response exceeded its byte ceiling',
  'response-invalid': 'Durable phase provider response is invalid',
  'credential-reflected': 'Durable phase provider response reflected its credential',
  'operator-abandoned': 'Durable phase operation was abandoned by its operator',
  'resolution-not-pending': 'Durable phase operation is not pending resolution',
});

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PHASES = ['native', 'review', 'revision'];
const PREPARED_PROTOCOL = 'eternities-durable-phase-prepared-v1';
const ATTEMPT_PROTOCOL = 'eternities-durable-phase-attempt-v1';
const EVIDENCE_PROTOCOL = 'eternities-provider-phase-evidence-v1';
const FAILURE_PROTOCOL = 'eternities-durable-phase-failure-v1';
const RESOLUTION_PROTOCOL = 'eternities-provider-phase-resolution-record-v1';
const RESOLUTION_DECISION_PROTOCOL = 'eternities-provider-phase-resolution-decision-v1';
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
    'disposition', 'signedDecision', 'responseWitness', 'acceptedAt', 'recordDigest',
  ], 'provider phase resolution record');
  const { recordDigest, ...unsigned } = value;
  requireDigest(recordDigest, 'provider phase resolution record');
  exactKeys(value.signedDecision, ['decision', 'signature'], 'provider phase signed decision');
  exactKeys(value.signedDecision.decision, [
    'schemaVersion', 'protocolId', 'policyDigest', 'keyId', 'phase',
    'dispatchDigest', 'requestDigest', 'attemptId', 'disposition',
    'responseWitnessDigest', 'issuedAt', 'expiresAt', 'nonce', 'decisionDigest',
  ], 'provider phase resolution decision');
  const decision = value.signedDecision.decision;
  const { decisionDigest, ...decisionUnsigned } = decision;
  const acceptedAt = Date.parse(value.acceptedAt);
  const issuedAt = Date.parse(decision.issuedAt);
  const expiresAt = Date.parse(decision.expiresAt);
  const witness = value.responseWitness === null
    ? null
    : verifyProviderPhaseResponseWitness(value.responseWitness);
  if (value.schemaVersion !== 1 || value.protocolId !== RESOLUTION_PROTOCOL
      || value.status !== 'accepted' || value.phase !== phase
      || value.dispatchDigest !== dispatch.dispatchDigest
      || value.requestDigest !== request.requestDigest || value.attemptId !== attempt.attemptId
      || !DIGEST.test(value.resolutionPolicyDigest) || value.decisionDigest !== decisionDigest
      || value.disposition !== decision.disposition
      || decision.schemaVersion !== 1 || decision.protocolId !== RESOLUTION_DECISION_PROTOCOL
      || !IDENTIFIER.test(decision.keyId) || !NONCE.test(decision.nonce)
      || !RESOLUTION_DISPOSITIONS.has(decision.disposition)
      || !DIGEST.test(decision.policyDigest) || !DIGEST.test(decision.dispatchDigest)
      || !DIGEST.test(decision.requestDigest) || !DIGEST.test(decision.attemptId)
      || !DIGEST.test(decisionDigest)
      || decision.policyDigest !== value.resolutionPolicyDigest
      || decision.phase !== phase || decision.dispatchDigest !== dispatch.dispatchDigest
      || decision.requestDigest !== request.requestDigest || decision.attemptId !== attempt.attemptId
      || decisionDigest !== sha256Value(decisionUnsigned)
      || !Number.isFinite(acceptedAt) || new Date(acceptedAt).toISOString() !== value.acceptedAt
      || !Number.isFinite(issuedAt) || new Date(issuedAt).toISOString() !== decision.issuedAt
      || !Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== decision.expiresAt
      || expiresAt <= issuedAt || acceptedAt < issuedAt || acceptedAt > expiresAt
      || (decision.disposition === 'adopt-response'
        ? !witness || decision.responseWitnessDigest !== witness.witnessDigest
        : witness !== null || decision.responseWitnessDigest !== null)
      || typeof value.signedDecision.signature !== 'string'
      || Buffer.from(value.signedDecision.signature, 'base64').toString('base64')
        !== value.signedDecision.signature
      || Buffer.from(value.signedDecision.signature, 'base64').length !== 64
      || sha256Value(unsigned) !== recordDigest) {
    throw new IntegrityError('provider phase resolution record binding is invalid');
  }
  if (loadedPolicy) {
    verifyProviderPhaseResolutionDecision({
      signedDecision: value.signedDecision,
      loadedPolicy,
      operation: {
        phase,
        dispatchDigest: dispatch.dispatchDigest,
        requestDigest: request.requestDigest,
        attemptId: attempt.attemptId,
      },
      responseWitnessDigest: witness?.witnessDigest ?? null,
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
  verifyProviderEvidence, ignoreLock = false, returnFailure = false,
  loadedResolutionPolicy,
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
  const resolution = await readCanonical(paths.resolution, 'provider phase resolution record');
  const evidence = await readCanonical(paths.evidence, 'durable phase provider evidence record');
  const completion = await readCanonical(paths.completion, 'durable phase completion record');
  const failure = await readCanonical(paths.failure, 'durable phase failure record');
  if (completion && failure) throw new IntegrityError('durable phase operation has contradictory terminal records');
  if ((attempt || resolution || evidence || completion || failure) && !prepared) throw new IntegrityError('durable phase operation lacks its prepared record');
  if ((resolution || evidence || completion || failure) && !attempt) throw new IntegrityError('durable phase operation lacks its attempt record');
  if (completion && !evidence) throw new IntegrityError('durable phase completion lacks provider evidence');
  if (failure && evidence) throw new IntegrityError('durable phase failure contradicts provider evidence');
  if (prepared) verifyPrepared(prepared, expectedPrepared);
  if (attempt) verifyAttempt(attempt, { phase, dispatch, request });
  if (resolution) verifyResolutionRecord(resolution, {
    phase,
    dispatch,
    request,
    attempt,
    ...(loadedResolutionPolicy ? { loadedPolicy: loadedResolutionPolicy } : {}),
  });
  if (evidence && !completion) {
    verifyProviderEvidenceRecord(evidence, {
      phase, policyDigest, dispatch, request, attempt, completion: null, verifyProviderEvidence,
    });
  }
  if (completion) {
    if (resolution && resolution.disposition !== 'adopt-response') {
      throw new IntegrityError('durable phase completion contradicts its operator resolution');
    }
    verifyCompletion(phase, completion, dispatch, descriptor);
    verifyProviderEvidenceRecord(evidence, {
      phase, policyDigest, dispatch, request, attempt, completion, verifyProviderEvidence,
    });
    return { status: 'completed', completion, evidence, prepared, attempt, resolution };
  }
  if (failure) {
    if ((resolution && (resolution.disposition !== 'abandon'
        || failure.reasonCode !== 'operator-abandoned'))
        || (!resolution && failure.reasonCode === 'operator-abandoned')) {
      throw new IntegrityError('durable phase failure contradicts its operator resolution');
    }
    verifyFailure(failure, { phase, dispatch, request, attempt });
    if (returnFailure) return { status: 'failed', failure, prepared, attempt, resolution };
    fail(failure.reasonCode);
  }
  if (attempt || resolution || evidence || writing.length > 0 || (lock && !ignoreLock)) {
    return { status: 'pending', prepared, attempt, resolution, evidence };
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

    function operationProjection(state) {
      return deepFreeze({
        phase,
        dispatchDigest: state.attempt.dispatchDigest,
        requestDigest: state.attempt.requestDigest,
        attemptId: state.attempt.attemptId,
      });
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
          paths, phase, policyDigest, dispatch, descriptor, request, expectedPrepared,
          verifyProviderEvidence, returnFailure: true, loadedResolutionPolicy: loadedPolicy,
        });
        if (state.status === 'pending' && state.attempt) {
          return deepFreeze({
            status: 'pending',
            operation: operationProjection(state),
            resolutionAccepted: Boolean(state.resolution),
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
        if (error instanceof DurablePhaseOperationError
            || error instanceof ProviderPhaseResolutionError
            || error?.code?.startsWith('response-') || error?.code === 'credential-reflected'
            || error?.code === 'dispatch-invalid' || error?.code === 'request-over-budget') throw error;
        fail('operation-integrity', error);
      }
    }

    async function resolveOperation({ dispatch, signedDecision, response, loadedPolicy }) {
      const { request, expectedPrepared, paths } = prepare(dispatch);
      try {
        if (!await operationExists(paths)) fail('resolution-not-pending');
      } catch (error) {
        if (error instanceof DurablePhaseOperationError) throw error;
        fail('operation-integrity', error);
      }
      const lock = await acquireOperationLock(paths);
      try {
        let state = await inspectOperation({
          paths, phase, policyDigest, dispatch, descriptor, request, expectedPrepared,
          verifyProviderEvidence, ignoreLock: true, returnFailure: true,
          loadedResolutionPolicy: loadedPolicy,
        });
        if (!state.attempt) fail('resolution-not-pending');
        const operation = operationProjection(state);
        const responseWitness = response === undefined
          ? null
          : buildProviderPhaseResponseWitness(response);
        if (responseWitness
            && responseWitness.bodyBytes > loadedPolicy.policy.maximumAdoptedResponseBytes) {
          throw new ProviderPhaseResolutionError('decision-invalid');
        }

        if (state.status === 'completed' || state.status === 'failed') {
          if (!state.resolution) fail('resolution-not-pending');
          verifyProviderPhaseResolutionDecision({
            signedDecision,
            loadedPolicy,
            operation,
            responseWitnessDigest: responseWitness?.witnessDigest ?? null,
            now: Date.parse(state.resolution.acceptedAt),
          });
          if (canonicalJson(state.resolution.signedDecision) !== canonicalJson(signedDecision)
              || canonicalJson(state.resolution.responseWitness) !== canonicalJson(responseWitness)) {
            throw new IntegrityError('provider phase resolution collision');
          }
          return resolutionResult(state);
        }

        let acceptedAt;
        let verifiedDecision;
        let record;
        if (state.resolution) {
          acceptedAt = state.resolution.acceptedAt;
          verifyResolutionRecord(state.resolution, {
            phase, dispatch, request, attempt: state.attempt, loadedPolicy,
          });
          verifiedDecision = verifyProviderPhaseResolutionDecision({
            signedDecision,
            loadedPolicy,
            operation,
            responseWitnessDigest: responseWitness?.witnessDigest ?? null,
            now: Date.parse(acceptedAt),
          });
          if (canonicalJson(state.resolution.signedDecision) !== canonicalJson(verifiedDecision)
              || canonicalJson(state.resolution.responseWitness) !== canonicalJson(responseWitness)) {
            throw new IntegrityError('provider phase resolution collision');
          }
          record = state.resolution;
        } else {
          acceptedAt = isoNow(clock, 'provider phase resolution');
          verifiedDecision = verifyProviderPhaseResolutionDecision({
            signedDecision,
            loadedPolicy,
            operation,
            responseWitnessDigest: responseWitness?.witnessDigest ?? null,
            now: Date.parse(acceptedAt),
          });
          record = resolutionRecord({
            phase, dispatch, request, attempt: state.attempt, loadedPolicy,
            verifiedDecision, responseWitness, acceptedAt,
          });
        }

        let completion = null;
        let providerEvidence = null;
        let evidence = null;
        if (record.disposition === 'adopt-response') {
          if (!responseWitness || response.status < 200 || response.status >= 300) {
            throw new ProviderPhaseResolutionError('decision-invalid');
          }
          const credential = credentialResolver.resolve();
          assertSecretAbsent(dispatch, request, credential);
          const inspected = inspectResponse({
            phase, dispatch, descriptor, policy, response, credential,
            startedAt: state.attempt.startedAt, completedAt: acceptedAt,
          });
          completion = inspected?.completion;
          providerEvidence = inspected?.providerUsage;
          verifyCompletion(phase, completion, dispatch, descriptor);
          verifyProviderEvidence(providerEvidence);
          evidence = providerEvidenceRecord({
            phase, policyDigest, dispatch, request, attempt: state.attempt,
            completion, providerEvidence,
          });
        }

        if (state.evidence) {
          if (record.disposition !== 'adopt-response') {
            throw new IntegrityError('provider phase abandonment contradicts existing provider evidence');
          }
          verifyProviderEvidenceRecord(state.evidence, {
            phase, policyDigest, dispatch, request, attempt: state.attempt,
            completion, verifyProviderEvidence,
          });
          if (canonicalJson(state.evidence) !== canonicalJson(evidence)) {
            throw new IntegrityError('provider phase resolution collides with existing provider evidence');
          }
        }

        if (!state.resolution) {
          if (!await publishRecord(paths.resolution, record)) {
            const stored = await readCanonical(paths.resolution, 'provider phase resolution record');
            verifyResolutionRecord(stored, {
              phase, dispatch, request, attempt: state.attempt, loadedPolicy,
            });
            if (canonicalJson(stored) !== canonicalJson(record)) {
              throw new IntegrityError('provider phase resolution changed under one operation');
            }
            record = stored;
          }
        }
        await checkpoint('after-provider-phase-resolution-persisted', phase, dispatch.dispatchDigest);

        if (record.disposition === 'abandon') {
          const failure = failureRecord({
            phase, dispatch, request, attempt: state.attempt, reasonCode: 'operator-abandoned',
            response: null, failedAt: acceptedAt,
          });
          if (!await publishRecord(paths.failure, failure)) {
            const stored = await readCanonical(paths.failure, 'durable phase failure record');
            verifyFailure(stored, { phase, dispatch, request, attempt: state.attempt });
            if (canonicalJson(stored) !== canonicalJson(failure)) {
              throw new IntegrityError('durable phase failure changed under one resolution');
            }
          }
        } else {
          if (!await publishRecord(paths.evidence, evidence)) {
            const stored = await readCanonical(paths.evidence, 'durable phase provider evidence record');
            verifyProviderEvidenceRecord(stored, {
              phase, policyDigest, dispatch, request, attempt: state.attempt,
              completion, verifyProviderEvidence,
            });
            if (canonicalJson(stored) !== canonicalJson(evidence)) {
              throw new IntegrityError('durable phase provider evidence changed under one resolution');
            }
          }
          await checkpoint('after-provider-phase-resolution-provider-evidence-persisted', phase, dispatch.dispatchDigest);
          if (!await publishRecord(paths.completion, completion)) {
            const stored = await readCanonical(paths.completion, 'durable phase completion record');
            verifyCompletion(phase, stored, dispatch, descriptor);
            if (canonicalJson(stored) !== canonicalJson(completion)) {
              throw new IntegrityError('durable phase completion changed under one resolution');
            }
          }
        }
        await checkpoint('after-provider-phase-resolution-terminal-persisted', phase, dispatch.dispatchDigest);
        state = await inspectOperation({
          paths, phase, policyDigest, dispatch, descriptor, request, expectedPrepared,
          verifyProviderEvidence, ignoreLock: true, returnFailure: true,
          loadedResolutionPolicy: loadedPolicy,
        });
        return resolutionResult(state);
      } catch (error) {
        if (error instanceof DurablePhaseOperationError
            || error instanceof ProviderPhaseResolutionError
            || error?.code?.startsWith('response-') || error?.code === 'credential-reflected'
            || error?.code === 'dispatch-invalid' || error?.code === 'request-over-budget') throw error;
        fail('operation-integrity', error);
      } finally {
        try {
          await lock.release();
        } catch (error) {
          throw new DurablePhaseOperationError('operation-integrity', error);
        }
      }
    }

    const adapter = Object.freeze({
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
    return Object.freeze({
      adapter,
      operator: Object.freeze({ inspect: inspectForResolution, resolve: resolveOperation }),
    });
  }

  const phases = Object.fromEntries(PHASES.map((phase) => [phase, phaseAdapter(phase)]));
  return deepFreeze({
    native: phases.native.adapter,
    review: phases.review.adapter,
    revision: phases.revision.adapter,
    createOperatorResolutionController(loadedPolicy) {
      if (!loadedPolicy || typeof loadedPolicy !== 'object') {
        throw new TypeError('provider phase resolution policy is required');
      }
      function port(phase) {
        if (!Object.hasOwn(phases, phase)) {
          throw new TypeError('provider phase resolution phase is invalid');
        }
        return phases[phase].operator;
      }
      return deepFreeze({
        policyDigest: loadedPolicy.digest,
        authorityKeyId: loadedPolicy.policy.authority.keyId,
        async inspect({ phase, dispatch } = {}) {
          return port(phase).inspect(dispatch, loadedPolicy);
        },
        async resolve({ phase, dispatch, signedDecision, response } = {}) {
          return port(phase).resolve({
            dispatch, signedDecision, loadedPolicy,
            ...(response === undefined ? {} : { response }),
          });
        },
      });
    },
  });
}
