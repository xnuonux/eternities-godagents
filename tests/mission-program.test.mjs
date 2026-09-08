import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { IntegrityError } from '../src/core/errors.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import {
  MISSION_PROGRAM_PROTOCOL_ID,
  MissionProgramError,
  createMissionProgramCoordinator,
} from '../src/runtime/mission-program.mjs';

const STEP_PROTOCOL_ID = 'eternities-mission-program-step-adapter-v1';
const fixedTime = '2026-09-05T10:00:00.000Z';
const digest = (value) => sha256Value(String(value));

function makeInput(overrides = {}) {
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
      {
        stepId: 'step-a',
        stepIndex: 0,
        kind: 'analysis',
        inputDigest: digest('input-a'),
        maxCompletionTokens: 40,
        maxResultBytes: 8_000,
      },
      {
        stepId: 'step-b',
        stepIndex: 1,
        kind: 'synthesis',
        inputDigest: digest('input-b'),
        maxCompletionTokens: 40,
        maxResultBytes: 8_000,
      },
    ],
    ...overrides,
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

function makeDescriptor(kind, version = '1.0.0') {
  const unsigned = {
    schemaVersion: 1,
    protocolId: STEP_PROTOCOL_ID,
    kind,
    adapterId: `fixture-${kind}`,
    adapterVersion: version,
    authority: {
      realmEffects: 0,
      continuityWrites: 0,
      identityMutation: 0,
      evolution: 0,
      soul: 0,
    },
  };
  return { ...unsigned, descriptorDigest: sha256Value(unsigned) };
}

function makeCompletion(dispatch, overrides = {}) {
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
    usage: {
      inputTokens: 12,
      cachedInputTokens: 4,
      reasoningTokens: 6,
      visibleOutputTokens: 4,
      completionTokens: 10,
    },
    startedAt: fixedTime,
    completedAt: fixedTime,
    ...overrides,
  };
  return { ...unsigned, completionDigest: sha256Value(unsigned) };
}

function makeAdapter(kind, options = {}) {
  const descriptor = makeDescriptor(kind, options.version);
  const calls = { descriptor: 0, reconcile: 0, execute: 0 };
  const completed = new Map();
  let liveDescriptor = options.descriptor ?? descriptor;
  let pending = Boolean(options.pending);
  const adapter = {
    descriptor() {
      calls.descriptor += 1;
      return liveDescriptor;
    },
    async reconcile({ dispatch }) {
      calls.reconcile += 1;
      adapter.observedDispatches.push({ method: 'reconcile', dispatch: structuredClone(dispatch) });
      if (options.reconcileResponse) return options.reconcileResponse(dispatch);
      if (pending) return { status: 'pending' };
      const completion = completed.get(dispatch.dispatchId);
      return completion ? { status: 'completed', completion } : { status: 'absent' };
    },
    async execute({ dispatch }) {
      calls.execute += 1;
      adapter.observedDispatches.push({ method: 'execute', dispatch: structuredClone(dispatch) });
      if (options.executeResponse) return options.executeResponse(dispatch);
      const completion = makeCompletion(dispatch, options.completionOverrides);
      completed.set(dispatch.dispatchId, completion);
      return { status: 'completed', completion };
    },
    calls,
    observedDispatches: [],
    setPending(value) {
      pending = Boolean(value);
    },
    setDescriptor(value) {
      liveDescriptor = value;
    },
  };
  return adapter;
}

async function withRoot(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'godagents-mission-program-'));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createCoordinator(root, adapters, options = {}) {
  return createMissionProgramCoordinator({
    programRoot: root,
    adapters,
    clock: () => fixedTime,
    ...options,
  });
}

test('committed-step read distinguishes an uncommitted step without invoking adapters or writing state', async () => {
  await withRoot(async root => {
    const input = makeInput();
    const first = makeAdapter('analysis', { pending: true });
    const second = makeAdapter('synthesis');
    const coordinator = await createCoordinator(root, [first, second]);
    await assert.rejects(coordinator.readCommittedStep(input.programId, 'step-a'), { code: 'program-missing' });
    assert.deepEqual(await readdir(root), []);
    await coordinator.execute(input);
    const journalPath = path.join(root, 'programs', input.programId, 'journal.json');
    const before = await readFile(journalPath, 'utf8');
    const calls = [structuredClone(first.calls), structuredClone(second.calls)];
    assert.deepEqual(await coordinator.readCommittedStep(input.programId, 'step-a'),
      { status: 'uncommitted', programId: input.programId, stepId: 'step-a', stepIndex: 0 });
    assert.deepEqual(await coordinator.readCommittedStep(input.programId, 'step-b'),
      { status: 'uncommitted', programId: input.programId, stepId: 'step-b', stepIndex: 1 });
    assert.deepEqual([first.calls, second.calls], calls);
    assert.equal(await readFile(journalPath, 'utf8'), before);
  });
});

