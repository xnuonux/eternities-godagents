import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { loadOpenAICompatiblePhaseTransportPolicy } from '../src/transports/openai-compatible-phase-policy.mjs';
import { compileOpenAICompatiblePhaseRequest, completeOpenAICompatiblePhaseResponse } from '../src/transports/openai-compatible-phase-protocol.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import { setupPendingNativePhase, reviewDispatch, revisionDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';

const profile = 'chat-completions-json-schema-reasoning-split-v1';

test('reasoning split is an explicit frozen policy choice with its own integrity pin', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godagents-split-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = validOpenAICompatiblePhasePolicy();
  const oldDigest = sha256Text(canonicalJson(policy));
  policy.provider.profile = profile;
  const digest = sha256Text(canonicalJson(policy));
  const path = join(root, 'policy.json');
  await writeFile(path, canonicalJson(policy) + '\n');
  const loaded = await loadOpenAICompatiblePhaseTransportPolicy({ path,
    env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: digest } });
  assert.equal(loaded.policy.provider.profile, profile);
  assert.ok(Object.isFrozen(loaded.policy.provider));
  await assert.rejects(loadOpenAICompatiblePhaseTransportPolicy({ path,
    env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: oldDigest } }), { code: 'policy-integrity' });
  for (const unknown of ['chat-completions-json-schema-reasoning-split-v2', 'arbitrary']) {
    policy.provider.profile = unknown;
    await writeFile(path, canonicalJson(policy) + '\n');
    await assert.rejects(loadOpenAICompatiblePhaseTransportPolicy({ path,
      env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: sha256Text(canonicalJson(policy)) } }), { code: 'policy-invalid' });
  }
});

test('split completion preserves reasoning accounting and rejects unmeasured or malformed answers', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const policy = validOpenAICompatiblePhasePolicy();
  policy.provider.profile = profile;
  const envelope = { model: policy.provider.modelId, choices: [{ index: 0, finish_reason: 'stop',
    message: { role: 'assistant', content: '{"content":"four"}', reasoning_content: 'synthetic hidden reasoning' } }],
    usage: { prompt_tokens: 205, completion_tokens: 86, total_tokens: 291,
      prompt_tokens_details: { cached_tokens: 128 }, completion_tokens_details: { reasoning_tokens: 80 } } };
  const complete = (value, selectedPolicy = policy) => completeOpenAICompatiblePhaseResponse({
    phase: 'native', dispatch: fixture.dispatch, descriptor: fixture.suite.descriptors.native,
    policy: selectedPolicy, credential: 'synthetic-secret-for-split-test',
    response: { status: 200, headers: { 'content-type': 'application/json' }, bodyText: JSON.stringify(value) },
    startedAt: '2026-08-31T22:00:00.000Z', completedAt: '2026-08-31T22:00:01.000Z',
  });
  const result = complete(envelope);
  assert.equal(result.artifact.content, 'four');
  assert.deepEqual(result.usage, { inputTokens: 205, cachedInputTokens: 128,
    completionTokens: 86, reasoningTokens: 80, visibleOutputTokens: 6 });
  assert.equal(JSON.stringify(result).includes('synthetic hidden reasoning'), false);
  for (const mutate of [
    (v) => { delete v.usage.completion_tokens_details; },
    (v) => { v.choices[0].message.content = '<think>hidden</think>{"content":"four"}'; },
    (v) => { v.usage.completion_tokens_details.reasoning_tokens = 87; },
    (v) => { v.usage.completion_tokens = fixture.dispatch.maxCompletionTokens + 1; v.usage.total_tokens = 205 + v.usage.completion_tokens; },
  ]) {
    const invalid = structuredClone(envelope); mutate(invalid);
    assert.throws(() => complete(invalid), { code: 'response-invalid' });
  }
  const legacy = structuredClone(envelope); delete legacy.usage.completion_tokens_details;
  assert.equal(complete(legacy, validOpenAICompatiblePhasePolicy()).usage.reasoningTokens, 0);
});

test('all three phases opt into separated reasoning without changing legacy request fields or limits', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const dispatches = { native: fixture.dispatch,
    review: await reviewDispatch(fixture.suite.descriptors.review),
    revision: revisionDispatch(fixture.suite.descriptors.revision) };
  const policy = validOpenAICompatiblePhasePolicy();
  const splitPolicy = structuredClone(policy);
  splitPolicy.provider.profile = profile;
  for (const phase of ['native', 'review', 'revision']) {
    const args = { phase, dispatch: dispatches[phase], descriptor: fixture.suite.descriptors[phase] };
    const legacy = compileOpenAICompatiblePhaseRequest({ ...args, policy });
    const split = compileOpenAICompatiblePhaseRequest({ ...args, policy: splitPolicy });
    const body = JSON.parse(split.body);
    assert.equal(body.reasoning_split, true, phase);
    assert.equal(body.max_completion_tokens, dispatches[phase].maxCompletionTokens);
    assert.equal(Object.hasOwn(body, 'thinking'), false);
    assert.notEqual(split.requestDigest, legacy.requestDigest);
    delete body.reasoning_split;
    assert.equal(canonicalJson(body), legacy.body, 'legacy bytes must differ only by explicit wire option');
  }
});
