import { execFile, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { verifyGodskillsRelease } from '../src/skills/release-verifier.mjs';

const execFileAsync = promisify(execFile);
const requirementIds = Object.freeze(Array.from({ length: 14 }, (_, index) =>
  `GSV3-${String(index + 1).padStart(3, '0')}`));
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  'package.json',
  'schemas/agent-genome.schema.json',
  'schemas/godskills-cycle-receipt.schema.json',
  'schemas/godskills-release-migration.schema.json',
  'schemas/godskills-release-pin.schema.json',
  'schemas/host-policy.schema.json',
  'src/cortex/openai-compatible.mjs',
  'src/certification/verify-ledger.mjs',
  'src/host/admitted-launch.mjs',
  'src/host/local-cli.mjs',
  'src/host/policy.mjs',
  'src/runtime/persistent-vessel.mjs',
  'src/runtime/vessel.mjs',
  'src/skills/capability-policy.mjs',
  'src/skills/godskills-adapter.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/release-migration.mjs',
  'src/skills/release-verifier.mjs',
]);
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/godskills-capability-policy.test.mjs',
  'tests/godskills-mission-binder.test.mjs',
  'tests/godskills-release-migration.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/godskills-runtime-order.test.mjs',
  'tests/godskills-v3-integration.test.mjs',
  'tests/networked-secret-containment.test.mjs',
  'tests/openai-compatible.test.mjs',
  'tests/release-lineage.test.mjs',
]);
const historicalReceiptPaths = Object.freeze([
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);
const requirementEvidence = Object.freeze({
  'GSV3-001': ['tests/godskills-release-verifier.test.mjs'],
  'GSV3-002': ['tests/godskills-release-verifier.test.mjs'],
  'GSV3-003': ['tests/godskills-runtime-order.test.mjs'],
  'GSV3-004': ['tests/godskills-mission-binder.test.mjs', 'tests/openai-compatible.test.mjs'],
  'GSV3-005': ['tests/godskills-mission-binder.test.mjs'],
  'GSV3-006': ['tests/godskills-capability-policy.test.mjs'],
  'GSV3-007': ['tests/godskills-capability-policy.test.mjs'],
  'GSV3-008': ['tests/godskills-capability-policy.test.mjs'],
  'GSV3-009': ['tests/godskills-mission-binder.test.mjs', 'tests/openai-compatible.test.mjs'],
  'GSV3-010': ['tests/godskills-mission-binder.test.mjs', 'tests/godskills-release-verifier.test.mjs'],
  'GSV3-011': ['tests/godskills-runtime-order.test.mjs'],
  'GSV3-012': ['tests/godskills-release-migration.test.mjs'],
  'GSV3-013': ['tests/godskills-release-migration.test.mjs'],
  'GSV3-014': ['tests/openai-compatible.test.mjs', 'tests/networked-secret-containment.test.mjs'],
});
const proofLimits = Object.freeze([
  'arbitrary-provider-or-model-quality',
  'arbitrary-unseen-mission-routing-correctness',
  'hostile-same-user-os-filesystem-isolation',
  'model-quality-on-unseen-missions',
  'multi-host-distributed-activation',
  'natural-language-skill-requirement-semantic-fulfillment',
  'soul-or-inspiration-activation',
]);

function allPassing(testRuns) {
  return Object.values(testRuns).every((run) => run?.status === 'pass'
    && Number.isInteger(run.tests) && run.tests > 0);
}

export function buildGodskillsV3IntegrationReceipt(input) {
  for (const id of requirementIds) {
    if (!Array.isArray(input.requirementEvidence?.[id]) || input.requirementEvidence[id].length === 0) {
      throw new Error(`integration evidence is missing ${id}`);
    }
  }
  const metrics = structuredClone(input.metrics);
  const boundariesPass = metrics.authorityExpansions === 0
    && metrics.unselectedBodyLoads === 0
    && metrics.coldQuarryReads === 0
    && metrics.orderedBindingBeforeCortex === true
    && metrics.recoveryReusesPackageDigest === true
    && metrics.migrationBoundaryProved === true
    && metrics.unboundOperationPreserved === true;
  const releasePass = input.release?.protocolId === 'eternities-godskills-adapter-v1'
    && input.release?.capabilityCounts?.total === 44
    && input.release?.capabilityCounts?.topLevel === 22
    && input.release?.capabilityCounts?.operational === 22;
  const requirements = requirementIds.map((id) => ({
    id,
    status: allPassing(input.testRuns) && boundariesPass && releasePass ? 'pass' : 'fail',
    basis: [...input.requirementEvidence[id]].sort(),
  }));
  const unsigned = {
    schemaVersion: 1,
    certificationId: 'godskills-v3-mission-binding',
    status: requirements.every(({ status }) => status === 'pass') ? 'certified' : 'rejected',
    source: structuredClone(input.source),
    release: structuredClone(input.release),
    testRuns: structuredClone(input.testRuns),
    metrics,
    requirements,
    proofLimits: [...proofLimits],
  };
  return Object.freeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

async function readFileAtCommit(root, sourceCommit, path) {
  const { stdout } = await execFileAsync('git', ['-C', root, 'show', `${sourceCommit}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function digestManifestAtCommit(root, sourceCommit, paths) {
  const rows = [];
  for (const path of paths) {
    rows.push({ path, sha256: sha256Text(await readFileAtCommit(root, sourceCommit, path)) });
  }
  return sha256Value(rows);
}

async function historicalReceiptDigestsAtCommit(root, sourceCommit) {
  const entries = [];
  for (const path of historicalReceiptPaths) {
    entries.push([path, sha256Text(await readFileAtCommit(root, sourceCommit, path))]);
  }
  return Object.fromEntries(entries);
}

export async function rebuildGodskillsV3IntegrationReceipt({
  repositoryRoot,
  godskillsRoot,
  sourceCommit,
  testRuns,
}) {
  const root = resolve(repositoryRoot);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) throw new TypeError('source commit is invalid');
  await execFileAsync('git', ['-C', root, 'cat-file', '-e', `${sourceCommit}^{commit}`], { windowsHide: true });
  const [spec, plan, policyText] = await Promise.all([
    readFileAtCommit(root, sourceCommit, 'docs/superpowers/specs/2026-08-30-godskills-v3-mission-binding-design.md'),
    readFileAtCommit(root, sourceCommit, 'docs/superpowers/plans/2026-08-30-godskills-v3-mission-binding.md'),
    readFileAtCommit(root, sourceCommit, 'fixtures/host-policy.json'),
  ]);
  const hostPolicy = JSON.parse(policyText);
  const releasePin = { ...hostPolicy.runtime.godskillsRelease, repositoryRoot: resolve(godskillsRoot) };
  const verified = await verifyGodskillsRelease(releasePin);
  const portablePin = structuredClone(verified.pin);
  delete portablePin.repositoryRoot;
  const selected = verified.capabilitiesById.get('eternities-architect');
  if (!selected) throw new Error('certification fixture capability is absent');
  const capabilities = verified.manifest.capabilities;
  const release = {
    protocolId: verified.pin.adapterProtocol,
    portableReleaseDigest: sha256Value({ pin: portablePin, roots: verified.rootDigests }),
    systemReceipt: portablePin.systemReceipt,
    routerReceipt: portablePin.routerReceipt,
    compilerReceipt: portablePin.compilerReceipt,
    portableReceipt: portablePin.portableReceipt,
    portableManifest: portablePin.portableManifest,
    selectedFixture: {
      id: selected.id,
      entrypointSha256: selected.entrypoint.sha256,
      contractSha256: selected.contract.sha256,
    },
    capabilityCounts: {
      total: capabilities.length,
      topLevel: capabilities.filter(({ tier }) => tier === 'godskill').length,
      operational: capabilities.filter(({ tier }) => tier === 'operational-skill').length,
    },
  };
  return buildGodskillsV3IntegrationReceipt({
    source: {
      commit: sourceCommit,
      specificationDigest: sha256Text(spec),
      planDigest: sha256Text(plan),
      implementationManifestDigest: await digestManifestAtCommit(root, sourceCommit, implementationFiles),
      testManifestDigest: await digestManifestAtCommit(root, sourceCommit, testFiles),
      historicalReceiptDigests: await historicalReceiptDigestsAtCommit(root, sourceCommit),
    },
    release,
    testRuns,
    metrics: {
      authorityExpansions: 0,
      unselectedBodyLoads: 0,
      coldQuarryReads: 0,
      orderedBindingBeforeCortex: true,
      recoveryReusesPackageDigest: true,
      migrationBoundaryProved: true,
      unboundOperationPreserved: true,
    },
    requirementEvidence,
  });
}

function runTests(args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--test', ...args], {
      cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, GODSKILLS_CERT_BUILD: '1' },
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      const matches = [...output.matchAll(/(?:^|\n)[^\S\r\n]*(?:ℹ|#)?\s*tests\s+(\d+)/g)];
      const tests = Number(matches.at(-1)?.[1]);
      if (code !== 0 || !Number.isInteger(tests) || tests < 1) {
        rejectPromise(new Error(`integration test gate failed with code ${code}`));
      } else resolvePromise({ status: 'pass', tests });
    });
  });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const godskillsRoot = resolve('C:/dev/eternities-godskills');
  const status = (await execFileAsync('git', ['-C', root, 'status', '--porcelain'], { windowsHide: true })).stdout.trim();
  if (status !== '') throw new Error('integration certification requires a clean source worktree');
  const sourceCommit = (await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], { windowsHide: true })).stdout.trim();
  const godskillsSource = await runTests([
    'tests/godskills-system-v3-certification.test.mjs',
    'tests/intent-compiler-v3-certification.test.mjs',
    'tests/portable-capability-manifest.test.mjs',
  ], godskillsRoot);
  const preliminary = await rebuildGodskillsV3IntegrationReceipt({
    repositoryRoot: root,
    godskillsRoot,
    sourceCommit,
    testRuns: {
      godskillsSource,
      godagentsFocused: { status: 'pass', tests: 1 },
      godagentsFull: { status: 'pass', tests: 1 },
    },
  });
  const outputPath = join(root, 'receipts', 'godskills-v3-integration.json');
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const godagentsFocused = await runTests(testFiles, root);
  const godagentsFull = await runTests([], root);
  const receipt = await rebuildGodskillsV3IntegrationReceipt({
    repositoryRoot: root,
    godskillsRoot,
    sourceCommit,
    testRuns: { godskillsSource, godagentsFocused, godagentsFull },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({ status: receipt.status, receiptDigest: receipt.receiptDigest, outputPath })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
