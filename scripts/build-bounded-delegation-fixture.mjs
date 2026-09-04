import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { createBoundedDelegationCoordinator } from '../src/runtime/bounded-delegation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'fixtures', 'bounded-delegation-v1.json');
const now = '2026-09-04T10:00:00.000Z';
const clock = () => Date.parse(now);

const input = {
  schemaVersion: 1,
  missionId: 'mission-bounded-delegation-fixture',
  leadInstanceId: 'godagent-delegation-fixture',
  sourceEpoch: 4,
  authority: ['observe', 'propose'],
  excerpts: [
    { sourceRef: 'fixture:observation:1', provenance: 'fixture-lead', content: 'compare two bounded analyses' },
  ],
  assignments: [
    { workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 },
    { workerId: 'worker-b', role: 'critic', maxCompletionTokens: 80 },
  ],
  budget: { maxCompletionTokens: 200, maxResultBytes: 20_000 },
};

function completionFor(dispatch, workerId) {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-bounded-delegation-worker-v1',
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
      completionTokens: 16,
    },
    startedAt: now,
    completedAt: now,
  };
}

function worker(workerId, { pending = false } = {}) {
  const calls = { reconcile: 0, execute: 0 };
  const completions = new Map();
  return {
    workerId,
    descriptor: {
      schemaVersion: 1,
      protocolId: 'eternities-bounded-delegation-worker-v1',
      adapterId: `fixture-${workerId}`,
      version: '1.0.0',
    },
    async reconcile({ dispatch }) {
      calls.reconcile += 1;
      if (pending) return { status: 'pending' };
      const completion = completions.get(dispatch.dispatchId);
      return completion ? { status: 'completed', completion } : { status: 'absent' };
    },
    async execute({ dispatch }) {
      calls.execute += 1;
      const completion = completionFor(dispatch, workerId);
      completions.set(dispatch.dispatchId, completion);
      return { status: 'completed', completion };
    },
    calls,
  };
}

async function operationFiles(operationRoot) {
  const names = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else names.push({ path: entryPath.slice(operationRoot.length + 1).replaceAll('\\', '/'), bytes: (await stat(entryPath)).size });
    }
  }
  await walk(operationRoot);
  return names;
}

async function runSuccess(rootPath) {
  const workerA = worker('worker-a');
  const workerB = worker('worker-b');
  const coordinator = createBoundedDelegationCoordinator({
    delegationRoot: rootPath,
    workers: [workerB, workerA],
    clock,
  });
  const first = await coordinator.execute(input);
  const callsAfterFirst = {
    workerA: { ...workerA.calls },
    workerB: { ...workerB.calls },
  };
  const exactRetry = await coordinator.execute(input);
  const callsAfterRetry = {
    workerA: { ...workerA.calls },
    workerB: { ...workerB.calls },
  };
  const inspection = await coordinator.inspect(first.delegationId);
  const operationRoot = join(rootPath, 'delegations', first.delegationId);
  const journal = JSON.parse(await readFile(join(operationRoot, 'journal.json'), 'utf8'));
  return {
    result: {
      status: first.status,
      delegationId: first.delegationId,
      aggregateDigest: first.aggregateDigest,
      workerIds: first.results.map(({ workerId }) => workerId),
      usage: first.usage,
    },
    exactRetry: {
      status: exactRetry.status,
      delegationId: exactRetry.delegationId,
      aggregateDigest: exactRetry.aggregateDigest,
    },
    callsAfterFirst,
    callsAfterRetry,
    inspection,
    eventTypes: journal.events.map(({ eventType }) => eventType),
    files: await operationFiles(operationRoot),
  };
}

async function runPending(rootPath) {
  const pendingWorker = worker('worker-a', { pending: true });
  const coordinator = createBoundedDelegationCoordinator({
    delegationRoot: rootPath,
    workers: [pendingWorker],
    clock,
  });
  const pendingInput = {
    ...input,
    missionId: 'mission-bounded-delegation-pending-fixture',
    assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
  };
  const first = await coordinator.execute(pendingInput);
  const second = await coordinator.execute(pendingInput);
  return {
    first: { status: first.status, pendingWorkerIds: first.pendingWorkerIds },
    second: { status: second.status, pendingWorkerIds: second.pendingWorkerIds },
    calls: pendingWorker.calls,
  };
}

async function runRecovery(rootPath) {
  const recoveringWorker = worker('worker-a');
  let delegationId = null;
  const crashing = createBoundedDelegationCoordinator({
    delegationRoot: rootPath,
    workers: [recoveringWorker],
    clock,
    checkpoint: async ({ stage, delegationId: observedId }) => {
      if (stage === 'after-worker-execute-before-commit') {
        delegationId = observedId;
        throw new Error('fixture worker boundary');
      }
    },
  });
  const recoveryInput = {
    ...input,
    missionId: 'mission-bounded-delegation-recovery-fixture',
    assignments: [{ workerId: 'worker-a', role: 'analyst', maxCompletionTokens: 80 }],
  };
  let failure;
  try {
    await crashing.execute(recoveryInput);
  } catch (error) {
    failure = { name: error.name, message: error.message };
  }
  const recovered = await createBoundedDelegationCoordinator({
    delegationRoot: rootPath,
    workers: [recoveringWorker],
    clock,
  }).recover(delegationId);
  return {
    failure,
    delegationId,
    recovered: {
      status: recovered.status,
      aggregateDigest: recovered.aggregateDigest,
      recovered: recovered.recovered,
    },
    calls: recoveringWorker.calls,
  };
}

const workspaceRoot = await mkdtemp(join(tmpdir(), 'godagents-bounded-delegation-fixture-'));
try {
  const successRoot = join(workspaceRoot, 'success');
  const pendingRoot = join(workspaceRoot, 'pending');
  const recoveryRoot = join(workspaceRoot, 'recovery');
  const [success, pending, recovery] = await Promise.all([
    runSuccess(successRoot),
    runPending(pendingRoot),
    runRecovery(recoveryRoot),
  ]);
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-bounded-delegation-fixture-v1',
    input,
    success,
    pending,
    recovery,
    assertions: {
      maximumWorkers: 3,
      stableWorkerOrder: success.result.workerIds.join(',') === 'worker-a,worker-b',
      terminalReplayStable: success.result.aggregateDigest === success.exactRetry.aggregateDigest,
      terminalReplayNoAdapterCalls: canonicalJson(success.callsAfterFirst) === canonicalJson(success.callsAfterRetry),
      pendingNeverExecutes: pending.calls.execute === 0,
      recoveryNoRedispatch: recovery.calls.execute === 1,
      recoveryCompleted: recovery.recovered.status === 'completed',
      journalHasPreparedAndCommittedWorkers: success.eventTypes.filter((type) => type === 'worker.prepared').length === 2
        && success.eventTypes.filter((type) => type === 'worker.committed').length === 2,
    },
  };
  const fixture = { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  const bytes = Buffer.byteLength(canonicalJson(fixture), 'utf8');
  process.stdout.write(JSON.stringify({ path: outputPath, fixtureDigest: fixture.fixtureDigest, bytes, status: 'built' }) + '\n');
} finally {
  await rm(workspaceRoot, { recursive: true, force: true });
}
