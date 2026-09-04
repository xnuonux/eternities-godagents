import { lstat, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { createTemporaryWorkerEnvelope } from './temporary-worker.mjs';
import { publishFileExclusive, replaceFileAtomically } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

export const BOUNDED_DELEGATION_PROTOCOL_ID = 'eternities-bounded-delegation-v1';
export const BOUNDED_DELEGATION_WORKER_PROTOCOL_ID = 'eternities-bounded-delegation-worker-v1';
export const BOUNDED_DELEGATION_COMPLETION_PROTOCOL_ID = 'eternities-bounded-delegation-completion-v1';

const ZERO_DIGEST = '0'.repeat(64);
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ROLE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MAX_EVENTS = 16;
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const ALLOWED_AUTHORITY = new Set(['observe', 'propose', 'analyze']);
const coordinatorInstances = new WeakSet();

const clone = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

export class BoundedDelegationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BoundedDelegationError';
    this.code = code;
  }
}

function fail(code, message, cause = undefined) {
  const error = new BoundedDelegationError(code, message);
  if (cause) error.cause = cause;
  throw error;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    fail('unknown-field', `${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} is invalid`);
}

function requireIdentifier(value, label, pattern = IDENTIFIER) {
  if (typeof value !== 'string' || !pattern.test(value)) fail('identifier-invalid', `${label} is invalid`);
}

function parseTime(value, label) {
  const milliseconds = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(milliseconds)
      || new Date(milliseconds).toISOString() !== value) {
    fail('time-invalid', `${label} is invalid`);
  }
  return milliseconds;
}

function clockTime(clock) {
  const milliseconds = Number(clock());
  if (!Number.isFinite(milliseconds)) fail('clock-invalid', 'bounded delegation clock is invalid');
  return new Date(milliseconds).toISOString();
}

function safeClone(value, label) {
  try {
    return clone(value);
  } catch (error) {
    fail('non-serializable', `${label} is not serializable`, error);
  }
}

function schemaDetail(error) {
  if (error && typeof error.pointer === 'string' && error.pointer.length > 0) return ` at ${error.pointer}`;
  return '';
}

function assertSafe(value, label) {
  try {
    assertNoCredentialFields(value);
  } catch (error) {
    fail('credential-shaped', `${label} contains a forbidden field`, error);
  }
}

function normalizeInput(input) {
  try {
    assertSchema('bounded-delegation-input', input);
  } catch (error) {
    fail('input-invalid', `bounded delegation input is invalid${schemaDetail(error)}`, error);
  }
  assertSafe(input, 'bounded delegation input');
  const value = safeClone(input, 'bounded delegation input');
  value.authority = [...value.authority].sort();
  value.assignments = [...value.assignments].sort((left, right) => left.workerId.localeCompare(right.workerId));
  const workerIds = value.assignments.map(({ workerId }) => workerId);
  if (new Set(workerIds).size !== workerIds.length) fail('duplicate-worker', 'bounded delegation assignments contain a duplicate worker');
  const requestedCompletion = value.assignments.reduce((sum, assignment) => sum + assignment.maxCompletionTokens, 0);
  if (requestedCompletion > value.budget.maxCompletionTokens) {
    fail('completion-budget', 'worker completion ceilings exceed the delegation budget');
  }
  return value;
}

function verifyDescriptor(descriptor, label = 'worker descriptor') {
  const value = safeClone(descriptor, label);
  assertSafe(value, label);
  try {
    assertSchema('bounded-delegation-worker-descriptor', value);
  } catch (error) {
    fail('descriptor-invalid', `${label} is invalid${schemaDetail(error)}`, error);
  }
  return value;
}

function verifyWorkerAdapters(workers) {
  if (!Array.isArray(workers) || workers.length < 1 || workers.length > 3) {
    fail('worker-count', 'bounded delegation requires one to three worker adapters');
  }
  const seen = new Set();
  const adapters = new Map();
  for (const worker of workers) {
    if (!worker || typeof worker !== 'object' || Array.isArray(worker)) {
      fail('worker-invalid', 'worker adapter is invalid');
    }
    requireIdentifier(worker.workerId, 'worker adapter id');
    if (seen.has(worker.workerId)) fail('duplicate-worker', 'worker adapters contain a duplicate worker');
    if (typeof worker.reconcile !== 'function' || typeof worker.execute !== 'function') {
      fail('worker-interface', 'worker adapter must provide reconcile and execute');
    }
    seen.add(worker.workerId);
    adapters.set(worker.workerId, worker);
  }
  return adapters;
}

