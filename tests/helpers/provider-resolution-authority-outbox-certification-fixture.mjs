import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { createProviderResolutionAuthorityOutbox } from '../../src/host/provider-resolution-authority-outbox.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { nativeDispatch } from './openai-compatible-phase-operation-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';
import {
  signResolutionDecision,
  validOpenAICompatiblePhaseResolutionPolicy,
} from './openai-compatible-phase-resolution-fixture.mjs';
import {
  signProviderResolutionDecision,
  validProviderPhaseResolutionPolicy,
} from './provider-phase-resolution-fixture.mjs';

const DEFINITIONS = Object.freeze({
  'anthropic-messages-v1': Object.freeze({
    transportPolicy: validAnthropicMessagesPhasePolicy,
    transportPin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validProviderPhaseResolutionPolicy,
    sign: signProviderResolutionDecision,
    disposition: 'abandon',
  }),
  'openai-compatible-chat-completions-v1': Object.freeze({
    transportPolicy: validOpenAICompatiblePhasePolicy,
    transportPin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validOpenAICompatiblePhaseResolutionPolicy,
    sign: signResolutionDecision,
    disposition: 'adopt-response',
  }),
});

function response(family, model, marker) {
  const body = family === 'anthropic-messages-v1'
    ? {
      id: 'msg_authority_outbox_fixture', type: 'message', role: 'assistant', model,
      content: [{ type: 'text', text: canonicalJson({ content: 'certified recovered artifact' }) }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: {
        input_tokens: 20, cache_creation_input_tokens: 4, cache_read_input_tokens: 5,
        output_tokens: 4, output_tokens_details: { thinking_tokens: 0 },
      },
    }
    : {
      id: 'chatcmpl_authority_outbox_fixture', object: 'chat.completion', model,
      choices: [{
        index: 0, finish_reason: 'stop',
        message: { role: 'assistant', content: canonicalJson({ content: 'certified recovered artifact' }) },
      }],
      usage: {
        prompt_tokens: 20, prompt_tokens_details: { cached_tokens: 5 },
        completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 0 }, total_tokens: 24,
      },
    };
  body.marker = marker;
  return { status: 200, headers: { 'content-type': 'application/json' }, bodyText: JSON.stringify(body) };
}

async function runFamily(family, definition) {
  const cleanups = [];
  const root = await mkdtemp(join(tmpdir(), 'godagents-authority-outbox-fixture-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const context = { after(callback) { cleanups.push(callback); } };
  try {
    const policy = definition.transportPolicy();
    const policyPath = join(root, 'transport-policy.json');
    const transportPolicyDigest = sha256Text(canonicalJson(policy));
    await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
    const credential = `authority-outbox-${family}-credential-canary`;
    let providerCalls = 0;
    const host = await createProviderPhaseHost({
      family,
      policyPath,
      env: { [definition.transportPin]: transportPolicyDigest, [policy.provider.credentialEnv]: credential },
      runtimeRoot: join(root, 'provider-operations'),
      clock: () => '2026-09-01T05:00:30.000Z',
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error('deterministic ambiguous provider outcome');
      },
    });
    const resolutionPolicy = definition.resolutionPolicy({ transportPolicyDigest });
    const resolutionPolicyDigest = sha256Text(canonicalJson(resolutionPolicy));
    const resolutionPath = join(root, 'resolution-policy.json');
    await writeFile(resolutionPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
    const resolutionPin = host.describe().capabilities.resolutionProfile.externalPolicyPinVariable;
    const controller = await host.createOperatorResolutionController({
      policyPath: resolutionPath,
      env: { [resolutionPin]: resolutionPolicyDigest },
    });
    const dispatch = await nativeDispatch(context, host.describe().descriptors.native);
    try { await host.native.execute(dispatch); } catch (error) {
      if (error?.code !== 'provider-ambiguous') throw error;
    }
    const marker = `authority-outbox-${family}-raw-response-canary`;
    const recovered = response(family, policy.provider.modelId, marker);
    const outboxRoot = join(root, 'authority-outbox');
    const outbox = await createProviderResolutionAuthorityOutbox({
      root: outboxRoot,
      host,
      controller,
      lockOptions: {
        pid: 65002,
        now: () => Date.parse('2026-09-01T05:01:00.000Z'),
        staleAfterMs: 1,
        isProcessAlive: () => false,
        nonce: () => `authority-outbox-${family}-lock`,
      },
    });
    const prepareInput = {
      phase: 'native', dispatch, disposition: definition.disposition,
      issuedAt: '2026-09-01T05:00:00.000Z', expiresAt: '2026-09-01T05:05:00.000Z',
      nonce: `authority-outbox-${family}`,
      ...(definition.disposition === 'adopt-response' ? { response: recovered } : {}),
    };
    const request = await outbox.prepare(prepareInput);
    const signature = definition.sign(request.decision).signature;
    const terminal = await outbox.submit({
      phase: 'native', dispatch, requestDigest: request.requestDigest, signature,
      ...(definition.disposition === 'adopt-response' ? { response: recovered } : {}),
    });
    const [operationId] = await readdir(join(outboxRoot, 'operations'));
    const operationRoot = join(outboxRoot, 'operations', operationId);
    const files = (await readdir(operationRoot)).sort();
    const records = Object.fromEntries(await Promise.all(files.map(async (file) => [
      file, JSON.parse(await readFile(join(operationRoot, file), 'utf8')),
    ])));
    const durableText = canonicalJson(records);
    if (providerCalls !== 1 || durableText.includes(marker) || durableText.includes(credential)) {
      throw new Error('authority outbox fixture containment failed');
    }
    return {
      family,
      hostDescriptionDigest: host.describe().descriptionDigest,
      transportPolicyDigest,
      resolutionPolicyDigest,
      operationId,
      requestDigest: request.requestDigest,
      decisionDigest: request.decision.decisionDigest,
      envelopeDigest: records['signed-return.json'].envelopeDigest,
      terminalDigest: terminal.terminalDigest,
      outcomeStatus: terminal.outcomeStatus,
      fileSet: files,
      providerCalls,
      durableRecordDigest: sha256Value(records),
    };
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}

export async function buildDeterministicProviderResolutionAuthorityOutboxFixture() {
  const rows = [];
  for (const [family, definition] of Object.entries(DEFINITIONS)) {
    rows.push(await runFamily(family, definition));
  }
  const families = Object.fromEntries(rows.map((row) => [row.family, Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== 'family'),
  )]));
  const assertions = {
    families: 2,
    operations: 2,
    signingRequests: 2,
    signedReturns: 2,
    resolvedTerminals: 2,
    adoptedResponses: 1,
    abandonedOperations: 1,
    providerCalls: 2,
    additionalProviderCalls: 0,
    rawResponseBodiesRetained: 0,
    credentialsRetained: 0,
    privateKeysRetained: 0,
    automaticRetries: 0,
  };
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-provider-resolution-authority-outbox-fixture-v1',
    families,
    assertions,
  };
  return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
}
