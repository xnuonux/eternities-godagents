export function validOpenAICompatiblePhasePolicy() {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-openai-compatible-phase-transport-policy-v1',
    policyId: 'openai-compatible-phase-fixture-v1',
    provider: {
      profile: 'chat-completions-json-schema',
      endpointOrigin: 'https://models.example.test',
      endpointPath: '/v1/chat/completions',
      modelId: 'fixture-model-2026-08-31',
      credentialEnv: 'GODAGENT_TEST_PHASE_KEY',
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
