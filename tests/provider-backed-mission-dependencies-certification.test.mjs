import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildProviderBackedMissionDependenciesReceiptFromSource,
  verifyProviderBackedMissionDependenciesReceipt,
} from '../scripts/build-provider-backed-mission-dependencies-v1-receipt.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicProviderBackedMissionDependenciesFixture } from './helpers/provider-backed-mission-dependencies-certification-fixture.mjs';

test('provider-backed mission dependency fixture reproduces exact cross-family admitted recovery evidence', async () => {
  const first = await buildDeterministicProviderBackedMissionDependenciesFixture();
  const second = await buildDeterministicProviderBackedMissionDependenciesFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-backed-mission-dependencies-fixture-v1');
  assert.deepEqual(first.assertions, {
    allFamiliesAuthorityClosed: true,
    allFamiliesCompleted: true,
    credentialLeaks: 0,
    families: 2,
    providerCalls: 8,
    replayActivationLaunches: 0,
    replayProviderCalls: 0,
    replayRouteLaunches: 0,
    reviewedPhases: 8,
  });
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('committed provider-backed mission dependency fixture equals fresh reconstruction', async () => {
  const committed = JSON.parse(await readFile(
    new URL('../fixtures/provider-backed-mission-dependencies-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(
    canonicalJson(await buildDeterministicProviderBackedMissionDependenciesFixture()),
    canonicalJson(committed),
  );
});

test('provider-backed mission dependency receipt reconstructs from its exact source', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-backed-mission-dependencies-v1.json', import.meta.url),
    'utf8',
  ));
  verifyProviderBackedMissionDependenciesReceipt(receipt);
  const rebuilt = await buildProviderBackedMissionDependenciesReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});

test('provider-backed receipt rejects false replay and authority claims after outer rehash', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-backed-mission-dependencies-v1.json', import.meta.url),
    'utf8',
  ));
  for (const mutate of [
    (value) => { value.metrics.replayProviderCalls = 1; },
    (value) => { value.metrics.allFamiliesAuthorityClosed = false; },
  ]) {
    const forged = structuredClone(receipt);
    mutate(forged);
    const { receiptDigest: _old, ...unsigned } = forged;
    forged.receiptDigest = sha256Value(unsigned);
    assert.throws(
      () => verifyProviderBackedMissionDependenciesReceipt(forged),
      /evidence|fixture/i,
    );
  }
});
