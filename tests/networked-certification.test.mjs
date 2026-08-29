import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { sha256Text } from '../src/core/digest.mjs';
import { buildNetworkedCertificationReceipt } from '../src/certification/certify-networked-cortex.mjs';

const requirementIds = Array.from({ length: 10 }, (_, index) => `NC-${String(index + 1).padStart(3, '0')}`);

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
      designDigest: 'c'.repeat(64),
    },
    testSuite: { status: 'pass', tests: 79 },
    proof: {
      canaryContainment: { status: 'pass', basis: ['tests/networked-secret-containment.test.mjs'] },
      nodeProcessTreeNetworkGuard: { status: 'pass', basis: ['src/certification/no-network-guard.mjs'] },
      historicalReceipt: { status: 'pass', sha256: 'd'.repeat(64) },
    },
    requirements,
  };
}

test('networked certification requires NC-001 through NC-010 and all proof gates', () => {
  const receipt = buildNetworkedCertificationReceipt(input());

  assert.equal(receipt.status, 'certified');
  assert.equal(receipt.certificationId, 'networked-cortex-v1');
  assert.deepEqual(receipt.requirements.map((row) => row.id), requirementIds);
  assert.equal(receipt.proof.nodeProcessTreeNetworkGuard.status, 'pass');
  assert.deepEqual(receipt.exclusions, [
    'commercial-provider-compatibility',
    'hosted-service',
    'inspiration',
    'live-provider-cost',
    'live-provider-latency',
    'lunari-integration',
    'os-level-network-isolation',
    'signed-host-policy',
    'soul-runtime',
  ]);
  assert.equal(receipt.receiptDigest.length, 64);
});

test('missing requirement or failed proof gate blocks networked certification', () => {
  const missing = evidence();
  delete missing['NC-006'];
  assert.throws(() => buildNetworkedCertificationReceipt(input(missing)), /NC-006/);

  for (const gate of ['canaryContainment', 'nodeProcessTreeNetworkGuard', 'historicalReceipt']) {
    const candidate = input();
    candidate.proof[gate].status = 'fail';
    assert.equal(buildNetworkedCertificationReceipt(candidate).status, 'blocked', gate);
  }
});

test('historical Godagent v0 certification receipt remains byte-identical', async () => {
  const text = await readFile(new URL('../receipts/godagent-v0-certification.json', import.meta.url), 'utf8');

  assert.equal(sha256Text(text), '61465f7b72a56791733fb34bf5d07b0527c175f47479513bef01b4b20479ab95');
});

test('certification network guard blocks global fetch before resolution', async () => {
  const root = resolve(new URL('..', import.meta.url).pathname.slice(1));
  const guard = resolve(root, 'src', 'certification', 'no-network-guard.mjs');
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [
      '--import', pathToFileURL(guard).href,
      '--input-type=module',
      '--eval',
      "try { await fetch('https://example.com'); process.exitCode = 9; } catch { process.stdout.write('blocked'); }",
    ], { cwd: root, shell: false, windowsHide: true });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => resolvePromise({ code, stdout }));
  });

  assert.deepEqual(result, { code: 0, stdout: 'blocked' });
});

test('certification network guard propagates to spawned Node processes', async () => {
  const root = resolve(new URL('..', import.meta.url).pathname.slice(1));
  const guard = pathToFileURL(resolve(root, 'src', 'certification', 'no-network-guard.mjs')).href;
  const parentCode = [
    "import { spawnSync } from 'node:child_process';",
    "const child = spawnSync(process.execPath, ['--input-type=module', '--eval', \"try { await fetch('data:text/plain,ok'); process.stdout.write('unguarded'); } catch { process.stdout.write('blocked'); }\"], { encoding: 'utf8' });",
    "process.stdout.write(child.stdout); process.exitCode = child.status;",
  ].join(' ');
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--import', guard, '--input-type=module', '--eval', parentCode], {
      cwd: root,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => resolvePromise({ code, stdout }));
  });

  assert.deepEqual(result, { code: 0, stdout: 'blocked' });
});
