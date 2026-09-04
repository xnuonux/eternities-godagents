import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { AuthorityError, IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { commitDecision } from '../runtime/arbiter.mjs';
import { appendEvent, readVerifiedJournal } from '../state/journal.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { executeNegotiatedConsequence } from './negotiated-consequence-executor.mjs';
import { buildRealmNegotiation } from './negotiation.mjs';
import {
  verifyRealmCompensationBinding,
  verifyRealmCompensationRelation,
} from './compensation.mjs';
import { assertRecoverableRealmConsequenceHost } from './recoverable-consequence-host.mjs';

export const REALM_COMPENSATION_PROTOCOL_ID = 'eternities-realm-compensation-v1';

const JOURNAL_PROTOCOL_ID = 'eternities-realm-compensation-journal-v1';
const SOURCE_CLASS = 'recoverable-realm-compensation-host';
const EVENT_TYPES = Object.freeze([
  'compensation.admitted',
  'compensation.resulted',
  'compensation.receipted',
]);
const REQUEST_KEYS = ['primaryExecutionId', 'relation', 'input'];
const INPUT_KEYS = ['mission', 'proposal', 'contract', 'authority', 'constitution', 'state'];
const RESULT_KEYS = ['negotiation', 'decision', 'action', 'actionReceipt', 'receipt'];
const ACTION_KEYS = ['actionId', 'idempotencyKey', 'handId', 'payload'];
const WITNESS_KEYS = [
  'executionId', 'receiptDigest', 'actionReceiptDigest', 'consequenceReceiptDigest',
  'instanceId', 'missionId', 'stateEpoch', 'handId', 'actionDigest', 'payloadDigest',
  'invocationStatus', 'discrepancyClass', 'disposition',
];
const RECEIPT_KEYS = [
  'schemaVersion', 'protocolId', 'executionId', 'primaryExecutionId', 'inputDigest',
  'relationDigest', 'instanceId', 'missionId', 'stateEpoch', 'primaryHandId',
  'compensatingHandId', 'primaryReceiptDigest', 'primaryActionReceiptDigest',
  'primaryConsequenceReceiptDigest', 'compensationConsequenceDigest',
  'compensationReceiptDigest', 'resultEventDigest', 'restorationStatus', 'disposition',
  'receiptDigest',
];
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_EVENT_BYTES = 2 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const ZERO_DIGEST = '0'.repeat(64);
const HOSTS = new WeakSet();
const PREFLIGHT_BOUNDARY = Symbol('recoverable Realm compensation preflight boundary');

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

function requireRecordedAt(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new IntegrityError('Realm compensation journal recordedAt is invalid');
  }
}

function pathIdentity(value) {
  const absolute = resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function requireContained(root, target, label) {
  const remainder = relative(root, target);
  if (remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder))) return;
  throw new IntegrityError(`${label} escaped the Realm compensation root`);
}

async function ensureRealDirectory(path, label, expectedParent = null) {
  await mkdir(path, { recursive: true });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new IntegrityError(`${label} is not a real directory`);
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
    throw new IntegrityError('Realm compensation journal is not a bounded regular file');
  }
  const actual = await realpath(journalPath);
  if (pathIdentity(actual) !== pathIdentity(journalPath)) {
    throw new IntegrityError('Realm compensation journal is a path alias');
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
    throw new IntegrityError('Realm compensation journal path is not a regular file');
  }
  const actual = await realpath(journalPath);
  if (pathIdentity(actual) !== pathIdentity(journalPath)) {
    throw new IntegrityError('Realm compensation journal path is an alias');
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
    throw new IntegrityError('Realm compensation execution lock is not a regular file');
  }
}

async function verifyOperationDirectory(executionRoot) {
  const entries = await readdir(executionRoot, { withFileTypes: true });
  const allowed = new Set(['execution.lock', 'journal.jsonl']);
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !allowed.has(entry.name)) {
      throw new IntegrityError(`Realm compensation execution contains an unexpected entry: ${entry.name}`);
    }
  }
}

