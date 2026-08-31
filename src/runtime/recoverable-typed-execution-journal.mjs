import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { assertPinnedTypedExecutionStepperAdapter } from '../skills/typed-execution-stepper-adapter.mjs';

const JOURNALS = new WeakSet();
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES = 1_048_576;
const INTENT_PROTOCOL = 'eternities-recoverable-typed-execution-intent-v1';
const RECORD_PROTOCOL = 'eternities-recoverable-typed-execution-step-record-v1';

export class RecoverableTypedExecutionJournalError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'RecoverableTypedExecutionJournalError';
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new RecoverableTypedExecutionJournalError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch (error) {
    fail('value-invalid', `${label} is not cloneable`, error);
  }
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
    fail('record-invalid', `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('record-invalid', `${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('record-invalid', `${label} is invalid`);
}

function pathIdentity(value) {
  const absolute = resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function requireContained(root, target, label) {
  const remainder = relative(root, target);
  if (remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder))) return;
  fail('state-path-invalid', `${label} escaped the journal root`);
}

async function ensureRealDirectory(path, label, expectedParent = null) {
  await mkdir(path, { recursive: true });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('state-path-invalid', `${label} is not a real directory`);
  const actual = await realpath(path);
  if (pathIdentity(actual) !== pathIdentity(path)) fail('state-path-invalid', `${label} is a path alias`);
  if (expectedParent !== null) requireContained(expectedParent, actual, label);
  return actual;
}

async function readCanonical(path, label, verify, { missing = null, root } = {}) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return missing;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_RECORD_BYTES) {
    fail('record-invalid', `${label} is not a bounded regular file`);
  }
  const actual = await realpath(path);
  if (root !== undefined) requireContained(root, actual, label);
  if (pathIdentity(actual) !== pathIdentity(path)) fail('record-invalid', `${label} is a path alias`);
  const text = await readFile(actual, 'utf8');
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail('record-invalid', `${label} is not valid JSON`, error);
  }
  if (text !== `${canonicalJson(value)}\n`) fail('record-invalid', `${label} bytes are not canonical`);
  return verify(value);
}

async function publishExact(path, value, label, verify, root) {
  const text = `${canonicalJson(value)}\n`;
  if (Buffer.byteLength(text, 'utf8') > MAX_RECORD_BYTES) fail('record-invalid', `${label} exceeds its byte ceiling`);
  const published = await publishFileExclusive({ destinationPath: path, content: text });
  if (published) return value;
  const existing = await readCanonical(path, label, verify, { root });
  if (canonicalJson(existing) !== canonicalJson(value)) fail('record-collision', `${label} changed during publication`);
  return existing;
}

function buildIntent(adapter, execution) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: INTENT_PROTOCOL,
    missionId: execution.missionId,
    methodDigest: execution.methodDigest,
    missionInputDigest: execution.missionInputDigest,
    stepperTrustRootDigest: adapter.descriptor.stepperTrustRootDigest,
    parentTypedCompositionReceiptDigest: adapter.descriptor.parentTypedCompositionReceiptDigest,
    authorityExpanded: false,
  };
  return deepFreeze({ ...unsigned, executionId: sha256Value(unsigned) });
}

function verifyIntent(value, expected) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'missionId', 'methodDigest', 'missionInputDigest',
    'stepperTrustRootDigest', 'parentTypedCompositionReceiptDigest', 'authorityExpanded',
    'executionId',
  ], 'typed execution intent');
  if (canonicalJson(value) !== canonicalJson(expected)) fail('intent-collision', 'typed execution intent changed');
  return value;
}

function buildRecord({ intent, previousRecordDigest, step, output }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: RECORD_PROTOCOL,
    executionId: intent.executionId,
    previousRecordDigest,
    order: step.order,
    stepDigest: step.stepDigest,
    nodeId: step.nodeId,
    capabilityId: step.capabilityId,
    outputDigest: sha256Value(output),
    output,
    authorityExpanded: false,
  };
  return deepFreeze({ ...unsigned, recordDigest: sha256Value(unsigned) });
}