function workerEntriesFor(input, adapters) {
  return input.assignments.map((assignment) => {
    const adapter = adapters.get(assignment.workerId);
    if (!adapter) fail('worker-missing', `no worker adapter exists for ${assignment.workerId}`);
    const descriptor = verifyDescriptor(adapter.descriptor, `${assignment.workerId} descriptor`);
    return {
      workerId: assignment.workerId,
      assignment: safeClone(assignment, `${assignment.workerId} assignment`),
      descriptor,
      descriptorDigest: sha256Value(descriptor),
      adapter,
    };
  });
}

function admissionSeed(input, workers) {
  return {
    schemaVersion: 1,
    protocolId: BOUNDED_DELEGATION_PROTOCOL_ID,
    input: safeClone(input, 'delegation input'),
    workers: workers.map(({ workerId, assignment, descriptor, descriptorDigest }) => ({
      workerId,
      assignment: safeClone(assignment, 'worker assignment'),
      descriptor: safeClone(descriptor, 'worker descriptor'),
      descriptorDigest,
    })),
  };
}

function buildAdmission(input, workers, admittedAt) {
  const seed = admissionSeed(input, workers);
  const delegationId = sha256Value(seed);
  const unsigned = { ...seed, delegationId, admittedAt };
  const admission = { ...unsigned, admissionDigest: sha256Value(unsigned) };
  try {
    assertSchema('bounded-delegation-admission', admission);
  } catch (error) {
    fail('admission-invalid', `bounded delegation admission is invalid${schemaDetail(error)}`, error);
  }
  return admission;
}

function verifyAdmission(admission, expectedDelegationId = null) {
  assertSafe(admission, 'bounded delegation admission');
  try {
    assertSchema('bounded-delegation-admission', admission);
  } catch (error) {
    fail('admission-invalid', 'bounded delegation admission is invalid', error);
  }
  exactKeys(admission, ['schemaVersion', 'protocolId', 'delegationId', 'input', 'workers', 'admittedAt', 'admissionDigest'], 'admission');
  requireDigest(admission.delegationId, 'delegation id');
  requireDigest(admission.admissionDigest, 'admission digest');
  parseTime(admission.admittedAt, 'admission time');
  const { admissionDigest, ...unsigned } = admission;
  if (sha256Value(unsigned) !== admissionDigest) fail('admission-digest', 'admission digest mismatch');
  const input = normalizeInput(admission.input);
  if (!same(input, admission.input)) fail('admission-order', 'admission input is not canonical');
  if (!Array.isArray(admission.workers) || admission.workers.length !== input.assignments.length) {
    fail('admission-workers', 'admission worker set does not match input');
  }
  const ids = new Set();
  for (const worker of admission.workers) {
    exactKeys(worker, ['workerId', 'assignment', 'descriptor', 'descriptorDigest'], 'admission worker');
    requireIdentifier(worker.workerId, 'admission worker id');
    if (ids.has(worker.workerId)) fail('duplicate-worker', 'admission worker set contains a duplicate');
    ids.add(worker.workerId);
    const assignment = input.assignments.find(({ workerId }) => workerId === worker.workerId);
    if (!assignment || !same(assignment, worker.assignment)) fail('admission-assignment', 'admission assignment mismatch');
    verifyDescriptor(worker.descriptor, 'admission worker descriptor');
    requireDigest(worker.descriptorDigest, 'admission descriptor digest');
    if (sha256Value(worker.descriptor) !== worker.descriptorDigest) fail('descriptor-digest', 'admission descriptor digest mismatch');
  }
  if (!same([...ids].sort(), input.assignments.map(({ workerId }) => workerId).sort())) {
    fail('admission-workers', 'admission worker identities do not match input');
  }
  const expectedId = sha256Value({
    schemaVersion: 1,
    protocolId: BOUNDED_DELEGATION_PROTOCOL_ID,
    input,
    workers: admission.workers,
  });
  if (expectedId !== admission.delegationId) fail('delegation-id', 'delegation identity mismatch');
  if (expectedDelegationId !== null && expectedDelegationId !== admission.delegationId) {
    fail('delegation-id', 'journal delegation identity mismatch');
  }
  return admission;
}

