import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildDeterministicSealedLocalGodskillsTransportFixture,
  rebuildSealedLocalGodskillsTransportReceipt,
  verifySealedLocalGodskillsTransportCertificationReceipt,
} from '../scripts/build-sealed-local-godskills-transport-v1-receipt.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(repositoryRoot, 'fixtures', 'sealed-local-godskills-transport-v1.json');
const receiptPath = resolve(repositoryRoot, 'receipts', 'sealed-local-godskills-transport-v1.json');

test('sealed local Godskills fixture reproduces real route and activation crash recovery', async () => {
  const text = await readFile(fixturePath, 'utf8');
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(await buildDeterministicSealedLocalGodskillsTransportFixture(), checked);
  assert.equal(checked.assertions.processDeathObserved, true);
  assert.equal(checked.assertions.routeExecutedOnce, true);
  assert.equal(checked.assertions.activationExecutedOnce, true);
  assert.equal(checked.assertions.recoveredWithoutRelaunch, true);
  assert.equal(checked.assertions.exactBindingReplay, true);
  assert.equal(checked.assertions.exactRehydration, true);
  assert.equal(checked.assertions.ambientEnvironmentAbsent, true);
  assert.equal(checked.assertions.authorityExpansions, 0);
  assert.equal(checked.assertions.realmEffects, 0);
});

test('sealed local Godskills receipt reproduces from its exact source commit', async (context) => {
  let text;
  try {
    text = await readFile(receiptPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      context.skip('release receipt has not been issued yet');
      return;
    }
    throw error;
  }
  const checked = JSON.parse(text);
  assert.equal(text, `${canonicalJson(checked)}\n`);
  assert.deepEqual(verifySealedLocalGodskillsTransportCertificationReceipt(checked), checked);
  assert.deepEqual(await rebuildSealedLocalGodskillsTransportReceipt({
    repositoryRoot,
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  }), checked);

  const changed = structuredClone(checked);
  changed.metrics.activationLaunches = 2;
  assert.throws(
    () => verifySealedLocalGodskillsTransportCertificationReceipt(changed),
    /metrics|receipt/i,
  );
});
