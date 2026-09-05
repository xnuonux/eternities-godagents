import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';
import {
  buildMissionOperationRequest,
} from '../src/runtime/mission-operation-adapter.mjs';
import {
  MISSION_PROGRAM_PROTOCOL_ID,
  createMissionProgramCoordinator,
} from '../src/runtime/mission-program.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createRecoverableRealmConsequenceHost } from '../src/realm/recoverable-consequence-host.mjs';
import { createRealmConsequenceMissionOperationAdapter } from '../src/runtime/realm-consequence-mission-operation-adapter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const outputPath = join(root, '..', 'fixtures', 'realm-consequence-mission-operation-adapter-v1.json');
const fixedTime = '2026-09-05T19:00:00.000Z';
const authorityCeilingDigest = sha256Value({
  realmEffects: 0,
  continuityWrites: 0,
  identityMutation: 0,
  evolution: 0,
  soul: 0,
});
const contract = JSON.parse(await readFile(join(root, '..', 'fixtures', 'realm-contract.json'), 'utf8'));
const genome = JSON.parse(await readFile(join(root, '..', 'dist', 'fixture-agent', 'agent-genome.json'), 'utf8'));

const authority = {
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};
const mission = { missionId: 'mission-realm-operation-adapter', authority: ['realm:write'] };
const state = {
  instanceId: 'agent-realm-operation-adapter',
  epoch: 0,
  now: fixedTime,
  preconditions: ['realm-observed'],
};

function errorSummary(error) {
  const messages = [];
  let current = error;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (typeof current.message === 'string' && current.message.length > 0) messages.push(current.message);
    current = current.cause;
  }
  return { name: error?.name ?? 'Error', message: messages.join(' | ') };
}

async function consequenceInput() {
  const proposal = await createFixtureCortexA().infer({
    missionId: mission.missionId,
    observation: { observationId: 'observation-0', counter: 0 },
    stateEpoch: state.epoch,
    now: fixedTime,
  });
  return { mission, proposal, contract, authority, constitution: genome.constitution, state };
}

