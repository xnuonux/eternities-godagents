import { createHash } from 'node:crypto';
import { lstat as nativeLstat, readFile as nativeReadFile, realpath as nativeRealpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { pinnedGodskillsTypedCompositionSourceCommit } from '../../scripts/lib/pinned-godskills-typed-composition.mjs';

const PROTOCOL_ID = 'eternities-godskills-typed-composition-consumer-v1';
const RELEASE_PROTOCOL_ID = 'eternities-typed-composition-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const EXPECTED_EXPORTS = Object.freeze([
  'TypedCompositionError',
  'compileTypedMissionMethod',
  'executeTypedMissionMethod',
  'loadTypedCompositionRegistry',
  'sealTypedCompositionPlan',
  'verifyTypedMissionMethod',
]);
const EXPECTED_PIN = Object.freeze({
  receiptPath: 'receipts/typed-composition-v1.json',
  receiptSha256: 'bf311f1eebce635b5217ecb69fda6b8741889bc60f0be8186d14a3bcbe900f11',
  receiptBytes: 8349,
  receiptDigest: 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a',
  modulePath: 'src/typed-composition.mjs',
  moduleSha256: 'd2189dd88d0fad0d1255ff48f4429bdbb5baa9c06d14052551afd49d4bcef4f0',
  policyPath: 'policies/typed-composition.v1.json',
  policySha256: 'f5934f9b22fc3ede905fec359cc9697f40b23ede4f7144eb298f4cd184b005fd',
  capabilityLayerReceiptDigest: '1c19271951abb00e93529656a35e8fb52dccc2f3cf0b6208bcee6821361ab788',
  activationTrustRootDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
  registryDigest: '5143a9ca74b5676605c33e94c7d610d830c3aafe7d57c32a48558d5112b713b8',
  planDigest: '9849b421071a74535028cabd70d92db3cd4df6d4b0433f83bb562fb14d47d48f',
  methodDigest: '63b0a268841992c55953415b279f8e76277a80b0152f49260b3a22db9a75e3c2',
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
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
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

function parseCanonicalJson(bytes, label) {
  const value = parseJson(bytes, label);
  if (bytes.toString('utf8') !== godskillsCanonicalJson(value)) {
    throw new Error(`${label} is not canonical Godskills JSON`);
  }
  return value;
}

function parseJson(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON`, { cause: error });
  }
  return value;
}

function descriptor(value, label, { role = false } = {}) {
  exactKeys(value, role ? ['role', 'path', 'sha256', 'bytes'] : ['path', 'sha256', 'bytes'], label);
  requireRelativePath(value.path, `${label} path`);
  requireDigest(value.sha256, `${label} digest`);
  requirePositiveInteger(value.bytes, `${label} byte count`);
  if (role && !['design', 'policy', 'schema', 'test'].includes(value.role)) {
    throw new Error(`${label} role is unsupported`);
  }
  return value;
}

function receiptDescriptor(value, label) {
  exactKeys(value, ['path', 'sha256', 'bytes', 'receiptDigest'], label);
  descriptor({ path: value.path, sha256: value.sha256, bytes: value.bytes }, label);
  requireDigest(value.receiptDigest, `${label} receipt digest`);
  return value;
}

function validatePin(pin) {
  exactKeys(pin, [
    'protocolId', 'sourceCommit', 'repositoryRoot', 'releaseReceipt', 'module', 'policy', 'expected',
  ], 'Godskills typed composition pin');
  if (pin.protocolId !== PROTOCOL_ID) throw new Error('Godskills typed composition protocol is unsupported');
  if (pin.sourceCommit !== pinnedGodskillsTypedCompositionSourceCommit) {
    throw new Error('Godskills typed composition source commit differs from the static pin');
  }
  if (typeof pin.repositoryRoot !== 'string' || pin.repositoryRoot.length === 0
      || /[\0\r\n]/.test(pin.repositoryRoot)) {
    throw new TypeError('Godskills typed composition repository root is invalid');
  }
  exactKeys(pin.releaseReceipt, ['path', 'sha256', 'bytes', 'receiptDigest'], 'release receipt pin');
  exactKeys(pin.module, ['path', 'sha256'], 'typed composition module pin');
  exactKeys(pin.policy, ['path', 'sha256'], 'typed composition policy pin');
  exactKeys(pin.expected, [
    'capabilityLayerReceiptDigest', 'activationTrustRootDigest', 'registryDigest',
    'planDigest', 'methodDigest', 'executionDigest',
  ], 'typed composition expected identities');
  requireRelativePath(pin.releaseReceipt.path, 'release receipt pin path');
  requireRelativePath(pin.module.path, 'typed composition module pin path');
  requireRelativePath(pin.policy.path, 'typed composition policy pin path');
  requireDigest(pin.releaseReceipt.sha256, 'release receipt file digest');
  requirePositiveInteger(pin.releaseReceipt.bytes, 'release receipt byte count');
  requireDigest(pin.releaseReceipt.receiptDigest, 'release receipt logical digest');
  requireDigest(pin.module.sha256, 'typed composition module digest');
  requireDigest(pin.policy.sha256, 'typed composition policy digest');
  Object.entries(pin.expected).forEach(([name, value]) => requireDigest(value, `expected ${name}`));
  const actual = {
    receiptPath: pin.releaseReceipt.path,
    receiptSha256: pin.releaseReceipt.sha256,
    receiptBytes: pin.releaseReceipt.bytes,
    receiptDigest: pin.releaseReceipt.receiptDigest,
    modulePath: pin.module.path,
    moduleSha256: pin.module.sha256,
    policyPath: pin.policy.path,
    policySha256: pin.policy.sha256,
    ...pin.expected,
  };
  if (!same(actual, EXPECTED_PIN)) throw new Error('Godskills typed composition pin differs from the certified release');
  return pin;
}

async function createReader(repositoryRoot, io) {
  const fs = {
    lstat: io.lstat ?? nativeLstat,
    readFile: io.readFile ?? nativeReadFile,
    realpath: io.realpath ?? nativeRealpath,
  };
  const root = await fs.realpath(resolve(repositoryRoot));
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Godskills typed composition repository root is not a real directory');
  }
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
      const stat = await fs.lstat(lexical);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is not a regular file`);
      const actual = await fs.realpath(lexical);
      requireContained(root, actual, label);
      if (pathIdentity(actual) !== pathIdentity(lexical)) {
        throw new Error(`${label} is a symlink or non-canonical alias`);
      }
      const cacheKey = pathIdentity(actual);
      const previous = cache.get(cacheKey);
      if (previous && !fresh) {
        if (previous.sha256 !== reference.sha256
            || (reference.bytes !== undefined && previous.bytes.length !== reference.bytes)) {
          throw new Error(`${label} conflicts with an earlier descriptor`);
        }
        return previous;
      }
      const loaded = await fs.readFile(actual);
      const bytes = Buffer.isBuffer(loaded) ? loaded : Buffer.from(loaded);
      if (sha256(bytes) !== reference.sha256) throw new Error(`${label} file digest mismatch`);
      if (reference.bytes !== undefined && bytes.length !== reference.bytes) {
        throw new Error(`${label} byte count mismatch`);
      }
      const result = { actual, bytes, sha256: reference.sha256 };
      cache.set(cacheKey, result);
      return result;
    },
  };
}

