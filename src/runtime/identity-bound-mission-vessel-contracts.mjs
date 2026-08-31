import { verifyCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  verifyMissionAdmission,
  verifyMissionCompletionReceipt,
} from './mission-phase-contracts.mjs';

const ADMISSION_PROTOCOL = 'eternities-identity-bound-mission-vessel-v1';
const COMPLETION_PROTOCOL = 'eternities-identity-bound-mission-vessel-completion-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const RISK = new Set(['low', 'moderate', 'high']);
const EVIDENCE = new Set(['unverified', 'inferred', 'verified']);

export const IDENTITY_BOUND_VESSEL_AUTHORITY = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

export class IdentityBoundMissionVesselContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IdentityBoundMissionVesselContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new IdentityBoundMissionVesselContractError(code, message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('object-invalid', `${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('fields-invalid', `${label} fields are invalid`);
  }
}

function requireIdentifier(value, label, maximum = 255) {
  if (typeof value !== 'string' || value.length > maximum || !IDENTIFIER.test(value)) {
    fail('identifier-invalid', `${label} is invalid`);
  }
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} digest is invalid`);
  return value;
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function requireText(value, label, maximum) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.includes('\0')) {
    fail('text-invalid', `${label} is invalid`);
  }
  return value;
}

function sortedUnique(values, label, { minimum = 0, maximum = 64, itemMaximum = 2048 } = {}) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    fail('set-invalid', `${label} must contain ${minimum} to ${maximum} values`);
  }
  values.forEach((value, index) => requireText(value, `${label}[${index}]`, itemMaximum));
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  if (new Set(values).size !== values.length || values.some((value, index) => value !== sorted[index])) {
    fail('set-invalid', `${label} must be sorted and unique`);
  }
  return values;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function verifyMission(value) {
  exactKeys(value, ['missionId', 'objective', 'stopConditions', 'successEvidence'], 'identity-bound vessel mission');
  requireIdentifier(value.missionId, 'mission id');
  requireText(value.objective, 'mission objective', 4096);
  sortedUnique(value.successEvidence, 'mission success evidence', { minimum: 1, maximum: 16 });
  sortedUnique(value.stopConditions, 'mission stop conditions', { minimum: 1, maximum: 16 });
}

function verifyTask(value) {
  exactKeys(value, ['hostAdapterId', 'revocationEpoch', 'taskId'], 'identity-bound vessel task');
  requireIdentifier(value.taskId, 'task id', 128);
  requireIdentifier(value.hostAdapterId, 'host adapter id', 128);
  requireInteger(value.revocationEpoch, 'task revocation epoch', 0, 2_147_483_647);
}

function verifyObservation(value) {
  exactKeys(value, ['evidenceDigests', 'observationId', 'summary'], 'identity-bound vessel observation');
  requireIdentifier(value.observationId, 'observation id', 128);
  requireText(value.summary, 'observation summary', 4096);
  if (!Array.isArray(value.evidenceDigests) || value.evidenceDigests.length > 32) {
    fail('observation-invalid', 'observation evidence digests are invalid');
  }
  value.evidenceDigests.forEach((digest, index) => requireDigest(digest, `observation evidence ${index}`));
  const sorted = [...value.evidenceDigests].sort((left, right) => left.localeCompare(right));
  if (new Set(value.evidenceDigests).size !== value.evidenceDigests.length
      || value.evidenceDigests.some((digest, index) => digest !== sorted[index])) {
    fail('observation-invalid', 'observation evidence digests must be sorted and unique');
  }
}

function verifyHostCeiling(value) {
  exactKeys(value, [
    'availableAuthority', 'availablePreconditions', 'contextBudget',
    'forbiddenCapabilities', 'maxCompositionSize', 'maximumRisk',
    'minimumEvidenceConfidence', 'permittedEffects',
  ], 'identity-bound vessel host ceiling');
  sortedUnique(value.availableAuthority, 'host available authority');
  sortedUnique(value.permittedEffects, 'host permitted effects', { minimum: 1 });
  sortedUnique(value.availablePreconditions, 'host available preconditions');
  sortedUnique(value.forbiddenCapabilities, 'host forbidden capabilities');
  if (!RISK.has(value.maximumRisk)) fail('risk-invalid', 'host maximum risk is invalid');
  if (!EVIDENCE.has(value.minimumEvidenceConfidence)) fail('evidence-invalid', 'host evidence floor is invalid');
  requireInteger(value.contextBudget, 'host context budget', 1, 1_000_000);
  requireInteger(value.maxCompositionSize, 'host composition size', 1, 3);
}

