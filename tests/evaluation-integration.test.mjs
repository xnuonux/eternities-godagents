import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBaseline } from '../scripts/evaluation/baseline.mjs';
import { createBoundedDispatch } from '../scripts/evaluation/dispatch.mjs';
import { diagnosticFailure } from '../scripts/evaluation/attempt.mjs';
import { score } from './helpers/evaluation-scheduling-task.mjs';

for (const [name, answer, expected] of [
  ['optimal', { selectedIds: ['B', 'C', 'E', 'G', 'I', 'K'], totalWeight: 48 }, true],
  ['valid but suboptimal', { selectedIds: ['L'], totalWeight: 42 }, false],
]) {
  test(`combined baseline journals, bounds, validates, publishes and scores ${name} response`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'godagents-integrated-'));
    const endpoint = 'https://example.invalid/v1/chat/completions';
    let physicalCalls = 0;
    const transport = createBoundedDispatch({ endpoint, model: 'test-model', maximumCalls: 1,
      maximumReservedTokens: 12, maximumRequestBytes: 512, maximumWallMs: 1000, timeoutMs: 100 }, {
      fetchImpl: async () => {
        physicalCalls++;
        return new Response(JSON.stringify({ model: 'test-model', choices: [{ index: 0, finish_reason: 'stop',
          message: { role: 'assistant', content: JSON.stringify({ content: JSON.stringify(answer) }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18,
            completion_tokens_details: { reasoning_tokens: 3 } } }), { headers: { 'content-type': 'application/json' } });
      } });
    const result = await runBaseline({ directory, model: 'test-model', maximumCompletionTokens: 12,
      maximumResponseBytes: 4096,
      dispatch: () => transport.fetch(endpoint, { method: 'POST', body: JSON.stringify({ model: 'test-model', reasoning_split: true, max_completion_tokens: 12 }) }),
      assertResponseSafe: async text => { if (text.includes('synthetic-credential')) throw diagnosticFailure('credential-reflection'); },
      acceptAnswer: async value => writeFile(join(directory, 'answer.json'), JSON.stringify({ answer: value, score: score(value.content) }), { flag: 'wx', flush: true }),
    });
    assert.equal(result.status, 'completed');
    assert.equal(result.usageKnown, true);
    assert.equal(physicalCalls, 1);
    const published = JSON.parse(await readFile(join(directory, 'answer.json'), 'utf8'));
    assert.equal(published.score.correct, expected);
    assert.equal(published.score.optimum, 48);
    assert.equal(transport.snapshot().reservedCompletionTokens, 12);
    await assert.rejects(runBaseline({ directory, model: 'test-model', maximumCompletionTokens: 12,
      maximumResponseBytes: 4096, dispatch: async () => { physicalCalls++; },
      assertResponseSafe: async () => {}, acceptAnswer: async () => {} }));
    assert.equal(physicalCalls, 1);
  });
}