test('committed-step read returns exact frozen evidence from a partial program and fresh coordinator', async () => {
  await withRoot(async root => {
    const input = makeInput();
    const first = makeAdapter('analysis');
    const second = makeAdapter('synthesis', { pending: true });
    const coordinator = await createCoordinator(root, [first, second]);
    assert.equal((await coordinator.execute(input)).status, 'pending');
    const entry = await coordinator.readCommittedStep(input.programId, 'step-a');
    const expected = makeCompletion(first.observedDispatches.find(row => row.method === 'execute').dispatch);
    assert.deepEqual(entry, { status: 'committed', programId: input.programId,
      stepId: 'step-a', stepIndex: 0, completion: expected });
    assert.throws(() => { entry.completion.usage.completionTokens = 0; }, TypeError);
    const fresh = await createCoordinator(root, [first, second]);
    const calls = [structuredClone(first.calls), structuredClone(second.calls)];
    assert.deepEqual(await fresh.readCommittedStep(input.programId, 'step-a'), entry);
    assert.deepEqual([first.calls, second.calls], calls);
  });
});

test('committed-step read can run inside the next step without reacquiring the program lock', { timeout: 5000 }, async () => {
  await withRoot(async root => {
    const input = makeInput();
    let coordinator;
    const first = makeAdapter('analysis');
    const second = makeAdapter('synthesis', { executeResponse: async dispatch => {
      const parent = await coordinator.readCommittedStep(input.programId, 'step-a');
      assert.equal(parent.status, 'committed');
      assert.equal(parent.completion.resultDigest, digest('result-step-a'));
      return { status: 'completed', completion: makeCompletion(dispatch) };
    } });
    coordinator = await createCoordinator(root, [first, second]);
    const result = await coordinator.execute(input);
    assert.equal(result.status, 'completed');
    const calls = [structuredClone(first.calls), structuredClone(second.calls)];
    assert.deepEqual((await coordinator.readCommittedStep(input.programId, 'step-b')).completion,
      result.results[1].completion);
    assert.deepEqual([first.calls, second.calls], calls);
  });
});

test('committed-step read rejects invalid references and changed completion evidence, never false absence', async () => {
  await withRoot(async root => {
    const input = makeInput();
    const first = makeAdapter('analysis');
    const second = makeAdapter('synthesis');
    const coordinator = await createCoordinator(root, [first, second]);
    await coordinator.execute(input);
    const calls = [structuredClone(first.calls), structuredClone(second.calls)];
    await assert.rejects(coordinator.readCommittedStep(input.programId, 'not-a-step'), { code: 'step-missing' });
    await assert.rejects(coordinator.readCommittedStep('../elsewhere', 'step-a'));
    await assert.rejects(coordinator.readCommittedStep(input.programId, '../step-a'));
    const artifacts = path.join(root, 'programs', input.programId, 'artifacts');
    const files = await readdir(artifacts);
    await writeFile(path.join(artifacts, files[0]), '{}\n');
    await assert.rejects(coordinator.readCommittedStep(input.programId, 'step-a'), IntegrityError);
    assert.deepEqual([first.calls, second.calls], calls);
  });
});

test('mission program runs ordered steps through a bounded provider-neutral port', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const coordinator = await createCoordinator(root, [synthesis, analysis]);

    const result = await coordinator.execute(makeInput());

    assert.equal(result.status, 'completed');
    assert.equal(result.programId.length, 64);
    assert.deepEqual(result.results.map(({ stepId }) => stepId), ['step-a', 'step-b']);
    assert.equal(analysis.calls.execute, 1);
    assert.equal(synthesis.calls.execute, 1);
    assert.equal(result.usage.completionTokens, 20);
    assert.equal(result.aggregateDigest.length, 64);
  });
});

