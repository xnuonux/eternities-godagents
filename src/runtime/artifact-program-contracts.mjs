import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { deepFreeze } from '../creation/contracts.mjs';
import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { verifyIdentityHostRequest } from '../host/admitted-sealed-identity-launch.mjs';
import { prepareLocalArtifactEffectRequest } from '../host/structured-effect-producer.mjs';
import { verifyMissionPhaseArtifact } from './mission-phase-contracts.mjs';

const protocolId = 'eternities-dependent-artifact-program-v1';
const resolutionProtocolId = 'eternities-artifact-program-step-resolution-v1';
const kind = 'artifact-mission';
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const bytes = value => Buffer.byteLength(canonicalJson(value), 'utf8');
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const sourceFields = ['workflowManifestDigest', 'identityPolicyDigest', 'providerPolicyDigest', 'realmBindingDigest',
  'producerDescriptorDigest', 'genesisId', 'keelId', 'creationBuildId', 'distributionBuildId', 'admissionReceiptDigest', 'actor'];

function requireValue(condition, message) { if (!condition) throw new TypeError(`artifact program ${message}`); }
function exact(value, fields, label) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value)
    && same(Object.keys(value).sort(), [...fields].sort()), `${label} fields are invalid`);
}
function integer(value, minimum, maximum, label) {
  requireValue(Number.isSafeInteger(value) && value >= minimum && value <= maximum, `${label} ceiling is invalid`);
}
function text(value, maximum, label, minimum = 1) {
  requireValue(typeof value === 'string' && value.length >= minimum && value.length <= maximum && !value.includes('\0'), `${label} is invalid`);
}
function id(value, label) { requireValue(typeof value === 'string' && identifier.test(value), `${label} is invalid`); }
function digest(value, label) { requireValue(typeof value === 'string' && digestPattern.test(value), `${label} digest is invalid`); }
function timestamp(value) {
  requireValue(typeof value === 'string' && value.length === 24 && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value, 'timestamp is invalid');
}
function safe(value) {
  const copy = structuredClone(value);
  assertNoCredentialFields(copy);
  requireValue(bytes(copy) <= 1_048_576, 'record exceeds byte ceiling');
  return copy;
}
function validateSource(source, policy) {
  exact(source, sourceFields, 'source binding');
  for (const field of sourceFields.filter(field => !['actor', 'genesisId', 'keelId'].includes(field))) digest(source[field], field);
  id(source.genesisId, 'genesis id'); id(source.keelId, 'keel id');
  exact(source.actor, ['instanceId', 'identityDigest', 'genomeDigest', 'keelHeadDigest'], 'actor');
  id(source.actor.instanceId, 'instance id');
  for (const field of ['identityDigest', 'genomeDigest', 'keelHeadDigest']) digest(source.actor[field], field);
  assertSchema('identity-host-policy-v2', policy);
  requireValue(source.identityPolicyDigest === sha256Value(policy), 'identity policy binding differs');
  requireValue(source.producerDescriptorDigest === policy.runtime.effectProducerDescriptorDigest, 'producer binding differs');
  requireValue(source.actor.instanceId === policy.runtime.instanceId, 'actor binding differs');
}
function contextFor(definition, predecessors) {
  const context = { context: definition.context, predecessors };
  requireValue(bytes(context) <= definition.maxContextBytes, 'context exceeds UTF-8 byte ceiling');
  return context;
}
function requestFor({ baseRequest, policy, recipe, programId, context, evidenceDigests }) {
  const request = structuredClone(baseRequest);
  const suffix = sha256Value({ programId, stepId: recipe.stepId });
  request.task.taskId = `artifact-program:${suffix}`;
  request.mission = { missionId: `artifact-step:${suffix}`, objective: recipe.objective,
    successEvidence: structuredClone(recipe.successEvidence), stopConditions: structuredClone(recipe.stopConditions) };
  request.observation = { observationId: `artifact-context:${suffix}`, summary: canonicalJson(context),
    evidenceDigests: [...new Set(evidenceDigests)].sort((a, b) => a.localeCompare(b)) };
  request.budgets.nativeCompletionTokens = recipe.maxCompletionTokens;
  request.budgets.totalCompletionTokens = recipe.maxCompletionTokens;
  request.budgets.maxArtifactBytes = recipe.maxArtifactBytes;
  delete request.effectAssessment;
  return verifyIdentityHostRequest(policy, prepareLocalArtifactEffectRequest(request,
    { expectedProducerDescriptorDigest: policy.runtime.effectProducerDescriptorDigest }));
}

