import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import {
  assertPortablePhaseHostInstance,
  buildPortablePhaseHostDescription,
  createPortablePhaseHostAdapter,
} from '../../src/sdk/portable-phase-host.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';

const definitions = Object.freeze([
  {
    family: 'anthropic-messages-v1',
    pin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    policy: validAnthropicMessagesPhasePolicy,
  },
  {
    family: 'openai-compatible-chat-completions-v1',
    pin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    policy: validOpenAICompatiblePhasePolicy,
  },
]);

export async function buildDeterministicPortablePhaseHostConformanceFixture() {
  const records = {};
  let providerCalls = 0;
  const root = await mkdtemp(join(tmpdir(), 'godagents-portable-phase-conformance-'));
  try {
    for (const definition of definitions) {
      const policy = definition.policy();
      const policyPath = join(root, `${definition.family}.json`);
      const policyDigest = sha256Text(canonicalJson(policy));
      const secret = `portable-phase-conformance-${definition.family}-secret`;
      await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
      const provider = await createProviderPhaseHost({
        family: definition.family,
        policyPath,
        env: {
          [definition.pin]: policyDigest,
          [policy.provider.credentialEnv]: secret,
        },
        runtimeRoot: join(root, 'provider', definition.family),
        fetchImpl: async () => {
          providerCalls += 1;
          throw new Error('portable conformance fixture must not call a provider');
        },
      });
      const providerDescription = provider.describe();
      const description = buildPortablePhaseHostDescription({
        adapterId: `provider-wrapper-${definition.family}`,
        adapterVersion: '1',
        policyDigest,
        descriptors: providerDescription.descriptors,
      });
      const wrapped = await createPortablePhaseHostAdapter({
        description,
        native: provider.native,
        review: provider.review,
        revision: provider.revision,
        assertCredentialAbsent: provider.assertCredentialAbsent,
        createOperatorResolutionController: provider.createOperatorResolutionController,
      });
      const verified = assertPortablePhaseHostInstance(wrapped);
      const serialized = canonicalJson(verified);
      records[definition.family] = {
        adapterId: verified.adapterId,
        policyDigest: verified.policyDigest,
        descriptionDigest: verified.descriptionDigest,
        descriptorDigests: Object.fromEntries(
          Object.entries(verified.descriptors).map(([phase, descriptor]) => [phase, descriptor.descriptorDigest]),
        ),
        exposedFields: Object.keys(wrapped).sort(),
        credentialFree: !serialized.includes(secret),
        providerCallsAtConstruction: providerCalls,
        authorityEmpty: Object.values(verified.authority).every((value) => value === false),
      };
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const assertions = {
    adapters: definitions.length,
    wrappedPhases: definitions.length * 3,
    providerCalls: providerCalls,
    credentialLeaks: Object.values(records).filter((record) => !record.credentialFree).length,
    authorityExpansions: Object.values(records).filter((record) => !record.authorityEmpty).length,
    commonSurfaceParity: Object.values(records).every((record) => canonicalJson(record.exposedFields) === canonicalJson([
      'assertCredentialAbsent',
      'createOperatorResolutionController',
      'describe',
      'native',
      'review',
      'revision',
    ])),
  };
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-portable-phase-host-conformance-fixture-v1',
    adapters: records,
    assertions,
  };
  return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
}
