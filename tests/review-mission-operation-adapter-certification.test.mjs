import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildReviewMissionOperationAdapterFixture } from '../scripts/build-review-mission-operation-adapter-v1-fixture.mjs';
import { verifyReviewMissionOperationAdapterReceipt } from '../scripts/build-review-mission-operation-adapter-v1-receipt.mjs';

const fixturePath = new URL('../fixtures/review-mission-operation-adapter-v1.json', import.meta.url);
const receiptPath = new URL('../receipts/review-mission-operation-adapter-v1.json', import.meta.url);

test('review mission-operation adapter fixture is canonical and deterministic', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildReviewMissionOperationAdapterFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  assert.deepEqual(committed.assertions, {
    authorityCeilingBound: true,
    ceilingsBound: true,
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

test('review mission-operation adapter receipt is canonical and verified', async () => {
  const text = await readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(text);
  assert.equal(text, `${canonicalJson(receipt)}\n`);
  assert.deepEqual(verifyReviewMissionOperationAdapterReceipt(receipt), receipt);
});
