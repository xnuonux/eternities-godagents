import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { IntegrityError } from '../src/core/errors.mjs';
import { appendEvent, readVerifiedJournal } from '../src/state/journal.mjs';
import { restoreState } from '../src/state/restore.mjs';
import { writeSnapshot } from '../src/state/snapshot.mjs';

const baseEvent = (delta, sourceRef = `source-${delta}`) => ({
  schemaVersion: 1,
  instanceId: 'instance-1',
  stateEpoch: 0,
  eventType: 'counter.changed',
  sourceClass: 'fixture-realm',
  sourceRef,
  causationId: 'mission-1',
  correlationId: 'cycle-1',
  payload: { delta },
  recordedAt: `2026-08-28T00:00:0${delta}.000Z`,
});

const reduceCounter = (state, event) => ({
  ...state,
  counter: state.counter + (event.payload.delta ?? 0),
});

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    journalPath: join(root, 'events.jsonl'),
    snapshotPath: join(root, 'snapshot.json'),
  };
}

test('journal assigns monotonic sequences and a verifiable digest chain', async (t) => {
  const { journalPath } = await workspace(t);
  const first = await appendEvent({ journalPath, event: baseEvent(1) });
  const second = await appendEvent({ journalPath, event: baseEvent(2) });
  const verified = await readVerifiedJournal(journalPath);

  assert.equal(first.sequence, 1);
  assert.equal(first.previousDigest, '0'.repeat(64));
  assert.equal(second.sequence, 2);
  assert.equal(second.previousDigest, first.contentDigest);
  assert.equal(verified.lastSequence, 2);
  assert.equal(verified.lastDigest, second.contentDigest);
  assert.deepEqual(verified.events, [first, second]);
});

test('restore replays an intact journal to an exact state', async (t) => {
  const { journalPath, snapshotPath } = await workspace(t);
  await appendEvent({ journalPath, event: baseEvent(1) });
  await appendEvent({ journalPath, event: baseEvent(2) });

  const restored = await restoreState({
    journalPath,
    snapshotPath,
    reduce: reduceCounter,
    initialState: { instanceId: 'instance-1', counter: 0 },
  });

  assert.deepEqual(restored.state, { instanceId: 'instance-1', counter: 3 });
  assert.equal(restored.head.lastSequence, 2);
  assert.equal(restored.status, 'intact');
  assert.equal(restored.quarantinedTail, null);
});

test('restore verifies a snapshot and replays only its journal tail', async (t) => {
  const { journalPath, snapshotPath } = await workspace(t);
  await appendEvent({ journalPath, event: baseEvent(1) });
  const firstHead = await readVerifiedJournal(journalPath);
  await writeSnapshot({
    snapshotPath,
    projection: { instanceId: 'instance-1', counter: 1 },
    journalHead: firstHead,
  });
  await appendEvent({ journalPath, event: baseEvent(2) });

  const restored = await restoreState({
    journalPath,
    snapshotPath,
    reduce: reduceCounter,
    initialState: { instanceId: 'instance-1', counter: 0 },
  });

  assert.deepEqual(restored.state, { instanceId: 'instance-1', counter: 3 });
  assert.equal(restored.head.lastSequence, 2);
});

test('an incomplete final line is quarantined and blocks appends', async (t) => {
  const { journalPath } = await workspace(t);
  await appendEvent({ journalPath, event: baseEvent(1) });
  await appendFile(journalPath, '{"schemaVersion":1', 'utf8');

  const verified = await readVerifiedJournal(journalPath);
  assert.equal(verified.events.length, 1);
  assert.deepEqual(Object.keys(verified.quarantinedTail).sort(), ['bytes', 'sha256']);
  assert.ok(verified.quarantinedTail.bytes > 0);
  await assert.rejects(
    () => appendEvent({ journalPath, event: baseEvent(2) }),
    /unverified journal tail/,
  );
});

test('a digest mismatch inside the verified journal fails closed', async (t) => {
  const { journalPath } = await workspace(t);
  await appendEvent({ journalPath, event: baseEvent(1) });
  await appendEvent({ journalPath, event: baseEvent(2) });
  const lines = (await readFile(journalPath, 'utf8')).trimEnd().split('\n');
  const first = JSON.parse(lines[0]);
  first.payload.delta = 99;
  lines[0] = JSON.stringify(first);
  await writeFile(journalPath, `${lines.join('\n')}\n`, 'utf8');

  await assert.rejects(
    () => readVerifiedJournal(journalPath),
    (error) => error instanceof IntegrityError && /journal digest mismatch/.test(error.message),
  );
});

test('a modified snapshot fails before replay', async (t) => {
  const { journalPath, snapshotPath } = await workspace(t);
  await appendEvent({ journalPath, event: baseEvent(1) });
  const head = await readVerifiedJournal(journalPath);
  const snapshot = await writeSnapshot({
    snapshotPath,
    projection: { instanceId: 'instance-1', counter: 1 },
    journalHead: head,
  });
  snapshot.projection.counter = 40;
  await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`, 'utf8');

  await assert.rejects(
    () => restoreState({
      journalPath,
      snapshotPath,
      reduce: reduceCounter,
      initialState: { instanceId: 'instance-1', counter: 0 },
    }),
    (error) => error instanceof IntegrityError && /snapshot digest mismatch/.test(error.message),
  );
});
