import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildRealmConsequenceMissionOperationAdapterFixture } from '../scripts/build-realm-consequence-mission-operation-adapter-v1-fixture.mjs';
import { verifyRealmConsequenceMissionOperationAdapterReceipt } from '../scripts/build-realm-consequence-mission-operation-adapter-v1-receipt.mjs';

const fixturePath = new URL('../fixtures/realm-consequence-mission-operation-adapter-v1.json', import.meta.url);
const receiptPath = new URL('../receipts/realm-consequence-mission-operation-adapter-v1.json', import.meta.url);

test('Realm consequence mission-operation adapter fixture is canonical and deterministic', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildRealmConsequenceMissionOperationAdapterFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  assert.deepEqual(committed.assertions, {
    authorityEmpty: true,
    bodyFreeSourceDescriptor: true,
    compactProjection: true,
    contractDriftBeforeRealm: true,
    recoveryNoDuplicateRealmEffect: true,
    sourceBoundToInput: true,
    terminalReplayStable: true,
    zeroUsage: true,
  });
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
});

test('Realm consequence mission-operation adapter receipt is canonical and verified', async () => {
  const text = await readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(text);
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  assert.deepEqual(verifyRealmConsequenceMissionOperationAdapterReceipt(receipt), receipt);
});
