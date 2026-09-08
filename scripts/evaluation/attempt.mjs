import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// This module accepts no request, credential, provider text, or error message.
// Only locally created failure tokens carry a diagnostic category.
const failures = new WeakMap();
const categories = new Set(['response-json', 'response-envelope', 'answer-envelope',
  'usage-invalid', 'response-ceiling', 'credential-reflection', 'dispatch-ceiling',
  'transport-failure', 'response-read', 'completion-not-recorded', 'http-status-invalid', 'workflow-result-invalid', 'response-safety-check-failed']);

export function diagnosticFailure(category) {
  if (!categories.has(category)) throw new Error('unsupported diagnostic category');
  const error = new Error('evaluation stopped');
  failures.set(error, category);
  return error;
}

// dispatch owns the pre-existing endpoint, timeout and spending limits.
// This reader adds no provider access, retries, or relaxed response validation.
export async function readResponseJson(journal, dispatch, maximumBytes, assertResponseSafe = async () => {}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('invalid response ceiling');
  await journal.dispatchStarted();
  let response;
  try { response = await dispatch(); }
  catch (error) {
    if (failures.has(error)) throw error;
    throw diagnosticFailure('transport-failure');
  }
  await journal.headersReceived(response?.status);
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > maximumBytes) throw diagnosticFailure('response-ceiling');
      chunks.push(chunk);
    }
  } catch (error) {
    if (failures.has(error)) throw error;
    throw diagnosticFailure('response-read');
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try { await assertResponseSafe(text); }
  catch (error) {
    if (failures.has(error)) throw error;
    throw diagnosticFailure('response-safety-check-failed');
  }
  const contentType = response.headers?.get?.('content-type');
  if (typeof contentType === 'string' && contentType.length > 0
      && !contentType.toLowerCase().startsWith('application/json')) {
    throw diagnosticFailure('response-envelope');
  }
  let envelope;
  try { envelope = JSON.parse(text); }
  catch { throw diagnosticFailure('response-json'); }
  return { httpStatus: response.status, envelope };
}

export async function runAttempt(directory, operation) {
  let sequence = 0;
  let outcome;
  let usage;
  const save = async (suffix, event) => {
    const name = `${String(sequence++).padStart(3, '0')}-${suffix}.json`;
    await writeFile(join(directory, name), JSON.stringify(event) + '\n', { flag: 'wx', flush: true });
  };
  // Exclusive first event prevents restarting the same trial, including after a crash.
  // A torn event blocks reuse too; it is not proof of provider completion.
  await save('attempt', { event: 'attempt-started', retries: 0 });
  const journal = Object.freeze({
    async dispatchStarted() {
      await save('dispatch', { event: 'dispatch-started' });
    },
    async headersReceived(httpStatus) {
      if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) {
        throw diagnosticFailure('http-status-invalid');
      }
      await save('headers', { event: 'headers-received', httpStatus });
    },
    async recordUsage(value) {
      const keys = ['inputTokens', 'completionTokens', 'reasoningTokens', 'cachedInputTokens'];
      if (!value || Object.keys(value).length !== keys.length
          || keys.some((key) => !(key === 'cachedInputTokens' && value[key] === null)
            && (!Number.isSafeInteger(value[key]) || value[key] < 0))
          || value.reasoningTokens > value.completionTokens || value.cachedInputTokens > value.inputTokens) {
        throw diagnosticFailure('usage-invalid');
      }
      const measured = Object.fromEntries(keys.map((key) => [key, value[key]]));
      await save('usage', { event: 'usage-recorded', usage: measured });
      usage = measured;
    },
    async outcome(status) {
      if (!['completed', 'pending', 'needs-decision', 'rejected'].includes(status)) {
        throw diagnosticFailure('workflow-result-invalid');
      }
      outcome = status;
    },
    async completed() { outcome = 'completed'; },
  });
  let result;
  try {
    await operation(journal);
    if (!outcome) throw diagnosticFailure('completion-not-recorded');
    result = { status: outcome, usageKnown: usage !== undefined, retryAllowed: false };
  } catch (error) {
    result = { status: 'stopped', category: failures.get(error) ?? 'unclassified',
      usageKnown: usage !== undefined, retryAllowed: false };
  }
  if (usage) result.usage = usage;
  // A persistence error is propagated; it cannot be mislabeled a recorded result.
  await save('result', result);
  return result;
}
