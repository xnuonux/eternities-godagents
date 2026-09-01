import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { prepareProviderPhaseResolutionDecision } from '../../src/host/provider-phase-resolution-decision-preparer.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhaseResolutionPolicy } from './openai-compatible-phase-resolution-fixture.mjs';
import { validProviderPhaseResolutionPolicy } from './provider-phase-resolution-fixture.mjs';

const DEFINITIONS = Object.freeze({
  'anthropic-messages-v1': Object.freeze({
    transportPolicy: validAnthropicMessagesPhasePolicy,
    transportPin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validProviderPhaseResolutionPolicy,
  }),
  'openai-compatible-chat-completions-v1': Object.freeze({
    transportPolicy: validOpenAICompatiblePhasePolicy,
    transportPin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validOpenAICompatiblePhaseResolutionPolicy,
  }),
});

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

export async function buildDeterministicProviderResolutionDecisionPreparerFixture() {
  const cleanups = [];
  const families = {};
  let providerCalls = 0;
  let credentialLeaks = 0;
  try {
    for (const [family, definition] of Object.entries(DEFINITIONS)) {
      const root = await mkdtemp(join(tmpdir(), 'godagents-resolution-preparer-certification-'));
      cleanups.push(() => rm(root, { recursive: true, force: true }));
      const transportPolicy = definition.transportPolicy();
      const transportPolicyPath = join(root, 'transport-policy.json');
      const transportPolicyDigest = sha256Text(canonicalJson(transportPolicy));
      await writeFile(transportPolicyPath, `${canonicalJson(transportPolicy)}\n`, 'utf8');
      const secret = `resolution-preparer-certification-${family}-secret`;
      const host = await createProviderPhaseHost({
        family,
        policyPath: transportPolicyPath,
        env: {
          [definition.transportPin]: transportPolicyDigest,
          [transportPolicy.provider.credentialEnv]: secret,
        },
        runtimeRoot: join(root, 'operations'),
        fetchImpl: async () => {
          providerCalls += 1;
          throw new Error('decision preparation fixture must not call provider');
        },
      });
      const description = host.describe();
      const profile = description.capabilities.resolutionProfile;
      const resolutionPolicy = definition.resolutionPolicy({ transportPolicyDigest });
      const resolutionPolicyPath = join(root, 'resolution-policy.json');
      const resolutionPolicyDigest = sha256Text(canonicalJson(resolutionPolicy));
      await writeFile(resolutionPolicyPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
      const controller = await host.createOperatorResolutionController({
        policyPath: resolutionPolicyPath,
        env: { [profile.externalPolicyPinVariable]: resolutionPolicyDigest },
      });
      const common = {
        hostDescription: description,
        controller: {
          policyDigest: controller.policyDigest,
          authorityKeyId: controller.authorityKeyId,
        },
        inspected: {
          status: 'pending',
          operation: {
            phase: 'native',
            dispatchDigest: sha256Text(`${family}:dispatch`),
            requestDigest: sha256Text(`${family}:request`),
            attemptId: sha256Text(`${family}:attempt`),
          },
          resolutionAccepted: false,
        },
        issuedAt: '2026-09-01T01:00:00.000Z',
        expiresAt: '2026-09-01T01:05:00.000Z',
      };
      const abandoned = prepareProviderPhaseResolutionDecision({
        ...common,
        disposition: 'abandon',
        nonce: `${family}:abandon`,
      });
      const adopted = prepareProviderPhaseResolutionDecision({
        ...common,
        disposition: 'adopt-response',
        response: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          bodyText: canonicalJson({ family, artifact: 'certified-prepared-response' }),
        },
        nonce: `${family}:adopt`,
      });
      families[family] = {
        descriptionDigest: description.descriptionDigest,
        resolutionProfileDigest: sha256Value(profile),
        resolutionPolicyDigest,
        authorityKeyId: controller.authorityKeyId,
        decisionProtocolId: profile.decisionProtocolId,
        responseWitnessProtocolId: profile.responseWitnessProtocolId,
        responseWitnessDigestField: profile.responseWitnessDigestField,
        abandonDecisionDigest: abandoned.decision.decisionDigest,
        abandonSigningPayloadSha256: sha256Text(abandoned.signingPayload),
        adoptDecisionDigest: adopted.decision.decisionDigest,
        adoptSigningPayloadSha256: sha256Text(adopted.signingPayload),
        adoptResponseWitnessDigest: adopted.responseWitness.witnessDigest,
        frozenOutputs: Object.isFrozen(abandoned) && Object.isFrozen(abandoned.decision)
          && Object.isFrozen(adopted) && Object.isFrozen(adopted.responseWitness),
      };
      if ((await allFileText(root)).includes(secret)) credentialLeaks += 1;
    }
    const values = Object.values(families);
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-provider-resolution-decision-preparer-fixture-v1',
      families,
      assertions: {
        families: values.length,
        decisionsPrepared: values.length * 2,
        responseWitnessesPrepared: values.length,
        providerCalls,
        credentialLeaks,
        signaturesCreated: 0,
        privateKeysAccepted: 0,
        frozenOutputs: values.every((value) => value.frozenOutputs),
        distinctDecisionProtocols: new Set(values.map((value) => value.decisionProtocolId)).size,
        distinctWitnessProtocols: new Set(values.map((value) => value.responseWitnessProtocolId)).size,
        distinctWitnessDigestFields: new Set(values.map((value) => value.responseWitnessDigestField)).size,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}

