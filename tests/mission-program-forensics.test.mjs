import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import {
  MISSION_PROGRAM_FORENSICS_PROTOCOL_ID,
  MISSION_PROGRAM_PROTOCOL_ID,
  createMissionProgramCoordinator,
} from '../src/runtime/mission-program.mjs';

const STEP_PROTOCOL_ID = 'eternities-mission-program-step-adapter-v1';
const fixedTime = '2026-09-05T10:00:00.000Z';
const digest = (value) => sha256Value(String(value));

function input() {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'instance-1',
      identityDigest: digest('identity'),
      genomeDigest: digest('genome'),
      keelHeadDigest: digest('keel'),
    },
    missionDigest: digest('mission'),
    authorityCeilingDigest: digest('authority'),
    budget: { maxCompletionTokens: 100, maxResultBytes: 20_000 },
    steps: [
      { stepId: 'step-a', stepIndex: 0, kind: 'analysis', inputDigest: digest('input-a'), maxCompletionTokens: 40, maxResultBytes: 8_000 },
      { stepId: 'step-b', stepIndex: 1, kind: 'synthesis', inputDigest: digest('input-b'), maxCompletionTokens: 40, maxResultBytes: 8_000 },
    ],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

function descriptor(kind) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: STEP_PROTOCOL_ID,
    kind,
    adapterId: `fixture-${kind}`,
    adapterVersion: '1.0.0',
    authority: { realmEffects: 0, continuityWrites: 0, identityMutation: 0, evolution: 0, soul: 0 },
  };
  return { ...unsigned, descriptorDigest: sha256Value(unsigned) };
}

function completion(dispatch) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: dispatch.programId,
    stepId: dispatch.stepId,
    stepIndex: dispatch.stepIndex,
    kind: dispatch.kind,
    dispatchId: dispatch.dispatchId,
    dispatchDigest: dispatch.dispatchDigest,
    resultDigest: digest(`result-${dispatch.stepId}`),
    resultBytes: 120,
    usage: { inputTokens: 12, cachedInputTokens: 4, reasoningTokens: 6, visibleOutputTokens: 4, completionTokens: 10 },
    startedAt: fixedTime,
    completedAt: fixedTime,
  };
  return { ...unsigned, completionDigest: sha256Value(unsigned) };
}

function adapter(kind, { pending = false } = {}) {
  const currentDescriptor = descriptor(kind);
  const calls = { descriptor: 0, reconcile: 0, execute: 0 };
  const completed = new Map();
  return {
    descriptor() {
      calls.descriptor += 1;
      return currentDescriptor;
    },
    async reconcile({ dispatch }) {
      calls.reconcile += 1;
      if (pending) return { status: 'pending' };
      const value = completed.get(dispatch.dispatchId);
      return value ? { status: 'completed', completion: value } : { status: 'absent' };
    },
    async execute({ dispatch }) {
      calls.execute += 1;
      const value = completion(dispatch);
      completed.set(dispatch.dispatchId, value);
      return { status: 'completed', completion: value };
    },
    calls,
  };
}

async function withRoot(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'godagents-mission-forensics-'));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function setup(root, options = {}) {
  const analysis = adapter('analysis', options);
  const synthesis = adapter('synthesis');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: root,
    adapters: [analysis, synthesis],
    clock: () => fixedTime,
  });
  return { coordinator, analysis, synthesis };
}