// Pure consistency contracts only. The workflow owner must authenticate the
// source and query/reconcile real committed predecessors before using these.
// A self-hashed program or resolution is never execution/admission authority.
export function compileArtifactProgram(options) {
  exact(options, ['definition', 'sourceBinding', 'baseRequest', 'policy'], 'compiler input');
  const { definition, sourceBinding, baseRequest, policy } = safe(options);
  validateSource(sourceBinding, policy);
  verifyIdentityHostRequest(policy, baseRequest);
  requireValue(baseRequest.schemaVersion === 2 && baseRequest.routeMode === 'effect-only', 'base request is not native-only');
  exact(definition, ['schemaVersion', 'context', 'maxContextBytes', 'budget', 'steps'], 'definition');
  requireValue(definition.schemaVersion === 1, 'definition version is unsupported');
  text(definition.context, 4096, 'context', 0);
  integer(definition.maxContextBytes, 1, 4096, 'context');
  exact(definition.budget, ['maxCompletionTokens', 'maxResultBytes'], 'budget');
  integer(definition.budget.maxCompletionTokens, 1, policy.runtime.limits.totalCompletionTokens, 'completion budget');
  integer(definition.budget.maxResultBytes, 1, 16_777_216, 'publication budget');
  requireValue(Array.isArray(definition.steps) && definition.steps.length >= 1 && definition.steps.length <= 8, 'step count is invalid');
  const seen = new Map();
  let completionTotal = 0, publicationTotal = 0;
  for (const [index, step] of definition.steps.entries()) {
    exact(step, ['stepId', 'objective', 'successEvidence', 'stopConditions', 'maxCompletionTokens', 'maxArtifactBytes', 'predecessors'], 'step');
    id(step.stepId, 'step id'); requireValue(!seen.has(step.stepId), 'step id is duplicated');
    text(step.objective, 4096, 'objective');
    integer(step.maxCompletionTokens, 1, policy.runtime.limits.nativeCompletionTokens, 'step completion');
    integer(step.maxArtifactBytes, 1, Math.min(policy.runtime.limits.maxArtifactBytes, 16_777_215), 'step artifact');
    completionTotal += step.maxCompletionTokens; publicationTotal += step.maxArtifactBytes + 1;
    requireValue(completionTotal <= definition.budget.maxCompletionTokens, 'step completion reservations exceed budget');
    requireValue(publicationTotal <= definition.budget.maxResultBytes, 'step publication reservations exceed budget');
    requireValue(Array.isArray(step.predecessors) && step.predecessors.length <= 7, 'predecessors are invalid');
    let previousIndex = -1;
    for (const reference of step.predecessors) {
      exact(reference, ['stepId', 'projection'], 'predecessor reference'); id(reference.stepId, 'predecessor id');
      const parentIndex = seen.get(reference.stepId);
      requireValue(parentIndex !== undefined && parentIndex > previousIndex, 'predecessor must be a unique ordered backward reference');
      requireValue(['content', 'digest'].includes(reference.projection), 'predecessor projection is unsupported');
      previousIndex = parentIndex;
    }
    seen.set(step.stepId, index);
  }
  const sourceBindingDigest = sha256Value(sourceBinding);
  const baseRequestDigest = sha256Value(baseRequest);
  const unsignedInput = { schemaVersion: 1, protocolId: 'eternities-long-horizon-mission-program-v1',
    actor: structuredClone(sourceBinding.actor), missionDigest: sha256Value({ definition, sourceBindingDigest, baseRequestDigest }),
    authorityCeilingDigest: sha256Value({ hostCeiling: baseRequest.hostCeiling, requestedAuthority: baseRequest.requestedAuthority }),
    budget: structuredClone(definition.budget), steps: definition.steps.map((recipe, stepIndex) => ({
      stepId: recipe.stepId, stepIndex, kind,
      inputDigest: sha256Value({ sourceBindingDigest, baseRequestDigest, context: definition.context,
        maxContextBytes: definition.maxContextBytes, stepIndex, recipe }),
      maxCompletionTokens: recipe.maxCompletionTokens, maxResultBytes: recipe.maxArtifactBytes + 1,
    })) };
  const programInput = { ...unsignedInput, programId: sha256Value(unsignedInput) };
  assertSchema('mission-program-input', programInput);
  // Validate every declared mission against the existing host contract before
  // admission; unknown predecessor bytes are resolved later, never fabricated.
  const context = contextFor(definition, []);
  for (const recipe of definition.steps) requestFor({ baseRequest, policy, recipe,
    programId: programInput.programId, context, evidenceDigests: [] });
  const unsigned = { schemaVersion: 1, protocolId, definition, sourceBinding,
    baseRequestDigest, programInput };
  return deepFreeze({ ...unsigned, programDigest: sha256Value(unsigned) });
}

