import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionOperationRequest,
} from '../src/runtime/mission-operation-adapter.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
  buildMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createRevisionMissionOperationAdapter } from '../src/runtime/revision-mission-operation-adapter.mjs';
import { MISSION_PROGRAM_PROTOCOL_ID } from '../src/runtime/mission-program.mjs';
import { buildReviewAdmission } from '../tests/helpers/mission-review-fixture.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const outputPath = join(root, '..', 'fixtures', 'revision-mission-operation-adapter-v1.json');
const clone = (value) => structuredClone(value);
const digest = (value) => sha256Text(String(value));

function buildDispatch(input, description) {
  const step = input.steps[0];
  const dispatchId = sha256Value({
    programId: input.programId,
    stepId: step.stepId,
    stepIndex: step.stepIndex,
    inputDigest: step.inputDigest,
    descriptorDigest: description.missionStepDescriptor.descriptorDigest,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: input.programId,
    dispatchId,
    stepId: step.stepId,
    stepIndex: step.stepIndex,
    kind: step.kind,
    inputDigest: step.inputDigest,
    authorityCeilingDigest: input.authorityCeilingDigest,
    maxCompletionTokens: step.maxCompletionTokens,
    maxResultBytes: step.maxResultBytes,
    descriptorDigest: description.missionStepDescriptor.descriptorDigest,
  };
  return { ...unsigned, dispatchDigest: sha256Value(unsigned) };
}

export async function buildRevisionMissionOperationAdapterFixture() {
  const admission = buildReviewAdmission('fixture-revision-mission-operation-adapter');
  const native = { schemaVersion: 1, artifactType: 'native', content: 'fixture native artifact' };
  const review = {
    schemaVersion: 1,
    artifactType: 'review',
    subjectDigest: sha256Text(canonicalJson(native)),
    recommendation: 'revise',
    findings: [{ id: 'correct-facts', severity: 'important', required: true, message: 'correct the evidence linkage' }],
    summary: 'fixture requires one bounded repair',
  };
  const executorDescriptor = buildMissionExecutorDescriptor({
    executorId: 'fixture-revision-executor-v1',
    phase: 'revision',
  });
  const phaseRequest = buildMissionPhaseRequest({
    admission,
    phase: 'revision',
    round: 1,
    descriptor: executorDescriptor,
    inputs: [
      { role: 'native', artifactDigest: sha256Text(canonicalJson(native)) },
      { role: 'review', artifactDigest: sha256Text(canonicalJson(review)) },
    ],
    maxCompletionTokens: admission.budgets.revisionCompletionTokens,
  });
  const phaseContext = { admission, native, review };
  const calls = [];
  let absent = false;
  let completed = null;
  const executor = {
    descriptor() {
      calls.push('descriptor');
      return clone(executorDescriptor);
    },
    async reconcile(request) {
      calls.push('reconcile');
      return completed
        ? { status: 'completed', result: clone(completed) }
        : { status: 'absent' };
    },
    async execute(request) {
      calls.push('execute');
      if (!absent) throw new Error('absent reconciliation required');
      const artifact = {
        schemaVersion: 1,
        artifactType: 'revision',
        nativeArtifactDigest: sha256Text(canonicalJson(native)),
        reviewArtifactDigest: sha256Text(canonicalJson(review)),
        addressedFindingIds: ['correct-facts'],
        content: 'fixture revised artifact',
      };
      completed = buildMissionPhaseResult({
        request,
        descriptor: executorDescriptor,
        artifact,
        usage: {
          inputTokens: 30,
          cachedInputTokens: 10,
          reasoningTokens: 5,
          visibleOutputTokens: 4,
          completionTokens: 9,
        },
        startedAt: '2026-09-05T12:00:00.000Z',
        completedAt: '2026-09-05T12:00:00.100Z',
      });
      return clone(completed);
    },
  };
  const programUnsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'fixture-revision-agent',
      identityDigest: digest('revision-identity'),
      genomeDigest: digest('revision-genome'),
      keelHeadDigest: digest('revision-keel'),
    },
    missionDigest: digest('revision-operation-mission'),
    authorityCeilingDigest: admission.authorityCeilingDigest,
    budget: { maxCompletionTokens: phaseRequest.maxCompletionTokens, maxResultBytes: 4_096 },
    steps: [{
      stepId: 'revision',
      stepIndex: 0,
      kind: 'revision',
      inputDigest: phaseRequest.requestDigest,
      maxCompletionTokens: phaseRequest.maxCompletionTokens,
      maxResultBytes: 4_096,
    }],
  };
  const programId = sha256Value(programUnsigned);
  const adapter = await createRevisionMissionOperationAdapter({
    executor,
    programId,
    stepId: 'revision',
    stepIndex: 0,
    authorityCeilingDigest: admission.authorityCeilingDigest,
    maxCompletionTokens: phaseRequest.maxCompletionTokens,
    maxResultBytes: 4_096,
    phaseRequest,
    phaseContext,
  });
  const description = adapter.describe();
  const input = { ...programUnsigned, programId };
  const dispatch = buildDispatch(input, description);
  const operationRequest = buildMissionOperationRequest({ description, dispatch });
  const absentOutcome = await adapter.reconcile({ dispatch });
  absent = true;
  const first = await adapter.execute({ dispatch });
  const recovered = await adapter.reconcile({ dispatch });
  const sourceDescriptor = adapter.describeSource();
  const fixture = {
    schemaVersion: 1,
    protocolId: 'eternities-revision-mission-operation-adapter-fixture-v1',
    description,
    sourceDescriptor,
    dispatch,
    request: operationRequest,
    assertions: {
      authorityCeilingBound: description.authority.realmEffects === 0
        && sourceDescriptor.authorityCeilingDigest === admission.authorityCeilingDigest,
      contextDigestBound: sourceDescriptor.contextDigest === sha256Value(phaseContext),
      noBodiesInSourceDescriptor: !('native' in sourceDescriptor) && !('review' in sourceDescriptor),
      phaseContextBindingExact: sourceDescriptor.phaseRequestDigest === phaseRequest.requestDigest,
      phaseResultProjectionExact: first.completion.resultDigest === completed.receipt.resultDigest
        && first.completion.resultBytes === completed.receipt.artifactBytes
        && first.completion.usage.completionTokens === completed.receipt.usage.completionTokens,
      programStepBound: first.completion.programId === programId
        && first.completion.stepId === 'revision'
        && first.completion.dispatchDigest === dispatch.dispatchDigest,
      sourceBoundToPhase: sourceDescriptor.phase === 'revision'
        && sourceDescriptor.executorDescriptorDigest === executorDescriptor.descriptorDigest,
      terminalReplayStable: recovered.status === 'completed'
        && canonicalJson(recovered.completion) === canonicalJson(first.completion),
    },
    execution: {
      executeCount: calls.filter((type) => type === 'execute').length,
      phaseMethods: calls.filter((type) => type === 'reconcile' || type === 'execute'),
      firstStatus: first.status,
      inspectionStatus: absentOutcome.status,
      replayStatus: recovered.status,
    },
    projection: {
      phaseResultDigest: completed.receipt.resultDigest,
      resultDigest: first.completion.resultDigest,
      resultBytes: first.completion.resultBytes,
      usage: first.completion.usage,
      startedAt: first.completion.startedAt,
      completedAt: first.completion.completedAt,
    },
  };
  return { ...fixture, fixtureDigest: sha256Value(fixture) };
}

async function main() {
  const fixture = await buildRevisionMissionOperationAdapterFixture();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({ path: outputPath, fixtureDigest: fixture.fixtureDigest })}\n`);
}

const invoked = process.argv[1] ? new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href : '';
if (import.meta.url === invoked) await main();
