import { timingSafeEqual } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { verifyTypedCapabilityExecutorDescriptor } from '../host/admitted-typed-execution-contracts.mjs';

const PROTOCOL_ID = 'eternities-receipt-bound-typed-executor-bundle-v1';
const IDENTITY_PROTOCOL_ID = 'eternities-receipt-bound-typed-executor-program-identity-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const verifiedBundles = new WeakSet();
const verifiedPrograms = new WeakMap();

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!object(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sameDigest(left, right) {
  return DIGEST.test(left ?? '') && DIGEST.test(right ?? '')
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function requireRelativePath(value, label) {
  const parts = typeof value === 'string' ? value.split('/') : [];
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)
      || value.includes('\\') || /[\0\r\n?#]/.test(value)
      || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new TypeError(`${label} must be a canonical repository-relative path`);
  }
}

function requireContained(root, target, label) {
  const remainder = relative(root, target);
  if (remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder))) return;
  throw new Error(`${label} escaped the executor bundle root`);
}

function pathIdentity(value) {
  const absolute = resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

async function canonicalRoot(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0 || /[\0\r\n]/.test(repositoryRoot)) {
    throw new TypeError('executor bundle repository root is invalid');
  }
  const lexical = resolve(repositoryRoot);
  const stat = await lstat(lexical);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('executor bundle repository root is not a real directory');
  }
  const actual = await realpath(lexical);
  if (pathIdentity(actual) !== pathIdentity(lexical)) {
    throw new Error('executor bundle repository root is a non-canonical alias');
  }
  return actual;
}

async function readCanonicalFile(root, path, label) {
  requireRelativePath(path, `${label} path`);
  const lexical = resolve(root, ...path.split('/'));
  requireContained(root, lexical, label);
  const stat = await lstat(lexical);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is not a real file`);
  const actual = await realpath(lexical);
  requireContained(root, actual, label);
  if (pathIdentity(actual) !== pathIdentity(lexical)) {
    throw new Error(`${label} is a symlink or non-canonical alias`);
  }
  return readFile(actual);
}

function parseCanonicalReceipt(bytes) {
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error('executor bundle receipt is invalid JSON', { cause: error });
  }
  if (bytes.toString('utf8') !== `${canonicalJson(receipt)}\n`) {
    throw new Error('executor bundle receipt is not canonical JSON');
  }
  return receipt;
}

function expectedExecutorId(bundleId, capabilityId, programSha256) {
  return sha256Value({
    protocolId: IDENTITY_PROTOCOL_ID,
    bundleId,
    capabilityId,
    programSha256,
  });
}

function assertSafeObjectKeys(value, label) {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    nodes += 1;
    if (nodes > 512 || current.depth > 16) {
      throw new Error(`${label} output template exceeds structural limits`);
    }
    if (!current.value || typeof current.value !== 'object') continue;
    if (!Array.isArray(current.value)
        && Object.keys(current.value).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
      throw new Error(`${label} contains a forbidden object key`);
    }
    for (const child of Object.values(current.value)) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
}

function parseCanonicalProgram(bytes, capabilityId, label) {
  let program;
  try {
    program = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON`, { cause: error });
  }
  assertSafeObjectKeys(program, label);
  if (bytes.toString('utf8') !== `${canonicalJson(program)}\n`) {
    throw new Error(`${label} is not canonical JSON`);
  }
  assertNoCredentialFields(program);
  exactKeys(program, [
    'schemaVersion', 'protocolId', 'capabilityId', 'delayMs', 'outputTemplate',
  ], label);
  if (program.schemaVersion !== 1
      || program.protocolId !== 'eternities-declarative-typed-executor-program-v1'
      || program.capabilityId !== capabilityId
      || !Number.isInteger(program.delayMs) || program.delayMs < 0 || program.delayMs > 5_000) {
    throw new Error(`${label} identity or delay is invalid`);
  }
  exactKeys(program.outputTemplate, ['schemaVersion', 'capabilityId', 'missionId', 'slots'], `${label} output template`);
  if (program.outputTemplate.schemaVersion !== 1
      || program.outputTemplate.capabilityId !== capabilityId
      || canonicalJson(program.outputTemplate.missionId) !== canonicalJson({ $input: 'missionId' })
      || !object(program.outputTemplate.slots)) {
    throw new Error(`${label} output template is invalid`);
  }
  let nodes = 0;
  const inspect = (value, depth = 0) => {
    nodes += 1;
    if (nodes > 512 || depth > 16) throw new Error(`${label} output template exceeds structural limits`);
    if (Array.isArray(value)) {
      value.forEach((child) => inspect(child, depth + 1));
      return;
    }
    if (!object(value)) return;
    if (Object.hasOwn(value, '$input')) {
      if (canonicalJson(value) !== canonicalJson({ $input: 'missionId' })) {
        throw new Error(`${label} contains an unsupported input projection`);
      }
      return;
    }
    Object.values(value).forEach((child) => inspect(child, depth + 1));
  };
  inspect(program.outputTemplate);
  return deepFreeze(program);
}

