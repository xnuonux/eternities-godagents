import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readNativeRunHistory } from '../src/host/native-run-history.mjs';

const sessionId = '11111111-1111-4111-8111-111111111111';
const configDigest = 'a'.repeat(64);
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const usage = n => ({
  messageCount: 1, inputTokens: n, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0,
  totalTokens: n + 5, missingUsageMessages: 0, stopReasons: { stop: 1 },
});

async function session(t) {
  const sessionRoot = await mkdtemp(join(tmpdir(), 'native-run-history-'));
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

test('retains legitimate Godskills failure categories without accepting raw diagnostics',async t=>{
  for(const category of ['native-godskills:verification-failed','native-godskills:binding-mismatch']) {
    const root=await session(t);await add(root,0,{status:'failed',category});
    const report=await read(root);
    assert.equal(report.entries[0].category,category);
    assert.deepEqual(report.counts,{settled:0,failed:1,incomplete:0});
  }
  for(const category of ['native-godskills:Bearer-secret','native-godskills:failed\nprivate','native-godskills:','untrusted:failed']) {
    const root=await session(t);await add(root,0,{status:'failed',category});
    await assert.rejects(read(root),/native-run-history:category/);
  }
});

test('aggregates settled and failed operator records without echoing private fields', async t => {
  const root = await session(t);
  await add(root, 0, {
    status: 'native-turn-settled', usage: usage(4), state: { sessionId }, private: 'do-not-echo-me',
  });
  await add(root, 1, {
    status: 'failed', category: 'native-pi:provider-failed', usage: usage(6),
    state: { sessionId }, error: 'Bearer private-secret',
  }, { response: 'private assistant handoff' });
  const report = await read(root);
  assert.equal(report.status, 'recorded-history');
  assert.deepEqual(report.counts, { settled: 1, failed: 1, incomplete: 0 });
  assert.deepEqual(report.usage, {
    inputTokens: 10, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 0, totalTokens: 20,
  });
  assert.equal(report.entries.length, 2);
  assert.deepEqual(report.entries[0], {
    runId: ids[0], status: 'native-turn-settled', startedAt: '2026-09-13T18:00:00.000Z',
    finishedAt: '2026-09-13T18:00:30.000Z',
  });
  assert.deepEqual(report.entries[1], {
    runId: ids[1], status: 'failed', startedAt: '2026-09-13T18:01:00.000Z',
    finishedAt: '2026-09-13T18:01:30.000Z', category: 'native-pi:provider-failed',
  });
  assert.equal(Object.hasOwn(report.entries[0], 'category'), false);
  assert.doesNotMatch(JSON.stringify(report), /do-not-echo|Bearer|private-secret|private assistant|promptDigest|runPath/);
});

test('missing result after a valid start is incomplete and nulls all usage totals', async t => {
  const root = await session(t);
  await add(root, 0, { status: 'native-turn-settled', usage: usage(4), state: { sessionId } });
  await add(root, 1, { status: 'failed', category: 'native-operator:interrupted', usage: usage(6) });
  await add(root, 2, null);
  const report = await read(root);
  assert.deepEqual(report.counts, { settled: 1, failed: 1, incomplete: 1 });
  assert.deepEqual(report.usage, {
    inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null,
  });
  assert.equal(report.entries[2].status, 'incomplete');
  assert.equal(report.entries[2].finishedAt, null);
  assert.equal(Object.hasOwn(report.entries[2], 'category'), false);
});

test('sorts by startedAt then runId and preserves reported zeros', async t => {
  const root = await session(t);
  const later = 'aaaaaaaa-1111-4111-8111-111111111111';
  const earlier = 'ffffffff-1111-4111-8111-111111111111';
  await add(root, 0, { status: 'native-turn-settled', usage: usage(0) }, {
    runId: later, startedAt: '2026-09-13T18:02:00.000Z', finishedAt: '2026-09-13T18:02:01.000Z',
  });
  await add(root, 1, { status: 'native-turn-settled', usage: usage(0) }, {
    runId: earlier, startedAt: '2026-09-13T18:01:00.000Z', finishedAt: '2026-09-13T18:01:01.000Z',
  });
  const report = await read(root);
  assert.deepEqual(report.entries.map(entry => entry.runId), [earlier, later]);
  assert.equal(report.usage.cacheWriteTokens, 0);
  assert.equal(report.usage.inputTokens, 0);
});

test('missing usage is unknown and totals are never reconstructed from cache fields', async t => {
  const root = await session(t);
  await add(root, 0, {
    status: 'native-turn-settled',
    usage: { messageCount: 1, inputTokens: 4, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 1 },
  });
  await add(root, 1, { status: 'failed', category: 'native-host:tool-failed' });
  const report = await read(root);
  assert.equal(report.usage.inputTokens, null);
  assert.equal(report.usage.outputTokens, null);
  assert.equal(report.usage.cacheReadTokens, null);
  assert.equal(report.usage.cacheWriteTokens, null);
  assert.equal(report.usage.totalTokens, null);
});

test('null collector fields null only the affected aggregate', async t => {
  const root = await session(t);
  await add(root, 0, {
    status: 'native-turn-settled',
    usage: { ...usage(4), cacheReadTokens: null, totalTokens: null },
  });
  await add(root, 1, { status: 'native-turn-settled', usage: usage(6) });
  const report = await read(root);
  assert.equal(report.usage.inputTokens, 10);
  assert.equal(report.usage.outputTokens, 4);
  assert.equal(report.usage.cacheWriteTokens, 0);
  assert.equal(report.usage.cacheReadTokens, null);
  assert.equal(report.usage.totalTokens, null);
});

test('rejects foreign session or config bindings instead of skipping them', async t => {
  const root = await session(t);
  await add(root, 0, { status: 'native-turn-settled', usage: usage(4) });
  await assert.rejects(read(root, { expectedSessionId: 'wrong' }), /native-run-history:/);
  await assert.rejects(read(root, { expectedConfigDigest: 'c'.repeat(64) }), /native-run-history:/);
});

test('rejects corrupt, oversized, unscreened, and mismatched completed records', async t => {
  const root = await session(t);
  await add(root, 0, { status: 'native-turn-settled', usage: usage(4) });
  await writeFile(join(root, 'runs', ids[0], 'result.json'), '{broken-json');
  await assert.rejects(read(root), /native-run-history:/);

  const broken = await session(t);
  await add(broken, 0, { status: 'native-turn-settled', usage: usage(4) }, {
    startedText: '{"schemaVersion":1',
  });
  await assert.rejects(read(broken), /native-run-history:/);

  const oversized = await session(t);
  await add(oversized, 0, { status: 'native-turn-settled', usage: usage(4) });
  await writeFile(join(oversized, 'runs', ids[0], 'started.json'), `${'x'.repeat(1024 * 1024 + 1)}`);
  await assert.rejects(read(oversized), /native-run-history:/);

  const category = await session(t);
  await add(category, 0, { status: 'failed', category: 'Bearer private-secret', usage: usage(1) });
  await assert.rejects(read(category), /native-run-history:/);

  const state = await session(t);
  await add(state, 0, { status: 'native-turn-settled', usage: usage(1), state: { sessionId: 'other-session' } });
  await assert.rejects(read(state), /native-run-history:/);

  const command = await session(t);
  await add(command, 0, { status: 'native-turn-settled', usage: usage(1) }, { command: 'status' });
  await assert.rejects(read(command), /native-run-history:/);
});

test('rejects unsafe run directories, missing starts, and more than 1000 runs', async t => {
  const missingStart = await session(t);
  await mkdir(join(missingStart, 'runs', ids[0]), { recursive: true });
  await assert.rejects(read(missingStart), /native-run-history:/);

  const foreignName = await session(t);
  await add(foreignName, 0, { status: 'native-turn-settled', usage: usage(1) }, { runId: 'not-a-uuid' });
  await assert.rejects(read(foreignName), /native-run-history:/);

  const many = await session(t);
  await mkdir(join(many, 'runs'), { recursive: true });
  await Promise.all(Array.from({ length: 1001 }, (_, index) => {
    const runId = `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
    return mkdir(join(many, 'runs', runId));
  }));
  await assert.rejects(read(many), /native-run-history:/);

  const linked = await session(t);
  const outside = await mkdtemp(join(tmpdir(), 'native-run-history-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await add(outside, 0, { status: 'native-turn-settled', usage: usage(1) });
  await mkdir(join(linked, 'runs'), { recursive: true });
  try {
    await symlink(join(outside, 'runs', ids[0]), join(linked, 'runs', ids[0]), 'junction');
  } catch (error) {
    t.skip(`symlink unavailable: ${error.code ?? error.message}`);
    return;
  }
  await assert.rejects(read(linked), /native-run-history:/);
});

test('empty recorded history sums to zero rather than unknown', async t => {
  const root = await session(t);
  await mkdir(join(root, 'runs'));
  const report = await read(root);
  assert.deepEqual(report, {
    status: 'recorded-history',
    entries: [],
    counts: { settled: 0, failed: 0, incomplete: 0 },
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 },
  });
});
