import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { loadCreatorLibrary } from '../creator/catalog.mjs';
import { applyCreatorCommand, createCreatorDraft } from '../creator/draft.mjs';
import { buildCreatorReviewSeal, finalizeCreatorDraft } from '../creator/finalize.mjs';
import { replayCreatorPreset } from '../creator/preset.mjs';
import { previewCreatorDraft } from '../creator/preview.mjs';
import { projectDeterministicTestSummary } from './certify-transactional-genesis-phase2.mjs';

const requirementIds = Object.freeze([
  'GC-001', 'GC-002', 'GC-003', 'GC-004',
  'GC-005', 'GC-006', 'GC-007', 'GC-008',
]);
const proofNames = Object.freeze([
  'cleanSource',
  'guardedSuite',
  'deterministicCatalog',
  'manualPresetParity',
  'reproducibleFinalization',
  'historicalReceipts',
]);
const exclusions = Object.freeze([
  'accessibility',
  'analytics',
  'browser-interface',
  'genesis-admission',
  'governed-evolution',
  'hosted-multi-tenant-persistence',
  'inspiration',
  'localization',
  'lunari-integration',
  'recommendation-intelligence',
  'soul-activation',
]);
const requirementEvidence = Object.freeze({
  'GC-001': ['tests/creator-catalog.test.mjs'],
  'GC-002': ['tests/creator-draft.test.mjs'],
  'GC-003': ['tests/creator-preset-parity.test.mjs'],
  'GC-004': ['tests/creator-catalog.test.mjs', 'tests/creator-contracts.test.mjs'],
  'GC-005': ['tests/creator-finalization.test.mjs', 'tests/creator-preview.test.mjs'],
  'GC-006': ['tests/creator-finalization.test.mjs'],
  'GC-007': ['tests/creator-finalization.test.mjs'],
  'GC-008': ['tests/creation-certification.test.mjs', 'tests/creator-finalization.test.mjs'],
});
const historicalReceiptDigests = Object.freeze({
  'receipts/godagent-v0-certification.json': '61465f7b72a56791733fb34bf5d07b0527c175f47479513bef01b4b20479ab95',
  'receipts/networked-cortex-certification.json': 'eeb1c84c5ace347c434476b9ea809f895e4c88e85b7f351c47eeb545740d7f57',
  'receipts/creation-forge-phase1-certification.json': 'bccee60a211253a2e111a14bed6572e86f6df0969c672c87a646ae2ce20eafd1',
  'receipts/transactional-genesis-phase2-certification.json': '48909b934b312bcf3b8cebf34c4bf8656dda52f0d43bf54b9c52868283b05d62',
});
const presetRefs = Object.freeze([
  'preset:aether-architect@1.0.0',
  'preset:quiet-cartographer@1.0.0',
]);
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const byteCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validateGate(label, gate) {
  if (!gate || !['pass', 'fail'].includes(gate.status)) throw new Error(`certification proof is invalid for ${label}`);
  if (!Array.isArray(gate.basis) || gate.basis.length === 0) throw new Error(`certification proof lacks basis for ${label}`);
  return { status: gate.status, basis: [...gate.basis].sort(byteCompare) };
}

