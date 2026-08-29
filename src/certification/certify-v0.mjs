import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { compileDistribution } from '../foundry/compile.mjs';

const requirementIds = Array.from({ length: 14 }, (_, index) => `GA-${String(index + 1).padStart(3, '0')}`);
const exclusions = [
  'commonwealth-runtime',
  'constellations',
  'hosted-service',
  'inspiration',
  'lunari-integration',
  'minecraft',
  'production-model-provider',
  'soul-runtime',
];

export function buildCertificationReceipt(input) {
  const rows = requirementIds.map((id) => {
    const evidence = input.requirements[id];
    if (!evidence) throw new Error(`certification evidence is missing ${id}`);
    if (!['pass', 'fail'].includes(evidence.status) || !Array.isArray(evidence.basis) || evidence.basis.length === 0) {
      throw new Error(`certification evidence is invalid for ${id}`);
    }
    return { id, status: evidence.status, basis: [...evidence.basis].sort() };
  });
  const status = input.testSuite.status === 'pass'
    && input.reproducibleBuild.status === 'pass'
    && rows.every((row) => row.status === 'pass')
    ? 'certified'
    : 'blocked';
  const unsigned = {
    schemaVersion: 1,
    status,
    source: input.source,
    testSuite: input.testSuite,
    reproducibleBuild: input.reproducibleBuild,
    requirements: rows,
    exclusions,
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
      else rejectPromise(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function directoryManifest(root) {
  const rows = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        const content = await readFile(path, 'utf8');
        rows.push({
          path: relative(root, path).replaceAll('\\', '/'),
          sha256: sha256Text(content),
        });
      }
    }
  }
  await walk(root);
  return rows;
}

const requirementEvidence = {
  'GA-001': ['tests/vessel-migration.test.mjs'],
  'GA-002': ['tests/foundry.test.mjs'],
  'GA-003': ['tests/journal-recovery.test.mjs'],
  'GA-004': ['tests/scheduler-arbiter.test.mjs'],
  'GA-005': ['tests/action-awareness.test.mjs', 'tests/scheduler-arbiter.test.mjs'],
  'GA-006': ['tests/action-awareness.test.mjs', 'tests/scheduler-arbiter.test.mjs'],
  'GA-007': ['tests/godskills-adapter.test.mjs'],
  'GA-008': ['tests/action-awareness.test.mjs'],
  'GA-009': ['tests/action-awareness.test.mjs', 'tests/vessel-migration.test.mjs'],
  'GA-010': ['tests/vessel-migration.test.mjs'],
  'GA-011': ['tests/memory-provenance.test.mjs'],
  'GA-012': ['tests/vessel-migration.test.mjs'],
  'GA-013': ['tests/action-awareness.test.mjs', 'tests/journal-recovery.test.mjs', 'tests/vessel-migration.test.mjs'],
  'GA-014': ['tests/foundry.test.mjs', 'tests/vessel-migration.test.mjs'],
};

export async function certifyV0({ repositoryRoot, outputPath }) {
  const root = resolve(repositoryRoot);
  const statusBefore = await run('git', ['status', '--porcelain'], root);
  if (statusBefore.stdout.trim() !== '') {
    throw new Error('certification requires a clean source worktree');
  }
  await Promise.all(Object.values(requirementEvidence).flat().map((path) => access(join(root, path))));

  const testRun = await run(process.execPath, ['--test'], root);
  const match = testRun.stdout.match(/ℹ tests (\d+)/);
  if (!match) throw new Error('certification could not read the Node test count');

  const temporaryRoot = resolve(tmpdir());
  const workspace = await mkdtemp(join(temporaryRoot, 'godagent-certification-'));
  const safePrefix = `${temporaryRoot}${sep}`.toLowerCase();
  if (!resolve(workspace).toLowerCase().startsWith(safePrefix)) {
    throw new Error('certification temporary path escaped the system temp directory');
  }
  let firstResult;
  let firstManifest;
  try {
    const inputs = {
      genomePath: join(root, 'fixtures', 'agent-genome.json'),
      promptArtifactPath: join(root, 'fixtures', 'prompt-os-artifact.md'),
      realmContractPath: join(root, 'fixtures', 'realm-contract.json'),
    };
    firstResult = await compileDistribution({ ...inputs, outputDir: join(workspace, 'first') });
    const secondResult = await compileDistribution({ ...inputs, outputDir: join(workspace, 'second') });
    firstManifest = await directoryManifest(join(workspace, 'first'));
    const secondManifest = await directoryManifest(join(workspace, 'second'));
    if (canonicalJson(firstManifest) !== canonicalJson(secondManifest)
        || firstResult.manifest.buildId !== secondResult.manifest.buildId) {
      throw new Error('fixture distribution is not reproducible');
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  const commit = (await run('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
  const requirements = Object.fromEntries(requirementIds.map((id) => [id, {
    status: 'pass',
    basis: requirementEvidence[id],
  }]));
  const receipt = buildCertificationReceipt({
    source: {
      commit,
      nodeVersion: process.version,
      testOutputDigest: sha256Text(testRun.stdout),
    },
    testSuite: { status: 'pass', tests: Number(match[1]) },
    reproducibleBuild: {
      status: 'pass',
      buildId: firstResult.manifest.buildId,
      artifactDigests: firstManifest,
    },
    requirements,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  return receipt;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const receipt = await certifyV0({
    repositoryRoot: root,
    outputPath: join(root, 'receipts', 'godagent-v0-certification.json'),
  });
  process.stdout.write(`${receipt.status} ${receipt.receiptDigest}\n`);
  if (receipt.status !== 'certified') process.exitCode = 1;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
