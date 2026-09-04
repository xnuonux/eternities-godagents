import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  REALM_NEGOTIATION_PROTOCOL_ID,
  buildRealmNegotiation,
  verifyRealmNegotiation,
} from '../src/realm/negotiation.mjs';

const fixturePath = new URL('../fixtures/realm-contract.json', import.meta.url);

async function fixtureContract() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

function writableAuthority() {
  return {
    availableAuthority: ['realm:write'],
    permittedEffects: ['local-read', 'local-write'],
  };
}

function readOnlyAuthority() {
  return {
    availableAuthority: [],
    permittedEffects: ['local-read'],
  };
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('negotiation is deterministic, authority-ceiling bound, and deeply frozen', async () => {
  const contract = await fixtureContract();
  const first = buildRealmNegotiation({ contract, authority: writableAuthority() });
  const second = buildRealmNegotiation({ contract: structuredClone(contract), authority: writableAuthority() });

  assert.deepEqual(first, second);
  assert.equal(first.protocolId, REALM_NEGOTIATION_PROTOCOL_ID);
  assert.equal(first.contractDigest, sha256Value(contract));
  assert.deepEqual(first.availableHands.map(({ id }) => id), ['counter.increment']);
  assert.deepEqual(first.omittedHandIds, []);
  assert.deepEqual(first.authorityCeiling, writableAuthority());
  assert.equal(first.availableHands[0].effect, 'local-write');
  assert.deepEqual(verifyRealmNegotiation(first, {
    contract,
    authority: writableAuthority(),
  }), first);
  assertDeepFrozen(first);
  assert.equal(canonicalJson(first).includes('invoke'), false);
  assert.equal(canonicalJson(first).includes('credential'), false);
  assert.equal(canonicalJson(first).includes('realmHandle'), false);
});

test('negotiation omits hands outside the host effect and authority ceiling', async () => {
  const contract = await fixtureContract();
  const negotiation = buildRealmNegotiation({ contract, authority: readOnlyAuthority() });

  assert.deepEqual(negotiation.availableHands, []);
  assert.deepEqual(negotiation.omittedHandIds, ['counter.increment']);
  assert.deepEqual(negotiation.authorityCeiling, readOnlyAuthority());
  assert.deepEqual(verifyRealmNegotiation(negotiation, {
    contract,
    authority: readOnlyAuthority(),
  }), negotiation);
});

test('recomputed or forged negotiation data fails closed against the exact contract and ceiling', async () => {
  const contract = await fixtureContract();
  const authority = writableAuthority();
  const original = buildRealmNegotiation({ contract, authority });

  const changedHand = structuredClone(original);
  changedHand.availableHands[0].effect = 'remote-delete';
  const changedHandUnsigned = structuredClone(changedHand);
  delete changedHandUnsigned.negotiationDigest;
  changedHand.negotiationDigest = sha256Value(changedHandUnsigned);
  assert.throws(
    () => verifyRealmNegotiation(changedHand, { contract, authority }),
    /hand|effect|digest|negotiation/i,
  );

  const expandedAuthority = structuredClone(original);
  expandedAuthority.authorityCeiling.availableAuthority.push('realm:admin');
  assert.throws(
    () => verifyRealmNegotiation(expandedAuthority, { contract, authority }),
    /authority|ceiling|digest/i,
  );

  const changedContract = structuredClone(contract);
  changedContract.realmId = 'forged-realm';
  assert.throws(
    () => verifyRealmNegotiation(original, { contract: changedContract, authority }),
    /contract|digest|realm/i,
  );
});

test('contract cross-reference and sensitive-field violations fail before negotiation', async () => {
  const contract = await fixtureContract();
  const invalidReference = structuredClone(contract);
  invalidReference.hands[0].expectedOutcome.fields.counter.observationField = 'missing-observation';
  assert.throws(
    () => buildRealmNegotiation({ contract: invalidReference, authority: writableAuthority() }),
    /observation|contract|reference/i,
  );

  const invalidInput = structuredClone(contract);
  invalidInput.hands[0].expectedOutcome.fields.counter.addInputField = 'not-required';
  assert.throws(
    () => buildRealmNegotiation({ contract: invalidInput, authority: writableAuthority() }),
    /input|contract|reference/i,
  );

  const sensitiveAuthority = {
    ...writableAuthority(),
    credential: 'must-not-enter',
  };
  assert.throws(
    () => buildRealmNegotiation({ contract, authority: sensitiveAuthority }),
    /field|authority|credential/i,
  );
});

test('negotiation exposes only declared hand contracts and never an executable Realm capability', async () => {
  const contract = await fixtureContract();
  const negotiation = buildRealmNegotiation({ contract, authority: writableAuthority() });
  const hand = negotiation.availableHands[0];

  assert.deepEqual(Object.keys(hand).sort(), [
    'effect', 'expectedOutcome', 'id', 'idempotent', 'inputSchema', 'requiredAuthority',
  ]);
  assert.equal(Object.hasOwn(negotiation, 'invoke'), false);
  assert.equal(Object.hasOwn(negotiation, 'observe'), false);
  assert.equal(Object.hasOwn(negotiation, 'credentials'), false);
  assert.equal(Object.hasOwn(negotiation, 'realm'), false);
  assert.equal(Object.hasOwn(negotiation, 'handle'), false);
});