function buildDispatch(admission, worker) {
  const taskId = `delegation-${sha256Value({ delegationId: admission.delegationId, workerId: worker.workerId }).slice(0, 48)}`;
  const envelope = createTemporaryWorkerEnvelope({
    taskId,
    leadInstanceId: admission.input.leadInstanceId,
    authority: admission.input.authority,
    excerpts: admission.input.excerpts,
  });
  const dispatchId = sha256Value({
    schemaVersion: 1,
    protocolId: BOUNDED_DELEGATION_PROTOCOL_ID,
    delegationId: admission.delegationId,
    workerId: worker.workerId,
    assignment: worker.assignment,
    descriptor: worker.descriptor,
    envelope,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: BOUNDED_DELEGATION_PROTOCOL_ID,
    delegationId: admission.delegationId,
    dispatchId,
    workerId: worker.workerId,
    assignment: safeClone(worker.assignment, 'dispatch assignment'),
    envelope: safeClone(envelope, 'dispatch envelope'),
    descriptor: safeClone(worker.descriptor, 'dispatch descriptor'),
  };
  const dispatch = { ...unsigned, dispatchDigest: sha256Value(unsigned) };
  try {
    assertSchema('bounded-delegation-worker-dispatch', dispatch);
  } catch (error) {
    fail('dispatch-invalid', `worker dispatch is invalid${schemaDetail(error)}`, error);
  }
  return dispatch;
}

function verifyDispatch(dispatch, admission, worker) {
  assertSafe(dispatch, 'worker dispatch');
  try {
    assertSchema('bounded-delegation-worker-dispatch', dispatch);
  } catch (error) {
    fail('dispatch-invalid', 'worker dispatch is invalid', error);
  }
  const expected = buildDispatch(admission, worker);
  if (!same(dispatch, expected)) fail('dispatch-mismatch', 'worker dispatch does not match admitted evidence');
  return dispatch;
}

function buildEvent(state, eventType, payload, recordedAt) {
  if (state.events.length >= MAX_EVENTS) fail('event-ceiling', 'bounded delegation event ceiling exceeded');
  parseTime(recordedAt, 'delegation event time');
  if (state.events.length > 0 && Date.parse(recordedAt) < Date.parse(state.events.at(-1).recordedAt)) {
    fail('event-time', 'delegation event time moved backward');
  }
  const unsigned = {
    schemaVersion: 1,
    sequence: state.events.length + 1,
    previousDigest: state.headDigest,
    eventType,
    delegationId: state.delegationId,
    recordedAt,
    payload: safeClone(payload, 'delegation event payload'),
  };
  const event = { ...unsigned, contentDigest: sha256Value(unsigned) };
  try {
    assertSchema('bounded-delegation-event', event);
  } catch (error) {
    fail('event-invalid', `delegation event is invalid${schemaDetail(error)}`, error);
  }
  return event;
}

function buildState(delegationId, events) {
  const headDigest = events.at(-1)?.contentDigest ?? ZERO_DIGEST;
  const unsigned = {
    schemaVersion: 1,
    protocolId: BOUNDED_DELEGATION_PROTOCOL_ID,
    delegationId,
    events: safeClone(events, 'delegation events'),
    headDigest,
  };
  const state = { ...unsigned, stateDigest: sha256Value(unsigned) };
  try {
    assertSchema('bounded-delegation-state', state);
  } catch (error) {
    fail('state-invalid', `bounded delegation state is invalid${schemaDetail(error)}`, error);
  }
  return state;
}

async function readBounded(path, maximumBytes, label) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maximumBytes) {
    fail('path-invalid', `${label} is not a bounded regular file`);
  }
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > maximumBytes) fail('size-ceiling', `${label} exceeds its byte ceiling`);
  return text;
}

async function ensureDirectory(path, label) {
  await mkdir(path, { recursive: true });
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('path-invalid', `${label} is not a regular directory`);
}

async function operationPaths(root, delegationId) {
  requireDigest(delegationId, 'delegation id');
  await ensureDirectory(root, 'delegation root');
  const container = join(root, 'delegations');
  await ensureDirectory(container, 'delegation container');
  const directory = join(container, delegationId);
  await ensureDirectory(directory, 'delegation operation directory');
  const artifacts = join(directory, 'artifacts');
  await ensureDirectory(artifacts, 'delegation artifact directory');
  return {
    directory,
    artifacts,
    journal: join(directory, 'journal.json'),
    lock: join(directory, 'operation.lock'),
  };
}

