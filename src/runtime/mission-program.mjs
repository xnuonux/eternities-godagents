import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { replaceFileAtomically, publishFileExclusive } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

export const MISSION_PROGRAM_PROTOCOL_ID = 'eternities-long-horizon-mission-program-v1';
export const MISSION_PROGRAM_STEP_PROTOCOL_ID = 'eternities-mission-program-step-adapter-v1';

const ZERO_DIGEST = '0'.repeat(64);
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/;
const MAX_STEPS = 8;
const MAX_EVENTS = 32;
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const coordinatorInstances = new WeakSet();

const clone = (value) => structuredClone(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const jsonBytes = (value) => `${canonicalJson(value)}\n`;

export class MissionProgramError extends IntegrityError {
  constructor(code, message) {
    super(message);
    this.name = 'MissionProgramError';
    this.code = code;
  }
}

function fail(code, message, cause = undefined) {
  const error = new MissionProgramError(code, message);
  if (cause) error.cause = cause;
  throw error;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('object-invalid', `${label} is invalid`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('unknown-field', `${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} is invalid`);
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('identifier-invalid', `${label} is invalid`);
}

function requireVersion(value, label) {
  if (typeof value !== 'string' || !VERSION.test(value)) fail('version-invalid', `${label} is invalid`);
}

function requireInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) fail('integer-invalid', `${label} is invalid`);
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
  const value = clock();
  const milliseconds = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail('clock-invalid', 'mission program clock is invalid');
  return new Date(milliseconds).toISOString();
}

function safeClone(value, label) {
  try {
    return clone(value);
  } catch (error) {
    fail('non-serializable', `${label} is not serializable`, error);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertCredentialFree(value, label) {
  try {
    assertNoCredentialFields(value);
  } catch (error) {
    fail('forbidden-field', `${label} contains a forbidden field`, error);
  }
}

function verifyBudget(budget, label) {
  exactKeys(budget, ['maxCompletionTokens', 'maxResultBytes'], label);
  requireInteger(budget.maxCompletionTokens, `${label} completion ceiling`, 4_000_000);
  requireInteger(budget.maxResultBytes, `${label} result ceiling`, 16_777_216);
  if (budget.maxCompletionTokens < 1 || budget.maxResultBytes < 1) {
    fail('budget-invalid', `${label} must be positive`);
  }
}

function normalizeInput(input) {
  object(input, 'mission program input');
  assertCredentialFree(input, 'mission program input');
  try {
    assertSchema('mission-program-input', input);
  } catch (error) {
    fail('input-invalid', 'mission program input is invalid', error);
  }
  const { programId, ...unsigned } = input;
  requireDigest(programId, 'mission program id');
  if (sha256Value(unsigned) !== programId) fail('program-id', 'mission program id does not match its input');
  verifyBudget(input.budget, 'mission program budget');
  if (input.steps.length < 1 || input.steps.length > MAX_STEPS) fail('step-count', 'mission program step count is invalid');
  let completionCeiling = 0;
  let resultCeiling = 0;
  for (let index = 0; index < input.steps.length; index += 1) {
    const step = input.steps[index];
    if (step.stepIndex !== index) fail('step-order', 'mission program step indexes are not contiguous');
    completionCeiling += step.maxCompletionTokens;
    resultCeiling += step.maxResultBytes;
    if (completionCeiling > input.budget.maxCompletionTokens) {
      fail('budget-invalid', 'mission program step completion ceilings exceed the total ceiling');
    }
    if (resultCeiling > input.budget.maxResultBytes) {
      fail('budget-invalid', 'mission program step result ceilings exceed the total ceiling');
    }
  }
  return deepFreeze(safeClone(input, 'mission program input'));
}

function verifyDescriptor(value) {
  object(value, 'mission program step descriptor');
  assertCredentialFree(value, 'mission program step descriptor');
  try {
    assertSchema('mission-program-step-descriptor', value);
  } catch (error) {
    fail('descriptor-invalid', 'mission program step descriptor is invalid', error);
  }
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'kind', 'adapterId', 'adapterVersion', 'authority', 'descriptorDigest',
  ], 'mission program step descriptor');
  requireIdentifier(value.kind, 'mission program step kind');
  requireIdentifier(value.adapterId, 'mission program adapter id');
  requireVersion(value.adapterVersion, 'mission program adapter version');
  exactKeys(value.authority, [
    'realmEffects', 'continuityWrites', 'identityMutation', 'evolution', 'soul',
  ], 'mission program step authority');
  if (!same(value.authority, {
    realmEffects: 0,
    continuityWrites: 0,
    identityMutation: 0,
    evolution: 0,
    soul: 0,
  })) {
    fail('authority-expansion', 'mission program step authority is not empty');
  }
  const { descriptorDigest, ...unsigned } = value;
  requireDigest(descriptorDigest, 'mission program step descriptor digest');
  if (sha256Value(unsigned) !== descriptorDigest) fail('descriptor-digest', 'mission program step descriptor digest mismatch');
  return deepFreeze(safeClone(value, 'mission program step descriptor'));
}

