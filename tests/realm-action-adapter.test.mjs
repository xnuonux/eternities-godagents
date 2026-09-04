import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { AuthorityError, IntegrityError } from '../src/core/errors.mjs';
import { executeNegotiatedAction } from '../src/realm/negotiated-action-adapter.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { buildRealmNegotiation } from '../src/realm/negotiation.mjs';
import { commitDecision } from '../src/runtime/arbiter.mjs';

const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));

function writableAuthority() {
  return {
    availableAuthority: ['realm:write'],
    permittedEffects: ['local-read', 'local-write'],
  };
}

function decision({ amount = 1, expectedCounter = amount } = {}) {
  const proposal = {
    schemaVersion: 1,
    proposalId: `proposal-${amount}`,
    organId: 'planner',
    organVersion: '1',
    sourceStateEpoch: 0,
    claim: `increment by ${amount}`,
    evidenceRefs: ['observation-0'],
    intent: { effect: 'local-write', handId: 'counter.increment', amount },
    expectedOutcome: { counter: expectedCounter },
    cost: 1,
    risk: 'low',
    uncertainty: 'verified-fixture',
    requiredAuthority: ['realm:write'],
    preconditions: ['realm-observed'],
    expiresAt: '2026-08-28T00:01:00.000Z',
    priority: 10,
  };
  return commitDecision({
    proposals: [proposal],
    state: {
      epoch: 0,
      missionId: 'mission-adapter-1',
      now: '2026-08-28T00:00:00.000Z',
      preconditions: ['realm-observed'],
    },
    constitution: {
      principles: ['purpose-is-not-permission'],
      allowedEffects: ['local-write'],
    },
    authority: ['realm:write'],
  });
}

function action(committed, payload = { amount: 1 }) {
  return {
    actionId: 'action:adapter:1',
    idempotencyKey: 'adapter:cycle-1',
    handId: committed.committedIntent.handId,
    payload,
  };
}

function countingRealm(realm) {
  const calls = { observe: 0, invoke: 0, reconcile: 0 };
  return {
    calls,
    realm: {
      contract: realm.contract,
      async observe(...args) {
        calls.observe += 1;
        return realm.observe(...args);
      },
      async invoke(...args) {
        calls.invoke += 1;
        return realm.invoke(...args);
      },
      async reconcile(...args) {
        calls.reconcile += 1;
        return realm.reconcile(...args);
      },
    },
  };
}

function validInput(overrides = {}) {
  const authority = writableAuthority();
  const committed = decision();
  const actionValue = action(committed);
  const realm = createFixtureRealm({ contract });
  return {
    negotiation: buildRealmNegotiation({ contract, authority }),
    contract,
    authority,
    decision: committed,
    action: actionValue,
    realm,
    stateEpoch: 0,
    ...overrides,
  };
}

test('negotiated execution binds the exact discovery, decision, action, and child receipt', async () => {
  const input = validInput();
  const result = await executeNegotiatedAction(input);

  assert.equal(result.receipt.protocolId, 'eternities-realm-negotiated-action-v1');
  assert.equal(result.receipt.negotiationDigest, input.negotiation.negotiationDigest);
  assert.equal(result.receipt.contractDigest, input.negotiation.contractDigest);
  assert.equal(result.receipt.decisionId, input.decision.decisionId);
  assert.equal(result.receipt.actionId, input.action.actionId);
  assert.equal(result.receipt.authorityCeilingDigest, sha256Value(input.negotiation.authorityCeiling));
  assert.equal(result.receipt.decisionDigest, input.decision.receiptDigest);
  assert.equal(result.receipt.actionDigest, sha256Value(input.action));
  assert.equal(result.receipt.actionReceiptDigest, result.actionReceipt.receiptDigest);
  assert.equal(result.receipt.invocationStatus, 'applied');
  assert.equal(result.receipt.discrepancyClass, 'none');
  assert.equal(result.receipt.disposition, 'complete');
  const { receiptDigest, ...unsigned } = result.receipt;
  assert.equal(receiptDigest, sha256Value(unsigned));
  assert.equal(result.actionReceipt.realmId, 'fixture-workbench');
  assert.equal(input.realm.inspect().counter, 1);
});

