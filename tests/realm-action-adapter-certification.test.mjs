import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { verifyRealmNegotiation } from '../src/realm/negotiation.mjs';

const fixturePath = new URL('../fixtures/realm-negotiated-action-v1.json', import.meta.url);
const contractPath = new URL('../fixtures/realm-contract.json', import.meta.url);

test('Realm action adapter fixture is canonical, source-bound, and exactly replayable', async () => {
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  const contractText = await readFile(contractPath, 'utf8');
  const contract = JSON.parse(contractText);

  assert.equal(fixtureText, `${canonicalJson(fixture)}\n`);
  const { fixtureDigest, ...unsigned } = fixture;
  assert.equal(fixtureDigest, sha256Value(unsigned));
  assert.equal(fixture.protocolId, 'eternities-realm-negotiated-action-fixture-v1');
  assert.equal(fixture.sourceContract.path, 'fixtures/realm-contract.json');
  assert.equal(fixture.sourceContract.fileSha256, sha256Text(contractText));
  assert.equal(fixture.sourceContract.logicalDigest, sha256Value(contract));
  assert.deepEqual(fixture.sourceContract.value, contract);

  const { input, first, exactRetry } = fixture.cases;
  assert.deepEqual(verifyRealmNegotiation(input.negotiation, {
    contract,
    authority: input.authority,
  }), input.negotiation);
  assertSchema('decision-commit', input.decision);
  assertSchema('action-receipt', first.actionReceipt);
  assertSchema('realm-negotiated-action', first.receipt);
  assert.deepEqual(first, exactRetry);
  assert.equal(first.receipt.negotiationDigest, input.negotiation.negotiationDigest);
  assert.equal(first.receipt.contractDigest, input.negotiation.contractDigest);
  assert.equal(first.receipt.authorityCeilingDigest, sha256Value(input.negotiation.authorityCeiling));
  assert.equal(first.receipt.decisionDigest, input.decision.receiptDigest);
  assert.equal(first.receipt.actionDigest, sha256Value(input.action));
  assert.equal(first.receipt.actionReceiptDigest, first.actionReceipt.receiptDigest);
  assert.equal(first.receipt.decisionId, input.decision.decisionId);
  assert.equal(first.receipt.actionId, input.action.actionId);
  assert.equal(first.receipt.invocationStatus, first.actionReceipt.invocation.status);
  assert.equal(first.receipt.discrepancyClass, first.actionReceipt.discrepancyClass);
  assert.equal(first.receipt.disposition, first.actionReceipt.disposition);
  assertNoCredentialFields(first.receipt);
  assert.equal(canonicalJson(first.receipt).includes('amount'), false);
  assert.equal(canonicalJson(first.receipt).includes('observe'), false);
  assert.equal(canonicalJson(first.receipt).includes('invoke'), false);

  assert.deepEqual(fixture.assertions, {
    sourceContractCount: 1,
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
