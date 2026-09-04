import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicPortableRealmConsequenceSdkFixture } from './helpers/portable-realm-consequence-sdk-fixture.mjs';

const fixturePath = new URL('../fixtures/portable-realm-consequence-sdk-v1.json', import.meta.url);

async function certifier() {
  return import('../scripts/build-portable-realm-consequence-sdk-v1-receipt.mjs');
}

test('portable Realm consequence SDK fixture is canonical and deterministic', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildDeterministicPortableRealmConsequenceSdkFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
  assert.deepEqual(committed.assertions, {
    authorityExpansions: 0,
    defaultLaunchAdoption: 0,
    noSensitivePersistence: true,
    providerCalls: 0,
    realmMutations: 1,
    terminalReplayStable: true,
  });
});

test('portable Realm consequence SDK receipt reconstructs from its source commit', async () => {
  const module = await certifier();
  assert.equal(typeof module.verifyPortableRealmConsequenceSdkReceipt, 'function');
  assert.equal(typeof module.buildPortableRealmConsequenceSdkReceiptFromSource, 'function');
  const receipt = JSON.parse(await readFile(new URL('../receipts/portable-realm-consequence-sdk-v1.json', import.meta.url), 'utf8'));
  module.verifyPortableRealmConsequenceSdkReceipt(receipt);
  const rebuilt = await module.buildPortableRealmConsequenceSdkReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.deepEqual(rebuilt, receipt);
});
