import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareRecoveryFixture } from './helpers/local-workflow-recovery-fixture.mjs';

const harness = fileURLToPath(new URL('./helpers/local-workflow-recovery-child.mjs', import.meta.url));
const cli = fileURLToPath(new URL('../examples/local-artifact-workflow/cli.mjs', import.meta.url));
const guard = new URL('../src/certification/no-network-guard.mjs', import.meta.url).href;
const witness = new URL('./helpers/local-workflow-network-witness.mjs', import.meta.url).href;

function childEnvironment() {
  const env = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

async function freshCli(fixture, { credentialPresent = false } = {}) {
  const child = spawn(process.execPath, ['--import', witness, cli, 'run', '--manifest', fixture.manifestPath,
    '--manifest-digest', fixture.manifestDigest],
  { windowsHide: true, env: { ...childEnvironment(),
    ...(credentialPresent ? { GODAGENT_TEST_PHASE_KEY: 'synthetic-process-recovery-key' } : {}) },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const networkAttempts = [];
  child.on('message', (message) => networkAttempts.push(message));
  let stdout = '';
  let stderr = '';
  let overflow = false;
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
  for (const [stream, append] of [[child.stdout, (text) => { stdout += text; }],
    [child.stderr, (text) => { stderr += text; }]]) {
    stream.on('data', (chunk) => {
      append(chunk.toString());
      if (stdout.length + stderr.length > 65_536) { overflow = true; child.kill('SIGKILL'); }
    });
  }
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(overflow, false);
    assert.equal(signal, null);
    assert.deepEqual(networkAttempts, [], 'a fresh CLI must not even attempt provider network work');
    return { code, stdout, stderr };
  } finally { clearTimeout(timer); }
}

test('the recovery network witness detects and blocks intentional attempts', { timeout: 10_000 }, async () => {
  const source = `import net from 'node:net';
    import assert from 'node:assert/strict';
    await assert.rejects(async () => fetch('https://example.invalid'), { name: 'CertificationNetworkBlockedError' });
    assert.throws(() => new net.Socket().connect(1, '127.0.0.1'), { name: 'CertificationNetworkBlockedError' });
    process.disconnect();`;
  const child = spawn(process.execPath, ['--import', witness, '--input-type=module', '--eval', source],
    { windowsHide: true, env: childEnvironment(), stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const attempts = [];
  child.on('message', (message) => attempts.push(message));
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.deepEqual(attempts, [
      { event: 'network-attempt', transport: 'fetch' },
      { event: 'network-attempt', transport: 'socket' },
    ]);
  } finally { clearTimeout(timer); }
});

for (const boundary of ['dispatch-uncertain', 'completion-persisted']) {
  test(`a killed workflow recovers safely from ${boundary} in a fresh process`, { timeout: 90_000 }, async (t) => {
    const fixture = await prepareRecoveryFixture(t);
    const originalManifest = await readFile(fixture.manifestPath, 'utf8');
    const originalInputs = await Promise.all(['mission-request.json', 'identity-policy.json', 'provider-policy.json']
      .map((name) => readFile(join(fixture.workspace, name), 'utf8')));
    const child = fork(harness, [], { windowsHide: true, env: childEnvironment(),
      execArgv: ['--import', guard], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const closed = once(child, 'close');
    const calls = [];
    try {
      const reached = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('owned child did not reach the fault boundary')), 15_000);
        const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
        child.once('error', (error) => finish(error));
        child.once('exit', () => finish(new Error('owned child exited before the fault boundary')));
        child.on('message', (message) => {
          if (message.event === 'provider-call') calls.push(message.phase);
          else if (message.event === 'kill-boundary') finish(null, message);
          else finish(new Error('owned child could not execute the recovery fixture'));
        });
      });
      child.send({ ...fixture, boundary });
      assert.deepEqual(await reached, { event: 'kill-boundary', boundary, phase: 'native' });
      assert.deepEqual(calls, ['native']);
      const lockPath = join(fixture.workspace, 'workflow-run.lock');
      const ownerText = await readFile(lockPath, 'utf8');
      assert.equal(JSON.parse(ownerText).pid, child.pid);
      await assert.rejects(readdir(join(fixture.workspace, 'artifacts')), { code: 'ENOENT' });
      assert.equal(child.kill('SIGKILL'), true);
      const [code, signal] = await closed;
      assert.ok(signal === 'SIGKILL' || code !== 0, 'the process must be terminated, not complete normally');
      const deadAt = Date.now();
      assert.equal(await readFile(lockPath, 'utf8'), ownerText, 'killing the child must leave real owner evidence');
      const immediate = await freshCli(fixture);
      assert.equal(immediate.code, 1, 'a recent owner lock must not be silently discarded');
      assert.equal(immediate.stdout, '');
      assert.equal(await readFile(lockPath, 'utf8'), ownerText);
      // Use real elapsed time, not modified timestamps or a weakened stale-lock policy.
      await delay(Math.max(0, deadAt + 30_200 - Date.now()));
      const recovered = await freshCli(fixture);
      assert.equal(recovered.stderr, '');
      assert.equal(recovered.code, boundary === 'dispatch-uncertain' ? 3 : 0);
      const result = JSON.parse(recovered.stdout);
      assert.equal(result.instanceId, fixture.instanceId);
      assert.equal(result.missionId, fixture.missionId);
      await assert.rejects(readFile(lockPath), { code: 'ENOENT' });
      if (boundary === 'dispatch-uncertain') {
        assert.equal(result.status, 'pending');
        assert.equal(result.artifact, null);
        await assert.rejects(readdir(join(fixture.workspace, 'artifacts')), { code: 'ENOENT' });
        const withCredential = await freshCli(fixture, { credentialPresent: true });
        assert.equal(withCredential.code, 3);
        assert.equal(JSON.parse(withCredential.stdout).status, 'pending');
      } else {
        assert.equal(result.status, 'completed');
        assert.equal(result.artifact.replayed, false);
        const artifactText = await readFile(result.artifact.path, 'utf8');
        assert.equal(JSON.parse(artifactText).content, 'two plus two is four.');
        assert.equal(result.receipt.acceptedArtifactDigest, result.artifact.artifactDigest);
        const replay = await freshCli(fixture, { credentialPresent: true });
        assert.equal(replay.code, 0);
        const replayResult = JSON.parse(replay.stdout);
        assert.deepEqual(replayResult.receipt, result.receipt);
        assert.equal(replayResult.artifact.path, result.artifact.path);
        assert.equal(replayResult.artifact.replayed, true);
        assert.equal(await readFile(result.artifact.path, 'utf8'), artifactText);
      }
      assert.equal(await readFile(fixture.manifestPath, 'utf8'), originalManifest);
      assert.deepEqual(await Promise.all(['mission-request.json', 'identity-policy.json', 'provider-policy.json']
        .map((name) => readFile(join(fixture.workspace, name), 'utf8'))), originalInputs);
      assert.deepEqual(calls, ['native']);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await closed;
    }
  });
}
