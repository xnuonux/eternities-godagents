import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeterministicOpenAICompatibleAdmittedHostFixture } from './helpers/openai-compatible-admitted-host-fixture.mjs';

test('admitted sealed identity completes one exact reviewed mission through the concrete model transport', async () => {
  const fixture = await buildDeterministicOpenAICompatibleAdmittedHostFixture();
  assert.equal(fixture.protocolId, 'eternities-openai-compatible-admitted-host-fixture-v1');
  assert.deepEqual(fixture.execution.phaseOrder, ['native', 'review', 'revision', 'review']);
  assert.equal(fixture.recovery.providerCalls, 4);
  assert.equal(fixture.assertions.fourDurablePhaseCompletions, true);
  assert.equal(fixture.assertions.finalReviewAccepted, true);
  assert.equal(fixture.assertions.exactTerminalReplay, true);
  assert.equal(fixture.assertions.secretLeaks, 0);
  assert.match(fixture.fixtureDigest, /^[a-f0-9]{64}$/);
});

test('the complete concrete provider fixture reproduces byte-for-byte', async () => {
  const first = await buildDeterministicOpenAICompatibleAdmittedHostFixture();
  const second = await buildDeterministicOpenAICompatibleAdmittedHostFixture();
  assert.deepEqual(second, first);
});
