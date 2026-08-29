import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const zeroDigest = '0'.repeat(64);

async function readJournalText(journalPath) {
  try {
    return await readFile(journalPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

export async function readVerifiedJournal(journalPath) {
  const text = await readJournalText(journalPath);
  if (text.length === 0) {
    return {
      events: [],
      instanceId: null,
      lastDigest: zeroDigest,
      lastSequence: 0,
      quarantinedTail: null,
    };
  }

  const terminated = text.endsWith('\n');
  const segments = text.split('\n');
  if (terminated) segments.pop();
  const tail = terminated ? null : segments.pop();
  const events = [];
  let previousDigest = zeroDigest;
  let instanceId = null;

  for (let index = 0; index < segments.length; index += 1) {
    let event;
    try {
      event = JSON.parse(segments[index]);
    } catch {
      throw new IntegrityError(`journal line ${index + 1} is not valid JSON`);
    }
    assertSchema('vessel-event', event);
    if (event.sequence !== index + 1) {
      throw new IntegrityError(`journal sequence mismatch at line ${index + 1}`);
    }
    if (event.previousDigest !== previousDigest) {
      throw new IntegrityError(`journal previous digest mismatch at line ${index + 1}`);
    }
    const { contentDigest, ...unsigned } = event;
    if (sha256Value(unsigned) !== contentDigest) {
      throw new IntegrityError(`journal digest mismatch at line ${index + 1}`);
    }
    if (instanceId === null) instanceId = event.instanceId;
    if (event.instanceId !== instanceId) {
      throw new IntegrityError(`journal instance mismatch at line ${index + 1}`);
    }
    events.push(event);
    previousDigest = contentDigest;
  }

  return {
    events,
    instanceId,
    lastDigest: previousDigest,
    lastSequence: events.length,
    quarantinedTail: tail === null ? null : {
      bytes: Buffer.byteLength(tail, 'utf8'),
      sha256: sha256Text(tail),
    },
  };
}

export async function appendEvent({ journalPath, event }) {
  await mkdir(dirname(journalPath), { recursive: true });
  const lockPath = `${journalPath}.lock`;
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new IntegrityError('journal is locked by another writer');
    }
    throw error;
  }

  try {
    const head = await readVerifiedJournal(journalPath);
    if (head.quarantinedTail) {
      throw new IntegrityError('cannot append after an unverified journal tail');
    }
    if (head.instanceId && head.instanceId !== event.instanceId) {
      throw new IntegrityError('cannot append a different instance to this journal');
    }
    const unsigned = {
      ...event,
      sequence: head.lastSequence + 1,
      previousDigest: head.lastDigest,
    };
    const stored = { ...unsigned, contentDigest: sha256Value(unsigned) };
    assertSchema('vessel-event', stored);

    const journal = await open(journalPath, 'a');
    try {
      await journal.write(`${canonicalJson(stored)}\n`, null, 'utf8');
      await journal.sync();
    } finally {
      await journal.close();
    }
    return stored;
  } finally {
    await lock?.close();
    await rm(lockPath, { force: true });
  }
}
