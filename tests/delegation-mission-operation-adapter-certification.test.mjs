import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDelegationMissionOperationAdapterFixture } from '../scripts/build-delegation-mission-operation-adapter-v1-fixture.mjs';
import { verifyDelegationMissionOperationAdapterReceipt } from '../scripts/build-delegation-mission-operation-adapter-v1-receipt.mjs';

const fixturePath = new URL('../fixtures/delegation-mission-operation-adapter-v1.json', import.meta.url);
const receiptPath = new URL('../receipts/delegation-mission-operation-adapter-v1.json', import.meta.url);

test('delegation mission-operation adapter fixture is canonical and deterministic', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildDelegationMissionOperationAdapterFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  assert.deepEqual(committed.assertions, {
    authorityEmpty: true,
    bodyFreeSourceDescriptor: true,
    ceilingsBound: true,
    compactProjection: true,
    inputDigestBound: true,
    pendingPreserved: true,
    recoveryNoRedispatch: true,
    sourceBoundToDelegation: true,
    terminalReplayStable: true,
  });
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
});

test('delegation mission-operation adapter receipt is canonical and verified', async () => {
  const text = await readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(text);
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  assert.deepEqual(verifyDelegationMissionOperationAdapterReceipt(receipt), receipt);
});
