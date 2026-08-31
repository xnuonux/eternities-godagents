import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildProviderNeutralPhaseProtocolReceiptFromSource,
  verifyProviderNeutralPhaseProtocolReceipt,
} from '../scripts/build-provider-neutral-phase-protocol-v1-receipt.mjs';

async function fixtureApi() {
  return import('./helpers/provider-neutral-phase-protocol-certification-fixture.mjs');
}

test('cross-adapter certification fixture reproduces exact phase semantics', async () => {
  const { buildDeterministicProviderNeutralPhaseProtocolFixture } = await fixtureApi();
  const first = await buildDeterministicProviderNeutralPhaseProtocolFixture();
  const second = await buildDeterministicProviderNeutralPhaseProtocolFixture();

  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.protocolId, 'eternities-provider-neutral-phase-protocol-fixture-v1');
  assert.deepEqual(Object.keys(first.phases), ['native', 'review', 'revision']);
  for (const phase of Object.values(first.phases)) {
    assert.match(phase.dispatchDigest, /^[a-f0-9]{64}$/);
    assert.match(phase.descriptorDigest, /^[a-f0-9]{64}$/);
    assert.match(phase.openAIRequestDigest, /^[a-f0-9]{64}$/);
    assert.match(phase.anthropicRequestDigest, /^[a-f0-9]{64}$/);
    assert.notEqual(phase.openAIRequestDigest, phase.anthropicRequestDigest);
    assert.match(phase.artifactDigest, /^[a-f0-9]{64}$/);
    assert.equal(phase.completionParity, true);
  }
  assert.deepEqual(first.assertions, {
    phaseCount: 3,
    exactTypedArtifactParity: true,
    exactHostBindingParity: true,
    exactUsageParity: true,
    authorityExpansions: 0,
    credentialsInRequests: 0,
    anthropicSystemCacheBoundary: true,
    strictStructuredOutputs: true,
  });
  const unsigned = structuredClone(first);
  delete unsigned.fixtureDigest;
  assert.equal(first.fixtureDigest, sha256Value(unsigned));
});

test('provider-neutral protocol receipt reproduces from its exact source commit', async () => {
  const receipt = JSON.parse(await readFile(
    new URL('../receipts/provider-neutral-phase-protocol-v1.json', import.meta.url),
    'utf8',
  ));
  verifyProviderNeutralPhaseProtocolReceipt(receipt);
  const rebuilt = await buildProviderNeutralPhaseProtocolReceiptFromSource({
    repositoryRoot: new URL('../', import.meta.url),
    sourceCommit: receipt.source.commit,
    testRuns: receipt.testRuns,
  });
  assert.equal(canonicalJson(rebuilt), canonicalJson(receipt));
});
