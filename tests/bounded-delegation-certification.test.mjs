import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';

test('bounded delegation fixture is deterministic and proves only its declared local boundary', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/bounded-delegation-v1.json', import.meta.url), 'utf8'));
  const { fixtureDigest, ...unsigned } = fixture;

  assert.equal(sha256Value(unsigned), fixtureDigest);
  for (const assertion of Object.values(fixture.assertions)) {
    if (typeof assertion === 'boolean') assert.equal(assertion, true);
  }
  assert.deepEqual(fixture.success.eventTypes, [
    'delegation.admitted',
    'worker.prepared',
    'worker.committed',
    'worker.prepared',
    'worker.committed',
    'delegation.completed',
  ]);
  assert.equal(fixture.success.result.workerIds.join(','), 'worker-a,worker-b');
  assert.equal(fixture.pending.calls.execute, 0);
  assert.equal(fixture.recovery.recovered.status, 'completed');
  assert.equal(fixture.recovery.calls.execute, 1);
  assert.equal(fixture.recovery.calls.reconcile, 2);
});
