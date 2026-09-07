import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const api = await import('../scripts/evaluation/attempt.mjs').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const directory = () => mkdtemp(join(tmpdir(), 'godagents-diagnostics-'));

test('a dispatch failure preserves safe headers and does not retry or expose error text', async () => {
  assert.equal(typeof api.runAttempt, 'function');
  const dir = await directory(); let calls = 0;
  const result = await api.runAttempt(dir, async (journal) => {
    calls++;
    await journal.dispatchStarted();
    await journal.headersReceived(429);
    throw new Error('Bearer synthetic-secret response body private');
  });
  assert.equal(result.category, 'unclassified');
  assert.equal(result.usageKnown, false);
  assert.equal(calls, 1);
  const events = await Promise.all((await readdir(dir)).sort().map((name) => readFile(join(dir, name), 'utf8')));
  assert.ok(events.some((text) => JSON.parse(text).httpStatus === 429));
  assert.ok(!events.join('').includes('synthetic-secret'));
  await assert.rejects(api.runAttempt(dir, async () => { calls++; }));
  assert.equal(calls, 1);
});

test('trusted failure categories survive while forged error properties do not', async () => {
  assert.equal(typeof api.diagnosticFailure, 'function');
  for (const category of ['response-json', 'response-envelope', 'usage-invalid']) {
    const result = await api.runAttempt(await directory(), async () => { throw api.diagnosticFailure(category); });
    assert.equal(result.category, category);
  }
  const result = await api.runAttempt(await directory(), async () => {
    throw Object.assign(new Error('secret'), { code: 'response-json', category: 'response-json' });
  });
  assert.equal(result.category, 'unclassified');
});

test('journal is on disk before dispatch continues and success requires explicit completion', async () => {
  assert.equal(typeof api.runAttempt, 'function');
  const dir = await directory();
  const result = await api.runAttempt(dir, async (journal) => {
    await journal.dispatchStarted();
    const event = JSON.parse(await readFile(join(dir, '001-dispatch.json'), 'utf8'));
    assert.equal(event.event, 'dispatch-started');
    await journal.completed();
  });
  assert.equal(result.status, 'completed');
  const unfinished = await api.runAttempt(await directory(), async () => {});
  assert.equal(unfinished.status, 'stopped');
  assert.equal(unfinished.category, 'completion-not-recorded');
});

test('real bounded response reader distinguishes malformed JSON from transport rejection', async () => {
  assert.equal(typeof api.readResponseJson, 'function');
  const malformedDir = await directory();
  const malformed = await api.runAttempt(malformedDir, async (journal) => {
    await api.readResponseJson(journal, () => Promise.resolve(new Response('private not json', { status: 502, headers: { 'content-type': 'application/json' } })), 128);
  });
  assert.equal(malformed.category, 'response-json');
  assert.equal(JSON.parse(await readFile(join(malformedDir, '002-headers.json'), 'utf8')).httpStatus, 502);
  const transport = await api.runAttempt(await directory(), async (journal) => {
    await api.readResponseJson(journal, () => Promise.reject(new Error('secret endpoint')), 128);
  });
  assert.equal(transport.category, 'transport-failure');
});

test('bounded response reader rejects oversized data and preserves valid JSON for validation', async () => {
  assert.equal(typeof api.readResponseJson, 'function');
  const oversized = await api.runAttempt(await directory(), async (journal) => {
    await api.readResponseJson(journal, () => Promise.resolve(new Response('x'.repeat(129))), 128);
  });
  assert.equal(oversized.category, 'response-ceiling');
  const valid = await api.runAttempt(await directory(), async (journal) => {
    const response = await api.readResponseJson(journal, () => Promise.resolve(new Response('{"answer":42}', { headers: { 'content-type': 'application/json' } })), 128);
    assert.deepEqual(response, { httpStatus: 200, envelope: { answer: 42 } });
    await journal.completed();
  });
  assert.equal(valid.status, 'completed');
});

test('trusted dispatch ceiling is not mislabeled as a transport failure', async () => {
  const result = await api.runAttempt(await directory(), async (journal) => {
    await api.readResponseJson(journal, async () => { throw api.diagnosticFailure('dispatch-ceiling'); }, 128);
  });
  assert.equal(result.category, 'dispatch-ceiling');
});

test('malformed HTTP metadata has its own bounded diagnostic', async () => {
  const result = await api.runAttempt(await directory(), async (journal) => {
    await api.readResponseJson(journal, async () => ({ status: 99 }), 128);
  });
  assert.equal(result.category, 'http-status-invalid');
});

test('journal persistence failure never returns a recorded completion', async () => {
  const dir = await directory();
  let calls = 0;
  await assert.rejects(api.runAttempt(join(dir, 'absent'), async () => { calls++; }));
  assert.equal(calls, 0);
  await writeFile(join(dir, '001-result.json'), 'historical-evidence', { flag: 'wx' });
  await assert.rejects(api.runAttempt(dir, async (journal) => { await journal.completed(); }));
  assert.equal(await readFile(join(dir, '001-result.json'), 'utf8'), 'historical-evidence');
  await assert.rejects(api.runAttempt(dir, async () => { calls++; }));
  assert.equal(calls, 0);
});
