import assert from 'node:assert/strict';
import test from 'node:test';

import { DecisionRequiredError } from '../src/core/errors.mjs';
import { commitDecision } from '../src/runtime/arbiter.mjs';
import { createFixtureCortexA, createFixtureCortexB } from '../src/runtime/fixture-cortex.mjs';
import { collectProposals } from '../src/runtime/scheduler.mjs';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function proposal({
  proposalId,
  priority = 10,
  cost = 1,
  epoch = 2,
  authority = ['realm:write'],
  preconditions = ['realm-observed'],
  effect = 'local-write',
  amount = 1,
  expiresAt = '2026-08-28T00:01:00.000Z',
} = {}) {
  return {
    schemaVersion: 1,
    proposalId,
    organId: 'planner',
    organVersion: '1',
    sourceStateEpoch: epoch,
    claim: `increment by ${amount}`,
    evidenceRefs: ['observation-1'],
    intent: { effect, handId: 'counter.increment', amount },
    expectedOutcome: { counter: amount },
    cost,
    risk: 'low',
    uncertainty: 'verified-fixture',
    requiredAuthority: authority,
    preconditions,
    expiresAt,
    priority,
  };
}

const state = {
  epoch: 2,
  missionId: 'mission-1',
  now: '2026-08-28T00:00:00.000Z',
  preconditions: ['realm-observed'],
};
const constitution = {
  principles: ['purpose-is-not-permission', 'capability-is-not-authority'],
  allowedEffects: ['local-read', 'local-write'],
};

test('concurrent organ completion order cannot change canonical proposal order', async () => {
  const organs = [
    { id: 'slow', async propose() { await wait(15); return proposal({ proposalId: 'slow' }); } },
    { id: 'fast', async propose() { await wait(1); return proposal({ proposalId: 'fast' }); } },
  ];

  const proposals = await collectProposals({ organs, state, context: {} });

  assert.deepEqual(proposals.map((entry) => entry.proposalId), ['fast', 'slow']);
});

test('organs receive frozen state and no Realm hand', async () => {
  let observed;
  const organs = [{
    id: 'observer',
    async propose(receivedState, context) {
      observed = {
        stateFrozen: Object.isFrozen(receivedState),
        preconditionsFrozen: Object.isFrozen(receivedState.preconditions),
        hasRealm: Object.hasOwn(context, 'realm'),
        hasInvoke: Object.hasOwn(context, 'invoke'),
      };
      return proposal({ proposalId: 'observer' });
    },
  }];

  await collectProposals({ organs, state, context: { observationId: 'observation-1' } });

  assert.deepEqual(observed, {
    stateFrozen: true,
    preconditionsFrozen: true,
    hasRealm: false,
    hasInvoke: false,
  });
});

test('constitutional arbiter commits exactly one proposal using deterministic ranking', () => {
  const proposals = [
    proposal({ proposalId: 'lower-priority', priority: 8, amount: 2 }),
    proposal({ proposalId: 'higher-cost', priority: 10, cost: 2, amount: 3 }),
    proposal({ proposalId: 'selected', priority: 10, cost: 1, amount: 1 }),
  ];

  const decision = commitDecision({
    proposals,
    state,
    constitution,
    authority: ['realm:write'],
  });

  assert.deepEqual(decision.selectedProposalIds, ['selected']);
  assert.deepEqual(decision.committedIntent, {
    effect: 'local-write',
    handId: 'counter.increment',
    amount: 1,
  });
  assert.equal(decision.sourceStateEpoch, 2);
  assert.equal(decision.receiptDigest.length, 64);
});

test('stale, expired, unauthorized, and constitutionally forbidden proposals fail closed', () => {
  const invalidSets = [
    [proposal({ proposalId: 'stale', epoch: 1 })],
    [proposal({ proposalId: 'expired', expiresAt: '2026-08-27T23:59:59.000Z' })],
    [proposal({ proposalId: 'unauthorized', authority: ['realm:admin'] })],
    [proposal({ proposalId: 'forbidden', effect: 'external-write' })],
  ];

  for (const proposals of invalidSets) {
    assert.throws(
      () => commitDecision({ proposals, state, constitution, authority: ['realm:write'] }),
      (error) => error instanceof DecisionRequiredError
        && error.categories.includes('no-admissible-proposal'),
    );
  }
});

test('fixture cortexes are replaceable proposal sources with equivalent intent', async () => {
  const input = {
    mission: 'increment the fixture counter once',
    missionId: 'mission-1',
    observation: { observationId: 'observation-1', counter: 0 },
    stateEpoch: 2,
    now: '2026-08-28T00:00:00.000Z',
  };
  const cortexA = createFixtureCortexA();
  const cortexB = createFixtureCortexB();

  const fromA = await cortexA.infer(input);
  const fromB = await cortexB.infer(input);

  assert.notEqual(cortexA.adapterId, cortexB.adapterId);
  assert.notEqual(fromA.proposalId, fromB.proposalId);
  assert.deepEqual(fromA.intent, fromB.intent);
  assert.deepEqual(fromA.expectedOutcome, fromB.expectedOutcome);
  assert.equal(Object.hasOwn(fromA, 'invoke'), false);
  assert.equal(Object.hasOwn(fromB, 'invoke'), false);
});
