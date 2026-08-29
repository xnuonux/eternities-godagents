import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptedProposal,
  assertCortexResult,
  failedInference,
} from '../src/cortex/result.mjs';

const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);

const proposal = Object.freeze({
  schemaVersion: 1,
  proposalId: 'attempt-1:proposal',
  organId: 'openai-compatible-v1',
  organVersion: '1',
  sourceStateEpoch: 0,
  claim: 'advance the observed counter once',
  evidenceRefs: ['observation-1'],
  intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
  expectedOutcome: { counter: 1 },
  cost: 1,
  risk: 'low',
  uncertainty: 'provider-proposal',
  requiredAuthority: ['realm:write'],
  preconditions: ['realm-observed'],
  expiresAt: '2026-08-29T12:01:00.000Z',
  priority: 10,
});

const metadata = Object.freeze({
  attemptId: 'attempt-1',
  ordinal: 1,
  adapterId: 'openai-compatible-v1',
  profile: 'chat-completions-json',
  modelId: 'test-model',
  requestDigest: digestA,
});

test('accepted cortex result contains one validated proposal and sanitized metadata', () => {
  const result = acceptedProposal(proposal, {
    ...metadata,
    responseDigest: digestB,
    usage: { inputTokens: 3, outputTokens: 5 },
  });

  assert.equal(assertCortexResult(result), result);
  assert.equal(result.status, 'accepted');
  assert.equal(result.proposal, proposal);
  assert.deepEqual(result.usage, { inputTokens: 3, outputTokens: 5 });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.usage), true);
  assert.equal(JSON.stringify(result).includes('rawResponse'), false);
});

test('failed cortex result accepts only a closed failure reason', () => {
  const result = failedInference('timeout', metadata);

  assert.equal(assertCortexResult(result), result);
  assert.equal(result.status, 'failed');
  assert.equal(result.reasonCode, 'timeout');
  assert.equal(Object.hasOwn(result, 'proposal'), false);
  assert.throws(() => failedInference('provider-said-something', metadata), /reasonCode/);
});

test('cortex result rejects unknown metadata without echoing its value', () => {
  assert.throws(
    () => failedInference('timeout', { ...metadata, rawResponse: 'do-not-echo-provider-body' }),
    (error) => !error.message.includes('do-not-echo-provider-body'),
  );
});

test('accepted cortex result rejects malformed digests and proposals', () => {
  assert.throws(
    () => acceptedProposal(proposal, { ...metadata, responseDigest: 'short' }),
    /responseDigest/,
  );
  assert.throws(
    () => acceptedProposal({ ...proposal, unexpected: true }, { ...metadata, responseDigest: digestB }),
    /organ-proposal/,
  );
});
