import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildMissionProgramForensicsFixture } from '../scripts/build-mission-program-forensics-fixture.mjs';

const fixturePath = new URL('../fixtures/mission-program-forensics-v1.json', import.meta.url);

test('mission-program forensic fixture is canonical, deterministic, and bounded', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildMissionProgramForensicsFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  assert.deepEqual(committed.assertions, {
    deterministicProjection: true,
    fullCompleted: true,
    prefixAdmissionExact: true,
    prefixPendingExact: true,
    prefixCommittedExact: true,
    noFutureDisclosure: true,
    noPayloadDisclosure: true,
    absentStable: true,
    invalidSequenceRejected: true,
    readOnly: true,
    noAdapterCalls: true,
  });
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
  assert.equal(sha256Text(committedText), sha256Text(`${canonicalJson(fresh)}\n`));
});
