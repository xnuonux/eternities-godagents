import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { IntegrityError } from '../core/errors.mjs';

export async function writeSnapshot({ snapshotPath, projection, journalHead }) {
  if (!journalHead.instanceId || journalHead.lastSequence < 1) {
    throw new IntegrityError('snapshot requires a non-empty verified journal');
  }
  if (projection.instanceId !== journalHead.instanceId) {
    throw new IntegrityError('snapshot projection instance does not match journal');
  }

  const unsigned = {
    schemaVersion: 1,
    instanceId: journalHead.instanceId,
    lastSequence: journalHead.lastSequence,
    journalHeadDigest: journalHead.lastDigest,
    projection,
  };
  const snapshot = { ...unsigned, snapshotDigest: sha256Value(unsigned) };
  await mkdir(dirname(snapshotPath), { recursive: true });
  const temporaryPath = `${snapshotPath}.writing`;
  await writeFile(temporaryPath, `${canonicalJson(snapshot)}\n`, 'utf8');
  await rename(temporaryPath, snapshotPath);
  return snapshot;
}
