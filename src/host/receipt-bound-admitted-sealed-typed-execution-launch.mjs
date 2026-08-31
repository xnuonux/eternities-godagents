import { launchAdmittedSealedTypedExecutionMission } from './admitted-sealed-typed-execution-launch.mjs';
import {
  assertVerifiedReceiptBoundTypedExecutorBundle,
  verifyReceiptBoundTypedExecutorBundle,
} from '../runtime/receipt-bound-typed-executor-bundle.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const MESSAGES = Object.freeze({
  'input-invalid': 'receipt-bound admitted typed execution host input is invalid',
  'bundle-integrity': 'receipt-bound typed executor bundle integrity failed',
  'bundle-interface': 'receipt-bound typed executor bundle interface is invalid',
});

export class ReceiptBoundTypedExecutionHostError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('receipt-bound typed execution host error code is invalid');
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'ReceiptBoundTypedExecutionHostError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new ReceiptBoundTypedExecutionHostError(code, cause);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function snapshotInput(input) {
  if (!object(input)) fail('input-invalid');
  const allowed = [
    'admissionRoot', 'policyPath', 'executorBundleRoot',
    'executorBundleReceiptPath', 'request', 'env',
  ];
  if (Object.keys(input).sort().join('\0') !== [...allowed].sort().join('\0')) fail('input-invalid');
  if (typeof input.admissionRoot !== 'string' || input.admissionRoot.length === 0
      || typeof input.policyPath !== 'string' || input.policyPath.length === 0
      || typeof input.executorBundleRoot !== 'string' || input.executorBundleRoot.length === 0
      || typeof input.executorBundleReceiptPath !== 'string' || input.executorBundleReceiptPath.length === 0
      || [input.admissionRoot, input.policyPath, input.executorBundleRoot, input.executorBundleReceiptPath]
        .some((value) => /[\0\r\n]/.test(value))
      || !object(input.request) || !object(input.env)) fail('input-invalid');
  let request;
  let env;
  try {
    request = structuredClone(input.request);
    env = structuredClone(input.env);
  } catch (error) {
    fail('input-invalid', error);
  }
  const bundlePin = env.GODAGENT_TYPED_EXECUTOR_BUNDLE_SHA256?.toLowerCase();
  if (!DIGEST.test(bundlePin ?? '')) fail('input-invalid');
  return Object.freeze({
    admissionRoot: input.admissionRoot,
    policyPath: input.policyPath,
    executorBundleRoot: input.executorBundleRoot,
    executorBundleReceiptPath: input.executorBundleReceiptPath,
    request,
    env,
    bundlePin,
  });
}

export async function launchReceiptBoundAdmittedSealedTypedExecutionMission(input = {}) {
  const options = snapshotInput(input);
  let bundle;
  try {
    bundle = await verifyReceiptBoundTypedExecutorBundle({
      repositoryRoot: options.executorBundleRoot,
      receiptPath: options.executorBundleReceiptPath,
      expectedSha256: options.bundlePin,
    });
  } catch (error) {
    fail('bundle-integrity', error);
  }
  try {
    assertVerifiedReceiptBoundTypedExecutorBundle(bundle);
  } catch (error) {
    fail('bundle-interface', error);
  }
  return launchAdmittedSealedTypedExecutionMission({
    admissionRoot: options.admissionRoot,
    policyPath: options.policyPath,
    request: options.request,
    env: options.env,
    executors: bundle.executors,
  });
}
