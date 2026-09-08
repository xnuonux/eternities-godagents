import { runAttempt, readResponseJson, diagnosticFailure } from './attempt.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { responseShape } from './response-shape.mjs';

// Caller supplies a ceiling-enforcing dispatch and an answer publisher/oracle.
// There is no credential lookup, network implementation or retry in this module.
export async function runBaseline({ directory, model, maximumCompletionTokens,
  maximumResponseBytes, dispatch, acceptAnswer, assertResponseSafe }) {
  if (typeof model !== 'string' || !model || !Number.isSafeInteger(maximumCompletionTokens)
      || maximumCompletionTokens < 1 || typeof acceptAnswer !== 'function'
      || typeof assertResponseSafe !== 'function') {
    throw new Error('invalid baseline configuration');
  }
  return runAttempt(directory, async (journal) => {
    const { httpStatus, envelope } = await readResponseJson(journal, dispatch, maximumResponseBytes, assertResponseSafe);
    // Separate from the numbered attempt journal; existing event ordering is unchanged.
    // Exclusive persistence stops acceptance if evidence would be overwritten or lost.
    await writeFile(join(directory, 'response-shape.json'), JSON.stringify(responseShape(envelope, model)) + '\n',
      { flag: 'wx', flush: true });
    const choice = envelope?.choices?.[0];
    if (httpStatus < 200 || httpStatus >= 300 || envelope?.model !== model
        || !Array.isArray(envelope?.choices) || envelope.choices.length !== 1
        || choice?.index !== 0 || choice.finish_reason !== 'stop'
        || choice.message?.role !== 'assistant' || choice.message.tool_calls != null) {
      throw diagnosticFailure('response-envelope');
    }
    const rawUsage = envelope.usage;
    const usage = { inputTokens: rawUsage?.prompt_tokens, completionTokens: rawUsage?.completion_tokens,
      reasoningTokens: rawUsage?.completion_tokens_details?.reasoning_tokens,
      cachedInputTokens: rawUsage?.prompt_tokens_details?.cached_tokens ?? null };
    if (Object.entries(usage).some(([key, value]) => !(key === 'cachedInputTokens' && value === null)
        && (!Number.isSafeInteger(value) || value < 0))
        || usage.completionTokens > maximumCompletionTokens
        || rawUsage?.total_tokens !== usage.inputTokens + usage.completionTokens) {
      throw diagnosticFailure('usage-invalid');
    }
    await journal.recordUsage(usage);
    let answer;
    try { answer = JSON.parse(choice.message.content); }
    catch { throw diagnosticFailure('answer-envelope'); }
    if (!answer || Array.isArray(answer) || Object.keys(answer).join(',') !== 'content'
        || typeof answer.content !== 'string') throw diagnosticFailure('answer-envelope');
    await acceptAnswer(answer);
    await journal.completed();
  });
}