function normalizeInput(input) {
  exactKeys(input, INPUT_KEYS, 'Realm compensation consequence input');
  assertNoCredentialFields(input);
  const normalized = clone(input, 'Realm compensation consequence input');
  exactKeys(normalized, INPUT_KEYS, 'Realm compensation consequence input');
  assertNoCredentialFields(normalized);
  return normalized;
}

function normalizeRequest(request) {
  exactKeys(request, REQUEST_KEYS, 'Realm compensation request');
  assertNoCredentialFields(request);
  const normalized = clone(request, 'Realm compensation request');
  exactKeys(normalized, REQUEST_KEYS, 'Realm compensation request');
  assertNoCredentialFields(normalized);
  requireExecutionId(normalized.primaryExecutionId, 'primary execution id');
  return normalized;
}

function executionIdForInput(request) {
  const normalized = normalizeRequest(request);
  return sha256Value({
    schemaVersion: 1,
    protocolId: REALM_COMPENSATION_PROTOCOL_ID,
    requestDigest: sha256Value(normalized),
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
  throw new IntegrityError('Realm compensation preflight crossed no Realm boundary');
}

function assertRuntimeContract(realm, expectedContract) {
  if (canonicalJson(realm.contract) !== canonicalJson(expectedContract)) {
    throw new IntegrityError('Realm compensation runtime Contract differs from admitted Contract');
  }
}

function verifyConsequenceResult(value, input, label = 'Realm compensation consequence result') {
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

  const intent = input.proposal.intent;
  const expectedAuthority = {
    availableAuthority: [...input.mission.authority].sort(),
    permittedEffects: input.authority.permittedEffects
      .filter((effect) => effect === intent.effect && input.constitution.allowedEffects.includes(effect))
      .sort(),
  };
  const negotiation = buildRealmNegotiation({ contract: input.contract, authority: expectedAuthority });
  if (canonicalJson(value.negotiation) !== canonicalJson(negotiation)) {
    throw new IntegrityError(`${label} negotiation binding is invalid`);
  }
  const expectedDecision = commitDecision({
    proposals: [input.proposal],
    state: {
      epoch: input.state.epoch,
      missionId: input.mission.missionId,
      now: input.state.now,
      preconditions: input.state.preconditions,
    },
    constitution: input.constitution,
    authority: expectedAuthority.availableAuthority,
  });
  if (canonicalJson(value.decision) !== canonicalJson(expectedDecision)) {
    throw new IntegrityError(`${label} decision binding is invalid`);
  }
  const { effect: ignoredEffect, handId, ...payload } = expectedDecision.committedIntent;
  void ignoredEffect;
  const expectedAction = {
    actionId: `action:${input.state.instanceId}:${input.mission.missionId}:${input.state.epoch}`,
    idempotencyKey: `consequence:${input.state.instanceId}:${expectedDecision.decisionId}`,
    handId,
    payload,
  };
  if (canonicalJson(value.action) !== canonicalJson(expectedAction)) {
    throw new IntegrityError(`${label} action binding is invalid`);
  }
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

function assertPrimaryWitness(value, label = 'primary compensation witness') {
  exactKeys(value, WITNESS_KEYS, label);
  assertNoCredentialFields(value);
  requireExecutionId(value.executionId, `${label} executionId`);
  for (const key of [
    'receiptDigest', 'actionReceiptDigest', 'consequenceReceiptDigest', 'actionDigest', 'payloadDigest',
  ]) requireDigest(value[key], `${label} ${key}`);
  for (const key of ['instanceId', 'missionId', 'handId']) {
    if (typeof value[key] !== 'string' || value[key].length === 0) throw new IntegrityError(`${label} ${key} is invalid`);
  }
  if (!Number.isSafeInteger(value.stateEpoch) || value.stateEpoch < 0) {
    throw new IntegrityError(`${label} stateEpoch is invalid`);
  }
  if (!['applied'].includes(value.invocationStatus)
      || value.discrepancyClass !== 'none'
      || value.disposition !== 'complete') {
    throw new AuthorityError('primary compensation witness is not an eligible completed effect');
  }
  return value;
}

function primaryWitnessFromResult(primaryExecutionId, primary) {
  if (!primary || primary.status !== 'completed' || primary.executionId !== primaryExecutionId) {
    throw new IntegrityError('primary execution is not a completed recoverable consequence');
  }
  assertSchema('realm-negotiated-consequence', primary.consequence.receipt);
  assertSchema('recoverable-realm-consequence-receipt', primary.receipt);
  assertNoCredentialFields(primary);
  if (primary.receipt.invocationStatus !== 'applied'
      || primary.receipt.discrepancyClass !== 'none'
      || primary.receipt.disposition !== 'complete'
      || primary.receipt.consequenceDigest !== sha256Value(primary.consequence)
      || primary.receipt.consequenceReceiptDigest !== primary.consequence.receipt.receiptDigest
      || primary.receipt.actionReceiptDigest !== primary.consequence.actionReceipt.receiptDigest) {
    throw new AuthorityError('primary consequence is not an eligible completed effect');
  }
  exactKeys(primary.consequence.action, ACTION_KEYS, 'primary compensation action');
  const witness = {
    executionId: primaryExecutionId,
    receiptDigest: primary.receipt.receiptDigest,
    actionReceiptDigest: primary.receipt.actionReceiptDigest,
    consequenceReceiptDigest: primary.receipt.consequenceReceiptDigest,
    instanceId: primary.receipt.instanceId,
    missionId: primary.receipt.missionId,
    stateEpoch: primary.receipt.stateEpoch,
    handId: primary.consequence.action.handId,
    actionDigest: sha256Value(primary.consequence.action),
    payloadDigest: sha256Value(primary.consequence.action.payload),
    invocationStatus: primary.receipt.invocationStatus,
    discrepancyClass: primary.receipt.discrepancyClass,
    disposition: primary.receipt.disposition,
  };
  return assertPrimaryWitness(witness);
}

async function eligiblePrimary({ request, primaryHost }) {
  const status = await primaryHost.inspect(request.primaryExecutionId);
  if (status.status !== 'completed') {
    throw new AuthorityError('primary execution is not complete or eligible for compensation');
  }
  const primary = await primaryHost.recover(request.primaryExecutionId);
  const witness = primaryWitnessFromResult(request.primaryExecutionId, primary);
  if (witness.instanceId !== request.input.state.instanceId
      || witness.missionId !== request.input.mission.missionId
      || witness.stateEpoch !== request.input.state.epoch) {
    throw new AuthorityError('compensation state does not match the completed primary consequence');
  }
  verifyRealmCompensationBinding({
    relation: request.relation,
    contract: request.input.contract,
    primaryAction: primary.consequence.action,
    compensationProposal: request.input.proposal,
  });
  return { primary, witness };
}

async function validateRequest(request) {
  const input = normalizeInput(request.input);
  assertSchema('realm-contract', input.contract);
  assertSchema('organ-proposal', input.proposal);
  const relation = verifyRealmCompensationRelation(request.relation, { contract: input.contract });
  if (relation.compensatingHandId !== input.proposal.intent?.handId) {
    throw new AuthorityError('compensation proposal hand does not match the relation');
  }
  await validateInputWithoutEffect(input);
  return { ...request, input, relation };
}

function eventPayloadFor(eventType, payload) {
  if (!EVENT_TYPES.includes(eventType)) throw new TypeError(`unsupported Realm compensation event ${eventType}`);
  assertNoCredentialFields(payload);
  const bytes = Buffer.byteLength(canonicalJson(payload), 'utf8');
  if (bytes > MAX_EVENT_BYTES) throw new TypeError('Realm compensation event exceeds its byte ceiling');
  return clone(payload, `Realm compensation ${eventType} payload`);
}

function baseEvent({ executionId, input, eventType, payload, recordedAt }) {
  if (typeof recordedAt !== 'string') throw new TypeError('Realm compensation clock must return a string');
  requireRecordedAt(recordedAt);
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

function verifyEventEnvelope(event, { executionId, stateEpoch, index }) {
  assertSchema('vessel-event', event);
  if (event.instanceId !== executionId
      || event.sequence !== index + 1
      || event.stateEpoch !== stateEpoch
      || event.sourceClass !== SOURCE_CLASS
      || event.sourceRef !== JOURNAL_PROTOCOL_ID
      || event.causationId !== executionId
      || event.correlationId !== executionId
      || !EVENT_TYPES.includes(event.eventType)) {
    throw new IntegrityError(`Realm compensation journal event ${index + 1} identity is invalid`);
  }
  requireRecordedAt(event.recordedAt);
  assertNoCredentialFields(event);
  return event;
}

function verifyAdmission(event, executionId) {
  exactKeys(event.payload, [
    'executionId', 'primaryExecutionId', 'inputDigest', 'input', 'relation', 'primaryWitness',
  ], 'Realm compensation admission payload');
  if (event.payload.executionId !== executionId) {
    throw new IntegrityError('Realm compensation admission execution id changed');
  }
  requireExecutionId(event.payload.primaryExecutionId, 'primary compensation execution id');
  const input = normalizeInput(event.payload.input);
  if (event.payload.inputDigest !== sha256Value(input)) {
    throw new IntegrityError('Realm compensation admission input digest changed');
  }
  const relation = verifyRealmCompensationRelation(event.payload.relation, { contract: input.contract });
  const primaryWitness = assertPrimaryWitness(event.payload.primaryWitness);
  if (primaryWitness.executionId !== event.payload.primaryExecutionId) {
    throw new IntegrityError('Realm compensation primary witness execution id changed');
  }
  return { input, relation, primaryExecutionId: event.payload.primaryExecutionId, primaryWitness };
}

function verifyResultEvent(event, { executionId, request, admissionDigest }) {
  exactKeys(event.payload, [
    'executionId', 'inputDigest', 'admissionDigest', 'consequenceDigest', 'consequence',
  ], 'Realm compensation result payload');
  if (event.payload.executionId !== executionId
      || event.payload.inputDigest !== sha256Value(request.input)
      || event.payload.admissionDigest !== admissionDigest) {
    throw new IntegrityError('Realm compensation result provenance changed');
  }
  const consequence = verifyConsequenceResult(event.payload.consequence, request.input);
  if (event.payload.consequenceDigest !== sha256Value(consequence)) {
    throw new IntegrityError('Realm compensation result digest changed');
  }
  if (request.primaryAction !== null && request.primaryAction !== undefined) {
    verifyRealmCompensationBinding({
      relation: request.relation,
      contract: request.input.contract,
      primaryAction: request.primaryAction,
      compensationProposal: request.input.proposal,
    });
  }
  return consequence;
}

function restorationStatusFor(disposition) {
  if (disposition === 'complete') return 'restored';
  if (disposition === 'repair') return 'repair';
  return 'escalate';
}

function buildHostReceipt({ executionId, request, primaryWitness, consequence, resultEventDigest }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: REALM_COMPENSATION_PROTOCOL_ID,
    executionId,
    primaryExecutionId: request.primaryExecutionId,
    inputDigest: sha256Value(request.input),
    relationDigest: request.relation.relationDigest,
    instanceId: request.input.state.instanceId,
    missionId: request.input.mission.missionId,
    stateEpoch: request.input.state.epoch,
    primaryHandId: primaryWitness.handId,
    compensatingHandId: request.relation.compensatingHandId,
    primaryReceiptDigest: primaryWitness.receiptDigest,
    primaryActionReceiptDigest: primaryWitness.actionReceiptDigest,
    primaryConsequenceReceiptDigest: primaryWitness.consequenceReceiptDigest,
    compensationConsequenceDigest: sha256Value(consequence),
    compensationReceiptDigest: consequence.receipt.receiptDigest,
    resultEventDigest,
    restorationStatus: restorationStatusFor(consequence.receipt.disposition),
    disposition: consequence.receipt.disposition,
  };
  const receipt = { ...unsigned, receiptDigest: sha256Value(unsigned) };
  assertSchema('recoverable-realm-compensation', receipt);
  assertNoCredentialFields(receipt);
  return receipt;
}

function verifyHostReceipt(value, { executionId, request, primaryWitness, consequence, resultEventDigest }) {
  exactKeys(value, RECEIPT_KEYS, 'Realm compensation receipt');
  assertSchema('recoverable-realm-compensation', value);
  assertNoCredentialFields(value);
  const expected = buildHostReceipt({
    executionId,
    request,
    primaryWitness,
    consequence,
    resultEventDigest,
  });
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new IntegrityError('Realm compensation receipt binding is invalid');
  }
  return value;
}

function verifyRequestStateBinding(state, request) {
  if (canonicalJson(state.input) !== canonicalJson(request.input)
      || canonicalJson(state.relation) !== canonicalJson(request.relation)
      || state.primaryExecutionId !== request.primaryExecutionId) {
    throw new IntegrityError('Realm compensation execution request changed');
  }
}

async function readOperationState({ executionRoot, journalPath, executionId }) {
  await verifyOperationDirectory(executionRoot);
  const actualJournal = await verifyJournalFile(journalPath);
  if (actualJournal === null) {
    return {
      events: [],
      input: null,
      relation: null,
      primaryExecutionId: null,
      primaryWitness: null,
      consequence: null,
      receipt: null,
      status: 'absent',
      journalHeadDigest: ZERO_DIGEST,
    };
  }
  const journal = await readVerifiedJournal(actualJournal);
  if (journal.quarantinedTail !== null) throw new IntegrityError('Realm compensation journal has an unverified tail');
  if (journal.events.length > EVENT_TYPES.length) {
    throw new IntegrityError('Realm compensation journal contains too many events');
  }
  if (journal.events.length === 0) throw new IntegrityError('Realm compensation journal is empty');
  requireExecutionId(executionId);
  if (journal.events[0].instanceId !== executionId) {
    throw new IntegrityError('Realm compensation journal execution id changed');
  }
  const admissionEvent = journal.events[0];
  if (admissionEvent.eventType !== 'compensation.admitted') {
    throw new IntegrityError('Realm compensation journal must begin with admission');
  }
  const admission = verifyAdmission(admissionEvent, executionId);
  const request = {
    primaryExecutionId: admission.primaryExecutionId,
    relation: admission.relation,
    input: admission.input,
  };
  for (const event of journal.events) {
    verifyEventEnvelope(event, { executionId, stateEpoch: request.input.state.epoch, index: event.sequence - 1 });
  }
  if (journal.events.length === 1) {
    return {
      events: journal.events,
      ...admission,
      consequence: null,
      receipt: null,
      status: 'admitted',
      journalHeadDigest: journal.lastDigest,
    };
  }
  const resultEvent = journal.events[1];
  if (resultEvent.eventType !== 'compensation.resulted') {
    throw new IntegrityError('Realm compensation journal result ordering is invalid');
  }
  const consequence = verifyResultEvent(resultEvent, {
    executionId,
    request: { ...request, primaryAction: null },
    admissionDigest: admissionEvent.contentDigest,
  });
  if (journal.events.length === 2) {
    return {
      events: journal.events,
      ...admission,
      consequence,
      receipt: null,
      status: 'resulted',
      journalHeadDigest: journal.lastDigest,
    };
  }
  const receiptEvent = journal.events[2];
  if (receiptEvent.eventType !== 'compensation.receipted') {
    throw new IntegrityError('Realm compensation journal receipt ordering is invalid');
  }
  exactKeys(receiptEvent.payload, ['executionId', 'inputDigest', 'resultEventDigest', 'receipt'], 'Realm compensation receipt payload');
  if (receiptEvent.payload.executionId !== executionId
      || receiptEvent.payload.inputDigest !== sha256Value(admission.input)
      || receiptEvent.payload.resultEventDigest !== resultEvent.contentDigest) {
    throw new IntegrityError('Realm compensation receipt provenance changed');
  }
  const receipt = verifyHostReceipt(receiptEvent.payload.receipt, {
    executionId,
    request: { ...request, primaryAction: null },
    primaryWitness: admission.primaryWitness,
    consequence,
    resultEventDigest: resultEvent.contentDigest,
  });
  return {
    events: journal.events,
    ...admission,
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
  if (size > MAX_JOURNAL_BYTES) throw new IntegrityError('Realm compensation journal exceeded its byte ceiling');
  return stored;
}

function returnCompleted(state, recovered) {
  return deepFreeze({
    status: 'completed',
    executionId: state.events[0].payload.executionId,
    recovered,
    journalHeadDigest: state.journalHeadDigest,
    consequence: clone(state.consequence, 'Realm compensation consequence result'),
    receipt: clone(state.receipt, 'Realm compensation receipt'),
  });
}

async function resumeLocked({
  executionRoot,
  journalPath,
  executionId,
  state,
  realm,
  primaryHost,
  checkpoint,
  clock,
  recovered,
}) {
  const request = {
    primaryExecutionId: state.primaryExecutionId,
    relation: state.relation,
    input: state.input,
  };
  const prepared = await validateRequest(request);
  assertRuntimeContract(realm, prepared.input.contract);
  const { witness } = await eligiblePrimary({ request: prepared, primaryHost });
  if (canonicalJson(witness) !== canonicalJson(state.primaryWitness)) {
    throw new IntegrityError('Realm compensation primary witness changed');
  }
  if (state.status === 'completed') return returnCompleted(state, recovered);

  let current = state;
  if (current.status === 'admitted') {
    const consequence = await executeNegotiatedConsequence({ ...current.input, realm });
    verifyConsequenceResult(consequence, current.input);
    await checkpoint('before-result-publish', clone(consequence, 'Realm compensation checkpoint result'));
    await appendOperationEvent({
      journalPath,
      executionId,
      input: current.input,
      eventType: 'compensation.resulted',
      payload: {
        executionId,
        inputDigest: sha256Value(current.input),
        admissionDigest: current.events[0].contentDigest,
        consequenceDigest: sha256Value(consequence),
        consequence,
      },
      clock,
    });
    current = await readOperationState({ executionRoot, journalPath, executionId });
    await checkpoint('after-result-publish', clone(current.events[1], 'Realm compensation checkpoint event'));
  }

  if (current.status !== 'resulted') {
    throw new IntegrityError(`Realm compensation cannot resume from ${current.status}`);
  }
  const receipt = buildHostReceipt({
    executionId,
    request: current,
    primaryWitness: current.primaryWitness,
    consequence: current.consequence,
    resultEventDigest: current.events[1].contentDigest,
  });
  await appendOperationEvent({
    journalPath,
    executionId,
    input: current.input,
    eventType: 'compensation.receipted',
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
  object(realm, 'Realm compensation Realm');
  for (const method of ['observe', 'invoke', 'reconcile']) {
    if (typeof realm[method] !== 'function') throw new TypeError(`Realm compensation Realm ${method} is required`);
  }
  assertSchema('realm-contract', realm.contract);
  assertNoCredentialFields(realm.contract);
}

async function acquireOperationLock(executionRoot, lockOptions) {
  const lockPath = join(executionRoot, 'execution.lock');
  await verifyLockPath(lockPath);
  return acquireFileLock({ ...lockOptions, lockPath });
}

export function assertRecoverableRealmCompensationHost(value) {
  if (!value || typeof value !== 'object' || !HOSTS.has(value)) {
    throw new TypeError('recoverable Realm compensation host lacks its private provenance brand');
  }
  return value;
}

export async function createRecoverableRealmCompensationHost({
  root: rootValue,
  realm,
  primaryHost,
  checkpoint = async () => {},
  clock = () => new Date().toISOString(),
  lockOptions = {},
} = {}) {
  if (typeof rootValue !== 'string' || rootValue.length === 0 || /[\0\r\n]/.test(rootValue)) {
    throw new TypeError('Realm compensation host root is required');
  }
  await assertHostRealm(realm);
  assertRecoverableRealmConsequenceHost(primaryHost);
  if (typeof checkpoint !== 'function') throw new TypeError('Realm compensation checkpoint must be a function');
  if (typeof clock !== 'function') throw new TypeError('Realm compensation clock must be a function');
  if (!lockOptions || typeof lockOptions !== 'object' || Array.isArray(lockOptions)) {
    throw new TypeError('Realm compensation lock options must be an object');
  }
  const root = await ensureRealDirectory(resolve(rootValue), 'Realm compensation host root');
  const executionsRoot = await ensureRealDirectory(join(root, 'executions'), 'Realm compensation executions root', root);

  function executionIdFor(input) {
    return executionIdForInput(input);
  }

  async function operationPaths(executionId, { create = true } = {}) {
    requireExecutionId(executionId);
    const executionRootPath = join(executionsRoot, executionId);
    const executionRoot = create
      ? await ensureRealDirectory(executionRootPath, 'Realm compensation execution root', executionsRoot)
      : await ensureExistingDirectory(executionRootPath, 'Realm compensation execution root', executionsRoot);
    if (executionRoot === null) return null;
    return { executionRoot, journalPath: join(executionRoot, 'journal.jsonl') };
  }

  async function inspect(executionId) {
    requireExecutionId(executionId);
    const paths = await operationPaths(executionId, { create: false });
    if (paths === null) {
      return deepFreeze({ executionId, status: 'absent', eventCount: 0, journalHeadDigest: ZERO_DIGEST });
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
    if (paths === null) throw new IntegrityError('Realm compensation execution does not exist');
    const lock = await acquireOperationLock(paths.executionRoot, lockOptions);
    try {
      const state = await readOperationState({ ...paths, executionId });
      if (state.status === 'absent') throw new IntegrityError('Realm compensation execution has no admission');
      return await resumeLocked({
        ...paths,
        executionId,
        state,
        realm,
        primaryHost,
        checkpoint,
        clock,
        recovered: true,
      });
    } finally {
      await lock.release();
    }
  }

  async function execute(input) {
    const normalized = normalizeRequest(input);
    const prepared = await validateRequest(normalized);
    const executionId = executionIdForInput(normalized);
    const paths = await operationPaths(executionId);
    const lock = await acquireOperationLock(paths.executionRoot, lockOptions);
    try {
      let state = await readOperationState({ ...paths, executionId });
      const wasExisting = state.status !== 'absent';
      if (state.status === 'absent') {
        const { witness } = await eligiblePrimary({ request: prepared, primaryHost });
        await appendOperationEvent({
          journalPath: paths.journalPath,
          executionId,
          input: prepared.input,
          eventType: 'compensation.admitted',
          payload: {
            executionId,
            primaryExecutionId: prepared.primaryExecutionId,
            inputDigest: sha256Value(prepared.input),
            input: prepared.input,
            relation: prepared.relation,
            primaryWitness: witness,
          },
          clock,
        });
        state = await readOperationState({ ...paths, executionId });
        await checkpoint('after-admission', clone(state.events[0], 'Realm compensation checkpoint admission'));
      } else {
        verifyRequestStateBinding(state, prepared);
      }
      return await resumeLocked({
        ...paths,
        executionId,
        state,
        realm,
        primaryHost,
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
      protocolId: REALM_COMPENSATION_PROTOCOL_ID,
      journalProtocolId: JOURNAL_PROTOCOL_ID,
      eventTypes: [...EVENT_TYPES],
      durableAdmission: true,
      restoresKnownCompletedEffect: true,
      automaticRollback: false,
      uncertainPrimaryAccepted: false,
      credentialsPersisted: false,
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