async function readArtifact(path, reference, admission) {
  exactKeys(reference, ['bytes', 'digest'], 'worker artifact reference');
  requireDigest(reference.digest, 'worker artifact digest');
  if (!Number.isSafeInteger(reference.bytes) || reference.bytes < 1 || reference.bytes > MAX_ARTIFACT_BYTES
      || reference.bytes > admission.input.budget.maxResultBytes) {
    fail('artifact-size', 'worker artifact byte ceiling is invalid');
  }
  const text = await readBounded(path, reference.bytes + 1, 'worker artifact');
  if (text === null) fail('artifact-missing', 'worker artifact is missing');
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail('artifact-json', 'worker artifact is invalid JSON', error);
  }
  assertSafe(value, 'worker artifact');
  if (text !== jsonBytes(value)) fail('artifact-canonical', 'worker artifact is not canonical');
  try {
    assertSchema('bounded-delegation-worker-completion', value);
  } catch (error) {
    fail('completion-invalid', `worker completion artifact is invalid${schemaDetail(error)}`, error);
  }
  if (Buffer.byteLength(canonicalJson(value), 'utf8') !== reference.bytes
      || sha256Text(canonicalJson(value)) !== reference.digest) {
    fail('artifact-digest', 'worker artifact digest or byte length mismatch');
  }
  return value;
}

function verifyCompletion(completion, dispatch, admission) {
  assertSafe(completion, 'worker completion');
  try {
    assertSchema('bounded-delegation-worker-completion', completion);
  } catch (error) {
    fail('completion-invalid', `worker completion is invalid${schemaDetail(error)}`, error);
  }
  exactKeys(completion, [
    'schemaVersion', 'protocolId', 'delegationId', 'dispatchId', 'dispatchDigest', 'workerId',
    'summary', 'recommendations', 'risks', 'usage', 'startedAt', 'completedAt',
  ], 'worker completion');
  if (completion.delegationId !== admission.delegationId
      || completion.dispatchId !== dispatch.dispatchId
      || completion.dispatchDigest !== dispatch.dispatchDigest
      || completion.workerId !== dispatch.workerId) {
    fail('completion-binding', 'worker completion does not bind its dispatch');
  }
  const startedAt = parseTime(completion.startedAt, 'worker start time');
  const completedAt = parseTime(completion.completedAt, 'worker completion time');
  if (startedAt < Date.parse(admission.admittedAt) || completedAt < startedAt) {
    fail('completion-time', 'worker completion times are incoherent');
  }
  if (completion.usage.cachedInputTokens > completion.usage.inputTokens) {
    fail('usage-invalid', 'cached input tokens exceed input tokens');
  }
  if (completion.usage.completionTokens > dispatch.assignment.maxCompletionTokens) {
    fail('completion-budget', 'worker completion exceeds its assignment ceiling');
  }
  const bytes = Buffer.byteLength(canonicalJson(completion), 'utf8');
  if (bytes > admission.input.budget.maxResultBytes || bytes > MAX_ARTIFACT_BYTES) {
    fail('artifact-size', 'worker completion exceeds the result ceiling');
  }
  return completion;
}

function verifyAdapterResponse(value, dispatch, admission) {
  const response = safeClone(value, 'worker adapter response');
  assertSafe(response, 'worker adapter response');
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    fail('worker-response', 'worker adapter response is invalid');
  }
  if (response.status === 'pending' || response.status === 'absent') {
    exactKeys(response, ['status'], 'worker pending response');
    return response;
  }
  if (response.status !== 'completed') fail('worker-response', 'worker adapter returned an unsupported status');
  exactKeys(response, ['status', 'completion'], 'worker completion response');
  const completion = verifyCompletion(response.completion, dispatch, admission);
  return { status: 'completed', completion };
}

function aggregateUsage(completions) {
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    visibleOutputTokens: 0,
    completionTokens: 0,
  };
  for (const completion of completions) {
    for (const key of Object.keys(usage)) usage[key] += completion.usage[key];
  }
  return usage;
}

function buildDelegationCompletion(admission, committed, completedAt) {
  const results = admission.input.assignments.map(({ workerId }) => committed.get(workerId));
  if (results.some((value) => !value)) fail('completion-missing', 'delegation completion lacks a worker result');
  const usage = aggregateUsage(results.map(({ completion }) => completion));
  if (usage.completionTokens > admission.input.budget.maxCompletionTokens) {
    fail('completion-budget', 'delegation completion exceeds its total ceiling');
  }
  const totalResultBytes = results.reduce((sum, { reference }) => sum + reference.bytes, 0);
  if (totalResultBytes > admission.input.budget.maxResultBytes) {
    fail('artifact-size', 'delegation results exceed their total byte ceiling');
  }
  const resultRefs = admission.input.assignments.map(({ workerId }) => ({
    workerId,
    ...committed.get(workerId).reference,
  }));
  const unsigned = {
    schemaVersion: 1,
    protocolId: BOUNDED_DELEGATION_COMPLETION_PROTOCOL_ID,
    delegationId: admission.delegationId,
    results: resultRefs,
    usage,
    completedAt,
  };
  const completion = { ...unsigned, aggregateDigest: sha256Value(unsigned) };
  try {
    assertSchema('bounded-delegation-completion', completion);
  } catch (error) {
    fail('aggregate-invalid', `delegation completion is invalid${schemaDetail(error)}`, error);
  }
  return completion;
}

