import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAttempt, readResponseJson } from '../scripts/evaluation/attempt.mjs';
const api = await import('../scripts/evaluation/dispatch.mjs').catch(e => { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; return {}; });
const endpoint = 'https://example.invalid/v1/chat/completions';
const config = { endpoint, model: 'test-model', maximumCalls: 1, maximumReservedTokens: 12,
  maximumRequestBytes: 512, maximumWallMs: 1000, timeoutMs: 100 };
const request = () => ({ method: 'POST', body: JSON.stringify({ model: 'test-model', reasoning_split: true, max_completion_tokens: 8 }) });

test('dispatch rejects endpoint, method, model, format and size changes before sending', async () => {
  assert.equal(typeof api.createBoundedDispatch, 'function');
  for (const mutate of [x => x.url += '?other=1', x => x.init.method = 'GET',
    x => x.init.body = '{', x => x.init.body = JSON.stringify({ model: 'other', reasoning_split: true, max_completion_tokens: 8 }),
    x => x.init.body = JSON.stringify({ model: 'test-model', max_completion_tokens: 8 }),
    x => x.init.body = JSON.stringify({ model: 'test-model', reasoning_split: true, max_completion_tokens: 13 }),
    x => x.init.body = ' '.repeat(513)]) {
    let sent = 0;
    const dispatch = api.createBoundedDispatch(config, { fetchImpl: async () => { sent++; }, now: () => 0 });
    const input = { url: endpoint, init: request() }; mutate(input);
    const dir = await mkdtemp(join(tmpdir(), 'godagents-dispatch-'));
    const result = await runAttempt(dir, journal => readResponseJson(journal, () => dispatch.fetch(input.url, input.init), 128));
    assert.equal(result.category, 'dispatch-ceiling'); assert.equal(sent, 0);
  }
});

test('failed physical call keeps reservation and cannot be retried', async () => {
  assert.equal(typeof api.createBoundedDispatch, 'function');
  let sent = 0;
  const dispatch = api.createBoundedDispatch(config, { fetchImpl: async () => { sent++; throw new Error('synthetic transport failure'); }, now: () => 0 });
  await assert.rejects(dispatch.fetch(endpoint, request()));
  await assert.rejects(dispatch.fetch(endpoint, request()));
  assert.equal(sent, 1);
  assert.deepEqual(dispatch.snapshot(), { attemptedCalls: 1, reservedCompletionTokens: 8 });
});

test('dispatch pins redirect rejection and abort signal, and enforces elapsed wall limit', async () => {
  assert.equal(typeof api.createBoundedDispatch, 'function');
  let clock = 0; let sent = 0;
  const dispatch = api.createBoundedDispatch({ ...config, maximumCalls: 2, maximumReservedTokens: 24 }, {
    now: () => clock, fetchImpl: async (url, init) => {
      sent++; assert.equal(url, endpoint); assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal); return new Response('{}');
    } });
  await dispatch.fetch(endpoint, { ...request(), redirect: 'follow' });
  clock = 1000;
  await assert.rejects(dispatch.fetch(endpoint, request()));
  assert.equal(sent, 1);
});

test('cumulative reservation denies another call even below the call-count limit', async () => {
  let sent = 0;
  const dispatch = api.createBoundedDispatch({ ...config, maximumCalls: 3 }, {
    now: () => 0, fetchImpl: async () => { sent++; return new Response('{}'); } });
  await dispatch.fetch(endpoint, request());
  await assert.rejects(dispatch.fetch(endpoint, request()));
  assert.equal(sent, 1);
  assert.equal(dispatch.snapshot().reservedCompletionTokens, 8);
});

test('configured timeout aborts a pending transport without retry', async () => {
  let sent = 0;
  const keepAlive = setTimeout(() => {}, 500);
  try {
    const dispatch = api.createBoundedDispatch({ ...config, timeoutMs: 10 }, {
      fetchImpl: async (_url, init) => {
        sent++;
        return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
      } });
    await assert.rejects(dispatch.fetch(endpoint, request()), { name: 'TimeoutError' });
    assert.equal(sent, 1);
  } finally { clearTimeout(keepAlive); }
});
