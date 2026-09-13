import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Value } from '../src/core/digest.mjs';
import { summarizeNativeState, createNativeUsageCollector } from '../src/host/native-session-report.mjs';

const state = (changes = {}) => {
  const association = { sessionId: 's1', instanceId: 'i1', cwd: 'C:/work' };
  const body = { schemaVersion: 1, protocolId: 'eternities-native-host-state-v1', association,
    associationDigest: sha256Value(association), phase: 'idle', turns: 2,
    inferences: { native: 2, compaction: 1 }, actions: [
      { callId: 'a', toolName: 'read', status: 'completed', isError: false },
      { callId: 'b', toolName: 'write', status: 'completed', isError: true },
      { callId: 'c', toolName: 'read', status: 'pending', isError: null },
    ], ...changes };
  return { ...body, stateDigest: sha256Value(body) };
};

test('summarizes verified native state without exposing action data', () => {
  const result = summarizeNativeState(state());
  assert.deepEqual(result, { phase: 'idle', sessionId: 's1', instanceId: 'i1', turns: 2,
    inferences: { native: 2, compaction: 1 },
    actions: { total: 3, completed: 2, pending: 1, failed: 1, byTool: { read: 2, write: 1 } },
    stateDigest: state().stateDigest, associationDigest: state().associationDigest });
});

test('rejects tampered, malformed, or foreign native state', () => {
  assert.throws(() => summarizeNativeState({ ...state(), stateDigest: 'bad' }), /native-session-report:state-integrity/);
  assert.throws(() => summarizeNativeState(state({ protocolId: 'other' })), /native-session-report:protocol/);
  assert.throws(() => summarizeNativeState(state({ turns: -1 })), /native-session-report:shape/);
});

test('collects distinct assistant message ids and nulls affected partial usage', () => {
  const collector = createNativeUsageCollector();
  collector.record({ type: 'message_end', message: { role: 'assistant', id: 'm1', stopReason: 'end_turn', usage: { input: 3, output: 4, total: 7 } } });
  collector.record({ type: 'message_end', message: { role: 'assistant', id: 'm1', stopReason: 'end_turn', usage: { input: 3, output: 4, total: 7 } } });
  collector.record({ type: 'message_end', message: { role: 'assistant', id: 'm2', stopReason: 'mystery', usage: { input: 1, output: 2 } } });
  collector.record({ type: 'message_end', message: { role: 'user', id: 'u1', usage: { input: 99 } } });
  assert.deepEqual(collector.snapshot(), { messageCount: 2, inputTokens: 4, outputTokens: 6,
    cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null, missingUsageMessages: 1,
    stopReasons: { end_turn: 1, unknown: 1 } });
});

test('usage is captured at event time without retaining mutable private messages',()=>{
  const collector=createNativeUsageCollector();
  const event={type:'message_end',message:{role:'assistant',content:[{type:'text',text:'private'}],stopReason:'stop',
    usage:{input:4,output:2,cacheRead:3,cacheWrite:0,totalTokens:9}}};
  collector.record(event);event.message.usage.input=1000;event.message.stopReason='error';
  assert.equal(collector.snapshot().inputTokens,4);assert.deepEqual(collector.snapshot().stopReasons,{stop:1});
});

test('report does not disclose arbitrary tool names or malformed native action states',()=>{
  assert.throws(()=>summarizeNativeState(state({actions:[{toolName:'private-data',status:'completed',isError:false}]})),/shape/);
  assert.throws(()=>summarizeNativeState(state({actions:[{toolName:'read',status:'completed',isError:null}]})),/shape/);
});