function materializeTemplate(value, input) {
  if (Array.isArray(value)) return value.map((child) => materializeTemplate(child, input));
  if (!object(value)) return value;
  if (Object.hasOwn(value, '$input')) return input.missionId;
  return Object.fromEntries(
    Object.entries(value).map(([name, child]) => [name, materializeTemplate(child, input)]),
  );
}

function compileVerifiedExecutor(program, label) {
  return async (input) => {
    if (!object(input) || typeof input.missionId !== 'string' || input.missionId.length === 0) {
      throw new Error(`${label} input mission identity is invalid`);
    }
    if (program.delayMs > 0) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, program.delayMs));
    }
    return materializeTemplate(program.outputTemplate, input);
  };
}

function verifyReceipt(receipt) {
  exactKeys(receipt, [
    'schemaVersion', 'protocolId', 'bundleId', 'status', 'executors',
    'proofLimits', 'receiptDigest',
  ], 'executor bundle receipt');
  if (receipt.schemaVersion !== 1 || receipt.protocolId !== PROTOCOL_ID
      || receipt.status !== 'verified-build' || !IDENTIFIER.test(receipt.bundleId)) {
    throw new Error('executor bundle receipt identity is invalid');
  }
  if (!Array.isArray(receipt.executors) || receipt.executors.length < 1 || receipt.executors.length > 3) {
    throw new Error('executor bundle receipt executor set is invalid');
  }
  const capabilities = receipt.executors.map(({ capabilityId }) => capabilityId);
  if (canonicalJson(capabilities) !== canonicalJson([...capabilities].sort())
      || new Set(capabilities).size !== capabilities.length) {
    throw new Error('executor bundle capabilities must be sorted and unique');
  }
  if (!Array.isArray(receipt.proofLimits) || receipt.proofLimits.length < 1
      || receipt.proofLimits.some((value) => typeof value !== 'string' || value.length === 0)
      || new Set(receipt.proofLimits).size !== receipt.proofLimits.length) {
    throw new Error('executor bundle proof limits are invalid');
  }
  const { receiptDigest, ...unsigned } = receipt;
  if (!sameDigest(receiptDigest, sha256Value(unsigned))) {
    throw new Error('executor bundle receipt digest mismatch');
  }
}

export function assertVerifiedReceiptBoundTypedExecutorBundle(value) {
  if (!object(value) || !verifiedBundles.has(value)) {
    throw new TypeError('executor bundle lacks verified provenance brand');
  }
  return value;
}

