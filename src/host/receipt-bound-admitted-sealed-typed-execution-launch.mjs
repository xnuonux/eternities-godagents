import { timingSafeEqual } from 'node:crypto';
import { join, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { verifyGenesisAdmission } from '../genesis/verify.mjs';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';
import { launchAdmittedSealedTypedExecutionMission } from './admitted-sealed-typed-execution-launch.mjs';
import {
  assertAdmissionPolicyBinding,
  assertSafeAdmissionTree,
  readAdmissionBinding,
} from './admitted-identity-boundary.mjs';
import { loadAdmittedTypedExecutionPolicy } from './admitted-typed-execution-policy.mjs';
import {
  assertVerifiedReceiptBoundTypedExecutorBundle,
  instantiateVerifiedReceiptBoundTypedExecutors,
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

function sameDigest(left, right) {
  return DIGEST.test(left ?? '') && DIGEST.test(right ?? '')
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

async function authorizeBundleDescriptors(options, bundle) {
  const root = resolve(options.admissionRoot);
  const policyPath = resolve(options.policyPath);
  let binding;
  let loaded;
  try {
    await assertSafeAdmissionTree(root);
    binding = await readAdmissionBinding(root);
    loaded = await loadAdmittedTypedExecutionPolicy(policyPath);
    const policyPin = options.env.GODAGENT_TYPED_EXECUTION_POLICY_SHA256?.toLowerCase();
    if (!sameDigest(policyPin, loaded.digest)) throw new Error('typed execution policy pin mismatch');
    assertAdmissionPolicyBinding({ policy: loaded.policy, policyPath, admissionRoot: root, binding });
    const verifiedAdmission = await verifyGenesisAdmission({
      receiptPath: join(root, 'transaction', 'genesis-receipt.json'),
      creationDir: join(root, 'creation'),
      distributionDir: join(root, 'distribution'),
      expectedPolicyDigest: binding.policyDigest,
      expectedCreationBuildId: binding.creationBuildId,
      instanceId: binding.instanceId,
      creatorRef: binding.creatorRef,
      transactionDir: join(root, 'transaction'),
      journalPath: join(root, 'vessel', 'journal.jsonl'),
      snapshotPath: join(root, 'vessel', 'snapshot.json'),
      keelAdapter: createLocalKeelBackend({ root: join(root, 'keels') }),
    });
    if (loaded.policy.realmId !== verifiedAdmission.distributionSnapshot.realmContract.realmId) {
      throw new Error('typed execution policy Realm mismatch');
    }
    if (canonicalJson(loaded.policy.runtime.executors) !== canonicalJson(bundle.descriptors)) {
      throw new Error('typed execution policy does not authorize executor bundle descriptors');
    }
  } catch (error) {
    fail('bundle-interface', error);
  }
  return loaded.policy.runtime.executors;
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
  const expectedDescriptors = await authorizeBundleDescriptors(options, bundle);
  let executors;
  try {
    executors = await instantiateVerifiedReceiptBoundTypedExecutors({ bundle, expectedDescriptors });
  } catch (error) {
    fail('bundle-interface', error);
  }
  return launchAdmittedSealedTypedExecutionMission({
    admissionRoot: options.admissionRoot,
    policyPath: options.policyPath,
    request: options.request,
    env: options.env,
    executors,
  });
}
