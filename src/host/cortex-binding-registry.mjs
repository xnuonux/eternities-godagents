import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  compileCortexBindingCandidate,
  verifyCortexBindingCandidate,
} from '../cortex/binding-compiler.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { replaceFileAtomically } from '../state/atomic-publication.mjs';
import {
  claimLocalInstanceResidency,
  defaultLocalInstanceRegistryRoot,
} from './local-instance-registry.mjs';

const protocolId = 'eternities-godagent-cortex-binding-registry-v1';
const zeroDigest = '0'.repeat(64);
const digestPattern = /^[a-f0-9]{64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const keelIdPattern = /^keel-[a-f0-9]{64}$/;
const maximumRegistryBytes = 32 * 1024 * 1024;
const eventTypes = new Set([
  'binding.acquired', 'binding.renewed', 'binding.released', 'binding.revoked', 'binding.expired',
]);
const payloadKeys = Object.freeze({
  'binding.acquired': Object.freeze([
    'bindingCandidateId', 'bindingCandidateDigest', 'identityDigest', 'instanceId', 'genesisId',
    'genomeDigest', 'distributionDigest', 'realmContractDigest', 'keelId', 'keelHeadDigest',
    'taskId', 'hostAdapterId', 'revocationEpoch', 'createdAt', 'lastVerifiedAt', 'leaseId',
    'credentialDigest', 'issuedAt', 'expiresAt',
  ]),
  'binding.renewed': Object.freeze([
    'leaseId', 'credentialDigest', 'bindingCandidateDigest', 'keelHeadDigest', 'lastVerifiedAt',
    'previousExpiresAt', 'expiresAt',
  ]),
  'binding.released': Object.freeze(['leaseId', 'credentialDigest', 'closedAt', 'revocationEpoch']),
  'binding.revoked': Object.freeze([
    'leaseId', 'credentialDigest', 'closedAt', 'previousRevocationEpoch', 'revocationEpoch', 'reasonDigest',
  ]),
  'binding.expired': Object.freeze(['leaseId', 'closedAt', 'revocationEpoch']),
});
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

export class CortexBindingRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CortexBindingRegistryError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CortexBindingRegistryError(code, message);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntegrityError(`${label} must be an object`);
  }
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new IntegrityError(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (!digestPattern.test(value ?? '')) throw new IntegrityError(`${label} is invalid`);
}

function requireIdentifier(value, label) {
  if (!identifierPattern.test(value ?? '') || value === '.' || value === '..') {
    throw new IntegrityError(`${label} is invalid`);
  }
}

function parseTime(value, label) {
  const milliseconds = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(milliseconds)
      || new Date(milliseconds).toISOString() !== value) {
    throw new IntegrityError(`${label} is invalid`);
  }
  return milliseconds;
}

function clockValue(clock) {
  if (typeof clock !== 'function') throw new TypeError('binding clock is required');
  const value = Number(clock());
  if (!Number.isFinite(value)) throw new TypeError('binding clock is invalid');
  return value;
}

function pathIdentity(value) {
  const path = resolve(value);
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function admissionRootFor(admission) {
  if (!admission || typeof admission !== 'object' || Array.isArray(admission)) {
    throw new TypeError('binding admission is required');
  }
  const root = resolve(dirname(admission.creationDir));
  const expected = {
    creationDir: join(root, 'creation'),
    distributionDir: join(root, 'distribution'),
    transactionDir: join(root, 'transaction'),
    journalPath: join(root, 'vessel', 'journal.jsonl'),
    receiptPath: join(root, 'transaction', 'genesis-receipt.json'),
  };
  for (const [key, value] of Object.entries(expected)) {
    if (typeof admission[key] !== 'string' || pathIdentity(admission[key]) !== pathIdentity(value)) {
      throw new TypeError(`binding admission ${key} is outside its canonical root`);
    }
  }
  return root;
}

function initialRegistryState() {
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    events: [],
    headDigest: zeroDigest,
  };
  return { ...unsigned, registryDigest: sha256Value(unsigned) };
}

