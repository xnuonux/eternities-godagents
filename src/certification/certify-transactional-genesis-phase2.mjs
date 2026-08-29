import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { compileCreation } from '../creation/compile.mjs';
import { compileDistribution } from '../foundry/compile.mjs';
import { prepareGenesis } from '../genesis/coordinator.mjs';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';

const requirementIds = Object.freeze(['GF-006', 'GF-007', 'GF-008', 'GF-009', 'GF-012']);
const proofNames = Object.freeze(['cleanSource', 'guardedSuite', 'reproducibleGenesis', 'failureInjection', 'historicalReceipts']);
const exclusions = Object.freeze([
  'collective-team-memory',
  'creator-interface',
  'governed-evolution',
  'hosted-multi-tenant-durability',
  'live-provider-quality',
  'lunari-integration',
  'soul-activation',
]);
const historicalReceiptDigests = Object.freeze({
  'receipts/godagent-v0-certification.json': '61465f7b72a56791733fb34bf5d07b0527c175f47479513bef01b4b20479ab95',
  'receipts/networked-cortex-certification.json': 'eeb1c84c5ace347c434476b9ea809f895e4c88e85b7f351c47eeb545740d7f57',
  'receipts/creation-forge-phase1-certification.json': 'bccee60a211253a2e111a14bed6572e86f6df0969c672c87a646ae2ce20eafd1',
});
const requirementEvidence = Object.freeze({
  'GF-006': ['tests/genesis-coordinator.test.mjs', 'tests/keel-reference-backend.test.mjs'],
  'GF-007': ['tests/keel-checkpoint-policy.test.mjs'],
  'GF-008': ['tests/persistent-vessel.test.mjs'],
  'GF-009': ['tests/temporary-worker-boundary.test.mjs'],
  'GF-012': ['tests/genesis-coordinator.test.mjs', 'tests/persistent-vessel.test.mjs'],
});
const expectedCreationPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixedTime = '2026-08-29T10:00:00.000Z';
const byteCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validateGate(label, gate) {
  if (!gate || !['pass', 'fail'].includes(gate.status)) throw new Error(`certification proof is invalid for ${label}`);
  if (!Array.isArray(gate.basis) || gate.basis.length === 0) throw new Error(`certification proof lacks basis for ${label}`);
  return { status: gate.status, basis: [...gate.basis].sort(byteCompare) };
}

export function buildTransactionalGenesisCertificationReceipt(input) {
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
    certificationId: 'transactional-genesis-phase2',
    status,
    source: input.source,
    testSuite: input.testSuite,
    proof,
    requirements: rows,
    exclusions: [...exclusions],
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

export function projectDeterministicTestSummary(stdout) {
  const cases = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^([✔✖])\s+(.+?)\s+\([0-9.]+ms\)$/u);
    if (match) cases.push({ name: match[2], status: match[1] === '✔' ? 'pass' : 'fail' });
  }
  cases.sort((left, right) => byteCompare(`${left.status}:${left.name}`, `${right.status}:${right.name}`));
  const readCount = (label) => {
    const match = stdout.match(new RegExp(`^ℹ ${label} (\\d+)$`, 'mu'));
    if (!match) throw new Error(`certification could not read Node ${label} count`);
    return Number(match[1]);
  };
  const summary = {
    tests: readCount('tests'),
    pass: readCount('pass'),
    fail: readCount('fail'),
    cases,
  };
  if (summary.cases.length !== summary.tests) throw new Error('certification test case summary is incomplete');
  return Object.freeze(summary);
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

