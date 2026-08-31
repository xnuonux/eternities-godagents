import { createHash } from 'node:crypto';
import { readFile as nativeReadFile, realpath as nativeRealpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyGodskillsRelease } from './release-verifier.mjs';

const PROTOCOL_ID = 'eternities-godskills-routing-executable-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const MODES = Object.freeze([
  Object.freeze({ mode: 'default', entrypoint: 'scripts/intent.mjs' }),
  Object.freeze({ mode: 'specialist', entrypoint: 'scripts/intent-preference.mjs' }),
]);
const ROUTING_ARTIFACTS = Object.freeze([
  Object.freeze({ role: 'cards', path: 'artifacts/routing/cards.jsonl', format: 'jsonl' }),
  Object.freeze({ role: 'family-map', path: 'artifacts/routing/family-map.json', format: 'json' }),
  Object.freeze({ role: 'manifest', path: 'artifacts/routing/manifest.json', format: 'json' }),
]);
const PARENTS = Object.freeze([
  Object.freeze({ role: 'godskills-system', path: 'receipts/godskills-system-certification-v3.json', identityField: 'id', identity: 'eternities-godskills-system-v3', status: 'certified' }),
  Object.freeze({ role: 'intent-compiler', path: 'receipts/intent-compiler-v3.json', identityField: 'id', identity: 'intent-compiler-v3', status: 'certified' }),
  Object.freeze({ role: 'portable-capabilities', path: 'receipts/portable-capability-manifest-v1.json', identityField: 'receiptId', identity: 'portable-capability-manifest-v1', status: 'certified-local-artifacts', digestAlgorithm: 'json-insertion-order-v1' }),
  Object.freeze({ role: 'router', path: 'receipts/agent-native-router-v8.json', identityField: 'id', identity: 'agent-native-router-v8', status: 'certified' }),
  Object.freeze({ role: 'specialist-preference', path: 'receipts/specialist-preference-routing-v1.json', identityField: 'id', identity: 'specialist-preference-routing-v1', status: 'verified-structural-protocol', digestAlgorithm: 'canonical-json-v1' }),
]);
const verifiedRoots = new WeakSet();

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error(`${label} fields are invalid`);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
}

function requireRelativePath(value, label) {
  const parts = typeof value === 'string' ? value.split('/') : [];
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)
      || value.includes('\\') || /[\0\r\n?#]/.test(value)
      || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`${label} must be a canonical repository-relative path`);
  }
}

function requireContained(root, target, label) {
  const remainder = relative(root, target);
  if (remainder === '' || (!remainder.startsWith('..') && !isAbsolute(remainder))) return;
  throw new Error(`${label} escaped the Godskills repository`);
}

function pathIdentity(value) {
  const absolute = resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON`, { cause: error });
  }
}

function parseJsonl(bytes, label) {
  const text = bytes.toString('utf8').trim();
  if (text === '') return [];
  return text.split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${label} line ${index + 1} is invalid JSON`, { cause: error });
    }
  });
}

function verifyReceiptDigest(value, expected, label, algorithm = 'canonical-json-v1') {
  requireDigest(value?.receiptDigest, `${label} receipt digest`);
  const unsigned = structuredClone(value);
  delete unsigned.receiptDigest;
  const actual = algorithm === 'canonical-json-v1'
    ? sha256Value(unsigned)
    : algorithm === 'json-insertion-order-v1'
      ? sha256(JSON.stringify(unsigned))
      : null;
  if (actual === null) throw new Error(`${label} receipt digest algorithm is unsupported`);
  if (actual !== value.receiptDigest || value.receiptDigest !== expected) {
    throw new Error(`${label} receipt digest mismatch`);
  }
}

async function createReader(rootValue, io) {
  const fs = {
    readFile: io.readFile ?? nativeReadFile,
    realpath: io.realpath ?? nativeRealpath,
  };
  const root = await fs.realpath(resolve(rootValue));
  return {
    root,
    async read(reference, label) {
      requireRelativePath(reference.path, `${label} path`);
      requireDigest(reference.sha256, `${label} file digest`);
      const lexical = resolve(root, ...reference.path.split('/'));
      requireContained(root, lexical, label);
      const actual = await fs.realpath(lexical);
      requireContained(root, actual, label);
      if (pathIdentity(actual) !== pathIdentity(lexical)) {
        throw new Error(`${label} is a symlink or non-canonical alias`);
      }
      const bytes = await fs.readFile(actual);
      if (sha256(bytes) !== reference.sha256) throw new Error(`${label} file digest mismatch`);
      if (reference.bytes !== undefined && bytes.length !== reference.bytes) {
        throw new Error(`${label} byte count mismatch`);
      }
      return { bytes, actual };
    },
  };
}