test('exact retry reuses the Realm idempotency result without a duplicate effect', async () => {
  const input = validInput();
  const first = await executeNegotiatedAction(input);
  const second = await executeNegotiatedAction(input);

  assert.deepEqual(second.receipt, first.receipt);
  assert.deepEqual(second.actionReceipt, first.actionReceipt);
  assert.deepEqual(input.realm.inspect(), {
    counter: 1,
    invocationCount: 1,
    reconciliationCount: 1,
    idempotencyCount: 1,
  });
});

test('stale negotiation fails before a Realm method is called', async () => {
  const authority = writableAuthority();
  const input = validInput();
  const counted = countingRealm(input.realm);
  const stale = buildRealmNegotiation({ contract, authority: {
    availableAuthority: [],
    permittedEffects: ['local-read'],
  } });

  await assert.rejects(
    () => executeNegotiatedAction({ ...input, negotiation: stale, realm: counted.realm }),
    /negotiation|hand|authority|ceiling/i,
  );
  assert.deepEqual(counted.calls, { observe: 0, invoke: 0, reconcile: 0 });
});

test('Realm source drift fails before observation', async () => {
  const input = validInput();
  const changedContract = structuredClone(contract);
  changedContract.realmId = 'changed-realm';
  const counted = countingRealm(createFixtureRealm({ contract }));

  await assert.rejects(
    () => executeNegotiatedAction({
      ...input,
      realm: { ...counted.realm, contract: changedContract },
    }),
    IntegrityError,
  );
  assert.deepEqual(counted.calls, { observe: 0, invoke: 0, reconcile: 0 });
});

test('omitted and non-idempotent hands fail before invocation', async () => {
  const input = validInput();
  const counted = countingRealm(input.realm);
  const readOnlyNegotiation = buildRealmNegotiation({
    contract,
    authority: { availableAuthority: [], permittedEffects: ['local-read'] },
  });
  await assert.rejects(
    () => executeNegotiatedAction({
      ...input,
      negotiation: readOnlyNegotiation,
      authority: { availableAuthority: [], permittedEffects: ['local-read'] },
      realm: counted.realm,
    }),
    AuthorityError,
  );
  assert.deepEqual(counted.calls, { observe: 0, invoke: 0, reconcile: 0 });

  const nonIdempotentContract = structuredClone(contract);
  nonIdempotentContract.hands[0].idempotent = false;
  const nonIdempotent = countingRealm(createFixtureRealm({ contract: nonIdempotentContract }));
  const nonIdempotentInput = validInput({
    contract: nonIdempotentContract,
    negotiation: buildRealmNegotiation({ contract: nonIdempotentContract, authority: writableAuthority() }),
    realm: nonIdempotent.realm,
  });
  await assert.rejects(
    () => executeNegotiatedAction(nonIdempotentInput),
    AuthorityError,
  );
  assert.deepEqual(nonIdempotent.calls, { observe: 0, invoke: 0, reconcile: 0 });
});

test('payload, action, and input-shape violations fail before Realm observation', async () => {
  for (const overrides of [
    { action: action(decision(), { amount: 2 }) },
    { action: { ...action(decision()), payload: { amount: 1, token: 'do-not-record' } } },
    { extra: 'not accepted' },
  ]) {
    const input = validInput();
    const counted = countingRealm(input.realm);
    await assert.rejects(
      () => executeNegotiatedAction({ ...input, ...overrides, realm: counted.realm }),
      /action|payload|input|field|credential/i,
    );
    assert.deepEqual(counted.calls, { observe: 0, invoke: 0, reconcile: 0 });
  }
});

test('receipt does not include the action payload or a callable Realm surface', async () => {
  const input = validInput();
  const result = await executeNegotiatedAction(input);
  const serialized = canonicalJson(result.receipt);

  assert.equal(serialized.includes('amount'), false);
  assert.equal(serialized.includes('observe'), false);
  assert.equal(serialized.includes('invoke'), false);
  assert.equal(serialized.includes('credential'), false);
  assert.equal(Object.hasOwn(result.receipt, 'realm'), false);
  assert.equal(Object.hasOwn(result.receipt, 'action'), false);
});
