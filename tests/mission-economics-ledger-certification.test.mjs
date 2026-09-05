import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildDeterministicMissionEconomicsLedgerFixture,
  fixtureFileDigest,
} from './helpers/mission-economics-ledger-fixture.mjs';

const fixturePath = new URL('../fixtures/mission-economics-ledger-v1.json', import.meta.url);

async function certifier() {
  return import('../scripts/build-mission-economics-ledger-v1-receipt.mjs');
}

test('mission economics fixture is canonical, deterministic, and body-free at the ledger boundary', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = buildDeterministicMissionEconomicsLedgerFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
  assert.equal(canonicalJson(committed.ledger).includes('this body is source evidence'), false);
  assert.deepEqual(committed.assertions, {
    exactPhaseCount: true,
    completionUsageMatches: true,
    cacheIdentityPresent: true,
    ledgerBodyFree: true,
    proofLimitsHonest: true,
  });
  assert.equal(fixtureFileDigest(committed), sha256Text(`${canonicalJson(committed)}\n`));
});

test('mission economics receipt reconstructs from its exact source commit', async () => {
  const module = await certifier();
  assert.equal(typeof module.verifyMissionEconomicsLedgerReceipt, 'function');
  assert.equal(typeof module.buildMissionEconomicsLedgerReceiptFromSource, 'function');
  const receipt = JSON.parse(await readFile(new URL('../receipts/mission-economics-ledger-v1.json', import.meta.url), 'utf8'));
  module.verifyMissionEconomicsLedgerReceipt(receipt);
  const rebuilt = await module.buildMissionEconomicsLedgerReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.deepEqual(rebuilt, receipt);
});
