import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { verifyMissionForensicIndex } from '../src/runtime/mission-forensic-index.mjs';

const fixturePath = new URL('../fixtures/mission-forensic-index-v1.json', import.meta.url);

test('mission forensic index fixture is canonical, deterministic, and body-free', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(text);
  assert.equal(text, `${canonicalJson(fixture)}\n`);
  assertNoCredentialFields(fixture);
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.protocolId, 'eternities-mission-forensic-index-fixture-v1');
  assertSchema('mission-forensic-index', fixture.index);
  verifyMissionForensicIndex(fixture.index);
  assert.equal(fixture.fixtureDigest, sha256Value(Object.fromEntries(
    Object.entries(fixture).filter(([key]) => key !== 'fixtureDigest'),
  )));
  assert.equal(fixture.index.programCount, 2);
  assert.equal(Object.values(fixture.assertions).every((value) => value === true), true);
  assert.equal(JSON.stringify(fixture.index).includes('fixture-alpha-review-result'), false);
  assert.equal(JSON.stringify(fixture.index).includes('eternities-mission-operation-receipt-v1'), false);
});