function stateValue(events) {
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    events: structuredClone(events),
    headDigest: events.at(-1)?.contentDigest ?? zeroDigest,
  };
  const state = { ...unsigned, registryDigest: sha256Value(unsigned) };
  assertSchema('cortex-binding-registry-state', state);
  return state;
}

function eventValue({ events, eventType, bindingId, recordedAt, payload }) {
  const unsigned = {
    schemaVersion: 1,
    sequence: events.length + 1,
    previousDigest: events.at(-1)?.contentDigest ?? zeroDigest,
    eventType,
    bindingId,
    recordedAt,
    payload: structuredClone(payload),
  };
  return { ...unsigned, contentDigest: sha256Value(unsigned) };
}

function deriveLeaseId(payload) {
  return sha256Value({
    schemaVersion: 1,
    protocolId,
    mode: 'exclusive-writer',
    bindingCandidateId: payload.bindingCandidateId,
    credentialDigest: payload.credentialDigest,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  });
}

function deriveBindingId(payload) {
  return sha256Value({
    schemaVersion: 1,
    protocolId,
    bindingCandidateId: payload.bindingCandidateId,
    bindingCandidateDigest: payload.bindingCandidateDigest,
    identityDigest: payload.identityDigest,
    instanceId: payload.instanceId,
    keelId: payload.keelId,
    taskId: payload.taskId,
    hostAdapterId: payload.hostAdapterId,
    revocationEpoch: payload.revocationEpoch,
    leaseId: payload.leaseId,
    createdAt: payload.createdAt,
  });
}

function validateAcquirePayload(event) {
  const payload = event.payload;
  for (const name of [
    'bindingCandidateId', 'bindingCandidateDigest', 'identityDigest', 'genesisId', 'genomeDigest',
    'distributionDigest', 'realmContractDigest', 'keelHeadDigest', 'leaseId', 'credentialDigest',
  ]) requireDigest(payload[name], `binding acquisition ${name}`);
  requireIdentifier(payload.instanceId, 'binding acquisition instanceId');
  requireIdentifier(payload.taskId, 'binding acquisition taskId');
  requireIdentifier(payload.hostAdapterId, 'binding acquisition hostAdapterId');
  if (!keelIdPattern.test(payload.keelId ?? '')) throw new IntegrityError('binding acquisition keelId is invalid');
  if (!Number.isInteger(payload.revocationEpoch) || payload.revocationEpoch < 0) {
    throw new IntegrityError('binding acquisition revocation epoch is invalid');
  }
  const created = parseTime(payload.createdAt, 'binding acquisition createdAt');
  const verified = parseTime(payload.lastVerifiedAt, 'binding acquisition lastVerifiedAt');
  const issued = parseTime(payload.issuedAt, 'binding acquisition issuedAt');
  const expires = parseTime(payload.expiresAt, 'binding acquisition expiresAt');
  if (created !== issued || verified !== issued || expires <= issued) {
    throw new IntegrityError('binding acquisition lease times are invalid');
  }
  if (payload.leaseId !== deriveLeaseId(payload)) throw new IntegrityError('binding lease id mismatch');
  if (event.bindingId !== deriveBindingId(payload)) throw new IntegrityError('binding id mismatch');
}

function activeRecords(records) {
  return [...records.values()].filter((record) => record.status === 'active');
}

function epochFloor(records, field, value) {
  return [...records.values()]
    .filter((record) => record[field] === value)
    .reduce((maximum, record) => Math.max(maximum, record.revocationEpoch), 0);
}

