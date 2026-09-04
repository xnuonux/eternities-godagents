import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { executeNegotiatedConsequence } from './negotiated-consequence-executor.mjs';
import { verifyRealmNegotiation } from './negotiation.mjs';
import { appendEvent, readVerifiedJournal } from '../state/journal.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

export const RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID = 'eternities-recoverable-realm-consequence-v1';

const JOURNAL_PROTOCOL_ID = 'eternities-recoverable-realm-consequence-journal-v1';
const SOURCE_CLASS = 'recoverable-realm-consequence-host';
const EVENT_TYPES = Object.freeze([
  'consequence.admitted',
  'consequence.resulted',
  'consequence.receipted',
]);
const INPUT_KEYS = ['mission', 'proposal', 'contract', 'authority', 'constitution', 'state'];
const RESULT_KEYS = ['negotiation', 'decision', 'action', 'actionReceipt', 'receipt'];
const ACTION_KEYS = ['actionId', 'idempotencyKey', 'handId', 'payload'];
const RECEIPT_KEYS = [
  'schemaVersion', 'protocolId', 'executionId', 'inputDigest', 'instanceId', 'missionId',
  'stateEpoch', 'consequenceDigest', 'consequenceReceiptDigest', 'actionReceiptDigest',
  'resultEventDigest', 'invocationStatus', 'discrepancyClass', 'disposition', 'receiptDigest',
];
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_EVENT_BYTES = 2 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const ZERO_DIGEST = '0'.repeat(64);
const HOSTS = new WeakSet();
const PREFLIGHT_BOUNDARY = Symbol('recoverable realm consequence preflight boundary');

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
    throw new TypeError(`${label} fields do not match the certified shape`);
  }
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(`${label} is not cloneable`, { cause: error });
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new IntegrityError(`${label} is invalid`);
}

function requireExecutionId(value, label = 'execution id') {
  requireDigest(value, label);
  return value;
}

function requireSafeRecordedAt(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new IntegrityError('recoverable consequence journal recordedAt is invalid');
  }
}

function pathIdentity(value) {
  const absolute = resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function requireContained(root, target, label) {
  const remainder = relative(root, target);
  if (remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder))) return;
  throw new IntegrityError(`${label} escaped the recoverable consequence root`);
}

async function ensureRealDirectory(path, label, expectedParent = null) {
  await mkdir(path, { recursive: true });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new IntegrityError(`${label} is not a real directory`);
  }
  const actual = await realpath(path);
  if (pathIdentity(actual) !== pathIdentity(path)) throw new IntegrityError(`${label} is a path alias`);
  if (expectedParent !== null) requireContained(expectedParent, actual, label);
  return actual;
}

async function ensureExistingDirectory(path, label, expectedParent = null) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new IntegrityError(`${label} is not a real directory`);
  const actual = await realpath(path);
  if (pathIdentity(actual) !== pathIdentity(path)) throw new IntegrityError(`${label} is a path alias`);
  if (expectedParent !== null) requireContained(expectedParent, actual, label);
  return actual;
}

