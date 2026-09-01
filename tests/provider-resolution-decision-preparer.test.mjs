import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { prepareProviderPhaseResolutionDecision } from '../src/host/provider-phase-resolution-decision-preparer.mjs';
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
    decisionProtocolId: 'eternities-openai-compatible-phase-resolution-decision-v1',
    witnessProtocolId: 'eternities-openai-compatible-phase-response-witness-v1',
    witnessField: 'responseDigest',
    envelope(model) {
      return {
        id: 'chatcmpl_prepared_resolution',
        object: 'chat.completion',
        model,
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: canonicalJson({ content: 'prepared exact artifact' }) },
        }],
        usage: {
          prompt_tokens: 20,
          prompt_tokens_details: { cached_tokens: 5 },
          completion_tokens: 4,
          completion_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 24,
        },
      };
    },
  }),
  'anthropic-messages-v1': Object.freeze({
    transportPolicy: validAnthropicMessagesPhasePolicy,
    transportPin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validProviderPhaseResolutionPolicy,
    sign: signProviderResolutionDecision,
    decisionProtocolId: 'eternities-provider-phase-resolution-decision-v1',
    witnessProtocolId: 'eternities-provider-phase-response-witness-v1',
    witnessField: 'responseWitnessDigest',
    envelope(model) {
      return {
        id: 'msg_prepared_resolution',
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: canonicalJson({ content: 'prepared exact artifact' }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          cache_creation_input_tokens: 4,
          cache_read_input_tokens: 5,
          output_tokens: 4,
          output_tokens_details: { thinking_tokens: 0 },
        },
      };
    },
  }),
});

