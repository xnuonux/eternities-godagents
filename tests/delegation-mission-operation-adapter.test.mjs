import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { createBoundedDelegationCoordinator } from '../src/runtime/bounded-delegation.mjs';
import { createDelegationMissionOperationAdapter } from '../src/runtime/delegation-mission-operation-adapter.mjs';
import { MISSION_PROGRAM_PROTOCOL_ID, createMissionProgramCoordinator } from '../src/runtime/mission-program.mjs';

const WORKER_PROTOCOL_ID = 'eternities-bounded-delegation-worker-v1';
const FIXED_TIME = '2026-09-05T18:00:00.000Z';
const FIXED_CLOCK = () => FIXED_TIME;

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    missionId: 'mission-delegation-adapter-fixture',
    leadInstanceId: 'lead-delegation-adapter-fixture',
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
  const adapter = {
    workerId,
    descriptor: {
      schemaVersion: 1,
      protocolId: WORKER_PROTOCOL_ID,
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
        protocolId: WORKER_PROTOCOL_ID,
        delegationId: dispatch.delegationId,
        dispatchId: dispatch.dispatchId,
        dispatchDigest: dispatch.dispatchDigest,
        workerId,
        summary: `${workerId} bounded observation`,
        recommendations: [`retain-${workerId}`],
        risks: [],
        usage: {
          inputTokens: 20,
          cachedInputTokens: 5,
          reasoningTokens: 10,
          visibleOutputTokens: 8,
          completionTokens: 18,
        },
        startedAt: FIXED_TIME,
        completedAt: FIXED_TIME,
      };
      completions.set(dispatch.dispatchId, completion);
      return { status: 'completed', completion };
    },
    calls,
    state,
  };
  return adapter;
}

async function withRoot(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'godagents-delegation-operation-'));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function programInput(adapter, delegationInput) {
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
    authorityCeilingDigest: sha256Value({ realmEffects: 0, continuityWrites: 0, identityMutation: 0, evolution: 0, soul: 0 }),
    budget: {
      maxCompletionTokens: delegationInput.budget.maxCompletionTokens,
      maxResultBytes: delegationInput.budget.maxResultBytes,
    },
    steps: [{
      stepId: 'delegation',
      stepIndex: 0,
      kind: 'delegation',
      inputDigest: source.delegationInputDigest,
      maxCompletionTokens: delegationInput.budget.maxCompletionTokens,
      maxResultBytes: delegationInput.budget.maxResultBytes,
    }],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

async function createAdapter(root, delegationInput, workers, overrides = {}) {
  const bounded = createBoundedDelegationCoordinator({
    delegationRoot: path.join(root, 'delegation'),
    workers,
    clock: () => Date.parse(FIXED_TIME),
  });
  const adapter = await createDelegationMissionOperationAdapter({
    coordinator: bounded,
    delegationInput,
    programId: overrides.programId ?? sha256Value('delegation-program'),
    stepId: 'delegation',
    stepIndex: 0,
    authorityCeilingDigest: overrides.authorityCeilingDigest
      ?? sha256Value({ realmEffects: 0, continuityWrites: 0, identityMutation: 0, evolution: 0, soul: 0 }),
    maxCompletionTokens: overrides.maxCompletionTokens ?? delegationInput.budget.maxCompletionTokens,
    maxResultBytes: overrides.maxResultBytes ?? delegationInput.budget.maxResultBytes,
    clock: FIXED_CLOCK,
  });
  return { adapter, bounded };
}

test('binds one bounded delegation input to a body-free mission operation and compact projection', async () => {
  await withRoot(async (root) => {
    const workers = [worker('worker-b'), worker('worker-a')];
    const delegationInput = input();
    const { adapter } = await createAdapter(root, delegationInput, workers);
    const source = adapter.describeSource();
    assert.equal(source.protocolId, 'eternities-bounded-delegation-mission-operation-source-v1');
    assert.equal(source.delegationInputDigest, sha256Value(delegationInput));
    assert.deepEqual(source.workerIds, ['worker-a', 'worker-b']);
    assert.equal(Object.hasOwn(source, 'excerpts'), false);
    assert.equal(Object.hasOwn(source, 'delegationInput'), false);
    const program = programInput(adapter, delegationInput);
    const result = await (await createMissionProgramCoordinator({
      programRoot: path.join(root, 'program'),
      adapters: [adapter],
      clock: FIXED_CLOCK,
    })).execute(program);
    assert.equal(result.status, 'completed');
    assert.equal(result.results[0].completion.kind, 'delegation');
    assert.equal(result.results[0].completion.resultBytes > 0, true);
    assert.equal(result.results[0].completion.usage.completionTokens, 36);
    assert.deepEqual(workers.map(({ workerId }) => workerId).sort(), ['worker-a', 'worker-b']);
  });
});

test('mission-program replay does not redispatch a completed delegation', async () => {
  await withRoot(async (root) => {
    const workers = [worker('worker-a'), worker('worker-b')];
    const delegationInput = input();
    const { adapter } = await createAdapter(root, delegationInput, workers);
    const program = programInput(adapter, delegationInput);
    const coordinator = await createMissionProgramCoordinator({
      programRoot: path.join(root, 'program'),
      adapters: [adapter],
      clock: FIXED_CLOCK,
    });
    const first = await coordinator.execute(program);
    const second = await coordinator.execute(program);
    assert.equal(first.aggregateDigest, second.aggregateDigest);
    assert.deepEqual(workers.map(({ calls }) => calls.execute), [1, 1]);
  });
});

test('pending bounded delegation remains pending until workers become available', async () => {
  await withRoot(async (root) => {
    const pendingWorker = worker('worker-a', { pending: true });
    const delegationInput = input({ assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }] });
    const { adapter } = await createAdapter(root, delegationInput, [pendingWorker]);
    const program = programInput(adapter, delegationInput);
    const coordinator = await createMissionProgramCoordinator({
      programRoot: path.join(root, 'program'),
      adapters: [adapter],
      clock: FIXED_CLOCK,
    });
    assert.equal((await coordinator.execute(program)).status, 'pending');
    assert.equal(pendingWorker.calls.execute, 0);
    pendingWorker.state.pending = false;
    assert.equal((await coordinator.execute(program)).status, 'completed');
    assert.equal(pendingWorker.calls.execute, 1);
  });
});

