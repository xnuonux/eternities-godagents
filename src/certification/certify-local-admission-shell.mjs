import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { compileCreation } from '../creation/compile.mjs';
import { admitLocalCreation } from '../genesis/local-admission.mjs';
import { projectDeterministicTestSummary } from './certify-transactional-genesis-phase2.mjs';

const requirementIds = Object.freeze([
  'GLA-001', 'GLA-002', 'GLA-003', 'GLA-004', 'GLA-005',
  'GLA-006', 'GLA-007', 'GLA-008', 'GLA-009',
]);
const proofNames = Object.freeze(['cleanSource', 'guardedSuite', 'deterministicAdmission', 'historicalReceipts']);
const exclusions = Object.freeze([
  'concurrent-same-user-hostile-path-manipulation',
  'governed-evolution',
  'host-authority',
  'hosted-persistence',
  'inspiration',
  'lunari-integration',
  'model-calls',
  'multi-user-operation',
  'realm-actions',
  'soul-activation',
  'vessel-start',
]);
const evidence = Object.freeze({
  'GLA-001': ['tests/local-admission.test.mjs'],
  'GLA-002': ['tests/local-admission.test.mjs'],
  'GLA-003': ['tests/local-admission.test.mjs'],
  'GLA-004': ['tests/local-admission.test.mjs'],
  'GLA-005': ['tests/local-admission.test.mjs'],
  'GLA-006': ['tests/local-admission.test.mjs'],
  'GLA-007': ['tests/local-admission-cli.test.mjs'],
  'GLA-008': ['tests/local-admission.test.mjs'],
  'GLA-009': ['tests/local-admission-certification.test.mjs'],
});
const historicalReceiptDigests = Object.freeze({
  'receipts/godagent-v0-certification.json': '61465f7b72a56791733fb34bf5d07b0527c175f47479513bef01b4b20479ab95',
  'receipts/networked-cortex-certification.json': 'eeb1c84c5ace347c434476b9ea809f895e4c88e85b7f351c47eeb545740d7f57',
  'receipts/creation-forge-phase1-certification.json': 'bccee60a211253a2e111a14bed6572e86f6df0969c672c87a646ae2ce20eafd1',
  'receipts/transactional-genesis-phase2-certification.json': '48909b934b312bcf3b8cebf34c4bf8656dda52f0d43bf54b9c52868283b05d62',
  'receipts/creator-protocol-phase3-certification.json': '6061ac85d48405717161ec8e4901b686d06be6cf4e5b31f82ea1beb2545b7b90',
  'receipts/visual-creator-shell-certification.json': 'e3bf6839a4c47c7aaa10ccc0ab3536c066cae9fdc3797a46ca35f77f6c4f8b6d',
});
const policyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixedTime = '2026-08-29T12:00:00.000Z';
const byteCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function gate(label, value) {
  if (!value || !['pass', 'fail'].includes(value.status)) throw new Error(`certification proof is invalid for ${label}`);
  if (!Array.isArray(value.basis) || value.basis.length === 0) throw new Error(`certification proof lacks basis for ${label}`);
  return { status: value.status, basis: [...value.basis].sort(byteCompare) };
}

export function buildLocalAdmissionCertificationReceipt(input) {
  const requirements = requirementIds.map((id) => {
    if (!input.requirements[id]) throw new Error(`certification evidence is missing ${id}`);
    return { id, ...gate(id, input.requirements[id]) };
  });
  const proof = Object.fromEntries(proofNames.map((name) => [name, gate(name, input.proof[name])]));
  if (!input.testSuite || !['pass', 'fail'].includes(input.testSuite.status) || !Number.isInteger(input.testSuite.tests)) {
    throw new Error('certification test suite evidence is invalid');
  }
  const status = input.testSuite.status === 'pass'
    && requirements.every((row) => row.status === 'pass')
    && Object.values(proof).every((row) => row.status === 'pass') ? 'certified' : 'rejected';
  const unsigned = {
    schemaVersion: 1,
    certificationId: 'local-admission-shell-v1',
    status,
    source: structuredClone(input.source),
    testSuite: structuredClone(input.testSuite),
    proof,
    requirements,
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

async function byteRows(root, directory = root) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => byteCompare(a.name, b.name));
  const rows = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await byteRows(root, path));
    else rows.push([relative(root, path).replaceAll('\\', '/'), sha256Bytes(await readFile(path))]);
  }
  return rows;
}

async function byteManifest(root) {
  return Object.fromEntries(await byteRows(root));
}