function verifyBudgets(value) {
  exactKeys(value, [
    'maxArtifactBytes', 'nativeCompletionTokens', 'reviewCompletionTokensPerRound',
    'revisionCompletionTokens', 'totalCompletionTokens',
  ], 'identity-bound vessel budgets');
  requireInteger(value.maxArtifactBytes, 'maximum artifact bytes', 1, 16_777_216);
  requireInteger(value.nativeCompletionTokens, 'native completion tokens', 1, 1_000_000);
  requireInteger(value.reviewCompletionTokensPerRound, 'review completion tokens', 1, 1_000_000);
  requireInteger(value.revisionCompletionTokens, 'revision completion tokens', 1, 1_000_000);
  requireInteger(value.totalCompletionTokens, 'total completion tokens', 1, 1_000_000);
  const maximum = value.nativeCompletionTokens
    + (2 * value.reviewCompletionTokensPerRound)
    + value.revisionCompletionTokens;
  if (value.totalCompletionTokens < value.nativeCompletionTokens || value.totalCompletionTokens > maximum) {
    fail('budget-invalid', 'identity-bound vessel total completion budget is outside its phase range');
  }
}

export function verifyIdentityBoundMissionVesselRequest(value) {
  assertNoCredentialFields(value);
  assertSchema('identity-bound-mission-vessel-request', value);
  exactKeys(value, [
    'schemaVersion', 'task', 'mission', 'observation', 'requestedAuthority',
    'explicitMethodRequests', 'hostCeiling', 'budgets', 'sourceStateEpoch',
    'maxCycles', 'maxProjectionBytes',
  ], 'identity-bound mission vessel request');
  if (value.schemaVersion !== 1) fail('request-invalid', 'identity-bound mission vessel request version is invalid');
  verifyTask(value.task);
  verifyMission(value.mission);
  verifyObservation(value.observation);
  sortedUnique(value.requestedAuthority, 'requested authority');
  sortedUnique(value.explicitMethodRequests, 'explicit method requests');
  verifyHostCeiling(value.hostCeiling);
  verifyBudgets(value.budgets);
  if (value.requestedAuthority.some((entry) => !value.hostCeiling.availableAuthority.includes(entry))) {
    fail('authority-invalid', 'requested authority exceeds the host ceiling');
  }
  requireInteger(value.sourceStateEpoch, 'source state epoch', 0, Number.MAX_SAFE_INTEGER);
  requireInteger(value.maxCycles, 'maximum cycles', 1, 32);
  requireInteger(value.maxProjectionBytes, 'maximum projection bytes', 256, 1_048_576);
  return value;
}

export function buildCortexBindingRequestFromVesselRequest(input) {
  const request = verifyIdentityBoundMissionVesselRequest(clone(input));
  return deepFreeze({
    schemaVersion: 1,
    task: clone(request.task),
    mission: {
      ...clone(request.mission),
      budget: {
        maxCycles: request.maxCycles,
        maxCompletionTokens: request.budgets.totalCompletionTokens,
      },
      observation: clone(request.observation),
    },
    maxProjectionBytes: request.maxProjectionBytes,
  });
}

export function projectIdentityBoundMissionAuthority(input, inputCandidate) {
  const request = verifyIdentityBoundMissionVesselRequest(clone(input));
  const candidate = verifyCortexBindingCandidate(clone(inputCandidate));
  const hostAuthority = new Set(request.hostCeiling.availableAuthority);
  const constitutionEffects = new Set(candidate.fullEnvelope.authority.declaredEffectCeiling);
  return deepFreeze({
    availableAuthority: request.requestedAuthority.filter((entry) => hostAuthority.has(entry)),
    permittedEffects: request.hostCeiling.permittedEffects.filter((entry) => constitutionEffects.has(entry)),
    availablePreconditions: clone(request.hostCeiling.availablePreconditions),
    maximumRisk: request.hostCeiling.maximumRisk,
    minimumEvidenceConfidence: request.hostCeiling.minimumEvidenceConfidence,
    contextBudget: request.hostCeiling.contextBudget,
  });
}