function verifyAggregate(completion, admission, committed) {
  assertSafe(completion, 'delegation completion');
  try {
    assertSchema('bounded-delegation-completion', completion);
  } catch (error) {
    fail('aggregate-invalid', `delegation completion is invalid${schemaDetail(error)}`, error);
  }
  exactKeys(completion, ['schemaVersion', 'protocolId', 'delegationId', 'results', 'usage', 'completedAt', 'aggregateDigest'], 'delegation completion');
  if (completion.delegationId !== admission.delegationId) fail('aggregate-binding', 'delegation completion identity mismatch');
  const { aggregateDigest, ...unsigned } = completion;
  if (sha256Value(unsigned) !== aggregateDigest) fail('aggregate-digest', 'delegation aggregate digest mismatch');
  parseTime(completion.completedAt, 'delegation completion time');
  const expected = admission.input.assignments.map(({ workerId }) => {
    const entry = committed.get(workerId);
    if (!entry) fail('completion-missing', 'delegation completion lacks a committed worker');
    return { workerId, ...entry.reference };
  });
  if (!same(completion.results, expected)) fail('aggregate-binding', 'delegation result references mismatch');
  const expectedUsage = aggregateUsage([...committed.values()].map(({ completion: value }) => value));
  if (!same(completion.usage, expectedUsage)) fail('aggregate-usage', 'delegation usage mismatch');
  if (completion.usage.completionTokens > admission.input.budget.maxCompletionTokens) {
    fail('completion-budget', 'delegation completion exceeds its total ceiling');
  }
  const totalResultBytes = completion.results.reduce((sum, { bytes }) => sum + bytes, 0);
  if (totalResultBytes > admission.input.budget.maxResultBytes) {
    fail('artifact-size', 'delegation results exceed their total byte ceiling');
  }
  return completion;
}

