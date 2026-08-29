import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCertificationReceipt } from '../src/certification/certify-v0.mjs';

const requirementIds = Array.from({ length: 14 }, (_, index) => `GA-${String(index + 1).padStart(3, '0')}`);

function evidence(status = 'pass') {
  return Object.fromEntries(requirementIds.map((id) => [id, {
    status,
    basis: [`tests/${id.toLowerCase()}.test.mjs`],
  }]));
}

function input(requirements = evidence()) {
  return {
    source: {
      commit: 'a'.repeat(40),
      nodeVersion: 'v24.18.0',
      testOutputDigest: 'b'.repeat(64),
    },
    testSuite: { status: 'pass', tests: 41 },
    reproducibleBuild: {
      status: 'pass',
      buildId: 'c'.repeat(64),
      artifactDigests: [{ path: 'agent-genome.json', sha256: 'd'.repeat(64) }],
    },
    requirements,
  };
}

test('certification requires every GA-001 through GA-014 proof row', () => {
  const receipt = buildCertificationReceipt(input());

  assert.equal(receipt.status, 'certified');
  assert.deepEqual(receipt.requirements.map((row) => row.id), requirementIds);
  assert.ok(receipt.requirements.every((row) => row.status === 'pass'));
  assert.deepEqual(receipt.exclusions, [
    'commonwealth-runtime',
    'constellations',
    'hosted-service',
    'inspiration',
    'lunari-integration',
    'minecraft',
    'production-model-provider',
    'soul-runtime',
  ]);
  assert.equal(receipt.receiptDigest.length, 64);
});

test('a failed or missing requirement blocks certification', () => {
  const failed = evidence();
  failed['GA-008'] = { status: 'fail', basis: ['tests/action-awareness.test.mjs'] };
  const missing = evidence();
  delete missing['GA-011'];

  assert.equal(buildCertificationReceipt(input(failed)).status, 'blocked');
  assert.throws(() => buildCertificationReceipt(input(missing)), /GA-011/);
});

test('test or reproducibility failure blocks otherwise passing requirements', () => {
  const testsFailed = input();
  testsFailed.testSuite.status = 'fail';
  const buildFailed = input();
  buildFailed.reproducibleBuild.status = 'fail';

  assert.equal(buildCertificationReceipt(testsFailed).status, 'blocked');
  assert.equal(buildCertificationReceipt(buildFailed).status, 'blocked');
});
