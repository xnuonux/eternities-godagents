import { createHash } from 'node:crypto';
import { lstat as nativeLstat, readFile as nativeReadFile, realpath as nativeRealpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { pinnedGodskillsTypedExecutionStepperSourceCommit } from '../../scripts/lib/pinned-godskills-typed-execution-stepper.mjs';

const PROTOCOL_ID = 'eternities-godskills-typed-execution-stepper-consumer-v1';
const RECEIPT_PROTOCOL_ID = 'eternities-typed-execution-stepper-certification-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const EXPECTED_EXPORTS = Object.freeze([
  'TypedExecutionStepperError',
  'assertTypedMissionExecution',
  'beginTypedMissionExecution',
  'commitTypedMissionExecutionStep',
  'nextTypedMissionExecutionStep',
]);
const EXPECTED_PIN = Object.freeze({
  receiptPath: 'receipts/typed-execution-stepper-v1.json',
  receiptSha256: 'c4e88277cc2b0047f3a428e94a185cbf6e0683c6ac1955bada0baebe71fe2d69',
  receiptBytes: 14003,
  receiptDigest: '5caff10e19ec98020da451396af11a9e479afa61ba4d43546ce1559b23da2b17',
  modulePath: 'src/typed-execution-stepper.mjs',
  moduleSha256: '37adc58f65dc6dccdf02bfa3a5fb69dac293e7c3e4d29f9f181e8e252ebab993',
  moduleBytes: 12030,
  parentReceiptDigest: 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a',
  parentFileSha256: 'bf311f1eebce635b5217ecb69fda6b8741889bc60f0be8186d14a3bcbe900f11',
  fixtureDigest: 'f514832922c2a7bf9c941f1dbbeb5a257c52cd8558e49b6a283731a5812578df',
  fixtureFileSha256: '33b15ead306a78eee87315de02e054cd7de1d4e59a40622df42fc86147e35898',
  sourceClosureDigest: 'ea47d0ff68ad3a881f9c0507a9631494b508f2ebf4c913741c1a0f00d9e05b79',
  completionDigest: 'ced937d65ee7ebcb2e30db2828105be98608c0b6f9bd946e579d33e969d46191',
  executionDigest: 'dce249713684b029ffae62bb8b4b8e55b2d394a7b4a49f3ddbb846421e914bf7',
});
const VERIFIED_RELEASES = new WeakMap();

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function godskillsCanonicalJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  if (!same(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
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

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validatePin(pin) {
  exactKeys(pin, ['protocolId', 'sourceCommit', 'repositoryRoot', 'releaseReceipt', 'module', 'expected'], 'Godskills typed execution stepper pin');
  if (pin.protocolId !== PROTOCOL_ID) throw new Error('Godskills typed execution stepper protocol is unsupported');
  if (pin.sourceCommit !== pinnedGodskillsTypedExecutionStepperSourceCommit) {
    throw new Error('Godskills typed execution stepper source commit differs from the static pin');
  }
  if (typeof pin.repositoryRoot !== 'string' || pin.repositoryRoot.length === 0 || /[\0\r\n]/.test(pin.repositoryRoot)) {
    throw new TypeError('Godskills typed execution stepper repository root is invalid');
  }
  exactKeys(pin.releaseReceipt, ['path', 'sha256', 'bytes', 'receiptDigest'], 'stepper release receipt pin');
  exactKeys(pin.module, ['path', 'sha256', 'bytes'], 'stepper module pin');
  exactKeys(pin.expected, [
    'parentReceiptDigest', 'parentFileSha256', 'fixtureDigest', 'fixtureFileSha256',
    'sourceClosureDigest', 'completionDigest', 'executionDigest',
  ], 'stepper expected identities');
  requireRelativePath(pin.releaseReceipt.path, 'stepper release receipt path');
  requireRelativePath(pin.module.path, 'stepper module path');
  requirePositiveInteger(pin.releaseReceipt.bytes, 'stepper receipt byte count');
  requirePositiveInteger(pin.module.bytes, 'stepper module byte count');
  requireDigest(pin.releaseReceipt.sha256, 'stepper receipt file digest');
  requireDigest(pin.releaseReceipt.receiptDigest, 'stepper receipt logical digest');
  requireDigest(pin.module.sha256, 'stepper module digest');
  Object.entries(pin.expected).forEach(([name, value]) => requireDigest(value, `expected ${name}`));
  const observed = {
    receiptPath: pin.releaseReceipt.path,
    receiptSha256: pin.releaseReceipt.sha256,
    receiptBytes: pin.releaseReceipt.bytes,
    receiptDigest: pin.releaseReceipt.receiptDigest,
    modulePath: pin.module.path,
    moduleSha256: pin.module.sha256,
    moduleBytes: pin.module.bytes,
    ...pin.expected,
  };
  if (!same(observed, EXPECTED_PIN)) {
    throw new Error('Godskills typed execution stepper pin differs from the certified release');
  }
  return pin;
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

async function createReader(repositoryRoot, io) {
  const fs = {
    lstat: io.lstat ?? nativeLstat,
    readFile: io.readFile ?? nativeReadFile,
    realpath: io.realpath ?? nativeRealpath,
  };
  const root = await fs.realpath(resolve(repositoryRoot));
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Godskills stepper root is not a real directory');
  const cache = new Map();
  return {
    root,
    readFile: fs.readFile,
    async read(reference, label, { fresh = false } = {}) {
      requireRelativePath(reference.path, `${label} path`);
      requireDigest(reference.sha256, `${label} digest`);
      if (reference.bytes !== undefined) requirePositiveInteger(reference.bytes, `${label} byte count`);
      const lexical = resolve(root, ...reference.path.split('/'));
      requireContained(root, lexical, label);
      const fileStat = await fs.lstat(lexical);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error(`${label} is not a regular file`);
      const actual = await fs.realpath(lexical);
      requireContained(root, actual, label);
      if (pathIdentity(actual) !== pathIdentity(lexical)) throw new Error(`${label} is a path alias`);
      const key = pathIdentity(actual);
      const previous = cache.get(key);
      if (previous && !fresh) return previous;
      const loaded = await fs.readFile(actual);
      const bytes = Buffer.isBuffer(loaded) ? loaded : Buffer.from(loaded);
      if (sha256(bytes) !== reference.sha256) throw new Error(`${label} file digest mismatch`);
      if (reference.bytes !== undefined && bytes.length !== reference.bytes) throw new Error(`${label} byte count mismatch`);
      const result = { actual, bytes };
      cache.set(key, result);
      return result;
    },
  };
}

function descriptor(value, label) {
  exactKeys(value, ['bytes', 'path', 'sha256'], label);
  requireRelativePath(value.path, `${label} path`);
  requireDigest(value.sha256, `${label} digest`);
  requirePositiveInteger(value.bytes, `${label} byte count`);
  return value;
}

function verifyReceipt(receipt, pin) {
  if (receipt.schemaVersion !== 1 || receipt.certificationId !== 'typed-execution-stepper-v1'
      || receipt.status !== 'certified' || receipt.protocolId !== RECEIPT_PROTOCOL_ID) {
    throw new Error('Godskills typed execution stepper receipt identity is unsupported');
  }
  requireDigest(receipt.receiptDigest, 'stepper receipt digest');
  const unsigned = structuredClone(receipt);
  delete unsigned.receiptDigest;
  if (sha256(godskillsCanonicalJson(unsigned)) !== receipt.receiptDigest
      || receipt.receiptDigest !== pin.releaseReceipt.receiptDigest) {
    throw new Error('Godskills typed execution stepper receipt digest mismatch');
  }
  if (receipt.source?.commit !== pin.sourceCommit || receipt.source?.closure?.complete !== true
      || receipt.source.closure.digest !== pin.expected.sourceClosureDigest
      || !same(receipt.source.closure.roots, [
        'scripts/build-typed-execution-stepper-v1-receipt.mjs',
        'src/typed-execution-stepper.mjs',
      ])) {
    throw new Error('Godskills typed execution stepper source closure is invalid');
  }
  if (!Array.isArray(receipt.source.closure.modules) || receipt.source.closure.modules.length !== 12) {
    throw new Error('Godskills typed execution stepper source closure is incomplete');
  }
  const modules = receipt.source.closure.modules.map((row, index) => descriptor(row, `stepper source module ${index}`));
  const paths = modules.map(({ path }) => path);
  if (new Set(paths).size !== paths.length || !same(paths, [...paths].sort())) {
    throw new Error('Godskills typed execution stepper source paths are invalid');
  }
  const module = modules.find(({ path }) => path === pin.module.path);
  if (!module || !same(module, pin.module)) throw new Error('Godskills typed execution stepper module binding mismatch');
  if (receipt.parent?.path !== 'receipts/typed-composition-v1.json'
      || receipt.parent.fileSha256 !== pin.expected.parentFileSha256
      || receipt.parent.receiptDigest !== pin.expected.parentReceiptDigest
      || receipt.fixture?.path !== 'fixtures/typed-execution-stepper-v1.json'
      || receipt.fixture.fileSha256 !== pin.expected.fixtureFileSha256
      || receipt.fixture.logicalDigest !== pin.expected.fixtureDigest
      || receipt.fixture.value?.completion?.completionDigest !== pin.expected.completionDigest
      || receipt.fixture.value?.parent?.executionDigest !== pin.expected.executionDigest) {
    throw new Error('Godskills typed execution stepper parent or fixture binding mismatch');
  }
  if (receipt.review?.value?.disposition !== 'approved'
      || receipt.review.value.unresolvedCriticalDefects !== 0
      || receipt.review.value.unresolvedImportantDefects !== 0
      || receipt.testRuns?.focused?.status !== 'pass'
      || receipt.testRuns?.full?.status !== 'pass') {
    throw new Error('Godskills typed execution stepper review or tests are not certified');
  }
  return modules;
}

export function assertVerifiedGodskillsTypedExecutionStepperRelease(value) {
  if (!value || typeof value !== 'object' || !VERIFIED_RELEASES.has(value)) {
    throw new TypeError('Godskills typed execution stepper release lacks verified provenance brand');
  }
  return value;
}

export function assertGodskillsTypedExecutionStepperModuleExports(module) {
  if (!module || typeof module !== 'object'
      || !same(Object.keys(module).sort(), [...EXPECTED_EXPORTS].sort())
      || EXPECTED_EXPORTS.some((name) => typeof module[name] !== 'function')) {
    throw new Error('verified Godskills typed execution stepper exports are invalid');
  }
  return module;
}

export async function verifyGodskillsTypedExecutionStepperRelease({ releasePin, io = {} } = {}) {
  const pin = validatePin(structuredClone(releasePin));
  const reader = await createReader(pin.repositoryRoot, io);
  const receiptFile = await reader.read(pin.releaseReceipt, 'typed execution stepper receipt');
  const text = receiptFile.bytes.toString('utf8');
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch (error) {
    throw new Error('typed execution stepper receipt is invalid JSON', { cause: error });
  }
  if (text !== godskillsCanonicalJson(receipt)) throw new Error('typed execution stepper receipt is not canonical');
  const modules = verifyReceipt(receipt, pin);
  for (const row of modules) await reader.read(row, `typed execution stepper source ${row.path}`);
  await reader.read({
    path: receipt.parent.path,
    sha256: receipt.parent.fileSha256,
  }, 'typed execution stepper parent receipt');
  await reader.read({
    path: receipt.fixture.path,
    sha256: receipt.fixture.fileSha256,
  }, 'typed execution stepper fixture');
  await reader.read({
    path: receipt.review.path,
    sha256: receipt.review.fileSha256,
  }, 'typed execution stepper review');

  const verified = deepFreeze({
    protocolId: PROTOCOL_ID,
    sourceCommit: pin.sourceCommit,
    trustRootDigest: receipt.receiptDigest,
    parentTypedCompositionReceiptDigest: receipt.parent.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest,
    completionDigest: pin.expected.completionDigest,
    executionDigest: pin.expected.executionDigest,
    sourceModules: modules.length,
    authorityExpanded: false,
    defaultLaunchEnabled: false,
    proofLimits: structuredClone(receipt.proofLimits),
  });
  VERIFIED_RELEASES.set(verified, { reader, modules, moduleReference: pin.module });
  return verified;
}

export async function instantiateVerifiedGodskillsTypedExecutionStepper({ verification } = {}) {
  assertVerifiedGodskillsTypedExecutionStepperRelease(verification);
  const provenance = VERIFIED_RELEASES.get(verification);
  let moduleFile;
  for (const reference of provenance.modules) {
    const file = await provenance.reader.read(reference, `verified stepper source before import ${reference.path}`, { fresh: true });
    if (reference.path === provenance.moduleReference.path) moduleFile = file;
  }
  if (!moduleFile) throw new Error('verified Godskills typed execution stepper module is absent');
  return assertGodskillsTypedExecutionStepperModuleExports(
    await import(pathToFileURL(moduleFile.actual).href),
  );
}
