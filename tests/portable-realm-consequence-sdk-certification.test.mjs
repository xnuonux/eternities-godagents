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

test('historical Realm fixture remains canonical and current behavior permits only the explicit SDK addition', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildDeterministicPortableRealmConsequenceSdkFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  // Preserve the historical fixture/receipt. The independent closed SDK surface
  // test gates current exports; this comparison permits only this additive API
  // and continues checking every Realm execution and safety field exactly.
  const currentExpected = structuredClone(committed);
  currentExpected.sdk.rootExports = [...committed.sdk.rootExports, 'createAdmittedEffectOnlyIdentityLauncher'].sort();
  const { fixtureDigest: previousDigest, ...currentUnsigned } = currentExpected;
  currentExpected.fixtureDigest = sha256Value(currentUnsigned);
  assert.deepEqual(currentExpected, fresh);
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
