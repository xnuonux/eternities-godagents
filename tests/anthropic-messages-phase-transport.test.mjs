import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { verifyIdentityBoundNativeCompletion } from '../src/runtime/identity-bound-native-contracts.mjs';
import { verifyMissionRevisionTransportCompletion } from '../src/runtime/mission-revision-transport-contracts.mjs';
import { verifyGodskillsReviewTransportCompletion } from '../src/skills/review-transport-contracts.mjs';
import { createAnthropicMessagesPhaseTransportSuite } from '../src/transports/anthropic-messages-phase-transport.mjs';
import { buildProviderPhaseResponseWitness } from '../src/transports/provider-phase-resolution.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import {
  nativeDispatch,
  reviewDispatch,
  revisionDispatch,
} from './helpers/openai-compatible-phase-operation-fixture.mjs';
import {
  signProviderResolutionDecision,
  unsignedProviderResolutionDecision,
  validProviderPhaseResolutionPolicy,
} from './helpers/provider-phase-resolution-fixture.mjs';

function nativeResponse(content = 'one durable Anthropic native artifact') {
  return {
    type: 'message',
    id: 'msg_durable_native_fixture',
    role: 'assistant',
    model: 'claude-fixture-2026-08-31',
    content: [{ type: 'text', text: canonicalJson({ content }) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 200,
      cache_creation_input_tokens: 40,
      cache_read_input_tokens: 100,
      output_tokens: 30,
      output_tokens_details: { thinking_tokens: 0 },
    },
  };
}

function phaseResponse(content, id = 'msg_durable_phase_fixture') {
  return {
    type: 'message',
    id,
    role: 'assistant',
    model: 'claude-fixture-2026-08-31',
    content: [{ type: 'text', text: canonicalJson(content) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 180,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 80,
      output_tokens: 25,
      output_tokens_details: { thinking_tokens: 0 },
    },
  };
}

async function allFileText(root) {
  const chunks = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) chunks.push(await readFile(child, 'utf8'));
    }
  }
  await walk(root);
  return chunks.join('\n');
}