test('source descriptor drift fails closed before bounded delegation work', async () => {
  await withRoot(async (root) => {
    const drifting = worker('worker-a');
    const delegationInput = input({ assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }] });
    const { adapter } = await createAdapter(root, delegationInput, [drifting]);
    drifting.descriptor = { ...drifting.descriptor, version: '2.0.0' };
    await assert.rejects(
      () => createMissionProgramCoordinator({
        programRoot: path.join(root, 'program'),
        adapters: [adapter],
        clock: FIXED_CLOCK,
      }).then((coordinator) => coordinator.execute(programInput(adapter, delegationInput))),
      /mission program reconcile failed/i,
    );
    assert.equal(drifting.calls.execute, 0);
  });
});

test('recovery after mission completion projection does not redispatch workers', async () => {
  await withRoot(async (root) => {
    const workers = [worker('worker-a')];
    const delegationInput = input({ assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }] });
    const { adapter } = await createAdapter(root, delegationInput, workers);
    const program = programInput(adapter, delegationInput);
    let crashed = false;
    const crashing = await createMissionProgramCoordinator({
      programRoot: path.join(root, 'program'),
      adapters: [adapter],
      clock: FIXED_CLOCK,
      checkpoint: async ({ stage }) => {
        if (stage === 'after-step-execute-before-commit' && !crashed) {
          crashed = true;
          throw new Error('fixture mission boundary');
        }
      },
    });
    await assert.rejects(() => crashing.execute(program), /fixture mission boundary/);
    const recovered = await (await createMissionProgramCoordinator({
      programRoot: path.join(root, 'program'),
      adapters: [adapter],
      clock: FIXED_CLOCK,
    })).recover(program.programId);
    assert.equal(recovered.status, 'completed');
    assert.equal(workers[0].calls.execute, 1);
  });
});

test('construction rejects delegation ceilings wider than the mission operation', async () => {
  await withRoot(async (root) => {
    const delegationInput = input();
    await assert.rejects(
      () => createAdapter(root, delegationInput, [worker('worker-a'), worker('worker-b')], {
        maxCompletionTokens: delegationInput.budget.maxCompletionTokens - 1,
      }),
      /ceiling|budget|mismatch/i,
    );
  });
});
