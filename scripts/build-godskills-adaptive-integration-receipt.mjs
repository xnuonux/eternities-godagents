import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { verifyGodskillsRelease } from '../src/skills/release-verifier.mjs';

const execFileAsync = promisify(execFile);
const digestPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const requirementIds = Object.freeze(Array.from({ length: 16 }, (_, index) =>
  `GSA-${String(index + 1).padStart(3, '0')}`));
const specificationPath = 'docs/superpowers/specs/2026-08-31-trusted-adaptive-activation-adapter-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-trusted-adaptive-activation-adapter-v1.md';
const certificationReceiptPath = 'receipts/godskills-adaptive-activation-v1.json';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  specificationPath,
  planPath,
  'fixtures/host-policy.json',
  'package.json',
  'scripts/build-godskills-adaptive-integration-receipt.mjs',
  'schemas/godskills-cycle-receipt.schema.json',
  'schemas/godskills-release-pin.schema.json',
  'schemas/host-policy.schema.json',
  'src/certification/verify-ledger.mjs',
  'src/host/admitted-launch.mjs',
  'src/host/local-cli.mjs',
  'src/runtime/vessel.mjs',
  'src/skills/activation-adapter.mjs',
  'src/skills/contract-guardrails.mjs',
  'src/skills/godskills-adapter.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/release-verifier.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/admitted-launch.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/godskills-activation-adapter.test.mjs',
  'tests/godskills-adaptive-activation.test.mjs',
  'tests/godskills-adaptive-integration.test.mjs',
  'tests/godskills-mission-binder.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/godskills-runtime-order.test.mjs',
  'tests/host-policy.test.mjs',
  'tests/local-cli.test.mjs',
  'tests/networked-secret-containment.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());
