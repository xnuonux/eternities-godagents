import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnosticFailure } from '../scripts/evaluation/attempt.mjs';
const api = await import('../scripts/evaluation/baseline.mjs').catch((e) => {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  return {};
});
const envelope = () => ({ model: 'test-model', choices: [{ index: 0, finish_reason: 'stop',
  message: { role: 'assistant', content: '{"content":"{\\"totalWeight\\":48}"}' } }],
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18,
    completion_tokens_details: { reasoning_tokens: 3 }, prompt_tokens_details: { cached_tokens: 2 } } });
async function execute(body, httpStatus = 200, assertResponseSafe = async () => {}, contentType = 'application/json') {
  assert.equal(typeof api.runBaseline, 'function');
  const directory = await mkdtemp(join(tmpdir(), 'godagents-baseline-'));
  const outputs = []; let dispatches = 0;
  const result = await api.runBaseline({ directory, model: 'test-model', maximumCompletionTokens: 12,
    assertResponseSafe,
    maximumResponseBytes: 4096, dispatch: async () => { dispatches++; return new Response(JSON.stringify(body), { status: httpStatus, headers: { 'content-type': contentType } }); },
    acceptAnswer: async (answer) => { outputs.push(answer); } });
  return { result, outputs, dispatches, directory };
}
test('baseline validates the actual envelope and records measured usage before acceptance', async () => {
  const { result, outputs, dispatches, directory } = await execute(envelope());
  assert.equal(result.status, 'completed');
  assert.equal(result.usageKnown, true);
  assert.deepEqual(result.usage, { inputTokens: 10, completionTokens: 8, reasoningTokens: 3, cachedInputTokens: 2 });
  assert.deepEqual(outputs, [{ content: '{"totalWeight":48}' }]);
  assert.equal(dispatches, 1);
  const events = await Promise.all((await readdir(directory)).map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8'))));
  assert.ok(events.some((e) => e.event === 'usage-recorded' && e.usage.reasoningTokens === 3));
});

test('missing cache telemetry remains unknown while explicit zero remains measured', async () => {
  for (const [reported, expected] of [[undefined, null], [null, null], [0, 0], [2, 2]]) {
    const body = envelope();
    if (reported === undefined) delete body.usage.prompt_tokens_details;
    else body.usage.prompt_tokens_details.cached_tokens = reported;
    const { result, directory } = await execute(body);
    assert.equal(result.status, 'completed');
    assert.equal(result.usage.cachedInputTokens, expected);
    const events = await Promise.all((await readdir(directory)).map(async name => JSON.parse(await readFile(join(directory, name), 'utf8'))));
    assert.equal(events.find(event => event.event === 'usage-recorded').usage.cachedInputTokens, expected);
  }
  for (const invalid of [-1, 11, '0', 0.5]) {
    const body = envelope(); body.usage.prompt_tokens_details.cached_tokens = invalid;
    const { result, outputs } = await execute(body);
    assert.equal(result.category, 'usage-invalid');
    assert.equal(outputs.length, 0);
  }
});

test('response safety gate runs before parsing or publishing reflected material', async () => {
  const body = envelope(); body.choices[0].message.content = 'synthetic-reflected-credential';
  let checks = 0;
  const { result, outputs, directory } = await execute(body, 200, async (text) => {
    checks++;
    if (text.includes('synthetic-reflected-credential')) throw diagnosticFailure('credential-reflection');
  });
  assert.equal(checks, 1);
  assert.equal(result.category, 'credential-reflection');
  assert.equal(outputs.length, 0);
  const evidence = (await Promise.all((await readdir(directory)).map((name) => readFile(join(directory, name), 'utf8')))).join('');
  assert.ok(!evidence.includes('synthetic-reflected-credential'));
});

test('baseline without an explicit response safety policy cannot dispatch', async () => {
  let calls = 0;
  await assert.rejects(api.runBaseline({ directory: await mkdtemp(join(tmpdir(), 'godagents-safety-')),
    model: 'test-model', maximumCompletionTokens: 12, maximumResponseBytes: 4096,
    dispatch: async () => { calls++; return new Response(JSON.stringify(envelope())); }, acceptAnswer: async () => {} }));
  assert.equal(calls, 0);
});

test('non-JSON media type cannot pass baseline validation', async () => {
  const { result, outputs } = await execute(envelope(), 200, async () => {}, 'text/plain');
  assert.equal(result.category, 'response-envelope');
  assert.equal(outputs.length, 0);
});

test('unknown safety-check failure is not mislabeled as proven credential reflection', async () => {
  const { result, outputs } = await execute(envelope(), 200, async () => { throw new Error('synthetic scanner failure'); });
  assert.equal(result.category, 'response-safety-check-failed');
  assert.equal(outputs.length, 0);
});
test('baseline rejects incomplete accounting and never publishes an answer', async () => {
  for (const change of [e => delete e.usage, e => delete e.usage.completion_tokens_details,
    e => e.usage.total_tokens++, e => e.usage.completion_tokens = 13]) {
    const body = envelope(); change(body);
    const { result, outputs, dispatches } = await execute(body);
    assert.equal(result.category, 'usage-invalid');
    assert.equal(result.usageKnown, false);
    assert.equal(outputs.length, 0); assert.equal(dispatches, 1);
  }
});
test('baseline distinguishes invalid answer from wrong provider envelope', async () => {
  const malformed = envelope(); malformed.choices[0].message.content = 'private broken JSON';
  const badAnswer = await execute(malformed);
  assert.equal(badAnswer.result.category, 'answer-envelope');
  assert.equal(badAnswer.result.usageKnown, true);
  for (const body of [null, {}, { ...envelope(), model: 'wrong-model' }]) {
    const { result, outputs } = await execute(body);
    assert.equal(result.category, 'response-envelope'); assert.equal(outputs.length, 0);
  }
  assert.equal((await execute(envelope(), 429)).result.category, 'response-envelope');
});

const readShape = async directory => JSON.parse(await readFile(join(directory, 'response-shape.json'), 'utf8'));

test('a missing completion retains structural clues without copying provider errors', async () => {
  const body = { error: { code: 'private-code', message: 'private-error' }, usage: null,
    'private-field': 'private-value' };
  const { result, outputs, dispatches, directory } = await execute(body);
  assert.equal(result.category, 'response-envelope');
  assert.equal(result.usageKnown, false);
  assert.equal(dispatches, 1);
  assert.deepEqual(outputs, []);
  const shape = await readShape(directory);
  assert.equal(shape.nonAuthoritative, true);
  assert.equal(shape.rootType, 'object');
  assert.equal(shape.errorType, 'object');
  assert.equal(shape.choicesType, 'undefined');
  assert.equal(shape.choiceCount, null);
  assert.equal(shape.modelMatches, false);
  assert.equal(shape.usageType, 'null');
  assert.ok(!JSON.stringify(shape).includes('private-'));
});

test('answer diagnostics distinguish direct JSON, fences, wrong outer type and broken JSON without saving text', async () => {
  for (const [content, parseable, rootType, outerContentType, fenced] of [
    ['{"totalWeight":48}', true, 'object', 'undefined', false],
    ['```json\n{"content":"private-answer"}\n```', false, null, null, true],
    ['{"content":17}', true, 'object', 'number', false],
    ['private-broken-json', false, null, null, false],
  ]) {
    const body = envelope(); body.choices[0].message.content = content;
    body.choices[0].message.reasoning_content = 'private-thoughts';
    const { result, outputs, directory } = await execute(body);
    assert.equal(result.category, 'answer-envelope');
    assert.equal(result.usageKnown, true);
    assert.equal(outputs.length, 0);
    const shape = await readShape(directory);
    assert.equal(shape.answer.jsonParseable, parseable);
    assert.equal(shape.answer.jsonRootType, rootType);
    assert.equal(shape.answer.outerContentType, outerContentType);
    assert.equal(shape.answer.startsWithFence, fenced);
    assert.ok(!JSON.stringify(shape).includes('private-'));
  }
});

test('shape classifications never copy arbitrary model, role, finish reason, keys or content values', async () => {
  const body = envelope();
  body.model = 'private-model';
  body.choices[0].finish_reason = 'private-finish';
  body.choices[0].message.role = 'private-role';
  body.choices[0].message.content = '{"private-key":"private-answer"}';
  body.choices[0].message.tool_calls = [{ function: { name: 'private-tool' } }];
  const { result, directory } = await execute(body);
  assert.equal(result.category, 'response-envelope');
  const shape = await readShape(directory);
  assert.equal(shape.modelMatches, false);
  assert.equal(shape.finishReason, 'other');
  assert.equal(shape.messageRole, 'other');
  assert.equal(shape.toolCallsType, 'array');
  assert.equal(shape.answer.jsonRootType, 'object');
  assert.ok(!JSON.stringify(shape).includes('private-'));
});

test('shape records classify malformed envelope and content types without accepting them', async () => {
  for (const [body, type] of [[null, 'null'], [[], 'array'], [17, 'number'], ['bad', 'string']]) {
    const { result, directory } = await execute(body);
    assert.equal(result.category, 'response-envelope');
    assert.equal((await readShape(directory)).rootType, type);
  }
  for (const [content, type] of [[null, 'null'], [false, 'boolean'], [[], 'array'], [{}, 'object']]) {
    const body = envelope(); body.choices[0].message.content = content;
    const { result, directory } = await execute(body);
    assert.equal(result.category, 'answer-envelope');
    const shape = await readShape(directory);
    assert.equal(shape.contentType, type);
    assert.equal(shape.answer.jsonParseable, false);
    assert.equal(shape.contentBytes, null);
  }
});

test('successful answers retain existing acceptance and usage with a bounded shape record', async () => {
  const { result, outputs, directory } = await execute(envelope());
  assert.equal(result.status, 'completed');
  assert.equal(outputs.length, 1);
  const shape = await readShape(directory);
  assert.equal(shape.modelMatches, true);
  assert.equal(shape.choiceCount, 1);
  assert.equal(shape.firstIndexIsZero, true);
  assert.equal(shape.finishReason, 'stop');
  assert.equal(shape.messageRole, 'assistant');
  assert.equal(shape.answer.outerContentType, 'string');
  assert.equal(shape.answer.rootFieldCount, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(shape)) < 2048);
});

test('a failed safety gate cannot publish even the shape record', async () => {
  const { result, directory } = await execute(envelope(), 200, async () => {
    throw diagnosticFailure('credential-reflection');
  });
  assert.equal(result.category, 'credential-reflection');
  assert.ok(!(await readdir(directory)).includes('response-shape.json'));
});

test('a shape persistence collision stops acceptance and preserves existing evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'godagents-shape-collision-'));
  await writeFile(join(directory, 'response-shape.json'), 'existing evidence');
  let accepted = 0;
  const result = await api.runBaseline({ directory, model: 'test-model', maximumCompletionTokens: 12,
    maximumResponseBytes: 4096, assertResponseSafe: async () => {},
    dispatch: async () => new Response(JSON.stringify(envelope()), { headers: { 'content-type': 'application/json' } }),
    acceptAnswer: async () => { accepted++; } });
  assert.equal(result.status, 'stopped');
  assert.equal(result.retryAllowed, false);
  assert.equal(accepted, 0);
  assert.equal(await readFile(join(directory, 'response-shape.json'), 'utf8'), 'existing evidence');
});
