import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { executeNegotiatedConsequence } from '../src/realm/negotiated-consequence-executor.mjs';

const fixturePath = new URL('../fixtures/realm-negotiated-consequence-v1.json', import.meta.url);
const contractPath = new URL('../fixtures/realm-contract.json', import.meta.url);
const genomePath = new URL('../dist/fixture-agent/agent-genome.json', import.meta.url);

test('Realm consequence executor fixture is canonical, source-bound, and exactly replayable', async () => {
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  const contractText = await readFile(contractPath, 'utf8');
  const contract = JSON.parse(contractText);
  const genomeText = await readFile(genomePath, 'utf8');
  const genome = JSON.parse(genomeText);

  assert.equal(fixtureText, `${canonicalJson(fixture)}\n`);
  const { fixtureDigest, ...unsignedFixture } = fixture;
  assert.equal(fixtureDigest, sha256Value(unsignedFixture));
  assert.equal(fixture.protocolId, 'eternities-realm-negotiated-consequence-fixture-v1');
  assert.deepEqual(fixture.sourceContract.value, contract);
  assert.equal(fixture.sourceContract.fileSha256, sha256Text(contractText));
  assert.equal(fixture.sourceContract.logicalDigest, sha256Value(contract));
  assert.deepEqual(fixture.sourceConstitution.value, genome.constitution);
  assert.equal(fixture.sourceConstitution.fileSha256, sha256Text(genomeText));
  assert.equal(fixture.sourceConstitution.logicalDigest, sha256Value(genome.constitution));

  const { input, first, exactRetry } = fixture.cases;
  assert.deepEqual(input.contract, contract);
  assertSchema('organ-proposal', input.proposal);
  assertSchema('realm-contract', input.contract);
  assertSchema('realm-negotiated-consequence', first.receipt);
  assertSchema('action-receipt', first.actionReceipt);
  assert.deepEqual(first, exactRetry);
  assert.equal(first.receipt.protocolId, 'eternities-realm-negotiated-consequence-v1');
  assert.equal(first.receipt.proposalDigest, sha256Value(input.proposal));
  assert.equal(first.receipt.negotiationDigest, first.negotiation.negotiationDigest);
  assert.equal(first.receipt.contractDigest, sha256Value(input.contract));
  assert.equal(first.receipt.authorityCeilingDigest, sha256Value(first.negotiation.authorityCeiling));
  assert.equal(first.receipt.decisionDigest, first.decision.receiptDigest);
  assert.equal(first.receipt.actionDigest, sha256Value(first.action));
  assert.equal(first.receipt.actionReceiptDigest, first.actionReceipt.receiptDigest);
  assert.equal(first.receipt.invocationStatus, first.actionReceipt.invocation.status);
  assert.equal(first.receipt.discrepancyClass, first.actionReceipt.discrepancyClass);
  assert.equal(first.receipt.disposition, first.actionReceipt.disposition);
  assertNoCredentialFields(first.receipt);
  assert.equal(canonicalJson(first.receipt).match(/amount|observe|invoke|credential/i), null);
  const { receiptDigest, ...unsignedReceipt } = first.receipt;
  assert.equal(receiptDigest, sha256Value(unsignedReceipt));

  const realm = createFixtureRealm({ contract });
  const replayInput = { ...input, realm };
  const rebuiltFirst = await executeNegotiatedConsequence(replayInput);
  const rebuiltRetry = await executeNegotiatedConsequence(replayInput);
  assert.deepEqual(rebuiltFirst, first);
  assert.deepEqual(rebuiltRetry, exactRetry);
  assert.deepEqual(realm.inspect(), {
    counter: 1,
    invocationCount: 1,
    reconciliationCount: 1,
    idempotencyCount: 1,
  });

  assert.deepEqual(fixture.assertions, {
    sourceContractCount: 1,
    sourceConstitutionCount: 1,
    successfulActions: 1,
    exactRetryStable: true,
    realmInvocationCount: 1,
    realmCounter: 1,
    idempotencyCount: 1,
    observeCalls: 3,
    invokeCalls: 1,
    reconcileCalls: 1,
    authorityExpansions: 0,
    executableFields: 0,
    credentialLeaks: 0,
    providerCalls: 0,
  });
});

