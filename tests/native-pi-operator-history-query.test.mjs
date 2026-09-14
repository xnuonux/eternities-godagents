import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Value } from '../src/core/digest.mjs';
import { nativePiCli } from '../src/host/native-pi-cli.mjs';
import { parseNativeOperatorArgs } from '../src/host/native-pi-operator-config.mjs';
import { runNativeOperator } from '../src/host/native-pi-operator.mjs';

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

async function fixture(t, limits = {}) {
  const root = await mkdtemp(join(tmpdir(), 'native-pi-history-query-cli-'));
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
    limits: { maxRunMs: 60000, ...limits },
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

test('parser emits historyQuery only when history query flags are present', () => {
  const pin = 'a'.repeat(64);
  const configPath = join(tmpdir(), 'history-query-config.json');
  assert.deepEqual(parseNativeOperatorArgs(['history', '--config', configPath, '--pin', pin]), {
    command: 'history', configPath, expectedConfigDigest: pin,
  });
  assert.equal(Object.hasOwn(parseNativeOperatorArgs(['history', '--config', configPath, '--pin', pin]), 'historyQuery'), false);
  assert.deepEqual(parseNativeOperatorArgs([
    'history', '--config', configPath, '--pin', pin, '--only', 'failed',
  ]), {
    command: 'history', configPath, expectedConfigDigest: pin, historyQuery: { only: 'failed' },
  });
  assert.deepEqual(parseNativeOperatorArgs([
    'history', '--config', configPath, '--pin', pin,
    '--only', 'settled', '--after', '2026-09-13T18:00:00.000Z', '--limit', '20',
  ]), {
    command: 'history', configPath, expectedConfigDigest: pin,
    historyQuery: { only: 'settled', after: '2026-09-13T18:00:00.000Z', limit: 20 },
  });
});

test('parser rejects unknown, duplicate, missing and non-canonical history flags', () => {
  const pin = 'a'.repeat(64);
  const configPath = join(tmpdir(), 'history-query-config.json');
  const promptPath = join(tmpdir(), 'history-query-prompt.txt');
  const history = (...flags) => parseNativeOperatorArgs(['history', '--config', configPath, '--pin', pin, ...flags]);
  assert.throws(() => history('--wat', '1'), /native-operator:unknown-flag/);
  assert.throws(() => history('--only', 'failed', '--only', 'settled'), /native-operator:duplicate-flag/);
  assert.throws(() => history('--limit'), /native-operator:flag-value/);
  assert.throws(() => history('--only', '--failed'), /native-operator:flag-value/);
  assert.throws(() => history('--only', 'native-turn-settled'), /native-operator:flag-value/);
  assert.throws(() => history('--after', '2026-09-13T18:00:00Z'), /native-operator:flag-value/);
  for (const value of ['+1', '01', '1.5', '1e2', '1e3', ' 1', '1 ', '0', '1001', '0001']) {
    assert.throws(() => history('--limit', value), /native-operator:flag-value/);
  }
  assert.deepEqual(history('--limit', '1').historyQuery, { limit: 1 });
  assert.deepEqual(history('--limit', '1000').historyQuery, { limit: 1000 });
  assert.throws(() => parseNativeOperatorArgs([
    'status', '--config', configPath, '--pin', pin, '--only', 'failed',
  ]), /native-operator:unknown-flag/);
  assert.throws(() => parseNativeOperatorArgs([
    'launch', '--config', configPath, '--pin', pin, '--prompt-file', promptPath, '--limit', '1',
  ]), /native-operator:unknown-flag/);
  assert.throws(() => parseNativeOperatorArgs([
    'history', '--config', configPath, '--pin', pin, '--prompt-file', promptPath, '--only', 'failed',
  ]), /native-operator:unexpected-prompt/);
});

test('history parser screens invalid calendar dates without exposing RangeError', () => {
  for (const after of ['2026-13-01T00:00:00.000Z', '2026-09-00T00:00:00.000Z', '2026-09-13T25:00:00.000Z', '2026-02-29T00:00:00.000Z']) {
    assert.throws(() => parseNativeOperatorArgs([
      'history', '--config', join(tmpdir(), 'query.json'), '--pin', 'a'.repeat(64), '--after', after,
    ]), { message: 'native-operator:flag-value' });
  }
});

test('offline history query accepts a recovery-enabled pinned configuration', async t => {
  const f = await fixture(t, { maxProviderRetries: 1 });
  const streams = capture();
  assert.equal(await nativePiCli([
    'history', '--config', f.configPath, '--pin', f.pin, '--only', 'settled', '--limit', '1',
  ], streams.streams), 0);
  assert.equal(streams.stderr, '');
  const report = JSON.parse(streams.stdout);
  assert.deepEqual(report.counts, { settled: 1, failed: 0, incomplete: 0 });
  assert.deepEqual(report.selection, { totalRuns: 3, matchedRuns: 1, returnedRuns: 1, hasMore: false });
  assert.equal(report.usage.totalTokens, 9);
});

test('history CLI applies query flags offline and keeps wrong-pin rejection', async t => {
  const f = await fixture(t);
  const streams = capture();
  assert.equal(await nativePiCli([
    'history', '--config', f.configPath, '--pin', f.pin, '--only', 'failed', '--limit', '1',
  ], streams.streams), 0);
  assert.equal(streams.stderr, '');
  const report = JSON.parse(streams.stdout);
  assert.equal(report.status, 'recorded-history');
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].status, 'failed');
  assert.equal(report.entries[0].category, 'native-pi:provider-failed');
  assert.deepEqual(report.counts, { settled: 0, failed: 1, incomplete: 0 });
  assert.deepEqual(report.selection, { totalRuns: 3, matchedRuns: 1, returnedRuns: 1, hasMore: false });
  assert.doesNotMatch(streams.stdout, /do-not-echo|Bearer|private-secret|private assistant|sk-or-never|private transcript|private-credential/);

  const after = capture();
  assert.equal(await nativePiCli([
    'history', '--config', f.configPath, '--pin', f.pin, '--after', '2026-09-13T18:00:00.000Z',
  ], after.streams), 0);
  const afterReport = JSON.parse(after.stdout);
  assert.deepEqual(afterReport.entries.map(entry => entry.runId), [ids[1], ids[2]]);
  assert.deepEqual(afterReport.selection, { totalRuns: 3, matchedRuns: 2, returnedRuns: 2, hasMore: false });
  assert.equal(afterReport.usage.totalTokens, null);

  const wrong = capture();
  assert.equal(await nativePiCli([
    'history', '--config', f.configPath, '--pin', 'f'.repeat(64), '--only', 'settled',
  ], wrong.streams), 1);
  assert.match(wrong.stderr, /native-operator:config-pin/);
  assert.equal(wrong.stdout, '');
  assert.doesNotMatch(wrong.stderr, /sk-or-never|Bearer|private-secret/);
});

test('programmatic historyQuery is rejected for non-history commands', async t => {
  const f = await fixture(t);
  await assert.rejects(runNativeOperator({
    command: 'status', config: f.config, expectedConfigDigest: f.pin, historyQuery: { only: 'settled' },
  }), /native-operator:unexpected-query/);
  await assert.rejects(runNativeOperator({
    command: 'launch', config: f.config, expectedConfigDigest: f.pin, prompt: 'do not run',
    historyQuery: { limit: 1 },
  }), /native-operator:unexpected-query/);
  const report = await runNativeOperator({
    command: 'history', config: f.config, expectedConfigDigest: f.pin, historyQuery: { only: 'incomplete' },
  });
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].status, 'incomplete');
  assert.deepEqual(report.selection, { totalRuns: 3, matchedRuns: 1, returnedRuns: 1, hasMore: false });
});
