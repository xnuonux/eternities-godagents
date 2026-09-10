import { setTimeout as delay } from 'node:timers/promises';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { runArtifactProgram } from '../../examples/local-artifact-workflow/program.mjs';

// Owned fault harness only. The production CLI has no injected kill controls.
process.once('message', async ({ programManifestPath, programManifestDigest, boundary }) => {
  let dispatchedStep;
  try {
    if (boundary === 'diagnostic') throw new Error('controlled diagnostic synthetic-program-recovery-key');
    const result = await runArtifactProgram({ programManifestPath, expectedProgramManifestDigest: programManifestDigest,
      env: { GODAGENT_TEST_PHASE_KEY: 'synthetic-program-recovery-key' },
      createProviderPhaseHostImpl: options => createProviderPhaseHost({ ...options,
        checkpoint: async (name, phase) => {
          if (boundary === 'first-completion-persisted' && dispatchedStep === 'first'
              && name === 'after-openai-phase-completion-persisted') {
            process.send({ event: 'kill-boundary', boundary, phase, stepId: 'first' });
            await delay(120000); throw new Error('owned process was not interrupted');
          }
        },
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body), serialized = canonicalJson(body);
          dispatchedStep = serialized.includes('extend the verified prior token') ? 'second' : 'first';
          process.send({ event: 'provider-call', stepId: dispatchedStep, parentSeen: serialized.includes('ALPHA_7') });
          if (boundary === 'second-dispatch-uncertain' && dispatchedStep === 'second') {
            process.send({ event: 'kill-boundary', boundary, phase: 'native', stepId: 'second' });
            await delay(120000); throw new Error('owned process was not interrupted');
          }
          const content = dispatchedStep === 'first' ? 'ALPHA_7' : 'ALPHA_7_BETA_9';
          return new Response(canonicalJson({ id: 'controlled-program-recovery', object: 'chat.completion', model: body.model,
            choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content }) } }],
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
              completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } } }),
          { status: 200, headers: { 'content-type': 'application/json' } });
        },
      }),
    });
    process.send({ event: 'completed', result });
  } catch (error) {
    // This harness has a scrubbed environment, deny-all network witness, and
    // synthetic inputs. Retain bounded causes so a failed gate is diagnosable;
    // never emit the only synthetic credential or an unbounded stack/response.
    const causes = [], seen = new Set();
    for (let cause = error; cause && !seen.has(cause) && causes.length < 3; cause = cause.cause) {
      seen.add(cause);
      const clean = (value, limit) => typeof value === 'string'
        ? value.replaceAll('synthetic-program-recovery-key', '[redacted]').replace(/[\r\n\t]/g, ' ').slice(0, limit) : null;
      causes.push({ name: clean(cause.name, 40), code: clean(cause.code, 40), message: clean(cause.message, 240) });
    }
    process.send({ event: 'child-failed', code: typeof error.code === 'string' ? error.code : null, causes });
    process.exitCode = 1;
  } finally { process.disconnect(); }
});
