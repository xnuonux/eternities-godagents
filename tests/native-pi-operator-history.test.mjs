import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Value } from '../src/core/digest.mjs';
import { nativePiCli } from '../src/host/native-pi-cli.mjs';

const cliPath = fileURLToPath(new URL('../src/host/native-pi-cli.mjs', import.meta.url));
const sessionId = '11111111-1111-4111-8111-111111111111';
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const usage = n => ({
  messageCount: 1, inputTokens: n, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0,
  totalTokens: n + 5, missingUsageMessages: 0, stopReasons: { stop: 1 },
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'native-pi-history-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'workspace');
  const sessionRoot = join(root, 'operator');
  await mkdir(cwd);
  await mkdir(join(root, 'pi-package'));
  await mkdir(join(sessionRoot, 'pi-sessions'), { recursive: true });
  await mkdir(join(sessionRoot, 'native-state'), { recursive: true });
  const config = {
    schemaVersion: 1, protocolId: 'eternities-native-pi-operator-v1',
    piPackageRoot: join(root, 'pi-package'), authPath: join(root, 'auth.json'),
    cwd, sessionRoot,
    admission: {
      receiptPath: join(root, 'admission', 'r.json'), creationDir: join(root, 'admission', 'creation'),
      distributionDir: join(root, 'admission', 'dist'), expectedPolicyDigest: 'a'.repeat(64),
      expectedCreationBuildId: 'b'.repeat(64), instanceId: 'instance-1', creatorRef: 'creator-1',
      transactionDir: join(root, 'admission', 'tx'), journalPath: join(root, 'admission', 'journal.json'),
      keelRoot: join(root, 'admission', 'keel'),
    },
    mission: { taskId: 'task-1', missionId: 'mission-1' },
    model: { provider: 'xai', id: 'grok-4.6', maxTokens: 4096 },
    grant: { allowedTools: ['read', 'write'], maxToolCalls: 20, expiresAt: '2099-01-01T00:00:00.000Z' },
    limits: { maxRunMs: 60000 },
  };
  await writeFile(join(root, 'auth.json'), JSON.stringify({ apiKey: 'sk-or-never-load', Bearer: 'private-credential' }));
  const pin = sha256Value(config);
  const sessionFile = join(sessionRoot, 'pi-sessions', 'session.jsonl');
  await writeFile(sessionFile, 'private transcript and prompt text\n');
  const request = {
    schemaVersion: 1,
    task: { taskId: sessionId, hostAdapterId: 'pi-sdk-v1', revocationEpoch: 0 },
    mission: config.mission, maxProjectionBytes: 32768,
  };
  const grant = {
    schemaVersion: 1, protocolId: 'eternities-native-host-grant-v1',
    instanceId: config.admission.instanceId, identityDigest: 'c'.repeat(64),
    realmContractDigest: 'd'.repeat(64), sessionId, cwd, model: { provider: 'xai', id: 'grok-4.6' },
    ...config.grant,
  };
  const body = {
    schemaVersion: 1, protocolId: 'eternities-native-pi-operator-session-v1',
    configDigest: pin, sessionId, sessionFile, request, grant,
  };
  await writeFile(join(sessionRoot, 'operator.json'), JSON.stringify({ ...body, metadataDigest: sha256Value(body) }) + '\n');
  const association = {
    grantDigest: sha256Value(grant), instanceId: config.admission.instanceId, sessionId, cwd,
  };
  const stateBody = {
    schemaVersion: 1, protocolId: 'eternities-native-host-state-v1', association,
    associationDigest: sha256Value(association), phase: 'idle', turns: 1,
    inferences: { native: 1, compaction: 0 },
    actions: [{ callId: 'a', toolName: 'read', status: 'completed', isError: false }],
  };
  await writeFile(join(sessionRoot, 'native-state', 'session.json'),
    JSON.stringify({ ...stateBody, stateDigest: sha256Value(stateBody) }) + '\n');
  const add = async (index, result) => {
    const path = join(sessionRoot, 'runs', ids[index]);
    await mkdir(path, { recursive: true });
    const startedAt = `2026-09-13T18:0${index}:00.000Z`;
    await writeFile(join(path, 'started.json'), JSON.stringify({
      schemaVersion: 1, command: index ? 'resume' : 'launch', startedAt, configDigest: pin, sessionId,
      promptDigest: 'b'.repeat(64),
    }));
    if (result) {
      await writeFile(join(path, 'result.json'), JSON.stringify({
        startedAt, finishedAt: `2026-09-13T18:0${index}:30.000Z`, ...result,
      }));
    }
    await writeFile(join(path, 'response.md'), 'private assistant handoff');
  };
  await add(0, { status: 'native-turn-settled', usage: usage(4), state: { sessionId }, private: 'do-not-echo-me' });
  await add(1, {
    status: 'failed', category: 'native-pi:provider-failed', usage: usage(6),
    state: { sessionId }, error: 'Bearer private-secret',
  });
  await add(2, null);
  const configPath = join(root, 'operator-config.json');
  await writeFile(configPath, JSON.stringify(config));
  return { root, config, configPath, pin, sessionRoot };
}

function capture() {
  let stdout = '', stderr = '';
  return {
    streams: {
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
    },
    get stdout() { return stdout; },
    get stderr() { return stderr; },
  };
}

test('help exits 0 without config or credentials and describes the real command surface', async () => {
  const streams = capture();
  assert.equal(await nativePiCli(['--help'], streams.streams), 0);
  assert.equal(streams.stderr, '');
  for (const term of ['preflight', 'launch', 'resume', 'status', 'history', '--config', '--pin', '--prompt-file']) {
    assert.match(streams.stdout, new RegExp(term));
  }
  assert.match(streams.stdout, /OS user/i);
  assert.match(streams.stdout, /not a sandbox/i);
  assert.doesNotMatch(streams.stdout, /billing cap guaranteed|sandboxed|sk-or-|Bearer/i);
  const spawned = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(spawned.status, 0);
  assert.match(spawned.stdout, /history/);
  assert.equal(spawned.stderr, '');
});

test('history parser requires pinned config and rejects a prompt file', async () => {
  const { parseNativeOperatorArgs } = await import('../src/host/native-pi-operator-config.mjs');
  const pin = 'a'.repeat(64);
  const configPath=join(tmpdir(),'history-config.json'),promptPath=join(tmpdir(),'history-prompt.txt');
  assert.equal(parseNativeOperatorArgs(['history', '--config', configPath, '--pin', pin]).command, 'history');
  assert.deepEqual(parseNativeOperatorArgs(['history', '--config', configPath, '--pin', pin]), {
    command: 'history', configPath, expectedConfigDigest: pin,
  });
  assert.throws(() => parseNativeOperatorArgs([
    'history', '--config', configPath, '--pin', pin, '--prompt-file', promptPath,
  ]), /native-operator:unexpected-prompt/);
});

test('history CLI is offline, retains failed and incomplete runs, and screens private fields', async t => {
  const f = await fixture(t);
  const streams = capture();
  assert.equal(await nativePiCli(['history', '--config', f.configPath, '--pin', f.pin], streams.streams), 0);
  assert.equal(streams.stderr, '');
  const report = JSON.parse(streams.stdout);
  assert.equal(report.status, 'recorded-history');
  assert.deepEqual(report.counts, { settled: 1, failed: 1, incomplete: 1 });
  assert.equal(report.entries.length, 3);
  assert.equal(report.entries[1].status, 'failed');
  assert.equal(report.entries[1].category, 'native-pi:provider-failed');
  assert.equal(report.entries[2].status, 'incomplete');
  assert.equal(report.entries[2].finishedAt, null);
  assert.equal(report.usage.totalTokens, null);
  assert.doesNotMatch(streams.stdout, /do-not-echo|Bearer|private-secret|private assistant|sk-or-never|private transcript|private-credential/);
});

test('history CLI rejects a wrong pin and does not accept a prompt file', async t => {
  const f = await fixture(t);
  const wrong = capture();
  assert.equal(await nativePiCli(['history', '--config', f.configPath, '--pin', 'f'.repeat(64)], wrong.streams), 1);
  assert.match(wrong.stderr, /native-operator:config-pin/);
  assert.equal(wrong.stdout, '');
  assert.doesNotMatch(wrong.stderr, /sk-or-never|Bearer|private-secret/);
  const prompted = capture();
  assert.equal(await nativePiCli([
    'history', '--config', f.configPath, '--pin', f.pin, '--prompt-file', join(f.root, 'auth.json'),
  ], prompted.streams), 1);
  assert.match(prompted.stderr, /native-operator:unexpected-prompt/);
  assert.doesNotMatch(prompted.stderr, /sk-or-never|private-credential/);
});
