import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  MISSION_PROGRAM_PROTOCOL_ID,
  createMissionProgramCoordinator,
} from '../src/runtime/mission-program.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'fixtures', 'mission-program-v1.json');
const stepProtocolId = 'eternities-mission-program-step-adapter-v1';
const fixedTime = '2026-09-05T10:00:00.000Z';
const clock = () => fixedTime;
const digest = (value) => sha256Value(String(value));

function makeInput(missionId) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'fixture-agent',
      identityDigest: digest('fixture-identity'),
      genomeDigest: digest('fixture-genome'),
      keelHeadDigest: digest('fixture-keel'),
    },
    missionDigest: digest(missionId),
    authorityCeilingDigest: digest('fixture-authority'),
    budget: { maxCompletionTokens: 100, maxResultBytes: 20_000 },
    steps: [
      {
        stepId: 'analyze',
        stepIndex: 0,
        kind: 'analysis',
        inputDigest: digest('fixture-analysis-input'),
        maxCompletionTokens: 40,
        maxResultBytes: 8_000,
      },
      {
        stepId: 'synthesize',
        stepIndex: 1,
        kind: 'synthesis',
        inputDigest: digest('fixture-synthesis-input'),
        maxCompletionTokens: 40,
        maxResultBytes: 8_000,
      },
    ],
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

function makeDescriptor(kind) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: stepProtocolId,
    kind,
    adapterId: `fixture-${kind}`,
    adapterVersion: '1.0.0',
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

function makeCompletion(dispatch) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    programId: dispatch.programId,
    stepId: dispatch.stepId,
    stepIndex: dispatch.stepIndex,
    kind: dispatch.kind,
    dispatchId: dispatch.dispatchId,
    dispatchDigest: dispatch.dispatchDigest,
    resultDigest: digest(`fixture-result:${dispatch.stepId}`),
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
  };
  return { ...unsigned, completionDigest: sha256Value(unsigned) };
}

function makeAdapter(kind, { pending = false } = {}) {
  const descriptor = makeDescriptor(kind);
  const calls = { descriptor: 0, reconcile: 0, execute: 0 };
  const completions = new Map();
  return {
    descriptor() {
      calls.descriptor += 1;
      return descriptor;
    },
    async reconcile({ dispatch }) {
      calls.reconcile += 1;
      if (pending) return { status: 'pending' };
      const completion = completions.get(dispatch.dispatchId);
      return completion ? { status: 'completed', completion } : { status: 'absent' };
    },
    async execute({ dispatch }) {
      calls.execute += 1;
      const completion = makeCompletion(dispatch);
      completions.set(dispatch.dispatchId, completion);
      return { status: 'completed', completion };
    },
    calls,
  };
}

async function operationFiles(operationRoot) {
  const files = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else {
        files.push({
          path: entryPath.slice(operationRoot.length + 1).replaceAll('\\', '/'),
          bytes: (await stat(entryPath)).size,
        });
      }
    }
  }
  await walk(operationRoot);
  return files;
}

async function runSuccess(rootPath) {
  const analysis = makeAdapter('analysis');
  const synthesis = makeAdapter('synthesis');
  const input = makeInput('fixture-success');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: rootPath,
    adapters: [synthesis, analysis],
    clock,
  });
  const first = await coordinator.execute(input);
  const callsAfterFirst = structuredClone({ analysis: analysis.calls, synthesis: synthesis.calls });
  const retry = await coordinator.execute(input);
  const callsAfterRetry = structuredClone({ analysis: analysis.calls, synthesis: synthesis.calls });
  const operationRoot = join(rootPath, 'programs', input.programId);
  const journal = await readFile(join(operationRoot, 'journal.json'), 'utf8');
  const durable = [journal];
  for (const entry of await readdir(join(operationRoot, 'artifacts'))) {
    durable.push(await readFile(join(operationRoot, 'artifacts', entry), 'utf8'));
  }
  const state = JSON.parse(journal);
  const eventTypes = state.events.map(({ eventType }) => eventType);
  const dispatches = state.events
    .filter(({ eventType }) => eventType === 'step.prepared')
    .map(({ payload }) => payload.dispatch);
  const durableText = durable.join('\n');
  return {
    result: {
      status: first.status,
      programId: first.programId,
      aggregateDigest: first.aggregateDigest,
      stepIds: first.results.map(({ stepId }) => stepId),
      completionDigests: first.results.map(({ completion }) => completion.completionDigest),
      usage: first.usage,
    },
    exactReplay: {
      status: retry.status,
      aggregateDigest: retry.aggregateDigest,
      byteIdentical: canonicalJson(first) === canonicalJson(retry),
    },
    callsAfterFirst,
    callsAfterRetry,
    eventTypes,
    files: await operationFiles(operationRoot),
    durableScan: {
      forbiddenFieldsAbsent: !durableText.match(
        /credential|authorization|endpoint|modelId|realmHandle|keelWriter|memoryWriter|nestedProgram|[A-Za-z]:\\/i,
      ),
      dispatchesBodyFree: dispatches.length === 2
        && dispatches.every((dispatch) => !Object.hasOwn(dispatch, 'input')),
    },
  };
}

