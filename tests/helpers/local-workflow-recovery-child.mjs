import { setTimeout as delay } from 'node:timers/promises';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { runLocalWorkflow } from '../../examples/local-artifact-workflow/run.mjs';

// Only loaded by the owned test child. No production checkpoint or CLI flag is added.
process.once('message', async ({ manifestPath, manifestDigest, boundary }) => {
  try {
    await runLocalWorkflow({ manifestPath, expectedManifestDigest: manifestDigest,
      env: { GODAGENT_TEST_PHASE_KEY: 'synthetic-process-recovery-key' },
      createProviderPhaseHostImpl: (options) => createProviderPhaseHost({ ...options,
        checkpoint: async (name, phase) => {
          if (boundary === 'completion-persisted' && name === 'after-openai-phase-completion-persisted') {
            process.send({ event: 'kill-boundary', boundary, phase });
            await delay(120_000);
            throw new Error('parent did not interrupt the owned fixture');
          }
        },
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body);
          const input = JSON.parse(body.messages[1].content);
          process.send({ event: 'provider-call', phase: input.phase });
          if (boundary === 'dispatch-uncertain') {
            process.send({ event: 'kill-boundary', boundary, phase: input.phase });
            await delay(120_000);
            throw new Error('parent did not interrupt the owned fixture');
          }
          return new Response(canonicalJson({ id: 'controlled-recovery', object: 'chat.completion', model: body.model,
            choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant',
              content: canonicalJson({ content: 'two plus two is four.' }) } }],
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
              completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        },
      }),
    });
    process.send({ event: 'unexpected-completion' });
  } catch {
    process.send({ event: 'child-failed' });
    process.exitCode = 1;
    process.disconnect();
  }
});
