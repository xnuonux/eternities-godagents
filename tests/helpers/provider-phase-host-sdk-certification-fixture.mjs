import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';
import { runProviderPhaseHostConformance } from './provider-phase-host-conformance.mjs';

const PHASES = ['native', 'review', 'revision'];
const DEFINITIONS = Object.freeze({
  'anthropic-messages-v1': Object.freeze({
    policy: validAnthropicMessagesPhasePolicy,
    pin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    envelope(model, phase) {
      return {
        id: `msg_provider_phase_sdk_${phase}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: canonicalJson(content(phase)) }],
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
  }),
  'openai-compatible-chat-completions-v1': Object.freeze({
    policy: validOpenAICompatiblePhasePolicy,
    pin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    envelope(model, phase) {
      return {
        id: `chatcmpl_provider_phase_sdk_${phase}`,
        object: 'chat.completion',
        model,
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: canonicalJson(content(phase)) },
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
  }),
});

function content(phase) {
  if (phase === 'native') return { content: 'one certified portable sdk native artifact' };
  if (phase === 'review') {
    return { recommendation: 'accept', findings: [], summary: 'certified portable sdk review accepts' };
  }
  return {
    addressedFindingIds: ['bind-evidence'],
    content: 'certified portable sdk revision binds its evidence',
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

export async function buildDeterministicProviderPhaseHostSdkFixture() {
  const cleanups = [];
  const context = { after(callback) { cleanups.push(callback); } };
  const records = {};
  const surfaces = [];
  let credentialLeaks = 0;
  try {
    for (const [family, definition] of Object.entries(DEFINITIONS)) {
      const root = await mkdtemp(join(tmpdir(), 'godagents-provider-phase-sdk-certification-'));
      cleanups.push(() => rm(root, { recursive: true, force: true }));
      const policy = definition.policy();
      const policyPath = join(root, 'policy.json');
      const policyDigest = sha256Text(canonicalJson(policy));
      await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
      const secret = `provider-phase-sdk-certification-${family}`;
      const env = {
        [definition.pin]: policyDigest,
        [policy.provider.credentialEnv]: secret,
      };
      const times = [
        '2026-08-31T23:58:00.000Z', '2026-08-31T23:58:00.250Z',
        '2026-08-31T23:59:00.000Z', '2026-08-31T23:59:00.250Z',
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.250Z',
      ];
      let phaseIndex = 0;
      let calls = 0;
      const host = await createProviderPhaseHost({
        family,
        policyPath,
        env,
        runtimeRoot: join(root, 'operations'),
        clock: () => times.shift(),
        fetchImpl: async () => {
          calls += 1;
          const phase = PHASES[phaseIndex++];
          return new Response(JSON.stringify(definition.envelope(policy.provider.modelId, phase)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      });
      surfaces.push(Object.keys(host).sort());
      const result = await runProviderPhaseHostConformance({
        context,
        host,
        removeCredential() { delete env[policy.provider.credentialEnv]; },
        providerCalls() { return calls; },
      });
      const description = host.describe();
      records[family] = {
        policyDigest,
        descriptionDigest: description.descriptionDigest,
        capabilities: structuredClone(description.capabilities),
        descriptorDigests: Object.fromEntries(PHASES.map((phase) => [
          phase,
          description.descriptors[phase].descriptorDigest,
        ])),
        completedPhases: [...result.completedPhases],
        completionDigests: structuredClone(result.completionDigests),
        providerCalls: result.providerCalls,
        replayProviderCalls: result.replayProviderCalls,
        authorityExpansions: result.authorityExpansions,
      };
      if ((await allFileText(root)).includes(secret)) credentialLeaks += 1;
    }
    const values = Object.values(records);
    const assertions = {
      families: values.length,
      completedPhases: values.reduce((sum, value) => sum + value.completedPhases.length, 0),
      providerCalls: values.reduce((sum, value) => sum + value.providerCalls, 0),
      replayProviderCalls: values.reduce((sum, value) => sum + value.replayProviderCalls, 0),
      authorityExpansions: values.reduce((sum, value) => sum + value.authorityExpansions, 0),
      credentialLeaks,
      explicitCapabilityDifferences: values[0].capabilities.providerEvidenceProfile
        !== values[1].capabilities.providerEvidenceProfile
        && values[0].capabilities.wireProfile !== values[1].capabilities.wireProfile,
      commonSurfaceParity: surfaces.every((surface) => canonicalJson(surface) === canonicalJson(surfaces[0])),
    };
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-provider-phase-host-sdk-fixture-v1',
      families: records,
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}