async function verifyJournalFile(journalPath) {
  let stat;
  try {
    stat = await lstat(journalPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_JOURNAL_BYTES) {
    throw new IntegrityError('recoverable consequence journal is not a bounded regular file');
  }
  const actual = await realpath(journalPath);
  if (pathIdentity(actual) !== pathIdentity(journalPath)) {
    throw new IntegrityError('recoverable consequence journal is a path alias');
  }
  return actual;
}

async function verifyWritableJournalPath(journalPath) {
  let stat;
  try {
    stat = await lstat(journalPath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new IntegrityError('recoverable consequence journal path is not a regular file');
  }
  const actual = await realpath(journalPath);
  if (pathIdentity(actual) !== pathIdentity(journalPath)) {
    throw new IntegrityError('recoverable consequence journal path is an alias');
  }
}

async function verifyLockPath(lockPath) {
  let stat;
  try {
    stat = await lstat(lockPath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new IntegrityError('recoverable consequence execution lock is not a regular file');
  }
}

async function verifyOperationDirectory(executionRoot) {
  const entries = await readdir(executionRoot, { withFileTypes: true });
  const allowed = new Set(['execution.lock', 'journal.jsonl']);
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !allowed.has(entry.name)) {
      throw new IntegrityError(`recoverable consequence execution contains an unexpected entry: ${entry.name}`);
    }
  }
}

function normalizeInput(input) {
  exactKeys(input, INPUT_KEYS, 'recoverable consequence input');
  assertNoCredentialFields(input);
  const normalized = clone(input, 'recoverable consequence input');
  exactKeys(normalized, INPUT_KEYS, 'recoverable consequence input');
  assertNoCredentialFields(normalized);
  return normalized;
}

function executionIdForInput(input) {
  const normalized = normalizeInput(input);
  const inputDigest = sha256Value(normalized);
  return sha256Value({
    schemaVersion: 1,
    protocolId: RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID,
    inputDigest,
  });
}

function preflightRealm(contract) {
  return Object.freeze({
    contract,
    async observe() {
      throw PREFLIGHT_BOUNDARY;
    },
    async invoke() {
      throw PREFLIGHT_BOUNDARY;
    },
    async reconcile() {
      throw PREFLIGHT_BOUNDARY;
    },
  });
}

async function validateInputWithoutEffect(input) {
  try {
    await executeNegotiatedConsequence({ ...input, realm: preflightRealm(input.contract) });
  } catch (error) {
    if (error === PREFLIGHT_BOUNDARY) return;
    throw error;
  }
  throw new IntegrityError('recoverable consequence preflight crossed no Realm boundary');
}

function verifyConsequenceResult(value, input, label = 'recoverable consequence result') {
  exactKeys(value, RESULT_KEYS, label);
  assertNoCredentialFields(value);
  assertSchema('decision-commit', value.decision);
  assertSchema('action-receipt', value.actionReceipt);
  assertSchema('realm-negotiated-consequence', value.receipt);
  exactKeys(value.action, ACTION_KEYS, `${label} action`);
  for (const key of ['actionId', 'idempotencyKey', 'handId']) {
    if (typeof value.action[key] !== 'string' || value.action[key].length === 0) {
      throw new IntegrityError(`${label} action ${key} is invalid`);
    }
  }
  const negotiation = verifyRealmNegotiation(value.negotiation, {
    contract: input.contract,
    authority: value.negotiation.authorityCeiling,
  });
  if (value.receipt.proposalDigest !== sha256Value(input.proposal)
      || value.receipt.instanceId !== input.state.instanceId
      || value.receipt.missionId !== input.mission.missionId
      || value.receipt.stateEpoch !== input.state.epoch
      || value.receipt.negotiationDigest !== negotiation.negotiationDigest
      || value.receipt.contractDigest !== sha256Value(input.contract)
      || value.receipt.authorityCeilingDigest !== sha256Value(negotiation.authorityCeiling)
      || value.receipt.decisionDigest !== value.decision.receiptDigest
      || value.receipt.actionDigest !== sha256Value(value.action)
      || value.receipt.actionReceiptDigest !== value.actionReceipt.receiptDigest
      || value.receipt.decisionId !== value.decision.decisionId
      || value.receipt.actionId !== value.action.actionId
      || value.receipt.invocationStatus !== value.actionReceipt.invocation.status
      || value.receipt.discrepancyClass !== value.actionReceipt.discrepancyClass
      || value.receipt.disposition !== value.actionReceipt.disposition) {
    throw new IntegrityError(`${label} receipt binding is invalid`);
  }
  const { receiptDigest, ...unsigned } = value.receipt;
  if (receiptDigest !== sha256Value(unsigned)) throw new IntegrityError(`${label} receipt digest is invalid`);
  return value;
}

function buildHostReceipt({ executionId, input, consequence, resultEventDigest }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID,
    executionId,
    inputDigest: sha256Value(input),
    instanceId: input.state.instanceId,
    missionId: input.mission.missionId,
    stateEpoch: input.state.epoch,
    consequenceDigest: sha256Value(consequence),
    consequenceReceiptDigest: consequence.receipt.receiptDigest,
    actionReceiptDigest: consequence.actionReceipt.receiptDigest,
    resultEventDigest,
    invocationStatus: consequence.receipt.invocationStatus,
    discrepancyClass: consequence.receipt.discrepancyClass,
    disposition: consequence.receipt.disposition,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('recoverable-realm-consequence-receipt', receipt);
  assertNoCredentialFields(receipt);
  return receipt;
}

function verifyHostReceipt(value, { executionId, input, consequence, resultEventDigest }) {
  exactKeys(value, RECEIPT_KEYS, 'recoverable consequence receipt');
  assertSchema('recoverable-realm-consequence-receipt', value);
  assertNoCredentialFields(value);
  const expected = buildHostReceipt({ executionId, input, consequence, resultEventDigest });
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new IntegrityError('recoverable consequence receipt binding is invalid');
  }
  return value;
}

