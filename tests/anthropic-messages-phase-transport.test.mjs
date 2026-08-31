import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { verifyIdentityBoundNativeCompletion } from '../src/runtime/identity-bound-native-contracts.mjs';
import { verifyMissionRevisionTransportCompletion } from '../src/runtime/mission-revision-transport-contracts.mjs';
import { verifyGodskillsReviewTransportCompletion } from '../src/skills/review-transport-contracts.mjs';
import { createAnthropicMessagesPhaseTransportSuite } from '../src/transports/anthropic-messages-phase-transport.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import {
  nativeDispatch,
  reviewDispatch,
  revisionDispatch,
} from './helpers/openai-compatible-phase-operation-fixture.mjs';

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
    clock: () => times.shift(),
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
