import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import {
  buildRecoverableGodskillsDispatch,
  buildRecoverableGodskillsPending,
  verifyRecoverableGodskillsCompletion,
  verifyRecoverableGodskillsDispatch,
  verifyRecoverableGodskillsTransportDescriptor,
} from './recoverable-godskills-contracts.mjs';

export class RecoverableGodskillsOutboxError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'RecoverableGodskillsOutboxError';
    this.code = code;
  }
}

export class RecoverableGodskillsPendingError extends RecoverableGodskillsOutboxError {
  constructor(pending) {
    super('operation-pending', `recoverable Godskills ${pending.phase} operation is pending`);
    this.name = 'RecoverableGodskillsPendingError';
    this.pending = pending;
  }
}

function fail(code, message, cause) {
  throw new RecoverableGodskillsOutboxError(code, message, cause === undefined ? undefined : { cause });
}

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
    fail('fields-invalid', `${label} fields are invalid`);
  }
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

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function verifyTransport(value) {
  object(value, 'recoverable Godskills external transport');
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`recoverable Godskills external transport ${method} is required`);
    }
  }
}

function reconciliation(value, { allowAbsent }) {
  object(value, 'recoverable Godskills reconciliation');
  const completed = value.status === 'completed';
  exactKeys(value, completed ? ['status', 'completion'] : ['status'], 'recoverable Godskills reconciliation');
  const allowed = allowAbsent ? ['absent', 'pending', 'completed'] : ['pending', 'completed'];
  if (!allowed.includes(value.status)) {
    fail('reconciliation-invalid', 'recoverable Godskills reconciliation state is ambiguous');
  }
  return value;
}

async function readCanonical(path, label, verify) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail('record-invalid', `${label} is not valid JSON`, error);
  }
  if (text !== `${canonicalJson(value)}\n`) fail('record-invalid', `${label} bytes are not canonical`);
  return verify(value);
}

async function publishExact(path, value, label, verify) {
  const published = await publishFileExclusive({
    destinationPath: path,
    content: `${canonicalJson(value)}\n`,
  });
  if (published) return value;
  const existing = await readCanonical(path, label, verify);
  if (!existing || !same(existing, value)) fail('record-collision', `${label} changed during publication`);
  return existing;
}

export async function createRecoverableGodskillsOutbox({
  root,
  stage,
  transport,
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof root !== 'string' || root.length < 1 || /[\0\r\n]/.test(root)) {
    throw new TypeError('recoverable Godskills outbox root is required');
  }
  if (!['route', 'activation'].includes(stage)) throw new TypeError('recoverable Godskills outbox stage is invalid');
  verifyTransport(transport);
  if (typeof checkpoint !== 'function') throw new TypeError('recoverable Godskills checkpoint must be a function');
  const outboxRoot = resolve(root);
  const descriptor = verifyRecoverableGodskillsTransportDescriptor(clone(await transport.descriptor()));
  if (descriptor.stage !== stage) fail('descriptor-stage-mismatch', 'recoverable Godskills transport stage differs from its outbox');

  async function invoke(inputRequest) {
    const dispatch = buildRecoverableGodskillsDispatch({
      request: clone(inputRequest),
      transportDescriptor: descriptor,
    });
    const operationRoot = join(outboxRoot, 'operations', stage, dispatch.operationId);
    const dispatchPath = join(operationRoot, 'dispatch.json');
    const completionPath = join(operationRoot, 'completion.json');
    const lockPath = join(operationRoot, 'operation.lock');
    await mkdir(operationRoot, { recursive: true });
    const lock = await acquireFileLock({ ...lockOptions, lockPath });
    try {
      const storedDispatch = await readCanonical(
        dispatchPath,
        'recoverable Godskills dispatch record',
        (value) => verifyRecoverableGodskillsDispatch(value, { transportDescriptor: descriptor }),
      );
      if (storedDispatch && !same(storedDispatch, dispatch)) {
        fail('dispatch-collision', 'recoverable Godskills dispatch changed under one operation identity');
      }
      const exactDispatch = storedDispatch ?? await publishExact(
        dispatchPath,
        dispatch,
        'recoverable Godskills dispatch record',
        (value) => verifyRecoverableGodskillsDispatch(value, { transportDescriptor: descriptor }),
      );
      const verifyCompletion = (value) => verifyRecoverableGodskillsCompletion(value, {
        dispatch: exactDispatch,
        transportDescriptor: descriptor,
      });
      const localCompletion = await readCanonical(
        completionPath,
        'recoverable Godskills completion record',
        verifyCompletion,
      );
      if (localCompletion) return deepFreeze(clone(localCompletion.result));

      const reconciled = reconciliation(clone(await transport.reconcile(clone(exactDispatch))), {
        allowAbsent: true,
      });
      if (reconciled.status === 'pending') {
        throw new RecoverableGodskillsPendingError(buildRecoverableGodskillsPending({
          phase: stage,
          operationId: exactDispatch.operationId,
          dispatchDigest: exactDispatch.dispatchDigest,
        }));
      }
      if (reconciled.status === 'completed') {
        const completion = verifyCompletion(reconciled.completion);
        await checkpoint(`after-godskills-${stage}-reconcile-completed`, exactDispatch.operationId, exactDispatch.dispatchDigest);
        const stored = await publishExact(
          completionPath,
          completion,
          'recoverable Godskills completion record',
          verifyCompletion,
        );
        return deepFreeze(clone(stored.result));
      }

      const executed = reconciliation(clone(await transport.execute(clone(exactDispatch))), {
        allowAbsent: false,
      });
      if (executed.status === 'pending') {
        throw new RecoverableGodskillsPendingError(buildRecoverableGodskillsPending({
          phase: stage,
          operationId: exactDispatch.operationId,
          dispatchDigest: exactDispatch.dispatchDigest,
        }));
      }
      const completion = verifyCompletion(executed.completion);
      await checkpoint(`after-godskills-${stage}-execute`, exactDispatch.operationId, exactDispatch.dispatchDigest);
      const stored = await publishExact(
        completionPath,
        completion,
        'recoverable Godskills completion record',
        verifyCompletion,
      );
      return deepFreeze(clone(stored.result));
    } finally {
      await lock.release();
    }
  }

  return Object.freeze({
    stage,
    descriptor: () => clone(descriptor),
    invoke,
  });
}
