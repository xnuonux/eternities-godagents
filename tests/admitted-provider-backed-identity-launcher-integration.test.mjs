import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';

async function loadBuilder() {
  try {
    return await import('./helpers/admitted-provider-backed-identity-launcher-certification-fixture.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

test('admitted provider-backed launcher fixture reproduces two complete provider families exactly', async () => {
  const subject = await loadBuilder();
  assert.equal(
    typeof subject.buildDeterministicAdmittedProviderBackedIdentityLauncherFixture,
    'function',
  );
  const actual = await subject.buildDeterministicAdmittedProviderBackedIdentityLauncherFixture();
  const expected = JSON.parse(await readFile(
    new URL('../fixtures/admitted-provider-backed-identity-launcher-v1.json', import.meta.url),
    'utf8',
  ));

  assert.equal(canonicalJson(actual), canonicalJson(expected));
  assert.equal(actual.assertions.families, 2);
  assert.equal(actual.assertions.providerCalls, 8);
  assert.equal(actual.assertions.reviewedPhases, 8);
  assert.equal(actual.assertions.replayProviderCalls, 0);
  assert.equal(actual.assertions.replayRouteLaunches, 0);
  assert.equal(actual.assertions.replayActivationLaunches, 0);
  assert.equal(actual.assertions.credentialLeaks, 0);
  assert.equal(actual.assertions.allFamiliesCompleted, true);
  assert.equal(actual.assertions.allFamiliesAuthorityClosed, true);
  assert.equal(actual.assertions.allLaunchersReconstructed, true);
});
