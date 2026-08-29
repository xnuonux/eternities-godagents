import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { compileCreation, verifyCreationBuild } from '../creation/compile.mjs';

const requirementIds = ['GF-001', 'GF-002', 'GF-003', 'GF-004', 'GF-005', 'GF-010', 'GF-011'];
const proofNames = ['cleanSource', 'guardedSuite', 'reproducibleBuild', 'historicalReceipts'];
const historicalReceiptDigests = Object.freeze({
  'receipts/godagent-v0-certification.json': '61465f7b72a56791733fb34bf5d07b0527c175f47479513bef01b4b20479ab95',
  'receipts/networked-cortex-certification.json': 'eeb1c84c5ace347c434476b9ea809f895e4c88e85b7f351c47eeb545740d7f57',
});
const exclusions = Object.freeze([
  'genesis-transaction',
  'keel-binding',
  'cross-agent-delegation',
  'governed-evolution',
  'creator-interface',
  'live-provider-quality',
  'lunari-integration',
  'soul-runtime',
  'vessel-instantiation',
]);
const requirementEvidence = Object.freeze({
  'GF-001': ['tests/creation-compiler.test.mjs'],
  'GF-002': ['tests/creation-contracts.test.mjs', 'tests/creation-projection.test.mjs'],
  'GF-003': ['tests/creation-compatibility.test.mjs', 'tests/creation-projection.test.mjs'],
  'GF-004': ['tests/creation-compatibility.test.mjs'],
  'GF-005': ['tests/creation-compiler.test.mjs'],
  'GF-010': ['tests/creation-schemas.test.mjs', 'tests/creation-compatibility.test.mjs'],
  'GF-011': ['tests/creation-schemas.test.mjs', 'tests/creation-compatibility.test.mjs'],
});

const byteCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validateGate(label, gate) {
  if (!gate || !['pass', 'fail'].includes(gate.status)) throw new Error(`certification proof is invalid for ${label}`);
  if (!Array.isArray(gate.basis) || gate.basis.length === 0) throw new Error(`certification proof lacks basis for ${label}`);
  return { status: gate.status, basis: [...gate.basis].sort(byteCompare) };
}

export function buildCreationForgeCertificationReceipt(input) {
  const rows = requirementIds.map((id) => {
    if (!input.requirements[id]) throw new Error(`certification evidence is missing ${id}`);
    return { id, ...validateGate(id, input.requirements[id]) };
  });
  const proof = Object.fromEntries(proofNames.map((name) => [name, validateGate(name, input.proof[name])]));
  if (!input.testSuite || !['pass', 'fail'].includes(input.testSuite.status) || !Number.isInteger(input.testSuite.tests)) {
    throw new Error('certification test suite evidence is invalid');
  }
  const status = input.testSuite.status === 'pass'
    && Object.values(proof).every((gate) => gate.status === 'pass')
    && rows.every((row) => row.status === 'pass')
    ? 'certified'
    : 'rejected';
  const unsigned = {
    schemaVersion: 1,
    certificationId: 'creation-forge-phase1',
    status,
    source: input.source,
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

async function recursiveByteManifest(directory) {
  const files = (await readdir(directory)).sort(byteCompare);
  return Object.fromEntries(await Promise.all(files.map(async (file) => [
    file,
    sha256Bytes(await readFile(join(directory, file))),
  ])));
}

async function verifyHistoricalReceipts(root) {
  const actual = {};
  for (const [relativePath, expected] of Object.entries(historicalReceiptDigests)) {
    const digest = sha256Text(await readFile(join(root, relativePath), 'utf8'));
    if (digest !== expected) throw new Error(`historical receipt changed: ${relativePath}`);
    actual[relativePath] = digest;
  }
  return actual;
}

export async function certifyCreationForgePhase1({ repositoryRoot, outputPath }) {
  const root = resolve(repositoryRoot);
  const statusBefore = await run('git', ['status', '--porcelain'], root);
  if (statusBefore.stdout.trim() !== '') throw new Error('certification requires a clean source worktree');
  await Promise.all(Object.values(requirementEvidence).flat().map((path) => access(join(root, path))));

  const specificationPath = join(root, 'docs', 'superpowers', 'specs', '2026-08-29-godagent-creation-forge-and-keel-design.md');
  const specificationText = await readFile(specificationPath, 'utf8');
  const historicalDigests = await verifyHistoricalReceipts(root);
  const guard = join(root, 'src', 'certification', 'no-network-guard.mjs');
  const testRun = await run(process.execPath, ['--import', pathToFileURL(guard).href, '--test'], root);
  const testCount = testRun.stdout.match(/ℹ tests (\d+)/);
  if (!testCount) throw new Error('certification could not read the Node test count');

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'godagent-creation-cert-'));
  let left;
  let right;
  let leftBytes;
  let rightBytes;
  try {
    const options = {
      candidatePath: join(root, 'fixtures', 'creation', 'creation-candidate.json'),
      policyPath: join(root, 'fixtures', 'creation', 'creation-policy.json'),
      expressionPath: join(root, 'fixtures', 'creation', 'expression-overlay.json'),
      moduleDirectory: join(root, 'fixtures', 'creation', 'modules'),
    };
    left = await compileCreation({ ...options, outputDir: join(temporaryRoot, 'left') });
    right = await compileCreation({ ...options, outputDir: join(temporaryRoot, 'right') });
    await Promise.all([verifyCreationBuild(left.outputDir), verifyCreationBuild(right.outputDir)]);
    [leftBytes, rightBytes] = await Promise.all([
      recursiveByteManifest(left.outputDir),
      recursiveByteManifest(right.outputDir),
    ]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  if (canonicalJson(leftBytes) !== canonicalJson(rightBytes)
      || left.manifest.buildId !== right.manifest.buildId) {
    throw new Error('creation builds are not byte-reproducible');
  }

  const statusAfter = await run('git', ['status', '--porcelain'], root);
  if (statusAfter.stdout.trim() !== '') throw new Error('certification changed source before receipt write');
  const commit = (await run('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
  const requirements = Object.fromEntries(requirementIds.map((id) => [id, {
    status: 'pass',
    basis: requirementEvidence[id],
  }]));
  const receipt = buildCreationForgeCertificationReceipt({
    source: {
      commit,
      nodeVersion: process.version,
      testOutputDigest: sha256Text(testRun.stdout),
      specificationDigest: sha256Text(specificationText),
      creationBuildId: left.manifest.buildId,
      historicalReceiptDigests: historicalDigests,
    },
    testSuite: { status: 'pass', tests: Number(testCount[1]) },
    proof: {
      cleanSource: { status: 'pass', basis: ['git status --porcelain before and after proof execution'] },
      guardedSuite: { status: 'pass', basis: ['src/certification/no-network-guard.mjs', 'guarded complete Node test suite'] },
      reproducibleBuild: { status: 'pass', basis: ['two fresh byte-identical creation artifact sets', left.manifest.buildId] },
      historicalReceipts: { status: 'pass', basis: Object.entries(historicalDigests).map(([path, digest]) => `${path}:${digest}`) },
    },
    requirements,
  });
  if (receipt.status !== 'certified') throw new Error('creation forge certification was rejected');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  return receipt;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const receipt = await certifyCreationForgePhase1({
    repositoryRoot: root,
    outputPath: join(root, 'receipts', 'creation-forge-phase1-certification.json'),
  });
  process.stdout.write(`${receipt.status} ${receipt.receiptDigest}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