function registerDescriptor(registry, row, label) {
  const existing = registry.get(row.path);
  const normalized = { path: row.path, sha256: row.sha256, bytes: row.bytes };
  if (existing && !same(existing, normalized)) {
    throw new Error(`${label} conflicts with another typed composition descriptor`);
  }
  registry.set(row.path, normalized);
}

function validateOrderedRows(rows, count, label, options) {
  if (!Array.isArray(rows) || rows.length !== count) throw new Error(`${label} set is incomplete`);
  const paths = rows.map((row, index) => descriptor(row, `${label} ${index}`, options).path);
  if (new Set(paths).size !== paths.length || !same(paths, [...paths].sort())) {
    throw new Error(`${label} paths must be unique and ordered`);
  }
  return rows;
}

function verifyLogicalDigest(value, field, expected, label) {
  requireDigest(value?.[field], `${label} ${field}`);
  const unsigned = structuredClone(value);
  delete unsigned[field];
  const actual = sha256Value(unsigned);
  if (actual !== value[field] || value[field] !== expected) throw new Error(`${label} logical digest mismatch`);
}

function validateReceiptShape(receipt, pin) {
  exactKeys(receipt, [
    'schemaVersion', 'id', 'status', 'protocolId', 'parents', 'policy', 'schemas',
    'sourceClosure', 'declaredArtifacts', 'generatedArtifacts', 'canary',
    'verification', 'proofLimits', 'receiptDigest',
  ], 'typed composition release receipt');
  if (receipt.schemaVersion !== 1 || receipt.id !== 'typed-composition-v1'
      || receipt.status !== 'verified-build' || receipt.protocolId !== RELEASE_PROTOCOL_ID) {
    throw new Error('typed composition release receipt identity is unsupported');
  }
  requireDigest(receipt.receiptDigest, 'typed composition release receipt digest');
  const unsigned = structuredClone(receipt);
  delete unsigned.receiptDigest;
  if (sha256(godskillsCanonicalJson(unsigned)) !== receipt.receiptDigest
      || receipt.receiptDigest !== pin.releaseReceipt.receiptDigest) {
    throw new Error('typed composition release receipt logical digest mismatch');
  }
  if (!Array.isArray(receipt.proofLimits) || receipt.proofLimits.length !== 8
      || new Set(receipt.proofLimits).size !== receipt.proofLimits.length) {
    throw new Error('typed composition release proof limits are invalid');
  }
}

