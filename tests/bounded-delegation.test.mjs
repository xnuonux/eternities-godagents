import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import {
  BOUNDED_DELEGATION_PROTOCOL_ID,
  createBoundedDelegationCoordinator,
} from '../src/runtime/bounded-delegation.mjs';

const WORKER_PROTOCOL_ID = 'eternities-bounded-delegation-worker-v1';

const validInput = (overrides = {}) => ({
  schemaVersion: 1,
  missionId: 'mission-1',
  leadInstanceId: 'lead-1',
  sourceEpoch: 2,
  authority: ['observe', 'propose'],
  excerpts: [
    { sourceRef: 'journal:12', provenance: 'lead-provided', content: 'inspect this bounded failure' },
  ],
  assignments: [
    { workerId: 'worker-b', role: 'critic', maxCompletionTokens: 80 },
    { workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 },
  ],
  budget: { maxCompletionTokens: 200, maxResultBytes: 20_000 },
  ...overrides,
});

function makeCompletion({ delegationId, dispatchId, dispatchDigest, workerId, summary = `${workerId} completed` }) {
  return {
    schemaVersion: 1,
    protocolId: WORKER_PROTOCOL_ID,
    delegationId,
    dispatchId,
    dispatchDigest,
    workerId,
    summary,
    recommendations: [`retain-${workerId}`],
    risks: [],
    usage: {
      inputTokens: 12,
      cachedInputTokens: 3,
      reasoningTokens: 8,
      visibleOutputTokens: 7,
      completionTokens: 15,
    },
    startedAt: '2026-09-04T10:00:00.000Z',
    completedAt: '2026-09-04T10:00:01.000Z',
  };
}

function makeWorker(workerId, options = {}) {
  const calls = { reconcile: 0, execute: 0 };
  const completed = new Map();
  const worker = {
    workerId,
    descriptor: {
      schemaVersion: 1,
      protocolId: WORKER_PROTOCOL_ID,
      adapterId: `fixture-${workerId}`,
      version: '1.0.0',
    },
    async reconcile({ dispatch }) {
      calls.reconcile += 1;
      if (options.pending) return { status: 'pending' };
      const completion = completed.get(dispatch.dispatchId);
      return completion ? { status: 'completed', completion } : { status: 'absent' };
    },
    async execute({ dispatch }) {
      calls.execute += 1;
      const completion = options.completion
        ? options.completion(dispatch)
        : makeCompletion({
          delegationId: dispatch.delegationId,
          dispatchId: dispatch.dispatchId,
          dispatchDigest: dispatch.dispatchDigest,
          workerId,
        });
      completed.set(dispatch.dispatchId, completion);
      return { status: 'completed', completion };
    },
    calls,
  };
  return worker;
}

async function withRoot(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'godagents-delegation-'));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function createCoordinator(root, workers, options = {}) {
  return createBoundedDelegationCoordinator({
    delegationRoot: root,
    workers,
    clock: () => Date.parse('2026-09-04T10:00:00.000Z'),
    ...options,
  });
}

test('bounded delegation collects up to three typed worker observations in stable order', async () => {
  await withRoot(async (root) => {
    const workerA = makeWorker('worker-a');
    const workerB = makeWorker('worker-b');
    const coordinator = createCoordinator(root, [workerB, workerA]);

    const result = await coordinator.execute(validInput());

    assert.equal(result.status, 'completed');
    assert.deepEqual(result.results.map((entry) => entry.workerId), ['worker-a', 'worker-b']);
    assert.equal(result.usage.completionTokens, 30);
    assert.equal(workerA.calls.execute, 1);
    assert.equal(workerB.calls.execute, 1);
    assert.equal(result.aggregateDigest.length, 64);
    assert.equal(result.results[0].completion.summary, 'worker-a completed');
  });
});

