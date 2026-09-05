import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';
import { MISSION_PROGRAM_PROTOCOL_ID, createMissionProgramCoordinator } from '../src/runtime/mission-program.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createRecoverableRealmConsequenceHost } from '../src/realm/recoverable-consequence-host.mjs';
import { createRealmConsequenceMissionOperationAdapter } from '../src/runtime/realm-consequence-mission-operation-adapter.mjs';

const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));
const genome = JSON.parse(await readFile(new URL('../dist/fixture-agent/agent-genome.json', import.meta.url), 'utf8'));
const fixedTime = '2026-09-05T19:00:00.000Z';
const authorityCeilingDigest = sha256Value({
  realmEffects: 0,
  continuityWrites: 0,
  identityMutation: 0,
  evolution: 0,
  soul: 0,
});

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

async function consequenceInput(overrides = {}) {
  const proposal = await createFixtureCortexA().infer({
    missionId: mission.missionId,
    observation: { observationId: 'observation-0', counter: 0 },
    stateEpoch: state.epoch,
    now: fixedTime,
  });
  return {
    mission,
    proposal,
    contract,
    authority,
    constitution: genome.constitution,
    state,
    ...overrides,
  };
}

function programFor(adapter, input, overrides = {}) {
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
    budget: {
      maxCompletionTokens: 1,
      maxResultBytes: 16_000,
    },
    steps: [{
      stepId: 'realm-consequence',
      stepIndex: 0,
      kind: 'realm-consequence',
      inputDigest: source.inputDigest,
      maxCompletionTokens: 1,
      maxResultBytes: 16_000,
    }],
    ...overrides,
  };
  return { ...unsigned, programId: sha256Value(unsigned) };
}

async function withRoot(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'godagents-realm-operation-'));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createFixture(root, options = {}) {
  const base = createFixtureRealm({ contract });
  const calls = { observe: 0, invoke: 0, reconcile: 0 };
  const realm = Object.freeze({
    contract,
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
    root: path.join(root, 'realm'),
    realm,
    clock: () => fixedTime,
    checkpoint: options.checkpoint,
  });
  const input = await consequenceInput(options.inputOverrides);
  const adapter = await createRealmConsequenceMissionOperationAdapter({
    host,
    consequenceInput: input,
    programId: sha256Value('realm-operation-program'),
    stepId: 'realm-consequence',
    stepIndex: 0,
    authorityCeilingDigest,
    maxCompletionTokens: 1,
    maxResultBytes: 16_000,
    clock: () => fixedTime,
  });
  return { adapter, host, input, realm, calls };
}

test('binds one recoverable Realm consequence to a body-free mission operation', async () => {
  await withRoot(async (root) => {
    const fixture = await createFixture(root);
    const source = fixture.adapter.describeSource();
    assert.equal(source.protocolId, 'eternities-recoverable-realm-consequence-mission-operation-source-v1');
    assert.equal(source.inputDigest, sha256Value(fixture.input));
    assert.equal(Object.hasOwn(source, 'proposal'), false);
    assert.equal(Object.hasOwn(source, 'contract'), false);
    assert.equal(Object.hasOwn(source, 'realm'), false);
    assert.equal(Object.hasOwn(fixture.adapter.describe(), 'authority'), true);

    const result = await (await createMissionProgramCoordinator({
      programRoot: path.join(root, 'program'),
      adapters: [fixture.adapter],
      clock: () => fixedTime,
    })).execute(programFor(fixture.adapter, fixture.input));

    assert.equal(result.status, 'completed');
    assert.equal(result.results[0].completion.kind, 'realm-consequence');
    assert.equal(result.results[0].completion.usage.completionTokens, 0);
    assert.equal(fixture.realm.inspect().counter, 1);
    assert.equal(fixture.calls.invoke, 1);
    assert.equal(Object.hasOwn(result.results[0].completion, 'action'), false);
    assert.equal(Object.hasOwn(result.results[0].completion, 'proposal'), false);
  });
});

