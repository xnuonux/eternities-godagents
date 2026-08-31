import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { createRecoverableGodskillsAdapter } from './recoverable-godskills-adapter.mjs';
import {
  buildRecoverableTypedCompositionIntent,
  buildRecoverableTypedCompositionPending,
  buildRecoverableTypedCompositionRecord,
  materializeRecoverableTypedCompositionPlan,
  recoverableTypedCompositionSlot,
  verifyRecoverableTypedCompositionIntent,
  verifyRecoverableTypedCompositionRecord,
} from './recoverable-typed-composition-contracts.mjs';
import { createPinnedTypedCompositionAdapter } from './typed-composition-adapter.mjs';

export { recoverableTypedCompositionSlot };

const COMPILATIONS = new WeakMap();
const COMPILERS = new WeakSet();
const MAX_STATE_BYTES = 1_048_576;

export class RecoverableTypedCompositionCompilerError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'RecoverableTypedCompositionCompilerError';
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new RecoverableTypedCompositionCompilerError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
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

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function pathIdentity(value) {
  const absolute = resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function requireContained(root, target, label) {
  const remainder = relative(root, target);
  if (remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder))) return;
  fail('state-path-invalid', `${label} escaped the compiler root`);
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
  if (!stat.isFile() || stat.isSymbolicLink()) fail('record-invalid', `${label} is not a regular file`);
  if (stat.size < 1 || stat.size > MAX_STATE_BYTES) fail('record-invalid', `${label} exceeds its byte ceiling`);
  const actual = await realpath(path);
  if (root !== undefined) requireContained(root, actual, label);
  if (pathIdentity(actual) !== pathIdentity(path)) fail('record-invalid', `${label} is a path alias`);
  let text;
  try {
    text = await readFile(actual, 'utf8');
  } catch (error) {
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

async function publishExact(path, value, label, verify, root) {
  const content = `${canonicalJson(value)}\n`;
  if (Buffer.byteLength(content, 'utf8') > MAX_STATE_BYTES) {
    fail('record-invalid', `${label} exceeds its byte ceiling`);
  }
  const published = await publishFileExclusive({
    destinationPath: path,
    content,
  });
  if (published) return value;
  const existing = await readCanonical(path, label, verify, { root });
  if (!existing || !same(existing, value)) fail('record-collision', `${label} changed during publication`);
  return existing;
}

function validateGodskillsOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('recoverable typed composition Godskills options are required');
  }
  const allowed = new Set([
    'releasePin', 'routingTransport', 'activationClassifier', 'activationTransport',
    'artifactCache', 'io', 'checkpoint', 'lockOptions',
  ]);
  const unknown = Object.keys(value).filter((name) => !allowed.has(name));
  if (unknown.length > 0) throw new TypeError('recoverable typed composition Godskills options are invalid');
  for (const name of ['releasePin', 'routingTransport', 'activationClassifier', 'activationTransport']) {
    if (value[name] === undefined) throw new TypeError(`recoverable typed composition Godskills ${name} is required`);
  }
  return value;
}

function compositionRoot(typedAdapter, releasePin) {
  return deepFreeze({
    sourceCommit: typedAdapter.descriptor.sourceCommit,
    trustRootDigest: typedAdapter.descriptor.trustRootDigest,
    policyDigest: releasePin.policy.sha256,
    capabilityLayerReceiptDigest: typedAdapter.descriptor.capabilityLayerReceiptDigest,
    activationTrustRootDigest: typedAdapter.descriptor.activationTrustRootDigest,
    registryDigest: typedAdapter.descriptor.registryDigest,
  });
}

export function assertRecoverableTypedCompositionCompilation(value) {
  if (!value || typeof value !== 'object' || !COMPILATIONS.has(value)) {
    throw new TypeError('recoverable typed composition compilation lacks private provenance brand');
  }
  return value;
}

export function assertRecoverableTypedCompositionCompiler(value) {
  if (!value || typeof value !== 'object' || !COMPILERS.has(value)) {
    throw new TypeError('recoverable typed composition compiler lacks private provenance brand');
  }
  return value;
}

