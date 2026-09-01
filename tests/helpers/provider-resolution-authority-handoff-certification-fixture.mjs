import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import {
  bindProviderResolutionAuthoritySignature,
  buildProviderResolutionAuthoritySigningRequest,
} from '../../src/host/provider-resolution-authority-handoff.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
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
  }),
  'openai-compatible-chat-completions-v1': Object.freeze({
    transportPolicy: validOpenAICompatiblePhasePolicy,
    transportPin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validOpenAICompatiblePhaseResolutionPolicy,
    sign: signResolutionDecision,
  }),
});

export async function buildDeterministicProviderResolutionAuthorityHandoffFixture() {
  const cleanups = [];
  const families = {};
  let providerCalls = 0;
  try {
    for (const [family, definition] of Object.entries(DEFINITIONS)) {
      const root = await mkdtemp(join(tmpdir(), 'godagents-authority-handoff-certification-'));
      cleanups.push(() => rm(root, { recursive: true, force: true }));
      const transportPolicy = definition.transportPolicy();
      const transportPath = join(root, 'transport-policy.json');
      const transportPolicyDigest = sha256Text(canonicalJson(transportPolicy));
      await writeFile(transportPath, `${canonicalJson(transportPolicy)}\n`, 'utf8');
      const host = await createProviderPhaseHost({
        family,
        policyPath: transportPath,
        env: {
          [definition.transportPin]: transportPolicyDigest,
          [transportPolicy.provider.credentialEnv]: `authority-handoff-${family}-canary`,
        },
        runtimeRoot: join(root, 'operations'),
        fetchImpl: async () => {
          providerCalls += 1;
          throw new Error('authority handoff fixture must not call provider');
        },
      });
      const description = host.describe();
      const profile = description.capabilities.resolutionProfile;
      const resolutionPolicy = definition.resolutionPolicy({ transportPolicyDigest });
      const resolutionPath = join(root, 'resolution-policy.json');
      const resolutionPolicyDigest = sha256Text(canonicalJson(resolutionPolicy));
      await writeFile(resolutionPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
      const controller = await host.createOperatorResolutionController({
        policyPath: resolutionPath,
        env: { [profile.externalPolicyPinVariable]: resolutionPolicyDigest },
      });
      const inspected = {
        status: 'pending',
        operation: {
          phase: 'native',
          dispatchDigest: sha256Text(`${family}:handoff:dispatch`),
          requestDigest: sha256Text(`${family}:handoff:request`),
          attemptId: sha256Text(`${family}:handoff:attempt`),
        },
        resolutionAccepted: false,
      };
      const context = {
        hostDescription: description,
        controller: {
          policyDigest: controller.policyDigest,
          authorityKeyId: controller.authorityKeyId,
        },
        inspected,
      };
      const request = buildProviderResolutionAuthoritySigningRequest({
        ...context,
        disposition: 'adopt-response',
        response: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          bodyText: canonicalJson({ family, artifact: 'authority-handoff-certification' }),
        },
        issuedAt: '2026-09-01T03:00:00.000Z',
        expiresAt: '2026-09-01T03:05:00.000Z',
        nonce: `${family}:authority-handoff`,
      });
      const signature = definition.sign(request.decision).signature;
      const handoff = bindProviderResolutionAuthoritySignature({ ...context, request, signature });
      families[family] = {
        hostDescriptionDigest: description.descriptionDigest,
        transportPolicyDigest,
        resolutionPolicyDigest,
        requestDigest: request.requestDigest,
        decisionDigest: request.decision.decisionDigest,
        responseWitnessDigest: request.responseWitness.witnessDigest,
        signingPayloadSha256: request.signingPayloadSha256,
        envelopeDigest: handoff.envelopeDigest,
        signatureAlgorithm: request.signatureAlgorithm,
        signingPayloadEncoding: request.signingPayloadEncoding,
        cryptographicStatus: handoff.cryptographicStatus,
      };
    }
    const values = Object.values(families);
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-provider-resolution-authority-handoff-fixture-v1',
      families,
      assertions: {
        families: values.length,
        signingRequests: values.length,
        signedReturns: values.length,
        providerCalls,
        embeddedPrivateKeys: 0,
        embeddedSigningOperations: 0,
        rawResponseBodiesRetained: 0,
        explicitUnverifiedReturns: values.filter(
          (value) => value.cryptographicStatus === 'unverified',
        ).length,
        distinctRequests: new Set(values.map((value) => value.requestDigest)).size,
        distinctReturns: new Set(values.map((value) => value.envelopeDigest)).size,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}