test('bounded delegation journal and artifacts satisfy every registered contract schema', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a');
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });
    const result = await createCoordinator(root, [worker]).execute(input);
    const journalPath = path.join(root, 'delegations', result.delegationId, 'journal.json');
    const state = JSON.parse(await readFile(journalPath, 'utf8'));

    assertSchema('bounded-delegation-state', state);
    for (const event of state.events) {
      assertSchema('bounded-delegation-event', event);
      if (event.eventType === 'delegation.admitted') {
        assertSchema('bounded-delegation-admission', event.payload.admission);
        assertSchema('bounded-delegation-input', event.payload.admission.input);
        for (const entry of event.payload.admission.workers) {
          assertSchema('bounded-delegation-worker-descriptor', entry.descriptor);
        }
      }
      if (event.eventType === 'worker.prepared') {
        assertSchema('bounded-delegation-worker-dispatch', event.payload.dispatch);
      }
      if (event.eventType === 'delegation.completed') {
        assertSchema('bounded-delegation-completion', event.payload.completion);
      }
    }
    const artifact = result.results[0];
    const artifactsPath = path.join(root, 'delegations', result.delegationId, 'artifacts');
    const artifactFiles = (await (await import('node:fs/promises')).readdir(artifactsPath));
    assert.equal(artifactFiles.length, 1);
    assert.ok(artifact);
    assertSchema('bounded-delegation-worker-completion', JSON.parse(await readFile(path.join(artifactsPath, artifactFiles[0]), 'utf8')));
  });
});

test('terminal replay returns the exact aggregate without another adapter call', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a');
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });
    const coordinator = createCoordinator(root, [worker]);
    const first = await coordinator.execute(input);
    const calls = structuredClone(worker.calls);
    const replay = await coordinator.execute(input);

    assert.equal(replay.status, 'completed');
    assert.equal(replay.delegationId, first.delegationId);
    assert.equal(replay.aggregateDigest, first.aggregateDigest);
    assert.deepEqual(replay.results, first.results);
    assert.deepEqual(worker.calls, calls);
  });
});

test('pending reconciliation never guesses completion or redispatches', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a', { pending: true });
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });
    const coordinator = createCoordinator(root, [worker]);

    const first = await coordinator.execute(input);
    const second = await coordinator.execute(input);

    assert.equal(first.status, 'pending');
    assert.deepEqual(first.pendingWorkerIds, ['worker-a']);
    assert.equal(second.status, 'pending');
    assert.equal(worker.calls.execute, 0);
    assert.equal(worker.calls.reconcile, 2);
  });
});

test('configured stale-lock policy is applied to delegation recovery', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a', { pending: true });
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });
    const coordinator = createCoordinator(root, [worker], { staleAfterMs: 1 });
    const first = await coordinator.execute(input);
    const lockPath = path.join(root, 'delegations', first.delegationId, 'operation.lock');
    await writeFile(lockPath, canonicalJson({
      schemaVersion: 1,
      pid: 999999,
      nonce: 'stale-test',
      createdAt: new Date().toISOString(),
    }) + '\n', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 15));

    const second = await coordinator.execute(input);

    assert.equal(second.status, 'pending');
    assert.equal(worker.calls.execute, 0);
  });
});

test('recovery after worker completion reconciles without redispatch', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a');
    let delegationId;
    const crashing = createCoordinator(root, [worker], {
      checkpoint: async ({ stage, delegationId: observedId }) => {
        if (stage === 'after-worker-execute-before-commit') {
          delegationId = observedId;
          throw new Error('simulated crash');
        }
      },
    });
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });

    await assert.rejects(() => crashing.execute(input), /simulated crash/);
    assert.ok(delegationId);
    assert.equal(worker.calls.execute, 1);

    const recovered = await createCoordinator(root, [worker]).recover(delegationId);

    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.recovered, true);
    assert.equal(worker.calls.execute, 1);
    assert.equal(worker.calls.reconcile, 2);
  });
});

test('recovery before aggregate publication preserves the aggregate identity', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a');
    let delegationId;
    const crashing = createCoordinator(root, [worker], {
      checkpoint: async ({ stage, delegationId: observedId }) => {
        if (stage === 'before-delegation-completion') {
          delegationId = observedId;
          throw new Error('simulated aggregate publication crash');
        }
      },
    });
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });

    await assert.rejects(() => crashing.execute(input), /aggregate publication crash/);
    const recovered = await createCoordinator(root, [worker]).recover(delegationId);
    const replay = await createCoordinator(root, [worker]).recover(delegationId);

    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.aggregateDigest, replay.aggregateDigest);
    assert.equal(worker.calls.execute, 1);
    assert.equal(worker.calls.reconcile, 1);
  });
});