function validatePin(pin) {
  exactKeys(pin, ['protocolId', 'executableReceipt', 'entrypoint'], 'Godskills routing executable pin');
  if (pin.protocolId !== PROTOCOL_ID) throw new Error('Godskills routing executable protocol is unsupported');
  exactKeys(pin.executableReceipt, ['path', 'sha256', 'receiptDigest'], 'Godskills routing executable receipt pin');
  exactKeys(pin.entrypoint, ['path', 'sha256'], 'Godskills routing executable entrypoint pin');
  requireRelativePath(pin.executableReceipt.path, 'Godskills routing executable receipt pin path');
  requireRelativePath(pin.entrypoint.path, 'Godskills routing executable entrypoint pin path');
  requireDigest(pin.executableReceipt.sha256, 'Godskills routing executable receipt file digest');
  requireDigest(pin.executableReceipt.receiptDigest, 'Godskills routing executable receipt logical digest');
  requireDigest(pin.entrypoint.sha256, 'Godskills routing executable entrypoint digest');
  if (pin.executableReceipt.path !== 'receipts/routing-executable-v1.json'
      || pin.entrypoint.path !== 'scripts/routing.mjs') {
    throw new Error('Godskills routing executable pin paths are unsupported');
  }
  return pin;
}

async function verifyModules(reader, receipt, pin) {
  exactKeys(receipt.dependencyClosure, ['roots', 'localModules', 'complete'], 'Godskills routing dependency closure');
  if (receipt.dependencyClosure.complete !== true
      || canonicalJson(receipt.dependencyClosure.roots) !== canonicalJson(['scripts/routing.mjs'])) {
    throw new Error('Godskills routing dependency closure root is invalid');
  }
  if (!Array.isArray(receipt.artifacts) || receipt.artifacts.length < 1 || receipt.artifacts.length > 64) {
    throw new Error('Godskills routing executable artifacts are invalid');
  }
  const paths = receipt.artifacts.map(({ path }) => path);
  if (new Set(paths).size !== paths.length || canonicalJson(paths) !== canonicalJson([...paths].sort())) {
    throw new Error('Godskills routing executable artifacts must be unique and ordered');
  }
  if (canonicalJson(receipt.dependencyClosure.localModules) !== canonicalJson(paths)) {
    throw new Error('Godskills routing executable closure differs from its artifacts');
  }
  let entrypoint;
  for (const row of receipt.artifacts) {
    exactKeys(row, ['role', 'path', 'sha256', 'bytes'], 'Godskills routing executable artifact');
    if (!['entrypoint', 'dependency'].includes(row.role) || !Number.isInteger(row.bytes) || row.bytes < 1) {
      throw new Error('Godskills routing executable artifact row is invalid');
    }
    const bound = await reader.read(row, `Godskills routing executable artifact ${row.path}`);
    if (row.role === 'entrypoint') {
      if (entrypoint) throw new Error('Godskills routing executable has multiple entrypoints');
      entrypoint = { ...row, absolutePath: bound.actual.replaceAll('\\', '/') };
    }
  }
  if (!entrypoint || entrypoint.path !== pin.entrypoint.path || entrypoint.sha256 !== pin.entrypoint.sha256) {
    throw new Error('Godskills routing executable entrypoint binding mismatch');
  }
  return { entrypoint, paths };
}

async function verifyRoutingArtifacts(reader, rows) {
  if (!Array.isArray(rows) || rows.length !== ROUTING_ARTIFACTS.length) {
    throw new Error('Godskills routing artifacts are incomplete');
  }
  for (let index = 0; index < ROUTING_ARTIFACTS.length; index += 1) {
    const expected = ROUTING_ARTIFACTS[index];
    const row = rows[index];
    exactKeys(row, ['role', 'path', 'sha256', 'bytes', 'logicalDigest'], 'Godskills routing artifact');
    if (row.role !== expected.role || row.path !== expected.path
        || !Number.isInteger(row.bytes) || row.bytes < 1) {
      throw new Error('Godskills routing artifact identity is invalid');
    }
    requireDigest(row.logicalDigest, 'Godskills routing artifact logical digest');
    const { bytes } = await reader.read(row, `Godskills routing artifact ${row.role}`);
    const parsed = expected.format === 'json' ? parseJson(bytes, row.path) : parseJsonl(bytes, row.path);
    if (sha256Value(parsed) !== row.logicalDigest) throw new Error('Godskills routing artifact logical digest mismatch');
  }
}

