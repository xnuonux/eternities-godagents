import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeUsageCollector } from '../src/host/native-session-report.mjs';

const keys = ['schemaVersion', 'messageCount', 'knownMessages', 'unknownMessages', 'reasoningTokens', 'nonReasoningOutputTokens'];
const end = (message) => ({ type: 'message_end', message: { role: 'assistant', ...message } });
const empty = () => ({
  schemaVersion: 1, messageCount: 0, knownMessages: 0, unknownMessages: 0,
  reasoningTokens: 0, nonReasoningOutputTokens: 0,
});

function assertBreakdown(collector, expected) {
  const value = collector.breakdown();
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.keys(value), keys);
  assert.deepEqual(value, expected);
}

test('empty collector breakdown is zeros with schemaVersion 1', () => {
  assertBreakdown(createNativeUsageCollector(), empty());
});

test('snapshot keys and unknown handling stay identical when breakdown is present', () => {
  const collector = createNativeUsageCollector();
  collector.record(end({ id: 'm1', stopReason: 'end_turn', usage: { input: 3, output: 4, total: 7 } }));
  collector.record(end({ id: 'm1', stopReason: 'end_turn', usage: { input: 3, output: 4, total: 7 } }));
  collector.record(end({ id: 'm2', stopReason: 'mystery', usage: { input: 1, output: 2 } }));
  collector.record({ type: 'message_end', message: { role: 'user', id: 'u1', usage: { input: 99 } } });
  assert.deepEqual(collector.snapshot(), { messageCount: 2, inputTokens: 4, outputTokens: 6,
    cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null, missingUsageMessages: 1,
    stopReasons: { end_turn: 1, unknown: 1 } });
  assertBreakdown(collector, { schemaVersion: 1, messageCount: 2, knownMessages: 0, unknownMessages: 2,
    reasoningTokens: null, nonReasoningOutputTokens: null });
});

test('anonymous assistant events are counted separately and duplicate ids are skipped', () => {
  const collector = createNativeUsageCollector();
  const known = { stopReason: 'stop', usage: { input: 0, output: 8, reasoning: 3, totalTokens: 8 } };
  collector.record(end(known));
  collector.record(end(known));
  collector.record(end({ id: 'same', ...known }));
  collector.record(end({ id: 'same', usage: { output: 99, reasoning: 1 } }));
  collector.record(end({ id: 12, ...known }));
  assertBreakdown(collector, { schemaVersion: 1, messageCount: 3, knownMessages: 3, unknownMessages: 0,
    reasoningTokens: 9, nonReasoningOutputTokens: 15 });
});

test('positive reasoning is a subset of output and never inferred from text or cost', () => {
  const collector = createNativeUsageCollector();
  collector.record(end({ stopReason: 'toolUse', usage: { outputTokens: 10, reasoningTokens: 4 } }));
  collector.record(end({
    stopReason: 'stop',
    content: [{ type: 'text', text: 'a'.repeat(500) }],
    usage: { output: 6, reasoning: 6, cost: { total: 99 } },
  }));
  assertBreakdown(collector, { schemaVersion: 1, messageCount: 2, knownMessages: 2, unknownMessages: 0,
    reasoningTokens: 10, nonReasoningOutputTokens: 6 });
  assert.equal(collector.snapshot().outputTokens, 16);
  assert.equal(collector.snapshot().totalTokens, null);
});

test('zero or absent reasoning with positive output is unknown', () => {
  for (const usage of [
    { output: 4 },
    { output: 4, reasoning: 0 },
    { outputTokens: 4, reasoningTokens: 0 },
    { output: 4, reasoning: null },
  ]) {
    const collector = createNativeUsageCollector();
    collector.record(end({ stopReason: 'stop', usage }));
    assertBreakdown(collector, { schemaVersion: 1, messageCount: 1, knownMessages: 0, unknownMessages: 1,
      reasoningTokens: null, nonReasoningOutputTokens: null });
  }
});

test('successful zero-output messages with absent null or zero reasoning are known empty splits', () => {
  for (const usage of [{ output: 0 }, { output: 0, reasoning: 0 }, { outputTokens: 0, reasoningTokens: null }]) {
    const collector = createNativeUsageCollector();
    collector.record(end({ stopReason: 'stop', usage }));
    assertBreakdown(collector, { schemaVersion: 1, messageCount: 1, knownMessages: 1, unknownMessages: 0,
      reasoningTokens: 0, nonReasoningOutputTokens: 0 });
  }
});

