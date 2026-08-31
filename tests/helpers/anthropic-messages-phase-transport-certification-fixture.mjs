import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { createAnthropicMessagesPhaseTransportSuite } from '../../src/transports/anthropic-messages-phase-transport.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import {
  nativeDispatch,
  reviewDispatch,
  revisionDispatch,
} from './openai-compatible-phase-operation-fixture.mjs';

const SECRET = 'durable-anthropic-certification-canary';

function response(model, id, content) {
  return new Response(JSON.stringify({
    type: 'message',
    id,
    role: 'assistant',
    model,
    content: [{ type: 'text', text: canonicalJson(content) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      cache_creation_input_tokens: 40,
      cache_read_input_tokens: 60,
      output_tokens: 30,
      output_tokens_details: { thinking_tokens: 0 },
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
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

function authorityExpansions(completions) {
  return completions.reduce((sum, completion) => sum
    + Object.values(completion.authority).filter(Boolean).length, 0);
}

export async function buildDeterministicAnthropicMessagesPhaseTransportFixture() {
  const cleanups = [];
  const context = { after(callback) { cleanups.push(callback); } };
  const root = await mkdtemp(join(tmpdir(), 'godagents-durable-anthropic-certification-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  try {
    const policy = validAnthropicMessagesPhasePolicy();
    const policyPath = join(root, 'policy.json');
    const policyDigest = sha256Text(canonicalJson(policy));
    await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
    const env = {
      GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256: policyDigest,
      [policy.provider.credentialEnv]: SECRET,
    };
    const values = [
      '2026-08-31T23:50:00.000Z', '2026-08-31T23:50:00.250Z',
      '2026-08-31T23:51:00.000Z', '2026-08-31T23:51:00.250Z',
      '2026-08-31T23:52:00.000Z', '2026-08-31T23:52:00.250Z',
    ];
    const outputs = [
      response(policy.provider.modelId, 'msg_durable_cert_native', {
        content: 'one certified durable Anthropic native artifact',
      }),
      response(policy.provider.modelId, 'msg_durable_cert_review', {
        recommendation: 'accept',
        findings: [],
        summary: 'the certified durable Anthropic subject satisfies review',
      }),
      response(policy.provider.modelId, 'msg_durable_cert_revision', {
        addressedFindingIds: ['bind-evidence'],
        content: 'the certified durable Anthropic revision binds its evidence',
      }),
    ];
    let providerCalls = 0;
    const suite = await createAnthropicMessagesPhaseTransportSuite({
      policyPath,
      env,
      runtimeRoot: join(root, 'operations'),
      clock: () => values.shift(),
      fetchImpl: async () => {
        providerCalls += 1;
        return outputs.shift();
      },
    });
    const dispatches = {
      native: await nativeDispatch(context, suite.descriptors.native),
      review: await reviewDispatch(suite.descriptors.review),
      revision: revisionDispatch(suite.descriptors.revision),
    };
    const completions = {};
    for (const phase of ['native', 'review', 'revision']) {
      completions[phase] = (await suite[phase].execute(dispatches[phase])).completion;
    }

    const records = {};
    for (const phase of ['native', 'review', 'revision']) {
      const evidence = JSON.parse(await readFile(join(
        root,
        'operations',
        phase,
        dispatches[phase].dispatchDigest,
        'provider-evidence.json',
      ), 'utf8'));
      records[phase] = {
        dispatchDigest: dispatches[phase].dispatchDigest,
        descriptorDigest: suite.descriptors[phase].descriptorDigest,
        completionDigest: completions[phase].completionDigest,
        providerEvidenceRecordDigest: evidence.recordDigest,
        providerUsage: structuredClone(evidence.providerUsage),
      };
    }

    delete env[policy.provider.credentialEnv];
    let replayProviderCalls = 0;
    const reconstructed = await createAnthropicMessagesPhaseTransportSuite({
      policyPath,
      env,
      runtimeRoot: join(root, 'operations'),
      fetchImpl: async () => {
        replayProviderCalls += 1;
        throw new Error('certified replay must not call provider');
      },
    });
    let completedReplays = 0;
    for (const phase of ['native', 'review', 'revision']) {
      const reconciled = await reconstructed[phase].reconcile(dispatches[phase]);
      const replayed = await reconstructed[phase].execute(dispatches[phase]);
      if (reconciled.status === 'completed' && replayed.status === 'completed'
          && reconciled.completion.completionDigest === completions[phase].completionDigest
          && replayed.completion.completionDigest === completions[phase].completionDigest) {
        completedReplays += 1;
      }
    }
    const durableText = await allFileText(root);
    const assertions = {
      providerCalls,
      replayProviderCalls,
      completedReplays,
      credentialLeaks: durableText.includes(SECRET) ? 1 : 0,
      authorityExpansions: authorityExpansions(Object.values(completions)),
      cacheCreationInputTokens: Object.values(records).reduce(
        (sum, phase) => sum + phase.providerUsage.cacheCreationInputTokens,
        0,
      ),
      cacheReadInputTokens: Object.values(records).reduce(
        (sum, phase) => sum + phase.providerUsage.cacheReadInputTokens,
        0,
      ),
    };
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-durable-anthropic-messages-phase-transport-fixture-v1',
      policyDigest,
      phases: records,
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}
