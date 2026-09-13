import { sha256Value } from '../core/digest.mjs';
import { nativeToolEffects } from './native-host-binding.mjs';

const fail = code => { throw new Error(`native-session-report:${code}`); };
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const knownStops = new Set(['end_turn', 'toolUse', 'error', 'aborted', 'stop', 'max_tokens']);

function verified(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('shape');
  let unsigned;
  try { const { stateDigest, ...body } = state; unsigned = body;
    if (typeof stateDigest !== 'string' || !/^[a-f0-9]{64}$/.test(stateDigest) || sha256Value(unsigned) !== stateDigest) fail('state-integrity');
  } catch (error) { if (error.message.startsWith('native-session-report:')) throw error; fail('state-integrity'); }
  if (state.schemaVersion !== 1 || state.protocolId !== 'eternities-native-host-state-v1') fail('protocol');
  if (!state.association || typeof state.association !== 'object' || state.associationDigest !== sha256Value(state.association)
    || typeof state.association.sessionId !== 'string' || typeof state.association.instanceId !== 'string') fail('shape');
  if (!['idle', 'running', 'uncertain', 'revoked'].includes(state.phase) || !integer(state.turns)
    || !state.inferences || !integer(state.inferences.native) || !integer(state.inferences.compaction) || !Array.isArray(state.actions)) fail('shape');
  return state;
}

export function summarizeNativeState(state) {
  const value = verified(state), byTool = {}, actions = { total: value.actions.length, completed: 0, pending: 0, failed: 0, byTool };
  if (actions.total > 100000) fail('shape');
  for (const action of value.actions) {
    if (!action || !Object.hasOwn(nativeToolEffects,action.toolName) || !['pending', 'completed'].includes(action.status)
      || (action.status==='completed'?typeof action.isError!=='boolean':action.isError!==null)) fail('shape');
    byTool[action.toolName] = (byTool[action.toolName] ?? 0) + 1;
    if (action.status === 'pending') actions.pending++;
    else { actions.completed++; if (action.isError === true) actions.failed++; }
  }
  return { phase: value.phase, sessionId: value.association.sessionId, instanceId: value.association.instanceId,
    turns: value.turns, inferences: { native: value.inferences.native, compaction: value.inferences.compaction }, actions,
    stateDigest: value.stateDigest, associationDigest: value.associationDigest };
}

export function createNativeUsageCollector() {
  const seen = new Set();
  const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'];
  const sums = Object.fromEntries(fields.map(field => [field, 0]));
  const stopReasons = {};
  let messageCount=0,missingUsageMessages=0;
  return Object.freeze({
    record(event) {
      const message = event?.type === 'message_end' ? event.message : null;
      if (!message || message.role !== 'assistant') return;
      if (message.id !== undefined && (typeof message.id !== 'string' || seen.has(message.id))) return;
      if (message.id !== undefined) seen.add(message.id);
      messageCount++;
      const usage = message.usage && typeof message.usage === 'object' ? message.usage : {};
      const values = { inputTokens: usage.inputTokens ?? usage.input, outputTokens: usage.outputTokens ?? usage.output,
        cacheReadTokens: usage.cacheReadTokens ?? usage.cacheRead, cacheWriteTokens: usage.cacheWriteTokens ?? usage.cacheWrite,
        totalTokens: usage.totalTokens ?? usage.total };
      for (const field of fields) {
        if(sums[field]!==null&&finite(values[field])&&finite(sums[field]+values[field]))sums[field]+=values[field];
        else sums[field]=null;
      }
      if(!['inputTokens','outputTokens','totalTokens'].every(field=>finite(values[field])))missingUsageMessages++;
      const reason = typeof message.stopReason === 'string' && knownStops.has(message.stopReason) ? message.stopReason : 'unknown';
      stopReasons[reason] = (stopReasons[reason] ?? 0) + 1;
    },
    snapshot:()=>({messageCount,...sums,missingUsageMessages,stopReasons:{...stopReasons}}),
  });
}