const focusedGodagentsTests = testFiles;
const focusedGodskillsTests = Object.freeze([
  'tests/adaptive-activation-executable-receipt.test.mjs',
  'tests/adaptive-activation-protocol.test.mjs',
  'tests/adaptive-activation-transport.test.mjs',
  'tests/adaptive-activation.test.mjs',
]);
const historicalReceiptPaths = Object.freeze([
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-v3-integration.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);
const artifactIdentities = Object.freeze([
  ['evidence', 'artifacts/adaptive-activation/evidence.v1.json'],
  ['contract', 'artifacts/adaptive-activation/neutral-contract.json'],
  ['policy', 'policies/adaptive-activation.v1.json'],
  ['request-schema', 'schemas/adaptive-activation-request.v1.schema.json'],
  ['result-schema', 'schemas/adaptive-activation-result.v1.schema.json'],
  ['entrypoint', 'scripts/activation.mjs'],
  ['dependency', 'scripts/build-adaptive-activation-executable-receipt.mjs'],
  ['dependency', 'src/adaptive-activation-protocol.mjs'],
  ['compiler', 'src/adaptive-activation.mjs'],
  ['dependency', 'src/io.mjs'],
  ['dependency', 'src/static-module-closure.mjs'],
]);
export const adaptiveBoundaryEvidence = Object.freeze({
  authorityExpansions: Object.freeze([
    'validates every compiler identity, digest, order, authority, and disclosure boundary',
    'provider output cannot manufacture host authority or reach a Realm hand',
  ]),
  classificationProjectionMinimized: Object.freeze([
    'minimizes and freezes classification input, then builds one exact ordered request',
  ]),
  coldQuarryReads: Object.freeze([
    'verifies the exact certified release without reading any capability body',
    'opens only the selected entrypoint and contract after release verification',
  ]),
  legacyBehaviorPreserved: Object.freeze([
    'adaptive configuration is all-or-nothing while the legacy path remains unbound',
    'bound vessels reject a bare transport while explicit unbound operation stays unchanged',
  ]),
  orderedBindingBeforeCortex: Object.freeze([
    'routes then classifies and compiles exact artifacts before any selected body read',
    'journals a body-free Godskills binding before cortex inference and constitutional decision',
  ]),
  partialConfigurationsAdmitted: Object.freeze([
    'adaptive configuration is all-or-nothing while the legacy path remains unbound',
    'networked host rejects every partial adaptive state before routing or inference',
  ]),
  recoveryActivationCalls: Object.freeze([
    'adaptive recovery reuses the exact activation binding without route, classification, or external activation calls',
    'rehydrates without classifier or transport and rejects every changed binding input',
  ]),
  recoveryClassificationCalls: Object.freeze([
    'adaptive recovery reuses the exact activation binding without route, classification, or external activation calls',
    'rehydrates without classifier or transport and rejects every changed binding input',
  ]),
  recoveryRouteCalls: Object.freeze([
    'adaptive recovery reuses the exact activation binding without route, classification, or external activation calls',
    'rehydrates a durable selected receipt without invoking the router again',
  ]),
  secretCanaryLeaks: Object.freeze([
    'local transport executes the verified Godskills process with a minimal environment',
    'explicit adaptive host keeps credentials continuity memory Realm handles and unselected bodies out of every boundary',
  ]),
  unselectedBodyLoads: Object.freeze([
    'native activation preserves route identity without reading selected artifacts',
    'explicit adaptive host keeps credentials continuity memory Realm handles and unselected bodies out of every boundary',
  ]),
});
const expectedMetrics = Object.freeze({
  authorityExpansions: 0,
  classificationProjectionMinimized: true,
  coldQuarryReads: 0,
  legacyBehaviorPreserved: true,
  orderedBindingBeforeCortex: true,
  partialConfigurationsAdmitted: 0,
  recoveryActivationCalls: 0,
  recoveryClassificationCalls: 0,
  recoveryRouteCalls: 0,
  secretCanaryLeaks: 0,
  unselectedBodyLoads: 0,
});
const metricNames = Object.freeze(Object.keys(adaptiveBoundaryEvidence).sort());
const requiredEvidenceTests = Object.freeze([...new Set(Object.values(adaptiveBoundaryEvidence).flat())].sort());
const requirementEvidence = Object.freeze({
  'GSA-001': ['tests/godskills-release-verifier.test.mjs'],
  'GSA-002': ['tests/godskills-release-verifier.test.mjs', 'tests/godskills-adaptive-integration.test.mjs'],
  'GSA-003': ['tests/godskills-activation-adapter.test.mjs'],
  'GSA-004': ['tests/godskills-adaptive-activation.test.mjs', 'tests/godskills-runtime-order.test.mjs'],
  'GSA-005': ['tests/godskills-adaptive-activation.test.mjs'],
  'GSA-006': ['tests/godskills-activation-adapter.test.mjs', 'tests/godskills-adaptive-activation.test.mjs'],
  'GSA-007': ['tests/godskills-activation-adapter.test.mjs', 'tests/networked-secret-containment.test.mjs'],
  'GSA-008': ['tests/godskills-adaptive-activation.test.mjs', 'tests/godskills-runtime-order.test.mjs'],
  'GSA-009': ['tests/godskills-adaptive-activation.test.mjs', 'tests/networked-secret-containment.test.mjs'],
  'GSA-010': ['tests/networked-secret-containment.test.mjs'],
  'GSA-011': ['tests/local-cli.test.mjs', 'tests/admitted-launch.test.mjs'],
  'GSA-012': ['tests/godskills-mission-binder.test.mjs', 'tests/godskills-adaptive-activation.test.mjs'],
  'GSA-013': ['tests/godskills-adaptive-activation.test.mjs'],
  'GSA-014': ['tests/godskills-adaptive-integration.test.mjs'],
  'GSA-015': ['tests/godskills-adaptive-integration.test.mjs', 'tests/certification-ledger.test.mjs'],
  'GSA-016': ['tests/release-lineage.test.mjs'],
});
const proofLimits = Object.freeze([
  'arbitrary-provider-field-equivalence',
  'executed-review-or-model-quality-improvement',
  'hostile-same-user-filesystem-mutation',
  'lunari-integration-readiness',
  'production-runtime-metric-observation',
  'public-sdk-readiness',
  'soul-or-inspiration-activation',
  'specialist-preference-routing-quality',
  'unseen-mission-or-model-quality',
]);

const sha256Bytes = (value) => createHash('sha256').update(value).digest('hex');

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !digestPattern.test(value)) throw new Error(`${label} digest is invalid`);
}

