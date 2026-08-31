import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { verifyIdentityBoundNativeCompletion } from '../src/runtime/identity-bound-native-contracts.mjs';
import {
  createProviderPhaseHost,
  verifyProviderPhaseHostDescription,
} from '../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import { nativeDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { runProviderPhaseHostConformance } from './helpers/provider-phase-host-conformance.mjs';

const PHASES = ['native', 'review', 'revision'];

function phaseContent(phase) {
  if (phase === 'native') return { content: 'one portable sdk native artifact' };
  if (phase === 'review') {
    return { recommendation: 'accept', findings: [], summary: 'portable sdk review accepts exact subject' };
  }
  return {
    addressedFindingIds: ['bind-evidence'],
    content: 'portable sdk revision binds the required evidence',
  };
}

const FAMILIES = Object.freeze({
  'openai-compatible-chat-completions-v1': {
    policy: validOpenAICompatiblePhasePolicy,
    pin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    response(model, phase) {
      return {
        id: 'chatcmpl_provider_phase_sdk',
        object: 'chat.completion',
        model,
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: canonicalJson(phaseContent(phase)),
          },
        }],
        usage: {
          prompt_tokens: 200,
          prompt_tokens_details: { cached_tokens: 60 },
          completion_tokens: 30,
          completion_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 230,
        },
      };
    },
  },
  'anthropic-messages-v1': {
    policy: validAnthropicMessagesPhasePolicy,
    pin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    response(model, phase) {
      return {
        id: 'msg_provider_phase_sdk',
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: canonicalJson(phaseContent(phase)) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 40,
          cache_read_input_tokens: 60,
          output_tokens: 30,
          output_tokens_details: { thinking_tokens: 0 },
        },
      };
    },
  },
});

async function setup(t, family) {
  const definition = FAMILIES[family];
  const root = await mkdtemp(join(tmpdir(), 'godagents-provider-phase-sdk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = definition.policy();
  const policyPath = join(root, 'policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const secret = `provider-phase-sdk-${family}-credential`;
  const env = {
    [definition.pin]: policyDigest,
    [policy.provider.credentialEnv]: secret,
  };
  let providerCalls = 0;
  let phaseIndex = 0;
  const times = [
    '2026-08-31T23:55:00.000Z', '2026-08-31T23:55:00.250Z',
    '2026-08-31T23:56:00.000Z', '2026-08-31T23:56:00.250Z',
    '2026-08-31T23:57:00.000Z', '2026-08-31T23:57:00.250Z',
  ];
  const host = await createProviderPhaseHost({
    family,
    policyPath,
    env,
    runtimeRoot: join(root, 'operations'),
    clock: () => times.shift(),
    fetchImpl: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify(definition.response(policy.provider.modelId, PHASES[phaseIndex++])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { root, policy, policyPath, policyDigest, secret, env, host, get providerCalls() { return providerCalls; } };
}

test('provider phase host requires an explicit registered family and closed configuration', async () => {
  await assert.rejects(
    createProviderPhaseHost({ family: 'ambient', policyPath: 'missing' }),
    /family/i,
  );
  await assert.rejects(
    createProviderPhaseHost({
      family: 'anthropic-messages-v1',
      policyPath: 'missing',
      model: 'caller-substitution',
    }),
    /configuration/i,
  );
});

test('both registered families expose one common credential-free host surface', async (t) => {
  for (const family of Object.keys(FAMILIES)) {
    const state = await setup(t, family);
    assert.deepEqual(Object.keys(state.host).sort(), [
      'assertCredentialAbsent', 'describe', 'native', 'review', 'revision',
    ]);
    const description = verifyProviderPhaseHostDescription(state.host.describe());
    assert.equal(description.family, family);
    assert.equal(description.policyDigest, state.policyDigest);
    assert.deepEqual(Object.keys(description.descriptors), ['native', 'review', 'revision']);
    assert.equal(canonicalJson(description).includes(state.secret), false);
    assert.equal(state.providerCalls, 0);
  }
});

test('each provider family completes and replays one trusted native dispatch through the same sdk shape', async (t) => {
  for (const family of Object.keys(FAMILIES)) {
    const state = await setup(t, family);
    const description = state.host.describe();
    const dispatch = await nativeDispatch(t, description.descriptors.native);
    const completed = await state.host.native.execute(dispatch);
    verifyIdentityBoundNativeCompletion(completed.completion, {
      dispatch,
      transportDescriptor: description.descriptors.native,
    });
    delete state.env[state.policy.provider.credentialEnv];
    assert.deepEqual(await state.host.native.reconcile(dispatch), completed);
    assert.deepEqual(await state.host.native.execute(dispatch), completed);
    assert.equal(state.providerCalls, 1);
  }
});

test('one conformance harness proves all three durable phase contracts for both families', async (t) => {
  for (const family of Object.keys(FAMILIES)) {
    const state = await setup(t, family);
    const result = await runProviderPhaseHostConformance({
      context: t,
      host: state.host,
      removeCredential() { delete state.env[state.policy.provider.credentialEnv]; },
      providerCalls() { return state.providerCalls; },
    });
    assert.equal(result.family, family);
    assert.deepEqual(result.completedPhases, ['native', 'review', 'revision']);
    assert.equal(result.providerCalls, 3);
    assert.equal(result.replayProviderCalls, 0);
    assert.equal(result.authorityExpansions, 0);
  }
});

test('description verification rejects cross-family descriptor substitution after outer rehash', async (t) => {
  const openAI = await setup(t, 'openai-compatible-chat-completions-v1');
  const anthropic = await setup(t, 'anthropic-messages-v1');
  const forged = structuredClone(anthropic.host.describe());
  forged.descriptors = structuredClone(openAI.host.describe().descriptors);
  const { descriptionDigest: _old, ...unsigned } = forged;
  forged.descriptionDigest = sha256Value(unsigned);

  assert.throws(() => verifyProviderPhaseHostDescription(forged), /descriptor/i);
});
