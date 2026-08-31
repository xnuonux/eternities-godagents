export function validAnthropicMessagesPhasePolicy() {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-anthropic-messages-phase-transport-policy-v1',
    policyId: 'anthropic-messages-phase-fixture-v1',
    provider: {
      profile: 'anthropic-messages-json-schema',
      endpointOrigin: 'https://api.anthropic.com',
      endpointPath: '/v1/messages',
      apiVersion: '2023-06-01',
      modelId: 'claude-fixture-2026-08-31',
      credentialEnv: 'GODAGENT_TEST_ANTHROPIC_KEY',
      timeoutMs: 30_000,
      maximumRequestBytes: 1_048_576,
      maximumResponseBytes: 1_048_576,
    },
    phases: {
      native: {
        maximumDispatchBytes: 1_048_576,
        maximumCompletionBytes: 1_048_576,
        maximumCompletionTokens: 1000,
      },
      review: { maximumCompletionBytes: 1_048_576, maximumCompletionTokens: 500 },
      revision: { maximumCompletionBytes: 1_048_576, maximumCompletionTokens: 800 },
    },
  };
}
