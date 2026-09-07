import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyIdentityBoundMissionVesselRequest } from '../runtime/identity-bound-mission-vessel-contracts.mjs';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const localArtifactEffectProducer = freeze({
  schemaVersion: 1,
  protocolId: 'eternities-structured-effect-producer-v1',
  producerId: 'local-artifact-output-v1',
  operation: 'publish-local-artifact',
  routeMode: 'effect-only',
  requestedEffects: ['local-read', 'local-write'],
});

function requireProducer(options) {
  // The caller must obtain this pin from its trusted policy, not the request.
  // This comparison provides consistency, not authentication of the caller.
  const expected = options?.expectedProducerDescriptorDigest;
  if (expected !== sha256Value(localArtifactEffectProducer)) {
    throw new Error('structured effect producer differs from trusted policy');
  }
  return expected;
}

function validateSubject(input) {
  const subject = structuredClone(input);
  if (!subject || subject.schemaVersion !== 2 || subject.routeMode !== 'effect-only') {
    throw new Error('structured effect subject version or mode is unsupported');
  }
  if (Object.hasOwn(subject, 'effectAssessment')) {
    throw new Error('structured effect subject already contains an assessment');
  }
  const { routeMode: _routeMode, ...legacy } = subject;
  // Reuse exact v1 field/ceiling validation without changing its accepted wire
  // shape. This internal validation projection is never dispatched as v1.
  verifyIdentityBoundMissionVesselRequest({ ...legacy, schemaVersion: 1 });
  return subject;
}

function assessmentFor(subject, producerDescriptorDigest) {
  return {
    protocolId: 'eternities-requested-effects-v1',
    subjectDigest: sha256Value(subject),
    state: 'known',
    requestedEffects: [...localArtifactEffectProducer.requestedEffects],
    unresolvedDecisions: [],
    producerDescriptorDigest,
  };
}

// This producer describes the configured artifact operation. It neither parses
// arbitrary prose nor grants permission to execute or publish the result.
export function prepareLocalArtifactEffectRequest(input, options) {
  const producer = requireProducer(options);
  const subject = validateSubject(input);
  return freeze({ ...subject, effectAssessment: assessmentFor(subject, producer) });
}

export function verifyLocalArtifactEffectRequest(input, options) {
  const producer = requireProducer(options);
  const request = structuredClone(input);
  if (!request || !Object.hasOwn(request, 'effectAssessment')) {
    throw new Error('structured effect assessment is required');
  }
  const { effectAssessment, ...original } = request;
  const subject = validateSubject(original);
  if (canonicalJson(effectAssessment) !== canonicalJson(assessmentFor(subject, producer))) {
    throw new Error('structured effect assessment differs from its operation or source');
  }
  return freeze(request);
}
