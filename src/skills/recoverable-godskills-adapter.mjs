import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { createGodskillsAdapter } from './mission-binder.mjs';
import {
  buildRecoverableGodskillsBindingIntent,
  buildRecoverableGodskillsBindingRecord,
  recoverableGodskillsBindingSlot,
  verifyRecoverableGodskillsBindingIntent,
  verifyRecoverableGodskillsBindingRecord,
} from './recoverable-godskills-contracts.mjs';
import {
  RecoverableGodskillsPendingError,
  createRecoverableGodskillsOutbox,
} from './recoverable-godskills-outbox.mjs';

export class RecoverableGodskillsAdapterError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'RecoverableGodskillsAdapterError';
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new RecoverableGodskillsAdapterError(code, message, cause === undefined ? undefined : { cause });
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

export async function createRecoverableGodskillsAdapter({
  admissionRoot,
  releasePin,
  routingTransport,
  activationClassifier,
  activationTransport,
  artifactCache,
  io,
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof admissionRoot !== 'string' || admissionRoot.length < 1 || /[\0\r\n]/.test(admissionRoot)) {
    throw new TypeError('recoverable Godskills admission root is required');
  }
  if (typeof checkpoint !== 'function') throw new TypeError('recoverable Godskills checkpoint must be a function');
  const root = resolve(admissionRoot);
  const routeOutbox = await createRecoverableGodskillsOutbox({
    root,
    stage: 'route',
    transport: routingTransport,
    checkpoint,
    lockOptions,
  });
  const activationOutbox = await createRecoverableGodskillsOutbox({
    root,
    stage: 'activation',
    transport: activationTransport,
    checkpoint,
    lockOptions,
  });
  const adapter = await createGodskillsAdapter({
    releasePin,
    artifactCache,
    io,
    transport: (request) => routeOutbox.invoke(request),
    activationClassifier,
    activationTransport: (request) => activationOutbox.invoke(request),
  });

  async function recoverBinding(record, intent) {
    const checked = verifyRecoverableGodskillsBindingRecord(record, {
      intent,
      releaseDigest: adapter.releaseDigest,
    });
    if (checked.binding.status === 'needs-decision') return deepFreeze(clone(checked.binding));
    const rehydrated = await adapter.rehydrateMission({
      receipt: clone(checked.binding.receipt),
      ...clone(intent.input),
    });
    if (!same(rehydrated, checked.binding)) {
      fail('binding-recovery-changed', 'recovered Godskills binding differs from its immutable record');
    }
    return deepFreeze(clone(checked.binding));
  }

  async function bindMission(inputValue) {
    const input = clone(inputValue);
    const intended = buildRecoverableGodskillsBindingIntent({
      input,
      releaseDigest: adapter.releaseDigest,
    });
    const slot = recoverableGodskillsBindingSlot(intended.missionId);
    const bindingRoot = join(root, 'bindings', slot);
    const intentPath = join(bindingRoot, 'intent.json');
    const resultPath = join(bindingRoot, 'result.json');
    const lockPath = join(bindingRoot, 'binding.lock');
    await mkdir(bindingRoot, { recursive: true });
    const lock = await acquireFileLock({ ...lockOptions, lockPath });
    try {
      const existingIntent = await readCanonical(
        intentPath,
        'recoverable Godskills binding intent',
        (value) => verifyRecoverableGodskillsBindingIntent(value, {
          input,
          releaseDigest: adapter.releaseDigest,
        }),
      );
      if (existingIntent && !same(existingIntent, intended)) {
        fail('intent-collision', 'recoverable Godskills binding intent changed');
      }
      const intent = existingIntent ?? await publishExact(
        intentPath,
        intended,
        'recoverable Godskills binding intent',
        (value) => verifyRecoverableGodskillsBindingIntent(value, {
          input,
          releaseDigest: adapter.releaseDigest,
        }),
      );
      const existingRecord = await readCanonical(
        resultPath,
        'recoverable Godskills binding record',
        (value) => verifyRecoverableGodskillsBindingRecord(value, {
          intent,
          releaseDigest: adapter.releaseDigest,
        }),
      );
      if (existingRecord) return recoverBinding(existingRecord, intent);

      let binding;
      try {
        binding = await adapter.bindMission(clone(input));
      } catch (error) {
        if (error instanceof RecoverableGodskillsPendingError) return deepFreeze(clone(error.pending));
        throw error;
      }
      const record = buildRecoverableGodskillsBindingRecord({
        intent,
        releaseDigest: adapter.releaseDigest,
        binding,
      });
      const stored = await publishExact(
        resultPath,
        record,
        'recoverable Godskills binding record',
        (value) => verifyRecoverableGodskillsBindingRecord(value, {
          intent,
          releaseDigest: adapter.releaseDigest,
        }),
      );
      return recoverBinding(stored, intent);
    } finally {
      await lock.release();
    }
  }

  async function rehydrateMission({ receipt, ...input } = {}) {
    return adapter.rehydrateMission({ receipt: clone(receipt), ...clone(input) });
  }

  return Object.freeze({
    releaseDigest: adapter.releaseDigest,
    bindMission,
    rehydrateMission,
    outboxes: Object.freeze({
      routeDescriptorDigest: routeOutbox.descriptor().descriptorDigest,
      activationDescriptorDigest: activationOutbox.descriptor().descriptorDigest,
    }),
  });
}
