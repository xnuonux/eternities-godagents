import { runAttempt, diagnosticFailure } from './attempt.mjs';

// runWorkflow must be the host's verified local workflow, not raw model output.
// It owns admission, permissions, transport receipts and artifact publication.
export async function runGodagent({ directory, maximumCompletionTokens, runWorkflow, inspectCompleted }) {
  if (!Number.isSafeInteger(maximumCompletionTokens) || maximumCompletionTokens < 1
      || typeof runWorkflow !== 'function' || typeof inspectCompleted !== 'function') {
    throw new Error('invalid Godagent evaluation configuration');
  }
  return runAttempt(directory, async journal => {
    const result = await runWorkflow();
    if (!result || !['completed', 'pending', 'needs-decision', 'rejected'].includes(result.status)
        || (result.status === 'completed' ? !result.artifact : result.artifact !== null)) {
      throw diagnosticFailure('workflow-result-invalid');
    }
    if (result.status === 'completed' || result.status === 'rejected') {
      const usage = result.usage;
      if (!usage || !Number.isSafeInteger(usage.visibleOutputTokens) || usage.visibleOutputTokens < 0
          || usage.completionTokens !== usage.visibleOutputTokens + usage.reasoningTokens
          || usage.completionTokens > maximumCompletionTokens) throw diagnosticFailure('usage-invalid');
      // Already-aggregated verified mission receipt, not the last transport call
      // and not added again to independently observed per-call accounting.
      await journal.recordUsage({ inputTokens: usage.inputTokens, completionTokens: usage.completionTokens,
        reasoningTokens: usage.reasoningTokens, cachedInputTokens: usage.cachedInputTokens });
    }
    if (result.status === 'completed') await inspectCompleted(result);
    await journal.outcome(result.status);
  });
}
