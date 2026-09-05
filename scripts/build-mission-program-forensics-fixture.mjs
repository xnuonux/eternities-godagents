import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  MISSION_PROGRAM_PROTOCOL_ID,
  createMissionProgramCoordinator,
} from '../src/runtime/mission-program.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = join(root, 'fixtures', 'mission-program-forensics-v1.json');
const stepProtocolId = 'eternities-mission-program-step-adapter-v1';
const fixedTime = '2026-09-05T10:00:00.000Z';
const digest = (value) => sha256Value(String(value));

function makeInput() {
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: 'fixture-agent',
      identityDigest: digest('fixture-identity'),
      genomeDigest: digest('fixture-genome'),
      keelHeadDigest: digest('fixture-keel'),
    },
    missionDigest: digest('fixture-forensics-mission'),
    authorityCeilingDigest: digest('fixture-authority'),
    budget: { maxCompletionTokens: 100, maxResultBytes: 20_000 },
    steps: [
      { stepId: 'analyze', stepIndex: 0, kind: 'analysis', inputDigest: digest('fixture-analysis-input'), maxCompletionTokens: 40, maxResultBytes: 8_000 },
      { stepId: 'synthesize', stepIndex: 1, kind: 'synthesis', inputDigest: digest('fixture-synthesis-input'), maxCompletionTokens: 40, maxResultBytes: 8_000 },
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
    authority: { realmEffects: 0, continuityWrites: 0, identityMutation: 0, evolution: 0, soul: 0 },
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
    usage: { inputTokens: 12, cachedInputTokens: 4, reasoningTokens: 6, visibleOutputTokens: 4, completionTokens: 10 },
    startedAt: fixedTime,
    completedAt: fixedTime,
  };
  return { ...unsigned, completionDigest: sha256Value(unsigned) };
}

function makeAdapter(kind) {
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

function projectionSummary(value) {
  return {
    status: value.status,
    selectedSequence: value.selectedSequence,
    headSequence: value.headSequence,
    selectedHeadDigest: value.selectedHeadDigest,
    eventTypes: value.events.map(({ eventType }) => eventType),
    stepStatuses: value.steps.map(({ status }) => status),
    next: value.next,
    aggregateDigest: value.aggregateDigest,
    projectionDigest: value.projectionDigest,
  };
}

export async function buildMissionProgramForensicsFixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'godagents-mission-forensics-fixture-'));
  try {
    const analysis = makeAdapter('analysis');
    const synthesis = makeAdapter('synthesis');
    const mission = makeInput();
    const coordinator = await createMissionProgramCoordinator({
      programRoot: workspaceRoot,
      adapters: [synthesis, analysis],
      clock: () => fixedTime,
    });
    await coordinator.execute(mission);
    const journalPath = join(workspaceRoot, 'programs', mission.programId, 'journal.json');
    const before = await readFile(journalPath, 'utf8');
    const beforeMtime = (await stat(journalPath)).mtimeMs;
    const callsBefore = structuredClone({ analysis: analysis.calls, synthesis: synthesis.calls });
    const full = await coordinator.forensics(mission.programId);
    const admitted = await coordinator.forensics(mission.programId, { throughSequence: 1 });
    const pending = await coordinator.forensics(mission.programId, { throughSequence: 2 });
    const committed = await coordinator.forensics(mission.programId, { throughSequence: 3 });
    const replay = await coordinator.forensics(mission.programId);
    const absent = await coordinator.forensics(digest('missing-program'));
    let invalidSequenceRejected = false;
    try {
      await coordinator.forensics(mission.programId, { throughSequence: 0 });
    } catch {
      invalidSequenceRejected = true;
    }
    const after = await readFile(journalPath, 'utf8');
    const afterMtime = (await stat(journalPath)).mtimeMs;
    const callsAfter = structuredClone({ analysis: analysis.calls, synthesis: synthesis.calls });
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-mission-program-forensics-fixture-v1',
      full: projectionSummary(full),
      prefixes: {
        admitted: projectionSummary(admitted),
        pending: projectionSummary(pending),
        committed: projectionSummary(committed),
      },
      absent: projectionSummary(absent),
      assertions: {
        deterministicProjection: canonicalJson(full) === canonicalJson(replay),
        fullCompleted: full.status === 'completed' && full.selectedSequence === 6,
        prefixAdmissionExact: admitted.status === 'admitted' && admitted.events.length === 1
          && admitted.next === 'step:analyze',
        prefixPendingExact: pending.status === 'pending' && pending.events.length === 2
          && pending.steps.map(({ status }) => status).join(',') === 'pending,admitted',
        prefixCommittedExact: committed.status === 'admitted' && committed.events.length === 3
          && committed.steps.map(({ status }) => status).join(',') === 'committed,admitted',
        noFutureDisclosure: admitted.events.length === 1 && pending.events.length === 2
          && committed.events.length === 3,
        noPayloadDisclosure: !JSON.stringify(full).includes('fixture-analysis-input')
          && full.events.every((event) => !Object.hasOwn(event, 'payload')),
        absentStable: absent.status === 'absent' && absent.events.length === 0,
        invalidSequenceRejected,
        readOnly: before === after && beforeMtime === afterMtime,
        noAdapterCalls: canonicalJson(callsBefore) === canonicalJson(callsAfter),
      },
    };
    return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await buildMissionProgramForensicsFixture();
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