test('mission program journal and artifacts satisfy every registered contract schema', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const input = makeInput();
    const result = await (await createCoordinator(root, [analysis, synthesis])).execute(input);
    const journalPath = path.join(root, 'programs', result.programId, 'journal.json');
    const state = JSON.parse(await readFile(journalPath, 'utf8'));

    assertSchema('mission-program-state', state);
    for (const event of state.events) {
      assertSchema('mission-program-event', event);
      if (event.eventType === 'program.admitted') {
        assertSchema('mission-program-admission', event.payload.admission);
        assertSchema('mission-program-input', event.payload.admission.input);
        for (const step of event.payload.admission.steps) {
          assertSchema('mission-program-step-descriptor', step.descriptor);
        }
      }
      if (event.eventType === 'step.prepared') {
        assertSchema('mission-program-dispatch', event.payload.dispatch);
      }
      if (event.eventType === 'step.committed') {
        assert.ok(event.payload.artifact.digest.match(/^[a-f0-9]{64}$/));
        const artifact = JSON.parse(await readFile(
          path.join(root, 'programs', result.programId, 'artifacts', `${event.payload.artifact.digest}.json`),
          'utf8',
        ));
        assertSchema('mission-program-completion', artifact);
      }
      if (event.eventType === 'program.completed') {
        assertSchema('mission-program-aggregate-completion', event.payload.completion);
      }
    }
  });
});

test('terminal replay returns exact results without adapter calls', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const coordinator = await createCoordinator(root, [analysis, synthesis]);
    const input = makeInput();
    const first = await coordinator.execute(input);
    const calls = structuredClone({ analysis: analysis.calls, synthesis: synthesis.calls });

    const replay = await coordinator.execute(input);

    assert.deepEqual(replay, first);
    assert.deepEqual({ analysis: analysis.calls, synthesis: synthesis.calls }, calls);
  });
});

test('pending reconciliation never guesses completion or executes', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis', { pending: true });
    const synthesis = makeAdapter('synthesis');
    const coordinator = await createCoordinator(root, [analysis, synthesis]);
    const input = makeInput();

    const first = await coordinator.execute(input);
    const second = await coordinator.execute(input);
    const inspection = await coordinator.inspect(input.programId);

    assert.equal(first.status, 'pending');
    assert.equal(second.status, 'pending');
    assert.deepEqual(inspection.pendingStepIds, ['step-a']);
    assert.equal(analysis.calls.execute, 0);
    assert.equal(synthesis.calls.execute, 0);
    assert.equal(synthesis.calls.reconcile, 0);
    assert.deepEqual(synthesis.observedDispatches, []);
  });
});

test('a process boundary after execute recovers by reconciliation without redispatch', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    let crash = true;
    const checkpoint = async ({ stage }) => {
      if (crash && stage === 'after-step-execute-before-commit') {
        crash = false;
        throw new Error('fixture process boundary');
      }
    };
    const firstCoordinator = await createCoordinator(root, [analysis, synthesis], { checkpoint });
    const input = makeInput();

    await assert.rejects(() => firstCoordinator.execute(input), /fixture process boundary/);
    assert.equal(analysis.calls.execute, 1);
    assert.equal(synthesis.calls.execute, 0);

    const secondCoordinator = await createCoordinator(root, [analysis, synthesis]);
    const recovered = await secondCoordinator.recover(input.programId);

    assert.equal(recovered.status, 'completed');
    assert.equal(analysis.calls.execute, 1);
    assert.equal(synthesis.calls.execute, 1);
    assert.equal(recovered.recovered, true);
  });
});

test('changed adapter descriptors fail closed after admission', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const input = makeInput();
    const first = await (await createCoordinator(root, [analysis, synthesis])).execute(input);
    assert.equal(first.status, 'completed');

    const changedAnalysis = makeAdapter('analysis', { version: '2.0.0' });
    const changed = await createCoordinator(root, [changedAnalysis, synthesis]);

    await assert.rejects(
      () => changed.execute(input),
      (error) => error instanceof MissionProgramError
        && error instanceof IntegrityError
        && /admission mismatch|descriptor/.test(error.message),
    );
  });
});

test('authority-shaped, credential-shaped, and nested program input is rejected before adapter calls', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const coordinator = await createCoordinator(root, [analysis, synthesis]);
    const cases = [
      { authority: ['realm:write'] },
      { credential: 'secret-canary' },
      { nestedProgram: { steps: [] } },
    ];

    for (const addition of cases) {
      const invalid = { ...makeInput(), ...addition };
      await assert.rejects(() => coordinator.execute(invalid), /schema|forbidden|unknown|program input/);
    }
    assert.equal(analysis.calls.execute, 0);
    assert.equal(synthesis.calls.execute, 0);
  });
});

test('tampered durable state fails closed without adapter calls', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const input = makeInput();
    const first = await (await createCoordinator(root, [analysis, synthesis])).execute(input);
    const journalPath = path.join(root, 'programs', first.programId, 'journal.json');
    const state = JSON.parse(await readFile(journalPath, 'utf8'));
    state.events[1].payload.dispatch.inputDigest = digest('tampered');
    await writeFile(journalPath, `${JSON.stringify(state)}\n`, 'utf8');

    const replay = await createCoordinator(root, [analysis, synthesis]);
    await assert.rejects(() => replay.execute(input), /canonical|state digest|event digest|dispatch/);
    assert.equal(analysis.calls.execute, 1);
    assert.equal(synthesis.calls.execute, 1);
  });
});