function replayEvents(events) {
  const records = new Map();
  let previousDigest = zeroDigest;
  let previousTime = -Infinity;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    exactKeys(event, [
      'schemaVersion', 'sequence', 'previousDigest', 'eventType', 'bindingId', 'recordedAt', 'payload', 'contentDigest',
    ], 'binding registry event');
    if (event.schemaVersion !== 1 || event.sequence !== index + 1
        || event.previousDigest !== previousDigest || !eventTypes.has(event.eventType)) {
      throw new IntegrityError('binding registry event chain is invalid');
    }
    requireDigest(event.bindingId, 'binding registry event bindingId');
    const recorded = parseTime(event.recordedAt, 'binding registry event recordedAt');
    if (recorded < previousTime) throw new IntegrityError('binding registry event time moved backward');
    exactKeys(event.payload, payloadKeys[event.eventType], `${event.eventType} payload`);
    const { contentDigest, ...unsigned } = event;
    if (contentDigest !== sha256Value(unsigned)) throw new IntegrityError('registry event digest mismatch');

    if (event.eventType === 'binding.acquired') {
      validateAcquirePayload(event);
      if (records.has(event.bindingId)) throw new IntegrityError('binding id was acquired twice');
      const payload = event.payload;
      const requiredEpoch = Math.max(
        epochFloor(records, 'taskId', payload.taskId),
        epochFloor(records, 'instanceId', payload.instanceId),
      );
      if (payload.revocationEpoch !== requiredEpoch) {
        throw new IntegrityError('binding acquisition revocation epoch mismatch');
      }
      if (activeRecords(records).some((record) => record.taskId === payload.taskId)) {
        throw new IntegrityError('binding registry contains an active task collision');
      }
      if (activeRecords(records).some((record) => record.keelId === payload.keelId
          || record.instanceId === payload.instanceId)) {
        throw new IntegrityError('binding registry contains an active writer collision');
      }
      records.set(event.bindingId, {
        bindingId: event.bindingId,
        status: 'active',
        active: true,
        ...structuredClone(payload),
        lastEventDigest: event.contentDigest,
        lastRecordedAt: event.recordedAt,
        closedAt: null,
      });
    } else {
      const record = records.get(event.bindingId);
      if (!record || record.status !== 'active') throw new IntegrityError('binding lifecycle event targets no active binding');
      const payload = event.payload;
      if (payload.leaseId !== record.leaseId) throw new IntegrityError('binding lifecycle lease mismatch');
      if (event.eventType !== 'binding.expired' && payload.credentialDigest !== record.credentialDigest) {
        throw new IntegrityError('binding lifecycle credential mismatch');
      }

      if (event.eventType === 'binding.renewed') {
        for (const name of ['leaseId', 'credentialDigest', 'bindingCandidateDigest', 'keelHeadDigest']) {
          requireDigest(payload[name], `binding renewal ${name}`);
        }
        const verified = parseTime(payload.lastVerifiedAt, 'binding renewal lastVerifiedAt');
        const previousExpiry = parseTime(payload.previousExpiresAt, 'binding renewal previousExpiresAt');
        const expiry = parseTime(payload.expiresAt, 'binding renewal expiresAt');
        if (payload.previousExpiresAt !== record.expiresAt || verified !== recorded
            || recorded > previousExpiry || expiry <= previousExpiry
            || payload.bindingCandidateDigest !== record.bindingCandidateDigest
            || payload.keelHeadDigest !== record.keelHeadDigest) {
          throw new IntegrityError('binding renewal evidence mismatch');
        }
        record.lastVerifiedAt = payload.lastVerifiedAt;
        record.expiresAt = payload.expiresAt;
      } else if (event.eventType === 'binding.released') {
        parseTime(payload.closedAt, 'binding release closedAt');
        if (payload.closedAt !== event.recordedAt || payload.revocationEpoch !== record.revocationEpoch) {
          throw new IntegrityError('binding release evidence mismatch');
        }
        record.status = 'released';
        record.active = false;
        record.closedAt = payload.closedAt;
      } else if (event.eventType === 'binding.revoked') {
        parseTime(payload.closedAt, 'binding revocation closedAt');
        requireDigest(payload.reasonDigest, 'binding revocation reasonDigest');
        if (payload.closedAt !== event.recordedAt
            || payload.previousRevocationEpoch !== record.revocationEpoch
            || payload.revocationEpoch !== record.revocationEpoch + 1) {
          throw new IntegrityError('binding revocation evidence mismatch');
        }
        record.status = 'revoked';
        record.active = false;
        record.closedAt = payload.closedAt;
        record.revocationEpoch = payload.revocationEpoch;
      } else {
        parseTime(payload.closedAt, 'binding expiry closedAt');
        if (payload.closedAt !== event.recordedAt || payload.revocationEpoch !== record.revocationEpoch
            || recorded < parseTime(record.expiresAt, 'binding active expiresAt')) {
          throw new IntegrityError('binding expiry evidence mismatch');
        }
        record.status = 'expired';
        record.active = false;
        record.closedAt = payload.closedAt;
      }
      record.lastEventDigest = event.contentDigest;
      record.lastRecordedAt = event.recordedAt;
    }
    previousDigest = event.contentDigest;
    previousTime = recorded;
  }
  return { records };
}

