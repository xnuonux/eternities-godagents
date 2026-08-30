import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { previewOperatorPreset } from '../creator/operator-workflow.mjs';
import { createCreatorWebApp } from '../creator/web/app.mjs';
import { projectDeterministicTestSummary } from './certify-transactional-genesis-phase2.mjs';

const requirementIds = Object.freeze([
  'GVC-001', 'GVC-002', 'GVC-003', 'GVC-004', 'GVC-005',
  'GVC-006', 'GVC-007', 'GVC-008', 'GVC-009',
]);
const proofNames = Object.freeze([
  'cleanSource',
  'guardedSuite',
  'deterministicWebFixture',
  'historicalReceipts',
]);
const exclusions = Object.freeze([
  'accessibility-conformance',
  'analytics',
  'genesis-admission',
  'governed-evolution',
  'hosted-deployment',
  'inspiration',
  'keel-continuity',
  'localization',
  'lunari-integration',
  'model-routing',
  'multi-user-persistence',
  'realm-action',
  'recommendation-quality',
  'soul-activation',
]);
const requirementEvidence = Object.freeze({
  'GVC-001': ['tests/creator-web-server.test.mjs'],
  'GVC-002': ['tests/creator-web-app.test.mjs'],
  'GVC-003': ['tests/creator-web-app.test.mjs', 'tests/creator-operator-workflow.test.mjs'],
  'GVC-004': ['tests/creator-composition-workflow.test.mjs', 'tests/creator-web-app.test.mjs'],
  'GVC-005': ['tests/creator-web-app.test.mjs'],
  'GVC-006': ['tests/creator-web-app.test.mjs'],
  'GVC-007': ['tests/creator-web-app.test.mjs', 'tests/visual-creator-certification.test.mjs'],
  'GVC-008': ['tests/creator-web-app.test.mjs', 'tests/creator-web-assets.test.mjs'],
  'GVC-009': ['tests/visual-creator-certification.test.mjs'],
});
const historicalReceiptDigests = Object.freeze({
  'receipts/godagent-v0-certification.json': '61465f7b72a56791733fb34bf5d07b0527c175f47479513bef01b4b20479ab95',
  'receipts/networked-cortex-certification.json': 'eeb1c84c5ace347c434476b9ea809f895e4c88e85b7f351c47eeb545740d7f57',
  'receipts/creation-forge-phase1-certification.json': 'bccee60a211253a2e111a14bed6572e86f6df0969c672c87a646ae2ce20eafd1',
  'receipts/transactional-genesis-phase2-certification.json': '48909b934b312bcf3b8cebf34c4bf8656dda52f0d43bf54b9c52868283b05d62',
  'receipts/creator-protocol-phase3-certification.json': '6061ac85d48405717161ec8e4901b686d06be6cf4e5b31f82ea1beb2545b7b90',
});
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const expectedAetherBuildId = '87168c691b10c2d4f1780c3826b6d3f40cbcee18a63049fea77a1780b857b9f8';
const sessionToken = 'a'.repeat(64);
const byteCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validateGate(label, gate) {
  if (!gate || !['pass', 'fail'].includes(gate.status)) throw new Error(`certification proof is invalid for ${label}`);
  if (!Array.isArray(gate.basis) || gate.basis.length === 0) throw new Error(`certification proof lacks basis for ${label}`);
  return { status: gate.status, basis: [...gate.basis].sort(byteCompare) };
}

