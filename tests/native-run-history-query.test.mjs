import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readNativeRunHistory } from '../src/host/native-run-history.mjs';

const sessionId = '11111111-1111-4111-8111-111111111111';
const configDigest = 'a'.repeat(64);
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
];
const usage = n => ({
  messageCount: 1, inputTokens: n, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0,
  totalTokens: n + 5, missingUsageMessages: 0, stopReasons: { stop: 1 },
});

async function session(t) {
  const sessionRoot = await mkdtemp(join(tmpdir(), 'native-run-history-query-'));
  t.after(() => rm(sessionRoot, { recursive: true, force: true }));
  return sessionRoot;
}

async function add(sessionRoot, index, result, extras = {}) {
  const runId = extras.runId ?? ids[index];
  const path = join(sessionRoot, 'runs', runId);
  await mkdir(path, { recursive: true });
  const startedAt = extras.startedAt ?? `2026-09-13T18:0${index}:00.000Z`;
  const started = {
    schemaVersion: 1,
    command: extras.command ?? (index ? 'resume' : 'launch'),
    startedAt,
    configDigest: extras.configDigest ?? configDigest,
    sessionId: extras.sessionId ?? sessionId,
    promptDigest: extras.promptDigest ?? 'b'.repeat(64),
    ...extras.startedExtra,
  };
  await writeFile(join(path, 'started.json'), extras.startedText ?? JSON.stringify(started));
  if (result !== undefined && result !== null) {
    const body = {
      startedAt,
      finishedAt: extras.finishedAt ?? `2026-09-13T18:0${index}:30.000Z`,
      ...result,
    };
    await writeFile(join(path, 'result.json'), extras.resultText ?? JSON.stringify(body));
  }
  if (extras.response) await writeFile(join(path, 'response.md'), extras.response);
  return path;
}

const read = (sessionRoot, overrides = {}) => readNativeRunHistory({
  sessionRoot, expectedSessionId: sessionId, expectedConfigDigest: configDigest, ...overrides,
});

async function mixed(t) {
  const root = await session(t);
  await add(root, 0, { status: 'native-turn-settled', usage: usage(4), state: { sessionId }, private: 'do-not-echo-me' });
  await add(root, 1, {
    status: 'failed', category: 'native-pi:provider-failed', usage: usage(6),
    state: { sessionId }, error: 'Bearer private-secret',
  }, { response: 'private assistant handoff' });
  await add(root, 2, null);
  await add(root, 3, { status: 'native-turn-settled', usage: usage(8), state: { sessionId } });
  await add(root, 4, { status: 'failed', category: 'native-godskills:verification-failed', usage: usage(1) });
  return root;
}

test('omitted and empty query keep the unfiltered report shape', async t => {
  const root = await mixed(t);
  const omitted = await read(root);
  const empty = await read(root, { query: {} });
  assert.equal(Object.hasOwn(omitted, 'selection'), false);
  assert.equal(Object.hasOwn(empty, 'selection'), false);
  assert.deepEqual(empty, omitted);
  assert.equal(omitted.entries.length, 5);
  assert.deepEqual(omitted.counts, { settled: 2, failed: 2, incomplete: 1 });
  assert.deepEqual(omitted.usage, {
    inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null,
  });
});

test('only settled maps to stored native-turn-settled and reports returned aggregates', async t => {
  const root = await mixed(t);
  const report = await read(root, { query: { only: 'settled' } });
  assert.deepEqual(report.entries.map(entry => entry.status), ['native-turn-settled', 'native-turn-settled']);
  assert.deepEqual(report.entries.map(entry => entry.runId), [ids[0], ids[3]]);
  assert.deepEqual(report.counts, { settled: 2, failed: 0, incomplete: 0 });
  assert.deepEqual(report.usage, {
    inputTokens: 12, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 0, totalTokens: 22,
  });
  assert.deepEqual(report.selection, { totalRuns: 5, matchedRuns: 2, returnedRuns: 2, hasMore: false });
  assert.doesNotMatch(JSON.stringify(report), /do-not-echo|Bearer|private-secret|private assistant|promptDigest|runPath/);
});

