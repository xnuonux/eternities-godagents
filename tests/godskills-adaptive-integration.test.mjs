import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  adaptiveBoundaryEvidence,
  buildGodskillsAdaptiveIntegrationReceipt,
  rebuildGodskillsAdaptiveIntegrationReceipt,
  resolveCertificationSourceCommit,
} from '../scripts/build-godskills-adaptive-integration-receipt.mjs';

const execFileAsync = promisify(execFile);

const requirementIds = Object.freeze(Array.from({ length: 16 }, (_, index) =>
  `GSA-${String(index + 1).padStart(3, '0')}`));
const historicalPaths = Object.freeze([
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-v3-integration.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);
const requiredEvidenceTests = Object.freeze([...new Set(Object.values(adaptiveBoundaryEvidence).flat())].sort());

function passingRun(tests, evidenceTests = []) {
  return {
    status: 'pass',
    tests,
    evidenceDigest: sha256Value(evidenceTests),
    evidenceTests: [...evidenceTests],
  };
}

function artifactRows() {
  return [
    ['evidence', 'artifacts/adaptive-activation/evidence.v1.json', true],
    ['contract', 'artifacts/adaptive-activation/neutral-contract.json', true],
    ['policy', 'policies/adaptive-activation.v1.json', true],
    ['request-schema', 'schemas/adaptive-activation-request.v1.schema.json', true],
    ['result-schema', 'schemas/adaptive-activation-result.v1.schema.json', true],
    ['entrypoint', 'scripts/activation.mjs', false],
    ['dependency', 'scripts/build-adaptive-activation-executable-receipt.mjs', false],
    ['dependency', 'src/adaptive-activation-protocol.mjs', false],
    ['compiler', 'src/adaptive-activation.mjs', false],
    ['dependency', 'src/io.mjs', false],
    ['dependency', 'src/static-module-closure.mjs', false],
  ].map(([role, path, logical], index) => ({
    role,
    path,
    sha256: String(index + 1).padStart(64, '0'),
    bytes: index + 100,
    ...(logical ? { logicalDigest: String(index + 20).padStart(64, '0') } : {}),
  }));
}

function fixtureInput() {
  return {
    source: {
      commit: 'a'.repeat(40),
      specification: { path: 'docs/spec.md', sha256: 'b'.repeat(64) },
      plan: { path: 'docs/plan.md', sha256: 'c'.repeat(64) },
      implementationManifest: { paths: ['src/a.mjs'], digest: 'd'.repeat(64) },
      testManifest: { paths: ['tests/a.test.mjs'], digest: 'e'.repeat(64) },
      historicalReceiptDigests: Object.fromEntries(historicalPaths.map((path, index) => [
        path, String(index + 30).padStart(64, '0'),
      ])),
    },
    godskills: {
      commit: 'f'.repeat(40),
      protocolId: 'eternities-godskills-activation-v1',
      portableReleaseDigest: '1'.repeat(64),
      executableReceipt: {
        path: 'receipts/adaptive-activation-executable-v1.json',
        fileSha256: '2'.repeat(64),
        receiptDigest: '3'.repeat(64),
      },
      parentReceipt: {
        path: 'receipts/adaptive-activation-v1.json',
        fileSha256: '4'.repeat(64),
        receiptDigest: '5'.repeat(64),
      },
      artifacts: artifactRows(),
      executableProofLimits: ['fixture-limit'],
    },
    testRuns: {
      godskillsFocused: passingRun(25),
      godskillsFull: passingRun(660),
      godagentsFocused: passingRun(60, requiredEvidenceTests),
      godagentsFull: passingRun(340),
    },
    requirementEvidence: Object.fromEntries(requirementIds.map((id) => [id, [`tests/${id.toLowerCase()}.test.mjs`]])),
  };
}

test('adaptive integration receipt certifies all sixteen requirements and exact executable closure', () => {
  const receipt = buildGodskillsAdaptiveIntegrationReceipt(fixtureInput());
  assert.equal(receipt.status, 'certified');
  assert.deepEqual(receipt.requirements.map(({ id }) => id), requirementIds);
  assert.equal(receipt.godskills.artifacts.length, 11);
  assert.equal(receipt.metrics.authorityExpansions, 0);
  assert.equal(receipt.metrics.recoveryActivationCalls, 0);
  assert.deepEqual(receipt.metricEvidence.recoveryActivationCalls,
    adaptiveBoundaryEvidence.recoveryActivationCalls);
  assert.equal(receipt.proofLimits.includes('executed-review-or-model-quality-improvement'), true);
  assert.equal(receipt.proofLimits.includes('lunari-integration-readiness'), true);
  assert.equal(receipt.proofLimits.includes('production-runtime-metric-observation'), true);
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
});

test('failed tests, missing requirements, malformed closure, or unmeasured boundaries cannot certify', () => {
  const failed = fixtureInput();
  failed.testRuns.godagentsFull.status = 'fail';
  assert.equal(buildGodskillsAdaptiveIntegrationReceipt(failed).status, 'rejected');

  const missing = fixtureInput();
  delete missing.requirementEvidence['GSA-016'];
  assert.throws(() => buildGodskillsAdaptiveIntegrationReceipt(missing), /GSA-016/);

  const unmeasured = fixtureInput();
  unmeasured.testRuns.godagentsFocused.evidenceTests.pop();
  assert.throws(() => buildGodskillsAdaptiveIntegrationReceipt(unmeasured), /evidence/i);

  const detachedEvidenceDigest = fixtureInput();
  detachedEvidenceDigest.testRuns.godagentsFocused.evidenceDigest = '9'.repeat(64);
  assert.throws(() => buildGodskillsAdaptiveIntegrationReceipt(detachedEvidenceDigest), /evidence digest/i);

  const changedClosure = fixtureInput();
  changedClosure.godskills.artifacts.pop();
  assert.throws(() => buildGodskillsAdaptiveIntegrationReceipt(changedClosure), /artifact|closure/i);

  const missingHistory = fixtureInput();
  delete missingHistory.source.historicalReceiptDigests[historicalPaths[0]];
  assert.throws(() => buildGodskillsAdaptiveIntegrationReceipt(missingHistory), /historical/i);
});

test('rebuild rejects stale source commits before producing evidence', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await assert.rejects(
    rebuildGodskillsAdaptiveIntegrationReceipt({
      repositoryRoot: root,
      godskillsRoot: 'C:/dev/eternities-godskills',
      sourceCommit: '0'.repeat(40),
      godskillsCommit: '0'.repeat(40),
      testRuns: fixtureInput().testRuns,
    }),
    /commit/i,
  );
});