export function buildCreatorProtocolCertificationReceipt(input) {
  const rows = requirementIds.map((id) => {
    if (!input.requirements[id]) throw new Error(`certification evidence is missing ${id}`);
    return { id, ...validateGate(id, input.requirements[id]) };
  });
  const proof = Object.fromEntries(proofNames.map((name) => [name, validateGate(name, input.proof[name])]));
  if (!input.testSuite || !['pass', 'fail'].includes(input.testSuite.status) || !Number.isInteger(input.testSuite.tests)) {
    throw new Error('certification test suite evidence is invalid');
  }
  const source = {
    ...input.source,
    creationBuildIds: [...input.source.creationBuildIds].sort(byteCompare),
  };
  const status = input.testSuite.status === 'pass'
    && rows.every((row) => row.status === 'pass')
    && Object.values(proof).every((gate) => gate.status === 'pass')
    ? 'certified'
    : 'rejected';
  const unsigned = {
    schemaVersion: 1,
    certificationId: 'creator-protocol-phase3',
    status,
    source,
    testSuite: input.testSuite,
    proof,
    requirements: rows,
    exclusions: [...exclusions],
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`${command} exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

async function recursiveByteRows(root, directory = root) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => byteCompare(left.name, right.name));
  const rows = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await recursiveByteRows(root, path));
    else rows.push([relative(root, path).replaceAll('\\', '/'), sha256Bytes(await readFile(path))]);
  }
  return rows;
}

async function recursiveByteManifest(root) {
  return Object.fromEntries(await recursiveByteRows(root));
}

function replayManually(initial, choices) {
  let current = initial;
  for (const choice of choices) {
    current = applyCreatorCommand({
      draft: current,
      command: { schemaVersion: 1, ...choice, expectedDraftDigest: current.draftDigest },
    });
  }
  return current;
}

export async function buildCreatorFixture({ repositoryRoot, outputRoot }) {
  const root = resolve(repositoryRoot);
  const target = resolve(outputRoot);
  await mkdir(target, { recursive: true });
  const fixtureRoot = join(root, 'fixtures');
  const options = {
    policyPath: join(fixtureRoot, 'creation', 'creation-policy.json'),
    expectedPolicyDigest,
    moduleDirectory: join(fixtureRoot, 'creation', 'modules'),
    expressionDirectory: join(fixtureRoot, 'creator', 'expressions'),
    presetDirectory: join(fixtureRoot, 'creator', 'presets'),
  };
  const library = await loadCreatorLibrary(options);
  const rows = [];
  for (const presetRef of presetRefs) {
    const preset = library.sourceLoader.resolvePreset(presetRef);
    const initial = createCreatorDraft({
      catalogDigest: library.catalog.catalogDigest,
      creatorRef: 'creator:eternities-certifier',
    });
    const manual = replayManually(initial, preset.choices);
    const replayed = replayCreatorPreset({ draft: initial, preset });
    const manualPreview = previewCreatorDraft({ draft: manual, ...library });
    const preview = previewCreatorDraft({ draft: replayed, ...library });
    const parityProjection = {
      manualDraftDigest: manual.draftDigest,
      presetDraftDigest: replayed.draftDigest,
      manualPreviewDigest: manualPreview.previewDigest,
      presetPreviewDigest: preview.previewDigest,
    };
    if (canonicalJson(manual) !== canonicalJson(replayed)
        || manualPreview.status !== 'ready'
        || preview.status !== 'ready'
        || manualPreview.previewDigest !== preview.previewDigest) {
      throw new Error(`manual and preset creator paths diverged: ${presetRef}`);
    }
    const reviewSeal = buildCreatorReviewSeal({
      catalogDigest: library.catalog.catalogDigest,
      draftDigest: replayed.draftDigest,
      previewDigest: preview.previewDigest,
    });
    const fixtureName = presetRef.slice('preset:'.length).replace('@', '-');
    const finalized = await finalizeCreatorDraft({
      draft: replayed,
      ...library,
      reviewSeal,
      sourceDirectory: join(target, fixtureName, 'source'),
      outputDirectory: join(target, fixtureName, 'output'),
      expectedPolicyDigest,
    });
    rows.push({
      presetRef,
      draftDigest: replayed.draftDigest,
      previewDigest: preview.previewDigest,
      manualPresetParityDigest: sha256Value(parityProjection),
      creationBuildId: finalized.manifest.buildId,
    });
  }
  rows.sort((left, right) => byteCompare(left.presetRef, right.presetRef));
  const fixture = {
    schemaVersion: 1,
    catalogDigest: library.catalog.catalogDigest,
    presets: rows,
  };
  return Object.freeze({
    fixture: Object.freeze(structuredClone(fixture)),
    byteManifest: Object.freeze(await recursiveByteManifest(target)),
  });
}

async function verifyHistoricalReceipts(root) {
  const actual = {};
  for (const [path, expected] of Object.entries(historicalReceiptDigests)) {
    const digest = sha256Text(await readFile(join(root, path), 'utf8'));
    if (digest !== expected) throw new Error(`historical receipt changed: ${path}`);
    actual[path] = digest;
  }
  return actual;
}

export async function certifyCreatorProtocolPhase3({ repositoryRoot, outputPath }) {
  const root = resolve(repositoryRoot);
  const statusBefore = await run('git', ['status', '--porcelain'], root);
  if (statusBefore.stdout.trim() !== '') throw new Error('certification requires a clean source worktree');
  const historicalDigests = await verifyHistoricalReceipts(root);
  const specificationText = await readFile(join(root, 'docs', 'superpowers', 'specs', '2026-08-29-godagent-deterministic-creator-protocol-design.md'), 'utf8');
  const planText = await readFile(join(root, 'docs', 'superpowers', 'plans', '2026-08-29-godagent-deterministic-creator-protocol-phase-3.md'), 'utf8');
  const guard = join(root, 'src', 'certification', 'no-network-guard.mjs');
  const testRun = await run(process.execPath, ['--import', pathToFileURL(guard).href, '--test'], root);
  const testSummary = projectDeterministicTestSummary(testRun.stdout);

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'godagent-creator-cert-'));
  let left;
  let right;
  try {
    left = await buildCreatorFixture({ repositoryRoot: root, outputRoot: join(temporaryRoot, 'left') });
    right = await buildCreatorFixture({ repositoryRoot: root, outputRoot: join(temporaryRoot, 'right') });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  if (canonicalJson(left.fixture) !== canonicalJson(right.fixture)
      || canonicalJson(left.byteManifest) !== canonicalJson(right.byteManifest)) {
    throw new Error('creator fixture is not byte-reproducible');
  }

  const statusAfter = await run('git', ['status', '--porcelain'], root);
  if (statusAfter.stdout.trim() !== '') throw new Error('certification changed source before receipt write');
  const commit = (await run('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
  const testFileManifest = await recursiveByteManifest(join(root, 'tests'));
  const parityDigest = sha256Value(left.fixture.presets.map((row) => ({
    presetRef: row.presetRef,
    digest: row.manualPresetParityDigest,
  })));
  const requirements = Object.fromEntries(requirementIds.map((id) => [id, {
    status: 'pass',
    basis: requirementEvidence[id],
  }]));
  const receipt = buildCreatorProtocolCertificationReceipt({
    source: {
      commit,
      nodeVersion: process.version,
      specificationDigest: sha256Text(specificationText),
      planDigest: sha256Text(planText),
      testSummaryDigest: sha256Value(testSummary),
      testFileManifestDigest: sha256Value(testFileManifest),
      fixtureCatalogDigest: left.fixture.catalogDigest,
      manualPresetParityDigest: parityDigest,
      creationBuildIds: left.fixture.presets.map((row) => row.creationBuildId),
      historicalReceiptDigests: historicalDigests,
    },
    testSuite: { status: 'pass', tests: testSummary.tests },
    proof: {
      cleanSource: { status: 'pass', basis: ['git status --porcelain before and after proof execution'] },
      guardedSuite: { status: 'pass', basis: ['src/certification/no-network-guard.mjs', 'guarded complete Node test suite'] },
      deterministicCatalog: { status: 'pass', basis: ['two isolated catalog loads', left.fixture.catalogDigest] },
      manualPresetParity: { status: 'pass', basis: ['manual commands and preset replay share ordinary command path', parityDigest] },
      reproducibleFinalization: { status: 'pass', basis: ['two byte-identical isolated creator fixture roots', sha256Value(left.byteManifest)] },
      historicalReceipts: { status: 'pass', basis: Object.entries(historicalDigests).map(([path, digest]) => `${path}:${digest}`) },
    },
    requirements,
  });
  if (receipt.status !== 'certified') throw new Error('creator protocol certification was rejected');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  return receipt;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const receipt = await certifyCreatorProtocolPhase3({
    repositoryRoot: root,
    outputPath: join(root, 'receipts', 'creator-protocol-phase3-certification.json'),
  });
  process.stdout.write(`${receipt.status} ${receipt.receiptDigest}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