test('only failed and incomplete filter without echoing private fields', async t => {
  const root = await mixed(t);
  const failed = await read(root, { query: { only: 'failed' } });
  assert.deepEqual(failed.entries.map(entry => entry.category), [
    'native-pi:provider-failed', 'native-godskills:verification-failed',
  ]);
  assert.deepEqual(failed.counts, { settled: 0, failed: 2, incomplete: 0 });
  assert.deepEqual(failed.usage, {
    inputTokens: 7, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 0, totalTokens: 17,
  });
  const incomplete = await read(root, { query: { only: 'incomplete' } });
  assert.equal(incomplete.entries.length, 1);
  assert.equal(incomplete.entries[0].status, 'incomplete');
  assert.equal(incomplete.entries[0].finishedAt, null);
  assert.deepEqual(incomplete.counts, { settled: 0, failed: 0, incomplete: 1 });
  assert.deepEqual(incomplete.usage, {
    inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null,
  });
});

test('after is a strict startedAt comparison and keeps ascending order', async t => {
  const root = await mixed(t);
  const report = await read(root, { query: { after: '2026-09-13T18:02:00.000Z' } });
  assert.deepEqual(report.entries.map(entry => entry.runId), [ids[3], ids[4]]);
  assert.deepEqual(report.selection, { totalRuns: 5, matchedRuns: 2, returnedRuns: 2, hasMore: false });
  const none = await read(root, { query: { after: '2026-09-13T18:04:00.000Z' } });
  assert.deepEqual(none.entries, []);
  assert.deepEqual(none.counts, { settled: 0, failed: 0, incomplete: 0 });
  assert.deepEqual(none.usage, {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0,
  });
  assert.deepEqual(none.selection, { totalRuns: 5, matchedRuns: 0, returnedRuns: 0, hasMore: false });
});

test('limit keeps the latest matches then returns them in ascending order', async t => {
  const root = await mixed(t);
  const report = await read(root, { query: { only: 'settled', limit: 1 } });
  assert.deepEqual(report.entries.map(entry => entry.runId), [ids[3]]);
  assert.deepEqual(report.counts, { settled: 1, failed: 0, incomplete: 0 });
  assert.deepEqual(report.usage, {
    inputTokens: 8, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0, totalTokens: 13,
  });
  assert.deepEqual(report.selection, { totalRuns: 5, matchedRuns: 2, returnedRuns: 1, hasMore: true });
  const page = await read(root, { query: { after: '2026-09-13T18:00:00.000Z', limit: 2 } });
  assert.deepEqual(page.entries.map(entry => entry.runId), [ids[3], ids[4]]);
  assert.deepEqual(page.selection, { totalRuns: 5, matchedRuns: 4, returnedRuns: 2, hasMore: true });
});

test('counts and usage describe returned rows; excluded incomplete does not null totals', async t => {
  const root = await mixed(t);
  const report = await read(root, { query: { only: 'settled', after: '2026-09-13T17:00:00.000Z' } });
  assert.equal(report.entries.some(entry => entry.status === 'incomplete'), false);
  assert.deepEqual(report.counts, { settled: 2, failed: 0, incomplete: 0 });
  assert.equal(report.usage.inputTokens, 12);
  const latestFailed = await read(root, { query: { only: 'failed', limit: 1 } });
  assert.equal(latestFailed.entries[0].category, 'native-godskills:verification-failed');
  assert.deepEqual(latestFailed.usage, {
    inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0, totalTokens: 6,
  });
});

test('unknown usage stays null per field on returned rows', async t => {
  const root = await session(t);
  await add(root, 0, {
    status: 'native-turn-settled',
    usage: { messageCount: 1, inputTokens: 4, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 1 },
  });
  await add(root, 1, { status: 'failed', category: 'native-host:tool-failed' });
  const report = await read(root, { query: { only: 'failed' } });
  assert.deepEqual(report.usage, {
    inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null,
  });
  const settled = await read(root, { query: { only: 'settled' } });
  assert.equal(settled.usage.inputTokens, 4);
  assert.equal(settled.usage.totalTokens, null);
});

