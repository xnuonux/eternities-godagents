import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';

const requirementIds = Array.from({ length: 10 }, (_, index) => `NC-${String(index + 1).padStart(3, '0')}`);
const historicalV0Sha256 = '61465f7b72a56791733fb34bf5d07b0527c175f47479513bef01b4b20479ab95';
const exclusions = [
  'commercial-provider-compatibility',
  'hosted-service',
  'inspiration',
  'live-provider-cost',
  'live-provider-latency',
  'lunari-integration',
  'soul-runtime',
];

const requirementEvidence = {
  'NC-001': ['tests/cortex-result.test.mjs'],
  'NC-002': ['tests/openai-compatible.test.mjs'],
  'NC-003': ['tests/receipt-safety.test.mjs'],
  'NC-004': ['tests/inference-lifecycle.test.mjs'],
  'NC-005': ['tests/networked-vessel.test.mjs'],
  'NC-006': ['tests/host-policy.test.mjs'],
  'NC-007': ['tests/local-cli.test.mjs'],
  'NC-008': ['tests/networked-secret-containment.test.mjs'],
  'NC-009': ['tests/networked-secret-containment.test.mjs', 'tests/vessel-migration.test.mjs'],
  'NC-010': ['tests/networked-certification.test.mjs', 'src/certification/no-network-guard.mjs'],
};

function validateProofGate(name, gate) {
  if (!gate || !['pass', 'fail'].includes(gate.status)) throw new Error(`certification proof is invalid for ${name}`);
  if (name === 'historicalReceipt') {
    if (typeof gate.sha256 !== 'string' || gate.sha256.length !== 64) throw new Error('historical receipt proof lacks sha256');
  } else if (!Array.isArray(gate.basis) || gate.basis.length === 0) {
    throw new Error(`certification proof lacks basis for ${name}`);
  }
}

export function buildNetworkedCertificationReceipt(input) {
  const rows = requirementIds.map((id) => {
    const evidence = input.requirements[id];
    if (!evidence) throw new Error(`certification evidence is missing ${id}`);
    if (!['pass', 'fail'].includes(evidence.status) || !Array.isArray(evidence.basis) || evidence.basis.length === 0) {
      throw new Error(`certification evidence is invalid for ${id}`);
    }
    return { id, status: evidence.status, basis: [...evidence.basis].sort() };
  });
  for (const name of ['canaryContainment', 'networkIsolation', 'historicalReceipt']) {
    validateProofGate(name, input.proof[name]);
  }
  const status = input.testSuite.status === 'pass'
    && Object.values(input.proof).every((gate) => gate.status === 'pass')
    && rows.every((row) => row.status === 'pass')
    ? 'certified'
    : 'blocked';
  const unsigned = {
    schemaVersion: 1,
    certificationId: 'networked-cortex-v1',
    status,
    source: input.source,
    testSuite: input.testSuite,
    proof: input.proof,
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

export async function certifyNetworkedCortex({ repositoryRoot, outputPath }) {
  const root = resolve(repositoryRoot);
  const statusBefore = await run('git', ['status', '--porcelain'], root);
  if (statusBefore.stdout.trim() !== '') throw new Error('certification requires a clean source worktree');
  await Promise.all(Object.values(requirementEvidence).flat().map((path) => access(join(root, path))));

  const designPath = join(root, 'docs', 'superpowers', 'specs', '2026-08-29-networked-cortex-host-design.md');
  const historicalReceiptPath = join(root, 'receipts', 'godagent-v0-certification.json');
  const [designText, historicalReceiptText] = await Promise.all([
    readFile(designPath, 'utf8'),
    readFile(historicalReceiptPath, 'utf8'),
  ]);
  const historicalDigest = sha256Text(historicalReceiptText);
  if (historicalDigest !== historicalV0Sha256) throw new Error('historical v0 receipt changed');

  const guard = join(root, 'src', 'certification', 'no-network-guard.mjs');
  const testRun = await run(process.execPath, ['--import', pathToFileURL(guard).href, '--test'], root);
  const match = testRun.stdout.match(/ℹ tests (\d+)/);
  if (!match) throw new Error('certification could not read the Node test count');

  const commit = (await run('git', ['rev-parse', 'HEAD'], root)).stdout.trim();
  const requirements = Object.fromEntries(requirementIds.map((id) => [id, {
    status: 'pass',
    basis: requirementEvidence[id],
  }]));
  const receipt = buildNetworkedCertificationReceipt({
    source: {
      commit,
      nodeVersion: process.version,
      testOutputDigest: sha256Text(testRun.stdout),
      designDigest: sha256Text(designText),
    },
    testSuite: { status: 'pass', tests: Number(match[1]) },
    proof: {
      canaryContainment: { status: 'pass', basis: ['tests/networked-secret-containment.test.mjs'] },
      networkIsolation: { status: 'pass', basis: ['src/certification/no-network-guard.mjs', 'guarded-complete-test-suite'] },
      historicalReceipt: { status: 'pass', sha256: historicalDigest },
    },
    requirements,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  return receipt;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const receipt = await certifyNetworkedCortex({
    repositoryRoot: root,
    outputPath: join(root, 'receipts', 'networked-cortex-certification.json'),
  });
  process.stdout.write(`${receipt.status} ${receipt.receiptDigest}\n`);
  if (receipt.status !== 'certified') process.exitCode = 1;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