export async function verifyReceiptBoundTypedExecutorBundle(input = {}) {
  exactKeys(input, ['repositoryRoot', 'receiptPath', 'expectedSha256'], 'executor bundle input');
  requireRelativePath(input.receiptPath, 'executor bundle receipt');
  if (!DIGEST.test(input.expectedSha256 ?? '')) {
    throw new TypeError('executor bundle expected receipt digest is invalid');
  }
  const root = await canonicalRoot(input.repositoryRoot);
  const receiptBytes = await readCanonicalFile(root, input.receiptPath, 'executor bundle receipt');
  if (!sameDigest(sha256Text(receiptBytes), input.expectedSha256)) {
    throw new Error('executor bundle receipt file digest mismatch');
  }
  const receipt = parseCanonicalReceipt(receiptBytes);
  verifyReceipt(receipt);
  const paths = new Set();
  const descriptors = [];
  const programs = [];
  for (const row of receipt.executors) {
    exactKeys(row, ['capabilityId', 'program', 'descriptor'], 'executor bundle row');
    if (!IDENTIFIER.test(row.capabilityId)) throw new Error('executor bundle capability identity is invalid');
    exactKeys(row.program, ['path', 'sha256', 'bytes'], 'executor bundle program');
    requireRelativePath(row.program.path, 'executor bundle program');
    if (row.program.path !== `executors/${row.capabilityId}.json` || paths.has(row.program.path)) {
      throw new Error('executor bundle program path is invalid or duplicated');
    }
    paths.add(row.program.path);
    if (!DIGEST.test(row.program.sha256) || !Number.isInteger(row.program.bytes)
        || row.program.bytes < 1 || row.program.bytes > 1_048_576) {
      throw new Error('executor bundle program descriptor is invalid');
    }
    const descriptor = verifyTypedCapabilityExecutorDescriptor(row.descriptor);
    if (descriptor.capabilityId !== row.capabilityId
        || descriptor.executorId !== expectedExecutorId(receipt.bundleId, row.capabilityId, row.program.sha256)) {
      throw new Error('executor bundle executor identity mismatch');
    }
    const programBytes = await readCanonicalFile(root, row.program.path, `executor program ${row.capabilityId}`);
    if (programBytes.length !== row.program.bytes) throw new Error('executor bundle program byte count mismatch');
    if (!sameDigest(sha256Text(programBytes), row.program.sha256)) {
      throw new Error('executor bundle program digest mismatch');
    }
    const program = parseCanonicalProgram(programBytes, row.capabilityId, `executor program ${row.capabilityId}`);
    descriptors.push(descriptor);
    programs.push(program);
  }
  const bundle = deepFreeze({
    protocolId: PROTOCOL_ID,
    bundleId: receipt.bundleId,
    receiptDigest: receipt.receiptDigest,
    receiptSha256: input.expectedSha256,
    descriptors,
    proofLimits: structuredClone(receipt.proofLimits),
  });
  verifiedBundles.add(bundle);
  verifiedPrograms.set(bundle, programs);
  return bundle;
}

export async function instantiateVerifiedReceiptBoundTypedExecutors(input = {}) {
  exactKeys(input, ['bundle', 'expectedDescriptors'], 'executor bundle instantiation input');
  const bundle = assertVerifiedReceiptBoundTypedExecutorBundle(input.bundle);
  if (!Array.isArray(input.expectedDescriptors)) {
    throw new TypeError('executor bundle expected descriptors are invalid');
  }
  const expected = input.expectedDescriptors.map((value) => verifyTypedCapabilityExecutorDescriptor(value));
  if (canonicalJson(expected) !== canonicalJson(bundle.descriptors)) {
    throw new Error('executor bundle descriptors are not authorized by admitted policy');
  }
  const programs = verifiedPrograms.get(bundle);
  if (!programs || programs.length !== bundle.descriptors.length) {
    throw new Error('executor bundle verified programs are unavailable');
  }
  const executors = [];
  for (let index = 0; index < programs.length; index += 1) {
    const descriptor = bundle.descriptors[index];
    const execute = compileVerifiedExecutor(programs[index], `executor program ${descriptor.capabilityId}`);
    executors.push(Object.freeze({ descriptor: () => descriptor, execute }));
  }
  return Object.freeze(executors);
}
