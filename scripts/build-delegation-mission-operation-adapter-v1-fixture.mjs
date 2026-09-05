import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  createBoundedDelegationCoordinator,
} from '../src/runtime/bounded-delegation.mjs';
import { createDelegationMissionOperationAdapter } from '../src/runtime/delegation-mission-operation-adapter.mjs';
import {
  buildMissionOperationRequest,
} from '../src/runtime/mission-operation-adapter.mjs';
import {
  MISSION_PROGRAM_PROTOCOL_ID,
  createMissionProgramCoordinator,
} from '../src/runtime/mission-program.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const outputPath = join(root, '..', 'fixtures', 'delegation-mission-operation-adapter-v1.json');
const fixedTime = '2026-09-05T18:00:00.000Z';
const fixedClock = () => fixedTime;
const workerProtocol = 'eternities-bounded-delegation-worker-v1';
const authorityCeilingDigest = sha256Value({
  realmEffects: 0,
  continuityWrites: 0,
  identityMutation: 0,
  evolution: 0,
  soul: 0,
});

function delegationInput(overrides = {}) {
  return {
    schemaVersion: 1,
    missionId: 'mission-delegation-operation-fixture',
    leadInstanceId: 'lead-delegation-operation-fixture',
    sourceEpoch: 3,
    authority: ['observe', 'propose'],
    excerpts: [
      { sourceRef: 'fixture:brief', provenance: 'fixture-lead', content: 'compare bounded worker observations' },
    ],
    assignments: [
      { workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 },
      { workerId: 'worker-b', role: 'critic', maxCompletionTokens: 80 },
    ],
    budget: { maxCompletionTokens: 200, maxResultBytes: 20_000 },
    ...overrides,
  };
}

function worker(workerId, { pending = false } = {}) {
  const calls = { reconcile: 0, execute: 0 };
  const completions = new Map();
  const state = { pending };
  return {
    workerId,
    descriptor: {
      schemaVersion: 1,
      protocolId: workerProtocol,
      adapterId: `fixture-${workerId}`,
      version: '1.0.0',
    },
    async reconcile({ dispatch }) {
      calls.reconcile += 1;
      if (state.pending) return { status: 'pending' };
      const completion = completions.get(dispatch.dispatchId);
      return completion ? { status: 'completed', completion } : { status: 'absent' };
    },
    async execute({ dispatch }) {
      calls.execute += 1;
      const completion = {
        schemaVersion: 1,
        protocolId: workerProtocol,
        delegationId: dispatch.delegationId,
        dispatchId: dispatch.dispatchId,
        dispatchDigest: dispatch.dispatchDigest,
        workerId,
        summary: `${workerId} fixture observation`,
        recommendations: [`retain-${workerId}`],
        risks: [],
        usage: {
          inputTokens: 20,
          cachedInputTokens: 5,
          reasoningTokens: 10,
          visibleOutputTokens: 8,
          completionTokens: 18,
        },
        startedAt: fixedTime,
        completedAt: fixedTime,
      };
      completions.set(dispatch.dispatchId, completion);
      return { status: 'completed', completion };
    },
    calls,
    state,
  };
}

function programInput(adapter, input) {
  const source = adapter.describeSource();
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'fixture-delegation-agent',
      identityDigest: sha256Value('delegation-identity'),
      genomeDigest: sha256Value('delegation-genome'),
      keelHeadDigest: sha256Value('delegation-keel'),
    },
    missionDigest: sha256Value('delegation-mission'),
    authorityCeilingDigest,
    budget: {
      maxCompletionTokens: input.budget.maxCompletionTokens,
      maxResultBytes: input.budget.maxResultBytes,
    },
    steps: [{
      stepId: 'delegation',
      stepIndex: 0,
      kind: 'delegation',
      inputDigest: source.delegationInputDigest,
      maxCompletionTokens: input.budget.maxCompletionTokens,
      maxResultBytes: input.budget.maxResultBytes,
    }],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

function dispatchFor(program, description, source) {
  const step = program.steps[0];
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: program.programId,
    dispatchId: sha256Value({
      programId: program.programId,
      stepId: step.stepId,
      stepIndex: step.stepIndex,
      inputDigest: step.inputDigest,
      descriptorDigest: description.missionStepDescriptor.descriptorDigest,
    }),
    stepId: step.stepId,
    stepIndex: step.stepIndex,
    kind: step.kind,
    inputDigest: source.delegationInputDigest,
    authorityCeilingDigest: program.authorityCeilingDigest,
    maxCompletionTokens: step.maxCompletionTokens,
    maxResultBytes: step.maxResultBytes,
    descriptorDigest: description.missionStepDescriptor.descriptorDigest,
  };
  return { ...unsigned, dispatchDigest: sha256Value(unsigned) };
}

async function makeAdapter(rootPath, input, workers, programId = sha256Value('delegation-program')) {
  const coordinator = createBoundedDelegationCoordinator({
    delegationRoot: join(rootPath, 'delegation'),
    workers,
    clock: () => Date.parse(fixedTime),
  });
  const adapter = await createDelegationMissionOperationAdapter({
    coordinator,
    delegationInput: input,
    programId,
    stepId: 'delegation',
    stepIndex: 0,
    authorityCeilingDigest,
    maxCompletionTokens: input.budget.maxCompletionTokens,
    maxResultBytes: input.budget.maxResultBytes,
    clock: fixedClock,
  });
  return { coordinator, adapter };
}