async function verifyAdapters(adapters) {
  if (!Array.isArray(adapters) || adapters.length < 1 || adapters.length > 64) {
    throw new TypeError('mission program adapters are required');
  }
  const entries = new Map();
  for (const adapter of adapters) {
    object(adapter, 'mission program adapter');
    if (typeof adapter.descriptor !== 'function'
        || typeof adapter.reconcile !== 'function'
        || typeof adapter.execute !== 'function') {
      throw new TypeError('mission program adapter methods are required');
    }
    let descriptor;
    try {
      descriptor = verifyDescriptor(await adapter.descriptor());
    } catch (error) {
      if (error instanceof MissionProgramError) throw error;
      throw new TypeError('mission program adapter descriptor could not be verified', { cause: error });
    }
    if (entries.has(descriptor.kind)) fail('duplicate-adapter', 'mission program adapter kinds must be unique');
    entries.set(descriptor.kind, Object.freeze({ adapter, descriptor }));
  }
  return entries;
}

function buildAdmission(input, descriptors, admittedAt) {
  parseTime(admittedAt, 'mission program admission time');
  const steps = input.steps.map((step) => {
    const entry = descriptors.get(step.kind);
    if (!entry) fail('adapter-missing', `mission program adapter is missing for ${step.kind}`);
    return { ...step, descriptor: clone(entry.descriptor) };
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    input: clone(input),
    steps,
    admittedAt,
  };
  return deepFreeze({ ...unsigned, admissionDigest: sha256Value(unsigned) });
}

function verifyAdmission(value, expectedProgramId) {
  object(value, 'mission program admission');
  assertCredentialFree(value, 'mission program admission');
  try {
    assertSchema('mission-program-admission', value);
    assertSchema('mission-program-input', value.input);
  } catch (error) {
    fail('admission-invalid', 'mission program admission is invalid', error);
  }
  exactKeys(value, ['schemaVersion', 'protocolId', 'input', 'steps', 'admittedAt', 'admissionDigest'], 'mission program admission');
  parseTime(value.admittedAt, 'mission program admission time');
  if (value.input.programId !== expectedProgramId) fail('admission-binding', 'mission program admission id mismatch');
  const { admissionDigest, ...unsigned } = value;
  requireDigest(admissionDigest, 'mission program admission digest');
  if (sha256Value(unsigned) !== admissionDigest) fail('admission-digest', 'mission program admission digest mismatch');
  const normalized = normalizeInput(value.input);
  if (!same(normalized, value.input)) fail('admission-input', 'mission program admission input is not canonical');
  if (value.steps.length !== normalized.steps.length) fail('admission-steps', 'mission program admission steps are invalid');
  for (let index = 0; index < value.steps.length; index += 1) {
    const admittedStep = value.steps[index];
    const inputStep = normalized.steps[index];
    exactKeys(admittedStep, [
      'stepId', 'stepIndex', 'kind', 'inputDigest', 'maxCompletionTokens', 'maxResultBytes', 'descriptor',
    ], `mission program admitted step ${index}`);
    if (!same({
      stepId: admittedStep.stepId,
      stepIndex: admittedStep.stepIndex,
      kind: admittedStep.kind,
      inputDigest: admittedStep.inputDigest,
      maxCompletionTokens: admittedStep.maxCompletionTokens,
      maxResultBytes: admittedStep.maxResultBytes,
    }, inputStep)) {
      fail('admission-steps', 'mission program admitted step differs from input');
    }
    verifyDescriptor(admittedStep.descriptor);
    if (admittedStep.descriptor.kind !== admittedStep.kind) fail('admission-descriptor', 'mission program descriptor kind mismatch');
  }
  return deepFreeze(safeClone(value, 'mission program admission'));
}

function buildDispatch(admission, step) {
  const dispatchId = sha256Value({
    programId: admission.input.programId,
    stepId: step.stepId,
    stepIndex: step.stepIndex,
    inputDigest: step.inputDigest,
    descriptorDigest: step.descriptor.descriptorDigest,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: admission.input.programId,
    dispatchId,
    stepId: step.stepId,
    stepIndex: step.stepIndex,
    kind: step.kind,
    inputDigest: step.inputDigest,
    authorityCeilingDigest: admission.input.authorityCeilingDigest,
    maxCompletionTokens: step.maxCompletionTokens,
    maxResultBytes: step.maxResultBytes,
    descriptorDigest: step.descriptor.descriptorDigest,
  };
  return deepFreeze({ ...unsigned, dispatchDigest: sha256Value(unsigned) });
}

function verifyDispatch(value, admission, step) {
  object(value, 'mission program dispatch');
  assertCredentialFree(value, 'mission program dispatch');
  try {
    assertSchema('mission-program-dispatch', value);
  } catch (error) {
    fail('dispatch-invalid', 'mission program dispatch is invalid', error);
  }
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'programId', 'dispatchId', 'stepId', 'stepIndex', 'kind', 'inputDigest',
    'authorityCeilingDigest', 'maxCompletionTokens', 'maxResultBytes', 'descriptorDigest', 'dispatchDigest',
  ], 'mission program dispatch');
  const expected = buildDispatch(admission, step);
  if (!same(value, expected)) fail('dispatch-binding', 'mission program dispatch does not match its admitted step');
  return deepFreeze(safeClone(value, 'mission program dispatch'));
}