async function verifyReleaseFiles(reader, receipt, pin) {
  exactKeys(receipt.sourceClosure, ['complete', 'modules', 'roots'], 'typed composition source closure');
  if (receipt.sourceClosure.complete !== true
      || !same(receipt.sourceClosure.roots, ['scripts/build-typed-composition-v1.mjs', 'src/typed-composition.mjs'])) {
    throw new Error('typed composition source closure roots are invalid');
  }
  const modules = validateOrderedRows(receipt.sourceClosure.modules, 9, 'typed composition source module');
  const declared = validateOrderedRows(receipt.declaredArtifacts, 9, 'typed composition declared artifact', { role: true });
  const schemas = validateOrderedRows(receipt.schemas, 3, 'typed composition schema', { role: true });
  const generated = validateOrderedRows(receipt.generatedArtifacts, 9, 'typed composition generated artifact');

  const moduleRow = modules.find(({ path }) => path === pin.module.path);
  if (!moduleRow || moduleRow.sha256 !== pin.module.sha256) throw new Error('typed composition module binding mismatch');
  descriptor(receipt.policy, 'typed composition policy descriptor');
  if (receipt.policy.path !== pin.policy.path || receipt.policy.sha256 !== pin.policy.sha256) {
    throw new Error('typed composition policy binding mismatch');
  }
  const declaredPolicy = declared.find(({ role, path }) => role === 'policy' && path === receipt.policy.path);
  if (!declaredPolicy || !same(receipt.policy, {
    path: declaredPolicy.path, sha256: declaredPolicy.sha256, bytes: declaredPolicy.bytes,
  })) throw new Error('typed composition declared policy binding mismatch');
  const declaredSchemas = declared.filter(({ role }) => role === 'schema');
  if (!same(schemas, declaredSchemas)) throw new Error('typed composition schema bindings differ');

  exactKeys(receipt.parents, ['activationExecutable', 'capabilityLayer'], 'typed composition parents');
  const activationParent = receiptDescriptor(receipt.parents.activationExecutable, 'activation executable parent');
  const capabilityParent = receiptDescriptor(receipt.parents.capabilityLayer, 'capability layer parent');
  if (activationParent.receiptDigest !== pin.expected.activationTrustRootDigest
      || capabilityParent.receiptDigest !== pin.expected.capabilityLayerReceiptDigest) {
    throw new Error('typed composition parent roots differ from the static pin');
  }

  const registry = new Map();
  for (const row of [...modules, ...declared, ...schemas, ...generated, receipt.policy,
    activationParent, capabilityParent]) {
    registerDescriptor(registry, row, `typed composition descriptor ${row.path}`);
  }
  const loaded = new Map();
  for (const row of registry.values()) {
    loaded.set(row.path, await reader.read(row, `typed composition artifact ${row.path}`));
  }

  const policy = parseCanonicalJson(loaded.get(receipt.policy.path).bytes, 'typed composition policy');
  if (!same(policy.activationTrustRoot, activationParent)
      || !same(policy.capabilityLayerReceipt, capabilityParent)) {
    throw new Error('typed composition policy parent bindings differ from the release receipt');
  }

  const activationReceipt = parseJson(
    loaded.get(activationParent.path).bytes, 'activation executable parent receipt',
  );
  if (activationReceipt.schemaVersion !== 1 || activationReceipt.id !== 'adaptive-activation-executable-v1'
      || activationReceipt.status !== 'verified-build'
      || activationReceipt.protocolId !== 'eternities-godskills-activation-v1') {
    throw new Error('activation executable parent identity is invalid');
  }
  verifyLogicalDigest(
    activationReceipt, 'receiptDigest', activationParent.receiptDigest, 'activation executable parent',
  );

  const capabilityReceipt = parseCanonicalJson(
    loaded.get(capabilityParent.path).bytes, 'capability layer parent receipt',
  );
  if (capabilityReceipt.schemaVersion !== 1 || capabilityReceipt.id !== 'capability-layer-abi-v1'
      || capabilityReceipt.status !== 'experimental-canary') {
    throw new Error('capability layer parent identity is invalid');
  }
  const capabilityUnsigned = structuredClone(capabilityReceipt);
  delete capabilityUnsigned.receiptDigest;
  if (sha256(godskillsCanonicalJson(capabilityUnsigned)) !== capabilityReceipt.receiptDigest
      || capabilityReceipt.receiptDigest !== capabilityParent.receiptDigest) {
    throw new Error('capability layer parent logical digest mismatch');
  }

  const json = new Map();
  for (const row of schemas) {
    json.set(row.path, parseJson(loaded.get(row.path).bytes, row.path));
  }
  for (const row of generated) {
    json.set(row.path, parseCanonicalJson(loaded.get(row.path).bytes, row.path));
  }
  return { modules, declared, generated, loaded, policy, json };
}