export async function buildLocalAdmissionFixture({ repositoryRoot, outputRoot }) {
  const root = resolve(repositoryRoot);
  const target = resolve(outputRoot);
  await mkdir(target, { recursive: true });
  const creationDir = join(target, 'source-creation');
  const creationRoot = join(root, 'fixtures', 'creation');
  const creation = await compileCreation({
    candidatePath: join(creationRoot, 'creation-candidate.json'),
    policyPath: join(creationRoot, 'creation-policy.json'),
    expectedPolicyDigest: policyDigest,
    expressionPath: join(creationRoot, 'expression-overlay.json'),
    moduleDirectory: join(creationRoot, 'modules'),
    outputDir: creationDir,
  });
  const promptArtifactPath = join(target, 'prompt-os-artifact.md');
  const realmContractPath = join(target, 'realm-contract.json');
  await writeFile(promptArtifactPath,
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: local-admission.certification.json -->\n# Certified local admission\n', 'utf8');
  const realm = {
    schemaVersion: 1,
    realmId: 'certified-local-admission-workbench',
    version: '1',
    trustModel: 'fixture-local',
    capabilities: ['filesystem.read', 'filesystem.write'],
    observations: [],
    hands: [],
    resources: { maxActionsPerCycle: 1 },
    privacy: { retention: 'test-only' },
    lifecycle: { entry: 'explicit', suspension: 'fail-closed', recovery: 'reconcile', exit: 'receipt-required' },
    compatibleDistributions: ['0.2.x'],
  };
  await writeFile(realmContractPath, `${canonicalJson(realm)}\n`, 'utf8');
  const result = await admitLocalCreation({
    creationDir,
    expectedPolicyDigest: policyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    promptArtifactPath,
    realmContractPath,
    workspace: join(target, 'workspace'),
    instanceId: 'certified-local-agent-1',
    creatorRef: 'creator:eternities-certifier',
    checkpointPurpose: 'certify inert local admission with Soul dormant',
    clock: () => fixedTime,
  });
  return Object.freeze({ result, byteManifest: Object.freeze(await byteManifest(target)) });
}

async function historical(root) {
  const actual = {};
  for (const [path, expected] of Object.entries(historicalReceiptDigests)) {
    const digest = sha256Text(await readFile(join(root, path), 'utf8'));
    if (digest !== expected) throw new Error(`historical receipt changed: ${path}`);
    actual[path] = digest;
  }
  return actual;
}

export async function certifyLocalAdmissionShell({ repositoryRoot, outputPath }) {
  const root = resolve(repositoryRoot);
  if ((await run('git', ['status', '--porcelain'], root)).stdout.trim() !== '') {
    throw new Error('certification requires a clean source worktree');
  }
  const historicalDigests = await historical(root);
  const spec = await readFile(join(root, 'docs', 'superpowers', 'specs', '2026-08-29-local-admission-shell-certification.md'), 'utf8');
  const plan = await readFile(join(root, 'docs', 'superpowers', 'plans', '2026-08-29-local-admission-shell-certification.md'), 'utf8');
  const guard = join(root, 'src', 'certification', 'no-network-guard.mjs');
  const testRun = await run(process.execPath, ['--import', pathToFileURL(guard).href, '--test'], root);
  const testSummary = projectDeterministicTestSummary(testRun.stdout);
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'godagent-local-admission-cert-'));
  let left;
  let right;
  try {
    left = await buildLocalAdmissionFixture({ repositoryRoot: root, outputRoot: join(temporaryRoot, 'left') });
    right = await buildLocalAdmissionFixture({ repositoryRoot: root, outputRoot: join(temporaryRoot, 'right') });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  if (canonicalJson(left.result) !== canonicalJson(right.result)
      || canonicalJson(left.byteManifest) !== canonicalJson(right.byteManifest)) {
    throw new Error('local admission fixture is not byte-reproducible');
  }
  if ((await run('git', ['status', '--porcelain'], root)).stdout.trim() !== '') {
    throw new Error('certification changed source before receipt write');
  }
  const commit = (await run('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
  const fixtureDigest = sha256Value({ result: left.result, byteManifest: left.byteManifest });
  const receipt = buildLocalAdmissionCertificationReceipt({
    source: {
      commit,
      nodeVersion: process.version,
      specificationDigest: sha256Text(spec),
      planDigest: sha256Text(plan),
      testSummaryDigest: sha256Value(testSummary),
      testFileManifestDigest: sha256Value(await byteManifest(join(root, 'tests'))),
      sourceManifestDigest: sha256Value(await byteManifest(join(root, 'src'))),
      fixtureDigest,
      creationBuildId: left.result.creationBuildId,
      distributionBuildId: left.result.distributionBuildId,
      genesisId: left.result.genesisId,
      keelId: left.result.keelId,
      historicalReceiptDigests: historicalDigests,
    },
    testSuite: { status: 'pass', tests: testSummary.tests },
    proof: {
      cleanSource: { status: 'pass', basis: ['git status --porcelain before and after proof execution'] },
      guardedSuite: { status: 'pass', basis: ['src/certification/no-network-guard.mjs', 'guarded complete Node test suite'] },
      deterministicAdmission: { status: 'pass', basis: ['two isolated byte-identical local admissions', fixtureDigest] },
      historicalReceipts: { status: 'pass', basis: Object.entries(historicalDigests).map(([path, digest]) => `${path}:${digest}`) },
    },
    requirements: Object.fromEntries(requirementIds.map((id) => [id, { status: 'pass', basis: evidence[id] }])),
  });
  if (receipt.status !== 'certified') throw new Error('local admission certification was rejected');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  return receipt;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const receipt = await certifyLocalAdmissionShell({
    repositoryRoot: root,
    outputPath: join(root, 'receipts', 'local-admission-shell-certification.json'),
  });
  process.stdout.write(`${receipt.status} ${receipt.receiptDigest}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