function verifyUsage(value, label, maximumCompletionTokens = 4_000_000) {
  exactKeys(value, ['inputTokens', 'cachedInputTokens', 'reasoningTokens', 'visibleOutputTokens', 'completionTokens'], label);
  for (const key of Object.keys(value)) requireInteger(value[key], `${label} ${key}`, 10_000_000);
  if (value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens) {
    fail('usage-invalid', `${label} completion usage is inconsistent`);
  }
  if (value.completionTokens > maximumCompletionTokens) fail('budget-invalid', `${label} exceeds its completion ceiling`);
}

function verifyCompletion(value, dispatch, step) {
  object(value, 'mission program completion');
  assertCredentialFree(value, 'mission program completion');
  try {
    assertSchema('mission-program-completion', value);
  } catch (error) {
    fail('completion-invalid', 'mission program completion is invalid', error);
  }
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'programId', 'stepId', 'stepIndex', 'kind', 'dispatchId', 'dispatchDigest',
    'resultDigest', 'resultBytes', 'usage', 'startedAt', 'completedAt', 'completionDigest',
  ], 'mission program completion');
  if (value.programId !== dispatch.programId || value.stepId !== dispatch.stepId || value.stepIndex !== dispatch.stepIndex
      || value.kind !== dispatch.kind || value.dispatchId !== dispatch.dispatchId || value.dispatchDigest !== dispatch.dispatchDigest) {
    fail('completion-binding', 'mission program completion does not match its dispatch');
  }
  requireDigest(value.resultDigest, 'mission program result digest');
  if (!Number.isInteger(value.resultBytes) || value.resultBytes < 1 || value.resultBytes > step.maxResultBytes) {
    fail('result-ceiling', 'mission program result exceeds its step ceiling');
  }
  verifyUsage(value.usage, 'mission program completion usage', step.maxCompletionTokens);
  parseTime(value.startedAt, 'mission program completion start');
  if (parseTime(value.completedAt, 'mission program completion end') < Date.parse(value.startedAt)) {
    fail('time-order', 'mission program completion time moved backward');
  }
  const { completionDigest, ...unsigned } = value;
  requireDigest(completionDigest, 'mission program completion digest');
  if (sha256Value(unsigned) !== completionDigest) fail('completion-digest', 'mission program completion digest mismatch');
  return deepFreeze(safeClone(value, 'mission program completion'));
}

