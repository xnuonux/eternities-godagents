import { join, resolve } from 'node:path';

import {
  assertVerifiedLocalGodskillsProcessTransports,
  createVerifiedLocalGodskillsProcessTransports,
} from './local-recoverable-godskills-adapter.mjs';
import { createRecoverableTypedCompositionCompiler } from './recoverable-typed-composition-compiler.mjs';

const SEALED_COMPILERS = new WeakSet();

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} is required`);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function validateOptions(value) {
  requireObject(value, 'sealed local typed composition options');
  const allowed = new Set([
    'runtimeRoot', 'releasePin', 'routingPin', 'compositionReleasePin',
    'activationClassifier', 'artifactCache', 'io', 'compositionIo', 'timeoutMs',
    'maximumGodskillsDispatchBytes', 'maximumGodskillsCompletionBytes',
    'maximumGodskillsResultBytes', 'processClock', 'processCheckpoint',
    'admissionCheckpoint', 'compilerCheckpoint', 'processLockOptions',
    'admissionLockOptions', 'compilerLockOptions',
  ]);
  if (Object.keys(value).some((name) => !allowed.has(name))) {
    throw new TypeError('sealed local typed composition options are invalid');
  }
}

export function assertSealedLocalTypedCompositionCompiler(value) {
  if (!value || typeof value !== 'object' || !SEALED_COMPILERS.has(value)) {
    throw new TypeError('sealed local typed composition compiler lacks private provenance brand');
  }
  return value;
}

export async function createSealedLocalTypedCompositionCompiler(options = {}) {
  validateOptions(options);
  const {
    runtimeRoot,
    releasePin,
    routingPin,
    compositionReleasePin,
    activationClassifier,
    artifactCache = new Map(),
    io,
    compositionIo = {},
    timeoutMs = 30_000,
    maximumGodskillsDispatchBytes = 1_048_576,
    maximumGodskillsCompletionBytes = 1_048_576,
    maximumGodskillsResultBytes = 1_048_576,
    processClock = () => new Date().toISOString(),
    processCheckpoint = async () => {},
    admissionCheckpoint = async () => {},
    compilerCheckpoint = async () => {},
    processLockOptions = {},
    admissionLockOptions = {},
    compilerLockOptions = {},
  } = options;
  if (typeof runtimeRoot !== 'string' || runtimeRoot.length === 0 || /[\0\r\n]/.test(runtimeRoot)) {
    throw new TypeError('sealed local typed composition runtime root is required');
  }
  requireFunction(activationClassifier, 'sealed local typed composition activation classifier');
  requireFunction(processClock, 'sealed local typed composition process clock');
  requireFunction(processCheckpoint, 'sealed local typed composition process checkpoint');
  requireFunction(admissionCheckpoint, 'sealed local typed composition admission checkpoint');
  requireFunction(compilerCheckpoint, 'sealed local typed composition compiler checkpoint');
  requireObject(processLockOptions, 'sealed local typed composition process lock options');
  requireObject(admissionLockOptions, 'sealed local typed composition admission lock options');
  requireObject(compilerLockOptions, 'sealed local typed composition compiler lock options');
  if (!(artifactCache instanceof Map)) {
    throw new TypeError('sealed local typed composition artifact cache must be a Map');
  }

  const root = resolve(runtimeRoot);
  const local = assertVerifiedLocalGodskillsProcessTransports(
    await createVerifiedLocalGodskillsProcessTransports({
      terminalRoot: join(root, 'godskills', 'local-process-terminal'),
      releasePin,
      routingPin,
      artifactCache,
      io,
      timeoutMs,
      maximumDispatchBytes: maximumGodskillsDispatchBytes,
      maximumCompletionBytes: maximumGodskillsCompletionBytes,
      maximumResultBytes: maximumGodskillsResultBytes,
      clock: processClock,
      checkpoint: processCheckpoint,
      lockOptions: processLockOptions,
    }),
  );
  const compiler = await createRecoverableTypedCompositionCompiler({
    root,
    compositionReleasePin,
    godskills: {
      releasePin,
      routingTransport: local.routingTransport,
      activationClassifier,
      activationTransport: local.activationTransport,
      artifactCache,
      io,
      checkpoint: admissionCheckpoint,
      lockOptions: admissionLockOptions,
    },
    compositionIo,
    checkpoint: compilerCheckpoint,
    lockOptions: compilerLockOptions,
  });
  const sealed = Object.freeze({
    descriptor: deepFreeze({
      protocolId: 'eternities-sealed-local-typed-composition-compiler-v1',
      compilerProtocolId: compiler.descriptor.protocolId,
      godskillsReleaseDigest: compiler.descriptor.godskillsReleaseDigest,
      composition: structuredClone(compiler.descriptor.composition),
      localExecution: structuredClone(local.localExecution),
      methodSerialized: false,
      authorityExpanded: false,
      defaultLaunchEnabled: false,
    }),
    compileMission: compiler.compileMission,
    resumeMission: compiler.resumeMission,
    execute: compiler.execute,
  });
  SEALED_COMPILERS.add(sealed);
  return sealed;
}