function assertCandidateMatchesRequest(candidate, request) {
  const expected = buildCortexBindingRequestFromVesselRequest(request);
  if (!same(candidate.modelProjection.binding, candidate.fullEnvelope.binding)
      || !same(candidate.fullEnvelope.mission, expected.mission)
      || candidate.fullEnvelope.binding.taskId !== expected.task.taskId
      || candidate.fullEnvelope.binding.hostAdapterId !== expected.task.hostAdapterId
      || candidate.fullEnvelope.binding.revocationEpoch !== expected.task.revocationEpoch
      || candidate.compaction.maxProjectionBytes !== expected.maxProjectionBytes) {
    fail('identity-binding-invalid', 'Cortex Binding candidate does not match the vessel request');
  }
}

function verifyRouteBinding(value, request, candidate) {
  exactKeys(value, ['cortexPackage', 'receipt', 'status'], 'identity-bound vessel Godskills binding');
  if (!['bound', 'no-qualified-route'].includes(value.status)) {
    fail('godskills-binding-invalid', 'Godskills route status is invalid');
  }
  assertSchema('godskills-cycle-receipt', value.receipt);
  object(value.cortexPackage, 'Godskills cortex package');
  if (value.receipt.requestId !== request.mission.missionId
      || value.receipt.packageDigest !== sha256Text(canonicalJson(value.cortexPackage))
      || value.cortexPackage.protocolId !== value.receipt.protocolId
      || value.cortexPackage.sourceEnvelopeDigest !== value.receipt.sourceEnvelopeDigest
      || value.cortexPackage.releaseDigest !== value.receipt.releaseDigest
      || value.cortexPackage.stackDigest !== value.receipt.stackDigest
      || (value.status === 'bound') !== (value.receipt.selectionStatus === 'selected')
      || (value.status === 'no-qualified-route') !== (value.receipt.selectionStatus === 'no-qualified-route')) {
    fail('godskills-binding-invalid', 'Godskills route binding is incoherent');
  }
  const authority = projectIdentityBoundMissionAuthority(request, candidate);
  if (value.receipt.authorityCeilingDigest !== sha256Value(authority)
      || (value.receipt.activation && !same(value.cortexPackage.authorityProjection, authority))) {
    fail('godskills-authority-invalid', 'Godskills binding does not match the derived authority ceiling');
  }
  if (value.status === 'bound' && !value.receipt.activation) {
    fail('godskills-trust-invalid', 'default mission vessel requires an adaptive Godskills trust root');
  }
  return value;
}

function identityProjection(candidate) {
  const binding = candidate.fullEnvelope.binding;
  return {
    bindingCandidateId: candidate.bindingCandidateId,
    candidateDigest: candidate.candidateDigest,
    fullEnvelopeDigest: candidate.fullEnvelopeDigest,
    modelProjectionDigest: candidate.modelProjectionDigest,
    admissionReceiptDigest: binding.admissionReceiptDigest,
    instanceId: binding.instanceId,
    genesisId: binding.genesisId,
    keelId: binding.keelId,
    currentKeelHeadDigest: binding.currentKeelHeadDigest,
  };
}

function admissionValue({ request: inputRequest, candidate: inputCandidate, routeBinding: inputRoute, missionAdmission: inputMissionAdmission }) {
  const request = verifyIdentityBoundMissionVesselRequest(clone(inputRequest));
  const candidate = verifyCortexBindingCandidate(clone(inputCandidate));
  assertCandidateMatchesRequest(candidate, request);
  const routeBinding = verifyRouteBinding(clone(inputRoute), request, candidate);
  const missionAdmission = verifyMissionAdmission(clone(inputMissionAdmission));
  if (!same(missionAdmission.mission, request.mission) || !same(missionAdmission.budgets, request.budgets)
      || missionAdmission.authorityCeilingDigest !== routeBinding.receipt.authorityCeilingDigest) {
    fail('mission-admission-invalid', 'mission admission does not match the vessel request or Godskills ceiling');
  }
  if (routeBinding.status === 'bound') {
    if (missionAdmission.godskills === null
        || !same(missionAdmission.godskills.receipt, routeBinding.receipt)
        || !same(missionAdmission.godskills.cortexPackage, routeBinding.cortexPackage)) {
      fail('mission-admission-invalid', 'mission admission lacks the exact bound Godskills package');
    }
  } else if (missionAdmission.godskills !== null) {
    fail('mission-admission-invalid', 'no-qualified-route mission admission must remain native-only');
  }
  const godskills = {
    status: routeBinding.status,
    releaseDigest: routeBinding.receipt.releaseDigest,
    receiptDigest: sha256Value(routeBinding.receipt),
    packageDigest: routeBinding.receipt.packageDigest,
    receipt: clone(routeBinding.receipt),
    cortexPackage: clone(routeBinding.cortexPackage),
  };
  const unsigned = {
    schemaVersion: 1,
    protocolId: ADMISSION_PROTOCOL,
    requestDigest: sha256Value(request),
    identity: identityProjection(candidate),
    godskills,
    missionAdmission: clone(missionAdmission),
    missionAdmissionDigest: missionAdmission.admissionDigest,
  };
  assertNoCredentialFields(unsigned);
  return { ...unsigned, vesselAdmissionDigest: sha256Value(unsigned) };
}

