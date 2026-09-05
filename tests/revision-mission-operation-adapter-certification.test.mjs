import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildRevisionMissionOperationAdapterFixture } from '../scripts/build-revision-mission-operation-adapter-v1-fixture.mjs';
import { verifyRevisionMissionOperationAdapterReceipt } from '../scripts/build-revision-mission-operation-adapter-v1-receipt.mjs';

const fixturePath = new URL('../fixtures/revision-mission-operation-adapter-v1.json', import.meta.url);
const receiptPath = new URL('../receipts/revision-mission-operation-adapter-v1.json', import.meta.url);

test('revision mission-operation adapter fixture is canonical and deterministic', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildRevisionMissionOperationAdapterFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  assert.deepEqual(committed.assertions, {
    authorityCeilingBound: true,
    contextDigestBound: true,
    noBodiesInSourceDescriptor: true,
    phaseContextBindingExact: true,
    phaseResultProjectionExact: true,
    programStepBound: true,
    sourceBoundToPhase: true,
    terminalReplayStable: true,
  });
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
});

test('revision mission-operation adapter receipt is canonical and verified', async () => {
  const text = await readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(text);
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  assert.deepEqual(verifyRevisionMissionOperationAdapterReceipt(receipt), receipt);
});
