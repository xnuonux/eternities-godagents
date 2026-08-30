import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpsTransport } from '../src/cortex/http-transport.mjs';
import { createOpenAICompatibleCortex } from '../src/cortex/openai-compatible.mjs';

const CANARY = 'canary-provider-secret-29';
const now = '2026-08-29T12:00:00.000Z';

const context = Object.freeze({
  mission: 'increment the fixture counter once',
  missionId: 'mission-1',
  observation: { observationId: 'observation-1', counter: 0 },
  stateEpoch: 0,
  now,
  constraints: {
    allowedHands: ['counter.increment'],
    permittedEffects: ['local-write'],
    availableAuthority: ['realm:write'],
    availablePreconditions: ['realm-observed'],
    handContracts: {
      'counter.increment': {
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['amount'],
          properties: { amount: { type: 'integer', minimum: 1, maximum: 1 } },
        },
        expectedOutcome: {
          type: 'observation-delta',
          fields: { counter: { observationField: 'counter', addInputField: 'amount' } },
        },
      },
    },
  },
});

const validProposalContent = Object.freeze({
  sourceStateEpoch: 0,
  claim: 'advance the observed counter by one governed step',
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

const boundContext = Object.freeze({
  ...context,
  methodEnvelopeDigest: 'f'.repeat(64),
  methodEnvelope: {
    protocolId: 'eternities-godskills-adapter-v1',
    sourceEnvelopeDigest: 'a'.repeat(64),
    releaseDigest: 'b'.repeat(64),
    stackDigest: 'c'.repeat(64),
    selectedCapabilities: ['eternities-forge'],
    methods: ['implement bounded slices'],
    evidenceRequirements: ['contract-digest'],
    proposalRequirements: ['verified implementation'],
    terminationConditions: ['fresh relevant verification passes'],
    selectedPackages: [{ id: 'eternities-forge', entrypoint: 'selected first-party text' }],
  },
});

function providerBody(content = validProposalContent, overrides = {}) {
  return JSON.stringify({
    id: 'completion-1',
    object: 'chat.completion',
    created: 1788000000,
    model: 'test-model',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: JSON.stringify(content) },
    }],
    usage: { prompt_tokens: 23, completion_tokens: 41, total_tokens: 64 },
    ...overrides,
  });
}

function response(bodyText = providerBody(), status = 200) {
  return { status, headers: { 'content-type': 'application/json' }, bodyText };
}

function createCortex(transport, overrides = {}) {
  return createOpenAICompatibleCortex({
    adapterId: 'openai-compatible-v1',
    profile: 'chat-completions-json',
    endpoint: 'https://models.example.test/v1/chat/completions',
    modelId: 'test-model',
    timeoutMs: 5_000,
    maxResponseBytes: 16_384,
    maxProposalTtlMs: 120_000,
    maxPromptBytes: 8_192,
    maxCompletionTokens: 128,
    transport,
    resolveCredential: () => CANARY,
    ...overrides,
  });
}

test('adapter emits a bounded OpenAI-compatible request and assigns trusted proposal identity', async () => {
  let captured;
  const cortex = createCortex(async (request) => {
    captured = request;
    return response();
  });

  const result = await cortex.infer(context, { attemptId: 'attempt-1', ordinal: 1 });
  const requestBody = JSON.parse(captured.body);

  assert.equal(captured.url, 'https://models.example.test/v1/chat/completions');
  assert.equal(captured.method, 'POST');
  assert.equal(captured.headers.authorization, `Bearer ${CANARY}`);
  assert.equal(requestBody.model, 'test-model');
  assert.equal(requestBody.n, 1);
  assert.equal(requestBody.max_completion_tokens, 128);
  assert.deepEqual(requestBody.response_format, { type: 'json_object' });
  assert.equal(result.status, 'accepted');
  assert.equal(result.proposal.proposalId, 'attempt-1:proposal');
  assert.equal(result.proposal.organId, 'openai-compatible-v1');
  assert.equal(result.proposal.sourceStateEpoch, 0);
  assert.deepEqual(result.proposal.evidenceRefs, ['observation-1']);
  assert.equal(result.proposal.claim, 'networked cortex proposed one bounded governed action');
  assert.equal(result.proposal.uncertainty, 'networked-provider-proposal');
  assert.deepEqual(result.usage, { inputTokens: 23, outputTokens: 41 });
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});

test('bound requests carry the exact selected method envelope and require its digest acknowledgement', async () => {
  let captured;
  const accepted = await createCortex(async (request) => {
    captured = request;
    return response(providerBody({ ...validProposalContent, methodEnvelopeDigest: 'f'.repeat(64) }));
  }).infer(boundContext, { attemptId: 'attempt-bound', ordinal: 1 });

  const requestBody = JSON.parse(captured.body);
  const user = JSON.parse(requestBody.messages[1].content);
  assert.deepEqual(user.methodEnvelope, boundContext.methodEnvelope);
  assert.equal(user.methodEnvelopeDigest, boundContext.methodEnvelopeDigest);
  assert.ok(user.requiredProposalFields.includes('methodEnvelopeDigest'));
  assert.equal(captured.body.includes('C:/dev/eternities-godskills'), false);
  assert.equal(accepted.status, 'accepted');

  const missing = await createCortex(async () => response())
    .infer(boundContext, { attemptId: 'attempt-missing-binding', ordinal: 1 });
  assert.equal(missing.reasonCode, 'schema-rejected');

  const wrong = await createCortex(async () => response(providerBody({ ...validProposalContent, methodEnvelopeDigest: '0'.repeat(64) })))
    .infer(boundContext, { attemptId: 'attempt-wrong-binding', ordinal: 1 });
  assert.equal(wrong.reasonCode, 'semantic-rejected');
});