export function verifyArtifactProgram(value, { sourceBinding, baseRequest, policy }) {
  const program = safe(value);
  const expected = compileArtifactProgram({ definition: program.definition, sourceBinding, baseRequest, policy });
  requireValue(same(program, expected), 'compiled binding differs');
  return expected;
}

function predecessorProjection(evidence, reference, program, resolvedAt) {
  exact(evidence, ['stepId', 'programCompletion', 'missionReceiptDigest', 'artifact'], 'predecessor evidence');
  requireValue(evidence.stepId === reference.stepId, 'predecessor evidence order differs');
  digest(evidence.missionReceiptDigest, 'mission receipt');
  const index = program.definition.steps.findIndex(step => step.stepId === reference.stepId);
  const admitted = program.programInput.steps[index];
  const completion = evidence.programCompletion;
  assertSchema('mission-program-completion', completion);
  const { completionDigest, ...unsigned } = completion;
  requireValue(completionDigest === sha256Value(unsigned), 'predecessor completion digest differs');
  requireValue(completion.programId === program.programInput.programId && completion.stepId === reference.stepId
    && completion.stepIndex === index && completion.kind === kind, 'predecessor program binding differs');
  verifyMissionPhaseArtifact(evidence.artifact, { phase: 'native' });
  const artifactDigest = sha256Value(evidence.artifact), artifactBytes = bytes(evidence.artifact) + 1;
  requireValue(completion.resultDigest === artifactDigest && completion.resultBytes === artifactBytes
    && artifactBytes <= admitted.maxResultBytes, 'predecessor artifact binding or publication bytes differ');
  const usage = completion.usage;
  requireValue(usage.completionTokens === usage.reasoningTokens + usage.visibleOutputTokens
    && usage.cachedInputTokens <= usage.inputTokens && usage.completionTokens <= admitted.maxCompletionTokens,
  'predecessor usage exceeds its ceiling');
  timestamp(completion.startedAt); timestamp(completion.completedAt);
  requireValue(completion.startedAt <= completion.completedAt && completion.completedAt <= resolvedAt, 'predecessor time is invalid');
  return { stepId: reference.stepId, projection: reference.projection, programCompletionDigest: completionDigest,
    missionReceiptDigest: evidence.missionReceiptDigest, artifactDigest, artifactBytes,
    ...(reference.projection === 'content' ? { content: evidence.artifact.content } : {}) };
}

export function materializeArtifactProgramStep(options) {
  exact(options, ['program', 'stepId', 'baseRequest', 'policy', 'predecessors', 'resolvedAt'], 'resolution input');
  const { program: supplied, stepId, baseRequest, policy, predecessors: evidence, resolvedAt } = safe(options);
  const program = verifyArtifactProgram(supplied, { sourceBinding: supplied.sourceBinding, baseRequest, policy });
  timestamp(resolvedAt); id(stepId, 'step id');
  const stepIndex = program.definition.steps.findIndex(step => step.stepId === stepId);
  requireValue(stepIndex >= 0, 'step is missing');
  const recipe = program.definition.steps[stepIndex];
  requireValue(Array.isArray(evidence) && evidence.length === recipe.predecessors.length, 'predecessor evidence is missing or extra');
  const predecessors = recipe.predecessors.map((reference, index) => predecessorProjection(evidence[index], reference, program, resolvedAt));
  const context = contextFor(program.definition, predecessors);
  const request = requestFor({ baseRequest, policy, recipe, programId: program.programInput.programId, context,
    evidenceDigests: [program.programDigest, ...predecessors.flatMap(parent =>
      [parent.programCompletionDigest, parent.missionReceiptDigest, parent.artifactDigest])] });
  const unsigned = { schemaVersion: 1, protocolId: resolutionProtocolId, programId: program.programInput.programId,
    stepId, stepIndex, recipeDigest: program.programInput.steps[stepIndex].inputDigest,
    sourceBindingDigest: sha256Value(program.sourceBinding), predecessors, request,
    requestDigest: sha256Value(request), resolvedAt };
  const result = { ...unsigned, resolutionDigest: sha256Value(unsigned) };
  return deepFreeze(safe(result));
}

export function verifyArtifactProgramResolution(value, context) {
  const resolution = safe(value);
  const expected = materializeArtifactProgramStep({ ...context, resolvedAt: resolution.resolvedAt });
  requireValue(same(resolution, expected), 'resolution binding differs');
  return expected;
}
