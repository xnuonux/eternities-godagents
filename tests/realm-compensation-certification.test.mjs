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
import { createRecoverableRealmCompensationHost } from '../src/realm/recoverable-compensation-host.mjs';
import { createRecoverableRealmConsequenceHost } from '../src/realm/recoverable-consequence-host.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const fixturePath = new URL('../fixtures/realm-compensation-v1.json', import.meta.url);
const contractPath = new URL('../fixtures/realm-compensation-contract.json', import.meta.url);
const genomePath = new URL('../dist/fixture-agent/agent-genome.json', import.meta.url);
const now = '2026-09-04T00:00:00.000Z';

function assertCompletedCompensation(value, label) {
  assert.equal(value.status, 'completed', `${label} must complete`);
  assert.match(value.executionId, /^[a-f0-9]{64}$/);
  assertSchema('recoverable-realm-compensation', value.receipt);
  assertSchema('realm-negotiated-consequence', value.consequence.receipt);
  assertNoCredentialFields(value);
}

function assertCompletedConsequence(value, label) {
  assert.equal(value.status, 'completed', `${label} must complete`);
  assert.match(value.executionId, /^[a-f0-9]{64}$/);
  assertSchema('recoverable-realm-consequence-receipt', value.receipt);
  assertSchema('realm-negotiated-consequence', value.consequence.receipt);
  assertNoCredentialFields(value);
}

test('Realm compensation certification fixture is canonical, source-bound, and replayable', async (t) => {
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  const contractText = await readFile(contractPath, 'utf8');
  const contract = JSON.parse(contractText);
  const genomeText = await readFile(genomePath, 'utf8');
  const genome = JSON.parse(genomeText);

  assert.equal(fixtureText, `${canonicalJson(fixture)}\n`);
  const { fixtureDigest, ...unsignedFixture } = fixture;
  assert.equal(fixtureDigest, sha256Value(unsignedFixture));
  assert.equal(fixture.protocolId, 'eternities-realm-compensation-fixture-v1');
  assert.deepEqual(fixture.sourceContract.value, contract);
  assert.equal(fixture.sourceContract.fileSha256, sha256Text(contractText));
  assert.equal(fixture.sourceContract.logicalDigest, sha256Value(contract));
  assert.deepEqual(fixture.sourceConstitution.value, genome.constitution);
  assert.equal(fixture.sourceConstitution.fileSha256, sha256Text(genomeText));
  assert.equal(fixture.sourceConstitution.logicalDigest, sha256Value(genome.constitution));
  assert.deepEqual(fixture.primaryInput.contract, contract);
  assert.deepEqual(fixture.primaryInput.constitution, genome.constitution);
  assertSchema('realm-contract', fixture.sourceContract.value);
  assertSchema('realm-compensation-relation', fixture.relation);
  assertSchema('organ-proposal', fixture.primaryInput.proposal);
  assertNoCredentialFields(fixture.cases);

  const success = fixture.cases.success;
  assertCompletedConsequence(success.primary, 'primary consequence');
  assertCompletedConsequence(success.primaryRetry, 'primary retry');
  assertCompletedCompensation(success.first, 'compensation');
  assertCompletedCompensation(success.exactRetry, 'compensation retry');
  assert.deepEqual(success.eventTypes, [
    'compensation.admitted',
    'compensation.resulted',
    'compensation.receipted',
  ]);
  assert.deepEqual(success.first.consequence, success.exactRetry.consequence);
  assert.deepEqual(success.first.receipt, success.exactRetry.receipt);
  assert.equal(success.first.recovered, false);
  assert.equal(success.exactRetry.recovered, true);
  assert.equal(success.first.receipt.restorationStatus, 'restored');
  assert.equal(success.first.receipt.primaryExecutionId, success.primary.executionId);
  for (const caseName of ['afterAdmission', 'afterEffect', 'afterResult']) {
    const value = fixture.cases[caseName];
    assert.equal(value.failure.name, 'Error');
    assert.match(value.failure.message, /simulated compensation/);
    assert.deepEqual(value.eventTypes, [
      'compensation.admitted',
      'compensation.resulted',
      'compensation.receipted',
    ]);
    assertCompletedCompensation(value.recovered, `${caseName} recovery`);
  }
  assert.deepEqual(fixture.assertions, {
    authorityExpansions: 0,
    automaticRollbackCalls: 0,
    compensationEventCount: 3,
    compensationRealmCounter: 0,
    compensationRealmInvocationCount: 2,
    credentialLeaks: 0,
    exactCompensationRetryStable: true,
    inverseRelation: true,
    knownCompletePrimaryRequired: true,
    providerCalls: 0,
    successfulRestoration: true,
  });

  const primaryRoot = await mkdtemp(join(tmpdir(), 'godagents-compensation-cert-replay-primary-'));
  const compensationRoot = await mkdtemp(join(tmpdir(), 'godagents-compensation-cert-replay-compensation-'));
  t.after(() => Promise.all([
    rm(primaryRoot, { recursive: true, force: true }),
    rm(compensationRoot, { recursive: true, force: true }),
  ]));
  const realm = createFixtureRealm({ contract });
  const primaryHost = await createRecoverableRealmConsequenceHost({
    root: primaryRoot,
    realm,
    clock: () => now,
  });
  const compensationHost = await createRecoverableRealmCompensationHost({
    root: compensationRoot,
    realm,
    primaryHost,
    clock: () => now,
  });
  const primary = await primaryHost.execute(fixture.primaryInput);
  const first = await compensationHost.execute(success.input);
  const retry = await compensationHost.execute(success.input);
  assert.deepEqual(primary, success.primary);
  assert.deepEqual(first, success.first);
  assert.deepEqual(retry, success.exactRetry);
  const journal = await readVerifiedJournal(join(
    compensationRoot,
    'executions',
    first.executionId,
    'journal.jsonl',
  ));
  assert.equal(journal.events.length, 3);
  assert.equal(first.receipt.resultEventDigest, journal.events[1].contentDigest);
});