async function replayState(state, artifactsDir) {
  assertSafe(state, 'delegation state');
  try {
    assertSchema('bounded-delegation-state', state);
  } catch (error) {
    fail('state-invalid', `bounded delegation state is invalid${schemaDetail(error)}`, error);
  }
  exactKeys(state, ['schemaVersion', 'protocolId', 'delegationId', 'events', 'headDigest', 'stateDigest'], 'delegation state');
  requireDigest(state.delegationId, 'state delegation id');
  requireDigest(state.headDigest, 'state head digest');
  requireDigest(state.stateDigest, 'state digest');
  const { stateDigest, ...unsigned } = state;
  if (sha256Value(unsigned) !== stateDigest) fail('state-digest', 'delegation state digest mismatch');
  let previousDigest = ZERO_DIGEST;
  let previousTime = Number.NEGATIVE_INFINITY;
  let admission = null;
  const prepared = new Map();
  const committed = new Map();
  let completion = null;
  for (const [index, event] of state.events.entries()) {
    assertSafe(event, 'delegation event');
    try {
      assertSchema('bounded-delegation-event', event);
    } catch (error) {
      fail('event-invalid', `delegation event ${index + 1} is invalid`, error);
    }
    exactKeys(event, ['schemaVersion', 'sequence', 'previousDigest', 'eventType', 'delegationId', 'recordedAt', 'payload', 'contentDigest'], `delegation event ${index + 1}`);
    if (event.sequence !== index + 1 || event.previousDigest !== previousDigest || event.delegationId !== state.delegationId) {
      fail('event-chain', 'delegation event chain mismatch');
    }
    const eventTime = parseTime(event.recordedAt, 'delegation event time');
    if (eventTime < previousTime) fail('event-time', 'delegation event time moved backward');
    previousTime = eventTime;
    requireDigest(event.contentDigest, 'event content digest');
    const { contentDigest, ...eventUnsigned } = event;
    if (sha256Value(eventUnsigned) !== contentDigest) fail('event-digest', 'delegation event digest mismatch');

    if (index === 0) {
      if (event.eventType !== 'delegation.admitted') fail('event-order', 'delegation journal must begin with admission');
      exactKeys(event.payload, ['admission'], 'admission event');
      admission = verifyAdmission(event.payload.admission, state.delegationId);
      previousDigest = contentDigest;
      continue;
    }
    if (!admission) fail('event-order', 'delegation event precedes admission');
    if (completion) fail('event-order', 'delegation journal contains events after completion');

    if (event.eventType === 'worker.prepared') {
      exactKeys(event.payload, ['dispatch'], 'worker preparation');
      const dispatch = event.payload.dispatch;
      const worker = admission.workers.find(({ workerId }) => workerId === dispatch.workerId);
      if (!worker || prepared.has(dispatch.workerId) || committed.has(dispatch.workerId)) {
        fail('event-order', 'worker preparation transition is invalid');
      }
      verifyDispatch(dispatch, admission, worker);
      prepared.set(dispatch.workerId, dispatch);
    } else if (event.eventType === 'worker.committed') {
      exactKeys(event.payload, ['workerId', 'artifact'], 'worker commitment');
      const { workerId, artifact } = event.payload;
      const dispatch = prepared.get(workerId);
      const worker = admission.workers.find((entry) => entry.workerId === workerId);
      if (!dispatch || !worker || committed.has(workerId)) fail('event-order', 'worker commitment transition is invalid');
      const completionValue = await readArtifact(join(artifactsDir, `${artifact.digest}.json`), artifact, admission);
      verifyCompletion(completionValue, dispatch, admission);
      const expectedBytes = Buffer.byteLength(canonicalJson(completionValue), 'utf8');
      if (expectedBytes !== artifact.bytes) fail('artifact-binding', 'worker artifact byte count mismatch');
      committed.set(workerId, { dispatch, completion: completionValue, reference: clone(artifact) });
      const totalResultBytes = [...committed.values()]
        .reduce((sum, { reference: currentReference }) => sum + currentReference.bytes, 0);
      if (totalResultBytes > admission.input.budget.maxResultBytes) {
        fail('artifact-size', 'delegation results exceed their total byte ceiling');
      }
      const totalCompletionTokens = [...committed.values()]
        .reduce((sum, { completion: currentCompletion }) => sum + currentCompletion.usage.completionTokens, 0);
      if (totalCompletionTokens > admission.input.budget.maxCompletionTokens) {
        fail('completion-budget', 'delegation completions exceed their total ceiling');
      }
    } else if (event.eventType === 'delegation.completed') {
      exactKeys(event.payload, ['completion'], 'delegation completion event');
      if (committed.size !== admission.workers.length) fail('event-order', 'delegation completed before every worker committed');
      completion = verifyAggregate(event.payload.completion, admission, committed);
    } else {
      fail('event-type', 'delegation event type is unsupported');
    }
    previousDigest = contentDigest;
  }
  if (state.headDigest !== previousDigest) fail('state-head', 'delegation state head mismatch');
  if (!admission) fail('event-order', 'delegation journal has no admission');
  return { state, admission, prepared, committed, completion };
}

async function readState(journalPath, artifactsDir) {
  const text = await readBounded(journalPath, MAX_JOURNAL_BYTES, 'delegation journal');
  if (text === null) return null;
  let state;
  try {
    state = JSON.parse(text);
  } catch (error) {
    fail('journal-json', 'delegation journal is invalid JSON', error);
  }
  if (text !== jsonBytes(state)) fail('journal-canonical', 'delegation journal is not canonical');
  return replayState(state, artifactsDir);
}

async function writeState(journalPath, state) {
  await replaceFileAtomically({ destinationPath: journalPath, content: jsonBytes(state) });
}

async function appendEvent(journalPath, projection, eventType, payload, recordedAt, artifactsDir) {
  const event = buildEvent(projection.state, eventType, payload, recordedAt);
  const state = buildState(projection.state.delegationId, [...projection.state.events, event]);
  await writeState(journalPath, state);
  return replayState(state, artifactsDir);
}

async function publishCompletion(artifactsDir, completion, admission) {
  const body = canonicalJson(completion);
  const reference = {
    bytes: Buffer.byteLength(body, 'utf8'),
    digest: sha256Text(body),
  };
  if (reference.bytes > admission.input.budget.maxResultBytes) fail('artifact-size', 'worker completion exceeds the result ceiling');
  const path = join(artifactsDir, `${reference.digest}.json`);
  const published = await publishFileExclusive({ destinationPath: path, content: jsonBytes(completion) });
  if (!published) await readArtifact(path, reference, admission);
  return reference;
}

