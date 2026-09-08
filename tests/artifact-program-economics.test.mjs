import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactProgram, runArtifactProgram } from '../examples/local-artifact-workflow/program.mjs';
import { prepareArtifactRealmFixture } from './helpers/local-artifact-realm-fixture.mjs';
import { artifactProgramDefinition, controlledArtifactProgramProvider } from './helpers/artifact-program-fixture.mjs';

test('eight dependent steps verify shared ancestors without exponential host reconstruction', { timeout: 180000 }, async t => {
  const f = await prepareArtifactRealmFixture(t);
  const definition = artifactProgramDefinition();
  const template = definition.steps[0];
  definition.budget = { maxCompletionTokens: 400, maxResultBytes: 4104 };
  definition.steps = Array.from({ length: 8 }, (_, index) => ({ ...template, stepId: `step-${index}`,
    maxCompletionTokens: 50, predecessors: Array.from({ length: index }, (_, parent) => ({ stepId: `step-${parent}`, projection: 'content' })) }));
  const p = await prepareArtifactProgram({ manifestPath: f.manifestPath, expectedManifestDigest: f.manifestDigest, definition });
  const calls = [], provider = controlledArtifactProgramProvider(calls);
  let constructions = 0;
  const result = await runArtifactProgram({ programManifestPath: p.programManifestPath, expectedProgramManifestDigest: p.programManifestDigest,
    env: { GODAGENT_TEST_PHASE_KEY: 'controlled-program-secret' }, createProviderPhaseHostImpl: input => {
      // Bound a regression run before hundreds of redundant authenticated scans.
      // Eight steps need at most quadratic fresh rounds, not one traversal per path.
      if (++constructions > 128) throw new Error('controlled host reconstruction fanout exceeded 128');
      return provider(input);
    } });
  assert.equal(result.status, 'completed'); assert.equal(calls.length, 8);
  assert.equal(result.results.length, 8); assert.equal(result.usage.completionTokens, 160);
  assert.ok(constructions <= 128);
  t.diagnostic(`eight native calls; ${constructions} authenticated host constructions across fresh verification rounds`);
});
