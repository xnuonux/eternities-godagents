import assert from 'node:assert/strict';
import test from 'node:test';

import { recoverJournal } from '../src/journal-recovery.mjs';

test('recovers the latest admitted mission rather than stale completed history', () => {
  const result = recoverJournal([
    { type: 'mission.admitted', requestId: 'old' },
    { type: 'mission.completed', requestId: 'old' },
    { type: 'mission.admitted', requestId: 'current' },
    { type: 'godskills.bound', requestId: 'current', packageDigest: 'current-package' },
  ]);
  assert.deepEqual(result, { status: 'resume-binding', shouldInvoke: false, requestId: 'current', packageDigest: 'current-package' });
});

test('unknown completion after invocation pauses without automatic replay', () => {
  const result = recoverJournal([
    { type: 'mission.admitted', requestId: 'current' },
    { type: 'godskills.bound', requestId: 'current', packageDigest: 'package-a' },
    { type: 'host.invocation.started', requestId: 'current', invocationId: 'invoke-a' },
  ]);
  assert.deepEqual(result, { status: 'paused-unknown', shouldInvoke: false, requestId: 'current', invocationId: 'invoke-a', packageDigest: 'package-a' });
});

test('uses only the active mission package when histories are interleaved', () => {
  const result = recoverJournal([
    { type: 'mission.admitted', requestId: 'old' },
    { type: 'godskills.bound', requestId: 'old', packageDigest: 'old-package' },
    { type: 'mission.admitted', requestId: 'current' },
    { type: 'godskills.bound', requestId: 'current', packageDigest: 'current-package' },
    { type: 'godskills.bound', requestId: 'unrelated', packageDigest: 'wrong-package' },
  ]);
  assert.equal(result.packageDigest, 'current-package');
  assert.equal(result.requestId, 'current');
});

test('preserves exact terminal state for the active mission', () => {
  assert.deepEqual(recoverJournal([
    { type: 'mission.admitted', requestId: 'current' },
    { type: 'mission.failed', requestId: 'current' },
  ]), { status: 'failed', shouldInvoke: false, requestId: 'current' });
});