async function runPending(rootPath) {
  const analysis = makeAdapter('analysis', { pending: true });
  const synthesis = makeAdapter('synthesis');
  const input = makeInput('fixture-pending');
  const coordinator = await createMissionProgramCoordinator({
    programRoot: rootPath,
    adapters: [analysis, synthesis],
    clock,
  });
  const first = await coordinator.execute(input);
  const second = await coordinator.execute(input);
  const inspection = await coordinator.inspect(input.programId);
  return {
    first: { status: first.status, pendingStepIds: first.pendingStepIds },
    second: { status: second.status, pendingStepIds: second.pendingStepIds },
    inspection: { status: inspection.status, next: inspection.next },
    calls: { analysis: analysis.calls, synthesis: synthesis.calls },
  };
}

async function runRecovery(rootPath) {
  const analysis = makeAdapter('analysis');
  const synthesis = makeAdapter('synthesis');
  const input = makeInput('fixture-recovery');
  let crashed = false;
  const crashing = await createMissionProgramCoordinator({
    programRoot: rootPath,
    adapters: [analysis, synthesis],
    clock,
    checkpoint: async ({ stage }) => {
      if (!crashed && stage === 'after-step-execute-before-commit') {
        crashed = true;
        throw new Error('fixture process boundary');
      }
    },
  });
  let failure;
  try {
    await crashing.execute(input);
  } catch (error) {
    failure = { name: error.name, message: error.message };
  }
  const recovered = await (await createMissionProgramCoordinator({
    programRoot: rootPath,
    adapters: [analysis, synthesis],
    clock,
  })).recover(input.programId);
  return {
    failure,
    recovered: {
      status: recovered.status,
      aggregateDigest: recovered.aggregateDigest,
      recovered: recovered.recovered,
    },
    calls: { analysis: analysis.calls, synthesis: synthesis.calls },
  };
}

export async function buildMissionProgramFixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'godagents-mission-program-fixture-'));
  try {
    const [success, pending, recovery] = await Promise.all([
      runSuccess(join(workspaceRoot, 'success')),
      runPending(join(workspaceRoot, 'pending')),
      runRecovery(join(workspaceRoot, 'recovery')),
    ]);
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-long-horizon-mission-program-fixture-v1',
      success,
      pending,
      recovery,
      assertions: {
        orderedSteps: success.result.stepIds.join(',') === 'analyze,synthesize',
        terminalReplayStable: success.exactReplay.byteIdentical
          && success.result.aggregateDigest === success.exactReplay.aggregateDigest,
        terminalReplayNoAdapterCalls: canonicalJson(success.callsAfterFirst)
          === canonicalJson(success.callsAfterRetry),
        pendingNeverExecutes: pending.calls.analysis.execute === 0
          && pending.calls.synthesis.execute === 0,
        futureStepNeverCalled: pending.calls.synthesis.reconcile === 0,
        recoveryNoRedispatch: recovery.calls.analysis.execute === 1,
        recoveryCompleted: recovery.recovered.status === 'completed',
        durableFilesBounded: success.durableScan.forbiddenFieldsAbsent
          && success.durableScan.dispatchesBodyFree,
      },
    };
    return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await buildMissionProgramFixture();
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(JSON.stringify({
    path: outputPath,
    fixtureDigest: fixture.fixtureDigest,
    bytes: Buffer.byteLength(`${canonicalJson(fixture)}\n`, 'utf8'),
    status: 'built',
  }) + '\n');
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
