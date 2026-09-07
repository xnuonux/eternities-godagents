import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { buildEffectOnlyRoutingProjection } from '../skills/effect-only-routing-projection.mjs';
import { assertEffectOnlyJournalResult } from '../skills/effect-only-routing-journal.mjs';
import { assertVerifiedEffectOnlyExecutable, assertVerifiedEffectOnlyVerifier } from '../skills/effect-only-executable-verifier.mjs';
import { buildMissionAdmission, verifyMissionCompletionReceipt } from './mission-phase-contracts.mjs';
import { IDENTITY_BOUND_VESSEL_AUTHORITY } from './identity-bound-mission-vessel-contracts.mjs';

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Internal admission contract. The production host must authenticate policy,
// candidate admission and pinned journal adapters. A journal provenance brand
// proves in-process verification/binding, not the authority of arbitrary callers.
export function buildEffectOnlyVesselAdmission({ request, policy, candidate,
  routingResult, routingExecutable, verifierExecutable, admittedAt }) {
  request = structuredClone(request);
  policy = structuredClone(policy);
  candidate = structuredClone(candidate);
  assertVerifiedEffectOnlyExecutable(routingExecutable);
  assertVerifiedEffectOnlyVerifier(verifierExecutable, routingExecutable);
  const projection = buildEffectOnlyRoutingProjection({ request, policy, candidate });
  const { forbiddenCapabilities, maxCompositionSize, ...authority } = projection.request.context;
  for (const effect of request.effectAssessment.requestedEffects) {
    if (!authority.availableAuthority.includes(effect) || !authority.permittedEffects.includes(effect)) {
      throw new Error('mission effects exceed the admitted authority');
    }
  }
  const slotId = sha256Value({ taskId: request.task.taskId, missionId: request.mission.missionId });
  assertEffectOnlyJournalResult(routingResult, {
    slotId, request: projection.request, expectedSource: projection.expectedSource,
    hostBindingDigest: projection.hostBinding.bindingDigest,
    routingReceiptDigest: routingExecutable.receipt.receiptDigest,
    verifierReceiptDigest: verifierExecutable.receipt.receiptDigest,
  });
  if (routingResult.status !== 'no-qualified-route') throw new Error('effect-only mission admission is blocked');
  const missionAdmission = buildMissionAdmission({ mission: request.mission, budgets: request.budgets,
    authorityCeilingDigest: sha256Value(authority), admittedAt });
  const unsigned = {
    schemaVersion: 2, protocolId: 'eternities-effect-only-identity-vessel-v2',
    hostBinding: projection.hostBinding, sourceStateEpoch: request.sourceStateEpoch,
    identity: { candidateDigest: candidate.candidateDigest, fullEnvelopeDigest: candidate.fullEnvelopeDigest,
      modelProjectionDigest: candidate.modelProjectionDigest, binding: structuredClone(candidate.fullEnvelope.binding) },
    authority,
    routing: { routingPin: structuredClone(routingExecutable.pin), verifierPin: structuredClone(verifierExecutable.pin),
      result: structuredClone(routingResult.result), completion: structuredClone(routingResult.completion) },
    missionAdmission,
  };
  const admission = { ...unsigned, vesselAdmissionDigest: sha256Value(unsigned) };
  assertSchema('effect-only-vessel-admission', admission);
  return freeze(admission);
}

// Recovery must first authenticate current inputs and reverify the saved routing
// result through the pinned journal. Never accept a self-rehashed envelope alone.
export function verifyEffectOnlyVesselAdmission(value, context) {
  const expected = buildEffectOnlyVesselAdmission(context);
  if (canonicalJson(value) !== canonicalJson(expected)) throw new Error('effect-only vessel admission binding mismatch');
  return expected;
}

// The outer completion binds kernel evidence, not permission to publish an
// artifact or mutate continuity. Current authenticated admission context remains
// mandatory, including during recovery.
export function buildEffectOnlyVesselCompletion({ vesselAdmission, admissionContext, missionResult }) {
  const admission = verifyEffectOnlyVesselAdmission(vesselAdmission, admissionContext);
  const result = structuredClone(missionResult);
  if (!result || canonicalJson(Object.keys(result).sort()) !== canonicalJson(['artifact', 'receipt', 'status', 'verdict'])
      || result.status !== 'completed') throw new Error('mission result is not a closed terminal result');
  verifyMissionCompletionReceipt(result.receipt, { admission: admission.missionAdmission, verdict: result.verdict });
  const accepted = result.receipt.acceptedArtifactDigest;
  if (accepted === null ? result.artifact !== null : sha256Value(result.artifact) !== accepted) {
    throw new Error('terminal mission artifact does not match its receipt');
  }
  const unsigned = {
    schemaVersion: 2, protocolId: 'eternities-effect-only-vessel-completion-v2', status: 'completed',
    vesselAdmissionDigest: admission.vesselAdmissionDigest,
    candidateDigest: admission.identity.candidateDigest,
    missionCompletionReceiptDigest: result.receipt.receiptDigest,
    verdictDigest: result.verdict.verdictDigest,
    acceptedArtifactDigest: accepted,
    authority: structuredClone(IDENTITY_BOUND_VESSEL_AUTHORITY),
  };
  return freeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

export function verifyEffectOnlyVesselCompletion(value, context) {
  const expected = buildEffectOnlyVesselCompletion(context);
  if (canonicalJson(value) !== canonicalJson(expected)) throw new Error('effect-only vessel completion binding mismatch');
  return expected;
}
