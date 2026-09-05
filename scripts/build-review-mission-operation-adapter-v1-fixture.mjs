import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
  buildMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createReviewMissionOperationAdapter } from '../src/runtime/review-mission-operation-adapter.mjs';
import { MISSION_PROGRAM_PROTOCOL_ID, createMissionProgramCoordinator } from '../src/runtime/mission-program.mjs';
import { buildReviewAdmission } from '../tests/helpers/mission-review-fixture.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = join(root, 'fixtures', 'review-mission-operation-adapter-v1.json');
const digest = (value) => sha256Text(String(value));
const clone = (value) => structuredClone(value);

function buildState() {
  const missionId = 'fixture-review-mission-operation-adapter';
  const admission = buildReviewAdmission(missionId);
  const subject = { schemaVersion: 1, artifactType: 'native', content: 'fixture review subject' };
  const descriptorValue = buildMissionExecutorDescriptor({
    executorId: 'fixture-review-operation-executor-v1',
    phase: 'review',
  });
  const subjectDigest = sha256Text(canonicalJson(subject));
  const request = buildMissionPhaseRequest({
    admission,
    phase: 'review',
    round: 1,
    descriptor: descriptorValue,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
      { role: 'subject', artifactDigest: subjectDigest },
    ],
    maxCompletionTokens: admission.budgets.reviewCompletionTokensPerRound,
  });
  const context = {
    admission,
    subject,
    deferredReviews: admission.godskills.deferredReviews,
    godskillsReceipt: admission.godskills.receipt,
    priorReview: null,
    revision: null,
  };
  const calls = [];
  const completions = new Map();
  const absent = new Set();
  const lastResult = { value: null };
  let liveDescriptor = clone(descriptorValue);
  const executor = {
    descriptor() {
      calls.push('descriptor');
      return clone(liveDescriptor);
    },
    async reconcile(phaseRequest, phaseContext) {
      calls.push({ method: 'reconcile', request: clone(phaseRequest), context: clone(phaseContext) });
      const completed = completions.get(phaseRequest.requestDigest);
      if (completed) return { status: 'completed', result: clone(completed) };
      absent.add(phaseRequest.requestDigest);
      return { status: 'absent' };
    },
    async execute(phaseRequest, phaseContext) {
      calls.push({ method: 'execute', request: clone(phaseRequest), context: clone(phaseContext) });
      if (!absent.delete(phaseRequest.requestDigest)) throw new Error('duplicate review execution');
      const result = buildMissionPhaseResult({
        request: phaseRequest,
        descriptor: descriptorValue,
        artifact: {
          schemaVersion: 1,
          artifactType: 'review',
          subjectDigest,
          recommendation: 'accept',
          findings: [],
          summary: 'fixture review accepted the subject',
        },
        usage: {
          inputTokens: 24,
          cachedInputTokens: 12,
          reasoningTokens: 4,
          visibleOutputTokens: 3,
          completionTokens: 7,
        },
        startedAt: '2026-09-05T12:00:00.000Z',
        completedAt: '2026-09-05T12:00:00.100Z',
      });
      completions.set(phaseRequest.requestDigest, result);
      lastResult.value = result;
      return clone(result);
    },
    drift() {
      liveDescriptor = buildMissionExecutorDescriptor({
        executorId: 'fixture-review-operation-executor-drifted-v1',
        phase: 'review',
      });
    },
  };
  return { admission, request, context, descriptorValue, executor, calls, lastResult };
}

function buildMissionInput({ request, admission }) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'fixture-review-operation-agent',
      identityDigest: digest('fixture-review-identity'),
      genomeDigest: digest('fixture-review-genome'),
      keelHeadDigest: digest('fixture-review-keel'),
    },
    missionDigest: digest('fixture-review-mission'),
    authorityCeilingDigest: admission.authorityCeilingDigest,
    budget: { maxCompletionTokens: 500, maxResultBytes: 4_096 },
    steps: [{
      stepId: 'review',
      stepIndex: 0,
      kind: 'review',
      inputDigest: request.requestDigest,
      maxCompletionTokens: request.maxCompletionTokens,
      maxResultBytes: 4_096,
    }],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

