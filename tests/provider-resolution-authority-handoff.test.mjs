import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  bindProviderResolutionAuthoritySignature,
  buildProviderResolutionAuthoritySigningRequest,
  verifyProviderResolutionAuthoritySignedReturn,
  verifyProviderResolutionAuthoritySigningRequest,
} from '../src/host/provider-resolution-authority-handoff.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { nativeDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import {
  signResolutionDecision,
  validOpenAICompatiblePhaseResolutionPolicy,
} from './helpers/openai-compatible-phase-resolution-fixture.mjs';
import {
  signProviderResolutionDecision,
  validProviderPhaseResolutionPolicy,
} from './helpers/provider-phase-resolution-fixture.mjs';

const DEFINITIONS = Object.freeze({
  'openai-compatible-chat-completions-v1': Object.freeze({
    transportPolicy: validOpenAICompatiblePhasePolicy,
    transportPin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validOpenAICompatiblePhaseResolutionPolicy,
    sign: signResolutionDecision,
    witnessField: 'responseDigest',
    envelope(model) {
      return {
        id: 'chatcmpl_authority_handoff', object: 'chat.completion', model,
        choices: [{
          index: 0, finish_reason: 'stop',
          message: { role: 'assistant', content: canonicalJson({ content: 'authority handoff artifact' }) },
        }],
        usage: {
          prompt_tokens: 20, prompt_tokens_details: { cached_tokens: 5 },
          completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 0 }, total_tokens: 24,
        },
      };
    },
  }),
  'anthropic-messages-v1': Object.freeze({
    transportPolicy: validAnthropicMessagesPhasePolicy,
    transportPin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validProviderPhaseResolutionPolicy,
    sign: signProviderResolutionDecision,
    witnessField: 'responseWitnessDigest',
    envelope(model) {
      return {
        id: 'msg_authority_handoff', type: 'message', role: 'assistant', model,
        content: [{ type: 'text', text: canonicalJson({ content: 'authority handoff artifact' }) }],
        stop_reason: 'end_turn', stop_sequence: null,
        usage: {
          input_tokens: 20, cache_creation_input_tokens: 4, cache_read_input_tokens: 5,
          output_tokens: 4, output_tokens_details: { thinking_tokens: 0 },
        },
      };
    },
  }),
});