async function verifyParents(reader, rows, release) {
  if (!Array.isArray(rows) || rows.length !== PARENTS.length) {
    throw new Error('Godskills routing executable parents are incomplete');
  }
  const releaseReferences = new Map([
    ['godskills-system', release.pin.systemReceipt],
    ['intent-compiler', release.pin.compilerReceipt],
    ['portable-capabilities', release.pin.portableReceipt],
    ['router', release.pin.routerReceipt],
  ]);
  for (let index = 0; index < PARENTS.length; index += 1) {
    const expected = PARENTS[index];
    const row = rows[index];
    const hasReceiptDigest = expected.digestAlgorithm !== undefined;
    exactKeys(row, hasReceiptDigest
      ? ['role', 'path', 'sha256', 'bytes', 'logicalDigest', 'identity', 'status', 'receiptDigest', 'receiptDigestAlgorithm']
      : ['role', 'path', 'sha256', 'bytes', 'logicalDigest', 'identity', 'status'],
    'Godskills routing executable parent');
    if (row.role !== expected.role || row.path !== expected.path
        || row.identity !== expected.identity || row.status !== expected.status
        || !Number.isInteger(row.bytes) || row.bytes < 1) {
      throw new Error('Godskills routing executable parent identity is invalid');
    }
    requireDigest(row.logicalDigest, 'Godskills routing executable parent logical digest');
    const pinned = releaseReferences.get(row.role);
    if (pinned && (pinned.path !== row.path || pinned.sha256 !== row.sha256)) {
      throw new Error('Godskills routing executable parent differs from the verified release');
    }
    if (row.role === 'specialist-preference' && release.preference
        && (release.preference.releaseReceipt.path !== row.path
          || release.preference.releaseReceipt.sha256 !== row.sha256)) {
      throw new Error('Godskills routing preference parent differs from the verified release');
    }
    const { bytes } = await reader.read(row, `Godskills routing executable parent ${row.role}`);
    const value = parseJson(bytes, row.path);
    if (value?.schemaVersion !== 1 || value?.[expected.identityField] !== expected.identity
        || value?.status !== expected.status || sha256Value(value) !== row.logicalDigest) {
      throw new Error('Godskills routing executable parent content mismatch');
    }
    if (hasReceiptDigest) {
      if (row.receiptDigestAlgorithm !== expected.digestAlgorithm) {
        throw new Error('Godskills routing executable parent digest algorithm mismatch');
      }
      verifyReceiptDigest(value, row.receiptDigest, `Godskills routing parent ${row.role}`, expected.digestAlgorithm);
    }
  }
}

export function assertVerifiedGodskillsRoutingExecutable(value) {
  if (!value || typeof value !== 'object' || !verifiedRoots.has(value)) {
    throw new TypeError('Godskills routing executable lacks verified provenance brand');
  }
  return value;
}

export async function verifyGodskillsRoutingExecutable({
  releasePin,
  routingPin: inputPin,
  artifactCache = new Map(),
  io = {},
} = {}) {
  const pin = validatePin(structuredClone(inputPin));
  const release = await verifyGodskillsRelease(releasePin, { artifactCache, io });
  const reader = await createReader(release.root, io);
  const { bytes: receiptBytes } = await reader.read(pin.executableReceipt, 'Godskills routing executable receipt');
  const receipt = parseJson(receiptBytes, 'Godskills routing executable receipt');
  exactKeys(receipt, [
    'schemaVersion', 'id', 'status', 'protocolId', 'modes', 'dependencyClosure',
    'artifacts', 'routingArtifacts', 'parents', 'proofLimits', 'receiptDigest',
  ], 'Godskills routing executable receipt');
  if (receipt.schemaVersion !== 1 || receipt.id !== 'routing-executable-v1'
      || receipt.status !== 'verified-build' || receipt.protocolId !== PROTOCOL_ID) {
    throw new Error('Godskills routing executable receipt identity is invalid');
  }
  verifyReceiptDigest(receipt, pin.executableReceipt.receiptDigest, 'Godskills routing executable');
  if (canonicalJson(receipt.modes) !== canonicalJson(MODES)) {
    throw new Error('Godskills routing executable modes are invalid');
  }
  if (!Array.isArray(receipt.proofLimits) || receipt.proofLimits.length === 0
      || receipt.proofLimits.some((value) => typeof value !== 'string' || value.length === 0)
      || new Set(receipt.proofLimits).size !== receipt.proofLimits.length) {
    throw new Error('Godskills routing executable proof limits are invalid');
  }
  const modules = await verifyModules(reader, receipt, pin);
  await verifyRoutingArtifacts(reader, receipt.routingArtifacts);
  await verifyParents(reader, receipt.parents, release);

  const verified = deepFreeze({
    release,
    routing: {
      protocolId: PROTOCOL_ID,
      trustRootDigest: receipt.receiptDigest,
      root: reader.root.replaceAll('\\', '/'),
      executableReceipt: structuredClone(pin.executableReceipt),
      entrypoint: modules.entrypoint,
      modes: MODES.map(({ mode }) => mode),
      localModules: [...modules.paths],
      routingArtifacts: structuredClone(receipt.routingArtifacts),
      parents: structuredClone(receipt.parents),
      proofLimits: structuredClone(receipt.proofLimits),
    },
  });
  verifiedRoots.add(verified);
  return verified;
}
