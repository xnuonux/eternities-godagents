import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { UncertainEffectError } from '../src/core/errors.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import {
  REALM_COMPENSATION_RELATION_PROTOCOL_ID,
  buildRealmCompensationRelation,
  verifyRealmCompensationRelation,
} from '../src/realm/compensation.mjs';
import {
  REALM_COMPENSATION_PROTOCOL_ID,
  assertRecoverableRealmCompensationHost,
  createRecoverableRealmCompensationHost,
} from '../src/realm/recoverable-compensation-host.mjs';
import { createRecoverableRealmConsequenceHost } from '../src/realm/recoverable-consequence-host.mjs';

const contract = JSON.parse(await readFile(new URL('../fixtures/realm-compensation-contract.json', import.meta.url), 'utf8'));
const genome = JSON.parse(await readFile(new URL('../dist/fixture-agent/agent-genome.json', import.meta.url), 'utf8'));
const now = '2026-09-04T00:00:00.000Z';

const authority = {
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};

const mission = {
  missionId: 'mission-compensation-1',
  authority: ['realm:write'],
};

const state = {
  instanceId: 'godagent-compensation-fixture',
  epoch: 0,
  now,
  preconditions: ['realm-observed'],
};

function proposalFor({ compensating = false, missionId = mission.missionId } = {}) {
  return {
    schemaVersion: 1,
    proposalId: compensating ? 'fixture-compensation-proposal' : 'fixture-primary-proposal',
    organId: compensating ? 'fixture-compensator' : 'fixture-primary',
    organVersion: '1',
    sourceStateEpoch: state.epoch,
    claim: compensating ? 'restore the counter before the explicit primary transition' : 'advance the counter once',
    evidenceRefs: ['observation-0'],
    intent: {
      effect: 'local-write',
      handId: compensating ? 'counter.decrement' : 'counter.increment',
      amount: 1,
    },
    expectedOutcome: { counter: compensating ? 0 : 1 },
    cost: 1,
    risk: 'low',
    uncertainty: 'verified-fixture',
    requiredAuthority: ['realm:write'],
    preconditions: ['realm-observed'],
    expiresAt: new Date(Date.parse(now) + 60_000).toISOString(),
    priority: 10,
  };
}

function consequenceInput({ compensating = false, overrides = {} } = {}) {
  return {
    mission,
    proposal: proposalFor({ compensating }),
    contract,
    authority,
    constitution: genome.constitution,
    state,
    ...overrides,
  };
}

function relation() {
  return buildRealmCompensationRelation({
    contract,
    primaryHandId: 'counter.increment',
    compensatingHandId: 'counter.decrement',
    payloadBindings: [{ primaryField: 'amount', compensatingField: 'amount' }],
    outputBindings: [{ primaryField: 'counter', compensatingField: 'counter' }],
  });
}

async function roots() {
  return {
    primary: await mkdtemp(join(tmpdir(), 'godagents-primary-consequence-')),
    compensation: await mkdtemp(join(tmpdir(), 'godagents-compensation-')),
  };
}

async function withHosts(callback, {
  realm = createFixtureRealm({ contract }),
  primaryOptions = {},
  compensationOptions = {},
} = {}) {
  const paths = await roots();
  try {
    const primaryHost = await createRecoverableRealmConsequenceHost({
      root: paths.primary,
      realm,
      clock: () => now,
      ...primaryOptions,
    });
    const compensationHost = await createRecoverableRealmCompensationHost({
      root: paths.compensation,
      realm,
      primaryHost,
      clock: () => now,
      ...compensationOptions,
    });
    return await callback({ primaryHost, compensationHost, realm, paths });
  } finally {
    await Promise.all(Object.values(paths).map((path) => rm(path, { recursive: true, force: true })));
  }
}

async function admitPrimary(primaryHost) {
  return primaryHost.execute(consequenceInput());
}

function compensationInput(primaryExecutionId, overrides = {}) {
  return {
    primaryExecutionId,
    relation: relation(),
    input: consequenceInput({ compensating: true, overrides }),
  };
}