function verifyState(value) {
  assertSchema('cortex-binding-registry-state', value);
  const { registryDigest, ...unsigned } = value;
  if (registryDigest !== sha256Value(unsigned)) throw new IntegrityError('cortex binding registry digest mismatch');
  if (value.headDigest !== (value.events.at(-1)?.contentDigest ?? zeroDigest)) {
    throw new IntegrityError('cortex binding registry head mismatch');
  }
  const replayed = replayEvents(value.events);
  return { state: value, ...replayed };
}

async function readRegistry(root) {
  const path = join(root, 'registry.json');
  let text;
  try {
    const metadata = await stat(path);
    if (metadata.size > maximumRegistryBytes) {
      throw new IntegrityError('cortex binding registry exceeds maximum size');
    }
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return verifyState(initialRegistryState());
    throw error;
  }
  if (Buffer.byteLength(text, 'utf8') > maximumRegistryBytes) {
    throw new IntegrityError('cortex binding registry exceeds maximum size');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new IntegrityError('cortex binding registry is not valid JSON');
  }
  if (text !== jsonBytes(value)) throw new IntegrityError('cortex binding registry is not canonical');
  return verifyState(value);
}

function appendEvent(events, eventType, bindingId, recordedAt, payload) {
  const event = eventValue({ events, eventType, bindingId, recordedAt, payload });
  events.push(event);
  const replayed = replayEvents(events);
  return { event, record: replayed.records.get(bindingId), replayed };
}

async function mutateRegistry({ registryRoot, nowMs, mutate }) {
  const root = resolve(registryRoot);
  await mkdir(root, { recursive: true });
  const lock = await acquireFileLock({ lockPath: join(root, 'registry.lock') });
  try {
    const loaded = await readRegistry(root);
    const events = structuredClone(loaded.state.events);
    let replayed = replayEvents(events);
    const recordedAt = new Date(nowMs).toISOString();
    const expiredRecords = [...replayed.records.values()].filter(
      (record) => record.status === 'active' && Date.parse(record.expiresAt) <= nowMs,
    );
    for (const record of expiredRecords) {
      events.push(eventValue({
        events,
        eventType: 'binding.expired',
        bindingId: record.bindingId,
        recordedAt,
        payload: {
          leaseId: record.leaseId,
          closedAt: recordedAt,
          revocationEpoch: record.revocationEpoch,
        },
      }));
    }
    if (expiredRecords.length > 0) replayed = replayEvents(events);

    let result;
    let failure;
    try {
      result = await mutate({
        events,
        recordedAt,
        records: () => replayed.records,
        append(eventType, bindingId, payload) {
          const appended = appendEvent(events, eventType, bindingId, recordedAt, payload);
          replayed = appended.replayed;
          return appended;
        },
      });
    } catch (error) {
      failure = error;
    }

    if (canonicalJson(events) !== canonicalJson(loaded.state.events)) {
      await replaceFileAtomically({
        destinationPath: join(root, 'registry.json'),
        content: jsonBytes(stateValue(events)),
      });
      await readRegistry(root);
    }
    if (failure) throw failure;
    return result;
  } finally {
    await lock.release();
  }
}