export async function createRecoverableTypedCompositionCompiler({
  root: rootValue,
  compositionReleasePin: inputCompositionReleasePin,
  godskills: inputGodskills,
  compositionIo = {},
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof rootValue !== 'string' || rootValue.length < 1 || /[\0\r\n]/.test(rootValue)) {
    throw new TypeError('recoverable typed composition root is required');
  }
  if (typeof checkpoint !== 'function') throw new TypeError('recoverable typed composition checkpoint must be a function');
  const godskillsOptions = validateGodskillsOptions(inputGodskills);
  const root = await ensureRealDirectory(resolve(rootValue), 'recoverable typed composition root');
  const godskillsRoot = await ensureRealDirectory(join(root, 'godskills'), 'recoverable Godskills root', root);
  const compilationsRoot = await ensureRealDirectory(join(root, 'compilations'), 'typed compilations root', root);
  const compositionReleasePin = clone(inputCompositionReleasePin);
  const [godskillsAdapter, typedAdapter] = await Promise.all([
    createRecoverableGodskillsAdapter({
      admissionRoot: godskillsRoot,
      ...godskillsOptions,
    }),
    createPinnedTypedCompositionAdapter({
      releasePin: compositionReleasePin,
      io: compositionIo,
    }),
  ]);
  const composition = compositionRoot(typedAdapter, compositionReleasePin);
  const owner = Object.freeze({});
  const missionQueues = new Map();

  async function serializeMission(missionId, operation) {
    const slot = recoverableTypedCompositionSlot(missionId);
    const previous = missionQueues.get(slot) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    missionQueues.set(slot, current);
    try {
      return await current;
    } finally {
      if (missionQueues.get(slot) === current) missionQueues.delete(slot);
    }
  }

  async function compileIntent({ intended = null, missionId }) {
    const slot = recoverableTypedCompositionSlot(missionId);
    const compilationRoot = await ensureRealDirectory(
      join(compilationsRoot, slot), 'typed compilation slot', compilationsRoot,
    );
    const intentPath = join(compilationRoot, 'intent.json');
    const resultPath = join(compilationRoot, 'result.json');
    const lockPath = join(compilationRoot, 'compilation.lock');
    const lock = await acquireFileLock({ ...lockOptions, lockPath });
    try {
      let intent = await readCanonical(
        intentPath,
        'recoverable typed composition intent',
        (value) => verifyRecoverableTypedCompositionIntent(value, {
          ...(intended === null ? {} : {
            bindingInput: intended.bindingInput,
            topology: intended.topology,
          }),
          godskillsReleaseDigest: godskillsAdapter.releaseDigest,
          composition,
        }),
        { root: compilationRoot },
      );
      if (intended !== null && intent !== null && !same(intent, intended)) {
        fail('intent-collision', 'recoverable typed composition intent changed');
      }
      if (intent === null) {
        if (intended === null) fail('intent-missing', 'recoverable typed composition intent is absent');
        intent = await publishExact(
          intentPath,
          intended,
          'recoverable typed composition intent',
          (value) => verifyRecoverableTypedCompositionIntent(value, {
            bindingInput: intended.bindingInput,
            topology: intended.topology,
            godskillsReleaseDigest: godskillsAdapter.releaseDigest,
            composition,
          }),
          compilationRoot,
        );
      }
      await checkpoint('after-recoverable-typed-composition-intent', clone(intent));
      const binding = await godskillsAdapter.bindMission(clone(intent.bindingInput));
      if (binding?.status === 'pending') {
        return buildRecoverableTypedCompositionPending({ intent, pending: binding });
      }
      if (binding?.status !== 'bound' || !binding.receipt?.activation) {
        fail('composition-unavailable', 'recoverable Godskills binding cannot compile a typed mission');
      }
      await checkpoint('after-recoverable-typed-composition-godskills-bound', clone(binding));
      const unsignedPlan = materializeRecoverableTypedCompositionPlan({ intent, binding });
      const compiled = typedAdapter.compile({
        unsignedPlan,
        activationResult: clone(binding.receipt.activation),
      });
      await checkpoint('after-recoverable-typed-composition-method-compiled', {
        missionId: intent.missionId,
        planDigest: compiled.plan.planDigest,
        methodDigest: compiled.method.methodDigest,
      });
      const expectedRecord = buildRecoverableTypedCompositionRecord({
        intent,
        binding,
        planDigest: compiled.plan.planDigest,
        methodDigest: compiled.method.methodDigest,
        activationResultDigest: binding.receipt.activation.resultDigest,
      });
      const existingRecord = await readCanonical(
        resultPath,
        'recoverable typed composition record',
        (value) => verifyRecoverableTypedCompositionRecord(value, { intent }),
        { root: compilationRoot },
      );
      if (existingRecord !== null && !same(existingRecord, expectedRecord)) {
        fail('record-collision', 'recoverable typed composition record changed during reconstruction');
      }
      const record = existingRecord ?? await publishExact(
        resultPath,
        expectedRecord,
        'recoverable typed composition record',
        (value) => verifyRecoverableTypedCompositionRecord(value, { intent }),
        compilationRoot,
      );
      await checkpoint('after-recoverable-typed-composition-record', clone(record));
      const handle = deepFreeze({
        status: 'compiled',
        missionId: record.missionId,
        intentDigest: record.intentDigest,
        activationResultDigest: record.activationResultDigest,
        planDigest: record.planDigest,
        methodDigest: record.methodDigest,
        compilationDigest: record.compilationDigest,
        authorityExpanded: false,
      });
      COMPILATIONS.set(handle, { owner, method: compiled.method });
      return handle;
    } finally {
      await lock.release();
    }
  }

  const compiler = Object.freeze({
    descriptor: deepFreeze({
      protocolId: 'eternities-recoverable-typed-composition-compiler-v1',
      godskillsReleaseDigest: godskillsAdapter.releaseDigest,
      composition: clone(composition),
      methodSerialized: false,
      authorityExpanded: false,
      defaultLaunchEnabled: false,
    }),
    async compileMission(input) {
      exactKeys(input, ['bindingInput', 'topology'], 'recoverable typed composition compile request');
      const intended = buildRecoverableTypedCompositionIntent({
        bindingInput: input.bindingInput,
        topology: input.topology,
        godskillsReleaseDigest: godskillsAdapter.releaseDigest,
        composition,
      });
      return serializeMission(
        intended.missionId,
        () => compileIntent({ intended, missionId: intended.missionId }),
      );
    },
    async resumeMission(input) {
      exactKeys(input, ['missionId'], 'recoverable typed composition resume request');
      return serializeMission(input.missionId, () => compileIntent({ missionId: input.missionId }));
    },
    async execute(input) {
      exactKeys(input, ['compilation', 'missionInputs', 'executors'], 'recoverable typed composition execution request');
      assertRecoverableTypedCompositionCompilation(input.compilation);
      const provenance = COMPILATIONS.get(input.compilation);
      if (provenance.owner !== owner) {
        fail('compilation-owner-mismatch', 'typed composition compilation belongs to another compiler');
      }
      return typedAdapter.execute({
        method: provenance.method,
        missionInputs: input.missionInputs,
        executors: input.executors,
      });
    },
  });
  COMPILERS.add(compiler);
  return compiler;
}