function verifyRecord(value, { intent, previousRecordDigest, order }) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'executionId', 'previousRecordDigest', 'order',
    'stepDigest', 'nodeId', 'capabilityId', 'outputDigest', 'output',
    'authorityExpanded', 'recordDigest',
  ], `typed execution record ${order}`);
  if (value.schemaVersion !== 1 || value.protocolId !== RECORD_PROTOCOL
      || value.executionId !== intent.executionId || value.previousRecordDigest !== previousRecordDigest
      || value.order !== order || value.authorityExpanded !== false) {
    fail('record-invalid', `typed execution record ${order} identity is invalid`);
  }
  for (const [digest, label] of [
    [value.stepDigest, 'step digest'], [value.outputDigest, 'output digest'],
    [value.recordDigest, 'record digest'], [value.previousRecordDigest, 'previous record digest'],
  ]) requireDigest(digest, label);
  if (value.outputDigest !== sha256Value(value.output)) fail('record-invalid', `typed execution record ${order} output digest changed`);
  const unsigned = clone(value, `typed execution record ${order}`);
  delete unsigned.recordDigest;
  if (value.recordDigest !== sha256Value(unsigned)) fail('record-invalid', `typed execution record ${order} digest changed`);
  return value;
}

async function readRecords(stepsRoot, intent) {
  const entries = await readdir(stepsRoot, { withFileTypes: true });
  const committed = entries.filter((entry) => entry.isFile() && /^\d{6}\.json$/.test(entry.name));
  const inertPending = (entry) => entry.isFile() && /^\d{6}\.json\.writing$/.test(entry.name);
  if (entries.some((entry) => !committed.includes(entry) && !inertPending(entry))) {
    fail('record-invalid', 'typed execution step directory contains an unexpected entry');
  }
  const names = committed.map(({ name }) => name).sort();
  let previousRecordDigest = intent.executionId;
  const records = [];
  for (let order = 0; order < names.length; order += 1) {
    const expectedName = `${String(order).padStart(6, '0')}.json`;
    if (names[order] !== expectedName) fail('record-gap', 'typed execution record sequence is not contiguous');
    const record = await readCanonical(
      join(stepsRoot, expectedName),
      `typed execution record ${order}`,
      (value) => verifyRecord(value, { intent, previousRecordDigest, order }),
      { root: stepsRoot },
    );
    records.push(record);
    previousRecordDigest = record.recordDigest;
  }
  return { records, headDigest: previousRecordDigest };
}

function assertReadyStep(step, record = null) {
  if (!step || step.protocolId !== 'eternities-typed-mission-execution-step-v1' || step.status !== 'ready') {
    fail('step-invalid', 'Godskills did not emit a ready typed execution step');
  }
  if (record !== null && (record.order !== step.order || record.stepDigest !== step.stepDigest
      || record.nodeId !== step.nodeId || record.capabilityId !== step.capabilityId)) {
    fail('record-replay-mismatch', `durable typed execution record ${record.order} differs from Godskills`);
  }
  return step;
}

function verifyExecutors(method, executors) {
  if (!executors || typeof executors !== 'object' || Array.isArray(executors)) {
    fail('executor-missing', 'recoverable typed execution executors must be an object');
  }
  const expected = [...new Set(method.nodes.map(({ capabilityId }) => capabilityId))].sort();
  const actual = Object.keys(executors).sort();
  const descriptors = Object.getOwnPropertyDescriptors(executors);
  if (actual.length !== expected.length
      || actual.some((name, index) => name !== expected[index])
      || actual.some((name) => !Object.hasOwn(descriptors[name], 'value')
        || typeof descriptors[name].value !== 'function')) {
    fail('executor-missing', 'typed mission requires exactly one data-property executor per selected capability');
  }
  return Object.freeze(Object.fromEntries(expected.map((name) => [name, descriptors[name].value])));
}

export function assertRecoverableTypedExecutionJournal(value) {
  if (!value || typeof value !== 'object' || !JOURNALS.has(value)) {
    throw new TypeError('recoverable typed execution journal lacks private provenance brand');
  }
  return value;
}