function publicRecord(record) {
  const projected = {
    bindingId: record.bindingId,
    status: record.status,
    active: record.active,
    bindingCandidateId: record.bindingCandidateId,
    bindingCandidateDigest: record.bindingCandidateDigest,
    identityDigest: record.identityDigest,
    instanceId: record.instanceId,
    genesisId: record.genesisId,
    genomeDigest: record.genomeDigest,
    distributionDigest: record.distributionDigest,
    realmContractDigest: record.realmContractDigest,
    keelId: record.keelId,
    keelHeadDigest: record.keelHeadDigest,
    taskId: record.taskId,
    hostAdapterId: record.hostAdapterId,
    revocationEpoch: record.revocationEpoch,
    createdAt: record.createdAt,
    lastVerifiedAt: record.lastVerifiedAt,
    lease: {
      leaseId: record.leaseId,
      mode: 'exclusive-writer',
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
    },
    lastEventDigest: record.lastEventDigest,
  };
  if (record.closedAt !== null) projected.closedAt = record.closedAt;
  return projected;
}

function activeReceipt(record) {
  if (record.status !== 'active') throw new IntegrityError('cannot issue an active receipt for a closed binding');
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    status: 'active',
    active: true,
    bindingId: record.bindingId,
    bindingCandidateId: record.bindingCandidateId,
    bindingCandidateDigest: record.bindingCandidateDigest,
    identityDigest: record.identityDigest,
    instanceId: record.instanceId,
    genesisId: record.genesisId,
    genomeDigest: record.genomeDigest,
    distributionDigest: record.distributionDigest,
    realmContractDigest: record.realmContractDigest,
    keelId: record.keelId,
    keelHeadDigest: record.keelHeadDigest,
    taskId: record.taskId,
    hostAdapterId: record.hostAdapterId,
    revocationEpoch: record.revocationEpoch,
    createdAt: record.createdAt,
    lastVerifiedAt: record.lastVerifiedAt,
    lease: {
      leaseId: record.leaseId,
      mode: 'exclusive-writer',
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
    },
    authority: { continuity: 'host-lease-only', realmEffects: 'none' },
    registryEventDigest: record.lastEventDigest,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('cortex-binding-receipt', receipt);
  return deepFreeze(receipt);
}