function verifyCanaryClosure(receipt, pin, artifacts) {
  const byName = (name) => artifacts.json.get(`artifacts/typed-composition/${name}.v1.json`);
  const activation = byName('activation');
  const budget = byName('budget');
  const execution = byName('canary-execution');
  const compatibility = byName('compatibility');
  const method = byName('method');
  const plan = byName('plan');
  const registry = byName('registry');
  const rejection = byName('rejection-matrix');
  const vocabulary = byName('vocabulary');
  if ([activation, budget, execution, compatibility, method, plan, registry, rejection, vocabulary]
    .some((value) => !value)) throw new Error('typed composition generated artifact set is incomplete');

  verifyLogicalDigest(registry, 'registryDigest', pin.expected.registryDigest, 'typed composition registry');
  verifyLogicalDigest(activation, 'resultDigest', receipt.canary.activationResultDigest, 'typed composition activation');
  if (!Array.isArray(activation.decisions)) throw new Error('typed composition activation decisions are invalid');
  for (const decision of activation.decisions) {
    verifyLogicalDigest(decision, 'decisionDigest', decision.decisionDigest, 'typed composition activation decision');
  }
  verifyLogicalDigest(plan, 'planDigest', pin.expected.planDigest, 'typed composition plan');
  verifyLogicalDigest(method, 'methodDigest', pin.expected.methodDigest, 'typed composition method');
  verifyLogicalDigest(
    execution.receipt, 'executionDigest', pin.expected.executionDigest, 'typed composition execution',
  );

  exactKeys(receipt.canary, [
    'activationResultDigest', 'authorityExpanded', 'estimatedContextBytes', 'executedNegativeProbes',
    'executionDigest', 'links', 'methodBodiesEmbedded', 'methodDigest', 'missionId', 'nodes',
    'planDigest', 'registryDigest', 'sourceBodiesTransported',
  ], 'typed composition canary');
  if (receipt.canary.registryDigest !== registry.registryDigest
      || receipt.canary.planDigest !== plan.planDigest
      || receipt.canary.methodDigest !== method.methodDigest
      || receipt.canary.executionDigest !== execution.receipt.executionDigest
      || receipt.canary.activationResultDigest !== activation.resultDigest
      || receipt.canary.authorityExpanded !== false
      || receipt.canary.methodBodiesEmbedded !== 0
      || receipt.canary.sourceBodiesTransported !== 0
      || receipt.canary.executedNegativeProbes !== 23) {
    throw new Error('typed composition canary roots or safety boundary differ');
  }
  if (registry.capabilityLayerReceiptDigest !== pin.expected.capabilityLayerReceiptDigest
      || registry.activationTrustRootDigest !== pin.expected.activationTrustRootDigest
      || plan.capabilityLayerReceiptDigest !== registry.capabilityLayerReceiptDigest
      || plan.activationTrustRootDigest !== registry.activationTrustRootDigest
      || plan.activationResultDigest !== activation.resultDigest
      || method.registryDigest !== registry.registryDigest
      || method.planDigest !== plan.planDigest
      || method.activationResultDigest !== activation.resultDigest
      || method.aggregate?.methodBodiesEmbedded !== 0
      || method.aggregate?.sourceBodiesTransported !== 0
      || method.aggregate?.authorityExpanded !== false
      || execution.receipt.methodDigest !== method.methodDigest
      || execution.receipt.authorityExpanded !== false) {
    throw new Error('typed composition generated trust chain is inconsistent');
  }
  if (budget.methodDigest !== method.methodDigest || budget.planDigest !== plan.planDigest
      || budget.withinEveryCeiling !== true || compatibility.registryDigest !== registry.registryDigest
      || vocabulary.policyDigest !== pin.policy.sha256 || rejection.observedRejections !== 23
      || rejection.unexpectedAcceptances !== 0 || !Array.isArray(rejection.cases)
      || rejection.cases.length !== 23 || rejection.cases.some(({ observed }) => observed !== 'rejected')) {
    throw new Error('typed composition generated evidence is inconsistent');
  }
}