async function setup(t, {
  fetchImpl,
  checkpoint = async () => {},
  policy = validAnthropicMessagesPhasePolicy(),
  times = ['2026-08-31T23:10:00.000Z', '2026-08-31T23:10:00.250Z'],
  clock,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-anthropic-phase-transport-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policyPath = join(root, 'policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const secret = 'anthropic-durable-secret-canary';
  const env = {
    GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256: policyDigest,
    [policy.provider.credentialEnv]: secret,
  };
  const captured = [];
  const suite = await createAnthropicMessagesPhaseTransportSuite({
    policyPath,
    env,
    runtimeRoot: join(root, 'operations'),
    clock: clock ?? (() => times.shift()),
    checkpoint,
    fetchImpl: fetchImpl ?? (async (url, request) => {
      captured.push({ url: String(url), request: structuredClone(request) });
      return new Response(JSON.stringify(nativeResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  });
  return { root, policy, policyPath, policyDigest, secret, env, suite, captured };
}

function recoveredAnthropicResponse(content = 'one recovered Anthropic native artifact') {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify(nativeResponse(content)),
  };
}

function recoveredAnthropicPhaseResponse(content, id) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify(phaseResponse(content, id)),
  };
}

async function resolutionController(state, overrides = {}) {
  const policy = {
    ...validProviderPhaseResolutionPolicy({ transportPolicyDigest: state.policyDigest }),
    ...overrides,
  };
  const policyPath = join(state.root, 'resolution-policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const controller = await state.suite.createOperatorResolutionController({
    policyPath,
    env: { GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256: policyDigest },
  });
  return { controller, policyDigest };
}

function decisionFor(operation, policyDigest, overrides = {}) {
  return signProviderResolutionDecision(unsignedProviderResolutionDecision({
    policyDigest,
    phase: operation.phase,
    dispatchDigest: operation.dispatchDigest,
    requestDigest: operation.requestDigest,
    attemptId: operation.attemptId,
    ...overrides,
  }));
}

function rehashProviderResolutionRecord(value) {
  const decision = value.signedDecision.decision;
  const { decisionDigest: _oldDecisionDigest, ...decisionUnsigned } = decision;
  decision.decisionDigest = sha256Value(decisionUnsigned);
  value.decisionDigest = decision.decisionDigest;
  const { recordDigest: _oldRecordDigest, ...recordUnsigned } = value;
  value.recordDigest = sha256Value(recordUnsigned);
  return value;
}

test('native Anthropic transport durably binds exact headers completion and separate cache evidence', async (t) => {
  const state = await setup(t);
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);

  assert.deepEqual(await state.suite.native.reconcile(dispatch), { status: 'absent' });
  const executed = await state.suite.native.execute(dispatch);
  assert.equal(executed.status, 'completed');
  verifyIdentityBoundNativeCompletion(executed.completion, {
    dispatch,
    transportDescriptor: state.suite.descriptors.native,
  });
  assert.deepEqual(executed.completion.usage, {
    inputTokens: 340,
    cachedInputTokens: 100,
    reasoningTokens: 0,
    visibleOutputTokens: 30,
    completionTokens: 30,
  });

  assert.equal(state.captured.length, 1);
  assert.equal(state.captured[0].url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(state.captured[0].request.headers, {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': state.secret,
  });
  assert.equal(state.captured[0].request.body.includes(state.secret), false);

  const evidencePath = join(
    state.root,
    'operations',
    'native',
    dispatch.dispatchDigest,
    'provider-evidence.json',
  );
  const evidenceText = await readFile(evidencePath, 'utf8');
  const evidence = JSON.parse(evidenceText);
  assert.equal(evidence.protocolId, 'eternities-provider-phase-evidence-v1');
  assert.equal(evidence.dispatchDigest, dispatch.dispatchDigest);
  assert.equal(evidence.completionDigest, executed.completion.completionDigest);
  assert.deepEqual(evidence.providerUsage, {
    uncachedInputTokens: 200,
    cacheCreationInputTokens: 40,
    cacheReadInputTokens: 100,
    outputTokens: 30,
    thinkingTokens: 0,
  });
  assert.equal(evidenceText.includes(state.secret), false);
});

test('completed reconstruction replays without credential resolution or provider work', async (t) => {
  const state = await setup(t);
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  const completed = await state.suite.native.execute(dispatch);
  delete state.env[state.policy.provider.credentialEnv];
  let networkCalls = 0;
  const reconstructed = await createAnthropicMessagesPhaseTransportSuite({
    policyPath: state.policyPath,
    env: state.env,
    runtimeRoot: join(state.root, 'operations'),
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('completed replay must not reach provider');
    },
  });

  assert.deepEqual(await reconstructed.native.reconcile(dispatch), completed);
  assert.deepEqual(await reconstructed.native.execute(dispatch), completed);
  assert.equal(networkCalls, 0);
});

test('tampered provider evidence is operation integrity failure rather than provider output failure', async (t) => {
  const state = await setup(t);
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await state.suite.native.execute(dispatch);
  const evidencePath = join(
    state.root,
    'operations',
    'native',
    dispatch.dispatchDigest,
    'provider-evidence.json',
  );
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  evidence.providerUsage.cacheReadInputTokens = -1;
  await writeFile(evidencePath, `${canonicalJson(evidence)}\n`, 'utf8');

  await assert.rejects(
    state.suite.native.reconcile(dispatch),
    (error) => error.code === 'operation-integrity',
  );
});

test('concurrent execution of one dispatch performs at most one Anthropic request', async (t) => {
  let networkCalls = 0;
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const state = await setup(t, {
    fetchImpl: async () => {
      networkCalls += 1;
      await blocked;
      return new Response(JSON.stringify(nativeResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  const first = state.suite.native.execute(dispatch);
  while (networkCalls === 0) await new Promise((resolve) => setImmediate(resolve));
  const second = state.suite.native.execute(dispatch);
  release();
  const outcomes = await Promise.allSettled([first, second]);

  assert.equal(networkCalls, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejected = outcomes.find(({ status }) => status === 'rejected');
  assert.equal(rejected.reason.code, 'operation-pending');
});

test('interruption after attempt publication remains pending and never redispatches', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    checkpoint: async (label) => {
      if (label === 'after-anthropic-phase-attempt-persisted') throw new Error('fixture interruption');
    },
    fetchImpl: async () => {
      networkCalls += 1;
      return new Response(JSON.stringify(nativeResponse()), { status: 200 });
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'operation-integrity');
  assert.equal(networkCalls, 0);

  const reconstructed = await createAnthropicMessagesPhaseTransportSuite({
    policyPath: state.policyPath,
    env: state.env,
    runtimeRoot: join(state.root, 'operations'),
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('pending operation must not redispatch');
    },
  });
  assert.deepEqual(await reconstructed.native.reconcile(dispatch), { status: 'pending' });
  await assert.rejects(reconstructed.native.execute(dispatch), (error) => error.code === 'operation-pending');
  assert.equal(networkCalls, 0);
});

test('ambiguous network outcome remains pending without duplicate provider work', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('fixture connection reset after send');
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'provider-ambiguous');
  assert.deepEqual(await state.suite.native.reconcile(dispatch), { status: 'pending' });
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'operation-pending');
  assert.equal(networkCalls, 1);
});

test('provider rejection closes durably without retaining raw body or credential', async (t) => {
  const rawError = 'provider-only rejection detail must not persist';
  let networkCalls = 0;
  const state = await setup(t, {
    fetchImpl: async () => {
      networkCalls += 1;
      return new Response(JSON.stringify({ type: 'error', error: { message: rawError } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'provider-rejected');
  await assert.rejects(state.suite.native.reconcile(dispatch), (error) => error.code === 'provider-rejected');
  const durableText = await allFileText(join(state.root, 'operations'));
  assert.equal(durableText.includes(rawError), false);
  assert.equal(durableText.includes(state.secret), false);
  assert.match(durableText, /"responseDigest":"[a-f0-9]{64}"/);
  assert.equal(networkCalls, 1);
});

test('credential reflection closes durably and sanitized', async (t) => {
  const state = await setup(t, {
    fetchImpl: async () => new Response(JSON.stringify(nativeResponse('reflected credential placeholder')), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  const reflected = nativeResponse(state.secret);
  state.suite = await createAnthropicMessagesPhaseTransportSuite({
    policyPath: state.policyPath,
    env: state.env,
    runtimeRoot: join(state.root, 'reflected-operations'),
    clock: (() => {
      const values = [
        '2026-08-31T23:20:00.000Z',
        '2026-08-31T23:20:00.250Z',
        '2026-08-31T23:20:00.500Z',
      ];
      return () => values.shift();
    })(),
    fetchImpl: async () => new Response(JSON.stringify(reflected), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const reflectedDispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(
    state.suite.native.execute(reflectedDispatch),
    (error) => error.code === 'credential-reflected' && !error.message.includes(state.secret),
  );
  const durableText = await allFileText(join(state.root, 'reflected-operations'));
  assert.equal(durableText.includes(state.secret), false);
});

test('review and revision use the same durable engine and trusted completion contracts', async (t) => {
  const responses = [
    phaseResponse({ recommendation: 'accept', findings: [], summary: 'durable review accepts exact subject' }),
    phaseResponse({
      addressedFindingIds: ['bind-evidence'],
      content: 'durable revision binds the requested evidence',
    }),
  ];
  const state = await setup(t, {
    times: [
      '2026-08-31T23:30:00.000Z', '2026-08-31T23:30:00.250Z',
      '2026-08-31T23:31:00.000Z', '2026-08-31T23:31:00.250Z',
    ],
    fetchImpl: async () => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const review = await reviewDispatch(state.suite.descriptors.review);
  const reviewed = await state.suite.review.execute(review);
  verifyGodskillsReviewTransportCompletion(reviewed.completion, {
    dispatch: review,
    transportDescriptor: state.suite.descriptors.review,
  });

  const revision = revisionDispatch(state.suite.descriptors.revision);
  const revised = await state.suite.revision.execute(revision);
  verifyMissionRevisionTransportCompletion(revised.completion, {
    dispatch: revision,
    transportDescriptor: state.suite.descriptors.revision,
  });
  assert.deepEqual(revised.completion.artifact.addressedFindingIds, ['bind-evidence']);
});

test('credential preflight rejects leaked input without provider work or disclosure', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('credential preflight must not call provider');
    },
  });
  assert.deepEqual(state.suite.assertCredentialAbsent({ objective: 'ordinary mission' }), {
    objective: 'ordinary mission',
  });
  assert.throws(
    () => state.suite.assertCredentialAbsent({ objective: `leaked ${state.secret}` }),
    (error) => error.code === 'credential-in-input' && !error.message.includes(state.secret),
  );
  assert.equal(networkCalls, 0);
});

test('interruption after provider evidence publication remains pending without redispatch', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    checkpoint: async (label) => {
      if (label === 'after-anthropic-phase-provider-evidence-persisted') {
        throw new Error('fixture interruption after provider evidence');
      }
    },
    fetchImpl: async () => {
      networkCalls += 1;
      return new Response(JSON.stringify(nativeResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'operation-integrity');
  assert.deepEqual(await state.suite.native.reconcile(dispatch), { status: 'pending' });
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'operation-pending');
  assert.equal(networkCalls, 1);
});

test('stranded provider evidence is still integrity-checked before pending reconciliation', async (t) => {
  const state = await setup(t, {
    checkpoint: async (label) => {
      if (label === 'after-anthropic-phase-provider-evidence-persisted') {
        throw new Error('fixture interruption before completion');
      }
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'operation-integrity');
  const evidencePath = join(
    state.root,
    'operations',
    'native',
    dispatch.dispatchDigest,
    'provider-evidence.json',
  );
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  evidence.providerUsage.cacheCreationInputTokens = -1;
  await writeFile(evidencePath, `${canonicalJson(evidence)}\n`, 'utf8');

  await assert.rejects(
    state.suite.native.reconcile(dispatch),
    (error) => error.code === 'operation-integrity',
  );
});

test('bounded response overflow closes before raw response persistence', async (t) => {
  const policy = validAnthropicMessagesPhasePolicy();
  policy.provider.maximumResponseBytes = 256;
  const oversized = JSON.stringify(nativeResponse('x'.repeat(1024)));
  const state = await setup(t, {
    policy,
    fetchImpl: async () => new Response(oversized, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'response-over-budget');
  await assert.rejects(state.suite.native.reconcile(dispatch), (error) => error.code === 'response-over-budget');
  const durableText = await allFileText(join(state.root, 'operations'));
  assert.equal(durableText.includes('x'.repeat(128)), false);
});

test('malformed provider output closes once with only a digest', async (t) => {
  const rawInvalid = 'private malformed provider output';
  const state = await setup(t, {
    times: [
      '2026-08-31T23:40:00.000Z',
      '2026-08-31T23:40:00.250Z',
      '2026-08-31T23:40:00.500Z',
    ],
    fetchImpl: async () => new Response(JSON.stringify({
      ...nativeResponse(),
      content: [{ type: 'text', text: rawInvalid }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'response-invalid');
  const durableText = await allFileText(join(state.root, 'operations'));
  assert.equal(durableText.includes(rawInvalid), false);
  assert.match(durableText, /"responseDigest":"[a-f0-9]{64}"/);
});

test('symlinked and unknown operation state fails integrity before provider access', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    fetchImpl: async () => {
      networkCalls += 1;
      return new Response(JSON.stringify(nativeResponse()), { status: 200 });
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  const phaseRoot = join(state.root, 'operations', 'native');
  const outside = join(state.root, 'outside-operation');
  await mkdir(phaseRoot, { recursive: true });
  await mkdir(outside, { recursive: true });
  await symlink(outside, join(phaseRoot, dispatch.dispatchDigest), 'junction');
  await assert.rejects(state.suite.native.reconcile(dispatch), (error) => error.code === 'operation-integrity');
  assert.equal(networkCalls, 0);

  const cleanState = await setup(t);
  const cleanDispatch = await nativeDispatch(t, cleanState.suite.descriptors.native);
  await cleanState.suite.native.execute(cleanDispatch);
  await writeFile(join(
    cleanState.root,
    'operations',
    'native',
    cleanDispatch.dispatchDigest,
    'unknown.bin',
  ), 'unexpected state', 'utf8');
  await assert.rejects(
    cleanState.suite.native.reconcile(cleanDispatch),
    (error) => error.code === 'operation-integrity',
  );
});

test('signed provider-neutral abandonment closes one ambiguous Anthropic attempt without redispatch', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    clock: () => '2026-08-31T20:02:00.000Z',
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('fixture connection reset after send');
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'provider-ambiguous');
  const { controller, policyDigest } = await resolutionController(state);
  const inspected = await controller.inspect({ phase: 'native', dispatch });
  assert.equal(inspected.status, 'pending');
  assert.deepEqual(Object.keys(inspected.operation).sort(), [
    'attemptId', 'dispatchDigest', 'phase', 'requestDigest',
  ]);

  const signedDecision = decisionFor(inspected.operation, policyDigest);
  const resolved = await controller.resolve({ phase: 'native', dispatch, signedDecision });
  assert.equal(resolved.status, 'abandoned');
  assert.equal(resolved.reasonCode, 'operator-abandoned');
  assert.equal(networkCalls, 1);
  await assert.rejects(state.suite.native.reconcile(dispatch), (error) => error.code === 'operator-abandoned');
  assert.deepEqual(await controller.resolve({ phase: 'native', dispatch, signedDecision }), resolved);

  const operationRoot = join(state.root, 'operations', 'native', dispatch.dispatchDigest);
  assert.deepEqual((await readdir(operationRoot)).sort(), [
    'attempt.json', 'failure.json', 'prepared.json', 'resolution.json',
  ]);
  const durableText = await allFileText(operationRoot);
  assert.equal(durableText.includes(state.secret), false);
  assert.equal(durableText.includes('fixture connection reset after send'), false);
});

test('signed provider-neutral adoption publishes Anthropic evidence and completion with zero extra provider calls', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    clock: () => '2026-08-31T20:02:00.000Z',
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('fixture ambiguous outcome');
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'provider-ambiguous');
  const { controller, policyDigest } = await resolutionController(state);
  const inspected = await controller.inspect({ phase: 'native', dispatch });
  const response = recoveredAnthropicResponse();
  const witness = buildProviderPhaseResponseWitness(response);
  const signedDecision = decisionFor(inspected.operation, policyDigest, {
    disposition: 'adopt-response',
    responseWitnessDigest: witness.witnessDigest,
  });

  const resolved = await controller.resolve({ phase: 'native', dispatch, signedDecision, response });
  assert.equal(resolved.status, 'completed');
  assert.equal(resolved.completion.artifact.content, 'one recovered Anthropic native artifact');
  assert.equal(networkCalls, 1);
  assert.deepEqual(await state.suite.native.reconcile(dispatch), {
    status: 'completed',
    completion: resolved.completion,
  });
  const operationRoot = join(state.root, 'operations', 'native', dispatch.dispatchDigest);
  assert.deepEqual((await readdir(operationRoot)).sort(), [
    'attempt.json', 'completion.json', 'prepared.json', 'provider-evidence.json', 'resolution.json',
  ]);
  const evidence = JSON.parse(await readFile(join(operationRoot, 'provider-evidence.json'), 'utf8'));
  assert.deepEqual(evidence.providerUsage, {
    uncachedInputTokens: 200,
    cacheCreationInputTokens: 40,
    cacheReadInputTokens: 100,
    outputTokens: 30,
    thinkingTokens: 0,
  });
  const resolutionText = await readFile(join(operationRoot, 'resolution.json'), 'utf8');
  assert.equal(resolutionText.includes('one recovered Anthropic native artifact'), false);
  assert.equal(resolutionText.includes(state.secret), false);
});

test('accepted Anthropic resolution recovers after interruption but changed evidence collides', async (t) => {
  let interrupt = true;
  let current = '2026-08-31T20:02:00.000Z';
  let networkCalls = 0;
  const state = await setup(t, {
    times: [],
    clock: () => current,
    checkpoint: async (label) => {
      if (interrupt && label === 'after-provider-phase-resolution-persisted') {
        throw new Error('fixture process death after resolution publication');
      }
    },
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('fixture ambiguous outcome');
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'provider-ambiguous');
  const { controller, policyDigest } = await resolutionController(state);
  const inspected = await controller.inspect({ phase: 'native', dispatch });
  const response = recoveredAnthropicResponse();
  const witness = buildProviderPhaseResponseWitness(response);
  const signedDecision = decisionFor(inspected.operation, policyDigest, {
    disposition: 'adopt-response',
    responseWitnessDigest: witness.witnessDigest,
  });
  await assert.rejects(
    controller.resolve({ phase: 'native', dispatch, signedDecision, response }),
    (error) => error.code === 'operation-integrity',
  );

  interrupt = false;
  current = '2026-08-31T20:06:00.000Z';
  await assert.rejects(
    controller.resolve({
      phase: 'native',
      dispatch,
      signedDecision,
      response: recoveredAnthropicResponse('changed recovered bytes'),
    }),
    /resolution decision|collision/i,
  );
  const recovered = await controller.resolve({ phase: 'native', dispatch, signedDecision, response });
  assert.equal(recovered.status, 'completed');
  assert.equal(networkCalls, 1);
});

test('unaccepted expiry invalid provider output and adopted-response overflow mutate no resolution state', async (t) => {
  let current = '2026-08-31T20:06:00.000Z';
  const state = await setup(t, {
    clock: () => current,
    fetchImpl: async () => { throw new Error('fixture ambiguous outcome'); },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'provider-ambiguous');
  const { controller, policyDigest } = await resolutionController(state, {
    maximumAdoptedResponseBytes: 256,
  });
  const inspected = await controller.inspect({ phase: 'native', dispatch });
  await assert.rejects(
    controller.resolve({
      phase: 'native', dispatch,
      signedDecision: decisionFor(inspected.operation, policyDigest),
    }),
    /provider phase resolution decision/i,
  );
  const operationRoot = join(state.root, 'operations', 'native', dispatch.dispatchDigest);
  assert.equal((await readdir(operationRoot)).includes('resolution.json'), false);

  current = '2026-08-31T20:02:00.000Z';
  const oversized = recoveredAnthropicResponse('x'.repeat(512));
  const oversizedWitness = buildProviderPhaseResponseWitness(oversized);
  await assert.rejects(controller.resolve({
    phase: 'native', dispatch, response: oversized,
    signedDecision: decisionFor(inspected.operation, policyDigest, {
      disposition: 'adopt-response',
      responseWitnessDigest: oversizedWitness.witnessDigest,
    }),
  }), /provider phase resolution decision/i);
  assert.equal((await readdir(operationRoot)).includes('resolution.json'), false);

  const invalid = { status: 200, headers: { 'content-type': 'application/json' }, bodyText: '{}' };
  const invalidWitness = buildProviderPhaseResponseWitness(invalid);
  await assert.rejects(controller.resolve({
    phase: 'native', dispatch, response: invalid,
    signedDecision: decisionFor(inspected.operation, policyDigest, {
      disposition: 'adopt-response',
      responseWitnessDigest: invalidWitness.witnessDigest,
      nonce: 'fixture-provider-resolution-invalid-output',
    }),
  }), /response is invalid/i);
  assert.equal((await readdir(operationRoot)).includes('resolution.json'), false);
});

test('review and revision adoption preserve their exact contracts and provider evidence', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    clock: () => '2026-08-31T20:02:00.000Z',
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('fixture ambiguous outcome');
    },
  });
  const { controller, policyDigest } = await resolutionController(state);
  const cases = [
    [
      'review',
      await reviewDispatch(state.suite.descriptors.review),
      recoveredAnthropicPhaseResponse(
        { recommendation: 'accept', findings: [], summary: 'recovered review accepts exact subject' },
        'msg_recovered_review',
      ),
      'review',
    ],
    [
      'revision',
      revisionDispatch(state.suite.descriptors.revision),
      recoveredAnthropicPhaseResponse(
        { addressedFindingIds: ['bind-evidence'], content: 'recovered revision binds evidence' },
        'msg_recovered_revision',
      ),
      'revision',
    ],
  ];
  for (const [phase, dispatch, response, artifactType] of cases) {
    await assert.rejects(state.suite[phase].execute(dispatch), (error) => error.code === 'provider-ambiguous');
    const inspected = await controller.inspect({ phase, dispatch });
    const witness = buildProviderPhaseResponseWitness(response);
    const resolved = await controller.resolve({
      phase, dispatch, response,
      signedDecision: decisionFor(inspected.operation, policyDigest, {
        disposition: 'adopt-response',
        responseWitnessDigest: witness.witnessDigest,
        nonce: `fixture-provider-resolution-${phase}`,
      }),
    });
    assert.equal(resolved.completion.artifact.artifactType, artifactType);
    assert.deepEqual((await state.suite[phase].reconcile(dispatch)).completion, resolved.completion);
  }
  assert.equal(networkCalls, 2);
});

test('changed concurrent provider-neutral resolutions cannot create two outcomes', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    clock: () => '2026-08-31T20:02:00.000Z',
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('fixture ambiguous outcome');
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'provider-ambiguous');
  const { controller, policyDigest } = await resolutionController(state);
  const inspected = await controller.inspect({ phase: 'native', dispatch });
  const first = decisionFor(inspected.operation, policyDigest, { nonce: 'provider-resolution-first' });
  const second = decisionFor(inspected.operation, policyDigest, { nonce: 'provider-resolution-second' });
  const outcomes = await Promise.allSettled([
    controller.resolve({ phase: 'native', dispatch, signedDecision: first }),
    controller.resolve({ phase: 'native', dispatch, signedDecision: second }),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal((await controller.inspect({ phase: 'native', dispatch })).status, 'abandoned');
  assert.equal(networkCalls, 1);
});

test('provider-neutral operator authority remains outside ordinary Anthropic phase adapters', async (t) => {
  const state = await setup(t);
  for (const phase of ['native', 'review', 'revision']) {
    assert.deepEqual(Object.keys(state.suite[phase]).sort(), ['descriptor', 'execute', 'reconcile']);
    assert.equal(state.suite[phase].resolve, undefined);
  }
  assert.equal(typeof state.suite.createOperatorResolutionController, 'function');
  assert.equal(JSON.stringify(state.suite).includes(state.secret), false);
});

test('ordinary reconciliation rejects structurally invalid accepted resolution state without loading authority', async (t) => {
  let interrupt = true;
  const state = await setup(t, {
    clock: () => '2026-08-31T20:02:00.000Z',
    checkpoint: async (label) => {
      if (interrupt && label === 'after-provider-phase-resolution-persisted') {
        throw new Error('fixture interruption');
      }
    },
    fetchImpl: async () => { throw new Error('fixture ambiguous outcome'); },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'provider-ambiguous');
  const { controller, policyDigest } = await resolutionController(state);
  const inspected = await controller.inspect({ phase: 'native', dispatch });
  await assert.rejects(
    controller.resolve({
      phase: 'native', dispatch,
      signedDecision: decisionFor(inspected.operation, policyDigest),
    }),
    (error) => error.code === 'operation-integrity',
  );
  interrupt = false;
  const path = join(state.root, 'operations', 'native', dispatch.dispatchDigest, 'resolution.json');
  const tampered = JSON.parse(await readFile(path, 'utf8'));
  tampered.signedDecision.decision.nonce = 'invalid nonce with spaces';
  rehashProviderResolutionRecord(tampered);
  await writeFile(path, `${canonicalJson(tampered)}\n`, 'utf8');
  await assert.rejects(
    state.suite.native.reconcile(dispatch),
    (error) => error.code === 'operation-integrity',
  );
});

test('stranded provider evidence blocks abandonment and changed adoption before resolution mutation', async (t) => {
  let interrupt = true;
  const state = await setup(t, {
    clock: () => '2026-08-31T20:02:00.000Z',
    checkpoint: async (label) => {
      if (interrupt && label === 'after-anthropic-phase-provider-evidence-persisted') {
        throw new Error('fixture interruption after evidence');
      }
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'operation-integrity');
  interrupt = false;
  const { controller, policyDigest } = await resolutionController(state);
  const inspected = await controller.inspect({ phase: 'native', dispatch });
  const operationRoot = join(state.root, 'operations', 'native', dispatch.dispatchDigest);

  await assert.rejects(
    controller.resolve({
      phase: 'native', dispatch,
      signedDecision: decisionFor(inspected.operation, policyDigest),
    }),
    /not pending|integrity|decision/i,
  );
  assert.equal((await readdir(operationRoot)).includes('resolution.json'), false);

  const changed = recoveredAnthropicResponse('changed response contradicts stranded evidence');
  const changedWitness = buildProviderPhaseResponseWitness(changed);
  await assert.rejects(
    controller.resolve({
      phase: 'native', dispatch, response: changed,
      signedDecision: decisionFor(inspected.operation, policyDigest, {
        disposition: 'adopt-response',
        responseWitnessDigest: changedWitness.witnessDigest,
        nonce: 'provider-resolution-changed-stranded-evidence',
      }),
    }),
    /integrity|collision/i,
  );
  assert.equal((await readdir(operationRoot)).includes('resolution.json'), false);
});

test('exact response adoption can finish matching stranded provider evidence without redispatch', async (t) => {
  let interrupt = true;
  let providerCalls = 0;
  const state = await setup(t, {
    clock: () => '2026-08-31T20:02:00.000Z',
    checkpoint: async (label) => {
      if (interrupt && label === 'after-anthropic-phase-provider-evidence-persisted') {
        throw new Error('fixture interruption after evidence');
      }
    },
    fetchImpl: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify(nativeResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(state.suite.native.execute(dispatch), (error) => error.code === 'operation-integrity');
  interrupt = false;
  const { controller, policyDigest } = await resolutionController(state);
  const inspected = await controller.inspect({ phase: 'native', dispatch });
  const response = recoveredAnthropicResponse('one durable Anthropic native artifact');
  const witness = buildProviderPhaseResponseWitness(response);
  const resolved = await controller.resolve({
    phase: 'native', dispatch, response,
    signedDecision: decisionFor(inspected.operation, policyDigest, {
      disposition: 'adopt-response',
      responseWitnessDigest: witness.witnessDigest,
      nonce: 'provider-resolution-matching-stranded-evidence',
    }),
  });
  assert.equal(resolved.status, 'completed');
  assert.equal(providerCalls, 1);
});