function buildEvent(state, eventType, payload, recordedAt) {
  if (state.events.length >= MAX_EVENTS) fail('event-ceiling', 'mission program journal event ceiling exceeded');
  const unsigned = {
    schemaVersion: 1,
    sequence: state.events.length + 1,
    previousDigest: state.headDigest,
    eventType,
    programId: state.programId,
    recordedAt,
    payload,
  };
  return deepFreeze({ ...unsigned, contentDigest: sha256Value(unsigned) });
}

function buildState(programId, events) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId,
    events,
    headDigest: events.at(-1)?.contentDigest ?? ZERO_DIGEST,
  };
  return deepFreeze({ ...unsigned, stateDigest: sha256Value(unsigned) });
}

async function writeState(journalPath, state) {
  await mkdir(dirname(journalPath), { recursive: true });
  await replaceFileAtomically({ destinationPath: journalPath, content: jsonBytes(state) });
}

async function readBounded(path, maximum, label) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (Buffer.byteLength(text, 'utf8') > maximum) fail('file-ceiling', `${label} exceeds its byte ceiling`);
  return text;
}

async function publishCompletion(artifactsDir, completion, step) {
  const body = jsonBytes(completion);
  const reference = {
    bytes: Buffer.byteLength(body, 'utf8'),
    digest: sha256Text(body.slice(0, -1)),
  };
  if (reference.bytes > MAX_ARTIFACT_BYTES || completion.resultBytes > step.maxResultBytes) {
    fail('artifact-ceiling', 'mission program completion artifact exceeds its ceiling');
  }
  const artifactPath = join(artifactsDir, `${reference.digest}.json`);
  const published = await publishFileExclusive({ destinationPath: artifactPath, content: body });
  if (!published) await readArtifact(artifactPath, reference, step);
  return deepFreeze(reference);
}

async function readArtifact(artifactPath, reference, step) {
  const text = await readBounded(artifactPath, MAX_ARTIFACT_BYTES, 'mission program completion artifact');
  if (text === null || text !== text.trimEnd() + '\n'
      || Buffer.byteLength(text, 'utf8') !== reference.bytes
      || sha256Text(text.slice(0, -1)) !== reference.digest) {
    fail('artifact-integrity', 'mission program completion artifact is not the admitted artifact');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail('artifact-json', 'mission program completion artifact is not JSON', error);
  }
  return verifyCompletion(value, {
    programId: value.programId,
    stepId: value.stepId,
    stepIndex: value.stepIndex,
    kind: value.kind,
    dispatchId: value.dispatchId,
    dispatchDigest: value.dispatchDigest,
  }, step);
}

