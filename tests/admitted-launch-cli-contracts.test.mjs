import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdmittedLaunchCliError,
  parseAdmittedLaunchCliArgs,
} from '../src/host/admitted-cli-contracts.mjs';

const validArgs = Object.freeze([
  '--admission', 'C:/admitted/instance',
  '--policy', 'C:/admitted/host-policy.json',
  '--mission', 'C:/admitted/mission.txt',
  '--request-id', 'operator:20260829:001',
]);

function assertFailure(argv, code) {
  assert.throws(
    () => parseAdmittedLaunchCliArgs(argv),
    (error) => error instanceof AdmittedLaunchCliError && error.code === code,
  );
}

test('admitted launch CLI maps the exact admission, policy, and mission paths', () => {
  assert.deepEqual(parseAdmittedLaunchCliArgs(validArgs), {
    admissionRoot: 'C:/admitted/instance',
    policyPath: 'C:/admitted/host-policy.json',
    missionPath: 'C:/admitted/mission.txt',
    requestId: 'operator:20260829:001',
  });
});

test('admitted launch CLI rejects malformed, missing, duplicate, and unknown options with closed codes', () => {
  assertFailure(null, 'argument-invalid');
  assertFailure(['--admission', 'C:/admitted/instance', 42], 'argument-invalid');
  assertFailure(['admission', 'C:/admitted/instance'], 'argument-invalid');
  assertFailure(['--admission', 'C:/admitted/instance', '--policy'], 'option-missing');
  assertFailure(['--admission', 'C:/admitted/instance', '--policy', 'C:/policy.json'], 'option-missing');
  assertFailure([...validArgs, '--policy', 'C:/other-policy.json'], 'option-duplicate');
  assertFailure([...validArgs, '--endpoint', 'https://override.example'], 'option-unexpected');
  assertFailure(validArgs.map((value, index) => index === 7 ? '..\\escape' : value), 'value-invalid');
});

test('admitted launch CLI rejects empty and control-character path values', () => {
  for (const value of ['', 'C:/admitted\u0000instance', 'C:/admitted\rinstance', 'C:/admitted\ninstance']) {
    assertFailure([
      '--admission', value,
      '--policy', 'C:/admitted/host-policy.json',
      '--mission', 'C:/admitted/mission.txt',
    ], 'value-invalid');
  }
});

test('admitted launch CLI rejects command-line credential flags without echoing their values', () => {
  const canary = 'credential-canary-value';
  for (const flag of ['--api-key', '--token', '--credential', '--secret', '--password', '--authorization']) {
    try {
      parseAdmittedLaunchCliArgs([...validArgs, flag, canary]);
      assert.fail('expected credential flag rejection');
    } catch (error) {
      assert.equal(error instanceof AdmittedLaunchCliError, true);
      assert.equal(error.code, 'option-unexpected');
      assert.doesNotMatch(error.message, new RegExp(canary));
      assert.doesNotMatch(error.code, new RegExp(canary));
    }
  }
});
