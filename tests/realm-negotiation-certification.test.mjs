import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { verifyRealmNegotiation } from '../src/realm/negotiation.mjs';

const fixturePath = new URL('../fixtures/realm-negotiation-v1.json', import.meta.url);
const contractPath = new URL('../fixtures/realm-contract.json', import.meta.url);

test('realm negotiation fixture is canonical, source-bound, and replayable', async () => {
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  const contractText = await readFile(contractPath, 'utf8');
  const contract = JSON.parse(contractText);

  assert.equal(fixtureText, `${canonicalJson(fixture)}\n`);
  const { fixtureDigest, ...unsigned } = fixture;
  assert.equal(fixtureDigest, sha256Value(unsigned));
  assert.equal(fixture.sourceContract.path, 'fixtures/realm-contract.json');
  assert.equal(fixture.sourceContract.fileSha256, sha256Text(contractText));
  assert.equal(fixture.sourceContract.logicalDigest, sha256Value(contract));

  for (const record of Object.values(fixture.cases)) {
    assert.deepEqual(
      verifyRealmNegotiation(record.negotiation, {
        contract,
        authority: record.authority,
      }),
      record.negotiation,
    );
  }
  assert.deepEqual(fixture.assertions, {
    sourceContractCount: 1,
    writableAvailableHands: 1,
    readOnlyAvailableHands: 0,
    authorityExpansions: 0,
    executableFields: 0,
    providerCalls: 0,
  });
});
