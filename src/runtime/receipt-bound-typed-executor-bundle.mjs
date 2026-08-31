import { timingSafeEqual } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { parse } from 'acorn';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { verifyTypedCapabilityExecutorDescriptor } from '../host/admitted-typed-execution-contracts.mjs';

const PROTOCOL_ID = 'eternities-receipt-bound-typed-executor-bundle-v1';
const IDENTITY_PROTOCOL_ID = 'eternities-receipt-bound-typed-executor-identity-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const verifiedBundles = new WeakSet();
const verifiedModuleBytes = new WeakMap();

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

function expectedExecutorId(bundleId, capabilityId, moduleSha256) {
  return sha256Value({
    protocolId: IDENTITY_PROTOCOL_ID,
    bundleId,
    capabilityId,
    moduleSha256,
  });
}

function assertClosedModuleSource(bytes, label) {
  let program;
  try {
    program = parse(bytes.toString('utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (error) {
    throw new Error(`${label} is not valid ECMAScript`, { cause: error });
  }
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ImportDeclaration' || node.type === 'ImportExpression'
        || (node.type === 'ExportNamedDeclaration' && node.source !== null)
        || node.type === 'ExportAllDeclaration'
        || (node.type === 'CallExpression' && (
          (node.callee?.type === 'Identifier' && node.callee.name === 'require')
          || (node.callee?.type === 'MemberExpression' && node.callee.computed === false
            && node.callee.object?.type === 'Identifier' && node.callee.object.name === 'module'
            && node.callee.property?.type === 'Identifier' && node.callee.property.name === 'require')
        ))) throw new Error(`${label} dependencies are forbidden`);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(program);
  const exported = program.body[0];
  const declaration = exported?.declaration;
  if (program.body.length !== 1 || exported.type !== 'ExportNamedDeclaration'
      || exported.source !== null || exported.specifiers.length !== 0
      || declaration?.type !== 'FunctionDeclaration' || declaration.id?.name !== 'execute'
      || declaration.async !== true || declaration.generator !== false
      || declaration.params.length !== 1 || declaration.params[0]?.type !== 'Identifier'
      || declaration.params[0].name !== 'input') {
    throw new Error(`${label} must contain only one async execute declaration`);
  }
}

async function importVerifiedModule(bytes, { digest, bundleId, capabilityId }, label) {
  assertClosedModuleSource(bytes, label);
  const identity = new URLSearchParams({ bundleId, capabilityId, sha256: digest });
  const url = `data:text/javascript;base64,${bytes.toString('base64')}#${identity}`;
  let namespace;
  try {
    namespace = await import(url);
  } catch (error) {
    throw new Error(`${label} could not be imported`, { cause: error });
  }
  if (canonicalJson(Object.keys(namespace).sort()) !== canonicalJson(['execute'])
      || typeof namespace.execute !== 'function'
      || namespace.execute.constructor?.name !== 'AsyncFunction') {
    throw new Error(`${label} must export exactly one async execute function`);
  }
  return namespace.execute;
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
  const modules = [];
  for (const row of receipt.executors) {
    exactKeys(row, ['capabilityId', 'module', 'descriptor'], 'executor bundle row');
    if (!IDENTIFIER.test(row.capabilityId)) throw new Error('executor bundle capability identity is invalid');
    exactKeys(row.module, ['path', 'sha256', 'bytes'], 'executor bundle module');
    requireRelativePath(row.module.path, 'executor bundle module');
    if (row.module.path !== `executors/${row.capabilityId}.mjs` || paths.has(row.module.path)) {
      throw new Error('executor bundle module path is invalid or duplicated');
    }
    paths.add(row.module.path);
    if (!DIGEST.test(row.module.sha256) || !Number.isInteger(row.module.bytes) || row.module.bytes < 1) {
      throw new Error('executor bundle module descriptor is invalid');
    }
    const descriptor = verifyTypedCapabilityExecutorDescriptor(row.descriptor);
    if (descriptor.capabilityId !== row.capabilityId
        || descriptor.executorId !== expectedExecutorId(receipt.bundleId, row.capabilityId, row.module.sha256)) {
      throw new Error('executor bundle executor identity mismatch');
    }
    const moduleBytes = await readCanonicalFile(root, row.module.path, `executor module ${row.capabilityId}`);
    if (moduleBytes.length !== row.module.bytes) throw new Error('executor bundle module byte count mismatch');
    if (!sameDigest(sha256Text(moduleBytes), row.module.sha256)) {
      throw new Error('executor bundle module digest mismatch');
    }
    assertClosedModuleSource(moduleBytes, `executor module ${row.capabilityId}`);
    descriptors.push(descriptor);
    modules.push(Object.freeze({
      capabilityId: row.capabilityId,
      digest: row.module.sha256,
      bytes: Buffer.from(moduleBytes),
    }));
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
  verifiedModuleBytes.set(bundle, modules);
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
  const modules = verifiedModuleBytes.get(bundle);
  if (!modules || modules.length !== bundle.descriptors.length) {
    throw new Error('executor bundle verified module bytes are unavailable');
  }
  const executors = [];
  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];
    const descriptor = bundle.descriptors[index];
    const execute = await importVerifiedModule(module.bytes, {
      digest: module.digest,
      bundleId: bundle.bundleId,
      capabilityId: module.capabilityId,
    }, `executor module ${module.capabilityId}`);
    executors.push(Object.freeze({ descriptor: () => descriptor, execute }));
  }
  return Object.freeze(executors);
}