export function buildVisualCreatorCertificationReceipt(input) {
  const rows = requirementIds.map((id) => {
    if (!input.requirements[id]) throw new Error(`certification evidence is missing ${id}`);
    return { id, ...validateGate(id, input.requirements[id]) };
  });
  const proof = Object.fromEntries(proofNames.map((name) => [name, validateGate(name, input.proof[name])]));
  if (!input.testSuite || !['pass', 'fail'].includes(input.testSuite.status) || !Number.isInteger(input.testSuite.tests)) {
    throw new Error('certification test suite evidence is invalid');
  }
  const status = input.testSuite.status === 'pass'
    && rows.every((row) => row.status === 'pass')
    && Object.values(proof).every((gate) => gate.status === 'pass')
    ? 'certified'
    : 'rejected';
  const unsigned = {
    schemaVersion: 1,
    certificationId: 'visual-creator-shell-v1',
    status,
    source: structuredClone(input.source),
    testSuite: structuredClone(input.testSuite),
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

function webRequest(path, { method = 'GET', body } = {}) {
  const headers = { 'x-godagent-local-session': sessionToken };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`http://127.0.0.1:43117${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function responseValue(response, expectedStatus = 200) {
  const text = await response.text();
  if (response.status !== expectedStatus) throw new Error(`visual fixture request failed with status ${response.status}`);
  return JSON.parse(text);
}

export async function buildVisualCreatorFixture({ repositoryRoot, outputRoot }) {
  const root = resolve(repositoryRoot);
  const target = resolve(outputRoot);
  const fixtureRoot = join(root, 'fixtures');
  const operatorOptions = {
    policy: join(fixtureRoot, 'creation', 'creation-policy.json'),
    policyDigest: expectedPolicyDigest,
    modules: join(fixtureRoot, 'creation', 'modules'),
    expressions: join(fixtureRoot, 'creator', 'expressions'),
    presets: join(fixtureRoot, 'creator', 'presets'),
  };
  const workspace = join(target, 'workspace');
  const app = await createCreatorWebApp({ operatorOptions, workspace, sessionToken });
  const foundation = 'preset:aether-architect@1.0.0';
  const creator = 'creator:eternities-certifier';
  const preset = await previewOperatorPreset({ ...operatorOptions, preset: foundation, creator });
  const input = {
    foundation,
    creator,
    expression: preset.selection.expressionRef,
    moduleRefs: preset.selection.moduleRefs,
  };
  const catalog = await responseValue(await app.handle(webRequest('/api/catalog')));
  const preview = await responseValue(await app.handle(webRequest('/api/preview-composition', {
    method: 'POST',
    body: input,
  })));
  const acknowledgement = await responseValue(await app.handle(webRequest('/api/acknowledge-composition', {
    method: 'POST',
    body: { ...input, expectedPreviewDigest: preview.previewDigest },
  })));
  const finalized = await responseValue(await app.handle(webRequest('/api/finalize-composition', {
    method: 'POST',
    body: {
      ...input,
      expectedPreviewDigest: preview.previewDigest,
      reviewConfirmation: acknowledgement.reviewConfirmation,
    },
  })));
  if (preview.status !== 'ready' || finalized.status !== 'finalized'
      || finalized.creationBuildId !== expectedAetherBuildId) {
    throw new Error('visual fixture did not reproduce the certified Aether build');
  }
  const transactionRoot = join(workspace, 'builds', preview.previewDigest);
  const fixture = {
    schemaVersion: 1,
    catalogDigest: catalog.catalogDigest,
    compositionPreviewDigest: preview.previewDigest,
    draftDigest: preview.draftDigest,
    genomeDigest: finalized.genomeDigest,
    reviewSealDigest: finalized.reviewSealDigest,
    creationBuildId: finalized.creationBuildId,
  };
  return Object.freeze({
    fixture: Object.freeze(structuredClone(fixture)),
    byteManifest: Object.freeze(await recursiveByteManifest(transactionRoot)),
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

export async function certifyVisualCreatorShell({ repositoryRoot, outputPath }) {
  const root = resolve(repositoryRoot);
  const statusBefore = await run('git', ['status', '--porcelain'], root);
  if (statusBefore.stdout.trim() !== '') throw new Error('certification requires a clean source worktree');
  const historicalDigests = await verifyHistoricalReceipts(root);
  const specificationText = await readFile(join(
    root, 'docs', 'superpowers', 'specs', '2026-08-29-visual-creator-shell-certification.md',
  ), 'utf8');
  const planText = await readFile(join(
    root, 'docs', 'superpowers', 'plans', '2026-08-29-visual-creator-shell-certification.md',
  ), 'utf8');
  const guard = join(root, 'src', 'certification', 'no-network-guard.mjs');
  const testRun = await run(process.execPath, ['--import', pathToFileURL(guard).href, '--test'], root);
  const testSummary = projectDeterministicTestSummary(testRun.stdout);

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'godagent-visual-cert-'));
  let left;
  let right;
  try {
    left = await buildVisualCreatorFixture({ repositoryRoot: root, outputRoot: join(temporaryRoot, 'left') });
    right = await buildVisualCreatorFixture({ repositoryRoot: root, outputRoot: join(temporaryRoot, 'right') });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  if (canonicalJson(left.fixture) !== canonicalJson(right.fixture)
      || canonicalJson(left.byteManifest) !== canonicalJson(right.byteManifest)) {
    throw new Error('visual creator fixture is not byte-reproducible');
  }

  const statusAfter = await run('git', ['status', '--porcelain'], root);
  if (statusAfter.stdout.trim() !== '') throw new Error('certification changed source before receipt write');
  const commit = (await run('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
  const testFileManifest = await recursiveByteManifest(join(root, 'tests'));
  const sourceManifest = await recursiveByteManifest(join(root, 'src'));
  const webFixtureDigest = sha256Value({ fixture: left.fixture, byteManifest: left.byteManifest });
  const requirements = Object.fromEntries(requirementIds.map((id) => [id, {
    status: 'pass',
    basis: requirementEvidence[id],
  }]));
  const receipt = buildVisualCreatorCertificationReceipt({
    source: {
      commit,
      nodeVersion: process.version,
      specificationDigest: sha256Text(specificationText),
      planDigest: sha256Text(planText),
      testSummaryDigest: sha256Value(testSummary),
      testFileManifestDigest: sha256Value(testFileManifest),
      sourceManifestDigest: sha256Value(sourceManifest),
      catalogDigest: left.fixture.catalogDigest,
      compositionPreviewDigest: left.fixture.compositionPreviewDigest,
      creationBuildId: left.fixture.creationBuildId,
      webFixtureDigest,
      historicalReceiptDigests: historicalDigests,
    },
    testSuite: { status: 'pass', tests: testSummary.tests },
    proof: {
      cleanSource: { status: 'pass', basis: ['git status --porcelain before and after proof execution'] },
      guardedSuite: { status: 'pass', basis: ['src/certification/no-network-guard.mjs', 'guarded complete Node test suite'] },
      deterministicWebFixture: { status: 'pass', basis: ['two isolated pure-handler fixture roots', webFixtureDigest] },
      historicalReceipts: { status: 'pass', basis: Object.entries(historicalDigests).map(([path, digest]) => `${path}:${digest}`) },
    },
    requirements,
  });
  if (receipt.status !== 'certified') throw new Error('visual creator certification was rejected');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  return receipt;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const receipt = await certifyVisualCreatorShell({
    repositoryRoot: root,
    outputPath: join(root, 'receipts', 'visual-creator-shell-certification.json'),
  });
  process.stdout.write(`${receipt.status} ${receipt.receiptDigest}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