test('certifier retains an immutable source only when every later commit changes the receipt alone', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagents-adaptive-source-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  await git('init', '--object-format=sha1');
  await writeFile(join(root, 'implementation.txt'), 'source\n', 'utf8');
  await git('add', 'implementation.txt');
  await git('-c', 'user.name=Godagents Test', '-c', 'user.email=test@invalid.example', 'commit', '-m', 'source');
  const sourceCommit = (await git('rev-parse', 'HEAD')).stdout.trim();
  const receiptPath = join(root, 'receipts', 'godskills-adaptive-activation-v1.json');
  await mkdir(join(root, 'receipts'));
  await writeFile(receiptPath, `${canonicalJson({ source: { commit: sourceCommit } })}\n`, 'utf8');
  await git('add', 'receipts/godskills-adaptive-activation-v1.json');
  await git('-c', 'user.name=Godagents Test', '-c', 'user.email=test@invalid.example', 'commit', '-m', 'receipt');
  const receiptCommit = (await git('rev-parse', 'HEAD')).stdout.trim();
  assert.equal(await resolveCertificationSourceCommit({
    repositoryRoot: root, headCommit: receiptCommit, receiptPath,
  }), sourceCommit);

  await writeFile(join(root, 'implementation.txt'), 'changed\n', 'utf8');
  await git('add', 'implementation.txt');
  await git('-c', 'user.name=Godagents Test', '-c', 'user.email=test@invalid.example', 'commit', '-m', 'changed-source');
  const changedCommit = (await git('rev-parse', 'HEAD')).stdout.trim();
  assert.equal(await resolveCertificationSourceCommit({
    repositoryRoot: root, headCommit: changedCommit, receiptPath,
  }), changedCommit);
});

const checkedReceiptUrl = new URL('../receipts/godskills-adaptive-activation-v1.json', import.meta.url);
test('checked adaptive receipt rebuilds byte-for-byte from exact source and release evidence', {
  skip: process.env.GODSKILLS_ADAPTIVE_CERT_BUILD === '1' || !existsSync(checkedReceiptUrl)
    ? 'receipt is being generated or has not been added yet'
    : false,
}, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const text = await readFile(checkedReceiptUrl, 'utf8');
  const checked = JSON.parse(text);
  const rebuilt = await rebuildGodskillsAdaptiveIntegrationReceipt({
    repositoryRoot: root,
    godskillsRoot: 'C:/dev/eternities-godskills',
    sourceCommit: checked.source.commit,
    godskillsCommit: checked.godskills.commit,
    testRuns: checked.testRuns,
  });
  assert.equal(`${canonicalJson(rebuilt)}\n`, text);
});