async function journalEvents(root, executionId) {
  const text = await readFile(join(root, 'executions', executionId, 'journal.jsonl'), 'utf8');
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

test('compensation relation is canonical and proves opposite declared transitions', () => {
  const value = relation();
  assert.equal(value.protocolId, REALM_COMPENSATION_RELATION_PROTOCOL_ID);
  assertSchema('realm-compensation-relation', value);
  assert.deepEqual(verifyRealmCompensationRelation(value, { contract }), value);

  const changed = structuredClone(value);
  changed.contractDigest = '0'.repeat(64);
  assert.throws(() => verifyRealmCompensationRelation(changed, { contract }), /contract|digest/);
  assert.throws(() => buildRealmCompensationRelation({
    contract,
    primaryHandId: 'counter.increment',
    compensatingHandId: 'counter.increment',
    payloadBindings: [{ primaryField: 'amount', compensatingField: 'amount' }],
    outputBindings: [{ primaryField: 'counter', compensatingField: 'counter' }],
  }), /opposite|distinct|inverse/);
});

test('recoverable compensation restores a known complete consequence exactly once', async () => {
  await withHosts(async ({ primaryHost, compensationHost, realm, paths }) => {
    const primary = await admitPrimary(primaryHost);
    const input = compensationInput(primary.executionId);
    const first = await compensationHost.execute(input);
    const retry = await compensationHost.execute(input);

    assert.equal(first.status, 'completed');
    assert.equal(first.recovered, false);
    assert.equal(first.receipt.protocolId, REALM_COMPENSATION_PROTOCOL_ID);
    assert.equal(first.receipt.primaryExecutionId, primary.executionId);
    assert.equal(first.receipt.restorationStatus, 'restored');
    assert.equal(first.receipt.disposition, 'complete');
    assertSchema('recoverable-realm-compensation', first.receipt);
    assert.equal(retry.recovered, true);
    assert.deepEqual(retry.receipt, first.receipt);
    assert.deepEqual(realm.inspect(), {
      counter: 0,
      invocationCount: 2,
      reconciliationCount: 0,
      idempotencyCount: 2,
    });
    assert.deepEqual((await journalEvents(paths.compensation, first.executionId)).map(({ eventType }) => eventType), [
      'compensation.admitted',
      'compensation.resulted',
      'compensation.receipted',
    ]);
  });
});

test('unknown or incomplete primary effects fail before compensation admission', async () => {
  let primaryCrashed = false;
  await withHosts(async ({ primaryHost, compensationHost, realm }) => {
    const primaryInput = consequenceInput();
    await assert.rejects(() => primaryHost.execute(primaryInput), /primary boundary/);
    const knownButIncomplete = primaryHost.executionIdFor(primaryInput);
    await assert.rejects(
      () => compensationHost.execute(compensationInput(knownButIncomplete)),
      /primary.*complete|eligible/,
    );
    await assert.rejects(
      () => compensationHost.execute(compensationInput('0'.repeat(64))),
      /does not exist|primary/,
    );
    assert.equal(realm.inspect().invocationCount, 0);
  }, {
    primaryOptions: {
      checkpoint: async (stage) => {
        if (!primaryCrashed && stage === 'after-admission') {
          primaryCrashed = true;
          throw new Error('primary boundary');
        }
      },
    },
  });
});

test('uncertain primary effects are never automatically compensated', async () => {
  const uncertainRealm = Object.freeze({
    contract,
    async observe() {
      return { observationId: 'uncertain-observation', counter: 0 };
    },
    async invoke() {
      throw new UncertainEffectError('uncertain-primary');
    },
    async reconcile() {
      return { invocation: null, observation: { observationId: 'uncertain-reconciliation', counter: 0 } };
    },
    inspect() {
      return { invocationCount: 0 };
    },
  });
  await withHosts(async ({ primaryHost, compensationHost, realm }) => {
    const primary = await admitPrimary(primaryHost);
    assert.equal(primary.receipt.invocationStatus, 'uncertain');
    await assert.rejects(
      () => compensationHost.execute(compensationInput(primary.executionId)),
      /primary.*complete|eligible|uncertain/,
    );
    assert.deepEqual(realm.inspect(), { invocationCount: 0 });
  }, { realm: uncertainRealm });
});

test('authority and relation expansion fail before the compensating Realm call', async () => {
  await withHosts(async ({ primaryHost, compensationHost, realm }) => {
    const primary = await admitPrimary(primaryHost);
    await assert.rejects(
      () => compensationHost.execute(compensationInput(primary.executionId, {
        mission: { ...mission, authority: ['realm:write', 'root:admin'] },
      })),
      /authority exceeds|authority|ceiling/,
    );
    const changed = compensationInput(primary.executionId);
    changed.relation = { ...changed.relation, compensatingHandId: 'counter.increment' };
    await assert.rejects(() => compensationHost.execute(changed), /relation|opposite|compensat/);
    assert.equal(realm.inspect().invocationCount, 1);
  });
});

test('compensation recovers after admission without rewriting the admission', async () => {
  let crashed = false;
  await withHosts(async ({ primaryHost, realm, paths }) => {
    const primary = await admitPrimary(primaryHost);
    const input = compensationInput(primary.executionId);
    const firstHost = await createRecoverableRealmCompensationHost({
      root: paths.compensation,
      realm,
      primaryHost,
      clock: () => now,
      checkpoint: async (stage) => {
        if (!crashed && stage === 'after-admission') {
          crashed = true;
          throw new Error('compensation admission boundary');
        }
      },
    });
    const executionId = firstHost.executionIdFor(input);
    await assert.rejects(() => firstHost.execute(input), /compensation admission boundary/);
    const before = await journalEvents(paths.compensation, executionId);
    const resumed = await firstHost.recover(executionId);
    const after = await journalEvents(paths.compensation, executionId);
    assert.equal(resumed.status, 'completed');
    assert.equal(before.length, 1);
    assert.equal(after[0].contentDigest, before[0].contentDigest);
    assert.equal(realm.inspect().counter, 0);
  });
});

test('compensation recovers after external effect without a duplicate mutation', async () => {
  let crashed = false;
  await withHosts(async ({ primaryHost, realm, paths }) => {
    const primary = await admitPrimary(primaryHost);
    const input = compensationInput(primary.executionId);
    const firstHost = await createRecoverableRealmCompensationHost({
      root: paths.compensation,
      realm,
      primaryHost,
      clock: () => now,
      checkpoint: async (stage) => {
        if (!crashed && stage === 'before-result-publish') {
          crashed = true;
          throw new Error('compensation effect boundary');
        }
      },
    });
    const executionId = firstHost.executionIdFor(input);
    await assert.rejects(() => firstHost.execute(input), /compensation effect boundary/);
    assert.equal(realm.inspect().counter, 0);
    const resumed = await firstHost.recover(executionId);
    assert.equal(resumed.status, 'completed');
    assert.equal(realm.inspect().invocationCount, 2);
    assert.equal(realm.inspect().idempotencyCount, 2);
    assert.equal((await journalEvents(paths.compensation, executionId)).length, 3);
  });
});

test('changed compensation journals and unexpected entries fail closed', async () => {
  await withHosts(async ({ primaryHost, compensationHost, paths }) => {
    const primary = await admitPrimary(primaryHost);
    const input = compensationInput(primary.executionId);
    const executionId = compensationHost.executionIdFor(input);
    await assert.rejects(() => compensationHost.execute(input), /.+/);
    await writeFile(join(paths.compensation, 'executions', executionId, 'unknown.json'), '{}', 'utf8');
    await assert.rejects(() => compensationHost.recover(executionId), /unexpected|entry/);
  }, {
    compensationOptions: {
      checkpoint: async () => { throw new Error('stop before compensation'); },
    },
  });
});

test('credential-shaped compensation input and forged host instances are rejected', async () => {
  await withHosts(async ({ primaryHost, compensationHost }) => {
    assert.equal(assertRecoverableRealmCompensationHost(compensationHost), compensationHost);
    assert.throws(() => assertRecoverableRealmCompensationHost({
      descriptor: compensationHost.descriptor,
      execute: compensationHost.execute,
    }), /brand|provenance/);
    const primary = await admitPrimary(primaryHost);
    const forged = compensationInput(primary.executionId);
    forged.input = { ...forged.input, credential: 'compensation-canary' };
    await assert.rejects(() => compensationHost.execute(forged), /credential|sensitive|input/);
  });
});

test('descriptor is explicit about compensation limits and has no hidden authority', async () => {
  await withHosts(async ({ compensationHost }) => {
    assert.deepEqual(Object.keys(compensationHost).sort(), [
      'descriptor', 'execute', 'executionIdFor', 'inspect', 'recover',
    ]);
    assert.equal(compensationHost.descriptor.protocolId, REALM_COMPENSATION_PROTOCOL_ID);
    assert.equal(compensationHost.descriptor.automaticRollback, false);
    assert.equal(compensationHost.descriptor.uncertainPrimaryAccepted, false);
    assert.equal(compensationHost.descriptor.authorityExpanded, false);
  });
});
