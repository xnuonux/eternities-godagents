import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptedProposal, failedInference } from '../src/cortex/result.mjs';
import { runInference } from '../src/cortex/inference-runner.mjs';

const digest = (character) => character.repeat(64);
const context = Object.freeze({
  instanceId: 'instance-1',
  mission: 'increment once',
  missionId: 'mission-1',
  observation: { observationId: 'observation-1', counter: 0 },
  stateEpoch: 0,
  now: '2026-08-29T12:00:00.000Z',
  constraints: {
    allowedHands: ['counter.increment'],
    permittedEffects: ['local-write'],
    availableAuthority: ['realm:write'],
    availablePreconditions: ['realm-observed'],
  },
});

const policy = Object.freeze({
  maxAttempts: 2,
  retryableReasonCodes: ['timeout', 'connect-failed', 'rate-limited', 'transient-server'],
  hostPolicyId: 'policy-1',
  hostPolicyDigest: digest('f'),
});

const proposalFor = (attemptId) => ({
  schemaVersion: 1,
  proposalId: `${attemptId}:proposal`,
  organId: 'networked-test',
  organVersion: '1',
  sourceStateEpoch: 0,
  claim: 'advance once',
  evidenceRefs: ['observation-1'],
  intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
  expectedOutcome: { counter: 1 },
  cost: 1,
  risk: 'low',
  uncertainty: 'test',
  requiredAuthority: ['realm:write'],
  preconditions: ['realm-observed'],
  expiresAt: '2026-08-29T12:01:00.000Z',
  priority: 10,
});

function scriptedCortex(script, eventLog) {
  let prepared = 0;
  let executed = 0;
  return {
    adapterId: 'networked-test',
    profile: 'test-json',
    get preparedCount() { return prepared; },
    get executedCount() { return executed; },
    prepare(_context, attempt) {
      prepared += 1;
      const metadata = {
        attemptId: attempt.attemptId,
        ordinal: attempt.ordinal,
        adapterId: 'networked-test',
        profile: 'test-json',
        modelId: 'test-model',
        requestDigest: digest(String(attempt.ordinal)),
      };
      return {
        metadata,
        async execute() {
          executed += 1;
          assert.equal(eventLog.at(-1).eventType, 'cortex.requested');
          const step = script[executed - 1];
          if (step === 'accepted') {
            return acceptedProposal(proposalFor(attempt.attemptId), {
              ...metadata,
              responseDigest: digest('a'),
              usage: { inputTokens: 3, outputTokens: 5 },
            });
          }
          return failedInference(step, metadata);
        },
      };
    },
  };
}

test('timeout then success records two attempts before returning one accepted proposal', async () => {
  const events = [];
  const cortex = scriptedCortex(['timeout', 'accepted'], events);
  const result = await runInference({
    cortex,
    context,
    policy,
    record: async (eventType, payload) => events.push({ eventType, payload }),
  });

  assert.equal(result.status, 'accepted');
  assert.deepEqual(events.map((event) => event.eventType), [
    'cortex.requested',
    'cortex.failed',
    'cortex.requested',
    'cortex.accepted',
  ]);
  assert.notEqual(events[0].payload.inference.attemptId, events[2].payload.inference.attemptId);
  assert.equal(events[3].payload.proposal.proposalId, result.proposal.proposalId);
  assert.equal(cortex.executedCount, 2);
});

test('retry exhaustion is durable and does not exceed the attempt ceiling', async () => {
  const events = [];
  const cortex = scriptedCortex(['timeout', 'timeout', 'accepted'], events);
  const result = await runInference({
    cortex,
    context,
    policy,
    record: async (eventType, payload) => events.push({ eventType, payload }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.reasonCode, 'retry-exhausted');
  assert.equal(cortex.executedCount, 2);
  assert.equal(events.at(-1).payload.inference.reasonCode, 'retry-exhausted');
});

test('non-retryable inference failure stops after one attempt', async () => {
  const events = [];
  const cortex = scriptedCortex(['authentication', 'accepted'], events);
  const result = await runInference({
    cortex,
    context,
    policy,
    record: async (eventType, payload) => events.push({ eventType, payload }),
  });

  assert.equal(result.reasonCode, 'authentication');
  assert.equal(cortex.executedCount, 1);
  assert.deepEqual(events.map((event) => event.eventType), ['cortex.requested', 'cortex.failed']);
});

test('recovery after a requested attempt consumes the next ordinal and never rewrites the first', async () => {
  const events = [];
  const cortex = scriptedCortex(['accepted'], events);
  const result = await runInference({
    cortex,
    context,
    policy,
    existingAttempts: 1,
    record: async (eventType, payload) => events.push({ eventType, payload }),
  });

  assert.equal(result.status, 'accepted');
  assert.equal(events[0].payload.inference.ordinal, 2);
  assert.equal(cortex.executedCount, 1);
});

test('recovery with an exhausted attempt budget records terminal failure without another request', async () => {
  const events = [];
  const cortex = scriptedCortex(['accepted'], events);
  const lastAttempt = {
    attemptId: 'attempt-already-requested',
    ordinal: 2,
    adapterId: 'networked-test',
    profile: 'test-json',
    modelId: 'test-model',
    requestDigest: digest('2'),
  };
  const result = await runInference({
    cortex,
    context,
    policy,
    existingAttempts: 2,
    lastAttempt,
    record: async (eventType, payload) => events.push({ eventType, payload }),
  });

  assert.equal(result.reasonCode, 'retry-exhausted');
  assert.equal(cortex.preparedCount, 0);
  assert.equal(cortex.executedCount, 0);
  assert.deepEqual(events.map((event) => event.eventType), ['cortex.failed']);
});
