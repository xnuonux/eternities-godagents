import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { verifyIdentityHostRequest } from '../host/admitted-sealed-identity-launch.mjs';
import {
  buildCortexBindingRequestFromVesselRequest, projectIdentityBoundMissionAuthority,
} from '../runtime/identity-bound-mission-vessel-contracts.mjs';

const same = (a, b) => canonicalJson(a) === canonicalJson(b);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Consumes an already authenticated/loaded policy and admitted candidate.
// The projection is data for a verifier, not an authorization or dispatch API.
export function buildEffectOnlyRoutingProjection({ request: input, policy, candidate: inputCandidate }) {
  const request = verifyIdentityHostRequest(policy, input);
  if (request.schemaVersion !== 2 || request.routeMode !== 'effect-only') {
    throw new Error('effect-only projection requires an explicit v2 request');
  }
  const candidate = verifyCortexBindingCandidate(structuredClone(inputCandidate));
  const { effectAssessment, routeMode, ...subjectFields } = request;
  const legacy = { ...subjectFields, schemaVersion: 1 };
  const expected = buildCortexBindingRequestFromVesselRequest(legacy);
  const binding = candidate.fullEnvelope.binding;
  if (!same(candidate.fullEnvelope.mission, expected.mission)
      || binding.taskId !== expected.task.taskId
      || binding.hostAdapterId !== expected.task.hostAdapterId
      || binding.revocationEpoch !== expected.task.revocationEpoch
      || candidate.compaction.maxProjectionBytes !== expected.maxProjectionBytes) {
    throw new Error('effect-only candidate differs from its mission request');
  }
  const authority = projectIdentityBoundMissionAuthority(legacy, candidate);
  const context = {
    ...authority,
    forbiddenCapabilities: [...request.hostCeiling.forbiddenCapabilities],
    maxCompositionSize: request.hostCeiling.maxCompositionSize,
  };
  const projected = {
    schemaVersion: 2, requestId: request.mission.missionId,
    text: request.mission.objective, context, routeMode,
    effectAssessment: structuredClone(effectAssessment),
  };
  return freeze({
    request: projected,
    expectedSource: {
      subjectDigest: effectAssessment.subjectDigest,
      producerDescriptorDigest: policy.runtime.effectProducerDescriptorDigest,
      requestDigest: sha256Value(projected),
    },
  });
}