function requireCommit(value, label) {
  if (typeof value !== 'string' || !commitPattern.test(value)) throw new Error(`${label} commit is invalid`);
}

function requireBoundDocument(value, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (typeof value.path !== 'string' || value.path.length === 0) throw new Error(`${label} path is invalid`);
  requireDigest(value.sha256, label);
}

function requireManifest(value, label) {
  exactKeys(value, ['paths', 'digest'], label);
  if (!Array.isArray(value.paths) || value.paths.length === 0
      || value.paths.some((path) => typeof path !== 'string' || path.length === 0)
      || new Set(value.paths).size !== value.paths.length
      || !same(value.paths, [...value.paths].sort())) {
    throw new Error(`${label} paths are invalid`);
  }
  requireDigest(value.digest, label);
}

function requireHistoricalReceipts(value) {
  exactKeys(value, historicalReceiptPaths, 'historical receipt map');
  for (const [path, digest] of Object.entries(value)) {
    if (!historicalReceiptPaths.includes(path)) throw new Error('historical receipt path is invalid');
    requireDigest(digest, `historical receipt ${path}`);
  }
}

function requireArtifactClosure(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length !== artifactIdentities.length) {
    throw new Error('Godskills executable artifact closure count is invalid');
  }
  const actual = artifacts.map(({ role, path }) => [role, path]);
  if (!same(actual, artifactIdentities)) throw new Error('Godskills executable artifact closure is invalid');
  for (const artifact of artifacts) {
    const logical = ['evidence', 'contract', 'policy', 'request-schema', 'result-schema'].includes(artifact.role);
    exactKeys(artifact, logical
      ? ['role', 'path', 'sha256', 'bytes', 'logicalDigest']
      : ['role', 'path', 'sha256', 'bytes'], `Godskills ${artifact.role} artifact`);
    requireDigest(artifact.sha256, `Godskills ${artifact.role} artifact`);
    if (!Number.isInteger(artifact.bytes) || artifact.bytes < 1) throw new Error('Godskills artifact byte count is invalid');
    if (logical) requireDigest(artifact.logicalDigest, `Godskills ${artifact.role} logical`);
  }
}

