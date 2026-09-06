import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import {
  verifyMissionOperationEvidenceProjection,
} from '../src/runtime/mission-operation-evidence.mjs';

const fixturePath = new URL('../fixtures/mission-operation-evidence-v1.json', import.meta.url);

test('mission-operation evidence fixture is canonical, deterministic, and body-free', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(text);
  assert.equal(text, `${canonicalJson(fixture)}\n`);
  assertSchema('mission-operation-evidence', fixture.projection);
  assertSchema('mission-operation-evidence', fixture.prefixProjection);
  verifyMissionOperationEvidenceProjection(fixture.projection);
  verifyMissionOperationEvidenceProjection(fixture.prefixProjection);
  assert.deepEqual(fixture.assertions, {
    authorityEmpty: true,
    bodyFreeProjection: true,
    deterministicProjection: true,
    exactJoin: true,
    noAdapterCalls: true,
    prefixPendingExact: true,
    sortedByStep: true,
  });
  const { fixtureDigest, ...unsigned } = fixture;
  assert.equal(fixtureDigest, sha256Value(unsigned));
  assert.equal(JSON.stringify(fixture.projection).includes('fixture-review-result'), false);
  assert.equal(JSON.stringify(fixture.projection).includes('fixture-delegation-result'), false);
});

