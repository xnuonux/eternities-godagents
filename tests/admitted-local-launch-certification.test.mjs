import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import {
  buildAdmittedLocalLaunchFixture,
  verifyAdmittedLocalLaunchFixture,
} from '../scripts/build-admitted-local-launch-v1-fixture.mjs';

const fixturePath = new URL('../fixtures/admitted-local-launch-v1.json', import.meta.url);

test('admitted local launch fixture is canonical, reproducible, and credential-free', async () => {
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = verifyAdmittedLocalLaunchFixture(JSON.parse(fixtureText));
  assert.equal(fixtureText, `${canonicalJson(fixture)}\n`);
  assertNoCredentialFields(fixture);
  assert.deepEqual(fixture, await buildAdmittedLocalLaunchFixture());
});
