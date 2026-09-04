import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';
import {
  RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID,
  createRecoverableRealmConsequenceHost,
} from '../src/realm/recoverable-consequence-host.mjs';

const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));
const genome = JSON.parse(await readFile(new URL('../dist/fixture-agent/agent-genome.json', import.meta.url), 'utf8'));
const now = '2026-09-04T00:00:00.000Z';

const authority = {
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};

const mission = {
  missionId: 'mission-recoverable-consequence-1',
  authority: ['realm:write'],
};

const state = {
  instanceId: 'godagent-recoverable-consequence-fixture',
  epoch: 0,
  now,
  preconditions: ['realm-observed'],
};

async function proposalFor() {
  return createFixtureCortexA().infer({
    missionId: mission.missionId,
    observation: { observationId: 'observation-0', counter: 0 },
    stateEpoch: state.epoch,
    now,
  });
}

async function inputFor() {
  return {
    mission,
    proposal: await proposalFor(),
    contract,
    authority,
    constitution: genome.constitution,
    state,
  };
}

async function temporaryRoot() {
  return mkdtemp(join(tmpdir(), 'godagents-recoverable-consequence-'));
}

async function withHost(options, callback) {
  const root = await temporaryRoot();
  try {
    const realm = options.realm ?? createFixtureRealm({ contract });
    const host = await createRecoverableRealmConsequenceHost({ root, realm, ...options });
    return await callback({ host, realm, root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function journalFor(root, executionId) {
  return readVerifiedJournal(join(root, 'executions', executionId, 'journal.jsonl'));
}

test('the opt-in host durably binds one consequence and exact retries do not duplicate the Realm effect', async () => {
  await withHost({}, async ({ host, realm, root }) => {
    const input = await inputFor();
    const first = await host.execute(input);
    const retry = await host.execute(input);

    assert.equal(first.status, 'completed');
    assert.equal(first.recovered, false);
    assert.equal(first.receipt.protocolId, RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID);
    assert.equal(first.receipt.inputDigest, sha256Value(input));
    assertSchema('recoverable-realm-consequence-receipt', first.receipt);
    assert.deepEqual(retry.consequence, first.consequence);
    assert.deepEqual(retry.receipt, first.receipt);
    assert.equal(retry.recovered, true);
    assert.deepEqual(realm.inspect(), {
      counter: 1,
      invocationCount: 1,
      reconciliationCount: 0,
      idempotencyCount: 1,
    });

    const journal = await journalFor(root, first.executionId);
    assert.deepEqual(journal.events.map(({ eventType }) => eventType), [
      'consequence.admitted',
      'consequence.resulted',
      'consequence.receipted',
    ]);
    assert.equal(journal.events.at(-1).payload.receipt.receiptDigest, first.receipt.receiptDigest);
  });
});

test('a process boundary after admission resumes the consequence without rewriting the admission', async () => {
  let crashed = false;
  await withHost({
    checkpoint: async (stage) => {
      if (!crashed && stage === 'after-admission') {
        crashed = true;
        throw new Error('simulated process boundary');
      }
    },
  }, async ({ host, realm, root }) => {
    const input = await inputFor();
    const executionId = host.executionIdFor(input);
    await assert.rejects(() => host.execute(input), /simulated process boundary/);
    assert.equal(realm.inspect().invocationCount, 0);
    assert.deepEqual((await journalFor(root, executionId)).events.map(({ eventType }) => eventType), [
      'consequence.admitted',
    ]);

    const resumed = await host.recover(executionId);
    assert.equal(resumed.status, 'completed');
    assert.equal(resumed.recovered, true);
    assert.equal(realm.inspect().invocationCount, 1);
  });
});

test('a process boundary after the external effect recovers through the child idempotency and reconciliation path', async () => {
  let crashed = false;
  await withHost({
    checkpoint: async (stage) => {
      if (!crashed && stage === 'before-result-publish') {
        crashed = true;
        throw new Error('effect returned before durable result');
      }
    },
  }, async ({ host, realm, root }) => {
    const input = await inputFor();
    const executionId = host.executionIdFor(input);
    await assert.rejects(() => host.execute(input), /effect returned before durable result/);
    assert.equal(realm.inspect().counter, 1);
    assert.equal(realm.inspect().invocationCount, 1);
    assert.deepEqual((await journalFor(root, executionId)).events.map(({ eventType }) => eventType), [
      'consequence.admitted',
    ]);

    const resumed = await host.recover(executionId);
    assert.equal(resumed.status, 'completed');
    assert.equal(realm.inspect().counter, 1);
    assert.equal(realm.inspect().invocationCount, 1);
    assert.ok(realm.inspect().reconciliationCount >= 1);
  });
});

test('a process boundary after durable result publication finishes from the journal without a Realm call', async () => {
  let crashed = false;
  await withHost({
    checkpoint: async (stage) => {
      if (!crashed && stage === 'after-result-publish') {
        crashed = true;
        throw new Error('receipt publication interrupted');
      }
    },
  }, async ({ host, realm }) => {
    const input = await inputFor();
    const first = await host.execute(input).catch((error) => {
      assert.match(error.message, /receipt publication interrupted/);
      return null;
    });
    assert.equal(first, null);
    const before = realm.inspect();
    const resumed = await host.recover(host.executionIdFor(input));
    assert.equal(resumed.status, 'completed');
    assert.deepEqual(realm.inspect(), before);
  });
});

test('invalid authority and credential-shaped inputs fail before admission or Realm use', async () => {
  await withHost({}, async ({ host, realm, root }) => {
    const input = await inputFor();
    await assert.rejects(() => host.execute({
      ...input,
      mission: { ...mission, authority: ['realm:write', 'root:admin'] },
    }), /mission authority exceeds host ceiling/);
    await assert.rejects(() => host.execute({
      ...input,
      proposal: { ...input.proposal, credentials: { note: 'never persisted' } },
    }), /credential-shaped field rejected/);
    assert.deepEqual(realm.inspect(), {
      counter: 0,
      invocationCount: 0,
      reconciliationCount: 0,
      idempotencyCount: 0,
    });
    const entries = await readdir(join(root, 'executions'));
    assert.deepEqual(entries, []);
  });
});

test('tampered journal bytes fail closed before recovery can reach the Realm', async () => {
  let crashed = false;
  await withHost({
    checkpoint: async (stage) => {
      if (!crashed && stage === 'after-admission') {
        crashed = true;
        throw new Error('leave admitted journal');
      }
    },
  }, async ({ host, realm, root }) => {
    const input = await inputFor();
    const executionId = host.executionIdFor(input);
    await assert.rejects(() => host.execute(input), /leave admitted journal/);
    const journalPath = join(root, 'executions', executionId, 'journal.jsonl');
    const original = await readFile(journalPath, 'utf8');
    await writeFile(journalPath, original.replace('mission-recoverable-consequence-1', 'tampered-mission'), 'utf8');
    await assert.rejects(() => host.recover(executionId), /journal digest mismatch|journal integrity/i);
    assert.equal(realm.inspect().invocationCount, 0);
  });
});

test('inspection is bounded and never exposes the stored proposal, action, or Realm port', async () => {
  await withHost({}, async ({ host }) => {
    const input = await inputFor();
    const before = await host.inspect(host.executionIdFor(input));
    assert.deepEqual(before, {
      executionId: host.executionIdFor(input),
      status: 'absent',
      eventCount: 0,
      journalHeadDigest: '0'.repeat(64),
    });
    const completed = await host.execute(input);
    const after = await host.inspect(completed.executionId);
    assert.equal(after.status, 'completed');
    assert.equal(after.eventCount, 3);
    assert.equal(after.journalHeadDigest, completed.journalHeadDigest);
    assert.equal(Object.hasOwn(after, 'input'), false);
    assert.equal(Object.hasOwn(after, 'consequence'), false);
    assert.equal(Object.hasOwn(after, 'realm'), false);
  });
});

test('an uncertain child effect remains an explicit terminal escalation and is still recoverable', async () => {
  await withHost({ realm: createFixtureRealm({ contract, failureMode: 'post-effect-transport' }) }, async ({ host, realm }) => {
    const result = await host.execute(await inputFor());
    assert.equal(result.receipt.invocationStatus, 'applied');
    assert.equal(result.receipt.discrepancyClass, 'none');
    assert.equal(realm.inspect().invocationCount, 1);
  });
});