async function setup(t, family, { ambiguous = false } = {}) {
  const definition = DEFINITIONS[family];
  const root = await mkdtemp(join(tmpdir(), 'godagents-resolution-preparer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transportPolicy = definition.transportPolicy();
  const transportPolicyPath = join(root, 'transport-policy.json');
  const transportPolicyDigest = sha256Text(canonicalJson(transportPolicy));
  await writeFile(transportPolicyPath, `${canonicalJson(transportPolicy)}\n`, 'utf8');
  let providerCalls = 0;
  const host = await createProviderPhaseHost({
    family,
    policyPath: transportPolicyPath,
    env: {
      [definition.transportPin]: transportPolicyDigest,
      [transportPolicy.provider.credentialEnv]: `resolution-preparer-${family}-secret`,
    },
    runtimeRoot: join(root, 'operations'),
    clock: () => '2026-09-01T00:00:30.000Z',
    fetchImpl: async () => {
      providerCalls += 1;
      if (ambiguous) throw new Error('fixture ambiguous provider outcome');
      throw new Error('preparation must never call the provider');
    },
  });
  const resolutionPolicy = definition.resolutionPolicy({ transportPolicyDigest });
  const resolutionPolicyPath = join(root, 'resolution-policy.json');
  const resolutionPolicyDigest = sha256Text(canonicalJson(resolutionPolicy));
  await writeFile(resolutionPolicyPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
  const profile = host.describe().capabilities.resolutionProfile;
  const controller = await host.createOperatorResolutionController({
    policyPath: resolutionPolicyPath,
    env: { [profile.externalPolicyPinVariable]: resolutionPolicyDigest },
  });
  return {
    definition,
    host,
    controller,
    transportPolicy,
    get providerCalls() { return providerCalls; },
  };
}

function pending(operation = {}) {
  return {
    status: 'pending',
    operation: {
      phase: 'native',
      dispatchDigest: '1'.repeat(64),
      requestDigest: '2'.repeat(64),
      attemptId: '3'.repeat(64),
      ...operation,
    },
    resolutionAccepted: false,
  };
}

function input(state, overrides = {}) {
  return {
    hostDescription: state.host.describe(),
    controller: {
      policyDigest: state.controller.policyDigest,
      authorityKeyId: state.controller.authorityKeyId,
    },
    inspected: pending(),
    disposition: 'abandon',
    issuedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-09-01T00:05:00.000Z',
    nonce: 'prepared-resolution-001',
    ...overrides,
  };
}

function adoptionResponse(state) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify(state.definition.envelope(state.transportPolicy.provider.modelId)),
  };
}

test('both verified profiles prepare exact immutable abandonment signing payloads without provider work', async (t) => {
  for (const [family, definition] of Object.entries(DEFINITIONS)) {
    const state = await setup(t, family);
    const prepared = prepareProviderPhaseResolutionDecision(input(state));
    assert.equal(prepared.decision.protocolId, definition.decisionProtocolId);
    assert.equal(prepared.decision[definition.witnessField], null);
    assert.equal(prepared.decision.decisionDigest, sha256Value(
      Object.fromEntries(Object.entries(prepared.decision).filter(([key]) => key !== 'decisionDigest')),
    ));
    assert.equal(prepared.signingPayload, canonicalJson(prepared.decision));
    assert.equal(prepared.responseWitness, null);
    assert.equal(Object.isFrozen(prepared), true);
    assert.equal(Object.isFrozen(prepared.decision), true);
    assert.equal(state.providerCalls, 0);
  }
});

test('adoption builds each family native response witness and binds only its declared digest field', async (t) => {
  for (const [family, definition] of Object.entries(DEFINITIONS)) {
    const state = await setup(t, family);
    const prepared = prepareProviderPhaseResolutionDecision(input(state, {
      disposition: 'adopt-response',
      response: adoptionResponse(state),
    }));
    assert.equal(prepared.responseWitness.protocolId, definition.witnessProtocolId);
    assert.equal(prepared.decision[definition.witnessField], prepared.responseWitness.witnessDigest);
    const other = definition.witnessField === 'responseDigest'
      ? 'responseWitnessDigest'
      : 'responseDigest';
    assert.equal(Object.hasOwn(prepared.decision, other), false);
    assert.equal(prepared.signingPayload, canonicalJson(prepared.decision));
    assert.equal(state.providerCalls, 0);
  }
});

test('prepared decisions can be signed externally and accepted by both real controllers without redispatch', async (t) => {
  for (const [family, definition] of Object.entries(DEFINITIONS)) {
    const state = await setup(t, family, { ambiguous: true });
    const dispatch = await nativeDispatch(t, state.host.describe().descriptors.native);
    await assert.rejects(
      state.host.native.execute(dispatch),
      (error) => error?.code === 'provider-ambiguous',
    );
    const inspected = await state.controller.inspect({ phase: 'native', dispatch });
    const response = adoptionResponse(state);
    const prepared = prepareProviderPhaseResolutionDecision(input(state, {
      inspected,
      disposition: 'adopt-response',
      response,
      nonce: `prepared-resolution-${family}`,
    }));
    const signedDecision = definition.sign(prepared.decision);
    assert.equal(
      Buffer.from(prepared.signingPayload, 'utf8').equals(
        Buffer.from(canonicalJson(signedDecision.decision), 'utf8'),
      ),
      true,
    );
    const resolved = await state.controller.resolve({
      phase: 'native', dispatch, signedDecision, response,
    });
    assert.equal(resolved.status, 'completed');
    assert.equal(resolved.completion.artifact.content, 'prepared exact artifact');
    assert.equal(state.providerCalls, 1);
  }
});

test('preparation rejects authority network signer and unknown input fields through one closed boundary', async (t) => {
  const state = await setup(t, 'openai-compatible-chat-completions-v1');
  for (const extra of [
    { privateKey: 'forbidden' },
    { sign() {} },
    { fetchImpl() {} },
    { provider: 'ambient' },
  ]) {
    assert.throws(
      () => prepareProviderPhaseResolutionDecision({ ...input(state), ...extra }),
      /preparation/i,
    );
  }
  assert.equal(state.providerCalls, 0);
});

test('preparation rejects malformed controller and inspection projections', async (t) => {
  const state = await setup(t, 'anthropic-messages-v1');
  const cases = [
    { controller: { policyDigest: 'bad', authorityKeyId: state.controller.authorityKeyId } },
    { controller: { policyDigest: state.controller.policyDigest, authorityKeyId: '' } },
    { inspected: { ...pending(), status: 'completed' } },
    { inspected: { ...pending(), resolutionAccepted: true } },
    { inspected: pending({ phase: 'other' }) },
    { inspected: pending({ requestDigest: 'bad' }) },
    { inspected: { ...pending(), extra: true } },
    { inspected: { ...pending(), operation: { ...pending().operation, extra: true } } },
  ];
  for (const override of cases) {
    assert.throws(() => prepareProviderPhaseResolutionDecision(input(state, override)), /preparation/i);
  }
});

test('preparation rejects invalid disposition response timestamp nonce and optional-field combinations', async (t) => {
  const state = await setup(t, 'openai-compatible-chat-completions-v1');
  const response = adoptionResponse(state);
  const cases = [
    { disposition: 'retry' },
    { disposition: 'adopt-response' },
    { disposition: 'abandon', response },
    { disposition: 'adopt-response', response: { ...response, extra: true } },
    { disposition: 'adopt-response', response: { ...response, headers: { authorization: 'secret' } } },
    { issuedAt: '2026-09-01' },
    { expiresAt: '2026-09-01T00:00:00.000Z' },
    { expiresAt: '2026-08-31T23:59:59.999Z' },
    { nonce: '' },
    { nonce: 'bad nonce' },
    { nonce: 'x'.repeat(129) },
  ];
  for (const override of cases) {
    assert.throws(() => prepareProviderPhaseResolutionDecision(input(state, override)), /preparation/i);
  }
});

test('a cross-family profile substitution stays invalid after the outer digest is recomputed', async (t) => {
  const openAI = await setup(t, 'openai-compatible-chat-completions-v1');
  const anthropic = await setup(t, 'anthropic-messages-v1');
  const forged = structuredClone(anthropic.host.describe());
  forged.capabilities.resolutionProfile = structuredClone(
    openAI.host.describe().capabilities.resolutionProfile,
  );
  const { descriptionDigest: _old, ...unsigned } = forged;
  forged.descriptionDigest = sha256Value(unsigned);
  assert.throws(
    () => prepareProviderPhaseResolutionDecision(input(anthropic, { hostDescription: forged })),
    /preparation/i,
  );
});

test('returned artifacts cannot drift after source objects are mutated', async (t) => {
  const state = await setup(t, 'anthropic-messages-v1');
  const response = adoptionResponse(state);
  const source = input(state, { disposition: 'adopt-response', response });
  const prepared = prepareProviderPhaseResolutionDecision(source);
  const snapshot = canonicalJson(prepared);
  source.inspected.operation.attemptId = 'f'.repeat(64);
  source.response.bodyText = 'changed';
  assert.equal(canonicalJson(prepared), snapshot);
  assert.throws(() => { prepared.decision.nonce = 'changed'; }, TypeError);
});

