import { createHash } from 'node:crypto';
import { readFile as nativeReadFile, realpath as nativeRealpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const compilerArtifactPaths = Object.freeze({
  arena: 'data/intent-arena.v1.json',
  arenaSource: 'data/intent-arena-source.v1.json',
  cards: 'artifacts/routing/cards.jsonl',
  compiler: 'src/intent-compiler.mjs',
  contracts: 'src/intent-contracts.mjs',
  documentation: 'docs/intent-compiler.md',
  evaluator: 'src/intent-arena.mjs',
  runtime: 'src/intent-runtime.mjs',
  transport: 'scripts/intent.mjs',
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonicalText = (value) => value.replaceAll('\r\n', '\n');
const normalized = (value) => String(value).replaceAll('\\', '/').toLowerCase();
const portablePath = (value) => String(value).replaceAll('\\', '/');
const digestPattern = /^[a-f0-9]{64}$/;
const activationProtocol = 'eternities-godskills-activation-v1';
const preferenceProtocol = 'eternities-godskills-specialist-preference-v1';
const preferenceModules = Object.freeze([
  'scripts/intent-preference.mjs',
  'src/intent-compiler.mjs',
  'src/intent-contracts.mjs',
  'src/intent-runtime.mjs',
  'src/io.mjs',
  'src/quarry-atlas.mjs',
  'src/router.mjs',
  'src/routing-contracts.mjs',
  'src/routing-index.mjs',
  'src/specialist-preference-contracts.mjs',
  'src/specialist-preference-router.mjs',
  'src/specialist-preference-routing-index.mjs',
  'src/specialist-preference-runtime.mjs',
]);
const preferenceSources = Object.freeze([
  'docs/superpowers/plans/2026-08-31-specialist-preference-routing-v1.md',
  'docs/superpowers/specs/2026-08-31-specialist-preference-routing-v1-design.md',
  'scripts/build-specialist-preference-routing-v1.mjs',
  ...preferenceModules,
  'scripts/intent.mjs',
  'tests/specialist-preference-routing-receipt.test.mjs',
  'tests/specialist-preference-routing.test.mjs',
].sort());
const preferenceRoutingArtifacts = Object.freeze([
  'artifacts/routing/cards.jsonl',
  'artifacts/routing/family-map.json',
]);
const preferenceOutputs = Object.freeze([
  'artifacts/specialist-preference-routing-v1/fixture.json',
]);

function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function assertRelativePath(path) {
  const parts = typeof path === 'string' ? path.split('/') : [];
  if (typeof path !== 'string' || path.length === 0 || isAbsolute(path)
      || path.includes('\\') || /[\0\r\n?#]/.test(path)
      || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('Godskills artifact path must be repository-relative');
  }
}

function assertContained(root, target) {
  const rel = relative(root, target);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return;
  throw new Error('Godskills artifact escaped repository root');
}

async function artifactReader(repositoryRoot, io) {
  const root = await io.realpath(resolve(repositoryRoot));
  return {
    root,
    async readBound(reference, label, { canonical = false } = {}) {
      assertRelativePath(reference.path);
      const lexical = resolve(root, reference.path);
      assertContained(root, lexical);
      const actual = await io.realpath(lexical);
      assertContained(root, actual);
      const bytes = await io.readFile(actual);
      const digest = sha256(canonical ? canonicalText(bytes.toString('utf8')) : bytes);
      if (digest !== reference.sha256) throw new Error(`${label} digest mismatch`);
      if (reference.bytes !== undefined && bytes.length !== reference.bytes) throw new Error(`${label} byte count mismatch`);
      return { bytes, actual };
    },
    async read(reference, label, options) {
      return (await this.readBound(reference, label, options)).bytes;
    },
  };
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function requireIdentity(value, { idField = 'id', id, status }, label) {
  if (value?.schemaVersion !== 1 || value?.[idField] !== id) throw new Error(`${label} identity mismatch`);
  if (value.status !== status) throw new Error(`${label} is not certified`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error(`${label} fields are invalid`);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !digestPattern.test(value)) throw new Error(`${label} is not a SHA-256 digest`);
}

function assertCanonicalReferences(references, label) {
  if (!Array.isArray(references) || references.length === 0) throw new Error(`${label} are required`);
  const paths = references.map(({ path }) => path);
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contain a duplicate path`);
  const sorted = [...paths].sort();
  if (canonicalJson(paths) !== canonicalJson(sorted)) throw new Error(`${label} must use canonical path order`);
  for (const reference of references) {
    assertRelativePath(reference.path);
    requireDigest(reference.sha256, `${label} digest`);
  }
}

function verifyLogicalReceipt(value, expectedDigest, label) {
  requireDigest(value?.receiptDigest, `${label} receipt digest`);
  const unsigned = structuredClone(value);
  delete unsigned.receiptDigest;
  if (sha256(canonicalJson(unsigned)) !== value.receiptDigest) throw new Error(`${label} receipt digest mismatch`);
  if (value.receiptDigest !== expectedDigest) throw new Error(`${label} logical receipt pin mismatch`);
}

function activationPinRows(pin) {
  return [
    { role: 'entrypoint', ...pin.entrypoint },
    { role: 'compiler', ...pin.compiler },
    ...pin.dependencies.map((reference) => ({ role: 'dependency', ...reference })),
    { role: 'request-schema', ...pin.schemas.request },
    { role: 'result-schema', ...pin.schemas.result },
    { role: 'policy', ...pin.policy },
    { role: 'evidence', ...pin.evidence },
    { role: 'contract', ...pin.contract },
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function comparableArtifact({ role, path, sha256: digest }) {
  return { role, path, sha256: digest };
}

async function verifyActivationRoot(reader, pin) {
  if (pin.protocolId !== activationProtocol) throw new Error('activation protocol is unsupported');
  assertCanonicalReferences(pin.dependencies, 'activation dependencies');
  for (const [label, reference] of [
    ['activation executable receipt', pin.executableReceipt],
    ['activation parent receipt', pin.parentReceipt],
    ['activation entrypoint', pin.entrypoint],
    ['activation compiler', pin.compiler],
    ['activation request schema', pin.schemas.request],
    ['activation result schema', pin.schemas.result],
    ['activation policy', pin.policy],
    ['activation evidence', pin.evidence],
    ['activation contract', pin.contract],
  ]) {
    assertRelativePath(reference.path);
    requireDigest(reference.sha256, `${label} file digest`);
  }
  requireDigest(pin.executableReceipt.receiptDigest, 'activation executable receipt logical digest');
  requireDigest(pin.parentReceipt.receiptDigest, 'activation parent receipt logical digest');
  requireDigest(pin.policy.logicalDigest, 'activation policy logical digest');
  requireDigest(pin.evidence.logicalDigest, 'activation evidence logical digest');

  const executableBytes = await reader.read(pin.executableReceipt, 'activation executable receipt');
  const receipt = parseJson(executableBytes, 'activation executable receipt');
  exactKeys(receipt, [
    'schemaVersion', 'id', 'status', 'protocolId', 'parentReceipt',
    'dependencyClosure', 'artifacts', 'proofLimits', 'receiptDigest',
  ], 'activation executable receipt');
  if (receipt.schemaVersion !== 1 || receipt.id !== 'adaptive-activation-executable-v1') {
    throw new Error('activation executable receipt identity mismatch');
  }
  if (receipt.status !== 'verified-build') throw new Error('activation executable receipt status must be verified-build');
  if (receipt.protocolId !== pin.protocolId) throw new Error('activation executable receipt protocol mismatch');
  verifyLogicalReceipt(receipt, pin.executableReceipt.receiptDigest, 'activation executable');
  if (!Array.isArray(receipt.proofLimits)
      || receipt.proofLimits.length === 0
      || receipt.proofLimits.some((value) => typeof value !== 'string' || value.length === 0)
      || new Set(receipt.proofLimits).size !== receipt.proofLimits.length) {
    throw new Error('activation executable receipt proof limits are invalid');
  }

  exactKeys(receipt.parentReceipt, ['path', 'sha256', 'bytes', 'receiptDigest'], 'activation parent binding');
  if (receipt.parentReceipt.path !== pin.parentReceipt.path
      || receipt.parentReceipt.sha256 !== pin.parentReceipt.sha256
      || receipt.parentReceipt.receiptDigest !== pin.parentReceipt.receiptDigest) {
    throw new Error('activation parent receipt binding mismatch');
  }
  const parentBytes = await reader.read(pin.parentReceipt, 'activation parent receipt');
  if (parentBytes.length !== receipt.parentReceipt.bytes) throw new Error('activation parent receipt byte count mismatch');
  const parent = parseJson(parentBytes, 'activation parent receipt');
  requireIdentity(parent, { id: 'adaptive-activation-v1', status: 'experimental' }, 'activation parent receipt');
  verifyLogicalReceipt(parent, pin.parentReceipt.receiptDigest, 'activation parent');

  exactKeys(receipt.dependencyClosure, ['roots', 'localModules', 'complete'], 'activation dependency closure');
  if (receipt.dependencyClosure.complete !== true) throw new Error('activation dependency closure is incomplete');
  const expectedRoots = [pin.entrypoint.path, pin.compiler.path].sort();
  if (canonicalJson(receipt.dependencyClosure.roots) !== canonicalJson(expectedRoots)) {
    throw new Error('activation dependency closure roots mismatch');
  }
  if (!Array.isArray(receipt.artifacts) || receipt.artifacts.length === 0) {
    throw new Error('activation executable receipt artifact set is missing');
  }
  const receiptPaths = receipt.artifacts.map(({ path }) => path);
  if (new Set(receiptPaths).size !== receiptPaths.length
      || canonicalJson(receiptPaths) !== canonicalJson([...receiptPaths].sort())) {
    throw new Error('activation executable receipt artifacts must be unique and canonically ordered');
  }
  const pinRows = activationPinRows(pin);
  if (canonicalJson(receipt.artifacts.map(comparableArtifact))
      !== canonicalJson(pinRows.map(comparableArtifact))) {
    throw new Error('activation pin and executable receipt artifact sets do not match');
  }
  const modulePaths = receipt.artifacts
    .filter(({ role }) => ['entrypoint', 'compiler', 'dependency'].includes(role))
    .map(({ path }) => path)
    .sort();
  if (canonicalJson(receipt.dependencyClosure.localModules) !== canonicalJson(modulePaths)) {
    throw new Error('activation dependency closure does not match executable artifacts');
  }

  let entrypointActual;
  for (let index = 0; index < receipt.artifacts.length; index += 1) {
    const row = receipt.artifacts[index];
    const reference = pinRows[index];
    const expectsLogical = ['request-schema', 'result-schema', 'policy', 'evidence', 'contract'].includes(row.role);
    exactKeys(row, expectsLogical
      ? ['role', 'path', 'sha256', 'bytes', 'logicalDigest']
      : ['role', 'path', 'sha256', 'bytes'], `activation ${row.role} receipt artifact`);
    if (!Number.isInteger(row.bytes) || row.bytes < 1) throw new Error(`activation ${row.role} byte count is invalid`);
    const bound = await reader.readBound(reference, `activation ${row.role}`);
    if (bound.bytes.length !== row.bytes) throw new Error(`activation ${row.role} byte count mismatch`);
    if (row.role === 'entrypoint') entrypointActual = bound.actual;
    if (expectsLogical) {
      const value = parseJson(bound.bytes, `activation ${row.role}`);
      const logical = sha256(canonicalJson(value));
      if (logical !== row.logicalDigest) throw new Error(`activation ${row.role} logical digest mismatch`);
      if (row.role === 'policy' && logical !== pin.policy.logicalDigest) {
        throw new Error('activation policy logical pin mismatch');
      }
      if (row.role === 'evidence' && logical !== pin.evidence.logicalDigest) {
        throw new Error('activation evidence logical pin mismatch');
      }
    }
  }

  return frozen({
    protocolId: pin.protocolId,
    trustRootDigest: receipt.receiptDigest,
    root: portablePath(reader.root),
    executableReceipt: structuredClone(pin.executableReceipt),
    parentReceipt: structuredClone(pin.parentReceipt),
    entrypoint: { ...structuredClone(pin.entrypoint), absolutePath: portablePath(entrypointActual) },
    compiler: structuredClone(pin.compiler),
    dependencies: structuredClone(pin.dependencies),
    schemas: structuredClone(pin.schemas),
    policy: structuredClone(pin.policy),
    evidence: structuredClone(pin.evidence),
    contract: structuredClone(pin.contract),
    proofLimits: structuredClone(receipt.proofLimits),
  });
}

function exactPreferenceRow(row, label, { logical = false } = {}) {
  exactKeys(row, logical
    ? ['path', 'sha256', 'bytes', 'logicalDigest']
    : ['path', 'sha256', 'bytes'], label);
  assertRelativePath(row.path);
  requireDigest(row.sha256, `${label} file digest`);
  if (!Number.isInteger(row.bytes) || row.bytes < 1) throw new Error(`${label} byte count is invalid`);
  if (logical) requireDigest(row.logicalDigest, `${label} logical digest`);
}

function assertPreferenceRows(rows, label, { maximum, logical = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > maximum) {
    throw new Error(`${label} must contain between 1 and ${maximum} rows`);
  }
  const paths = rows.map(({ path }) => path);
  if (new Set(paths).size !== paths.length
      || canonicalJson(paths) !== canonicalJson([...paths].sort())) {
    throw new Error(`${label} must be unique and canonically ordered`);
  }
  rows.forEach((row, index) => exactPreferenceRow(row, `${label}[${index}]`, { logical }));
}

async function verifyPreferenceRoot(reader, pin, releasePin, roots) {
  if (pin.protocolId !== preferenceProtocol) throw new Error('preference protocol is unsupported');
  assertRelativePath(pin.releaseReceipt.path);
  requireDigest(pin.releaseReceipt.sha256, 'preference receipt file digest');
  requireDigest(pin.releaseReceipt.receiptDigest, 'preference receipt logical digest');
  const receiptBytes = await reader.read(pin.releaseReceipt, 'preference release receipt');
  const receipt = parseJson(receiptBytes, 'preference release receipt');
  exactKeys(receipt, [
    'schemaVersion', 'id', 'status', 'protocolId', 'authorityExpanded', 'parents',
    'dependencyClosure', 'inputs', 'outputs', 'computedGates', 'proofLimits',
    'receiptDigest',
  ], 'preference release receipt');
  requireIdentity(receipt, {
    id: 'specialist-preference-routing-v1',
    status: 'verified-structural-protocol',
  }, 'preference release receipt');
  if (receipt.protocolId !== pin.protocolId) throw new Error('preference receipt protocol mismatch');
  verifyLogicalReceipt(receipt, pin.releaseReceipt.receiptDigest, 'preference release');
  if (receipt.authorityExpanded !== false) throw new Error('preference release expands authority');

  exactKeys(receipt.computedGates, [
    'authorityExpansions', 'equalQualityTieBreakApplied', 'legacyShapePreserved',
    'preferenceOnlyDependencyBlocked', 'rejectedPreferenceNotQualified',
    'shortlistOverflowRejected', 'strongerNonpreferredPreserved',
    'unknownPreferenceRejected', 'unresolvedDecisionPreserved',
  ], 'preference release gates');
  for (const [name, value] of Object.entries(receipt.computedGates)) {
    if (name === 'authorityExpansions' ? value !== 0 : value !== true) {
      throw new Error(`preference release gate failed: ${name}`);
    }
  }
  if (!Array.isArray(receipt.proofLimits)
      || !receipt.proofLimits.includes('no-specialist-quality-superiority-claim')
      || !receipt.proofLimits.includes('no-eligibility-or-authority-change')) {
    throw new Error('preference release proof limits are incomplete');
  }

  if (!Array.isArray(receipt.parents) || receipt.parents.length !== 4) {
    throw new Error('preference release must bind exactly four parents');
  }
  const expectedParents = [
    ['compilerReceipt', releasePin.compilerReceipt],
    ['systemReceipt', releasePin.systemReceipt],
    ['routerReceipt', releasePin.routerReceipt],
    ['portableReceipt', releasePin.portableReceipt],
  ].map(([name, reference]) => ({
    path: reference.path,
    sha256: roots[name].digest,
    bytes: roots[name].bytes.length,
  })).sort((left, right) => left.path.localeCompare(right.path));
  if (canonicalJson(receipt.parents) !== canonicalJson(expectedParents)) {
    throw new Error('preference release parent bindings do not match the verified release');
  }

  exactKeys(receipt.dependencyClosure, ['roots', 'localModules', 'complete'], 'preference dependency closure');
  if (receipt.dependencyClosure.complete !== true
      || canonicalJson(receipt.dependencyClosure.roots) !== canonicalJson(['scripts/intent-preference.mjs'])) {
    throw new Error('preference dependency closure root is invalid');
  }
  if (!Array.isArray(receipt.dependencyClosure.localModules)
      || receipt.dependencyClosure.localModules.length === 0
      || receipt.dependencyClosure.localModules.length > 32
      || new Set(receipt.dependencyClosure.localModules).size !== receipt.dependencyClosure.localModules.length
      || canonicalJson(receipt.dependencyClosure.localModules)
        !== canonicalJson([...receipt.dependencyClosure.localModules].sort())) {
    throw new Error('preference dependency closure modules are invalid');
  }
  if (canonicalJson(receipt.dependencyClosure.localModules) !== canonicalJson(preferenceModules)) {
    throw new Error('preference dependency closure is incomplete or changed');
  }

  exactKeys(receipt.inputs, ['sources', 'routingArtifacts'], 'preference release inputs');
  assertPreferenceRows(receipt.inputs.sources, 'preference sources', { maximum: 64 });
  assertPreferenceRows(receipt.inputs.routingArtifacts, 'preference routing artifacts', { maximum: 4 });
  assertPreferenceRows(receipt.outputs, 'preference outputs', { maximum: 4, logical: true });
  for (const [rows, expected, label] of [
    [receipt.inputs.sources, preferenceSources, 'sources'],
    [receipt.inputs.routingArtifacts, preferenceRoutingArtifacts, 'routing artifacts'],
    [receipt.outputs, preferenceOutputs, 'outputs'],
  ]) {
    if (canonicalJson(rows.map(({ path }) => path)) !== canonicalJson(expected)) {
      throw new Error(`preference ${label} are incomplete or changed`);
    }
  }
  const sourcesByPath = new Map(receipt.inputs.sources.map((row) => [row.path, row]));
  for (const modulePath of receipt.dependencyClosure.localModules) {
    if (!sourcesByPath.has(modulePath)) {
      throw new Error(`preference dependency is absent from source bindings: ${modulePath}`);
    }
  }

  let entrypointActual;
  for (const row of receipt.inputs.sources) {
    const bound = await reader.readBound(row, `preference source ${row.path}`);
    if (row.path === 'scripts/intent-preference.mjs') entrypointActual = bound.actual;
  }
  for (const row of receipt.inputs.routingArtifacts) {
    await reader.readBound(row, `preference routing artifact ${row.path}`);
  }
  for (const row of receipt.outputs) {
    const bound = await reader.readBound(row, `preference output ${row.path}`);
    const value = parseJson(bound.bytes, `preference output ${row.path}`);
    if (sha256(canonicalJson(value)) !== row.logicalDigest) {
      throw new Error(`preference output logical digest mismatch: ${row.path}`);
    }
  }
  if (!entrypointActual) throw new Error('preference entrypoint is absent from source bindings');

  return frozen({
    protocolId: pin.protocolId,
    trustRootDigest: receipt.receiptDigest,
    root: portablePath(reader.root),
    releaseReceipt: structuredClone(pin.releaseReceipt),
    entrypoint: {
      path: 'scripts/intent-preference.mjs',
      sha256: sourcesByPath.get('scripts/intent-preference.mjs').sha256,
      absolutePath: portablePath(entrypointActual),
    },
    localModules: structuredClone(receipt.dependencyClosure.localModules),
    authorityExpanded: false,
    proofLimits: structuredClone(receipt.proofLimits),
  });
}

async function verifyArtifactSet(reader, artifacts, label) {
  for (const [name, reference] of Object.entries(artifacts ?? {})) {
    if (!reference?.path || !reference?.sha256) continue;
    await reader.read(reference, `${label} artifact ${name}`);
  }
}

function verifyManifest(manifest, pin) {
  if (manifest?.schemaVersion !== 1 || manifest.manifestId !== 'portable-capabilities-v1'
      || manifest.status !== 'certified-local-artifacts') throw new Error('portable manifest identity mismatch');
  const unsigned = structuredClone(manifest);
  delete unsigned.manifestDigest;
  if (sha256(JSON.stringify(unsigned)) !== manifest.manifestDigest) throw new Error('logical manifest digest mismatch');
  if (manifest.manifestDigest !== pin.manifestDigest) throw new Error('portable manifest logical pin mismatch');
  if (manifest.composition?.maximumSelectedEntrypoints !== 3
      || manifest.composition?.capabilityGrantsAuthority !== false
      || manifest.composition?.recursiveComposition !== false) throw new Error('portable manifest composition boundary mismatch');
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length !== 44) {
    throw new Error('portable manifest must contain exactly 44 capabilities');
  }
  const ids = new Set();
  let topLevel = 0;
  let operational = 0;
  for (const capability of manifest.capabilities) {
    if (ids.has(capability.id)) throw new Error('portable manifest contains duplicate capability id');
    ids.add(capability.id);
    if (capability.tier === 'godskill') topLevel += 1;
    else if (capability.tier === 'operational-skill') operational += 1;
    else throw new Error('portable manifest contains unknown capability tier');
    if (capability.capabilityDoesNotGrantAuthority !== true) throw new Error('portable capability attempted to grant authority');
  }
  if (topLevel !== 22 || operational !== 22) throw new Error('portable manifest must contain 22 top-level and 22 operational capabilities');
  return new Map(manifest.capabilities.map((capability) => [capability.id, frozen(structuredClone(capability))]));
}

function verifyPortableReceipt(receipt, manifestBytes, manifest) {
  requireIdentity(receipt, { idField: 'receiptId', id: 'portable-capability-manifest-v1', status: 'certified-local-artifacts' }, 'portable receipt');
  const unsigned = structuredClone(receipt);
  delete unsigned.receiptDigest;
  if (sha256(JSON.stringify(unsigned)) !== receipt.receiptDigest) throw new Error('portable receipt digest mismatch');
  if (receipt.manifest?.sha256 !== sha256(manifestBytes) || receipt.manifest?.bytes !== manifestBytes.length
      || receipt.manifest?.manifestDigest !== manifest.manifestDigest) throw new Error('portable receipt manifest binding mismatch');
  if (receipt.counts?.capabilities !== 44 || receipt.counts?.topLevelGodskills !== 22 || receipt.counts?.operationalSkills !== 22) {
    throw new Error('portable receipt capability counts mismatch');
  }
  if (receipt.selectedEntrypointBoundary?.maximumComposition !== 3
      || receipt.selectedEntrypointBoundary?.authorityExpansion !== false
      || receipt.selectedEntrypointBoundary?.effectExpansion !== false) throw new Error('portable receipt selection boundary mismatch');
}

export async function verifyGodskillsRelease(releasePin, { artifactCache = new Map(), io = {} } = {}) {
  assertSchema('godskills-release-pin', releasePin);
  if (releasePin.adapterProtocol !== 'eternities-godskills-adapter-v1') throw new Error('unsupported adapter protocol');
  const reader = await artifactReader(releasePin.repositoryRoot, {
    readFile: io.readFile ?? nativeReadFile,
    realpath: io.realpath ?? nativeRealpath,
  });
  const roots = {};
  for (const [name, reference, label] of [
    ['systemReceipt', releasePin.systemReceipt, 'system receipt'],
    ['routerReceipt', releasePin.routerReceipt, 'router receipt'],
    ['compilerReceipt', releasePin.compilerReceipt, 'compiler receipt'],
    ['portableReceipt', releasePin.portableReceipt, 'portable receipt'],
    ['portableManifest', releasePin.portableManifest, 'portable manifest'],
  ]) {
    const bytes = await reader.read(reference, label);
    roots[name] = { bytes, digest: sha256(bytes), value: parseJson(bytes, label) };
  }

  const system = roots.systemReceipt.value;
  const router = roots.routerReceipt.value;
  const compiler = roots.compilerReceipt.value;
  const portableReceipt = roots.portableReceipt.value;
  const manifest = roots.portableManifest.value;
  requireIdentity(system, { id: 'eternities-godskills-system-v3', status: 'certified' }, 'system receipt');
  requireIdentity(router, { id: 'agent-native-router-v8', status: 'certified' }, 'router receipt');
  requireIdentity(compiler, { id: 'intent-compiler-v3', status: 'certified' }, 'compiler receipt');
  if (system.artifacts?.routerV8?.path !== releasePin.routerReceipt.path
      || system.artifacts?.routerV8?.sha256 !== roots.routerReceipt.digest) throw new Error('system receipt router binding mismatch');

  const capabilitiesById = verifyManifest(manifest, releasePin.portableManifest);
  verifyPortableReceipt(portableReceipt, roots.portableManifest.bytes, manifest);
  if (manifest.releaseEvidence?.topLevelSystem?.path !== releasePin.systemReceipt.path
      || manifest.releaseEvidence?.topLevelSystem?.sha256 !== roots.systemReceipt.digest) throw new Error('portable manifest system binding mismatch');

  await verifyArtifactSet(reader, router.artifacts, 'router');
  await verifyArtifactSet(reader, compiler.checkpoints, 'compiler checkpoint');
  if (compiler.artifacts?.arena) await reader.read(compiler.artifacts.arena, 'compiler arena');
  for (const [name, path] of Object.entries(compilerArtifactPaths)) {
    const expected = compiler.artifacts?.intentCompiler?.[name];
    if (!expected) throw new Error(`compiler artifact ${name} is unpinned`);
    await reader.read({ path, sha256: expected }, `compiler artifact ${name}`, { canonical: true });
  }
  const preference = releasePin.preference
    ? await verifyPreferenceRoot(reader, releasePin.preference, releasePin, roots)
    : undefined;
  const activation = releasePin.activation
    ? await verifyActivationRoot(reader, releasePin.activation)
    : undefined;
  const pin = frozen(structuredClone(releasePin));
  const rootDigests = frozen({
    ...Object.fromEntries(Object.entries(roots).map(([name, value]) => [name, value.digest])),
    ...(preference ? { preferenceReceipt: preference.releaseReceipt.sha256 } : {}),
    ...(activation ? { activationReceipt: activation.executableReceipt.sha256 } : {}),
  });
  const releaseDigest = sha256(canonicalJson({ pin, roots: rootDigests }));
  if (artifactCache.has(releaseDigest)) return artifactCache.get(releaseDigest);
  const verified = frozen({
    releaseDigest,
    root: reader.root,
    rootDigests,
    pin,
    manifest: frozen(structuredClone(manifest)),
    capabilitiesById,
    routerArtifacts: frozen(structuredClone(router.artifacts)),
    compilerArtifacts: frozen(structuredClone(compiler.artifacts)),
    ...(preference ? { preference } : {}),
    ...(activation ? { activation } : {}),
    readSelectedArtifact: async (reference, label) => reader.read(reference, label),
  });
  artifactCache.set(releaseDigest, verified);
  return verified;
}
