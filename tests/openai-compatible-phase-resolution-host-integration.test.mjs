import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeterministicSignedPhaseResolutionHostFixture } from './helpers/openai-compatible-phase-resolution-host-fixture.mjs';

test('the admitted host adopts one signed ambiguous native response and finishes without native redispatch', async () => {
  const fixture = await buildDeterministicSignedPhaseResolutionHostFixture();
  assert.equal(fixture.assertions.ambiguousNativeObserved, true);
  assert.equal(fixture.assertions.signedResolutionAccepted, true);
  assert.equal(fixture.assertions.nativeResponseAdoptedWithoutRedispatch, true);
  assert.deepEqual(fixture.execution.phaseOrder, ['native', 'review', 'revision', 'review']);
  assert.equal(fixture.assertions.finalReviewAccepted, true);
  assert.equal(fixture.assertions.exactTerminalReplay, true);
  assert.equal(fixture.assertions.replayExternalCalls, 0);
  assert.equal(fixture.assertions.resolutionBodyAbsent, true);
  assert.equal(fixture.assertions.secretLeaks, 0);
  assert.equal(fixture.assertions.noRealmAuthorityExpansion, true);
});

test('the complete signed-resolution host fixture reproduces byte-for-byte', async () => {
  const first = await buildDeterministicSignedPhaseResolutionHostFixture();
  const second = await buildDeterministicSignedPhaseResolutionHostFixture();
  assert.deepEqual(second, first);
});
