import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeterministicRecoverableGodskillsAdmissionFixture,
} from './helpers/recoverable-godskills-admission-certification-fixture.mjs';

test('recoverable Godskills admission closes route, activation, and native process-death windows', async () => {
  const first = await buildDeterministicRecoverableGodskillsAdmissionFixture();
  const second = await buildDeterministicRecoverableGodskillsAdmissionFixture();

  assert.deepEqual(second, first);
  assert.equal(first.protocolId, 'eternities-recoverable-godskills-admission-fixture-v1');
  assert.equal(first.fixtureDigest, '6b7138695f908904670c272071af14fa9d9887d401b6aa4474c2b940c5fca9b1');

  assert.deepEqual(first.routeRecovery.routeCalls, {
    descriptors: 2,
    reconciliations: 2,
    executions: 1,
  });
  assert.deepEqual(first.routeRecovery.activationCalls, {
    descriptors: 2,
    reconciliations: 1,
    executions: 1,
  });
  assert.equal(first.routeRecovery.classifications, 1);

  assert.deepEqual(first.vesselRecovery.routeCalls, {
    descriptors: 3,
    reconciliations: 1,
    executions: 1,
  });
  assert.deepEqual(first.vesselRecovery.activationCalls, {
    descriptors: 3,
    reconciliations: 2,
    executions: 1,
  });
  assert.deepEqual(first.vesselRecovery.nativeCalls, {
    descriptors: 3,
    reconciliations: 2,
    executions: 1,
  });
  assert.deepEqual(first.vesselRecovery.reviewCalls, {
    descriptors: 2,
    reconciliations: 2,
    executions: 2,
  });
  assert.deepEqual(first.vesselRecovery.revisionCalls, {
    descriptors: 2,
    reconciliations: 1,
    executions: 1,
  });
  assert.equal(first.vesselRecovery.classifications, 2);

  assert.deepEqual(first.assertions, {
    routeProcessDeathObserved: true,
    routeRecoveredWithoutReexecution: true,
    activationProcessDeathObserved: true,
    activationRecoveredWithoutReexecution: true,
    nativeProcessDeathObserved: true,
    nativeRecoveredWithoutReexecution: true,
    exactIdentityDispatchReproduced: true,
    actualGodskillsReviewMode: true,
    deferredReviewBodyFreeBeforeInference: true,
    finalReviewAccepted: true,
    exactTerminalReplay: true,
    replayExternalCalls: 0,
    authorityExpansions: 0,
    realmEffects: 0,
  });
});