test('malformed reasoning stays unknown even when output is zero', () => {
  for (const reasoning of [-1, 1.5, NaN, Infinity, '0', true, {}, 1]) {
    const collector = createNativeUsageCollector();
    collector.record(end({ stopReason: 'stop', usage: { output: 0, reasoning } }));
    assertBreakdown(collector, { schemaVersion: 1, messageCount: 1, knownMessages: 0, unknownMessages: 1,
      reasoningTokens: null, nonReasoningOutputTokens: null });
  }
});

test('error and aborted zero placeholders are unknown while positive reported reasoning is kept', () => {
  for (const stopReason of ['error', 'aborted']) {
    const placeholders = createNativeUsageCollector();
    placeholders.record(end({ stopReason, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, reasoning: 0 } }));
    assertBreakdown(placeholders, { schemaVersion: 1, messageCount: 1, knownMessages: 0, unknownMessages: 1,
      reasoningTokens: null, nonReasoningOutputTokens: null });
    assert.equal(placeholders.snapshot().outputTokens, null);

    const observed = createNativeUsageCollector();
    observed.record(end({ stopReason, usage: { input: 4, output: 9, cacheRead: 0, cacheWrite: 0, totalTokens: 13, reasoning: 5 } }));
    assertBreakdown(observed, { schemaVersion: 1, messageCount: 1, knownMessages: 1, unknownMessages: 0,
      reasoningTokens: 5, nonReasoningOutputTokens: 4 });
    assert.equal(observed.snapshot().outputTokens, 9);
  }
});

test('any unknown split nulls both totals permanently while counts still advance', () => {
  const collector = createNativeUsageCollector();
  collector.record(end({ stopReason: 'stop', usage: { output: 8, reasoning: 3 } }));
  collector.record(end({ stopReason: 'stop', usage: { output: 2 } }));
  collector.record(end({ stopReason: 'stop', usage: { output: 5, reasoning: 1 } }));
  assertBreakdown(collector, { schemaVersion: 1, messageCount: 3, knownMessages: 2, unknownMessages: 1,
    reasoningTokens: null, nonReasoningOutputTokens: null });
});

test('unsafe integer aggregate overflow nulls totals without changing known counts', () => {
  const collector = createNativeUsageCollector();
  collector.record(end({ stopReason: 'stop', usage: { output: Number.MAX_SAFE_INTEGER, reasoning: Number.MAX_SAFE_INTEGER } }));
  collector.record(end({ stopReason: 'stop', usage: { output: 1, reasoning: 1 } }));
  assertBreakdown(collector, { schemaVersion: 1, messageCount: 2, knownMessages: 2, unknownMessages: 0,
    reasoningTokens: null, nonReasoningOutputTokens: null });
});

test('record-time copies ignore later input mutation and returned object mutation', () => {
  const collector = createNativeUsageCollector();
  const usage = { input: 1, output: 8, reasoning: 3, totalTokens: 9 };
  const event = end({ stopReason: 'stop', content: [{ type: 'text', text: 'private' }], usage });
  collector.record(event);
  usage.output = 1000;
  usage.reasoning = 0;
  event.message.stopReason = 'error';
  const snap = collector.snapshot();
  const br = collector.breakdown();
  snap.outputTokens = 0;
  br.knownMessages = 99;
  br.reasoningTokens = 0;
  assert.equal(collector.snapshot().outputTokens, 8);
  assertBreakdown(collector, { schemaVersion: 1, messageCount: 1, knownMessages: 1, unknownMessages: 0,
    reasoningTokens: 3, nonReasoningOutputTokens: 5 });
  assert.equal(JSON.stringify(collector.breakdown()).includes('private'), false);
});

test('outputTokens and reasoningTokens aliases win over short names', () => {
  const collector = createNativeUsageCollector();
  collector.record(end({ stopReason: 'stop', usage: { output: 99, outputTokens: 10, reasoning: 99, reasoningTokens: 2 } }));
  assertBreakdown(collector, { schemaVersion: 1, messageCount: 1, knownMessages: 1, unknownMessages: 0,
    reasoningTokens: 2, nonReasoningOutputTokens: 8 });
});

for (const stopReason of ['error', 'aborted']) {
  test(`${stopReason} input usage cannot certify an empty output split`, () => {
    const collector = createNativeUsageCollector();
    collector.record(end({ stopReason, usage: {
      input: 4, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 4,
    } }));
    assertBreakdown(collector, { schemaVersion: 1, messageCount: 1,
      knownMessages: 0, unknownMessages: 1, reasoningTokens: null,
      nonReasoningOutputTokens: null });
    assert.equal(collector.snapshot().inputTokens, 4);
    assert.equal(collector.snapshot().outputTokens, 0);
  });
}