test('adapter rejects malformed and ambiguous provider responses without a proposal', async () => {
  const cases = [
    ['multiple choices', providerBody(validProposalContent, { choices: [
      { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(validProposalContent) } },
      { index: 1, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(validProposalContent) } },
    ] }), 'invalid-response'],
    ['tool call', providerBody(validProposalContent, { choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [] } }] }), 'invalid-response'],
    ['non-text content', providerBody(validProposalContent, { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: [{ type: 'text', text: '{}' }] } }] }), 'invalid-response'],
    ['invalid JSON', providerBody(validProposalContent, { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{broken' } }] }), 'invalid-response'],
    ['unknown proposal field', providerBody({ ...validProposalContent, proposalId: 'provider-owned' }), 'schema-rejected'],
    ['stale epoch', providerBody({ ...validProposalContent, sourceStateEpoch: 9 }), 'semantic-rejected'],
    ['authority expansion', providerBody({ ...validProposalContent, requiredAuthority: ['realm:write', 'realm:admin'] }), 'semantic-rejected'],
    ['effect expansion', providerBody({ ...validProposalContent, intent: { effect: 'external-write', handId: 'counter.increment', amount: 1 } }), 'semantic-rejected'],
    ['input expansion', providerBody({ ...validProposalContent, intent: { effect: 'local-write', handId: 'counter.increment', amount: 999999 } }), 'semantic-rejected'],
    ['expected transition expansion', providerBody({ ...validProposalContent, expectedOutcome: { counter: 999999 } }), 'semantic-rejected'],
    ['credential-shaped nested field', providerBody({ ...validProposalContent, intent: { ...validProposalContent.intent, apiKey: 'not-a-real-secret' } }), 'schema-rejected'],
  ];

  for (const [name, body, reasonCode] of cases) {
    const result = await createCortex(async () => response(body)).infer(context, { attemptId: `attempt-${name}`, ordinal: 1 });
    assert.equal(result.status, 'failed', name);
    assert.equal(result.reasonCode, reasonCode, name);
    assert.equal(Object.hasOwn(result, 'proposal'), false, name);
  }
});

test('adapter rejects a provider response that reflects the bearer credential', async () => {
  const reflected = providerBody({ ...validProposalContent, claim: `reflected ${CANARY}` });
  const result = await createCortex(async () => response(reflected))
    .infer(context, { attemptId: 'attempt-reflection', ordinal: 1 });

  assert.equal(result.status, 'failed');
  assert.equal(result.reasonCode, 'schema-rejected');
  assert.equal(JSON.stringify(result).includes(CANARY), false);
});

test('adapter rejects oversized output before JSON parsing', async () => {
  const result = await createCortex(async () => response('x'.repeat(200)), { maxResponseBytes: 64 })
    .infer(context, { attemptId: 'attempt-large', ordinal: 1 });

  assert.equal(result.status, 'failed');
  assert.equal(result.reasonCode, 'oversized-output');
});

test('adapter enforces prompt and provider completion budgets before acceptance', async () => {
  let called = false;
  const oversizedPrompt = await createCortex(async () => { called = true; return response(); }, { maxPromptBytes: 256 })
    .infer({ ...context, mission: 'x'.repeat(1_000) }, { attemptId: 'attempt-large-prompt', ordinal: 1 });
  assert.equal(oversizedPrompt.reasonCode, 'budget-exhausted');
  assert.equal(called, false);

  const overBudgetEnvelope = JSON.parse(providerBody());
  overBudgetEnvelope.usage.completion_tokens = 129;
  const oversizedCompletion = await createCortex(async () => response(JSON.stringify(overBudgetEnvelope)))
    .infer(context, { attemptId: 'attempt-large-completion', ordinal: 1 });
  assert.equal(oversizedCompletion.reasonCode, 'budget-exhausted');
});

test('adapter classifies HTTP and transport failures into closed reason codes', async () => {
  const cases = [
    [401, 'authentication'],
    [403, 'authorization'],
    [400, 'invalid-request'],
    [429, 'rate-limited'],
    [503, 'transient-server'],
  ];
  for (const [status, reasonCode] of cases) {
    const result = await createCortex(async () => response('{"error":"never persist this"}', status))
      .infer(context, { attemptId: `attempt-${status}`, ordinal: 1 });
    assert.equal(result.status, 'failed');
    assert.equal(result.reasonCode, reasonCode);
    assert.equal(JSON.stringify(result).includes('never persist this'), false);
  }

  for (const [name, reasonCode] of [['AbortError', 'timeout'], ['SocketError', 'connect-failed']]) {
    const result = await createCortex(async () => { const error = new Error(CANARY); error.name = name; throw error; })
      .infer(context, { attemptId: `attempt-${name}`, ordinal: 1 });
    assert.equal(result.reasonCode, reasonCode);
    assert.equal(JSON.stringify(result).includes(CANARY), false);
  }
});

test('HTTPS transport rejects downgrade before fetch', async () => {
  let called = false;
  const transport = createHttpsTransport({ fetchImpl: async () => { called = true; } });

  await assert.rejects(
    () => transport({ url: 'http://models.example.test/v1', method: 'POST', headers: {}, body: '{}', timeoutMs: 10 }),
    /HTTPS/,
  );
  assert.equal(called, false);
});
