import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';

async function loadBuilder() {
  try {
    return await import('./helpers/admitted-portable-identity-launcher-certification-fixture.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

test('admitted portable launcher fixture reproduces two complete transport families exactly', async () => {
  const subject = await loadBuilder();
  assert.equal(
    typeof subject.buildDeterministicAdmittedPortableIdentityLauncherFixture,
    'function',
  );
  const actual = await subject.buildDeterministicAdmittedPortableIdentityLauncherFixture();
  const expected = JSON.parse(await readFile(
    new URL('../fixtures/admitted-portable-identity-launcher-v1.json', import.meta.url),
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
  assert.equal(actual.assertions.allPortableHostDescriptionsBound, true);
});