export function assertVerifiedGodskillsTypedCompositionRelease(value) {
  if (!value || typeof value !== 'object' || !VERIFIED_RELEASES.has(value)) {
    throw new TypeError('Godskills typed composition release lacks verified provenance brand');
  }
  return value;
}

export function assertGodskillsTypedCompositionModuleExports(module) {
  if (!module || typeof module !== 'object'
      || !same(Object.keys(module).sort(), [...EXPECTED_EXPORTS].sort())
      || EXPECTED_EXPORTS.some((name) => typeof module[name] !== 'function')) {
    throw new Error('verified Godskills typed composition module exports are invalid');
  }
  return module;
}

export async function instantiateVerifiedGodskillsTypedComposition({ verification } = {}) {
  assertVerifiedGodskillsTypedCompositionRelease(verification);
  const provenance = VERIFIED_RELEASES.get(verification);
  let moduleFile;
  for (const reference of provenance.sourceModules) {
    const file = await provenance.reader.read(
      reference, `verified typed composition source before import ${reference.path}`, { fresh: true },
    );
    if (reference.path === provenance.moduleReference.path) moduleFile = file;
  }
  if (!moduleFile) throw new Error('verified Godskills typed composition module is absent from source closure');
  const module = assertGodskillsTypedCompositionModuleExports(
    await import(pathToFileURL(moduleFile.actual).href),
  );
  const registry = await module.loadTypedCompositionRegistry({
    repositoryRoot: provenance.reader.root,
    policyPath: provenance.policyPath,
    expectedPolicyDigest: provenance.policyReference.sha256,
    read: provenance.reader.readFile,
  });
  if (registry.registryDigest !== verification.registryDigest) {
    throw new Error('verified Godskills typed composition registry root changed during construction');
  }
  return Object.freeze({ module, registry });
}

export async function verifyGodskillsTypedCompositionRelease({ releasePin, io = {} } = {}) {
  const pin = validatePin(structuredClone(releasePin));
  const reader = await createReader(pin.repositoryRoot, io);
  const releaseFile = await reader.read(pin.releaseReceipt, 'typed composition release receipt');
  const receipt = parseCanonicalJson(releaseFile.bytes, 'typed composition release receipt');
  validateReceiptShape(receipt, pin);
  const artifacts = await verifyReleaseFiles(reader, receipt, pin);
  verifyCanaryClosure(receipt, pin, artifacts);

  const publicResult = deepFreeze({
    protocolId: PROTOCOL_ID,
    sourceCommit: pin.sourceCommit,
    trustRootDigest: receipt.receiptDigest,
    capabilityLayerReceiptDigest: pin.expected.capabilityLayerReceiptDigest,
    activationTrustRootDigest: pin.expected.activationTrustRootDigest,
    registryDigest: pin.expected.registryDigest,
    planDigest: pin.expected.planDigest,
    methodDigest: pin.expected.methodDigest,
    executionDigest: pin.expected.executionDigest,
    sourceModules: artifacts.modules.length,
    declaredArtifacts: artifacts.declared.length,
    generatedArtifacts: artifacts.generated.length,
    methodBodiesEmbedded: 0,
    sourceBodiesTransported: 0,
    authorityExpanded: false,
    defaultLaunchEnabled: false,
    proofLimits: structuredClone(receipt.proofLimits),
  });
  VERIFIED_RELEASES.set(publicResult, {
    reader,
    moduleReference: { ...pin.module, bytes: artifacts.loaded.get(pin.module.path).bytes.length },
    sourceModules: artifacts.modules.map((row) => ({
      path: row.path, sha256: row.sha256, bytes: row.bytes,
    })),
    policyReference: { ...receipt.policy },
    policyPath: artifacts.loaded.get(pin.policy.path).actual,
  });
  return publicResult;
}