test('authority, credential-shaped, duplicate, and oversized inputs fail before worker calls', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a');
    const coordinator = createCoordinator(root, [worker]);
    const base = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });

    await assert.rejects(() => coordinator.execute({ ...base, authority: ['realm:write'] }), /authority/);
    await assert.rejects(() => coordinator.execute({ ...base, credentials: 'do-not-store' }), /unknown|credential/);
    await assert.rejects(() => coordinator.execute({
      ...base,
      assignments: [
        { workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 },
        { workerId: 'worker-a', role: 'critic', maxCompletionTokens: 80 },
      ],
    }), /duplicate/);
    await assert.rejects(() => coordinator.execute({
      ...base,
      budget: { maxCompletionTokens: 40, maxResultBytes: 20_000 },
    }), /completion|budget/);
    assert.deepEqual(worker.calls, { reconcile: 0, execute: 0 });
  });
});

test('authority-shaped worker output is rejected and is never committed', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a', {
      completion: (dispatch) => ({
        ...makeCompletion({
          delegationId: dispatch.delegationId,
          dispatchId: dispatch.dispatchId,
          dispatchDigest: dispatch.dispatchDigest,
          workerId: 'worker-a',
        }),
        realm: 'forbidden',
      }),
    });
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });
    const coordinator = createCoordinator(root, [worker]);

    await assert.rejects(() => coordinator.execute(input), /unknown|credential|schema|realm/i);
    assert.equal(worker.calls.execute, 1);
    const delegationDirs = await (await import('node:fs/promises')).readdir(path.join(root, 'delegations'));
    assert.equal(delegationDirs.length, 1);
    const journal = JSON.parse(await readFile(path.join(root, 'delegations', delegationDirs[0], 'journal.json'), 'utf8'));
    assert.equal(journal.events.some((event) => event.eventType === 'worker.committed'), false);
  });
});

test('identity, keel, Realm, and nested-delegation fields are rejected before worker calls', async () => {
  for (const field of ['identity', 'keel', 'realm', 'delegation']) {
    await withRoot(async (root) => {
      const worker = makeWorker('worker-a');
      const input = validInput({
        assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
        [field]: { forbidden: true },
      });
      const coordinator = createCoordinator(root, [worker]);

      await assert.rejects(() => coordinator.execute(input), /unknown|invalid|credential/i);
      assert.deepEqual(worker.calls, { reconcile: 0, execute: 0 });
    });
  }
});

test('descriptor changes fail closed during recovery and journal tampering is detected', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a');
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });
    const first = await createCoordinator(root, [worker]).execute(input);
    const changed = makeWorker('worker-a');
    changed.descriptor.version = '2.0.0';

    await assert.rejects(() => createCoordinator(root, [changed]).recover(first.delegationId), /descriptor|identity|changed/);

    const journalPath = path.join(root, 'delegations', first.delegationId, 'journal.json');
    const journalText = await readFile(journalPath, 'utf8');
    await writeFile(journalPath, `${journalText.replace('delegation.completed', 'delegation.corrupted')}`, 'utf8');
    await assert.rejects(() => createCoordinator(root, [worker]).execute(input), /digest|canonical|event|schema/);
  });
});

test('inspection exposes bounded lifecycle metadata and no worker body', async () => {
  await withRoot(async (root) => {
    const worker = makeWorker('worker-a');
    const input = validInput({
      assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
    });
    const coordinator = createCoordinator(root, [worker]);
    const result = await coordinator.execute(input);
    const inspection = await coordinator.inspect(result.delegationId);

    assert.equal(inspection.status, 'completed');
    assert.deepEqual(inspection.workerIds, ['worker-a']);
    assert.equal(inspection.resultDigests.length, 1);
    assert.equal(Object.hasOwn(inspection, 'summary'), false);
    assert.equal(JSON.stringify(inspection).includes('retain-worker-a'), false);
  });
});