test('step completion cannot exceed its admitted ceiling', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis', { completionOverrides: { resultBytes: 9_000 } });
    const synthesis = makeAdapter('synthesis');
    const input = makeInput();
    const coordinator = await createCoordinator(root, [analysis, synthesis]);

    await assert.rejects(() => coordinator.execute(input), /result|ceiling|budget/);
    assert.equal(analysis.calls.execute, 1);
    assert.equal(synthesis.calls.execute, 0);
  });
});

test('program admission enforces one step and aggregate ceilings independently', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const coordinator = await createCoordinator(root, [analysis, synthesis]);

    const noSteps = makeInput({ steps: [] });
    const overBudget = makeInput({
      steps: [
        { stepId: 'step-a', stepIndex: 0, kind: 'analysis', inputDigest: digest('a'), maxCompletionTokens: 60, maxResultBytes: 8_000 },
        { stepId: 'step-b', stepIndex: 1, kind: 'synthesis', inputDigest: digest('b'), maxCompletionTokens: 60, maxResultBytes: 8_000 },
      ],
    });

    await assert.rejects(() => coordinator.execute(noSteps), /input|step/);
    await assert.rejects(() => coordinator.execute(overBudget), /budget|ceiling/);
    assert.equal(analysis.calls.execute, 0);
    assert.equal(synthesis.calls.execute, 0);
  });
});

test('descriptor drift between reconciliation and execution fails closed', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const checkpoint = async ({ stage }) => {
      if (stage === 'after-step-reconcile') analysis.setDescriptor(makeDescriptor('analysis', '2.0.0'));
    };
    const coordinator = await createCoordinator(root, [analysis, synthesis], { checkpoint });

    await assert.rejects(() => coordinator.execute(makeInput()), /descriptor/);
    assert.equal(analysis.calls.reconcile, 1);
    assert.equal(analysis.calls.execute, 0);
    assert.equal(synthesis.calls.reconcile, 0);
  });
});

test('malformed adapter outcomes fail closed before execution or publication', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis', { reconcileResponse: () => ({ status: 'completed' }) });
    const synthesis = makeAdapter('synthesis');
    const coordinator = await createCoordinator(root, [analysis, synthesis]);

    await assert.rejects(() => coordinator.execute(makeInput()), /response|completion/);
    assert.equal(analysis.calls.execute, 0);
    assert.equal(synthesis.calls.reconcile, 0);
  });
});

test('durable files contain only bounded digests and metadata without future bodies or forbidden surfaces', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const input = makeInput();
    const result = await (await createCoordinator(root, [analysis, synthesis])).execute(input);
    const operationRoot = path.join(root, 'programs', result.programId);
    const journal = await readFile(path.join(operationRoot, 'journal.json'), 'utf8');
    const artifactFiles = await readdir(path.join(operationRoot, 'artifacts'));
    const artifacts = await Promise.all(artifactFiles.map((file) => readFile(path.join(operationRoot, 'artifacts', file), 'utf8')));
    const durable = [journal, ...artifacts].join('\n');

    assert.doesNotMatch(durable, /secret-canary|Authorization|provider|modelId|realmHandle|keelWriter|memoryWriter|nestedProgram|C:\\|[A-Za-z]:\\/i);
    assert.equal(analysis.observedDispatches.every(({ dispatch }) => !Object.hasOwn(dispatch, 'input')), true);
    assert.equal(synthesis.observedDispatches.every(({ dispatch }) => !Object.hasOwn(dispatch, 'input')), true);
  });
});

test('completion artifact digest and byte drift fail closed before replay calls', async () => {
  await withRoot(async (root) => {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const input = makeInput();
    const first = await (await createCoordinator(root, [analysis, synthesis])).execute(input);
    const statePath = path.join(root, 'programs', first.programId, 'journal.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const committed = state.events.find((event) => event.eventType === 'step.committed');
    const artifactPath = path.join(root, 'programs', first.programId, 'artifacts', `${committed.payload.artifact.digest}.json`);
    await writeFile(artifactPath, '{"tampered":true}\n', 'utf8');

    const replay = await createCoordinator(root, [analysis, synthesis]);
    await assert.rejects(() => replay.execute(input), /artifact|integrity|canonical/);
    assert.equal(analysis.calls.execute, 1);
    assert.equal(synthesis.calls.execute, 1);
  });
});
