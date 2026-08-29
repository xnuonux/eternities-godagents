import { sha256Value } from '../core/digest.mjs';
import { projectInferenceEvent } from './receipt-safety.mjs';
import { assertCortexResult, failedInference } from './result.mjs';

function attemptIdFor(context, ordinal) {
  return `attempt-${sha256Value({
    instanceId: context.instanceId,
    missionId: context.missionId,
    stateEpoch: context.stateEpoch,
    ordinal,
  }).slice(0, 24)}`;
}

function resultMetadata(result) {
  return Object.fromEntries([
    'attemptId',
    'ordinal',
    'adapterId',
    'profile',
    'modelId',
    'requestDigest',
    'responseDigest',
    'usage',
  ].filter((key) => Object.hasOwn(result, key)).map((key) => [key, result[key]]));
}

function projectionInput(eventType, resultOrMetadata, context, policy, reasonCode) {
  return {
    eventType,
    ...resultOrMetadata,
    stateEpoch: context.stateEpoch,
    hostPolicyId: policy.hostPolicyId,
    hostPolicyDigest: policy.hostPolicyDigest,
    ...(reasonCode ? { reasonCode } : {}),
  };
}

export async function runInference({
  cortex,
  context,
  policy,
  record,
  existingAttempts = 0,
  lastAttempt = null,
  checkpoint = () => {},
}) {
  if (typeof cortex?.prepare !== 'function') throw new TypeError('networked cortex must expose prepare');
  if (!Number.isInteger(policy?.maxAttempts) || policy.maxAttempts < 1) throw new TypeError('maxAttempts must be positive');
  if (!Array.isArray(policy.retryableReasonCodes)) throw new TypeError('retryableReasonCodes must be an array');
  if (!Number.isInteger(policy.maxCompletionTokens) || policy.maxCompletionTokens < 1
    || !Number.isInteger(policy.maxCycleCompletionTokens) || policy.maxCycleCompletionTokens < 1) {
    throw new TypeError('completion-token budgets must be positive integers');
  }
  if (!Number.isInteger(existingAttempts) || existingAttempts < 0) throw new TypeError('existingAttempts must be non-negative');

  if (existingAttempts >= policy.maxAttempts) {
    if (!lastAttempt) throw new Error('exhausted inference recovery requires last attempt metadata');
    const terminal = failedInference('retry-exhausted', resultMetadata(lastAttempt));
    const failed = projectInferenceEvent(projectionInput(
      'cortex.failed',
      resultMetadata(terminal),
      context,
      policy,
      terminal.reasonCode,
    ));
    await record('cortex.failed', { inference: failed });
    return terminal;
  }

  let lastMetadata = null;
  for (let ordinal = existingAttempts + 1; ordinal <= policy.maxAttempts; ordinal += 1) {
    const attempt = { attemptId: attemptIdFor(context, ordinal), ordinal };
    const prepared = cortex.prepare(context, attempt);
    lastMetadata = prepared.metadata;
    if (ordinal * policy.maxCompletionTokens > policy.maxCycleCompletionTokens) {
      const terminal = failedInference('budget-exhausted', prepared.metadata);
      const failed = projectInferenceEvent(projectionInput(
        'cortex.failed',
        resultMetadata(terminal),
        context,
        policy,
        terminal.reasonCode,
      ));
      await record('cortex.failed', { inference: failed });
      return terminal;
    }
    const requested = projectInferenceEvent(projectionInput(
      'cortex.requested',
      prepared.metadata,
      context,
      policy,
    ));
    await record('cortex.requested', { inference: requested });
    checkpoint('cortex-requested');

    const result = assertCortexResult(await prepared.execute());
    if (result.status === 'accepted') {
      const accepted = projectInferenceEvent(projectionInput(
        'cortex.accepted',
        resultMetadata(result),
        context,
        policy,
      ));
      await record('cortex.accepted', { inference: accepted, proposal: result.proposal });
      checkpoint('cortex-accepted');
      return result;
    }

    const retryable = policy.retryableReasonCodes.includes(result.reasonCode);
    const exhausted = retryable && ordinal === policy.maxAttempts;
    const terminal = exhausted
      ? failedInference('retry-exhausted', resultMetadata(result))
      : result;
    const failed = projectInferenceEvent(projectionInput(
      'cortex.failed',
      resultMetadata(terminal),
      context,
      policy,
      terminal.reasonCode,
    ));
    await record('cortex.failed', { inference: failed });
    if (!retryable || exhausted) return terminal;
  }

  if (!lastMetadata) throw new Error('inference attempt budget was not entered');
  return failedInference('retry-exhausted', lastMetadata);
}
