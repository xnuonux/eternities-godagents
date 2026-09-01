import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeterministicProviderBackedMissionDependenciesFixture } from './helpers/provider-backed-mission-dependencies-certification-fixture.mjs';

test('both provider families complete and replay one real admitted identity mission through the bridge', async () => {
  const first = await buildDeterministicProviderBackedMissionDependenciesFixture();
  const second = await buildDeterministicProviderBackedMissionDependenciesFixture();
  assert.deepEqual(first, second);
  assert.equal(first.assertions.families, 2);
  assert.equal(first.assertions.providerCalls, 8);
  assert.equal(first.assertions.reviewedPhases, 8);
  assert.equal(first.assertions.replayProviderCalls, 0);
  assert.equal(first.assertions.replayRouteLaunches, 0);
  assert.equal(first.assertions.replayActivationLaunches, 0);
  assert.equal(first.assertions.credentialLeaks, 0);
  assert.equal(first.assertions.allFamiliesCompleted, true);
  assert.equal(first.assertions.allFamiliesAuthorityClosed, true);
});