async function invokeWorker(adapter, method, dispatch, admission) {
  let response;
  try {
    response = await adapter[method]({ dispatch: deepFreeze(safeClone(dispatch, 'worker dispatch')) });
  } catch (error) {
    if (error instanceof BoundedDelegationError) throw error;
    fail('worker-call', `worker ${method} failed`, error);
  }
  return verifyAdapterResponse(response, dispatch, admission);
}

function inspectProjection(projection) {
  const workerIds = projection.admission.input.assignments.map(({ workerId }) => workerId);
  const preparedWorkerIds = [...projection.prepared.keys()].sort();
  const committedWorkerIds = [...projection.committed.keys()].sort();
  const pendingWorkerIds = workerIds.filter((workerId) => !projection.committed.has(workerId));
  const dispatchDigests = [...projection.prepared.values()]
    .sort((left, right) => left.workerId.localeCompare(right.workerId))
    .map(({ workerId, dispatchDigest }) => ({ workerId, dispatchDigest }));
  const resultDigests = [...projection.committed.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([workerId, { reference }]) => ({ workerId, digest: reference.digest }));
  return deepFreeze({
    status: projection.completion ? 'completed' : pendingWorkerIds.length < workerIds.length ? 'pending' : 'admitted',
    delegationId: projection.state.delegationId,
    eventCount: projection.state.events.length,
    headDigest: projection.state.headDigest,
    workerIds,
    preparedWorkerIds,
    committedWorkerIds,
    pendingWorkerIds,
    dispatchDigests,
    resultDigests,
    aggregateDigest: projection.completion?.aggregateDigest ?? null,
    next: projection.completion ? 'none' : pendingWorkerIds[0] ? `worker:${pendingWorkerIds[0]}` : 'complete',
  });
}

async function completedResult(projection, recovered) {
  const results = [];
  for (const assignment of projection.admission.input.assignments) {
    const entry = projection.committed.get(assignment.workerId);
    const completion = await readArtifact(
      join(projection.artifactsDir, `${entry.reference.digest}.json`),
      entry.reference,
      projection.admission,
    );
    results.push({ workerId: assignment.workerId, completion });
  }
  return deepFreeze({
    status: 'completed',
    delegationId: projection.state.delegationId,
    aggregateDigest: projection.completion.aggregateDigest,
    results,
    usage: clone(projection.completion.usage),
    recovered,
  });
}

function pendingResult(projection, recovered) {
  return deepFreeze({
    status: 'pending',
    delegationId: projection.state.delegationId,
    pendingWorkerIds: projection.admission.input.assignments
      .map(({ workerId }) => workerId)
      .filter((workerId) => !projection.committed.has(workerId)),
    headDigest: projection.state.headDigest,
    recovered,
  });
}

async function resumeLocked({ projection: initialProjection, paths, adapters, clock, checkpoint, recovered }) {
  let projection = { ...initialProjection, artifactsDir: paths.artifacts };
  if (projection.completion) return completedResult(projection, recovered);

  for (const workerRecord of projection.admission.workers) {
    if (projection.committed.has(workerRecord.workerId)) continue;
    let dispatch = projection.prepared.get(workerRecord.workerId);
    if (!dispatch) {
      dispatch = buildDispatch(projection.admission, workerRecord);
      projection = await appendEvent(
        paths.journal,
        projection,
        'worker.prepared',
        { dispatch },
        clockTime(clock),
        paths.artifacts,
      );
      projection = { ...projection, artifactsDir: paths.artifacts };
    }

    const adapter = adapters.get(workerRecord.workerId);
    if (!adapter) fail('worker-missing', `no worker adapter exists for ${workerRecord.workerId}`);
    let response = await invokeWorker(adapter, 'reconcile', dispatch, projection.admission);
    if (response.status === 'absent') {
      response = await invokeWorker(adapter, 'execute', dispatch, projection.admission);
      if (response.status === 'completed') {
        await checkpoint({
          stage: 'after-worker-execute-before-commit',
          delegationId: projection.state.delegationId,
          workerId: workerRecord.workerId,
          dispatchId: dispatch.dispatchId,
        });
      }
    }
    if (response.status === 'pending') return pendingResult(projection, recovered);
    const reference = await publishCompletion(paths.artifacts, response.completion, projection.admission);
    projection = await appendEvent(
      paths.journal,
      projection,
      'worker.committed',
      { workerId: workerRecord.workerId, artifact: reference },
      clockTime(clock),
      paths.artifacts,
    );
    projection = { ...projection, artifactsDir: paths.artifacts };
  }

  const completionTime = projection.state.events.at(-1)?.recordedAt ?? clockTime(clock);
  await checkpoint({
    stage: 'before-delegation-completion',
    delegationId: projection.state.delegationId,
  });
  const completion = buildDelegationCompletion(projection.admission, projection.committed, completionTime);
  projection = await appendEvent(
    paths.journal,
    projection,
    'delegation.completed',
    { completion },
    completion.completedAt,
    paths.artifacts,
  );
  projection = { ...projection, artifactsDir: paths.artifacts };
  return completedResult(projection, recovered);
}

