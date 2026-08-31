import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { createAnthropicMessagesPhaseTransportSuite } from '../../src/transports/anthropic-messages-phase-transport.mjs';
import { buildProviderPhaseResponseWitness } from '../../src/transports/provider-phase-resolution.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { nativeDispatch } from './openai-compatible-phase-operation-fixture.mjs';
import {
  signProviderResolutionDecision,
  unsignedProviderResolutionDecision,
  validProviderPhaseResolutionPolicy,
} from './provider-phase-resolution-fixture.mjs';

const SECRET = 'provider-neutral-resolution-certification-secret';

function recoveredResponse(model) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify({
      type: 'message',
      id: 'msg_provider_resolution_certification',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: canonicalJson({
        content: 'one certified provider-neutral recovered artifact',
      }) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 120,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 70,
        output_tokens: 25,
        output_tokens_details: { thinking_tokens: 0 },
      },
    }),
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

function signedDecision(operation, policyDigest, overrides = {}) {
  return signProviderResolutionDecision(unsignedProviderResolutionDecision({
    policyDigest,
    phase: operation.phase,
    dispatchDigest: operation.dispatchDigest,
    requestDigest: operation.requestDigest,
    attemptId: operation.attemptId,
    ...overrides,
  }));
}

export async function buildDeterministicProviderPhaseResolutionFixture() {
  const cleanups = [];
  const context = { after(callback) { cleanups.push(callback); } };
  const root = await mkdtemp(join(tmpdir(), 'godagents-provider-resolution-certification-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  try {
    const transportPolicy = validAnthropicMessagesPhasePolicy();
    const transportPolicyPath = join(root, 'transport-policy.json');
    const transportPolicyDigest = sha256Text(canonicalJson(transportPolicy));
    await writeFile(transportPolicyPath, `${canonicalJson(transportPolicy)}\n`, 'utf8');
    const resolutionPolicy = validProviderPhaseResolutionPolicy({ transportPolicyDigest });
    const resolutionPolicyPath = join(root, 'resolution-policy.json');
    const resolutionPolicyDigest = sha256Text(canonicalJson(resolutionPolicy));
    await writeFile(resolutionPolicyPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
    const env = {
      GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256: transportPolicyDigest,
      [transportPolicy.provider.credentialEnv]: SECRET,
    };
    const resolutionEnv = {
      GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256: resolutionPolicyDigest,
    };
    let providerCalls = 0;
    const createSuite = (name) => createAnthropicMessagesPhaseTransportSuite({
      policyPath: transportPolicyPath,
      env,
      runtimeRoot: join(root, name),
      clock: () => '2026-08-31T20:02:00.000Z',
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error('deterministic ambiguous provider outcome');
      },
    });

    const adoptionSuite = await createSuite('adoption');
    const adoptionDispatch = await nativeDispatch(context, adoptionSuite.descriptors.native);
    try {
      await adoptionSuite.native.execute(adoptionDispatch);
    } catch (error) {
      if (error.code !== 'provider-ambiguous') throw error;
    }
    const adoptionController = await adoptionSuite.createOperatorResolutionController({
      policyPath: resolutionPolicyPath,
      env: resolutionEnv,
    });
    const adoptionPending = await adoptionController.inspect({ phase: 'native', dispatch: adoptionDispatch });
    const response = recoveredResponse(transportPolicy.provider.modelId);
    const witness = buildProviderPhaseResponseWitness(response);
    const adoptionDecision = signedDecision(adoptionPending.operation, resolutionPolicyDigest, {
      disposition: 'adopt-response',
      responseWitnessDigest: witness.witnessDigest,
      nonce: 'certified-provider-resolution-adoption',
    });
    const adopted = await adoptionController.resolve({
      phase: 'native', dispatch: adoptionDispatch, signedDecision: adoptionDecision, response,
    });
    const adoptionRoot = join(root, 'adoption', 'native', adoptionDispatch.dispatchDigest);
    const adoptionResolution = JSON.parse(await readFile(join(adoptionRoot, 'resolution.json'), 'utf8'));
    const adoptionEvidence = JSON.parse(await readFile(join(adoptionRoot, 'provider-evidence.json'), 'utf8'));

    const abandonSuite = await createSuite('abandonment');
    const abandonDispatch = await nativeDispatch(context, abandonSuite.descriptors.native);
    try {
      await abandonSuite.native.execute(abandonDispatch);
    } catch (error) {
      if (error.code !== 'provider-ambiguous') throw error;
    }
    const abandonController = await abandonSuite.createOperatorResolutionController({
      policyPath: resolutionPolicyPath,
      env: resolutionEnv,
    });
    const abandonPending = await abandonController.inspect({ phase: 'native', dispatch: abandonDispatch });
    const abandonDecision = signedDecision(abandonPending.operation, resolutionPolicyDigest, {
      nonce: 'certified-provider-resolution-abandonment',
    });
    const abandoned = await abandonController.resolve({
      phase: 'native', dispatch: abandonDispatch, signedDecision: abandonDecision,
    });
    const abandonRoot = join(root, 'abandonment', 'native', abandonDispatch.dispatchDigest);
    const abandonResolution = JSON.parse(await readFile(join(abandonRoot, 'resolution.json'), 'utf8'));

    delete env[transportPolicy.provider.credentialEnv];
    let replayProviderCalls = 0;
    const replay = await createAnthropicMessagesPhaseTransportSuite({
      policyPath: transportPolicyPath,
      env,
      runtimeRoot: join(root, 'adoption'),
      fetchImpl: async () => {
        replayProviderCalls += 1;
        throw new Error('completed replay must not call provider');
      },
    });
    const reconciled = await replay.native.reconcile(adoptionDispatch);
    const executed = await replay.native.execute(adoptionDispatch);
    const resolutionText = await readFile(join(adoptionRoot, 'resolution.json'), 'utf8');
    const durableText = await allFileText(root);
    const assertions = {
      ambiguousProviderCalls: providerCalls,
      resolutionProviderCalls: 0,
      replayProviderCalls,
      completedReplays: Number(reconciled.status === 'completed') + Number(executed.status === 'completed'),
      adoptedOperations: Number(adopted.status === 'completed'),
      abandonedOperations: Number(abandoned.status === 'abandoned'),
      credentialLeaks: durableText.includes(SECRET) ? 1 : 0,
      resolutionBodyLeaks: resolutionText.includes('one certified provider-neutral recovered artifact') ? 1 : 0,
      authorityExpansions: Object.values(adopted.completion.authority).filter(Boolean).length,
    };
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-provider-neutral-phase-resolution-fixture-v1',
      transportPolicyDigest,
      resolutionPolicyDigest,
      adoption: {
        phase: 'native',
        dispatchDigest: adoptionDispatch.dispatchDigest,
        requestDigest: adoptionPending.operation.requestDigest,
        attemptId: adoptionPending.operation.attemptId,
        decisionDigest: adoptionDecision.decision.decisionDigest,
        responseWitnessDigest: witness.witnessDigest,
        resolutionRecordDigest: adoptionResolution.recordDigest,
        providerEvidenceRecordDigest: adoptionEvidence.recordDigest,
        completionDigest: adopted.completion.completionDigest,
      },
      abandonment: {
        phase: 'native',
        dispatchDigest: abandonDispatch.dispatchDigest,
        requestDigest: abandonPending.operation.requestDigest,
        attemptId: abandonPending.operation.attemptId,
        decisionDigest: abandonDecision.decision.decisionDigest,
        resolutionRecordDigest: abandonResolution.recordDigest,
        reasonCode: abandoned.reasonCode,
      },
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}