export async function buildReviewMissionOperationAdapterFixture() {
  const state = buildState();
  const input = buildMissionInput(state);
  const adapter = await createReviewMissionOperationAdapter({
    executor: state.executor,
    programId: input.programId,
    stepId: 'review',
    stepIndex: 0,
    authorityCeilingDigest: state.admission.authorityCeilingDigest,
    maxCompletionTokens: state.request.maxCompletionTokens,
    maxResultBytes: 4_096,
    phaseRequest: state.request,
    phaseContext: state.context,
  });
  const programRoot = await mkdtemp(join(tmpdir(), 'godagents-review-operation-fixture-'));
  try {
    const coordinator = await createMissionProgramCoordinator({
      programRoot,
      adapters: [adapter],
      clock: () => '2026-09-05T12:00:00.000Z',
    });
    const first = await coordinator.execute(input);
    const inspection = await coordinator.inspect(input.programId);
    const replay = await coordinator.execute(input);
    assert.equal(first.status, 'completed');
    assert.equal(inspection.status, 'completed');
    assert.equal(replay.status, 'completed');
    assert.equal(state.calls.filter((call) => call?.method === 'execute').length, 1);
    const phaseExecute = state.calls.find((call) => call?.method === 'execute');
    const sourceDescriptor = adapter.describeSource();
    const description = adapter.describe();
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-review-mission-operation-adapter-fixture-v1',
      description,
      sourceDescriptor,
      execution: {
        firstStatus: first.status,
        inspectionStatus: inspection.status,
        replayStatus: replay.status,
        executeCount: state.calls.filter((call) => call?.method === 'execute').length,
        phaseMethods: state.calls.filter((call) => call?.method).map((call) => call.method),
      },
      projection: {
        resultDigest: first.results[0].completion.resultDigest,
        resultBytes: first.results[0].completion.resultBytes,
        phaseResultDigest: state.lastResult.value.receipt.resultDigest,
        phaseArtifactBytes: state.lastResult.value.receipt.artifactBytes,
        usage: first.results[0].completion.usage,
        startedAt: first.results[0].completion.startedAt,
        completedAt: first.results[0].completion.completedAt,
      },
      assertions: {
        sourceBoundToPhase: sourceDescriptor.phaseRequestDigest === state.request.requestDigest
          && sourceDescriptor.executorDescriptorDigest === state.descriptorValue.descriptorDigest,
        contextDigestBound: sourceDescriptor.contextDigest === sha256Value(state.context),
        programStepBound: sourceDescriptor.programId === input.programId
          && sourceDescriptor.stepId === 'review'
          && sourceDescriptor.stepIndex === 0,
        authorityCeilingBound: sourceDescriptor.authorityCeilingDigest === state.admission.authorityCeilingDigest,
        ceilingsBound: sourceDescriptor.maxCompletionTokens === state.request.maxCompletionTokens
          && sourceDescriptor.maxResultBytes === 4_096,
        noBodiesInSourceDescriptor: !Object.hasOwn(sourceDescriptor, 'admission')
          && !Object.hasOwn(sourceDescriptor, 'subject')
          && !Object.hasOwn(sourceDescriptor, 'context')
          && !Object.hasOwn(sourceDescriptor, 'payload'),
        terminalReplayStable: state.calls.filter((call) => call?.method === 'execute').length === 1,
        phaseResultProjectionExact: first.results[0].completion.resultDigest === state.lastResult.value.receipt.resultDigest
          && first.results[0].completion.resultBytes === state.lastResult.value.receipt.artifactBytes,
        phaseContextBindingExact: phaseExecute?.request?.requestDigest === state.request.requestDigest
          && phaseExecute?.context?.admission?.admissionDigest === state.admission.admissionDigest,
      },
    };
    return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  } finally {
    await rm(programRoot, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await buildReviewMissionOperationAdapterFixture();
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    path: outputPath,
    fixtureDigest: fixture.fixtureDigest,
    bytes: Buffer.byteLength(`${canonicalJson(fixture)}\n`, 'utf8'),
    status: 'built',
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
