import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildMissionOperationAdapterFixture } from '../scripts/build-mission-operation-adapter-v1-fixture.mjs';
import { verifyMissionOperationAdapterReceipt } from '../scripts/build-mission-operation-adapter-v1-receipt.mjs';

const fixturePath = new URL('../fixtures/mission-operation-adapter-v1.json', import.meta.url);
const receiptPath = new URL('../receipts/mission-operation-adapter-v1.json', import.meta.url);

test('mission-operation adapter fixture is canonical, deterministic, and bounded', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildMissionOperationAdapterFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  assert.deepEqual(committed.assertions, {
    adapterOwnedWritesAbsent: true,
    authorityExpansions: 0,
    descriptorRevalidated: true,
    missionProgramReceiptBound: true,
    payloadFreeRequests: true,
    reconcileBeforeExecute: true,
    sourceDriftCode: 'source-drift',
    sourceDriftRejected: true,
    sourceDriftSourceCalls: 0,
    terminalReplayStable: true,
  });
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
});

test('mission-operation adapter certification receipt is canonical and internally verified', async () => {
  const text = await readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(text);
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  assert.deepEqual(verifyMissionOperationAdapterReceipt(receipt), receipt);
});
