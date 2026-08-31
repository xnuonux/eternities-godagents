import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const phases = new Set(['native', 'review', 'revision']);
const recommendations = new Set(['accept', 'revise', 'reject']);
const severities = new Set(['advisory', 'important', 'critical']);
const forbiddenArtifactKeys = new Set([
  'authority',
  'authorityExpanded',
  'continuityAdmission',
  'credentials',
  'evolution',
  'inspiration',
  'identityOwnership',
  'keel',
  'personalKeelWrite',
  'realmEffects',
  'soul',
]);

const executorAuthority = Object.freeze({
  continuityAdmission: false,
  evolution: false,
  identityOwnership: false,
  inspiration: false,
  personalKeelWrite: false,
  realmEffects: false,
  soul: false,
});

export class MissionPhaseContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionPhaseContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionPhaseContractError(code, message);
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

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} digest is invalid`);
  return value;
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('identifier-invalid', `${label} is invalid`);
  return value;
}

function requireText(value, label, maximum = 65_536) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.includes('\0')) {
    fail('text-invalid', `${label} is invalid`);
  }
  return value;
}

function requireIso(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('time-invalid', `${label} time is invalid`);
  }
  return value;
}

function requireInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function sortedUniqueStrings(values, label, { minimum = 0, maximum = 64 } = {}) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    fail('set-invalid', `${label} must contain ${minimum} to ${maximum} values`);
  }
  const checked = values.map((value, index) => requireText(value, `${label}[${index}]`, 2048));
  const sorted = [...checked].sort((left, right) => left.localeCompare(right));
  if (new Set(checked).size !== checked.length || checked.some((value, index) => value !== sorted[index])) {
    fail('set-invalid', `${label} must be sorted and unique`);
  }
  return checked;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function verifyMission(value) {
  exactKeys(value, ['missionId', 'objective', 'stopConditions', 'successEvidence'], 'mission');
  requireIdentifier(value.missionId, 'mission id');
  requireText(value.objective, 'mission objective', 32_768);
  sortedUniqueStrings(value.successEvidence, 'mission success evidence', { minimum: 1, maximum: 32 });
  sortedUniqueStrings(value.stopConditions, 'mission stop conditions', { minimum: 1, maximum: 32 });
  return value;
}

function verifyBudgets(value) {
  exactKeys(value, [
    'maxArtifactBytes',
    'nativeCompletionTokens',
    'reviewCompletionTokensPerRound',
    'revisionCompletionTokens',
    'totalCompletionTokens',
  ], 'mission budgets');
  requireInteger(value.nativeCompletionTokens, 'native completion tokens', { minimum: 1, maximum: 1_000_000 });
  requireInteger(value.reviewCompletionTokensPerRound, 'review completion tokens', { minimum: 1, maximum: 1_000_000 });
  requireInteger(value.revisionCompletionTokens, 'revision completion tokens', { minimum: 1, maximum: 1_000_000 });
  requireInteger(value.totalCompletionTokens, 'total completion tokens', { minimum: 1, maximum: 4_000_000 });
  requireInteger(value.maxArtifactBytes, 'maximum artifact bytes', { minimum: 1, maximum: 16_777_216 });
  const maximumPossible = value.nativeCompletionTokens
    + (2 * value.reviewCompletionTokensPerRound)
    + value.revisionCompletionTokens;
  if (value.totalCompletionTokens < value.nativeCompletionTokens
      || value.totalCompletionTokens > maximumPossible) {
    fail('budget-invalid', 'mission total completion budget is outside its bounded phase range');
  }
  return value;
}

function verifyActivation(receipt) {
  if (!receipt.activation) return [];
  const activation = object(receipt.activation, 'Godskills activation');
  const { resultDigest, ...activationUnsigned } = activation;
  requireDigest(resultDigest, 'Godskills activation result');
  if (sha256Value(activationUnsigned) !== resultDigest) {
    fail('godskills-activation-invalid', 'Godskills activation result digest mismatch');
  }
  if (activation.protocolId !== 'eternities-godskills-activation-v1'
      || activation.policyDigest !== activationUnsigned.policyDigest
      || activation.evidenceDigest !== activationUnsigned.evidenceDigest
      || !Array.isArray(activation.decisions)) {
    fail('godskills-activation-invalid', 'Godskills activation is incoherent');
  }
  const reviewIds = [];
  for (const decision of activation.decisions) {
    const { decisionDigest, ...decisionUnsigned } = object(decision, 'Godskills activation decision');
    requireDigest(decisionDigest, 'Godskills activation decision');
    if (sha256Value(decisionUnsigned) !== decisionDigest
        || decision.policyDigest !== activation.policyDigest
        || decision.evidenceDigest !== activation.evidenceDigest
        || decision.taskClass !== activation.classification.taskClass
        || decision.consequenceClass !== activation.classification.consequenceClass
        || !same(decision.authorityProjection, activation.decisions[0].authorityProjection)
        || decision.authorityExpanded !== false
        || decision.deferredReview !== (decision.mode === 'review')
        || decision.preInferenceDisclosure !== (decision.mode === 'review' || decision.mode === 'native'
          ? 'none'
          : decision.mode === 'guardrail' ? 'guardrails-only' : 'entrypoint-and-contract')) {
      fail('godskills-activation-invalid', 'Godskills activation decision is incoherent');
    }
    if (decision.mode === 'review') reviewIds.push(decision.selectedId);
  }
  if (reviewIds.length > 0 && activation.classification.reviewAvailable !== true) {
    fail('godskills-activation-invalid', 'Godskills review activation lacks review availability');
  }
  return reviewIds.sort((left, right) => left.localeCompare(right));
}

function verifyGodskillsTrustPin(value, receipt) {
  exactKeys(value, [
    'activationProtocolId', 'activationTrustRootDigest', 'protocolId', 'releaseDigest',
  ], 'Godskills trust pin');
  requireDigest(value.releaseDigest, 'Godskills trust pin release');
  requireDigest(value.activationTrustRootDigest, 'Godskills trust pin activation root');
  if (value.protocolId !== receipt.protocolId
      || value.releaseDigest !== receipt.releaseDigest
      || value.activationProtocolId !== receipt.activation?.protocolId
      || value.activationTrustRootDigest !== receipt.activation?.trustRootDigest) {
    fail('godskills-trust-invalid', 'Godskills trust pin does not match the bound release and activation root');
  }
  return value;
}

function verifyGodskillsBinding(value, missionId, authorityCeilingDigest) {
  if (value === null) return null;
  exactKeys(value, ['bindingDigest', 'cortexPackage', 'deferredReviews', 'receipt', 'trustPin'], 'Godskills mission binding');
  assertSchema('godskills-cycle-receipt', value.receipt);
  const receipt = value.receipt;
  const cortexPackage = object(value.cortexPackage, 'Godskills cortex package');
  verifyGodskillsTrustPin(value.trustPin, receipt);
  if (receipt.requestId !== missionId) fail('godskills-mission-invalid', 'Godskills request identity mismatch');
  if (receipt.authorityCeilingDigest !== authorityCeilingDigest) {
    fail('godskills-authority-invalid', 'Godskills authority ceiling does not match mission admission');
  }
  if (receipt.packageDigest !== sha256Text(canonicalJson(cortexPackage))) {
    fail('godskills-package-invalid', 'Godskills package digest mismatch');
  }
  if (cortexPackage.protocolId !== receipt.protocolId
      || cortexPackage.sourceEnvelopeDigest !== receipt.sourceEnvelopeDigest
      || cortexPackage.releaseDigest !== receipt.releaseDigest
      || cortexPackage.stackDigest !== receipt.stackDigest) {
    fail('godskills-package-invalid', 'Godskills package identity mismatch');
  }
  if (!Array.isArray(receipt.selected) || new Set(receipt.selected.map(({ id }) => id)).size !== receipt.selected.length) {
    fail('godskills-selection-invalid', 'Godskills selection identities are invalid');
  }
  const selected = new Map(receipt.selected.map((row) => [row.id, row]));
  const reviewIds = verifyActivation(receipt);
  if (!same(cortexPackage.activation ?? null, receipt.activation ?? null)
      || !same(cortexPackage.selectedCapabilities, receipt.selected.map(({ id }) => id))
      || (receipt.activation
        && !same(receipt.activation.decisions.map(({ selectedId }) => selectedId), receipt.selected.map(({ id }) => id)))) {
    fail('godskills-activation-invalid', 'Godskills package activation or selection projection mismatch');
  }
  const deferred = value.deferredReviews;
  if (!Array.isArray(deferred) || !Array.isArray(cortexPackage.deferredReviews)
      || !same(deferred, cortexPackage.deferredReviews)) {
    fail('godskills-review-invalid', 'Godskills deferred review projection mismatch');
  }
  const sortedDeferred = [...deferred].sort((left, right) => left.id.localeCompare(right.id));
  if (!same(sortedDeferred, deferred)
      || new Set(deferred.map(({ id }) => id)).size !== deferred.length
      || !same(deferred.map(({ id }) => id), reviewIds)) {
    fail('godskills-review-invalid', 'Godskills deferred review set is invalid');
  }
  for (const row of deferred) {
    exactKeys(row, ['contractSha256', 'entrypointSha256', 'id', 'status'], 'Godskills deferred review');
    const selection = selected.get(row.id);
    if (!selection || row.status !== 'scheduled-not-executed'
        || row.entrypointSha256 !== selection.entrypointSha256
        || row.contractSha256 !== selection.contractSha256) {
      fail('godskills-review-invalid', 'Godskills deferred review identity mismatch');
    }
  }
  if (!Array.isArray(cortexPackage.selectedPackages)) {
    fail('godskills-package-invalid', 'Godskills selected packages are invalid');
  }
  const deferredIds = new Set(reviewIds);
  if (cortexPackage.selectedPackages.some((row) => deferredIds.has(row?.id))) {
    fail('godskills-review-disclosure', 'Godskills review package was disclosed before native inference');
  }
  if (receipt.activation && !same(
    cortexPackage.authorityProjection,
    receipt.activation.decisions[0]?.authorityProjection,
  )) {
    fail('godskills-authority-invalid', 'Godskills activation authority projection mismatch');
  }
  requireDigest(value.bindingDigest, 'Godskills mission binding');
  const expectedDigest = sha256Value({
    receipt, cortexPackage, deferredReviews: deferred, trustPin: value.trustPin,
  });
  if (value.bindingDigest !== expectedDigest) {
    fail('godskills-binding-invalid', 'Godskills mission binding digest mismatch');
  }
  return value;
}

export function buildMissionAdmission({
  mission,
  authorityCeilingDigest,
  budgets,
  godskillsBinding = null,
  godskillsTrustPin = null,
  admittedAt,
} = {}) {
  verifyMission(mission);
  requireDigest(authorityCeilingDigest, 'mission authority ceiling');
  verifyBudgets(budgets);
  requireIso(admittedAt, 'mission admission');
  let godskills = null;
  if (godskillsBinding !== null) {
    if (godskillsTrustPin === null) fail('godskills-trust-invalid', 'Godskills trust pin is required');
    const receipt = clone(godskillsBinding.receipt);
    const cortexPackage = clone(godskillsBinding.cortexPackage);
    const deferredReviews = clone(cortexPackage.deferredReviews ?? []);
    const trustPin = clone(godskillsTrustPin);
    godskills = {
      receipt,
      cortexPackage,
      deferredReviews,
      trustPin,
      bindingDigest: sha256Value({ receipt, cortexPackage, deferredReviews, trustPin }),
    };
    verifyGodskillsBinding(godskills, mission.missionId, authorityCeilingDigest);
  } else if (godskillsTrustPin !== null) {
    fail('godskills-trust-invalid', 'native-only admission cannot carry a Godskills trust pin');
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-review-kernel-v1',
    mission: clone(mission),
    authorityCeilingDigest,
    budgets: clone(budgets),
    godskills,
    admittedAt,
  };
  return deepFreeze({ ...unsigned, admissionDigest: sha256Value(unsigned) });
}

export function verifyMissionAdmission(value) {
  assertSchema('mission-review-admission', value);
  exactKeys(value, [
    'admissionDigest',
    'admittedAt',
    'authorityCeilingDigest',
    'budgets',
    'godskills',
    'mission',
    'protocolId',
    'schemaVersion',
  ], 'mission admission');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-review-kernel-v1') {
    fail('admission-protocol-invalid', 'mission admission protocol is invalid');
  }
  verifyMission(value.mission);
  requireDigest(value.authorityCeilingDigest, 'mission authority ceiling');
  verifyBudgets(value.budgets);
  verifyGodskillsBinding(value.godskills, value.mission.missionId, value.authorityCeilingDigest);
  requireIso(value.admittedAt, 'mission admission');
  const { admissionDigest, ...unsigned } = value;
  requireDigest(admissionDigest, 'mission admission');
  if (sha256Value(unsigned) !== admissionDigest) fail('admission-digest-invalid', 'mission admission digest mismatch');
  return value;
}

export function buildMissionExecutorDescriptor({ executorId, phase } = {}) {
  requireIdentifier(executorId, 'executor id');
  if (!phases.has(phase)) fail('executor-phase-invalid', 'executor phase is invalid');
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-phase-executor-v1',
    executorId,
    phase,
    terminalReconciliation: 'by-request-digest',
    atomicDeduplication: true,
    authority: clone(executorAuthority),
  };
  return deepFreeze({ ...unsigned, descriptorDigest: sha256Value(unsigned) });
}

export function verifyMissionExecutorDescriptor(value, expectedPhase = null) {
  assertSchema('mission-phase-executor-descriptor', value);
  exactKeys(value, [
    'atomicDeduplication',
    'authority',
    'descriptorDigest',
    'executorId',
    'phase',
    'protocolId',
    'schemaVersion',
    'terminalReconciliation',
  ], 'mission executor descriptor');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-phase-executor-v1'
      || !phases.has(value.phase) || (expectedPhase !== null && value.phase !== expectedPhase)
      || value.terminalReconciliation !== 'by-request-digest'
      || value.atomicDeduplication !== true) {
    fail('executor-descriptor-invalid', 'mission executor descriptor protocol or phase is invalid');
  }
  requireIdentifier(value.executorId, 'executor id');
  exactKeys(value.authority, Object.keys(executorAuthority), 'mission executor authority');
  if (!same(value.authority, executorAuthority)) {
    fail('executor-authority-invalid', 'mission executor authority must remain empty');
  }
  const { descriptorDigest, ...unsigned } = value;
  requireDigest(descriptorDigest, 'mission executor descriptor');
  if (sha256Value(unsigned) !== descriptorDigest) {
    fail('executor-descriptor-invalid', 'mission executor descriptor digest mismatch');
  }
  return value;
}

function verifyInputs(values) {
  if (!Array.isArray(values) || values.length > 16) fail('phase-input-invalid', 'phase inputs are invalid');
  const roles = [];
  for (const [index, value] of values.entries()) {
    exactKeys(value, ['artifactDigest', 'role'], `phase input ${index}`);
    requireIdentifier(value.role, `phase input ${index} role`);
    requireDigest(value.artifactDigest, `phase input ${index} artifact`);
    roles.push(value.role);
  }
  if (new Set(roles).size !== roles.length
      || roles.some((role, index) => role !== [...roles].sort((left, right) => left.localeCompare(right))[index])) {
    fail('phase-input-invalid', 'phase input roles must be sorted and unique');
  }
  return values;
}

function phaseBudget(admission, phase) {
  if (phase === 'native') return admission.budgets.nativeCompletionTokens;
  if (phase === 'review') return admission.budgets.reviewCompletionTokensPerRound;
  return admission.budgets.revisionCompletionTokens;
}

export function buildMissionPhaseRequest({
  admission,
  phase,
  round,
  descriptor,
  inputs = [],
  maxCompletionTokens,
} = {}) {
  verifyMissionAdmission(admission);
  verifyMissionExecutorDescriptor(descriptor, phase);
  if (!phases.has(phase)) fail('phase-invalid', 'mission phase is invalid');
  requireInteger(round, 'mission phase round', { minimum: 1, maximum: 2 });
  if (phase !== 'review' && round !== 1) fail('phase-round-invalid', 'only review may use round two');
  verifyInputs(inputs);
  requireInteger(maxCompletionTokens, 'mission phase completion ceiling', { minimum: 1, maximum: 1_000_000 });
  if (maxCompletionTokens !== phaseBudget(admission, phase)) {
    fail('phase-budget-invalid', 'mission phase completion ceiling must equal its admitted budget');
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-phase-request-v1',
    missionId: admission.mission.missionId,
    admissionDigest: admission.admissionDigest,
    phase,
    round,
    executorDescriptorDigest: descriptor.descriptorDigest,
    inputs: clone(inputs),
    maxCompletionTokens,
  };
  return deepFreeze({ ...unsigned, requestDigest: sha256Value(unsigned) });
}

export function verifyMissionPhaseRequest(value, { admission, descriptor } = {}) {
  assertSchema('mission-phase-request', value);
  verifyMissionAdmission(admission);
  exactKeys(value, [
    'admissionDigest',
    'executorDescriptorDigest',
    'inputs',
    'maxCompletionTokens',
    'missionId',
    'phase',
    'protocolId',
    'requestDigest',
    'round',
    'schemaVersion',
  ], 'mission phase request');
  verifyMissionExecutorDescriptor(descriptor, value.phase);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-phase-request-v1'
      || value.missionId !== admission.mission.missionId
      || value.admissionDigest !== admission.admissionDigest
      || value.executorDescriptorDigest !== descriptor.descriptorDigest
      || !phases.has(value.phase)) {
    fail('phase-request-invalid', 'mission phase request identity is invalid');
  }
  requireInteger(value.round, 'mission phase round', { minimum: 1, maximum: 2 });
  if (value.phase !== 'review' && value.round !== 1) fail('phase-round-invalid', 'only review may use round two');
  verifyInputs(value.inputs);
  requireInteger(value.maxCompletionTokens, 'mission phase completion ceiling', { minimum: 1, maximum: 1_000_000 });
  if (value.maxCompletionTokens !== phaseBudget(admission, value.phase)) {
    fail('phase-budget-invalid', 'mission phase completion budget mismatches admission');
  }
  const { requestDigest, ...unsigned } = value;
  requireDigest(requestDigest, 'mission phase request');
  if (sha256Value(unsigned) !== requestDigest) fail('phase-request-invalid', 'mission phase request digest mismatch');
  return value;
}

function artifactInput(request, role) {
  return request.inputs.find((input) => input.role === role)?.artifactDigest ?? null;
}

function verifyFinding(value, index) {
  exactKeys(value, ['id', 'message', 'required', 'severity'], `review finding ${index}`);
  requireIdentifier(value.id, `review finding ${index} id`);
  if (!severities.has(value.severity) || typeof value.required !== 'boolean') {
    fail('review-finding-invalid', `review finding ${index} is invalid`);
  }
  requireText(value.message, `review finding ${index} message`, 8192);
  return value;
}

export function verifyMissionPhaseArtifact(value, request) {
  object(value, 'mission phase artifact');
  for (const key of Object.keys(value)) {
    if (forbiddenArtifactKeys.has(key)) fail('artifact-authority-invalid', `mission phase artifact field ${key} is forbidden`);
  }
  if (request.phase === 'native') {
    exactKeys(value, ['artifactType', 'content', 'schemaVersion'], 'native artifact');
    if (value.schemaVersion !== 1 || value.artifactType !== 'native') fail('artifact-phase-invalid', 'native artifact phase is invalid');
    requireText(value.content, 'native artifact content', 16_777_216);
    return value;
  }
  if (request.phase === 'review') {
    exactKeys(value, [
      'artifactType', 'findings', 'recommendation', 'schemaVersion', 'subjectDigest', 'summary',
    ], 'review artifact');
    if (value.schemaVersion !== 1 || value.artifactType !== 'review' || !recommendations.has(value.recommendation)) {
      fail('artifact-phase-invalid', 'review artifact phase or recommendation is invalid');
    }
    requireDigest(value.subjectDigest, 'review subject');
    if (value.subjectDigest !== artifactInput(request, 'subject')) {
      fail('review-subject-invalid', 'review artifact subject digest mismatch');
    }
    if (!Array.isArray(value.findings) || value.findings.length > 128) fail('review-finding-invalid', 'review findings are invalid');
    value.findings.forEach(verifyFinding);
    const ids = value.findings.map(({ id }) => id);
    if (new Set(ids).size !== ids.length
        || ids.some((id, index) => id !== [...ids].sort((left, right) => left.localeCompare(right))[index])) {
      fail('review-finding-invalid', 'review findings must be sorted and unique');
    }
    if (value.recommendation === 'revise' && !value.findings.some(({ required }) => required)) {
      fail('review-finding-invalid', 'a revision recommendation requires at least one required finding');
    }
    if (value.recommendation === 'accept'
        && value.findings.some(({ required, severity }) => required || severity === 'critical')) {
      fail('review-finding-invalid', 'an accept recommendation cannot retain a blocking finding');
    }
    if (value.recommendation === 'reject' && !value.findings.some(({ required }) => required)) {
      fail('review-finding-invalid', 'a reject recommendation requires at least one required finding');
    }
    requireText(value.summary, 'review summary', 16_384);
    return value;
  }
  exactKeys(value, [
    'addressedFindingIds',
    'artifactType',
    'content',
    'nativeArtifactDigest',
    'reviewArtifactDigest',
    'schemaVersion',
  ], 'revision artifact');
  if (value.schemaVersion !== 1 || value.artifactType !== 'revision') fail('artifact-phase-invalid', 'revision artifact phase is invalid');
  requireDigest(value.nativeArtifactDigest, 'revision native artifact');
  requireDigest(value.reviewArtifactDigest, 'revision review artifact');
  if (value.nativeArtifactDigest !== artifactInput(request, 'native')
      || value.reviewArtifactDigest !== artifactInput(request, 'review')) {
    fail('revision-input-invalid', 'revision artifact input digest mismatch');
  }
  sortedUniqueStrings(value.addressedFindingIds, 'revision addressed findings', { minimum: 1, maximum: 128 });
  requireText(value.content, 'revision artifact content', 16_777_216);
  return value;
}

function verifyUsage(value, maximumCompletionTokens) {
  exactKeys(value, [
    'cachedInputTokens',
    'completionTokens',
    'inputTokens',
    'reasoningTokens',
    'visibleOutputTokens',
  ], 'mission phase usage');
  for (const key of Object.keys(value)) requireInteger(value[key], `mission phase usage ${key}`, { maximum: 10_000_000 });
  if (value.cachedInputTokens > value.inputTokens
      || value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens
      || value.completionTokens > maximumCompletionTokens) {
    fail('usage-invalid', 'mission phase token usage is contradictory or exceeds its ceiling');
  }
  return value;
}

export function buildMissionPhaseResult({
  request,
  descriptor,
  artifact,
  usage,
  startedAt,
  completedAt,
  executorEvidenceDigest = null,
} = {}) {
  object(request, 'mission phase request');
  verifyMissionExecutorDescriptor(descriptor, request.phase);
  verifyMissionPhaseArtifact(artifact, request);
  verifyUsage(usage, request.maxCompletionTokens);
  requireIso(startedAt, 'mission phase start');
  requireIso(completedAt, 'mission phase completion');
  if (Date.parse(completedAt) < Date.parse(startedAt)) fail('phase-time-invalid', 'mission phase completed before it started');
  if (executorEvidenceDigest !== null) requireDigest(executorEvidenceDigest, 'mission executor evidence');
  const artifactBytes = Buffer.byteLength(canonicalJson(artifact), 'utf8');
  const artifactDigest = sha256Text(canonicalJson(artifact));
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-phase-result-v1',
    status: 'completed',
    phase: request.phase,
    round: request.round,
    requestDigest: request.requestDigest,
    executorDescriptorDigest: descriptor.descriptorDigest,
    artifactDigest,
    artifactBytes,
    usage: clone(usage),
    startedAt,
    completedAt,
    authorityExpanded: false,
  };
  if (executorEvidenceDigest !== null) unsigned.executorEvidenceDigest = executorEvidenceDigest;
  return deepFreeze({
    receipt: { ...unsigned, resultDigest: sha256Value(unsigned) },
    artifact: clone(artifact),
  });
}

export function verifyMissionPhaseResult(value, { request, descriptor } = {}) {
  assertSchema('mission-phase-result', value);
  exactKeys(value, ['artifact', 'receipt'], 'mission phase result');
  const receipt = value.receipt;
  const receiptKeys = [
    'artifactBytes',
    'artifactDigest',
    'authorityExpanded',
    'completedAt',
    'executorDescriptorDigest',
    'phase',
    'protocolId',
    'requestDigest',
    'resultDigest',
    'round',
    'schemaVersion',
    'startedAt',
    'status',
    'usage',
  ];
  if (Object.hasOwn(receipt, 'executorEvidenceDigest')) receiptKeys.push('executorEvidenceDigest');
  exactKeys(receipt, receiptKeys, 'mission phase result receipt');
  verifyMissionExecutorDescriptor(descriptor, request.phase);
  if (receipt.schemaVersion !== 1 || receipt.protocolId !== 'eternities-mission-phase-result-v1'
      || receipt.status !== 'completed' || receipt.phase !== request.phase || receipt.round !== request.round
      || receipt.requestDigest !== request.requestDigest
      || receipt.executorDescriptorDigest !== descriptor.descriptorDigest
      || receipt.authorityExpanded !== false) {
    fail('phase-result-invalid', 'mission phase result identity is invalid');
  }
  verifyMissionPhaseArtifact(value.artifact, request);
  if (Object.hasOwn(receipt, 'executorEvidenceDigest')) {
    requireDigest(receipt.executorEvidenceDigest, 'mission executor evidence');
  }
  verifyUsage(receipt.usage, request.maxCompletionTokens);
  requireIso(receipt.startedAt, 'mission phase start');
  requireIso(receipt.completedAt, 'mission phase completion');
  if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) {
    fail('phase-time-invalid', 'mission phase completed before it started');
  }
  const artifactJson = canonicalJson(value.artifact);
  if (receipt.artifactDigest !== sha256Text(artifactJson)
      || receipt.artifactBytes !== Buffer.byteLength(artifactJson, 'utf8')) {
    fail('artifact-digest-invalid', 'mission phase artifact digest or byte length mismatch');
  }
  const { resultDigest, ...unsigned } = receipt;
  requireDigest(resultDigest, 'mission phase result');
  if (sha256Value(unsigned) !== resultDigest) fail('phase-result-invalid', 'mission phase result digest mismatch');
  return value;
}

const verdictReasons = new Map([
  ['native-no-review', { disposition: 'accepted', reviews: 0, revision: false, accepted: true }],
  ['review-accepted', { disposition: 'accepted', reviews: 1, revision: false, accepted: true }],
  ['review-rejected', { disposition: 'rejected', reviews: 1, revision: false, accepted: false }],
  ['revision-review-accepted', { disposition: 'accepted', reviews: 2, revision: true, accepted: true }],
  ['revision-review-rejected', { disposition: 'rejected', reviews: 2, revision: true, accepted: false }],
  ['revision-budget-exhausted', { disposition: 'rejected', reviews: 2, revision: true, accepted: false }],
  ['budget-exhausted-before-review', { disposition: 'rejected', reviews: 0, revision: false, accepted: false }],
  ['budget-exhausted-before-revision', { disposition: 'rejected', reviews: 1, revision: false, accepted: false }],
  ['budget-exhausted-before-final-review', { disposition: 'rejected', reviews: 1, revision: true, accepted: false }],
]);

function verifyResultDigestList(values, label, expectedLength) {
  if (!Array.isArray(values) || values.length !== expectedLength) {
    fail('verdict-path-invalid', `${label} count is invalid for the verdict path`);
  }
  values.forEach((value, index) => requireDigest(value, `${label} ${index + 1}`));
  if (new Set(values).size !== values.length) fail('verdict-path-invalid', `${label} must be unique`);
  return values;
}

export function buildMissionVerdict({
  admission,
  disposition,
  reason,
  acceptedArtifactDigest,
  nativeResultDigest,
  reviewResultDigests,
  revisionResultDigest,
} = {}) {
  verifyMissionAdmission(admission);
  const rule = verdictReasons.get(reason);
  if (!rule || disposition !== rule.disposition) fail('verdict-path-invalid', 'mission verdict path is invalid');
  requireDigest(nativeResultDigest, 'mission native result');
  verifyResultDigestList(reviewResultDigests, 'mission review result', rule.reviews);
  if (rule.revision) requireDigest(revisionResultDigest, 'mission revision result');
  else if (revisionResultDigest !== null) fail('verdict-path-invalid', 'mission verdict has an unexpected revision result');
  if (rule.accepted) requireDigest(acceptedArtifactDigest, 'mission accepted artifact');
  else if (acceptedArtifactDigest !== null) fail('verdict-path-invalid', 'rejected mission cannot carry an accepted artifact');
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-verdict-v1',
    missionId: admission.mission.missionId,
    admissionDigest: admission.admissionDigest,
    disposition,
    reason,
    acceptedArtifactDigest,
    nativeResultDigest,
    reviewResultDigests: clone(reviewResultDigests),
    revisionResultDigest,
    authorityExpanded: false,
    realmEffects: 0,
  };
  return deepFreeze({ ...unsigned, verdictDigest: sha256Value(unsigned) });
}

export function verifyMissionVerdict(value, admission) {
  assertSchema('mission-verdict', value);
  verifyMissionAdmission(admission);
  exactKeys(value, [
    'acceptedArtifactDigest',
    'admissionDigest',
    'authorityExpanded',
    'disposition',
    'missionId',
    'nativeResultDigest',
    'protocolId',
    'realmEffects',
    'reason',
    'reviewResultDigests',
    'revisionResultDigest',
    'schemaVersion',
    'verdictDigest',
  ], 'mission verdict');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-verdict-v1'
      || value.missionId !== admission.mission.missionId
      || value.admissionDigest !== admission.admissionDigest
      || value.authorityExpanded !== false || value.realmEffects !== 0) {
    fail('verdict-authority-invalid', 'mission verdict identity or authority is invalid');
  }
  const rule = verdictReasons.get(value.reason);
  if (!rule || value.disposition !== rule.disposition) fail('verdict-path-invalid', 'mission verdict path is invalid');
  requireDigest(value.nativeResultDigest, 'mission native result');
  verifyResultDigestList(value.reviewResultDigests, 'mission review result', rule.reviews);
  if (rule.revision) requireDigest(value.revisionResultDigest, 'mission revision result');
  else if (value.revisionResultDigest !== null) fail('verdict-path-invalid', 'mission verdict has an unexpected revision result');
  if (rule.accepted) requireDigest(value.acceptedArtifactDigest, 'mission accepted artifact');
  else if (value.acceptedArtifactDigest !== null) fail('verdict-path-invalid', 'rejected mission cannot carry an accepted artifact');
  const { verdictDigest, ...unsigned } = value;
  requireDigest(verdictDigest, 'mission verdict');
  if (sha256Value(unsigned) !== verdictDigest) fail('verdict-digest-invalid', 'mission verdict digest mismatch');
  return value;
}

function verifyPhaseResults(value, verdict) {
  exactKeys(value, ['nativeResultDigest', 'reviewResultDigests', 'revisionResultDigest'], 'mission phase result set');
  requireDigest(value.nativeResultDigest, 'mission native result');
  if (!Array.isArray(value.reviewResultDigests)) fail('receipt-phase-invalid', 'mission review result set is invalid');
  value.reviewResultDigests.forEach((entry, index) => requireDigest(entry, `mission review result ${index + 1}`));
  if (new Set(value.reviewResultDigests).size !== value.reviewResultDigests.length) {
    fail('receipt-phase-invalid', 'mission review result set must be unique');
  }
  if (value.revisionResultDigest !== null) requireDigest(value.revisionResultDigest, 'mission revision result');
  if (value.nativeResultDigest !== verdict.nativeResultDigest
      || !same(value.reviewResultDigests, verdict.reviewResultDigests)
      || value.revisionResultDigest !== verdict.revisionResultDigest) {
    fail('receipt-phase-invalid', 'mission completion phase results do not match the verdict');
  }
  return value;
}

export function buildMissionCompletionReceipt({
  admission,
  transactionId,
  preCompletionJournalHeadDigest,
  verdict,
  phaseResults,
  usage,
  completedAt,
} = {}) {
  verifyMissionAdmission(admission);
  verifyMissionVerdict(verdict, admission);
  requireDigest(transactionId, 'mission review transaction');
  requireDigest(preCompletionJournalHeadDigest, 'pre-completion journal head');
  verifyPhaseResults(phaseResults, verdict);
  verifyUsage(usage, admission.budgets.totalCompletionTokens);
  requireIso(completedAt, 'mission completion');
  if (Date.parse(completedAt) < Date.parse(admission.admittedAt)) {
    fail('receipt-time-invalid', 'mission completed before admission');
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-review-completion-v1',
    status: 'completed',
    missionId: admission.mission.missionId,
    admissionDigest: admission.admissionDigest,
    transactionId,
    preCompletionJournalHeadDigest,
    verdictDigest: verdict.verdictDigest,
    disposition: verdict.disposition,
    acceptedArtifactDigest: verdict.acceptedArtifactDigest,
    phases: clone(phaseResults),
    usage: clone(usage),
    completedAt,
    authorityExpanded: false,
    realmEffects: 0,
  };
  return deepFreeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

export function verifyMissionCompletionReceipt(value, { admission, verdict } = {}) {
  assertSchema('mission-review-completion', value);
  verifyMissionAdmission(admission);
  verifyMissionVerdict(verdict, admission);
  exactKeys(value, [
    'acceptedArtifactDigest',
    'admissionDigest',
    'authorityExpanded',
    'completedAt',
    'disposition',
    'missionId',
    'phases',
    'preCompletionJournalHeadDigest',
    'protocolId',
    'realmEffects',
    'receiptDigest',
    'schemaVersion',
    'status',
    'transactionId',
    'usage',
    'verdictDigest',
  ], 'mission completion receipt');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-review-completion-v1'
      || value.status !== 'completed' || value.missionId !== admission.mission.missionId
      || value.admissionDigest !== admission.admissionDigest
      || value.verdictDigest !== verdict.verdictDigest
      || value.disposition !== verdict.disposition
      || value.acceptedArtifactDigest !== verdict.acceptedArtifactDigest
      || value.authorityExpanded !== false || value.realmEffects !== 0) {
    fail('receipt-authority-invalid', 'mission completion receipt identity or authority is invalid');
  }
  requireDigest(value.transactionId, 'mission review transaction');
  requireDigest(value.preCompletionJournalHeadDigest, 'pre-completion journal head');
  verifyPhaseResults(value.phases, verdict);
  verifyUsage(value.usage, admission.budgets.totalCompletionTokens);
  requireIso(value.completedAt, 'mission completion');
  if (Date.parse(value.completedAt) < Date.parse(admission.admittedAt)) {
    fail('receipt-time-invalid', 'mission completed before admission');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'mission completion receipt');
  if (sha256Value(unsigned) !== receiptDigest) fail('receipt-digest-invalid', 'mission completion receipt digest mismatch');
  return value;
}
