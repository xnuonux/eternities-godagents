import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import {
  REALM_NEGOTIATED_CONSEQUENCE_PROTOCOL_ID,
  executeNegotiatedConsequence,
} from '../src/realm/negotiated-consequence-executor.mjs';

const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));
const genome = JSON.parse(await readFile(new URL('../dist/fixture-agent/agent-genome.json', import.meta.url), 'utf8'));
const now = '2026-09-04T00:00:00.000Z';

const hostAuthority = {
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};

const mission = {
  missionId: 'mission-consequence-1',
  authority: ['realm:write'],
};

const state = {
  instanceId: 'godagent-consequence-fixture',
  epoch: 0,
  now,
  preconditions: ['realm-observed'],
};

async function proposalFor(missionId = mission.missionId, stateEpoch = state.epoch) {
  return (await createFixtureCortexA().infer({
    missionId,
    observation: { observationId: 'observation-0', counter: 0 },
    stateEpoch,
    now,
  }));
}

function inputFor(realm, proposal) {
  return {
    mission,
    proposal,
    contract,
    authority: hostAuthority,
    constitution: genome.constitution,
    realm,
    state,
  };
}

function trackedRealm() {
  const base = createFixtureRealm({ contract });
  const calls = { observe: 0, invoke: 0, reconcile: 0 };
  const realm = Object.freeze({
    contract,
    async observe() {
      calls.observe += 1;
      return base.observe();
    },
    async invoke(input) {
      calls.invoke += 1;
      return base.invoke(input);
    },
    async reconcile(input) {
      calls.reconcile += 1;
      return base.reconcile(input);
    },
  });
  return { realm, calls, inspect: base.inspect };
}

test('the opt-in seam binds a verified proposal to negotiation, decision, action, and child receipt', async () => {
  const realm = createFixtureRealm({ contract });
  const proposal = await proposalFor();
  const result = await executeNegotiatedConsequence(inputFor(realm, proposal));

  assert.equal(result.receipt.protocolId, REALM_NEGOTIATED_CONSEQUENCE_PROTOCOL_ID);
  assert.equal(result.receipt.missionId, mission.missionId);
  assert.equal(result.receipt.proposalDigest, sha256Value(proposal));
  assert.equal(result.receipt.stateEpoch, state.epoch);
  assert.equal(result.negotiation.authorityCeiling.availableAuthority[0], 'realm:write');
  assert.deepEqual(result.negotiation.authorityCeiling.permittedEffects, ['local-write']);
  assert.deepEqual(result.action.payload, { amount: 1 });
  assert.equal(result.receipt.negotiationDigest, result.negotiation.negotiationDigest);
  assert.equal(result.receipt.decisionDigest, result.decision.receiptDigest);
  assert.equal(result.receipt.actionDigest, sha256Value(result.action));
  assert.equal(result.receipt.actionReceiptDigest, result.actionReceipt.receiptDigest);
  assert.equal(result.actionReceipt.discrepancyClass, 'none');
  assert.equal(realm.inspect().counter, 1);
  assert.equal(Object.hasOwn(result.receipt, 'payload'), false);
  assert.equal(Object.hasOwn(result.receipt, 'credential'), false);
  assertSchema('realm-negotiated-consequence', result.receipt);
});

test('replaying the exact seam input reuses the child idempotency identity without duplicating the Realm effect', async () => {
  const realm = createFixtureRealm({ contract });
  const proposal = await proposalFor();
  const input = inputFor(realm, proposal);
  const first = await executeNegotiatedConsequence(input);
  const second = await executeNegotiatedConsequence(input);

  assert.equal(realm.inspect().counter, 1);
  assert.equal(realm.inspect().invocationCount, 1);
  assert.equal(second.actionReceipt.receiptDigest, first.actionReceipt.receiptDigest);
  assert.equal(second.receipt.receiptDigest, first.receipt.receiptDigest);
  assert.ok(realm.inspect().reconciliationCount >= 1);
});

test('mission authority is intersected with the host ceiling and cannot expand it', async () => {
  const realm = createFixtureRealm({ contract });
  const proposal = await proposalFor();
  const result = await executeNegotiatedConsequence({
    ...inputFor(realm, proposal),
    authority: {
      availableAuthority: ['realm:write', 'unrelated:authority'],
      permittedEffects: ['local-read', 'local-write', 'unrelated-effect'],
    },
  });

  assert.deepEqual(result.negotiation.authorityCeiling.availableAuthority, ['realm:write']);
  assert.deepEqual(result.negotiation.authorityCeiling.permittedEffects, ['local-write']);
});

test('authority expansion fails before any Realm method is called', async () => {
  const tracked = trackedRealm();
  const proposal = await proposalFor();

  await assert.rejects(
    () => executeNegotiatedConsequence({
      ...inputFor(tracked.realm, proposal),
      mission: { ...mission, authority: ['realm:write', 'root:admin'] },
    }),
    /mission authority exceeds host ceiling/,
  );
  assert.deepEqual(tracked.calls, { observe: 0, invoke: 0, reconcile: 0 });
});

test('stale proposals, disallowed effects, and mismatched hands fail closed before Realm observation', async () => {
  const stale = trackedRealm();
  const staleProposal = await proposalFor(mission.missionId, 1);
  await assert.rejects(
    () => executeNegotiatedConsequence(inputFor(stale.realm, staleProposal)),
    /proposal source epoch does not match execution state/,
  );
  assert.deepEqual(stale.calls, { observe: 0, invoke: 0, reconcile: 0 });

  const mismatch = trackedRealm();
  const mismatchProposal = await proposalFor();
  mismatchProposal.intent.effect = 'local-read';
  await assert.rejects(
    () => executeNegotiatedConsequence(inputFor(mismatch.realm, mismatchProposal)),
    /proposal effect does not match its Realm hand/,
  );
  assert.deepEqual(mismatch.calls, { observe: 0, invoke: 0, reconcile: 0 });

  const disallowed = trackedRealm();
  const disallowedProposal = await proposalFor();
  await assert.rejects(
    () => executeNegotiatedConsequence({
      ...inputFor(disallowed.realm, disallowedProposal),
      authority: { ...hostAuthority, permittedEffects: ['local-read'] },
    }),
    /selected Realm hand is outside the effective authority ceiling/,
  );
  assert.deepEqual(disallowed.calls, { observe: 0, invoke: 0, reconcile: 0 });
});

test('unparseable and expired proposal deadlines fail before any Realm method is called', async () => {
  for (const expiresAt of ['not-a-date', '2026-09-03T23:59:59.999Z']) {
    const tracked = trackedRealm();
    const proposal = await proposalFor();
    proposal.expiresAt = expiresAt;

    await assert.rejects(
      () => executeNegotiatedConsequence(inputFor(tracked.realm, proposal)),
      /proposal expiry must be a finite date after execution state/,
    );
    assert.deepEqual(tracked.calls, { observe: 0, invoke: 0, reconcile: 0 });
  }
});

test('credential-shaped proposals are rejected before schema or Realm processing', async () => {
  const tracked = trackedRealm();
  const proposal = await proposalFor();
  proposal.credentials = { note: 'must never cross the seam' };

  await assert.rejects(
    () => executeNegotiatedConsequence(inputFor(tracked.realm, proposal)),
    /credential-shaped field rejected/,
  );
  assert.deepEqual(tracked.calls, { observe: 0, invoke: 0, reconcile: 0 });
});