function lifecycleReceipt(record) {
  if (record.status === 'active') throw new IntegrityError('cannot issue a lifecycle receipt for an active binding');
  const unsigned = {
    schemaVersion: 1,
    protocolId,
    status: record.status,
    active: false,
    bindingId: record.bindingId,
    instanceId: record.instanceId,
    taskId: record.taskId,
    revocationEpoch: record.revocationEpoch,
    recordedAt: record.lastRecordedAt,
    registryEventDigest: record.lastEventDigest,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('cortex-binding-lifecycle-receipt', receipt);
  return deepFreeze(receipt);
}

export function verifyCortexBindingLifecycleReceipt(value) {
  const receipt = structuredClone(value);
  assertSchema('cortex-binding-lifecycle-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError('binding lifecycle receipt digest mismatch');
  return deepFreeze(receipt);
}

export function verifyCortexBindingReceipt(value) {
  const receipt = structuredClone(value);
  assertSchema('cortex-binding-receipt', receipt);
  const { receiptDigest, ...unsigned } = receipt;
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError('binding receipt digest mismatch');
  return deepFreeze(receipt);
}

export function defaultCortexBindingRegistryRoot() {
  const profile = userInfo().homedir;
  if (typeof profile !== 'string' || profile.length === 0 || /[\0\r\n]/.test(profile)) {
    throw new IntegrityError('OS account profile directory is unavailable');
  }
  return join(profile, '.eternities', 'godagents', 'cortex-bindings');
}

export async function inspectCortexBindingById({
  registryRoot = defaultCortexBindingRegistryRoot(),
  bindingId,
  clock = Date.now,
} = {}) {
  if (typeof registryRoot !== 'string' || registryRoot.length === 0 || /[\0\r\n]/.test(registryRoot)) {
    throw new TypeError('cortex binding registry root is invalid');
  }
  requireDigest(bindingId, 'binding id');
  const nowMs = clockValue(clock);
  const result = await mutateRegistry({
    registryRoot,
    nowMs,
    mutate: ({ records }) => {
      const record = records().get(bindingId);
      if (!record) fail('binding-missing', 'binding record is unavailable');
      return record.status === 'active'
        ? { status: 'active', receipt: activeReceipt(record) }
        : { status: 'terminal', receipt: lifecycleReceipt(record) };
    },
  });
  return deepFreeze(result);
}

export async function inspectCortexBindingRegistry({
  registryRoot = defaultCortexBindingRegistryRoot(),
  clock = Date.now,
} = {}) {
  if (typeof registryRoot !== 'string' || registryRoot.length === 0 || /[\0\r\n]/.test(registryRoot)) {
    throw new TypeError('cortex binding registry root is invalid');
  }
  const nowMs = clockValue(clock);
  await mutateRegistry({ registryRoot, nowMs, mutate: () => undefined });
  const loaded = await readRegistry(resolve(registryRoot));
  return deepFreeze({
    schemaVersion: 1,
    protocolId,
    registryDigest: loaded.state.registryDigest,
    headDigest: loaded.state.headDigest,
    eventCount: loaded.state.events.length,
    bindings: [...loaded.records.values()].map(publicRecord),
  });
}

function requireLeaseDuration(value) {
  if (!Number.isInteger(value) || value < 1_000 || value > 86_400_000) {
    throw new TypeError('binding leaseDurationMs is invalid');
  }
}

function sourceMatches(first, second) {
  return first.candidateDigest === second.candidateDigest
    && first.bindingCandidateId === second.bindingCandidateId
    && first.fullEnvelope.sectionDigests.identity === second.fullEnvelope.sectionDigests.identity
    && first.fullEnvelope.binding.currentKeelHeadDigest === second.fullEnvelope.binding.currentKeelHeadDigest;
}

export async function acquireCortexBinding({
  registryRoot = defaultCortexBindingRegistryRoot(),
  instanceRegistryRoot = defaultLocalInstanceRegistryRoot(),
  admission,
  request,
  leaseDurationMs,
  clock = Date.now,
  leaseCredential = randomUUID,
  writerLockOptions = {},
} = {}) {
  requireLeaseDuration(leaseDurationMs);
  if (typeof leaseCredential !== 'function') throw new TypeError('binding lease credential factory is required');
  if (typeof registryRoot !== 'string' || registryRoot.length === 0 || /[\0\r\n]/.test(registryRoot)) {
    throw new TypeError('cortex binding registry root is invalid');
  }
  const admissionRoot = admissionRootFor(admission);
  const firstCandidate = await compileCortexBindingCandidate({ admission, request });
  verifyCortexBindingCandidate(firstCandidate);
  const binding = firstCandidate.fullEnvelope.binding;
  await claimLocalInstanceResidency({
    registryRoot: instanceRegistryRoot,
    binding,
    admissionRoot,
  });

  let writerLock;
  try {
    writerLock = await acquireFileLock({
      ...writerLockOptions,
      lockPath: join(admissionRoot, 'vessel', 'launch.lock'),
    });
    const finalCandidate = await compileCortexBindingCandidate({ admission, request });
    if (!sourceMatches(firstCandidate, finalCandidate)) {
      fail('source-changed', 'verified binding source changed before lease acquisition');
    }
    const nowMs = clockValue(clock);
    const issuedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + leaseDurationMs).toISOString();
    const credential = String(leaseCredential());
    if (credential.length < 8 || credential.length > 1024 || /[\0\r\n]/.test(credential)) {
      throw new TypeError('binding lease credential is invalid');
    }
    const credentialDigest = sha256Text(credential);
    const acquirePayload = {
      bindingCandidateId: finalCandidate.bindingCandidateId,
      bindingCandidateDigest: finalCandidate.candidateDigest,
      identityDigest: finalCandidate.fullEnvelope.sectionDigests.identity,
      instanceId: binding.instanceId,
      genesisId: binding.genesisId,
      genomeDigest: binding.genomeValueDigest,
      distributionDigest: binding.distributionBuildId,
      realmContractDigest: finalCandidate.fullEnvelope.authority.realmContractDigest,
      keelId: binding.keelId,
      keelHeadDigest: binding.currentKeelHeadDigest,
      taskId: request.task.taskId,
      hostAdapterId: request.task.hostAdapterId,
      revocationEpoch: request.task.revocationEpoch,
      createdAt: issuedAt,
      lastVerifiedAt: issuedAt,
      leaseId: '',
      credentialDigest,
      issuedAt,
      expiresAt,
    };
    acquirePayload.leaseId = deriveLeaseId(acquirePayload);
    const bindingId = deriveBindingId(acquirePayload);
    const acquired = await mutateRegistry({
      registryRoot,
      nowMs,
      mutate({ records, append }) {
        const current = records();
        const requiredEpoch = Math.max(
          epochFloor(current, 'taskId', request.task.taskId),
          epochFloor(current, 'instanceId', binding.instanceId),
        );
        if (request.task.revocationEpoch !== requiredEpoch) {
          fail('revocation-epoch-mismatch', 'revocation epoch mismatch');
        }
        if (activeRecords(current).some((record) => record.taskId === request.task.taskId)) {
          fail('task-conflict', 'task already has an active godagent binding');
        }
        if (activeRecords(current).some((record) => record.keelId === binding.keelId
            || record.instanceId === binding.instanceId)) {
          fail('writer-conflict', 'personal keel already has an active writer');
        }
        return append('binding.acquired', bindingId, acquirePayload).record;
      },
    });

    let currentReceipt = activeReceipt(acquired);
    let terminalReceipt = null;
    let operation = Promise.resolve();
    const serialized = (callback) => {
      const result = operation.then(callback, callback);
      operation = result.catch(() => undefined);
      return result;
    };
    const closeWriter = async () => {
      if (!writerLock) return;
      const lock = writerLock;
      await lock.release();
      if (writerLock === lock) writerLock = null;
    };

    const handle = {
      get receipt() { return currentReceipt; },
      inspect() {
        return serialized(async () => {
          if (terminalReceipt) {
            await closeWriter();
            return terminalReceipt;
          }
          await mutateRegistry({
            registryRoot,
            nowMs: clockValue(clock),
            mutate: () => undefined,
          });
          const loaded = await readRegistry(resolve(registryRoot));
          const record = loaded.records.get(bindingId);
          if (!record || record.credentialDigest !== credentialDigest) {
            fail('binding-missing', 'active binding record is unavailable');
          }
          if (record.status !== 'active') {
            terminalReceipt = lifecycleReceipt(record);
            await closeWriter();
            return terminalReceipt;
          }
          currentReceipt = activeReceipt(record);
          return currentReceipt;
        });
      },
      renew() {
        return serialized(async () => {
          if (terminalReceipt) {
            await closeWriter();
            fail('binding-closed', 'binding is no longer active');
          }
          const candidate = await compileCortexBindingCandidate({ admission, request });
          if (!sourceMatches(finalCandidate, candidate)) {
            fail('source-changed', 'verified binding source changed before renewal');
          }
          const renewalNow = clockValue(clock);
          let renewed;
          try {
            renewed = await mutateRegistry({
              registryRoot,
              nowMs: renewalNow,
              mutate({ records, append, recordedAt }) {
                const record = records().get(bindingId);
                if (!record || record.status !== 'active') fail('binding-closed', 'binding is no longer active');
                if (record.credentialDigest !== credentialDigest) fail('credential-mismatch', 'binding lease credential mismatch');
                const nextExpiryMs = Math.max(
                  renewalNow + leaseDurationMs,
                  Date.parse(record.expiresAt) + 1,
                );
                const nextExpiry = new Date(nextExpiryMs).toISOString();
                return append('binding.renewed', bindingId, {
                  leaseId: record.leaseId,
                  credentialDigest,
                  bindingCandidateDigest: candidate.candidateDigest,
                  keelHeadDigest: candidate.fullEnvelope.binding.currentKeelHeadDigest,
                  lastVerifiedAt: recordedAt,
                  previousExpiresAt: record.expiresAt,
                  expiresAt: nextExpiry,
                }).record;
              },
            });
          } catch (error) {
            if (error instanceof CortexBindingRegistryError && error.code === 'binding-closed') {
              const loaded = await readRegistry(resolve(registryRoot));
              const record = loaded.records.get(bindingId);
              if (record && record.status !== 'active' && record.credentialDigest === credentialDigest) {
                terminalReceipt = lifecycleReceipt(record);
                await closeWriter();
              }
            }
            throw error;
          }
          currentReceipt = activeReceipt(renewed);
          return currentReceipt;
        });
      },
      release() {
        return serialized(async () => {
          if (terminalReceipt) {
            await closeWriter();
            return terminalReceipt;
          }
          const releasedAt = clockValue(clock);
          const record = await mutateRegistry({
            registryRoot,
            nowMs: releasedAt,
            mutate({ records, append, recordedAt }) {
              const current = records().get(bindingId);
              if (!current) fail('binding-missing', 'binding record is unavailable');
              if (current.status !== 'active') return current;
              if (current.credentialDigest !== credentialDigest) fail('credential-mismatch', 'binding lease credential mismatch');
              return append('binding.released', bindingId, {
                leaseId: current.leaseId,
                credentialDigest,
                closedAt: recordedAt,
                revocationEpoch: current.revocationEpoch,
              }).record;
            },
          });
          terminalReceipt = lifecycleReceipt(record);
          await closeWriter();
          return terminalReceipt;
        });
      },
      revoke({ reasonDigest } = {}) {
        return serialized(async () => {
          if (terminalReceipt) {
            await closeWriter();
            return terminalReceipt;
          }
          requireDigest(reasonDigest, 'binding revocation reasonDigest');
          const revokedAt = clockValue(clock);
          const record = await mutateRegistry({
            registryRoot,
            nowMs: revokedAt,
            mutate({ records, append, recordedAt }) {
              const current = records().get(bindingId);
              if (!current) fail('binding-missing', 'binding record is unavailable');
              if (current.status !== 'active') return current;
              if (current.credentialDigest !== credentialDigest) fail('credential-mismatch', 'binding lease credential mismatch');
              return append('binding.revoked', bindingId, {
                leaseId: current.leaseId,
                credentialDigest,
                closedAt: recordedAt,
                previousRevocationEpoch: current.revocationEpoch,
                revocationEpoch: current.revocationEpoch + 1,
                reasonDigest,
              }).record;
            },
          });
          terminalReceipt = lifecycleReceipt(record);
          await closeWriter();
          return terminalReceipt;
        });
      },
    };
    return Object.freeze(handle);
  } catch (error) {
    if (writerLock) {
      try { await writerLock.release(); } catch { /* preserve the primary failure */ }
    }
    throw error;
  }
}
