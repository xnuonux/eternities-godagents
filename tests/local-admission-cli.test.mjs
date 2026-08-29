import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { LocalAdmissionError } from '../src/genesis/local-admission.mjs';
import { LocalAdmissionCliError, parseLocalAdmissionCliArgs } from '../src/genesis/local-cli-contracts.mjs';
import { runLocalAdmissionCli } from '../src/genesis/local-cli.mjs';

const digest = (character) => character.repeat(64);
const valid = Object.freeze([
  '--creation-dir', 'C:\\creation\\build',
  '--policy-digest', digest('a'),
  '--expected-creation-build-id', digest('b'),
  '--prompt-os-artifact', 'C:\\prompt-os\\artifact.json',
  '--realm-contract', 'C:\\realm\\contract.json',
  '--workspace', 'C:\\workspace',
  '--instance-id', 'local-instance-7',
  '--creator', 'creator:dom',
  '--checkpoint-purpose', 'initial-admission',
]);

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
    },
    read: () => ({ stdout, stderr }),
  };
}

test('local admission CLI parses exactly the required safe flags', () => {
  assert.deepEqual(parseLocalAdmissionCliArgs([...valid]), {
    creationDir: 'C:\\creation\\build',
    expectedPolicyDigest: digest('a'),
    expectedCreationBuildId: digest('b'),
    promptArtifactPath: 'C:\\prompt-os\\artifact.json',
    realmContractPath: 'C:\\realm\\contract.json',
    workspace: 'C:\\workspace',
    instanceId: 'local-instance-7',
    creatorRef: 'creator:dom',
    checkpointPurpose: 'initial-admission',
  });
});

test('local admission CLI rejects missing, duplicate, unknown, and unsafe values before service admission', () => {
  const cases = [
    [valid.slice(2), 'option-missing'],
    [[...valid, '--creator', 'creator:other'], 'option-duplicate'],
    [[...valid, '--endpoint', 'secret-cli-canary'], 'option-unexpected'],
    [valid.map((value, index) => index === 1 ? '' : value), 'value-invalid'],
    [valid.map((value, index) => index === 11 ? 'C:\\workspace\nunsafe' : value), 'value-invalid'],
    [valid.map((value, index) => index === 13 ? 'local\0instance' : value), 'value-invalid'],
    [valid.map((value, index) => index === 3 ? digest('A') : value), 'value-invalid'],
    [valid.map((value, index) => index === 5 ? 'f'.repeat(63) : value), 'value-invalid'],
    [valid.map((value, index) => index === 13 ? '..\\escape' : value), 'value-invalid'],
    [valid.map((value, index) => index === 15 ? 'creator:/escape' : value), 'value-invalid'],
  ];
  for (const [argv, code] of cases) {
    assert.throws(
      () => parseLocalAdmissionCliArgs(argv),
      (error) => error instanceof LocalAdmissionCliError && error.code === code,
    );
  }
});

test('local admission CLI emits the service success value once as canonical json', async () => {
  const stream = capture();
  const serviceResult = Object.freeze({
    schemaVersion: 1,
    status: 'admitted',
    creationBuildId: digest('c'),
    distributionBuildId: digest('d'),
    genesisId: digest('e'),
    keelId: `keel-${digest('f')}`,
    receiptDigest: digest('1'),
  });
  let received;
  const exitCode = await runLocalAdmissionCli({
    argv: [...valid],
    ...stream.io,
    service: async (options) => {
      received = options;
      return serviceResult;
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(stream.read().stdout, `${canonicalJson(serviceResult)}\n`);
  assert.equal(stream.read().stderr, '');
  assert.deepEqual(received, parseLocalAdmissionCliArgs([...valid]));
});

test('local admission CLI emits closed failures without rejected values', async () => {
  const admissionStream = capture();
  const admissionExitCode = await runLocalAdmissionCli({
    argv: [...valid],
    ...admissionStream.io,
    service: async () => { throw new LocalAdmissionError('source-invalid'); },
  });
  assert.equal(admissionExitCode, 3);
  assert.equal(admissionStream.read().stdout, '');
  assert.equal(admissionStream.read().stderr, `${canonicalJson({
    schemaVersion: 1,
    status: 'failed',
    code: 'source-invalid',
  })}\n`);

  const serviceStream = capture();
  const serviceExitCode = await runLocalAdmissionCli({
    argv: [...valid],
    ...serviceStream.io,
    service: async () => { throw new Error('service-rejection-canary'); },
  });
  assert.equal(serviceExitCode, 1);
  assert.equal(serviceStream.read().stdout, '');
  assert.equal(serviceStream.read().stderr, `${canonicalJson({
    schemaVersion: 1,
    status: 'failed',
    code: 'internal-failure',
  })}\n`);
  assert.doesNotMatch(serviceStream.read().stderr, /service-rejection-canary/);

  const stream = capture();
  const exitCode = await runLocalAdmissionCli({
    argv: [...valid, '--unexpected', 'service-rejection-canary'],
    ...stream.io,
    service: async () => { throw new Error('service-rejection-canary'); },
  });
  assert.equal(exitCode, 2);
  assert.equal(stream.read().stdout, '');
  assert.equal(stream.read().stderr, `${canonicalJson({
    schemaVersion: 1,
    status: 'failed',
    code: 'option-unexpected',
  })}\n`);
  assert.doesNotMatch(stream.read().stderr, /service-rejection-canary/);

  const projectionStream = capture();
  const projectionCode = await runLocalAdmissionCli({
    argv: [...valid],
    ...projectionStream.io,
    service: async () => ({ ...serviceResult, secret: 'projection-canary' }),
  });
  assert.equal(projectionCode, 1);
  assert.equal(projectionStream.read().stdout, '');
  assert.equal(projectionStream.read().stderr, `${canonicalJson({
    schemaVersion: 1,
    status: 'failed',
    code: 'internal-failure',
  })}\n`);
  assert.doesNotMatch(projectionStream.read().stderr, /projection-canary/);
});

test('direct local admission process rejects malformed input without loading admission work', async () => {
  const script = fileURLToPath(new URL('../src/genesis/local-cli.mjs', import.meta.url));
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, '--creation-dir', ''], {
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `${canonicalJson({
    schemaVersion: 1,
    status: 'failed',
    code: 'value-invalid',
  })}\n`);
});