async function withOperationLock(paths, callback, staleAfterMs) {
  const lock = await acquireFileLock({ lockPath: paths.lock, staleAfterMs });
  try {
    return await callback();
  } finally {
    await lock.release();
  }
}

export function assertBoundedDelegationCoordinator(value) {
  if (!value || typeof value !== 'object' || !coordinatorInstances.has(value)) {
    throw new TypeError('bounded delegation coordinator is not authentic');
  }
  return value;
}

export function createBoundedDelegationCoordinator({
  delegationRoot,
  workers,
  clock = Date.now,
  checkpoint = async () => {},
  staleAfterMs = 30_000,
} = {}) {
  if (typeof delegationRoot !== 'string' || delegationRoot.length < 1 || /[\0\r\n]/.test(delegationRoot)) {
    throw new TypeError('delegationRoot is required');
  }
  if (typeof clock !== 'function' || typeof checkpoint !== 'function') throw new TypeError('delegation coordinator functions are required');
  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1) throw new TypeError('staleAfterMs is invalid');
  const root = resolve(delegationRoot);
  const adapters = verifyWorkerAdapters(workers);

  function currentWorkersFor(input) {
    return workerEntriesFor(input, adapters);
  }

  async function execute(input) {
    const normalized = normalizeInput(input);
    const workerEntries = currentWorkersFor(normalized);
    const admissionPreview = admissionSeed(normalized, workerEntries);
    const delegationId = sha256Value(admissionPreview);
    const paths = await operationPaths(root, delegationId);
    return withOperationLock(paths, async () => {
      let projection = await readState(paths.journal, paths.artifacts);
      let recovered = Boolean(projection);
      if (!projection) {
        const admission = buildAdmission(normalized, workerEntries, clockTime(clock));
        const emptyState = { delegationId, events: [], headDigest: ZERO_DIGEST };
        const admissionEvent = buildEvent(emptyState, 'delegation.admitted', { admission }, admission.admittedAt);
        const state = buildState(delegationId, [admissionEvent]);
        await writeState(paths.journal, state);
        projection = await readState(paths.journal, paths.artifacts);
        recovered = false;
      } else {
        const expectedAdmission = buildAdmission(normalized, workerEntries, projection.admission.admittedAt);
        if (!same(expectedAdmission, projection.admission)) fail('admission-mismatch', 'existing delegation admission does not match current input or worker set');
      }
      return resumeLocked({ projection, paths, adapters, clock, checkpoint, recovered });
    }, staleAfterMs);
  }

  async function recover(delegationId) {
    requireDigest(delegationId, 'delegation id');
    const paths = await operationPaths(root, delegationId);
    return withOperationLock(paths, async () => {
      const projection = await readState(paths.journal, paths.artifacts);
      if (!projection) fail('delegation-missing', 'delegation journal is missing');
      const selected = workerEntriesFor(projection.admission.input, adapters);
      for (const entry of projection.admission.workers) {
        const current = selected.find(({ workerId }) => workerId === entry.workerId);
        if (!current || current.descriptorDigest !== entry.descriptorDigest || !same(current.descriptor, entry.descriptor)) {
          fail('descriptor-mismatch', 'current worker descriptor does not match the admitted delegation');
        }
      }
      return resumeLocked({ projection, paths, adapters, clock, checkpoint, recovered: true });
    }, staleAfterMs);
  }

  async function inspect(delegationId) {
    requireDigest(delegationId, 'delegation id');
    const paths = await operationPaths(root, delegationId);
    const projection = await readState(paths.journal, paths.artifacts);
    if (!projection) return deepFreeze({ status: 'absent', delegationId });
    return inspectProjection(projection);
  }

  const coordinator = {
    execute,
    recover,
    inspect,
  };
  coordinatorInstances.add(coordinator);
  return Object.freeze(coordinator);
}
