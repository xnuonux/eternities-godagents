import { readFile } from 'node:fs/promises';

import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { readVerifiedJournal } from './journal.mjs';

async function readSnapshot(snapshotPath) {
  try {
    return JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new IntegrityError('snapshot is not valid JSON');
    throw error;
  }
}

function verifySnapshot(snapshot, journal) {
  const { snapshotDigest, ...unsigned } = snapshot;
  if (sha256Value(unsigned) !== snapshotDigest) {
    throw new IntegrityError('snapshot digest mismatch');
  }
  if (snapshot.lastSequence < 1 || snapshot.lastSequence > journal.lastSequence) {
    throw new IntegrityError('snapshot journal sequence is unavailable');
  }
  const journalEvent = journal.events[snapshot.lastSequence - 1];
  if (journalEvent.contentDigest !== snapshot.journalHeadDigest) {
    throw new IntegrityError('snapshot journal head mismatch');
  }
  if (snapshot.instanceId !== journal.instanceId || snapshot.projection.instanceId !== journal.instanceId) {
    throw new IntegrityError('snapshot instance mismatch');
  }
}

export async function restoreState({
  journalPath,
  snapshotPath,
  reduce,
  initialState,
}) {
  const journal = await readVerifiedJournal(journalPath);
  const snapshot = await readSnapshot(snapshotPath);
  let state = initialState;
  let startIndex = 0;

  if (snapshot) {
    verifySnapshot(snapshot, journal);
    state = snapshot.projection;
    startIndex = snapshot.lastSequence;
  }

  for (const event of journal.events.slice(startIndex)) {
    state = reduce(state, event);
  }

  return {
    state,
    head: journal,
    status: journal.quarantinedTail ? 'quarantined-tail' : 'intact',
    quarantinedTail: journal.quarantinedTail,
  };
}
