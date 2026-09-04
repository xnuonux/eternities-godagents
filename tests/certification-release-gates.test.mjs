import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CERTIFICATION_RELEASE_GATE_PROTOCOL_ID,
  buildReleaseGatePlan,
} from '../scripts/lib/release-gates.mjs';

test('post-receipt release gate plan uses direct verifiers without duplicate suites', () => {
  const plan = buildReleaseGatePlan({
    certificationTestFile: 'tests/realm-negotiation-certification.test.mjs',
  });

  assert.deepEqual(plan, {
    protocolId: CERTIFICATION_RELEASE_GATE_PROTOCOL_ID,
    mode: 'direct-verifiers-after-final-receipt',
    steps: [
      {
        kind: 'focused-test',
        files: ['tests/realm-negotiation-certification.test.mjs'],
      },
      {
        kind: 'direct-verifier',
        script: 'src/certification/verify-ledger.mjs',
      },
      {
        kind: 'direct-verifier',
        script: 'src/certification/verify-release-lineage.mjs',
      },
    ],
    forbiddenRepeatedSuites: [
      'tests/certification-ledger.test.mjs',
      'tests/release-lineage.test.mjs',
    ],
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.steps), true);
  assert.equal(Object.isFrozen(plan.steps[0].files), true);
});

test('release gate plan rejects unsafe focused test paths', () => {
  for (const certificationTestFile of [
    '',
    '../tests/other.test.mjs',
    'tests/../other.test.mjs',
    'tests\\other.test.mjs',
    'tests/other.test.js',
    'src/other.test.mjs',
    'tests/other.test.mjs\n--bad',
  ]) {
    assert.throws(() => buildReleaseGatePlan({ certificationTestFile }), /test file|path/i);
  }
});
