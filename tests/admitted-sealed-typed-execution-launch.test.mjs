import assert from 'node:assert/strict';
import test from 'node:test';

import {
  launchAdmittedSealedTypedExecutionMission,
} from '../src/host/admitted-sealed-typed-execution-launch.mjs';
import {
  admittedTypedExecutionHostFixture,
  liveTypedExecutors,
} from './helpers/admitted-sealed-typed-execution-host-fixture.mjs';

test('one pinned admitted identity completes the typed Muse-to-Forge graph', async (t) => {
  const fixture = await admittedTypedExecutionHostFixture(t, 'complete');
  const observed = [];
  const result = await launchAdmittedSealedTypedExecutionMission({
    ...fixture.common,
    request: fixture.request,
    executors: liveTypedExecutors(observed),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.receipt.missionId, fixture.request.missionRequest.mission.missionId);
  assert.equal(result.receipt.authorityExpanded, false);
  assert.deepEqual(observed.map(({ capabilityId }) => capabilityId), [
    'eternities-muse',
    'eternities-forge',
  ]);
});
