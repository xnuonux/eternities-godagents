import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCreatorProtocolCertificationReceipt } from '../src/certification/certify-creator-protocol-phase3.mjs';

const requirementIds = Object.freeze([
  'GC-001', 'GC-002', 'GC-003', 'GC-004',
  'GC-005', 'GC-006', 'GC-007', 'GC-008',
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
      fixtureCatalogDigest: 'f'.repeat(64),
      manualPresetParityDigest: '1'.repeat(64),
      creationBuildIds: ['2'.repeat(64), '3'.repeat(64)],
      historicalReceiptDigests: { 'receipts/godagent-v0-certification.json': '4'.repeat(64) },
    },
    testSuite: { status: 'pass', tests: 189 },
    proof: {
      cleanSource: { status: 'pass', basis: ['clean source before and after proof execution'] },
      guardedSuite: { status: 'pass', basis: ['complete suite under no-network guard'] },
      deterministicCatalog: { status: 'pass', basis: ['two independent catalog loads'] },
      manualPresetParity: { status: 'pass', basis: ['ordinary command replay equals preset replay'] },
      reproducibleFinalization: { status: 'pass', basis: ['two byte-identical isolated fixture roots'] },
      historicalReceipts: { status: 'pass', basis: ['four historical receipt pins'] },
    },
    requirements: rows,
  };
}

test('creator protocol certification requires the exact Phase 3 proof rows', () => {
  const receipt = buildCreatorProtocolCertificationReceipt(input());
  assert.equal(receipt.status, 'certified');
  assert.equal(receipt.certificationId, 'creator-protocol-phase3');
  assert.deepEqual(receipt.requirements.map((row) => row.id), requirementIds);
  assert.deepEqual(receipt.exclusions, [
    'accessibility',
    'analytics',
    'browser-interface',
    'genesis-admission',
    'governed-evolution',
    'hosted-multi-tenant-persistence',
    'inspiration',
    'localization',
    'lunari-integration',
    'recommendation-intelligence',
    'soul-activation',
  ]);
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
});

test('missing or failed Phase 3 requirement evidence cannot certify', () => {
  const missing = requirements();
  delete missing['GC-007'];
  assert.throws(() => buildCreatorProtocolCertificationReceipt(input(missing)), /GC-007/);

  const failed = requirements();
  failed['GC-004'].status = 'fail';
  assert.equal(buildCreatorProtocolCertificationReceipt(input(failed)).status, 'rejected');
});

test('each Phase 3 proof gate and the guarded suite is fail-closed', () => {
  for (const mutate of [
    (value) => { value.testSuite.status = 'fail'; },
    (value) => { value.proof.cleanSource.status = 'fail'; },
    (value) => { value.proof.guardedSuite.status = 'fail'; },
    (value) => { value.proof.deterministicCatalog.status = 'fail'; },
    (value) => { value.proof.manualPresetParity.status = 'fail'; },
    (value) => { value.proof.reproducibleFinalization.status = 'fail'; },
    (value) => { value.proof.historicalReceipts.status = 'fail'; },
  ]) {
    const value = input();
    mutate(value);
    assert.equal(buildCreatorProtocolCertificationReceipt(value).status, 'rejected');
  }
});

test('certification receipt identity is independent of proof basis insertion order', () => {
  const left = input();
  const right = input();
  right.proof.manualPresetParity.basis = [...right.proof.manualPresetParity.basis].reverse();
  right.source.creationBuildIds = [...right.source.creationBuildIds].reverse();
  assert.deepEqual(
    buildCreatorProtocolCertificationReceipt(left),
    buildCreatorProtocolCertificationReceipt(right),
  );
});