async function runSuccess(rootPath) {
  const workers = [worker('worker-b'), worker('worker-a')];
  const input = delegationInput();
  const { adapter } = await makeAdapter(rootPath, input, workers);
  const program = programInput(adapter, input);
  const programCoordinator = await createMissionProgramCoordinator({
    programRoot: join(rootPath, 'program'),
    adapters: [adapter],
    clock: fixedClock,
  });
  const first = await programCoordinator.execute(program);
  const retry = await programCoordinator.execute(program);
  const description = adapter.describe();
  const source = adapter.describeSource();
  const dispatch = dispatchFor(program, description, source);
  return {
    input,
    program,
    description,
    source,
    dispatch,
    request: buildMissionOperationRequest({ description, dispatch }),
    first: {
      status: first.status,
      aggregateDigest: first.aggregateDigest,
      completion: first.results[0].completion,
    },
    retry: { status: retry.status, aggregateDigest: retry.aggregateDigest },
    calls: workers.map(({ workerId, calls }) => ({ workerId, ...calls })),
  };
}

async function runPending(rootPath) {
  const pendingWorker = worker('worker-a', { pending: true });
  const input = delegationInput({
    assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
  });
  const { adapter } = await makeAdapter(rootPath, input, [pendingWorker]);
  const program = programInput(adapter, input);
  const programCoordinator = await createMissionProgramCoordinator({
    programRoot: join(rootPath, 'program'),
    adapters: [adapter],
    clock: fixedClock,
  });
  const first = await programCoordinator.execute(program);
  pendingWorker.state.pending = false;
  const second = await programCoordinator.execute(program);
  return {
    first: first.status,
    second: second.status,
    calls: pendingWorker.calls,
  };
}

async function runRecovery(rootPath) {
  const recoveringWorker = worker('worker-a');
  const input = delegationInput({
    missionId: 'mission-delegation-operation-recovery',
    assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
  });
  const { adapter } = await makeAdapter(rootPath, input, [recoveringWorker]);
  const program = programInput(adapter, input);
  let crashed = false;
  const crashing = await createMissionProgramCoordinator({
    programRoot: join(rootPath, 'program'),
    adapters: [adapter],
    clock: fixedClock,
    checkpoint: async ({ stage }) => {
      if (stage === 'after-step-execute-before-commit' && !crashed) {
        crashed = true;
        throw new Error('fixture mission boundary');
      }
    },
  });
  let failure;
  try {
    await crashing.execute(program);
  } catch (error) {
    failure = { name: error.name, message: error.message };
  }
  const { adapter: recoveredAdapter } = await makeAdapter(rootPath, input, [recoveringWorker], program.programId);
  const recovered = await (await createMissionProgramCoordinator({
    programRoot: join(rootPath, 'program'),
    adapters: [recoveredAdapter],
    clock: fixedClock,
  })).recover(program.programId);
  return {
    failure,
    recovered: recovered.status,
    calls: recoveringWorker.calls,
  };
}

export async function buildDelegationMissionOperationAdapterFixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'godagents-delegation-fixture-'));
  try {
    const [success, pending, recovery] = await Promise.all([
      runSuccess(join(workspace, 'success')),
      runPending(join(workspace, 'pending')),
      runRecovery(join(workspace, 'recovery')),
    ]);
    const projection = success.first.completion;
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-delegation-mission-operation-adapter-fixture-v1',
      description: success.description,
      sourceDescriptor: success.source,
      dispatch: success.dispatch,
      request: success.request,
      execution: {
        firstStatus: success.first.status,
        retryStatus: success.retry.status,
        workerCalls: success.calls,
        pendingFirstStatus: pending.first,
        pendingSecondStatus: pending.second,
        pendingCalls: pending.calls,
        recoveryStatus: recovery.recovered,
        recoveryCalls: recovery.calls,
      },
      projection: {
        resultDigest: projection.resultDigest,
        resultBytes: projection.resultBytes,
        usage: projection.usage,
        startedAt: projection.startedAt,
        completedAt: projection.completedAt,
      },
      assertions: {
        sourceBoundToDelegation: success.source.delegationId.length === 64
          && success.source.delegationInputDigest === sha256Value(success.input),
        inputDigestBound: success.request.inputDigest === success.source.delegationInputDigest,
        ceilingsBound: success.source.maxCompletionTokens === success.input.budget.maxCompletionTokens
          && success.source.maxResultBytes === success.input.budget.maxResultBytes,
        bodyFreeSourceDescriptor: !Object.hasOwn(success.source, 'excerpts')
          && !Object.hasOwn(success.source, 'delegationInput'),
        compactProjection: !Object.hasOwn(projection, 'results')
          && projection.resultBytes > 0,
        pendingPreserved: pending.first === 'pending' && pending.second === 'completed' && pending.calls.execute === 1,
        recoveryNoRedispatch: recovery.recovered === 'completed' && recovery.calls.execute === 1,
        terminalReplayStable: success.first.aggregateDigest === success.retry.aggregateDigest
          && success.calls.every(({ execute }) => execute === 1),
        authorityEmpty: success.description.authority.realmEffects === 0
          && success.description.authority.continuityWrites === 0
          && success.description.authority.identityMutation === 0
          && success.description.authority.evolution === 0
          && success.description.authority.soul === 0,
      },
    };
    return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await buildDelegationMissionOperationAdapterFixture();
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({ path: outputPath, fixtureDigest: fixture.fixtureDigest })}\n`);
}

const invoked = process.argv[1] ? new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href : '';
if (import.meta.url === invoked) await main();
