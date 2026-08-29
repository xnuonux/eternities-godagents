import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTransactionalGenesisCertificationReceipt,
  projectDeterministicTestSummary,
} from '../src/certification/certify-transactional-genesis-phase2.mjs';

const requirementIds = ['GF-006', 'GF-007', 'GF-008', 'GF-009', 'GF-012'];

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
      testSummaryDigest: 'b'.repeat(64),
      testFileManifestDigest: '0'.repeat(64),
      specificationDigest: 'c'.repeat(64),
      planDigest: 'd'.repeat(64),
      genesisProjectionDigest: 'e'.repeat(64),
      historicalReceiptDigests: { 'receipts/godagent-v0-certification.json': 'f'.repeat(64) },
    },
    testSuite: { status: 'pass', tests: 153 },
    proof: {
      cleanSource: { status: 'pass', basis: ['git status --porcelain before and after proof execution'] },
      guardedSuite: { status: 'pass', basis: ['src/certification/no-network-guard.mjs'] },
      reproducibleGenesis: { status: 'pass', basis: ['two byte-identical fresh genesis roots'] },
      failureInjection: { status: 'pass', basis: ['seven durable interruption boundaries'] },
      historicalReceipts: { status: 'pass', basis: ['three historical receipt sha256 pins'] },
    },
    requirements: rows,
  };
}

test('transactional-genesis certification requires the exact Phase 2 proof rows', () => {
  const receipt = buildTransactionalGenesisCertificationReceipt(input());
  assert.equal(receipt.status, 'certified');
  assert.equal(receipt.certificationId, 'transactional-genesis-phase2');
  assert.deepEqual(receipt.requirements.map((row) => row.id), requirementIds);
  assert.deepEqual(receipt.exclusions, [
    'collective-team-memory',
    'creator-interface',
    'governed-evolution',
    'hosted-multi-tenant-durability',
    'live-provider-quality',
    'lunari-integration',
    'soul-activation',
  ]);
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
});

test('missing or failed Phase 2 evidence cannot certify', () => {
  const missing = requirements();
  delete missing['GF-009'];
  assert.throws(() => buildTransactionalGenesisCertificationReceipt(input(missing)), /GF-009/);

  const failed = requirements();
  failed['GF-012'].status = 'fail';
  assert.equal(buildTransactionalGenesisCertificationReceipt(input(failed)).status, 'rejected');
});

test('failed suite, dirty source, divergent genesis, or absent interruption proof is rejected', () => {
  for (const mutate of [
    (value) => { value.testSuite.status = 'fail'; },
    (value) => { value.proof.cleanSource.status = 'fail'; },
    (value) => { value.proof.reproducibleGenesis.status = 'fail'; },
    (value) => { value.proof.failureInjection.status = 'fail'; },
    (value) => { value.proof.historicalReceipts.status = 'fail'; },
  ]) {
    const value = input();
    mutate(value);
    assert.equal(buildTransactionalGenesisCertificationReceipt(value).status, 'rejected');
  }
});

test('certification test summary excludes timings and output order from its identity', () => {
  const left = [
    '✔ second contract (20.12ms)',
    '✔ first contract (1.02ms)',
    'ℹ tests 2',
    'ℹ pass 2',
    'ℹ fail 0',
  ].join('\n');
  const right = [
    '✔ first contract (99.90ms)',
    '✔ second contract (0.01ms)',
    'ℹ tests 2',
    'ℹ pass 2',
    'ℹ fail 0',
  ].join('\n');
  assert.deepEqual(projectDeterministicTestSummary(left), projectDeterministicTestSummary(right));
});
