import { join, resolve } from 'node:path';

import { createLocalRecoverableGodskillsAdapter } from '../skills/local-recoverable-godskills-adapter.mjs';
import { createIdentityBoundMissionVessel } from './identity-bound-mission-vessel.mjs';

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} is required`);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function requireTransport(value, label) {
  requireObject(value, label);
  for (const method of ['descriptor', 'reconcile', 'execute']) {
    if (typeof value[method] !== 'function') throw new TypeError(`${label} ${method} is required`);
  }
}

export async function createSealedLocalIdentityBoundMissionVessel({
  genesisAdmission,
  runtimeRoot,
  releasePin,
  routingPin,
  activationClassifier,
  nativeTransport,
  reviewExecutor = null,
  revisionExecutor = null,
  timeoutMs = 30_000,
  maximumGodskillsDispatchBytes = 1_048_576,
  maximumGodskillsCompletionBytes = 1_048_576,
  maximumGodskillsResultBytes = 1_048_576,
  maximumNativeMaterializedBytes = 1_048_576,
  clock = Date.now,
  godskillsClock = () => new Date().toISOString(),
  checkpoint = async () => {},
  lockOptions = {},
  godskillsLockOptions = {},
  artifactCache = new Map(),
  io,
} = {}) {
  if (typeof runtimeRoot !== 'string' || runtimeRoot.length === 0 || /[\0\r\n]/.test(runtimeRoot)) {
    throw new TypeError('sealed local identity-bound runtime root is required');
  }
  requireObject(genesisAdmission, 'verified genesis admission arguments');
  requireFunction(activationClassifier, 'sealed local Godskills activation classifier');
  requireTransport(nativeTransport, 'identity-bound native transport');
  requireFunction(clock, 'identity-bound mission clock');
  requireFunction(godskillsClock, 'sealed local Godskills process clock');
  requireFunction(checkpoint, 'sealed local identity-bound checkpoint');
  requireObject(lockOptions, 'identity-bound vessel lock options');
  requireObject(godskillsLockOptions, 'sealed local Godskills lock options');
  if (!(artifactCache instanceof Map)) throw new TypeError('sealed local Godskills artifact cache must be a Map');

  const root = resolve(runtimeRoot);
  const godskillsAdapter = await createLocalRecoverableGodskillsAdapter({
    admissionRoot: join(root, 'godskills'),
    releasePin,
    routingPin,
    activationClassifier,
    artifactCache,
    io,
    timeoutMs,
    maximumDispatchBytes: maximumGodskillsDispatchBytes,
    maximumCompletionBytes: maximumGodskillsCompletionBytes,
    maximumResultBytes: maximumGodskillsResultBytes,
    clock: godskillsClock,
    checkpoint,
    lockOptions: godskillsLockOptions,
  });
  const vessel = createIdentityBoundMissionVessel({
    genesisAdmission,
    vesselRoot: join(root, 'vessel-admissions'),
    journalRoot: join(root, 'mission-journals'),
    godskillsAdapter,
    nativeTransport,
    reviewExecutor,
    revisionExecutor,
    maximumNativeMaterializedBytes,
    clock,
    checkpoint,
    lockOptions,
  });
  return Object.freeze({
    run: vessel.run,
    releaseDigest: godskillsAdapter.releaseDigest,
    localExecution: Object.freeze(structuredClone(godskillsAdapter.localExecution)),
  });
}