test('forensics returns a deterministic bounded projection without adapter calls or writes', async () => {
  await withRoot(async (root) => {
    const { coordinator, analysis, synthesis } = await setup(root);
    const mission = input();
    await coordinator.execute(mission);
    const journalPath = path.join(root, 'programs', mission.programId, 'journal.json');
    const before = await readFile(journalPath, 'utf8');
    const beforeStat = await stat(journalPath);
    const calls = structuredClone({ analysis: analysis.calls, synthesis: synthesis.calls });

    const first = await coordinator.forensics(mission.programId);
    const second = await coordinator.forensics(mission.programId);

    assertSchema('mission-program-forensics', first);
    assert.deepEqual(second, first);
    assert.equal(first.protocolId, MISSION_PROGRAM_FORENSICS_PROTOCOL_ID);
    assert.equal(first.status, 'completed');
    assert.equal(first.selectedSequence, 6);
    assert.equal(first.headSequence, 6);
    assert.equal(first.events.length, 6);
    assert.equal(first.steps.every((step) => step.status === 'committed'), true);
    assert.match(first.projectionDigest, /^[a-f0-9]{64}$/);
    assert.equal(first.events.every((event) => !Object.hasOwn(event, 'payload')), true);
    assert.equal(JSON.stringify(first).includes('input-a'), false);
    assert.deepEqual({ analysis: analysis.calls, synthesis: synthesis.calls }, calls);
    assert.equal(await readFile(journalPath, 'utf8'), before);
    assert.equal((await stat(journalPath)).mtimeMs, beforeStat.mtimeMs);
  });
});

test('forensics exposes exact verified state-at-sequence summaries and no future disclosure', async () => {
  await withRoot(async (root) => {
    const { coordinator } = await setup(root);
    const mission = input();
    await coordinator.execute(mission);

    const admitted = await coordinator.forensics(mission.programId, { throughSequence: 1 });
    const pending = await coordinator.forensics(mission.programId, { throughSequence: 2 });
    const committed = await coordinator.forensics(mission.programId, { throughSequence: 3 });

    assert.equal(admitted.status, 'admitted');
    assert.deepEqual(admitted.steps.map(({ status }) => status), ['admitted', 'admitted']);
    assert.equal(admitted.next, 'step:step-a');
    assert.equal(admitted.events.length, 1);
    assert.equal(pending.status, 'pending');
    assert.deepEqual(pending.steps.map(({ status }) => status), ['pending', 'admitted']);
    assert.equal(pending.next, 'step:step-a');
    assert.equal(pending.events.length, 2);
    assert.equal(committed.status, 'admitted');
    assert.deepEqual(committed.steps.map(({ status }) => status), ['committed', 'admitted']);
    assert.equal(committed.next, 'step:step-b');
    assert.equal(committed.events.length, 3);
    assert.equal(committed.aggregateDigest, null);
  });
});

test('forensics handles absent programs and rejects invalid sequence requests', async () => {
  await withRoot(async (root) => {
    const { coordinator } = await setup(root);
    const missing = await coordinator.forensics(digest('missing'));
    assertSchema('mission-program-forensics', missing);
    assert.deepEqual(missing, {
      schemaVersion: 1,
      protocolId: MISSION_PROGRAM_FORENSICS_PROTOCOL_ID,
      programId: digest('missing'),
      status: 'absent',
      selectedSequence: 0,
      headSequence: 0,
      headDigest: '0'.repeat(64),
      selectedHeadDigest: '0'.repeat(64),
      projectionDigest: missing.projectionDigest,
      events: [],
      steps: [],
      next: 'none',
      aggregateDigest: null,
    });
    await assert.rejects(() => coordinator.forensics(digest('missing-options'), { other: true }), /options/);

    const mission = input();
    await coordinator.execute(mission);
    await assert.rejects(() => coordinator.forensics(mission.programId, { throughSequence: 0 }), /sequence/);
    await assert.rejects(() => coordinator.forensics(mission.programId, { throughSequence: 7 }), /sequence/);
    await assert.rejects(() => coordinator.forensics(mission.programId, { throughSequence: true }), /sequence/);
  });
});

test('forensics verifies the complete journal before projecting an earlier prefix', async () => {
  await withRoot(async (root) => {
    const { coordinator } = await setup(root);
    const mission = input();
    await coordinator.execute(mission);
    const journalPath = path.join(root, 'programs', mission.programId, 'journal.json');
    const state = JSON.parse(await readFile(journalPath, 'utf8'));
    state.events.at(-1).payload.completion.programId = digest('tampered');
    await writeFile(journalPath, `${JSON.stringify(state)}\n`, 'utf8');

    await assert.rejects(
      () => coordinator.forensics(mission.programId, { throughSequence: 1 }),
      /canonical|state digest|event digest|aggregate|completion/,
    );
  });
});
