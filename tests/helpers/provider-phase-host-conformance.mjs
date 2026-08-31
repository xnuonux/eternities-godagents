import { verifyProviderPhaseHostDescription } from '../../src/host/provider-phase-host-sdk.mjs';
import { verifyIdentityBoundNativeCompletion } from '../../src/runtime/identity-bound-native-contracts.mjs';
import { verifyMissionRevisionTransportCompletion } from '../../src/runtime/mission-revision-transport-contracts.mjs';
import { verifyGodskillsReviewTransportCompletion } from '../../src/skills/review-transport-contracts.mjs';
import {
  nativeDispatch,
  reviewDispatch,
  revisionDispatch,
} from './openai-compatible-phase-operation-fixture.mjs';

const PHASES = ['native', 'review', 'revision'];

function verifyCompletion(phase, completion, dispatch, descriptor) {
  if (phase === 'native') {
    return verifyIdentityBoundNativeCompletion(completion, { dispatch, transportDescriptor: descriptor });
  }
  if (phase === 'review') {
    return verifyGodskillsReviewTransportCompletion(completion, { dispatch, transportDescriptor: descriptor });
  }
  return verifyMissionRevisionTransportCompletion(completion, { dispatch, transportDescriptor: descriptor });
}

export async function runProviderPhaseHostConformance({
  context,
  host,
  removeCredential,
  providerCalls,
} = {}) {
  if (!context || typeof context.after !== 'function' || !host || typeof host.describe !== 'function'
      || typeof removeCredential !== 'function' || typeof providerCalls !== 'function') {
    throw new TypeError('provider phase host conformance configuration is invalid');
  }
  const description = verifyProviderPhaseHostDescription(host.describe());
  const dispatches = {
    native: await nativeDispatch(context, description.descriptors.native),
    review: await reviewDispatch(description.descriptors.review),
    revision: revisionDispatch(description.descriptors.revision),
  };
  const completions = {};
  const before = providerCalls();
  for (const phase of PHASES) {
    const result = await host[phase].execute(dispatches[phase]);
    verifyCompletion(phase, result.completion, dispatches[phase], description.descriptors[phase]);
    completions[phase] = result.completion;
  }
  const afterExecution = providerCalls();
  removeCredential();
  const completedPhases = [];
  for (const phase of PHASES) {
    const reconciled = await host[phase].reconcile(dispatches[phase]);
    const replayed = await host[phase].execute(dispatches[phase]);
    if (reconciled.status === 'completed' && replayed.status === 'completed'
        && reconciled.completion.completionDigest === completions[phase].completionDigest
        && replayed.completion.completionDigest === completions[phase].completionDigest) {
      completedPhases.push(phase);
    }
  }
  const afterReplay = providerCalls();
  return Object.freeze({
    family: description.family,
    descriptionDigest: description.descriptionDigest,
    completedPhases: Object.freeze(completedPhases),
    providerCalls: afterExecution - before,
    replayProviderCalls: afterReplay - afterExecution,
    authorityExpansions: Object.values(completions).reduce((sum, completion) => sum
      + Object.values(completion.authority).filter(Boolean).length, 0),
    completionDigests: Object.freeze(Object.fromEntries(PHASES.map((phase) => [
      phase,
      completions[phase].completionDigest,
    ]))),
  });
}
