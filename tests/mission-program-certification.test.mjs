import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildMissionProgramFixture } from '../scripts/build-mission-program-fixture.mjs';

const fixturePath = new URL('../fixtures/mission-program-v1.json', import.meta.url);

test('mission program fixture is canonical, deterministic, and all bounded assertions pass', async () => {
  const committedText = await readFile(fixturePath, 'utf8');
  const committed = JSON.parse(committedText);
  const fresh = await buildMissionProgramFixture();
  assert.equal(committedText, `${canonicalJson(committed)}\n`);
  assert.deepEqual(committed, fresh);
  const { fixtureDigest, ...unsigned } = committed;
  assert.equal(fixtureDigest, sha256Value(unsigned));
  assert.deepEqual(committed.assertions, {
    orderedSteps: true,
    terminalReplayStable: true,
    terminalReplayNoAdapterCalls: true,
    pendingNeverExecutes: true,
    futureStepNeverCalled: true,
    recoveryNoRedispatch: true,
    recoveryCompleted: true,
    durableFilesBounded: true,
  });
  assert.equal(sha256Text(committedText), sha256Text(`${canonicalJson(fresh)}\n`));
});

test('mission program receipt reconstructs from its exact source commit', async () => {
  const module = await import('../scripts/build-mission-program-v1-receipt.mjs');
  assert.equal(typeof module.verifyMissionProgramReceipt, 'function');
  assert.equal(typeof module.buildMissionProgramReceiptFromSource, 'function');
  const receipt = JSON.parse(await readFile(new URL('../receipts/mission-program-v1.json', import.meta.url), 'utf8'));
  module.verifyMissionProgramReceipt(receipt);
  const rebuilt = await module.buildMissionProgramReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.deepEqual(rebuilt, receipt);
});
