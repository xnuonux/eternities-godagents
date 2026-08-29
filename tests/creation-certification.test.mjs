import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCreationForgeCertificationReceipt } from '../src/certification/certify-creation-forge-phase1.mjs';

const requirementIds = ['GF-001', 'GF-002', 'GF-003', 'GF-004', 'GF-005', 'GF-010', 'GF-011'];

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
      testOutputDigest: 'b'.repeat(64),
      specificationDigest: 'c'.repeat(64),
      creationBuildId: 'd'.repeat(64),
    },
    testSuite: { status: 'pass', tests: 114 },
    proof: {
      cleanSource: { status: 'pass', basis: ['git status --porcelain'] },
      guardedSuite: { status: 'pass', basis: ['src/certification/no-network-guard.mjs'] },
      reproducibleBuild: { status: 'pass', basis: ['two byte-identical fresh creation builds'] },
      historicalReceipts: { status: 'pass', basis: ['v0 and networked receipt sha256'] },
    },
    requirements: rows,
  };
}

test('creation-forge certification requires the exact Phase 1 proof rows', () => {
  const receipt = buildCreationForgeCertificationReceipt(input());
  assert.equal(receipt.status, 'certified');
  assert.equal(receipt.certificationId, 'creation-forge-phase1');
  assert.deepEqual(receipt.requirements.map((row) => row.id), requirementIds);
  assert.deepEqual(receipt.exclusions, [
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
  assert.equal(receipt.receiptDigest.length, 64);
});

test('missing or failed Phase 1 evidence cannot certify', () => {
  const missing = requirements();
  delete missing['GF-004'];
  assert.throws(() => buildCreationForgeCertificationReceipt(input(missing)), /GF-004/);

  const failed = requirements();
  failed['GF-002'].status = 'fail';
  assert.equal(buildCreationForgeCertificationReceipt(input(failed)).status, 'rejected');
});

test('failed suite, dirty source, or non-reproducible build is rejected', () => {
  const suite = input();
  suite.testSuite.status = 'fail';
  assert.equal(buildCreationForgeCertificationReceipt(suite).status, 'rejected');

  const dirty = input();
  dirty.proof.cleanSource.status = 'fail';
  assert.equal(buildCreationForgeCertificationReceipt(dirty).status, 'rejected');

  const divergent = input();
  divergent.proof.reproducibleBuild.status = 'fail';
  assert.equal(buildCreationForgeCertificationReceipt(divergent).status, 'rejected');
});