export function buildIdentityBoundMissionVesselAdmission(context = {}) {
  const value = admissionValue(context);
  assertSchema('identity-bound-mission-vessel-admission', value);
  return deepFreeze(value);
}

export function verifyIdentityBoundMissionVesselAdmission(value, context = null) {
  assertNoCredentialFields(value);
  assertSchema('identity-bound-mission-vessel-admission', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'requestDigest', 'identity', 'godskills',
    'missionAdmission', 'missionAdmissionDigest', 'vesselAdmissionDigest',
  ], 'identity-bound mission vessel admission');
  if (value.schemaVersion !== 1 || value.protocolId !== ADMISSION_PROTOCOL) {
    fail('admission-invalid', 'identity-bound mission vessel admission protocol is invalid');
  }
  exactKeys(value.identity, [
    'bindingCandidateId', 'candidateDigest', 'fullEnvelopeDigest', 'modelProjectionDigest',
    'admissionReceiptDigest', 'instanceId', 'genesisId', 'keelId', 'currentKeelHeadDigest',
  ], 'identity-bound mission vessel identity');
  for (const [key, entry] of Object.entries(value.identity)) {
    if (key === 'instanceId' || key === 'keelId') continue;
    requireDigest(entry, `identity ${key}`);
  }
  requireIdentifier(value.identity.instanceId, 'identity instance id', 128);
  if (typeof value.identity.keelId !== 'string' || !/^keel-[a-f0-9]{64}$/.test(value.identity.keelId)) {
    fail('identity-invalid', 'identity keel id is invalid');
  }
  requireDigest(value.requestDigest, 'vessel request');
  requireDigest(value.godskills.releaseDigest, 'Godskills release');
  requireDigest(value.godskills.receiptDigest, 'Godskills receipt');
  requireDigest(value.godskills.packageDigest, 'Godskills package');
  assertSchema('godskills-cycle-receipt', value.godskills.receipt);
  if (!['bound', 'no-qualified-route'].includes(value.godskills.status)
      || value.godskills.releaseDigest !== value.godskills.receipt.releaseDigest
      || value.godskills.receiptDigest !== sha256Value(value.godskills.receipt)
      || value.godskills.packageDigest !== value.godskills.receipt.packageDigest
      || value.godskills.packageDigest !== sha256Text(canonicalJson(value.godskills.cortexPackage))
      || value.missionAdmission.authorityCeilingDigest !== value.godskills.receipt.authorityCeilingDigest
      || (value.godskills.status === 'bound') !== (value.godskills.receipt.selectionStatus === 'selected')
      || (value.godskills.status === 'no-qualified-route') !== (value.godskills.receipt.selectionStatus === 'no-qualified-route')) {
    fail('godskills-binding-invalid', 'stored Godskills binding digest is invalid');
  }
  verifyMissionAdmission(value.missionAdmission);
  if (value.godskills.status === 'bound') {
    if (!value.godskills.receipt.activation || value.missionAdmission.godskills === null
        || !same(value.missionAdmission.godskills.receipt, value.godskills.receipt)
        || !same(value.missionAdmission.godskills.cortexPackage, value.godskills.cortexPackage)) {
      fail('godskills-binding-invalid', 'stored bound Godskills package differs from mission admission');
    }
  } else if (value.missionAdmission.godskills !== null) {
    fail('godskills-binding-invalid', 'stored no-route mission admission must remain native-only');
  }
  if (value.missionAdmissionDigest !== value.missionAdmission.admissionDigest) {
    fail('mission-admission-invalid', 'stored mission admission digest is invalid');
  }
  const { vesselAdmissionDigest, ...unsigned } = value;
  requireDigest(vesselAdmissionDigest, 'vessel admission');
  if (sha256Value(unsigned) !== vesselAdmissionDigest) fail('admission-digest-invalid', 'vessel admission digest mismatch');
  if (context !== null) {
    const expected = admissionValue(context);
    if (!same(value, expected)) fail('admission-binding-invalid', 'vessel admission differs from its request, identity, Godskills, or mission binding');
  }
  return value;
}