function buildAggregate(admission, committed, completedAt) {
  const results = admission.steps.map((step) => {
    const entry = committed.get(step.stepIndex);
    if (!entry) fail('aggregate-missing', 'mission program aggregate lacks a committed step');
    return {
      stepId: step.stepId,
      stepIndex: step.stepIndex,
      completionDigest: entry.completion.completionDigest,
      resultDigest: entry.completion.resultDigest,
      resultBytes: entry.completion.resultBytes,
    };
  });
  const usage = admission.steps.reduce((total, step) => {
    const entry = committed.get(step.stepIndex);
    for (const key of Object.keys(total)) total[key] += entry.completion.usage[key];
    return total;
  }, {
    inputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    visibleOutputTokens: 0,
    completionTokens: 0,
  });
  if (usage.completionTokens > admission.input.budget.maxCompletionTokens) {
    fail('budget-invalid', 'mission program aggregate exceeds its completion ceiling');
  }
  if (results.reduce((sum, result) => sum + result.resultBytes, 0) > admission.input.budget.maxResultBytes) {
    fail('budget-invalid', 'mission program aggregate exceeds its result ceiling');
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: admission.input.programId,
    results,
    usage,
    completedAt,
  };
  return deepFreeze({ ...unsigned, aggregateDigest: sha256Value(unsigned) });
}

function verifyAggregate(value, admission, committed) {
  object(value, 'mission program aggregate completion');
  assertCredentialFree(value, 'mission program aggregate completion');
  try {
    assertSchema('mission-program-aggregate-completion', value);
  } catch (error) {
    fail('aggregate-invalid', 'mission program aggregate completion is invalid', error);
  }
  exactKeys(value, ['schemaVersion', 'protocolId', 'programId', 'results', 'usage', 'completedAt', 'aggregateDigest'], 'mission program aggregate completion');
  const expected = buildAggregate(admission, committed, value.completedAt);
  if (!same(value, expected)) fail('aggregate-binding', 'mission program aggregate completion does not match committed steps');
  verifyUsage(value.usage, 'mission program aggregate usage', admission.input.budget.maxCompletionTokens);
  parseTime(value.completedAt, 'mission program aggregate time');
  return deepFreeze(safeClone(value, 'mission program aggregate completion'));
}