test('terminal mission replay does not call the recoverable host or Realm twice', async () => {
  await withRoot(async (root) => {
    const fixture = await createFixture(root);
    const input = programFor(fixture.adapter, fixture.input);
    const coordinator = await createMissionProgramCoordinator({
      programRoot: path.join(root, 'program'),
      adapters: [fixture.adapter],
      clock: () => fixedTime,
    });
    const first = await coordinator.execute(input);
    const beforeCalls = { ...fixture.calls };
    const beforeRealm = fixture.realm.inspect();
    const replay = await coordinator.execute(input);
    assert.deepEqual(replay, first);
    assert.deepEqual(fixture.calls, beforeCalls);
    assert.deepEqual(fixture.realm.inspect(), beforeRealm);
  });
});

test('an admission crash recovers through the host without a duplicate Realm effect', async () => {
  await withRoot(async (root) => {
    let crash = true;
    const fixture = await createFixture(root, {
      checkpoint: async (stage) => {
        if (crash && stage === 'after-admission') throw new Error('realm admission boundary');
      },
    });
    const program = programFor(fixture.adapter, fixture.input);
    const coordinator = await createMissionProgramCoordinator({
      programRoot: path.join(root, 'program'),
      adapters: [fixture.adapter],
      clock: () => fixedTime,
    });
    await assert.rejects(
      () => coordinator.execute(program),
      (error) => /realm admission boundary/.test([
        error?.message,
        error?.cause?.message,
        error?.cause?.cause?.message,
      ].filter(Boolean).join(' ')),
    );
    assert.equal(fixture.realm.inspect().counter, 0);
    crash = false;
    const recovered = await coordinator.execute(program);
    assert.equal(recovered.status, 'completed');
    assert.equal(fixture.realm.inspect().counter, 1);
    assert.equal(fixture.calls.invoke, 1);
  });
});

test('source contract drift fails before a Realm method is called', async () => {
  await withRoot(async (root) => {
    const fixture = await createFixture(root);
    const driftedContract = structuredClone(contract);
    driftedContract.version = 'drifted';
    const driftedRealm = createFixtureRealm({ contract: driftedContract });
    const host = await createRecoverableRealmConsequenceHost({
      root: path.join(root, 'drifted-realm'),
      realm: driftedRealm,
      clock: () => fixedTime,
    });
    const adapter = await createRealmConsequenceMissionOperationAdapter({
      host,
      consequenceInput: fixture.input,
      programId: sha256Value('realm-drift-program'),
      stepId: 'realm-consequence',
      stepIndex: 0,
      authorityCeilingDigest,
      maxCompletionTokens: 1,
      maxResultBytes: 16_000,
      clock: () => fixedTime,
    });
    await assert.rejects(
      () => (async () => {
        const coordinator = await createMissionProgramCoordinator({
          programRoot: path.join(root, 'drifted-program'),
          adapters: [adapter],
          clock: () => fixedTime,
        });
        return coordinator.execute(programFor(adapter, fixture.input));
      })(),
      (error) => /contract|drift|Realm/i.test([
        error?.message,
        error?.cause?.message,
        error?.cause?.cause?.message,
        error?.cause?.cause?.cause?.message,
      ].filter(Boolean).join(' ')),
    );
    assert.deepEqual(driftedRealm.inspect(), {
      counter: 0,
      invocationCount: 0,
      reconciliationCount: 0,
      idempotencyCount: 0,
    });
  });
});

test('constructor rejects wider ceilings and credential-shaped inputs', async () => {
  await withRoot(async (root) => {
    const fixture = await createFixture(root);
    await assert.rejects(
      () => createRealmConsequenceMissionOperationAdapter({
        host: fixture.host,
        consequenceInput: fixture.input,
        programId: sha256Value('realm-wide-program'),
        stepId: 'realm-consequence',
        stepIndex: 0,
        authorityCeilingDigest,
        maxCompletionTokens: 2,
        maxResultBytes: 16_000,
        clock: () => fixedTime,
      }),
      /ceiling|bound|budget/i,
    );
    await assert.rejects(
      () => createRealmConsequenceMissionOperationAdapter({
        host: fixture.host,
        consequenceInput: { ...fixture.input, credential: { secret: 'never' } },
        programId: sha256Value('realm-credential-program'),
        stepId: 'realm-consequence',
        stepIndex: 0,
        authorityCeilingDigest,
        maxCompletionTokens: 1,
        maxResultBytes: 16_000,
        clock: () => fixedTime,
      }),
      /credential|forbidden/i,
    );
    assert.equal(fixture.realm.inspect().counter, 0);
  });
});
