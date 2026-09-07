import { runAttempt, readResponseJson, diagnosticFailure } from './attempt.mjs';

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
      cachedInputTokens: rawUsage?.prompt_tokens_details?.cached_tokens ?? 0 };
    if (Object.values(usage).some((value) => !Number.isSafeInteger(value) || value < 0)
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
