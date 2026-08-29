import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildVisualCreatorCertificationReceipt,
  buildVisualCreatorFixture,
} from '../src/certification/certify-visual-creator-shell.mjs';

const requirementIds = Object.freeze([
  'GVC-001', 'GVC-002', 'GVC-003', 'GVC-004', 'GVC-005',
  'GVC-006', 'GVC-007', 'GVC-008', 'GVC-009',
]);

function requirements(status = 'pass') {
  return Object.fromEntries(requirementIds.map((id) => [id, {
    status,
    basis: [`tests/${id.toLowerCase()}.test.mjs`],
  }]));
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
      catalogDigest: '1'.repeat(64),
      compositionPreviewDigest: '2'.repeat(64),
      creationBuildId: '3'.repeat(64),
      webFixtureDigest: '4'.repeat(64),
      historicalReceiptDigests: { 'receipts/creator-protocol-phase3-certification.json': '5'.repeat(64) },
    },
    testSuite: { status: 'pass', tests: 240 },
    proof: {
      cleanSource: { status: 'pass', basis: ['clean source before and after proof execution'] },
      guardedSuite: { status: 'pass', basis: ['complete suite under no-network guard'] },
      deterministicWebFixture: { status: 'pass', basis: ['two isolated pure-handler fixture roots'] },
      historicalReceipts: { status: 'pass', basis: ['five historical receipt pins'] },
    },
    requirements: rows,
  };
}

test('visual creator certification requires the exact v1 proof rows and exclusions', () => {
  const receipt = buildVisualCreatorCertificationReceipt(input());
  assert.equal(receipt.status, 'certified');
  assert.equal(receipt.certificationId, 'visual-creator-shell-v1');
  assert.deepEqual(receipt.requirements.map((row) => row.id), requirementIds);
  assert.deepEqual(receipt.exclusions, [
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
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
});

test('missing or failed visual creator requirement evidence cannot certify', () => {
  const missing = requirements();
  delete missing['GVC-007'];
  assert.throws(() => buildVisualCreatorCertificationReceipt(input(missing)), /GVC-007/);

  const failed = requirements();
  failed['GVC-004'].status = 'fail';
  assert.equal(buildVisualCreatorCertificationReceipt(input(failed)).status, 'rejected');
});

test('every visual creator proof gate and the guarded suite is fail-closed', () => {
  for (const mutate of [
    (value) => { value.testSuite.status = 'fail'; },
    (value) => { value.proof.cleanSource.status = 'fail'; },
    (value) => { value.proof.guardedSuite.status = 'fail'; },
    (value) => { value.proof.deterministicWebFixture.status = 'fail'; },
    (value) => { value.proof.historicalReceipts.status = 'fail'; },
  ]) {
    const value = input();
    mutate(value);
    assert.equal(buildVisualCreatorCertificationReceipt(value).status, 'rejected');
  }
});

test('visual creator receipt identity is independent of proof basis insertion order', () => {
  const left = input();
  const right = input();
  right.proof.deterministicWebFixture.basis = [...right.proof.deterministicWebFixture.basis].reverse();
  assert.deepEqual(
    buildVisualCreatorCertificationReceipt(left),
    buildVisualCreatorCertificationReceipt(right),
  );
});

test('two isolated web-handler fixtures reproduce the certified Aether build byte for byte', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-visual-cert-test-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const left = await buildVisualCreatorFixture({ repositoryRoot, outputRoot: join(root, 'left') });
  const right = await buildVisualCreatorFixture({ repositoryRoot, outputRoot: join(root, 'right') });
  assert.equal(left.fixture.creationBuildId, '9837b7c8a8cdcc5e11f5094ef5b0307aa18790e11099860c283057a27e0f0e64');
  assert.equal(canonicalJson(left.fixture), canonicalJson(right.fixture));
  assert.equal(canonicalJson(left.byteManifest), canonicalJson(right.byteManifest));
});
