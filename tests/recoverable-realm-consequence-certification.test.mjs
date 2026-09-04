import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createRecoverableRealmConsequenceHost } from '../src/realm/recoverable-consequence-host.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const fixturePath = new URL('../fixtures/recoverable-realm-consequence-v1.json', import.meta.url);
const contractPath = new URL('../fixtures/realm-contract.json', import.meta.url);
const genomePath = new URL('../dist/fixture-agent/agent-genome.json', import.meta.url);
const now = '2026-09-04T00:00:00.000Z';

function trackedRealm(contract, options = {}) {
  const base = createFixtureRealm({ contract, ...options });
  const calls = { observe: 0, invoke: 0, reconcile: 0 };
  const realm = Object.freeze({
    contract: base.contract,
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
  });
  return { realm, calls, inspect: base.inspect };
}

async function replayCase(t, fixture, caseFixture, contract, { stage, message, realmOptions = {} }) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-recoverable-realm-replay-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let crashed = false;
  const tracked = trackedRealm(contract, realmOptions);
  const host = await createRecoverableRealmConsequenceHost({
    root,
    realm: tracked.realm,
    clock: () => now,
    checkpoint: async (checkpointStage) => {
      if (!crashed && checkpointStage === stage) {
        crashed = true;
        throw new Error(message);
      }
    },
  });
  const executionId = host.executionIdFor(fixture.cases.input);
  await assert.rejects(() => host.execute(fixture.cases.input), new RegExp(message));
  const beforeRecovery = tracked.inspect();
  const callsBeforeRecovery = { ...tracked.calls };
  const recovered = await host.recover(executionId);
  const afterRecovery = tracked.inspect();
  const callsAfterRecovery = { ...tracked.calls };
  const journal = await readVerifiedJournal(join(root, 'executions', executionId, 'journal.jsonl'));
  assert.deepEqual(recovered, caseFixture.recovered);
  assert.deepEqual(journal.events.map(({ eventType }) => eventType), caseFixture.eventTypes);
  assert.deepEqual({ callsBeforeRecovery, callsAfterRecovery, beforeRecovery, afterRecovery }, caseFixture.realm);
}

test('recoverable consequence fixture is canonical, source-bound, and reproduces every recovery boundary', async (t) => {
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  const contractText = await readFile(contractPath, 'utf8');
  const contract = JSON.parse(contractText);
  const genomeText = await readFile(genomePath, 'utf8');
  const genome = JSON.parse(genomeText);

  assert.equal(fixtureText, `${canonicalJson(fixture)}\n`);
  const { fixtureDigest, ...unsignedFixture } = fixture;
  assert.equal(fixtureDigest, sha256Value(unsignedFixture));
  assert.equal(fixture.protocolId, 'eternities-recoverable-realm-consequence-fixture-v1');
  assert.deepEqual(fixture.sourceContract.value, contract);
  assert.equal(fixture.sourceContract.fileSha256, sha256Text(contractText));
  assert.equal(fixture.sourceContract.logicalDigest, sha256Value(contract));
  assert.deepEqual(fixture.sourceConstitution.value, genome.constitution);
  assert.equal(fixture.sourceConstitution.fileSha256, sha256Text(genomeText));
  assert.equal(fixture.sourceConstitution.logicalDigest, sha256Value(genome.constitution));
  assert.deepEqual(fixture.cases.input.contract, contract);
  assertSchema('organ-proposal', fixture.cases.input.proposal);
  assertSchema('realm-contract', fixture.cases.input.contract);
  assertNoCredentialFields(fixture.cases);

  const root = await mkdtemp(join(tmpdir(), 'godagents-recoverable-realm-replay-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tracked = trackedRealm(contract);
  const host = await createRecoverableRealmConsequenceHost({
    root,
    realm: tracked.realm,
    clock: () => now,
  });
  const first = await host.execute(fixture.cases.input);
  const exactRetry = await host.execute(fixture.cases.input);
  const journal = await readVerifiedJournal(join(root, 'executions', first.executionId, 'journal.jsonl'));
  assert.deepEqual(first, fixture.cases.primary.first);
  assert.deepEqual(exactRetry, fixture.cases.primary.exactRetry);
  assert.deepEqual(journal.events.map(({ eventType }) => eventType), fixture.cases.primary.eventTypes);
  assert.deepEqual({ calls: tracked.calls, state: tracked.inspect() }, fixture.cases.primary.realm);
  assert.equal(first.receipt.resultEventDigest, journal.events[1].contentDigest);
  assertSchema('recoverable-realm-consequence-receipt', first.receipt);

  await replayCase(t, fixture, fixture.cases.afterAdmission, contract, {
    stage: 'after-admission',
    message: 'simulated after-admission boundary',
  });
  await replayCase(t, fixture, fixture.cases.afterEffect, contract, {
    stage: 'before-result-publish',
    message: 'simulated after-effect boundary',
  });
  await replayCase(t, fixture, fixture.cases.afterResult, contract, {
    stage: 'after-result-publish',
    message: 'simulated after-result boundary',
  });

  assert.deepEqual(fixture.assertions, {
    admissionEventCount: 4,
    authorityExpansions: 0,
    credentialLeaks: 0,
    operationCount: 4,
    postEffectMutationCount: 1,
    postEffectReconciliationCount: 1,
    postResultRecoveryCalls: 0,
    providerCalls: 0,
    realmMutations: 4,
    receiptEventCount: 4,
    resultEventCount: 4,
    rollbackCalls: 0,
    terminalReplayStable: true,
  });
});