test('empty recorded history with a nonempty query is zero rather than unknown', async t => {
  const root = await session(t);
  await mkdir(join(root, 'runs'));
  const report = await read(root, { query: { only: 'settled', limit: 10 } });
  assert.deepEqual(report, {
    status: 'recorded-history',
    entries: [],
    counts: { settled: 0, failed: 0, incomplete: 0 },
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 },
    selection: { totalRuns: 0, matchedRuns: 0, returnedRuns: 0, hasMore: false },
  });
});

test('rejects null, arrays, unknown keys, explicit undefined and invalid query fields', async t => {
  const root = await mixed(t);
  const rejected = [
    null,
    [],
    { extra: 1 },
    { only: undefined },
    { after: undefined },
    { limit: undefined },
    { only: 'native-turn-settled' },
    { only: 'SETTLED' },
    { after: '2026-09-13T18:00:00Z' },
    { after: '2026-09-13T18:00:00.000+00:00' },
    { after: '2026-02-30T00:00:00.000Z' },
    { limit: 0 },
    { limit: 1001 },
    { limit: 1.5 },
    { limit: '1' },
    { limit: 1n },
    { only: 'settled', unknown: true },
  ];
  for (const query of rejected) {
    await assert.rejects(read(root, { query }), /native-run-history:query/);
  }
  await assert.doesNotReject(read(root, { query: { limit: 1 } }));
  await assert.doesNotReject(read(root, { query: { limit: 1000 } }));
});

test('only rejects values that merely coerce to an allowed status', async t => {
  const root = await session(t);
  for (const only of [['failed'], new String('settled'), { toString: () => 'incomplete' }]) {
    await assert.rejects(read(root, { query: { only } }), { message: 'native-run-history:query' });
  }
});

test('invalid calendar values produce screened query errors rather than RangeError', async t => {
  const root = await session(t);
  for (const after of [
    '2026-13-01T00:00:00.000Z', '2026-00-01T00:00:00.000Z',
    '2026-09-00T00:00:00.000Z', '2026-09-13T25:00:00.000Z',
    '2026-09-13T00:60:00.000Z', '2026-09-13T00:00:60.000Z',
    '2026-02-29T00:00:00.000Z',
  ]) {
    await assert.rejects(read(root, { query: { after } }), { message: 'native-run-history:query' });
  }
  await assert.doesNotReject(read(root, { query: { after: '2024-02-29T00:00:00.000Z' } }));
});

test('invalid stored dates still produce screened timestamp errors even when excluded', async t => {
  const root = await session(t);
  await add(root, 0, null, { startedAt: '2026-13-01T00:00:00.000Z' });
  await assert.rejects(read(root, { query: { only: 'settled' } }), { message: 'native-run-history:timestamp' });
});

test('validates every stored run before filtering excluded records', async t => {
  const binding = await session(t);
  await add(binding, 0, { status: 'native-turn-settled', usage: usage(4) });
  await add(binding, 1, { status: 'failed', category: 'native-operator:interrupted', usage: usage(1) }, {
    sessionId: '99999999-9999-4999-8999-999999999999',
  });
  await assert.rejects(read(binding, { query: { only: 'settled' } }), /native-run-history:binding/);

  const malformed = await session(t);
  await add(malformed, 0, { status: 'native-turn-settled', usage: usage(4) });
  await add(malformed, 1, { status: 'failed', category: 'native-pi:provider-failed' });
  await writeFile(join(malformed, 'runs', ids[1], 'result.json'), '{broken');
  await assert.rejects(read(malformed, { query: { after: '2026-09-13T18:01:00.000Z' } }), /native-run-history:/);

  const usageBroken = await session(t);
  await add(usageBroken, 0, { status: 'native-turn-settled', usage: usage(4) });
  await add(usageBroken, 1, { status: 'native-turn-settled', usage: { inputTokens: 'nope', outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 1 } });
  await assert.rejects(read(usageBroken, { query: { only: 'failed' } }), /native-run-history:usage/);

  const category = await session(t);
  await add(category, 0, { status: 'native-turn-settled', usage: usage(1) });
  await add(category, 1, { status: 'failed', category: 'untrusted:failed' });
  await assert.rejects(read(category, { query: { only: 'settled' } }), /native-run-history:category/);
});