function verifyTerminalMissionResult(value, vesselAdmission) {
  exactKeys(value, ['artifact', 'receipt', 'status', 'verdict'], 'terminal mission result');
  if (value.status !== 'completed') fail('completion-invalid', 'mission result is not terminal');
  verifyMissionCompletionReceipt(value.receipt, {
    admission: vesselAdmission.missionAdmission,
    verdict: value.verdict,
  });
  if (value.receipt.acceptedArtifactDigest === null) {
    if (value.artifact !== null) fail('completion-invalid', 'rejected mission returned an accepted artifact');
  } else {
    const artifactDigest = sha256Text(canonicalJson(value.artifact));
    if (value.receipt.acceptedArtifactDigest !== artifactDigest) {
      fail('completion-invalid', 'terminal mission artifact does not match its receipt');
    }
  }
  return value;
}

function completionValue(vesselAdmission, missionResult) {
  const admission = verifyIdentityBoundMissionVesselAdmission(clone(vesselAdmission));
  const result = verifyTerminalMissionResult(clone(missionResult), admission);
  const unsigned = {
    schemaVersion: 1,
    protocolId: COMPLETION_PROTOCOL,
    status: 'completed',
    missionId: admission.missionAdmission.mission.missionId,
    vesselAdmissionDigest: admission.vesselAdmissionDigest,
    bindingCandidateId: admission.identity.bindingCandidateId,
    candidateDigest: admission.identity.candidateDigest,
    modelProjectionDigest: admission.identity.modelProjectionDigest,
    missionCompletionReceiptDigest: result.receipt.receiptDigest,
    verdictDigest: result.verdict.verdictDigest,
    acceptedArtifactDigest: result.receipt.acceptedArtifactDigest,
    authority: clone(IDENTITY_BOUND_VESSEL_AUTHORITY),
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

export function buildIdentityBoundMissionVesselCompletion({ vesselAdmission, missionResult } = {}) {
  const value = completionValue(vesselAdmission, missionResult);
  assertSchema('identity-bound-mission-vessel-completion', value);
  return deepFreeze(value);
}

export function verifyIdentityBoundMissionVesselCompletion(value, { vesselAdmission, missionResult } = {}) {
  assertNoCredentialFields(value);
  assertSchema('identity-bound-mission-vessel-completion', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'missionId', 'vesselAdmissionDigest',
    'bindingCandidateId', 'candidateDigest', 'modelProjectionDigest',
    'missionCompletionReceiptDigest', 'verdictDigest', 'acceptedArtifactDigest',
    'authority', 'receiptDigest',
  ], 'identity-bound mission vessel completion');
  for (const key of [
    'vesselAdmissionDigest', 'bindingCandidateId', 'candidateDigest',
    'modelProjectionDigest', 'missionCompletionReceiptDigest', 'verdictDigest',
    'receiptDigest',
  ]) requireDigest(value[key], `vessel completion ${key}`);
  if (value.acceptedArtifactDigest !== null) {
    requireDigest(value.acceptedArtifactDigest, 'vessel completion accepted artifact');
  }
  if (!same(value.authority, IDENTITY_BOUND_VESSEL_AUTHORITY)) {
    fail('authority-invalid', 'vessel completion authority must remain empty');
  }
  const { receiptDigest, ...unsigned } = value;
  if (sha256Value(unsigned) !== receiptDigest) fail('completion-digest-invalid', 'vessel completion digest mismatch');
  const expected = completionValue(vesselAdmission, missionResult);
  if (!same(value, expected)) fail('completion-binding-invalid', 'vessel completion differs from its mission evidence');
  return value;
}