async function replayState(journalPath, artifactsDir) {
  const text = await readBounded(journalPath, MAX_JOURNAL_BYTES, 'mission program journal');
  if (text === null) return null;
  let state;
  try {
    state = JSON.parse(text);
  } catch (error) {
    fail('journal-json', 'mission program journal is invalid JSON', error);
  }
  try {
    assertSchema('mission-program-state', state);
  } catch (error) {
    fail('state-invalid', 'mission program state is invalid', error);
  }
  if (text !== jsonBytes(state)) fail('journal-canonical', 'mission program journal is not canonical');
  requireDigest(state.programId, 'mission program state id');
  const { stateDigest, ...unsigned } = state;
  requireDigest(stateDigest, 'mission program state digest');
  if (sha256Value(unsigned) !== stateDigest) fail('state-digest', 'mission program state digest mismatch');
  if (state.headDigest !== (state.events.at(-1)?.contentDigest ?? ZERO_DIGEST)) {
    fail('state-head', 'mission program state head mismatch');
  }

  let admission = null;
  const prepared = new Map();
  const committed = new Map();
  let completion = null;
  let previousDigest = ZERO_DIGEST;
  let previousTime = -Infinity;
  for (let index = 0; index < state.events.length; index += 1) {
    const event = state.events[index];
    try {
      assertSchema('mission-program-event', event);
    } catch (error) {
      fail('event-invalid', `mission program event ${index + 1} is invalid`, error);
    }
    if (canonicalJson(event) !== jsonBytes(event).trimEnd()
        || event.sequence !== index + 1
        || event.previousDigest !== previousDigest
        || event.programId !== state.programId) {
      fail('event-chain', 'mission program event chain is invalid');
    }
    const eventTime = parseTime(event.recordedAt, 'mission program event time');
    if (eventTime < previousTime) fail('event-time', 'mission program event time moved backward');
    const { contentDigest, ...eventUnsigned } = event;
    requireDigest(contentDigest, 'mission program event digest');
    if (sha256Value(eventUnsigned) !== contentDigest) fail('event-digest', 'mission program event digest mismatch');
    previousDigest = contentDigest;
    previousTime = eventTime;

    if (event.eventType === 'program.admitted') {
      if (admission || index !== 0) fail('event-order', 'mission program admission must be first and unique');
      exactKeys(event.payload, ['admission'], 'mission program admission event');
      admission = verifyAdmission(event.payload.admission, state.programId);
      continue;
    }
    if (!admission || completion) fail('event-order', 'mission program event follows an invalid lifecycle state');
    if (event.eventType === 'step.prepared') {
      exactKeys(event.payload, ['dispatch'], 'mission program prepared event');
      const dispatch = event.payload.dispatch;
      const step = admission.steps[dispatch.stepIndex];
      if (!step || committed.has(dispatch.stepIndex) || prepared.has(dispatch.stepIndex)
          || dispatch.stepIndex !== committed.size) {
        fail('event-order', 'mission program prepared step is invalid');
      }
      prepared.set(dispatch.stepIndex, verifyDispatch(dispatch, admission, step));
    } else if (event.eventType === 'step.committed') {
      exactKeys(event.payload, ['stepId', 'stepIndex', 'artifact'], 'mission program committed event');
      const step = admission.steps[event.payload.stepIndex];
      const dispatch = prepared.get(event.payload.stepIndex);
      if (!step || !dispatch || committed.has(event.payload.stepIndex)
          || event.payload.stepId !== step.stepId) {
        fail('event-order', 'mission program committed step is invalid');
      }
      const reference = event.payload.artifact;
      exactKeys(reference, ['bytes', 'digest'], 'mission program artifact reference');
      requireDigest(reference.digest, 'mission program artifact reference digest');
      requireInteger(reference.bytes, 'mission program artifact bytes', MAX_ARTIFACT_BYTES);
      const artifact = await readArtifact(join(artifactsDir, `${reference.digest}.json`), reference, step);
      verifyCompletion(artifact, dispatch, step);
      committed.set(event.payload.stepIndex, { dispatch, completion: artifact, reference: clone(reference) });
    } else if (event.eventType === 'program.completed') {
      exactKeys(event.payload, ['completion'], 'mission program completed event');
      if (committed.size !== admission.steps.length) fail('event-order', 'mission program completed before every step');
      completion = verifyAggregate(event.payload.completion, admission, committed);
    } else {
      fail('event-type', 'mission program event type is unsupported');
    }
  }
  if (!admission) fail('event-order', 'mission program journal has no admission');
  return { state, admission, prepared, committed, completion };
}

async function appendEvent(journalPath, projection, eventType, payload, recordedAt, artifactsDir) {
  const event = buildEvent(projection.state, eventType, payload, recordedAt);
  const state = buildState(projection.state.programId, [...projection.state.events, event]);
  await writeState(journalPath, state);
  return replayState(journalPath, artifactsDir);
}

function inspectProjection(projection) {
  const stepIds = projection.admission.steps.map(({ stepId }) => stepId);
  const preparedStepIds = [...projection.prepared.keys()].sort((left, right) => left - right)
    .map((index) => projection.admission.steps[index].stepId);
  const committedStepIds = [...projection.committed.keys()].sort((left, right) => left - right)
    .map((index) => projection.admission.steps[index].stepId);
  const next = projection.admission.steps.find((step) => !projection.committed.has(step.stepIndex));
  const pendingStepIds = next && projection.prepared.has(next.stepIndex) ? [next.stepId] : [];
  return deepFreeze({
    status: projection.completion ? 'completed' : projection.prepared.has(next?.stepIndex) ? 'pending' : 'admitted',
    programId: projection.state.programId,
    eventCount: projection.state.events.length,
    headDigest: projection.state.headDigest,
    stepIds,
    preparedStepIds,
    committedStepIds,
    pendingStepIds,
    aggregateDigest: projection.completion?.aggregateDigest ?? null,
    next: projection.completion ? 'none' : next ? `step:${next.stepId}` : 'none',
  });
}