async function setup(t, family, { ambiguous = false } = {}) {
  const definition = DEFINITIONS[family];
  const root = await mkdtemp(join(tmpdir(), 'godagents-authority-handoff-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = definition.transportPolicy();
  const policyPath = join(root, 'transport-policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  let providerCalls = 0;
  const host = await createProviderPhaseHost({
    family,
    policyPath,
    env: {
      [definition.transportPin]: policyDigest,
      [policy.provider.credentialEnv]: `authority-handoff-${family}-secret`,
    },
    runtimeRoot: join(root, 'operations'),
    clock: () => '2026-09-01T02:00:30.000Z',
    fetchImpl: async () => {
      providerCalls += 1;
      if (ambiguous) throw new Error('fixture ambiguous provider outcome');
      throw new Error('handoff must not call provider');
    },
  });
  const resolutionPolicy = definition.resolutionPolicy({ transportPolicyDigest: policyDigest });
  const resolutionPath = join(root, 'resolution-policy.json');
  const resolutionDigest = sha256Text(canonicalJson(resolutionPolicy));
  await writeFile(resolutionPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
  const profile = host.describe().capabilities.resolutionProfile;
  const controller = await host.createOperatorResolutionController({
    policyPath: resolutionPath,
    env: { [profile.externalPolicyPinVariable]: resolutionDigest },
  });
  return { definition, host, controller, policy, get providerCalls() { return providerCalls; } };
}

function syntheticPending() {
  return {
    status: 'pending',
    operation: {
      phase: 'native', dispatchDigest: '1'.repeat(64),
      requestDigest: '2'.repeat(64), attemptId: '3'.repeat(64),
    },
    resolutionAccepted: false,
  };
}

function common(state, overrides = {}) {
  return {
    hostDescription: state.host.describe(),
    controller: {
      policyDigest: state.controller.policyDigest,
      authorityKeyId: state.controller.authorityKeyId,
    },
    inspected: syntheticPending(),
    disposition: 'abandon',
    issuedAt: '2026-09-01T02:00:00.000Z',
    expiresAt: '2026-09-01T02:05:00.000Z',
    nonce: 'authority-handoff-001',
    ...overrides,
  };
}

function response(state, marker = 'private-provider-body-marker') {
  const body = state.definition.envelope(state.policy.provider.modelId);
  body.marker = marker;
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify(body),
  };
}

function verification(state, request, inspected = syntheticPending()) {
  return {
    request,
    hostDescription: state.host.describe(),
    controller: {
      policyDigest: state.controller.policyDigest,
      authorityKeyId: state.controller.authorityKeyId,
    },
    inspected,
  };
}

test('both families emit one exact immutable authority-neutral signing request', async (t) => {
  for (const [family, definition] of Object.entries(DEFINITIONS)) {
    const state = await setup(t, family);
    const request = buildProviderResolutionAuthoritySigningRequest(common(state));
    assert.equal(request.family, family);
    assert.equal(request.status, 'awaiting-signature');
    assert.equal(request.signatureAlgorithm, 'Ed25519');
    assert.equal(request.signingPayloadEncoding, 'utf-8');
    assert.equal(request.decision[definition.witnessField], null);
    assert.equal(request.signingPayload, canonicalJson(request.decision));
    assert.equal(request.signingPayloadSha256, sha256Text(request.signingPayload));
    assert.deepEqual(verifyProviderResolutionAuthoritySigningRequest(
      verification(state, request),
    ), request);
    assert.equal(Object.isFrozen(request), true);
    assert.equal(Object.isFrozen(request.decision), true);
    assert.equal(state.providerCalls, 0);
  }
});

test('adoption exposes only the family witness and digest rather than raw provider bytes', async (t) => {
  for (const family of Object.keys(DEFINITIONS)) {
    const state = await setup(t, family);
    const marker = `raw-${family}-must-not-cross-authority-handoff`;
    const request = buildProviderResolutionAuthoritySigningRequest(common(state, {
      disposition: 'adopt-response',
      response: response(state, marker),
    }));
    assert.match(request.responseWitness.witnessDigest, /^[a-f0-9]{64}$/);
    assert.equal(request.decision[state.definition.witnessField], request.responseWitness.witnessDigest);
    assert.equal(canonicalJson(request).includes(marker), false);
    assert.equal(state.providerCalls, 0);
  }
});

test('one canonical external signature binds an immutable signed-return envelope', async (t) => {
  for (const family of Object.keys(DEFINITIONS)) {
    const state = await setup(t, family);
    const request = buildProviderResolutionAuthoritySigningRequest(common(state));
    const signature = state.definition.sign(request.decision).signature;
    const value = bindProviderResolutionAuthoritySignature({
      ...verification(state, request), signature,
    });
    assert.deepEqual(value.signedDecision, { decision: request.decision, signature });
    assert.equal(value.signatureAlgorithm, 'Ed25519');
    assert.equal(value.cryptographicStatus, 'unverified');
    assert.equal(value.requestDigest, request.requestDigest);
    assert.deepEqual(verifyProviderResolutionAuthoritySignedReturn({
      value, ...verification(state, request),
    }), value);
    assert.equal(Object.isFrozen(value), true);
    assert.equal(state.providerCalls, 0);
  }
});

test('externally signed adoption returns are accepted unchanged by both real controllers', async (t) => {
  for (const family of Object.keys(DEFINITIONS)) {
    const state = await setup(t, family, { ambiguous: true });
    const dispatch = await nativeDispatch(t, state.host.describe().descriptors.native);
    await assert.rejects(state.host.native.execute(dispatch), (error) => error?.code === 'provider-ambiguous');
    const inspected = await state.controller.inspect({ phase: 'native', dispatch });
    const recovered = response(state, 'controller-only-response-body');
    const args = common(state, {
      inspected,
      disposition: 'adopt-response',
      response: recovered,
      nonce: `authority-handoff-${family}`,
    });
    const request = buildProviderResolutionAuthoritySigningRequest(args);
    const signature = state.definition.sign(request.decision).signature;
    const handoff = bindProviderResolutionAuthoritySignature({
      ...verification(state, request, inspected), signature,
    });
    const resolved = await state.controller.resolve({
      phase: 'native', dispatch, signedDecision: handoff.signedDecision, response: recovered,
    });
    assert.equal(resolved.status, 'completed');
    assert.equal(resolved.completion.artifact.content, 'authority handoff artifact');
    assert.equal(state.providerCalls, 1);
  }
});

test('request verification rejects changed bindings and cross-family substitution after rehash', async (t) => {
  const openAI = await setup(t, 'openai-compatible-chat-completions-v1');
  const anthropic = await setup(t, 'anthropic-messages-v1');
  const original = buildProviderResolutionAuthoritySigningRequest(common(openAI));
  const forgeries = [
    (value) => { value.family = 'anthropic-messages-v1'; },
    (value) => { value.resolutionPolicyDigest = 'f'.repeat(64); },
    (value) => { value.authorityKeyId = 'other-authority'; },
    (value) => { value.operation.attemptId = 'f'.repeat(64); },
    (value) => { value.decision.nonce = 'changed'; },
    (value) => { value.responseWitness = { forged: true }; },
    (value) => { value.signingPayload = '{}'; },
  ];
  for (const mutate of forgeries) {
    const forged = structuredClone(original);
    mutate(forged);
    const { requestDigest: _old, ...unsigned } = forged;
    forged.requestDigest = sha256Value(unsigned);
    assert.throws(
      () => verifyProviderResolutionAuthoritySigningRequest(verification(openAI, forged)),
      /handoff/i,
    );
  }
  assert.throws(
    () => verifyProviderResolutionAuthoritySigningRequest(
      verification(anthropic, original),
    ),
    /handoff/i,
  );
});

test('signature binding rejects malformed encodings unknown fields and changed requests', async (t) => {
  const state = await setup(t, 'openai-compatible-chat-completions-v1');
  const request = buildProviderResolutionAuthoritySigningRequest(common(state));
  const valid = state.definition.sign(request.decision).signature;
  for (const signature of ['', 'not-base64', Buffer.alloc(63).toString('base64')]) {
    assert.throws(() => bindProviderResolutionAuthoritySignature({
      ...verification(state, request), signature,
    }), /handoff/i);
  }
  assert.throws(() => bindProviderResolutionAuthoritySignature({
    ...verification(state, request), signature: valid, privateKey: 'forbidden',
  }), /handoff/i);
  const handoff = bindProviderResolutionAuthoritySignature({
    ...verification(state, request), signature: valid,
  });
  const forged = structuredClone(handoff);
  forged.signedDecision.signature = Buffer.alloc(64, 1).toString('base64');
  assert.throws(() => verifyProviderResolutionAuthoritySignedReturn({
    value: forged, ...verification(state, request),
  }), /handoff/i);
});