function eventPayloadFor(eventType, payload) {
  if (!EVENT_TYPES.includes(eventType)) throw new TypeError(`unsupported recoverable consequence event ${eventType}`);
  assertNoCredentialFields(payload);
  const bytes = Buffer.byteLength(canonicalJson(payload), 'utf8');
  if (bytes > MAX_EVENT_BYTES) throw new TypeError('recoverable consequence event exceeds its byte ceiling');
  return clone(payload, `recoverable consequence ${eventType} payload`);
}

function baseEvent({ executionId, input, eventType, payload, recordedAt }) {
  if (typeof recordedAt !== 'string') throw new TypeError('recoverable consequence clock must return a string');
  requireSafeRecordedAt(recordedAt);
  return {
    schemaVersion: 1,
    instanceId: executionId,
    stateEpoch: input.state.epoch,
    eventType,
    sourceClass: SOURCE_CLASS,
    sourceRef: JOURNAL_PROTOCOL_ID,
    causationId: executionId,
    correlationId: executionId,
    payload: eventPayloadFor(eventType, payload),
    recordedAt,
  };
}

function verifyEventEnvelope(event, { executionId, input, index }) {
  assertSchema('vessel-event', event);
  if (event.instanceId !== executionId
      || event.sequence !== index + 1
      || event.stateEpoch !== input.state.epoch
      || event.sourceClass !== SOURCE_CLASS
      || event.sourceRef !== JOURNAL_PROTOCOL_ID
      || event.causationId !== executionId
      || event.correlationId !== executionId
      || !EVENT_TYPES.includes(event.eventType)) {
    throw new IntegrityError(`recoverable consequence journal event ${index + 1} identity is invalid`);
  }
  requireSafeRecordedAt(event.recordedAt);
  assertNoCredentialFields(event);
  return event;
}

function verifyAdmission(event, executionId) {
  exactKeys(event.payload, ['executionId', 'inputDigest', 'input'], 'recoverable consequence admission payload');
  if (event.payload.executionId !== executionId) {
    throw new IntegrityError('recoverable consequence admission execution id changed');
  }
  const input = normalizeInput(event.payload.input);
  if (event.payload.inputDigest !== sha256Value(input)) {
    throw new IntegrityError('recoverable consequence admission input digest changed');
  }
  return input;
}

function verifyResultEvent(event, { executionId, input, admissionDigest }) {
  exactKeys(event.payload, [
    'executionId', 'inputDigest', 'admissionDigest', 'consequenceDigest', 'consequence',
  ], 'recoverable consequence result payload');
  if (event.payload.executionId !== executionId
      || event.payload.inputDigest !== sha256Value(input)
      || event.payload.admissionDigest !== admissionDigest) {
    throw new IntegrityError('recoverable consequence result provenance changed');
  }
  const consequence = verifyConsequenceResult(event.payload.consequence, input);
  if (event.payload.consequenceDigest !== sha256Value(consequence)) {
    throw new IntegrityError('recoverable consequence result digest changed');
  }
  return consequence;
}

