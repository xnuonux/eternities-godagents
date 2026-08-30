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

function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function assertRelativePath(path) {
  if (typeof path !== 'string' || path.length === 0 || isAbsolute(path)
      || path.includes('\\') || path.split('/').includes('..')) {
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
    async read(reference, label, { canonical = false } = {}) {
      assertRelativePath(reference.path);
      const lexical = resolve(root, reference.path);
      assertContained(root, lexical);
      const actual = await io.realpath(lexical);
      assertContained(root, actual);
      const bytes = await io.readFile(actual);
      const digest = sha256(canonical ? canonicalText(bytes.toString('utf8')) : bytes);
      if (digest !== reference.sha256) throw new Error(`${label} digest mismatch`);
      if (reference.bytes !== undefined && bytes.length !== reference.bytes) throw new Error(`${label} byte count mismatch`);
      return bytes;
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

  await verifyArtifactSet(reader, system.artifacts, 'system');
  await verifyArtifactSet(reader, router.artifacts, 'router');
  await verifyArtifactSet(reader, compiler.checkpoints, 'compiler checkpoint');
  if (compiler.artifacts?.arena) await reader.read(compiler.artifacts.arena, 'compiler arena');
  for (const [name, path] of Object.entries(compilerArtifactPaths)) {
    const expected = compiler.artifacts?.intentCompiler?.[name];
    if (!expected) throw new Error(`compiler artifact ${name} is unpinned`);
    await reader.read({ path, sha256: expected }, `compiler artifact ${name}`, { canonical: true });
  }
  for (const [name, reference] of Object.entries(manifest.releaseEvidence ?? {})) {
    await reader.read(reference, `manifest release evidence ${name}`);
  }

  const pin = frozen(structuredClone(releasePin));
  const rootDigests = frozen(Object.fromEntries(Object.entries(roots).map(([name, value]) => [name, value.digest])));
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
  });
  artifactCache.set(releaseDigest, verified);
  return verified;
}