function allTestsPass(testRuns) {
  exactKeys(testRuns, ['godskillsFocused', 'godskillsFull', 'godagentsFocused', 'godagentsFull'], 'test runs');
  for (const [name, run] of Object.entries(testRuns)) {
    exactKeys(run, ['status', 'tests', 'evidenceDigest', 'evidenceTests'], `${name} test run`);
    if (!['pass', 'fail'].includes(run.status)
        || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run result is invalid`);
    }
    requireDigest(run.evidenceDigest, `${name} test-evidence`);
    if (!Array.isArray(run.evidenceTests)
        || run.evidenceTests.some((value) => typeof value !== 'string' || value.length === 0)
        || new Set(run.evidenceTests).size !== run.evidenceTests.length
        || !same(run.evidenceTests, [...run.evidenceTests].sort())) {
      throw new Error(`${name} test evidence is invalid`);
    }
    if (run.evidenceDigest !== sha256Value(run.evidenceTests)) {
      throw new Error(`${name} test evidence digest mismatch`);
    }
  }
  return Object.values(testRuns).every((run) => run.status === 'pass');
}

function deriveBoundaryProof(testRuns) {
  if (!same(testRuns.godagentsFocused.evidenceTests, requiredEvidenceTests)) {
    throw new Error('adaptive boundary evidence set is incomplete or changed');
  }
  const passed = new Set(testRuns.godagentsFocused.evidenceTests);
  const metricEvidence = {};
  for (const name of metricNames) {
    const basis = adaptiveBoundaryEvidence[name];
    if (basis.some((testName) => !passed.has(testName))) {
      throw new Error(`adaptive boundary evidence is missing ${name}`);
    }
    metricEvidence[name] = [...basis];
  }
  return {
    metrics: structuredClone(expectedMetrics),
    metricEvidence,
  };
}

export function buildGodskillsAdaptiveIntegrationReceipt(input) {
  exactKeys(input.source, [
    'commit', 'specification', 'plan', 'implementationManifest', 'testManifest', 'historicalReceiptDigests',
  ], 'adaptive source');
  requireCommit(input.source.commit, 'Godagents source');
  requireBoundDocument(input.source.specification, 'adaptive specification');
  requireBoundDocument(input.source.plan, 'adaptive plan');
  requireManifest(input.source.implementationManifest, 'implementation manifest');
  requireManifest(input.source.testManifest, 'test manifest');
  requireHistoricalReceipts(input.source.historicalReceiptDigests);

  exactKeys(input.godskills, [
    'commit', 'protocolId', 'portableReleaseDigest', 'executableReceipt',
    'parentReceipt', 'artifacts', 'executableProofLimits',
  ], 'Godskills release evidence');
  requireCommit(input.godskills.commit, 'Godskills source');
  if (input.godskills.protocolId !== 'eternities-godskills-activation-v1') {
    throw new Error('Godskills activation protocol is unsupported');
  }
  requireDigest(input.godskills.portableReleaseDigest, 'Godskills portable release');
  for (const [name, value] of [
    ['executable receipt', input.godskills.executableReceipt],
    ['parent receipt', input.godskills.parentReceipt],
  ]) {
    exactKeys(value, ['path', 'fileSha256', 'receiptDigest'], `Godskills ${name}`);
    if (typeof value.path !== 'string' || value.path.length === 0) throw new Error(`Godskills ${name} path is invalid`);
    requireDigest(value.fileSha256, `Godskills ${name} file`);
    requireDigest(value.receiptDigest, `Godskills ${name}`);
  }
  requireArtifactClosure(input.godskills.artifacts);
  if (!Array.isArray(input.godskills.executableProofLimits)
      || input.godskills.executableProofLimits.length === 0
      || input.godskills.executableProofLimits.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error('Godskills executable proof limits are invalid');
  }
  for (const id of requirementIds) {
    if (!Array.isArray(input.requirementEvidence?.[id]) || input.requirementEvidence[id].length === 0) {
      throw new Error(`adaptive integration evidence is missing ${id}`);
    }
  }
  const testsPassed = allTestsPass(input.testRuns);
  const { metrics, metricEvidence } = deriveBoundaryProof(input.testRuns);
  const passed = testsPassed;
  const requirements = requirementIds.map((id) => ({
    id,
    status: passed ? 'pass' : 'fail',
    basis: [...input.requirementEvidence[id]].sort(),
  }));
  const unsigned = {
    schemaVersion: 1,
    certificationId: 'godskills-adaptive-activation-v1',
    status: passed ? 'certified' : 'rejected',
    source: structuredClone(input.source),
    godskills: structuredClone(input.godskills),
    testRuns: structuredClone(input.testRuns),
    metrics,
    metricEvidence,
    requirements,
    proofLimits: [...proofLimits],
  };
  return Object.freeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

async function gitText(root, commit, path) {
  const { stdout } = await execFileAsync('git', ['-C', root, 'show', `${commit}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function gitBytes(root, commit, path) {
  const { stdout } = await execFileAsync('git', ['-C', root, 'show', `${commit}:${path}`], {
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

function gitObjectIo(root, commit) {
  const repositoryRoot = resolve(root);
  return {
    async realpath(path) {
      return resolve(path);
    },
    async readFile(path) {
      const target = resolve(path);
      const repositoryRelative = relative(repositoryRoot, target);
      if (repositoryRelative === '' || repositoryRelative.startsWith('..') || isAbsolute(repositoryRelative)) {
        throw new Error('historical Godskills artifact escaped repository root');
      }
      return gitBytes(repositoryRoot, commit, repositoryRelative.replaceAll('\\', '/'));
    },
  };
}

async function assertCommit(root, commit, label) {
  requireCommit(commit, label);
  try {
    await execFileAsync('git', ['-C', root, 'cat-file', '-e', `${commit}^{commit}`], { windowsHide: true });
  } catch {
    throw new Error(`${label} commit does not resolve`);
  }
}

async function digestManifestAtCommit(root, commit, paths) {
  const rows = [];
  for (const path of paths) {
    const text = await gitText(root, commit, path);
    rows.push({ path, sha256: sha256Text(text), bytes: Buffer.byteLength(text, 'utf8') });
  }
  return { paths: [...paths], digest: sha256Value(rows) };
}

async function historicalDigestsAtCommit(root, commit) {
  const entries = [];
  for (const path of historicalReceiptPaths) {
    entries.push([path, sha256Text(await gitText(root, commit, path))]);
  }
  return Object.fromEntries(entries);
}

function artifact(receipt, role, path) {
  const rows = receipt.artifacts.filter((row) => row.role === role && row.path === path);
  if (rows.length !== 1) throw new Error(`Godskills executable receipt lacks ${role} ${path}`);
  return rows[0];
}

function releasePinFromExecutable(base, receipt, executableFileSha256) {
  const entrypoint = artifact(receipt, 'entrypoint', 'scripts/activation.mjs');
  const compiler = artifact(receipt, 'compiler', 'src/adaptive-activation.mjs');
  const request = artifact(receipt, 'request-schema', 'schemas/adaptive-activation-request.v1.schema.json');
  const result = artifact(receipt, 'result-schema', 'schemas/adaptive-activation-result.v1.schema.json');
  const policy = artifact(receipt, 'policy', 'policies/adaptive-activation.v1.json');
  const evidence = artifact(receipt, 'evidence', 'artifacts/adaptive-activation/evidence.v1.json');
  const contract = artifact(receipt, 'contract', 'artifacts/adaptive-activation/neutral-contract.json');
  return {
    ...base,
    activation: {
      protocolId: receipt.protocolId,
      executableReceipt: {
        path: 'receipts/adaptive-activation-executable-v1.json',
        sha256: executableFileSha256,
        receiptDigest: receipt.receiptDigest,
      },
      parentReceipt: {
        path: receipt.parentReceipt.path,
        sha256: receipt.parentReceipt.sha256,
        receiptDigest: receipt.parentReceipt.receiptDigest,
      },
      entrypoint: { path: entrypoint.path, sha256: entrypoint.sha256 },
      compiler: { path: compiler.path, sha256: compiler.sha256 },
      dependencies: receipt.artifacts
        .filter(({ role }) => role === 'dependency')
        .map(({ path, sha256 }) => ({ path, sha256 })),
      schemas: {
        request: { path: request.path, sha256: request.sha256 },
        result: { path: result.path, sha256: result.sha256 },
      },
      policy: { path: policy.path, sha256: policy.sha256, logicalDigest: policy.logicalDigest },
      evidence: { path: evidence.path, sha256: evidence.sha256, logicalDigest: evidence.logicalDigest },
      contract: { path: contract.path, sha256: contract.sha256 },
    },
  };
}

export async function rebuildGodskillsAdaptiveIntegrationReceipt({
  repositoryRoot,
  godskillsRoot,
  sourceCommit,
  godskillsCommit,
  testRuns,
}) {
  const root = resolve(repositoryRoot);
  const skillsRoot = resolve(godskillsRoot);
  await Promise.all([
    assertCommit(root, sourceCommit, 'Godagents source'),
    assertCommit(skillsRoot, godskillsCommit, 'Godskills source'),
  ]);
  const [specification, plan, policyText, executableText] = await Promise.all([
    gitText(root, sourceCommit, specificationPath),
    gitText(root, sourceCommit, planPath),
    gitText(root, sourceCommit, 'fixtures/host-policy.json'),
    gitText(skillsRoot, godskillsCommit, 'receipts/adaptive-activation-executable-v1.json'),
  ]);
  let executable;
  try {
    executable = JSON.parse(executableText);
  } catch {
    throw new Error('Godskills executable receipt is invalid JSON');
  }
  requireArtifactClosure(executable.artifacts);
  const unsignedExecutable = structuredClone(executable);
  delete unsignedExecutable.receiptDigest;
  if (sha256Text(canonicalJson(unsignedExecutable)) !== executable.receiptDigest) {
    throw new Error('Godskills executable receipt logical digest mismatch');
  }
  const basePin = JSON.parse(policyText).runtime.godskillsRelease;
  const executableFileSha256 = sha256Bytes(Buffer.from(executableText, 'utf8'));
  const releasePin = releasePinFromExecutable(basePin, executable, executableFileSha256);
  releasePin.repositoryRoot = skillsRoot;
  const verified = await verifyGodskillsRelease(releasePin, {
    io: gitObjectIo(skillsRoot, godskillsCommit),
  });
  const portablePin = structuredClone(verified.pin);
  delete portablePin.repositoryRoot;
  const parentText = await gitText(skillsRoot, godskillsCommit, executable.parentReceipt.path);
  return buildGodskillsAdaptiveIntegrationReceipt({
    source: {
      commit: sourceCommit,
      specification: { path: specificationPath, sha256: sha256Text(specification) },
      plan: { path: planPath, sha256: sha256Text(plan) },
      implementationManifest: await digestManifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await digestManifestAtCommit(root, sourceCommit, testFiles),
      historicalReceiptDigests: await historicalDigestsAtCommit(root, sourceCommit),
    },
    godskills: {
      commit: godskillsCommit,
      protocolId: verified.activation.protocolId,
      portableReleaseDigest: sha256Value({ pin: portablePin, roots: verified.rootDigests }),
      executableReceipt: {
        path: releasePin.activation.executableReceipt.path,
        fileSha256: releasePin.activation.executableReceipt.sha256,
        receiptDigest: verified.activation.trustRootDigest,
      },
      parentReceipt: {
        path: releasePin.activation.parentReceipt.path,
        fileSha256: sha256Bytes(Buffer.from(parentText, 'utf8')),
        receiptDigest: releasePin.activation.parentReceipt.receiptDigest,
      },
      artifacts: structuredClone(executable.artifacts),
      executableProofLimits: structuredClone(executable.proofLimits),
    },
    testRuns,
    requirementEvidence,
  });
}

function runTests(files, cwd, evidenceNames = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...files], {
      cwd,
      shell: false,
      windowsHide: true,
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      const summary = (name) => Number(output.match(new RegExp(`(?:^|\\n)# ${name} (\\d+)(?:\\r?$|\\n)`))?.[1]);
      const tests = summary('tests');
      const passed = summary('pass');
      const failed = summary('fail');
      const skipped = summary('skipped');
      const names = [...output.matchAll(/(?:^|\n)# Subtest: ([^\r\n]+)/g)].map((match) => match[1]);
      const passedNames = new Set(names);
      const missingEvidence = evidenceNames.filter((name) => !passedNames.has(name));
      if (code !== 0 || !Number.isInteger(tests) || tests < 1
          || passed !== tests || failed !== 0 || skipped !== 0
          || names.length !== tests || missingEvidence.length > 0) {
        rejectPromise(new Error(`adaptive integration test gate failed with code ${code}`));
      } else resolvePromise({
        status: 'pass',
        tests,
        evidenceDigest: sha256Value([...evidenceNames].sort()),
        evidenceTests: [...evidenceNames].sort(),
      });
    });
  });
}

async function dirtyPaths(root) {
  const outputs = await Promise.all([
    execFileAsync('git', ['-C', root, 'diff', '--name-only'], { encoding: 'utf8', windowsHide: true }),
    execFileAsync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8', windowsHide: true }),
    execFileAsync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8', windowsHide: true }),
  ]);
  return [...new Set(outputs.flatMap(({ stdout }) => stdout.split(/\r?\n/).filter(Boolean)))].sort();
}

async function clean(root, label, allowedPaths = []) {
  const unexpected = (await dirtyPaths(root)).filter((path) => !allowedPaths.includes(path));
  if (unexpected.length > 0) throw new Error(`${label} worktree must be clean`);
}

export async function resolveCertificationSourceCommit({ repositoryRoot, headCommit, receiptPath }) {
  const root = resolve(repositoryRoot);
  requireCommit(headCommit, 'Godagents head');
  let text;
  try {
    text = await readFile(receiptPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return headCommit;
    throw error;
  }
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    throw new Error('existing adaptive certification receipt is invalid JSON');
  }
  if (text !== `${canonicalJson(receipt)}\n`) {
    throw new Error('existing adaptive certification receipt is not canonical');
  }
  const sourceCommit = receipt.source?.commit;
  await assertCommit(root, sourceCommit, 'existing adaptive certification source');
  try {
    await execFileAsync('git', ['-C', root, 'merge-base', '--is-ancestor', sourceCommit, headCommit], {
      windowsHide: true,
    });
  } catch {
    throw new Error('existing adaptive certification source is not an ancestor of HEAD');
  }
  const changed = (await execFileAsync(
    'git', ['-C', root, 'diff', '--name-only', '--no-renames', `${sourceCommit}..${headCommit}`],
    { encoding: 'utf8', windowsHide: true },
  )).stdout.split(/\r?\n/).filter(Boolean);
  return changed.every((path) => path === certificationReceiptPath) ? sourceCommit : headCommit;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const skillsRoot = resolve('C:/dev/eternities-godskills');
  const outputPath = join(root, ...certificationReceiptPath.split('/'));
  await Promise.all([
    clean(root, 'Godagents source', [certificationReceiptPath]),
    clean(skillsRoot, 'Godskills source'),
  ]);
  const headCommit = (await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', windowsHide: true,
  })).stdout.trim();
  const sourceCommit = await resolveCertificationSourceCommit({
    repositoryRoot: root,
    headCommit,
    receiptPath: outputPath,
  });
  const godskillsCommit = (await execFileAsync('git', ['-C', skillsRoot, 'rev-parse', 'origin/main'], {
    encoding: 'utf8', windowsHide: true,
  })).stdout.trim();
  const [godskillsFocused, godskillsFull] = await Promise.all([
    runTests(focusedGodskillsTests, skillsRoot),
    runTests([], skillsRoot),
  ]);
  const preliminaryRuns = {
    godskillsFocused,
    godskillsFull,
    godagentsFocused: {
      status: 'pass',
      tests: requiredEvidenceTests.length,
      evidenceDigest: sha256Value(requiredEvidenceTests),
      evidenceTests: [...requiredEvidenceTests],
    },
    godagentsFull: {
      status: 'pass', tests: 1, evidenceDigest: sha256Value([]), evidenceTests: [],
    },
  };
  const preliminary = await rebuildGodskillsAdaptiveIntegrationReceipt({
    repositoryRoot: root,
    godskillsRoot: skillsRoot,
    sourceCommit,
    godskillsCommit,
    testRuns: preliminaryRuns,
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const godagentsFocused = await runTests(focusedGodagentsTests, root, requiredEvidenceTests);
  const godagentsFull = await runTests([], root);
  const receipt = await rebuildGodskillsAdaptiveIntegrationReceipt({
    repositoryRoot: root,
    godskillsRoot: skillsRoot,
    sourceCommit,
    godskillsCommit,
    testRuns: { godskillsFocused, godskillsFull, godagentsFocused, godagentsFull },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  await runTests(['tests/godskills-adaptive-integration.test.mjs'], root);
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    testRuns: receipt.testRuns,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