function verifyReceiptEvent(event, { executionId, input, consequence, resultEventDigest }) {
  exactKeys(event.payload, ['executionId', 'inputDigest', 'resultEventDigest', 'receipt'], 'recoverable consequence receipt payload');
  if (event.payload.executionId !== executionId
      || event.payload.inputDigest !== sha256Value(input)
      || event.payload.resultEventDigest !== resultEventDigest) {
    throw new IntegrityError('recoverable consequence receipt provenance changed');
  }
  return verifyHostReceipt(event.payload.receipt, {
    executionId,
    input,
    consequence,
    resultEventDigest,
  });
}

async function readOperationState({ executionRoot, journalPath, executionId }) {
  await verifyOperationDirectory(executionRoot);
  const actualJournal = await verifyJournalFile(journalPath);
  if (actualJournal === null) {
    return {
      events: [],
      input: null,
      consequence: null,
      receipt: null,
      status: 'absent',
      journalHeadDigest: ZERO_DIGEST,
    };
  }
  const journal = await readVerifiedJournal(actualJournal);
  if (journal.quarantinedTail !== null) {
    throw new IntegrityError('recoverable consequence journal has an unverified tail');
  }
  if (journal.events.length > EVENT_TYPES.length) {
    throw new IntegrityError('recoverable consequence journal contains too many events');
  }
  if (journal.events.length === 0) {
    throw new IntegrityError('recoverable consequence journal is empty');
  }
  const events = journal.events.map((event, index) => verifyEventEnvelope(event, {
    executionId,
    input: { state: { epoch: event.stateEpoch } },
    index,
  }));
  if (events[0].eventType !== 'consequence.admitted') {
    throw new IntegrityError('recoverable consequence journal must begin with admission');
  }
  const input = verifyAdmission(events[0], executionId);
  for (const event of events) {
    if (event.stateEpoch !== input.state.epoch) {
      throw new IntegrityError('recoverable consequence journal state epoch changed');
    }
  }
  if (events.length === 1) {
    return {
      events,
      input,
      consequence: null,
      receipt: null,
      status: 'admitted',
      journalHeadDigest: journal.lastDigest,
    };
  }
  if (events[1].eventType !== 'consequence.resulted') {
    throw new IntegrityError('recoverable consequence journal result ordering is invalid');
  }
  const consequence = verifyResultEvent(events[1], {
    executionId,
    input,
    admissionDigest: events[0].contentDigest,
  });
  if (events.length === 2) {
    return {
      events,
      input,
      consequence,
      receipt: null,
      status: 'resulted',
      journalHeadDigest: journal.lastDigest,
    };
  }
  if (events[2].eventType !== 'consequence.receipted') {
    throw new IntegrityError('recoverable consequence journal receipt ordering is invalid');
  }
  const receipt = verifyReceiptEvent(events[2], {
    executionId,
    input,
    consequence,
    resultEventDigest: events[1].contentDigest,
  });
  return {
    events,
    input,
    consequence,
    receipt,
    status: 'completed',
    journalHeadDigest: journal.lastDigest,
  };
}

async function appendOperationEvent({ journalPath, executionId, input, eventType, payload, clock }) {
  const event = baseEvent({
    executionId,
    input,
    eventType,
    payload,
    recordedAt: clock(),
  });
  await verifyWritableJournalPath(journalPath);
  const stored = await appendEvent({ journalPath, event });
  assertSchema('vessel-event', stored);
  const size = (await lstat(journalPath)).size;
  if (size > MAX_JOURNAL_BYTES) throw new IntegrityError('recoverable consequence journal exceeded its byte ceiling');
  return stored;
}