async function verifyHistoricalReceipts(root) {
  const actual = {};
  for (const [path, expected] of Object.entries(historicalReceiptDigests)) {
    const digest = sha256Text(await readFile(join(root, path), 'utf8'));
    if (digest !== expected) throw new Error(`historical receipt changed: ${path}`);
    actual[path] = digest;
  }
  return actual;
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

export async function buildGenesisFixture({ repositoryRoot, outputRoot }) {
  const root = resolve(repositoryRoot);
  const target = resolve(outputRoot);
  await mkdir(target, { recursive: true });
  const creationDir = join(target, 'creation');
  const distributionDir = join(target, 'distribution');
  const realmPath = join(target, 'realm-contract-source.json');
  const promptPath = join(target, 'prompt-os-source.md');
  const creation = await compileCreation({
    candidatePath: join(root, 'fixtures', 'creation', 'creation-candidate.json'),
    policyPath: join(root, 'fixtures', 'creation', 'creation-policy.json'),
    expectedPolicyDigest: expectedCreationPolicyDigest,
    expressionPath: join(root, 'fixtures', 'creation', 'expression-overlay.json'),
    moduleDirectory: join(root, 'fixtures', 'creation', 'modules'),
    outputDir: creationDir,
  });
  const realm = JSON.parse(await readFile(join(root, 'fixtures', 'realm-contract.json'), 'utf8'));
  realm.capabilities = [...realm.capabilities, 'filesystem.read', 'filesystem.write'];
  await writeFile(realmPath, `${canonicalJson(realm)}\n`, 'utf8');
  await writeFile(
    promptPath,
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: phase2.certification.json -->\n# Certified genesis fixture\n',
    'utf8',
  );
  await compileDistribution({
    genomePath: join(creationDir, 'agent-genome.json'),
    promptArtifactPath: promptPath,
    realmContractPath: realmPath,
    outputDir: distributionDir,
  });
  const transactionDir = join(target, 'transaction');
  const journalPath = join(target, 'vessel', 'journal.jsonl');
  const snapshotPath = join(target, 'vessel', 'snapshot.json');
  const keelAdapter = createLocalKeelBackend({ root: join(target, 'keels'), clock: () => fixedTime });
  const result = await prepareGenesis({
    creationDir,
    distributionDir,
    expectedPolicyDigest: expectedCreationPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    instanceId: 'certified-godagent-1',
    creatorRef: 'creator:eternities-certifier',
    transactionDir,
    journalPath,
    snapshotPath,
    keelAdapter,
    clock: () => fixedTime,
    initialCheckpoint: {
      purpose: 'certify transactional genesis without activating Soul',
      constraints: ['local reference backend only', 'verify every durable boundary'],
      carry: ['creator interface remains excluded'],
    },
  });
  return Object.freeze({
    genesisReceipt: result.genesisReceipt,
    byteManifest: await recursiveByteManifest(target),
  });
}

export async function certifyTransactionalGenesisPhase2({ repositoryRoot, outputPath }) {
  const root = resolve(repositoryRoot);
  const statusBefore = await run('git', ['status', '--porcelain'], root);
  if (statusBefore.stdout.trim() !== '') throw new Error('certification requires a clean source worktree');
  const historicalDigests = await verifyHistoricalReceipts(root);
  const specificationText = await readFile(join(root, 'docs', 'superpowers', 'specs', '2026-08-29-godagent-transactional-genesis-and-keel-design.md'), 'utf8');
  const planText = await readFile(join(root, 'docs', 'superpowers', 'plans', '2026-08-29-godagent-transactional-genesis-phase-2.md'), 'utf8');
  const guard = join(root, 'src', 'certification', 'no-network-guard.mjs');
  const testRun = await run(process.execPath, ['--import', pathToFileURL(guard).href, '--test'], root);
  const testSummary = projectDeterministicTestSummary(testRun.stdout);

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'godagent-genesis-cert-'));
  let left;
  let right;
  try {
    left = await buildGenesisFixture({ repositoryRoot: root, outputRoot: join(temporaryRoot, 'left') });
    right = await buildGenesisFixture({ repositoryRoot: root, outputRoot: join(temporaryRoot, 'right') });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  if (canonicalJson(left.byteManifest) !== canonicalJson(right.byteManifest)
      || canonicalJson(left.genesisReceipt) !== canonicalJson(right.genesisReceipt)) {
    throw new Error('transactional genesis is not byte-reproducible');
  }

  const statusAfter = await run('git', ['status', '--porcelain'], root);
  if (statusAfter.stdout.trim() !== '') throw new Error('certification changed source before receipt write');
  const commit = (await run('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
  const testFileManifest = await recursiveByteManifest(join(root, 'tests'));
  const requirements = Object.fromEntries(requirementIds.map((id) => [id, {
    status: 'pass',
    basis: requirementEvidence[id],
  }]));
  const receipt = buildTransactionalGenesisCertificationReceipt({
    source: {
      commit,
      nodeVersion: process.version,
      testSummaryDigest: sha256Value(testSummary),
      testFileManifestDigest: sha256Value(testFileManifest),
      specificationDigest: sha256Text(specificationText),
      planDigest: sha256Text(planText),
      genesisProjectionDigest: sha256Value(left.genesisReceipt),
      historicalReceiptDigests: historicalDigests,
    },
    testSuite: { status: 'pass', tests: testSummary.tests },
    proof: {
      cleanSource: { status: 'pass', basis: ['git status --porcelain before and after proof execution'] },
      guardedSuite: { status: 'pass', basis: ['src/certification/no-network-guard.mjs', 'guarded complete Node test suite'] },
      reproducibleGenesis: { status: 'pass', basis: ['two byte-identical fresh genesis roots', left.genesisReceipt.receiptDigest] },
      failureInjection: { status: 'pass', basis: ['tests/genesis-coordinator.test.mjs', 'seven durable interruption boundaries'] },
      historicalReceipts: { status: 'pass', basis: Object.entries(historicalDigests).map(([path, digest]) => `${path}:${digest}`) },
    },
    requirements,
  });
  if (receipt.status !== 'certified') throw new Error('transactional genesis certification was rejected');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  return receipt;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const receipt = await certifyTransactionalGenesisPhase2({
    repositoryRoot: root,
    outputPath: join(root, 'receipts', 'transactional-genesis-phase2-certification.json'),
  });
  process.stdout.write(`${receipt.status} ${receipt.receiptDigest}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
