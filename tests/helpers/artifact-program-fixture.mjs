import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';

export const artifactProgramDefinition = () => ({ schemaVersion: 1,
  context: 'controlled dependent-task exercise', maxContextBytes: 4096,
  budget: { maxCompletionTokens: 800, maxResultBytes: 1026 },
  steps: [
    { stepId: 'first', objective: 'produce the first requested token',
      successEvidence: ['one token is present'], stopConditions: ['accepted artifact recorded'],
      maxCompletionTokens: 400, maxArtifactBytes: 512, predecessors: [] },
    { stepId: 'second', objective: 'extend the verified prior token',
      successEvidence: ['prior token is extended'], stopConditions: ['accepted artifact recorded'],
      maxCompletionTokens: 400, maxArtifactBytes: 512,
      predecessors: [{ stepId: 'first', projection: 'content' }] },
  ] });

export function controlledArtifactProgramProvider(calls, { uncertainAt = 0, beforeResponse = async () => {} } = {}) {
  return input => createProviderPhaseHost({ ...input, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const index = calls.length;
    await beforeResponse(index, body);
    if (index === uncertainAt) throw new Error('controlled uncertain program request');
    const content = canonicalJson({ content: index === 1 ? 'ALPHA_7' : 'ALPHA_7_BETA_9' });
    const value = input.family === 'anthropic-messages-v1'
      ? { id: `msg_program_${index}`, type: 'message', role: 'assistant', model: body.model,
        content: [{ type: 'text', text: content }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          output_tokens: 20, output_tokens_details: { thinking_tokens: 0 } } }
      : { id: `controlled-program-${index}`, object: 'chat.completion', model: body.model,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant',
        content } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
        completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } } };
    return new Response(canonicalJson(value),
    { status: 200, headers: { 'content-type': 'application/json' } });
  } });
}