function returnCompleted(state, recovered) {
  return deepFreeze({
    status: 'completed',
    executionId: state.events[0].payload.executionId,
    recovered,
    journalHeadDigest: state.journalHeadDigest,
    consequence: clone(state.consequence, 'recoverable consequence result'),
    receipt: clone(state.receipt, 'recoverable consequence receipt'),
  });
}

async function resumeLocked({
  executionRoot,
  journalPath,
  executionId,
  state,
  realm,
  checkpoint,
  clock,
  recovered,
}) {
  if (state.status === 'completed') return returnCompleted(state, recovered);
  await validateInputWithoutEffect(state.input);
  let current = state;

  if (current.status === 'admitted') {
    const consequence = await executeNegotiatedConsequence({ ...current.input, realm });
    verifyConsequenceResult(consequence, current.input);
    await checkpoint('before-result-publish', clone(consequence, 'recoverable consequence checkpoint result'));
    const resultEvent = await appendOperationEvent({
      journalPath,
      executionId,
      input: current.input,
      eventType: 'consequence.resulted',
      payload: {
        executionId,
        inputDigest: sha256Value(current.input),
        admissionDigest: current.events[0].contentDigest,
        consequenceDigest: sha256Value(consequence),
        consequence,
      },
      clock,
    });
    void resultEvent;
    current = await readOperationState({ executionRoot, journalPath, executionId });
    await checkpoint('after-result-publish', clone(current.events[1], 'recoverable consequence checkpoint event'));
  }

  if (current.status !== 'resulted') {
    throw new IntegrityError(`recoverable consequence cannot resume from ${current.status}`);
  }
  const receipt = buildHostReceipt({
    executionId,
    input: current.input,
    consequence: current.consequence,
    resultEventDigest: current.events[1].contentDigest,
  });
  await appendOperationEvent({
    journalPath,
    executionId,
    input: current.input,
    eventType: 'consequence.receipted',
    payload: {
      executionId,
      inputDigest: sha256Value(current.input),
      resultEventDigest: current.events[1].contentDigest,
      receipt,
    },
    clock,
  });
  current = await readOperationState({ executionRoot, journalPath, executionId });
  return returnCompleted(current, recovered);
}

async function assertHostRealm(realm) {
  object(realm, 'recoverable consequence Realm');
  for (const method of ['observe', 'invoke', 'reconcile']) {
    if (typeof realm[method] !== 'function') throw new TypeError(`recoverable consequence Realm ${method} is required`);
  }
  assertSchema('realm-contract', realm.contract);
  assertNoCredentialFields(realm.contract);
}

async function acquireOperationLock(executionRoot, lockOptions) {
  const lockPath = join(executionRoot, 'execution.lock');
  await verifyLockPath(lockPath);
  return acquireFileLock({ ...lockOptions, lockPath });
}

export function assertRecoverableRealmConsequenceHost(value) {
  if (!value || typeof value !== 'object' || !HOSTS.has(value)) {
    throw new TypeError('recoverable Realm consequence host lacks its private provenance brand');
  }
  return value;
}

