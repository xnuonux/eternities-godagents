import { join, resolve } from 'node:path';

import { createLocalRecoverableGodskillsProcessTransport } from './local-recoverable-godskills-process-transport.mjs';
import { createRecoverableGodskillsAdapter } from './recoverable-godskills-adapter.mjs';
import { verifyGodskillsRoutingExecutable } from './routing-executable-verifier.mjs';

const LOCAL_PROCESS_BUNDLES = new WeakSet();

export function assertVerifiedLocalGodskillsProcessTransports(value) {
  if (!value || typeof value !== 'object' || !LOCAL_PROCESS_BUNDLES.has(value)) {
    throw new TypeError('local Godskills process transport bundle lacks verified provenance brand');
  }
  return value;
}

export async function createVerifiedLocalGodskillsProcessTransports({
  terminalRoot,
  releasePin,
  routingPin,
  artifactCache = new Map(),
  io,
  timeoutMs = 30_000,
  maximumDispatchBytes = 1_048_576,
  maximumCompletionBytes = 1_048_576,
  maximumResultBytes = 1_048_576,
  clock = () => new Date().toISOString(),
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof terminalRoot !== 'string' || terminalRoot.length === 0 || /[\0\r\n]/.test(terminalRoot)) {
    throw new TypeError('local Godskills process terminal root is required');
  }
  if (!(artifactCache instanceof Map)) throw new TypeError('local Godskills artifact cache must be a Map');
  const verification = await verifyGodskillsRoutingExecutable({
    releasePin,
    routingPin,
    artifactCache,
    io,
  });
  if (!verification.release.activation) {
    throw new Error('local recoverable Godskills verified activation root is required');
  }
  const processOptions = {
    verification,
    terminalRoot: resolve(terminalRoot),
    timeoutMs,
    maximumDispatchBytes,
    maximumCompletionBytes,
    maximumResultBytes,
    clock,
    checkpoint,
    lockOptions,
  };
  const [routingTransport, activationTransport] = await Promise.all([
    createLocalRecoverableGodskillsProcessTransport({ ...processOptions, stage: 'route' }),
    createLocalRecoverableGodskillsProcessTransport({ ...processOptions, stage: 'activation' }),
  ]);
  const routeDescriptor = routingTransport.descriptor();
  const activationDescriptor = activationTransport.descriptor();
  const bundle = Object.freeze({
    routingTransport,
    activationTransport,
    localExecution: Object.freeze({
      routingTrustRootDigest: verification.routing.trustRootDigest,
      activationTrustRootDigest: verification.release.activation.trustRootDigest,
      routeMode: routingTransport.mode,
      routeDescriptorDigest: routeDescriptor.descriptorDigest,
      activationDescriptorDigest: activationDescriptor.descriptorDigest,
    }),
  });
  LOCAL_PROCESS_BUNDLES.add(bundle);
  return bundle;
}

export async function createLocalRecoverableGodskillsAdapter({
  admissionRoot,
  releasePin,
  routingPin,
  activationClassifier,
  artifactCache = new Map(),
  io,
  timeoutMs = 30_000,
  maximumDispatchBytes = 1_048_576,
  maximumCompletionBytes = 1_048_576,
  maximumResultBytes = 1_048_576,
  clock = () => new Date().toISOString(),
  checkpoint = async () => {},
  lockOptions = {},
} = {}) {
  if (typeof admissionRoot !== 'string' || admissionRoot.length === 0 || /[\0\r\n]/.test(admissionRoot)) {
    throw new TypeError('local recoverable Godskills admission root is required');
  }
  if (typeof activationClassifier !== 'function') {
    throw new TypeError('local recoverable Godskills activation classifier is required');
  }
  if (!(artifactCache instanceof Map)) throw new TypeError('local recoverable Godskills artifact cache must be a Map');

  const root = resolve(admissionRoot);
  const bundle = await createVerifiedLocalGodskillsProcessTransports({
    terminalRoot: join(root, 'local-process-terminal'),
    releasePin,
    routingPin,
    artifactCache,
    io,
    timeoutMs,
    maximumDispatchBytes,
    maximumCompletionBytes,
    maximumResultBytes,
    clock,
    checkpoint,
    lockOptions,
  });
  const adapter = await createRecoverableGodskillsAdapter({
    admissionRoot: root,
    releasePin,
    routingTransport: bundle.routingTransport,
    activationClassifier,
    activationTransport: bundle.activationTransport,
    artifactCache,
    io,
    checkpoint,
    lockOptions,
  });
  return Object.freeze({
    ...adapter,
    localExecution: Object.freeze(structuredClone(bundle.localExecution)),
  });
}