async function completedResult(projection, recovered) {
  const results = [];
  for (const step of projection.admission.steps) {
    const entry = projection.committed.get(step.stepIndex);
    const completion = await readArtifact(
      join(projection.artifactsDir, `${entry.reference.digest}.json`),
      entry.reference,
      step,
    );
    results.push({ stepId: step.stepId, stepIndex: step.stepIndex, completion });
  }
  return deepFreeze({
    status: 'completed',
    programId: projection.state.programId,
    aggregateDigest: projection.completion.aggregateDigest,
    results,
    usage: clone(projection.completion.usage),
    recovered,
  });
}

function pendingResult(projection, recovered) {
  const next = projection.admission.steps.find((step) => !projection.committed.has(step.stepIndex));
  return deepFreeze({
    status: 'pending',
    programId: projection.state.programId,
    pendingStepIds: next ? [next.stepId] : [],
    headDigest: projection.state.headDigest,
    recovered,
  });
}

async function invokeAdapter(entry, method, dispatch) {
  let response;
  try {
    response = await entry.adapter[method]({ dispatch: deepFreeze(safeClone(dispatch, 'mission program dispatch')) });
  } catch (error) {
    if (error instanceof MissionProgramError) throw error;
    fail('adapter-call', `mission program ${method} failed`, error);
  }
  object(response, `mission program ${method} response`);
  assertCredentialFree(response, `mission program ${method} response`);
  exactKeys(response, response.status === 'completed' ? ['status', 'completion'] : ['status'], `mission program ${method} response`);
  if (!['absent', 'pending', 'completed'].includes(response.status)) fail('response-status', 'mission program response status is invalid');
  if (response.status === 'completed') return { status: 'completed', completion: response.completion };
  return { status: response.status };
}

async function assertLiveAdapter(entry) {
  let descriptor;
  try {
    descriptor = verifyDescriptor(await entry.adapter.descriptor());
  } catch (error) {
    if (error instanceof MissionProgramError) throw error;
    fail('descriptor-call', 'mission program adapter descriptor could not be reread', error);
  }
  if (!same(descriptor, entry.descriptor)) fail('descriptor-drift', 'mission program adapter descriptor changed');
  return entry;
}

