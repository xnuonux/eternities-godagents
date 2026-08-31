import { join, resolve } from 'node:path';

import { createLocalRecoverableGodskillsProcessTransport } from './local-recoverable-godskills-process-transport.mjs';
import { createRecoverableGodskillsAdapter } from './recoverable-godskills-adapter.mjs';
import { verifyGodskillsRoutingExecutable } from './routing-executable-verifier.mjs';

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

  const verification = await verifyGodskillsRoutingExecutable({
    releasePin,
    routingPin,
    artifactCache,
    io,
  });
  if (!verification.release.activation) {
    throw new Error('local recoverable Godskills verified activation root is required');
  }
  const root = resolve(admissionRoot);
  const terminalRoot = join(root, 'local-process-terminal');
  const processOptions = {
    verification,
    terminalRoot,
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
  const adapter = await createRecoverableGodskillsAdapter({
    admissionRoot: root,
    releasePin,
    routingTransport,
    activationClassifier,
    activationTransport,
    artifactCache,
    io,
    checkpoint,
    lockOptions,
  });
  const routeDescriptor = routingTransport.descriptor();
  const activationDescriptor = activationTransport.descriptor();
  return Object.freeze({
    ...adapter,
    localExecution: Object.freeze({
      routingTrustRootDigest: verification.routing.trustRootDigest,
      activationTrustRootDigest: verification.release.activation.trustRootDigest,
      routeMode: routingTransport.mode,
      routeDescriptorDigest: routeDescriptor.descriptorDigest,
      activationDescriptorDigest: activationDescriptor.descriptorDigest,
    }),
  });
}
