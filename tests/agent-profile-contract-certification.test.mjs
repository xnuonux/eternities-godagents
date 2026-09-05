import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildAgentProfileContractFixture } from '../scripts/build-agent-profile-contract-v1-fixture.mjs';
import { verifyAgentProfileContractReceipt } from '../scripts/build-agent-profile-contract-v1-receipt.mjs';

const fixturePath = new URL('../fixtures/agent-profile-contract-v1.json', import.meta.url);
const receiptPath = new URL('../receipts/agent-profile-contract-v1.json', import.meta.url);

test('agent profile contract fixture is canonical, deterministic, and bounded', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = buildAgentProfileContractFixture();

  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  assert.deepEqual(committed.assertions, {
    allRounderComplete: true,
    staleAllRounderPreferenceInert: true,
    specialistPreferenceNonRestrictive: true,
    explicitProhibitionAuthoritative: true,
    emptyCatalogCompatible: true,
    localeIndependentOrdering: true,
    compositionCeilingPreserved: true,
  });
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
  assert.equal(sha256Text(committedText), sha256Text(`${canonicalJson(fresh)}\n`));
});

test('agent profile contract receipt is canonical and internally verified', async () => {
  const receiptText = await readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(receiptText);

  assert.equal(receiptText, `${canonicalJson(receipt)}\n`);
  assert.deepEqual(verifyAgentProfileContractReceipt(receipt), receipt);
  assert.equal(receipt.status, 'certified');
  assert.equal(receipt.review.independent, false);
  assert.equal(receipt.fixture.logicalDigest, receipt.fixture.value.fixtureDigest);
  assert.equal(receipt.fixture.fileSha256, sha256Text(`${canonicalJson(receipt.fixture.value)}\n`));
  const { receiptDigest, ...unsigned } = receipt;
  assert.equal(receiptDigest, sha256Value(unsigned));
});
