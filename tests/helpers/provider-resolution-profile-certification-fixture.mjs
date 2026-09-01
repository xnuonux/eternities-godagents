import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhaseResolutionPolicy } from './openai-compatible-phase-resolution-fixture.mjs';
import { validProviderPhaseResolutionPolicy } from './provider-phase-resolution-fixture.mjs';

const FAMILIES = Object.freeze({
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

export async function buildDeterministicProviderResolutionProfileFixture() {
  const cleanups = [];
  const families = {};
  let credentialLeaks = 0;
  let providerCalls = 0;
  try {
    for (const [family, definition] of Object.entries(FAMILIES)) {
      const root = await mkdtemp(join(tmpdir(), 'godagents-provider-resolution-profile-'));
      cleanups.push(() => rm(root, { recursive: true, force: true }));
      const transportPolicy = definition.transportPolicy();
      const transportPolicyPath = join(root, 'transport-policy.json');
      const transportPolicyDigest = sha256Text(canonicalJson(transportPolicy));
      await writeFile(transportPolicyPath, `${canonicalJson(transportPolicy)}\n`, 'utf8');
      const secret = `provider-resolution-profile-${family}-secret`;
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
          throw new Error('profile fixture must not call provider');
        },
      });
      const description = host.describe();
      const profile = structuredClone(description.capabilities.resolutionProfile);
      const resolutionPolicy = definition.resolutionPolicy({ transportPolicyDigest });
      const resolutionPolicyPath = join(root, 'resolution-policy.json');
      const resolutionPolicyDigest = sha256Text(canonicalJson(resolutionPolicy));
      await writeFile(resolutionPolicyPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
      const controller = await host.createOperatorResolutionController({
        policyPath: resolutionPolicyPath,
        env: { [profile.externalPolicyPinVariable]: resolutionPolicyDigest },
      });
      families[family] = {
        transportPolicyDigest,
        descriptionDigest: description.descriptionDigest,
        resolutionProfile: profile,
        resolutionProfileDigest: sha256Value(profile),
        resolutionPolicyDigest: controller.policyDigest,
        authorityKeyId: controller.authorityKeyId,
        controllerSurface: Object.keys(controller).sort(),
      };
      if ((await allFileText(root)).includes(secret)) credentialLeaks += 1;
    }
    const values = Object.values(families);
    const first = values[0].resolutionProfile;
    const second = values[1].resolutionProfile;
    const assertions = {
      families: values.length,
      providerCalls,
      credentialLeaks,
      controllerSurfaceParity: values.every((value) => canonicalJson(value.controllerSurface)
        === canonicalJson(values[0].controllerSurface)),
      distinctProfileDigests: new Set(values.map((value) => value.resolutionProfileDigest)).size,
      sharedNoRetry: values.every((value) => value.resolutionProfile.automaticRetry === false),
      sharedZeroProviderCalls: values.every((value) => value.resolutionProfile.providerCallsDuringResolution === 0),
      sharedAcceptedRecovery: values.every(
        (value) => value.resolutionProfile.acceptedDecisionRecoveryAfterExpiry === true,
      ),
      explicitDecisionProtocolDifference: first.decisionProtocolId !== second.decisionProtocolId,
      explicitWitnessFieldDifference: first.responseWitnessDigestField !== second.responseWitnessDigestField,
    };
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-provider-resolution-profile-fixture-v1',
      families,
      assertions,
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}
