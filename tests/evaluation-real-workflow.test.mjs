import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRecoveryFixture } from './helpers/local-workflow-recovery-fixture.mjs';
import { runLocalWorkflow } from '../examples/local-artifact-workflow/run.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { runGodagent } from '../scripts/evaluation/godagent.mjs';

test('diagnostic adapter observes real admitted host and aggregate receipt with synthetic transport', async t => {
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('network forbidden in offline qualification'); });
  const prepared = await prepareRecoveryFixture(t);
  const phases = [];
  let observed;
  const result = await runGodagent({ directory: await mkdtemp(join(tmpdir(), 'godagent-real-diagnostic-')),
    maximumCompletionTokens: 10000,
    runWorkflow: async () => {
      try { return await runLocalWorkflow({ manifestPath: prepared.manifestPath, expectedManifestDigest: prepared.manifestDigest,
      env: { GODAGENT_TEST_PHASE_KEY: 'synthetic-local-test-key' },
      createProviderPhaseHostImpl: options => createProviderPhaseHost({ ...options, fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        const phase = JSON.parse(body.messages[1].content).phase;
        phases.push(phase);
        const content = phase === 'review' ? { recommendation: 'accept', findings: [], summary: 'synthetic review' }
          : phase === 'revision' ? { content: 'two plus two is four.', addressedFindingIds: [] }
            : { content: 'two plus two is four.' };
        return new Response(JSON.stringify({ id: `offline-${phases.length}`, object: 'chat.completion', model: body.model,
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      } }),
      }); } catch (error) {
        t.diagnostic(`offline host error: ${String(error.code)} ${String(error.message).replaceAll('synthetic-local-test-key', '[redacted]')}`);
        throw error;
      }
    },
    inspectCompleted: async workflow => { observed = JSON.parse(await readFile(workflow.artifact.path, 'utf8')); },
  });
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.equal(observed.content, 'two plus two is four.');
  assert.equal(phases.filter(phase => phase === 'native').length, 1);
  assert.equal(result.usage.completionTokens, 20 * phases.length);
  assert.equal(result.usage.inputTokens, 100 * phases.length);
  assert.equal(network.mock.callCount(), 0);
});