function programFor(adapter) {
  const source = adapter.describeSource();
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_PROGRAM_PROTOCOL_ID,
    actor: {
      instanceId: state.instanceId,
      identityDigest: sha256Value('realm-operation-identity'),
      genomeDigest: sha256Value('realm-operation-genome'),
      keelHeadDigest: sha256Value('realm-operation-keel'),
    },
    missionDigest: sha256Value('realm-operation-mission'),
    authorityCeilingDigest,
    budget: { maxCompletionTokens: 1, maxResultBytes: 16_000 },
    steps: [{
      stepId: 'realm-consequence',
      stepIndex: 0,
      kind: 'realm-consequence',
      inputDigest: source.inputDigest,
      maxCompletionTokens: 1,
      maxResultBytes: 16_000,
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
    inputDigest: source.inputDigest,
    authorityCeilingDigest: program.authorityCeilingDigest,
    maxCompletionTokens: step.maxCompletionTokens,
    maxResultBytes: step.maxResultBytes,
    descriptorDigest: description.missionStepDescriptor.descriptorDigest,
  };
  return { ...unsigned, dispatchDigest: sha256Value(unsigned) };
}

async function createFixture(rootPath, { checkpoint, input = null, contractOverride = null } = {}) {
  const runtimeContract = contractOverride ?? contract;
  const base = createFixtureRealm({ contract: runtimeContract });
  const calls = { observe: 0, invoke: 0, reconcile: 0 };
  const realm = Object.freeze({
    contract: runtimeContract,
    async observe(...args) {
      calls.observe += 1;
      return base.observe(...args);
    },
    async invoke(...args) {
      calls.invoke += 1;
      return base.invoke(...args);
    },
    async reconcile(...args) {
      calls.reconcile += 1;
      return base.reconcile(...args);
    },
    inspect: base.inspect,
  });
  const host = await createRecoverableRealmConsequenceHost({
    root: join(rootPath, 'realm'),
    realm,
    clock: () => fixedTime,
    checkpoint,
  });
  const consequence = input ?? await consequenceInput();
  const adapter = await createRealmConsequenceMissionOperationAdapter({
    host,
    consequenceInput: consequence,
    programId: sha256Value('realm-operation-program'),
    stepId: 'realm-consequence',
    stepIndex: 0,
    authorityCeilingDigest,
    maxCompletionTokens: 1,
    maxResultBytes: 16_000,
    clock: () => fixedTime,
  });
  return { adapter, host, input: consequence, realm, calls };
}

async function runSuccess(rootPath) {
  const fixture = await createFixture(rootPath);
  const program = programFor(fixture.adapter);
  const coordinator = await createMissionProgramCoordinator({
    programRoot: join(rootPath, 'program'),
    adapters: [fixture.adapter],
    clock: () => fixedTime,
  });
  const first = await coordinator.execute(program);
  const beforeCalls = { ...fixture.calls };
  const beforeRealm = fixture.realm.inspect();
  const retry = await coordinator.execute(program);
  const description = fixture.adapter.describe();
  const source = fixture.adapter.describeSource();
  const dispatch = dispatchFor(program, description, source);
  return {
    description,
    source,
    dispatch,
    request: buildMissionOperationRequest({ description, dispatch }),
    completion: first.results[0].completion,
    execution: {
      firstStatus: first.status,
      retryStatus: retry.status,
      aggregateDigest: first.aggregateDigest,
      retryAggregateDigest: retry.aggregateDigest,
      beforeReplayCalls: beforeCalls,
      afterReplayCalls: fixture.calls,
      beforeReplayRealm: beforeRealm,
      afterReplayRealm: fixture.realm.inspect(),
    },
  };
}

async function runAdmissionRecovery(rootPath) {
  let crash = true;
  const fixture = await createFixture(rootPath, {
    checkpoint: async (stage) => {
      if (crash && stage === 'after-admission') throw new Error('realm admission boundary');
    },
  });
  const program = programFor(fixture.adapter);
  const coordinator = await createMissionProgramCoordinator({
    programRoot: join(rootPath, 'program'),
    adapters: [fixture.adapter],
    clock: () => fixedTime,
  });
  let failure;
  try {
    await coordinator.execute(program);
  } catch (error) {
    failure = errorSummary(error);
  }
  const afterCrash = fixture.realm.inspect();
  crash = false;
  const recovered = await coordinator.execute(program);
  return {
    failure,
    recoveredStatus: recovered.status,
    calls: fixture.calls,
    afterCrashRealm: afterCrash,
    recoveredRealm: fixture.realm.inspect(),
  };
}

async function runContractDrift(rootPath, input) {
  const driftedContract = structuredClone(contract);
  driftedContract.version = 'drifted';
  const fixture = await createFixture(rootPath, { input, contractOverride: driftedContract });
  const program = programFor(fixture.adapter);
  const coordinator = await createMissionProgramCoordinator({
    programRoot: join(rootPath, 'program'),
    adapters: [fixture.adapter],
    clock: () => fixedTime,
  });
  let failure;
  try {
    await coordinator.execute(program);
  } catch (error) {
    failure = errorSummary(error);
  }
  return { failure, calls: fixture.calls, realm: fixture.realm.inspect() };
}

export async function buildRealmConsequenceMissionOperationAdapterFixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'godagents-realm-operation-fixture-'));
  try {
    const success = await runSuccess(join(workspace, 'success'));
    const recovery = await runAdmissionRecovery(join(workspace, 'recovery'));
    const drift = await runContractDrift(join(workspace, 'drift'), await consequenceInput());
    const projection = success.completion;
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-realm-consequence-mission-operation-adapter-fixture-v1',
      description: success.description,
      sourceDescriptor: success.source,
      dispatch: success.dispatch,
      request: success.request,
      execution: {
        firstStatus: success.execution.firstStatus,
        retryStatus: success.execution.retryStatus,
        aggregateDigest: success.execution.aggregateDigest,
        retryAggregateDigest: success.execution.retryAggregateDigest,
        beforeReplayCalls: success.execution.beforeReplayCalls,
        afterReplayCalls: success.execution.afterReplayCalls,
        beforeReplayRealm: success.execution.beforeReplayRealm,
        afterReplayRealm: success.execution.afterReplayRealm,
        recoveryFailure: recovery.failure,
        recoveryStatus: recovery.recoveredStatus,
        recoveryCalls: recovery.calls,
        recoveryAfterCrashRealm: recovery.afterCrashRealm,
        recoveryFinalRealm: recovery.recoveredRealm,
        driftFailure: drift.failure,
        driftCalls: drift.calls,
        driftRealm: drift.realm,
      },
      projection: {
        resultDigest: projection.resultDigest,
        resultBytes: projection.resultBytes,
        usage: projection.usage,
        startedAt: projection.startedAt,
        completedAt: projection.completedAt,
      },
      assertions: {
        sourceBoundToInput: success.source.inputDigest === sha256Value(await consequenceInput()),
        bodyFreeSourceDescriptor: !Object.hasOwn(success.source, 'proposal')
          && !Object.hasOwn(success.source, 'contract')
          && !Object.hasOwn(success.source, 'authority'),
        compactProjection: !Object.hasOwn(projection, 'action')
          && !Object.hasOwn(projection, 'proposal')
          && projection.usage.completionTokens === 0,
        terminalReplayStable: success.execution.firstStatus === 'completed'
          && success.execution.retryStatus === 'completed'
          && success.execution.aggregateDigest === success.execution.retryAggregateDigest
          && canonicalJson(success.execution.beforeReplayCalls) === canonicalJson(success.execution.afterReplayCalls)
          && canonicalJson(success.execution.beforeReplayRealm) === canonicalJson(success.execution.afterReplayRealm),
        recoveryNoDuplicateRealmEffect: recovery.recoveredStatus === 'completed'
          && recovery.afterCrashRealm.counter === 0
          && recovery.recoveredRealm.counter === 1
          && recovery.calls.invoke === 1,
        contractDriftBeforeRealm: /contract|drift|Realm/i.test(drift.failure?.message ?? '')
          && drift.realm.counter === 0
          && drift.realm.invocationCount === 0,
        authorityEmpty: success.description.authority.realmEffects === 0
          && success.description.authority.continuityWrites === 0
          && success.description.authority.identityMutation === 0
          && success.description.authority.evolution === 0
          && success.description.authority.soul === 0,
        zeroUsage: Object.values(projection.usage).every((value) => value === 0),
      },
    };
    return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await buildRealmConsequenceMissionOperationAdapterFixture();
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({ path: outputPath, fixtureDigest: fixture.fixtureDigest })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invoked) await main();