export async function createRecoverableRealmConsequenceHost({
  root: rootValue,
  realm,
  checkpoint = async () => {},
  clock = () => new Date().toISOString(),
  lockOptions = {},
} = {}) {
  if (typeof rootValue !== 'string' || rootValue.length === 0 || /[\0\r\n]/.test(rootValue)) {
    throw new TypeError('recoverable consequence host root is required');
  }
  await assertHostRealm(realm);
  if (typeof checkpoint !== 'function') throw new TypeError('recoverable consequence checkpoint must be a function');
  if (typeof clock !== 'function') throw new TypeError('recoverable consequence clock must be a function');
  if (!lockOptions || typeof lockOptions !== 'object' || Array.isArray(lockOptions)) {
    throw new TypeError('recoverable consequence lock options must be an object');
  }
  const root = await ensureRealDirectory(resolve(rootValue), 'recoverable consequence host root');
  const executionsRoot = await ensureRealDirectory(join(root, 'executions'), 'recoverable consequence executions root', root);

  function executionIdFor(input) {
    return executionIdForInput(input);
  }

  async function operationPaths(executionId, { create = true } = {}) {
    requireExecutionId(executionId);
    const executionRootPath = join(executionsRoot, executionId);
    const executionRoot = create
      ? await ensureRealDirectory(executionRootPath, 'recoverable consequence execution root', executionsRoot)
      : await ensureExistingDirectory(executionRootPath, 'recoverable consequence execution root', executionsRoot);
    if (executionRoot === null) return null;
    return {
      executionRoot,
      journalPath: join(executionRoot, 'journal.jsonl'),
    };
  }

  async function inspect(executionId) {
    const paths = await operationPaths(executionId, { create: false });
    if (paths === null) {
      return deepFreeze({
        executionId,
        status: 'absent',
        eventCount: 0,
        journalHeadDigest: ZERO_DIGEST,
      });
    }
    const lock = await acquireOperationLock(paths.executionRoot, lockOptions);
    try {
      const state = await readOperationState({ ...paths, executionId });
      return deepFreeze({
        executionId,
        status: state.status,
        eventCount: state.events.length,
        journalHeadDigest: state.journalHeadDigest,
      });
    } finally {
      await lock.release();
    }
  }

  async function recover(executionId) {
    requireExecutionId(executionId);
    const paths = await operationPaths(executionId, { create: false });
    if (paths === null) throw new IntegrityError('recoverable consequence execution does not exist');
    const lock = await acquireOperationLock(paths.executionRoot, lockOptions);
    try {
      const state = await readOperationState({ ...paths, executionId });
      if (state.status === 'absent') throw new IntegrityError('recoverable consequence execution has no admission');
      return await resumeLocked({
        ...paths,
        executionId,
        state,
        realm,
        checkpoint,
        clock,
        recovered: true,
      });
    } finally {
      await lock.release();
    }
  }

  async function execute(input) {
    const normalized = normalizeInput(input);
    await validateInputWithoutEffect(normalized);
    const executionId = executionIdForInput(normalized);
    const paths = await operationPaths(executionId);
    const lock = await acquireOperationLock(paths.executionRoot, lockOptions);
    try {
      let state = await readOperationState({ ...paths, executionId });
      const wasExisting = state.status !== 'absent';
      if (state.status === 'absent') {
        const admission = await appendOperationEvent({
          journalPath: paths.journalPath,
          executionId,
          input: normalized,
          eventType: 'consequence.admitted',
          payload: {
            executionId,
            inputDigest: sha256Value(normalized),
            input: normalized,
          },
          clock,
        });
        void admission;
        state = await readOperationState({ ...paths, executionId });
        await checkpoint('after-admission', clone(state.events[0], 'recoverable consequence checkpoint admission'));
      } else if (canonicalJson(state.input) !== canonicalJson(normalized)) {
        throw new IntegrityError('recoverable consequence execution input changed');
      }
      return await resumeLocked({
        ...paths,
        executionId,
        state,
        realm,
        checkpoint,
        clock,
        recovered: wasExisting,
      });
    } finally {
      await lock.release();
    }
  }

  const host = Object.freeze({
    descriptor: deepFreeze({
      protocolId: RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID,
      journalProtocolId: JOURNAL_PROTOCOL_ID,
      eventTypes: [...EVENT_TYPES],
      durableAdmission: true,
      resumesAdmittedEffect: true,
      idempotencyBoundary: 'negotiated-action',
      credentialsPersisted: false,
      rollbackSupported: false,
      authorityExpanded: false,
      defaultLaunchEnabled: false,
    }),
    executionIdFor,
    execute,
    recover,
    inspect,
  });
  HOSTS.add(host);
  return host;
}
