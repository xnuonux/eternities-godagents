import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { AdmittedLaunchError } from '../src/host/admitted-launch.mjs';
import { runAdmittedLaunchCli } from '../src/host/admitted-cli.mjs';

const args = [
  '--admission', 'C:/admission', '--policy', 'C:/policy.json', '--mission', 'C:/mission.txt',
  '--request-id', 'operator:20260829:001',
];

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } },
    read: () => ({ stdout, stderr }),
  };
}

const result = Object.freeze({
  schemaVersion: 1,
  status: 'completed',
  instanceId: 'agent-1',
  genesisId: 'a'.repeat(64),
  keelId: `keel-${'b'.repeat(64)}`,
  decisionId: 'decision-1',
  actionId: 'action-1',
  discrepancyClass: 'none',
});

test('admitted launch CLI emits one exact canonical success projection', async () => {
  const stream = capture();
  let received;
  const code = await runAdmittedLaunchCli({
    argv: args,
    env: { SAFE: 'value' },
    ...stream,
    service: async (input) => { received = input; return result; },
  });
  assert.equal(code, 0);
  assert.equal(stream.read().stdout, `${canonicalJson(result)}\n`);
  assert.equal(stream.read().stderr, '');
  assert.equal(received.admissionRoot, 'C:/admission');
  assert.equal(received.env.SAFE, 'value');
});

test('admitted launch CLI emits only closed parser, service, and internal failures', async () => {
  for (const [argv, service, expectedCode, expectedExit] of [
    [['--api-key', 'secret-canary'], async () => result, 'option-unexpected', 2],
    [args, async () => { throw new AdmittedLaunchError('admission-invalid'); }, 'admission-invalid', 3],
    [args, async () => { throw new Error('secret-canary'); }, 'internal-failure', 1],
    [args, async () => ({ ...result, secret: 'secret-canary' }), 'internal-failure', 1],
  ]) {
    const stream = capture();
    const code = await runAdmittedLaunchCli({ argv, env: {}, ...stream, service });
    assert.equal(code, expectedExit);
    assert.equal(stream.read().stdout, '');
    assert.equal(stream.read().stderr, `${canonicalJson({ schemaVersion: 1, status: 'failed', code: expectedCode })}\n`);
    assert.doesNotMatch(stream.read().stderr, /secret-canary/);
  }
});