async function resumeLocked({ projection: initialProjection, paths, adapters, clock, checkpoint, recovered }) {
  let projection = { ...initialProjection, artifactsDir: paths.artifacts };
  await mkdir(paths.artifacts, { recursive: true });
  if (projection.completion) return completedResult(projection, recovered);
  for (const step of projection.admission.steps) {
    if (projection.committed.has(step.stepIndex)) continue;
    let dispatch = projection.prepared.get(step.stepIndex);
    if (!dispatch) {
      dispatch = buildDispatch(projection.admission, step);
      projection = await appendEvent(paths.journal, projection, 'step.prepared', { dispatch }, clockTime(clock), paths.artifacts);
      projection = { ...projection, artifactsDir: paths.artifacts };
    }
    const entry = adapters.get(step.kind);
    if (!entry) fail('adapter-missing', `mission program adapter is missing for ${step.kind}`);
    await assertLiveAdapter(entry);
    let response = await invokeAdapter(entry, 'reconcile', dispatch);
    await checkpoint({
      stage: 'after-step-reconcile',
      programId: projection.state.programId,
      stepId: step.stepId,
      dispatchId: dispatch.dispatchId,
      status: response.status,
    });
    if (response.status === 'absent') {
      await assertLiveAdapter(entry);
      response = await invokeAdapter(entry, 'execute', dispatch);
      if (response.status === 'completed') {
        await checkpoint({
          stage: 'after-step-execute-before-commit',
          programId: projection.state.programId,
          stepId: step.stepId,
          dispatchId: dispatch.dispatchId,
        });
      }
    }
    if (response.status === 'pending') return pendingResult(projection, recovered);
    const completion = verifyCompletion(response.completion, dispatch, step);
    const reference = await publishCompletion(paths.artifacts, completion, step);
    projection = await appendEvent(paths.journal, projection, 'step.committed', {
      stepId: step.stepId,
      stepIndex: step.stepIndex,
      artifact: reference,
    }, clockTime(clock), paths.artifacts);
    projection = { ...projection, artifactsDir: paths.artifacts };
  }
  const completedAt = clockTime(clock);
  await checkpoint({ stage: 'before-program-completion', programId: projection.state.programId });
  const completion = buildAggregate(projection.admission, projection.committed, completedAt);
  projection = await appendEvent(paths.journal, projection, 'program.completed', { completion }, completedAt, paths.artifacts);
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

function requireProgramId(value) {
  requireDigest(value, 'mission program id');
}

export function assertMissionProgramCoordinator(value) {
  if (!value || typeof value !== 'object' || !coordinatorInstances.has(value)) {
    throw new TypeError('mission program coordinator is not authentic');
  }
  return value;
}

export async function createMissionProgramCoordinator({
  programRoot,
  adapters,
  clock = Date.now,
  checkpoint = async () => {},
  staleAfterMs = 30_000,
} = {}) {
  if (typeof programRoot !== 'string' || programRoot.length < 1 || /[\0\r\n]/.test(programRoot)) {
    throw new TypeError('programRoot is required');
  }
  if (typeof clock !== 'function' || typeof checkpoint !== 'function') throw new TypeError('mission program functions are required');
  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1) throw new TypeError('staleAfterMs is invalid');
  const root = resolve(programRoot);
  const adapterMap = await verifyAdapters(adapters);

  const operationPaths = (programId) => {
    const operationRoot = join(root, 'programs', programId);
    return {
      root: operationRoot,
      journal: join(operationRoot, 'journal.json'),
      artifacts: join(operationRoot, 'artifacts'),
      lock: join(operationRoot, 'operation.lock'),
    };
  };

  async function execute(input) {
    const normalized = normalizeInput(input);
    const paths = operationPaths(normalized.programId);
    return withOperationLock(paths, async () => {
      let projection = await replayState(paths.journal, paths.artifacts);
      if (!projection) {
        const admission = buildAdmission(normalized, adapterMap, clockTime(clock));
        const emptyState = { programId: normalized.programId, events: [], headDigest: ZERO_DIGEST };
        await writeState(paths.journal, buildState(normalized.programId, [
          buildEvent(emptyState, 'program.admitted', { admission }, admission.admittedAt),
        ]));
        projection = await replayState(paths.journal, paths.artifacts);
        return resumeLocked({ projection, paths, adapters: adapterMap, clock, checkpoint, recovered: false });
      }
      const expectedAdmission = buildAdmission(normalized, adapterMap, projection.admission.admittedAt);
      if (!same(expectedAdmission, projection.admission)) fail('admission-mismatch', 'mission program admission mismatch');
      if (projection.completion) return completedResult({ ...projection, artifactsDir: paths.artifacts }, false);
      return resumeLocked({ projection, paths, adapters: adapterMap, clock, checkpoint, recovered: true });
    }, staleAfterMs);
  }

  async function recover(programId) {
    requireProgramId(programId);
    const paths = operationPaths(programId);
    return withOperationLock(paths, async () => {
      const projection = await replayState(paths.journal, paths.artifacts);
      if (!projection) fail('program-missing', 'mission program journal is missing');
      for (const step of projection.admission.steps) {
        const entry = adapterMap.get(step.kind);
        if (!entry) fail('adapter-missing', `mission program adapter is missing for ${step.kind}`);
        await assertLiveAdapter(entry);
        if (!same(entry.descriptor, step.descriptor)) fail('descriptor-mismatch', 'mission program adapter descriptor does not match admission');
      }
      return resumeLocked({ projection, paths, adapters: adapterMap, clock, checkpoint, recovered: true });
    }, staleAfterMs);
  }

  async function inspect(programId) {
    requireProgramId(programId);
    const paths = operationPaths(programId);
    const projection = await replayState(paths.journal, paths.artifacts);
    if (!projection) return deepFreeze({ status: 'absent', programId });
    return inspectProjection(projection);
  }

  const coordinator = { execute, recover, inspect };
  coordinatorInstances.add(coordinator);
  return Object.freeze(coordinator);
}
