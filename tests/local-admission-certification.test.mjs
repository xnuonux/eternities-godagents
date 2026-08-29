import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildLocalAdmissionCertificationReceipt,
  buildLocalAdmissionFixture,
} from '../src/certification/certify-local-admission-shell.mjs';

const requirementIds = Object.freeze([
  'GLA-001', 'GLA-002', 'GLA-003', 'GLA-004', 'GLA-005',
  'GLA-006', 'GLA-007', 'GLA-008', 'GLA-009',
]);

function requirements(status = 'pass') {
  return Object.fromEntries(requirementIds.map((id) => [id, { status, basis: [`tests/${id.toLowerCase()}.test.mjs`] }]));
}

function input(rows = requirements()) {
  return {
    source: {
      commit: 'a'.repeat(40),
      nodeVersion: 'v24.18.0',
      specificationDigest: 'b'.repeat(64),
      planDigest: 'c'.repeat(64),
      testSummaryDigest: 'd'.repeat(64),
      testFileManifestDigest: 'e'.repeat(64),
      sourceManifestDigest: 'f'.repeat(64),
      fixtureDigest: '1'.repeat(64),
      creationBuildId: '2'.repeat(64),
      distributionBuildId: '3'.repeat(64),
      genesisId: '4'.repeat(64),
      keelId: `keel-${'5'.repeat(64)}`,
      historicalReceiptDigests: { 'receipts/visual-creator-shell-certification.json': '6'.repeat(64) },
    },
    testSuite: { status: 'pass', tests: 260 },
    proof: {
      cleanSource: { status: 'pass', basis: ['clean source'] },
      guardedSuite: { status: 'pass', basis: ['no-network suite'] },
      deterministicAdmission: { status: 'pass', basis: ['two isolated admissions'] },
      historicalReceipts: { status: 'pass', basis: ['six pins'] },
    },
    requirements: rows,
  };
}

test('local admission certification requires exact proof rows and exclusions', () => {
  const receipt = buildLocalAdmissionCertificationReceipt(input());
  assert.equal(receipt.status, 'certified');
  assert.equal(receipt.certificationId, 'local-admission-shell-v1');
  assert.deepEqual(receipt.requirements.map((row) => row.id), requirementIds);
  assert.deepEqual(receipt.exclusions, [
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
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
});

test('missing or failed admission evidence cannot certify', () => {
  const missing = requirements();
  delete missing['GLA-006'];
  assert.throws(() => buildLocalAdmissionCertificationReceipt(input(missing)), /GLA-006/);
  const failed = requirements();
  failed['GLA-003'].status = 'fail';
  assert.equal(buildLocalAdmissionCertificationReceipt(input(failed)).status, 'rejected');
});

test('every admission proof gate and guarded suite is fail-closed', () => {
  for (const mutate of [
    (value) => { value.testSuite.status = 'fail'; },
    (value) => { value.proof.cleanSource.status = 'fail'; },
    (value) => { value.proof.guardedSuite.status = 'fail'; },
    (value) => { value.proof.deterministicAdmission.status = 'fail'; },
    (value) => { value.proof.historicalReceipts.status = 'fail'; },
  ]) {
    const value = input();
    mutate(value);
    assert.equal(buildLocalAdmissionCertificationReceipt(value).status, 'rejected');
  }
});

test('two isolated local admission fixtures have identical identities and bytes', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-local-admission-cert-test-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const left = await buildLocalAdmissionFixture({ repositoryRoot, outputRoot: join(root, 'left') });
  const right = await buildLocalAdmissionFixture({ repositoryRoot, outputRoot: join(root, 'right') });
  assert.equal(canonicalJson(left.result), canonicalJson(right.result));
  assert.equal(canonicalJson(left.byteManifest), canonicalJson(right.byteManifest));
});