export async function createRecoverableTypedExecutionJournal({
  root: rootValue,
  adapter,
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof rootValue !== 'string' || rootValue.length === 0 || /[\0\r\n]/.test(rootValue)) {
    throw new TypeError('recoverable typed execution journal root is required');
  }
  assertPinnedTypedExecutionStepperAdapter(adapter);
  if (typeof checkpoint !== 'function') throw new TypeError('recoverable typed execution checkpoint must be a function');
  if (!lockOptions || typeof lockOptions !== 'object' || Array.isArray(lockOptions)) {
    throw new TypeError('recoverable typed execution lock options must be an object');
  }
  const root = await ensureRealDirectory(resolve(rootValue), 'typed execution journal root');
  const executionsRoot = await ensureRealDirectory(join(root, 'executions'), 'typed executions root', root);

  const journal = Object.freeze({
    descriptor: deepFreeze({
      protocolId: 'eternities-recoverable-typed-execution-journal-v1',
      stepperTrustRootDigest: adapter.descriptor.stepperTrustRootDigest,
      parentTypedCompositionReceiptDigest: adapter.descriptor.parentTypedCompositionReceiptDigest,
      persistedAfterGodskillsValidation: true,
      resumesFirstUnfinishedNode: true,
      externalExactlyOnce: false,
      authorityExpanded: false,
      defaultLaunchEnabled: false,
    }),
    async run(input) {
      exactKeys(input, ['method', 'missionInputs', 'executors'], 'recoverable typed execution request');
      const execution = adapter.begin({ method: input.method, missionInputs: input.missionInputs });
      const executors = verifyExecutors(input.method, input.executors);
      const intent = buildIntent(adapter, execution);
      const executionRoot = await ensureRealDirectory(
        join(executionsRoot, intent.executionId), 'typed execution slot', executionsRoot,
      );
      const stepsRoot = await ensureRealDirectory(join(executionRoot, 'steps'), 'typed execution steps', executionRoot);
      const lock = await acquireFileLock({ ...lockOptions, lockPath: join(executionRoot, 'execution.lock') });
      try {
        const intentPath = join(executionRoot, 'intent.json');
        const existingIntent = await readCanonical(
          intentPath,
          'typed execution intent',
          (value) => verifyIntent(value, intent),
          { missing: null, root: executionRoot },
        );
        if (existingIntent === null) {
          await publishExact(
            intentPath, intent, 'typed execution intent',
            (value) => verifyIntent(value, intent), executionRoot,
          );
        }
        let { records, headDigest } = await readRecords(stepsRoot, intent);
        for (const record of records) {
          const step = assertReadyStep(adapter.next({ execution }), record);
          adapter.commit({ execution, step, output: clone(record.output, `durable output ${record.order}`) });
        }

        let current = adapter.next({ execution });
        let executedSteps = 0;
        while (current.status !== 'completed') {
          const step = assertReadyStep(current);
          const executor = executors[step.capabilityId];
          if (typeof executor !== 'function') {
            fail('executor-missing', `executor ${step.capabilityId} is required`);
          }
          const output = clone(await executor(clone(step.input, `${step.capabilityId} input`)), `${step.capabilityId} output`);
          current = adapter.commit({ execution, step, output });
          const record = buildRecord({ intent, previousRecordDigest: headDigest, step, output });
          await checkpoint('after-typed-step-validated', clone(record, 'typed execution checkpoint record'));
          await publishExact(
            join(stepsRoot, `${String(record.order).padStart(6, '0')}.json`),
            record,
            `typed execution record ${record.order}`,
            (value) => verifyRecord(value, { intent, previousRecordDigest: headDigest, order: record.order }),
            stepsRoot,
          );
          headDigest = record.recordDigest;
          records = [...records, record];
          executedSteps += 1;
          await checkpoint('after-typed-step-persisted', clone(record, 'typed execution checkpoint record'));
        }
        return deepFreeze({
          status: 'completed',
          executionId: intent.executionId,
          journalHeadDigest: headDigest,
          recoveredSteps: records.length - executedSteps,
          executedSteps,
          completion: clone(current, 'typed execution completion'),
          externalExactlyOnce: false,
          authorityExpanded: false,
        });
      } finally {
        await lock.release();
      }
    },
  });
  JOURNALS.add(journal);
  return journal;
}
