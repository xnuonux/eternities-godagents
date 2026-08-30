import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  buildGodskillsV3IntegrationReceipt,
  rebuildGodskillsV3IntegrationReceipt,
} from '../scripts/build-godskills-v3-integration-receipt.mjs';

const requirementIds = Object.freeze(Array.from({ length: 14 }, (_, index) =>
  `GSV3-${String(index + 1).padStart(3, '0')}`));

function fixtureInput() {
  return {
    source: {
      commit: 'a'.repeat(40),
      specificationDigest: 'b'.repeat(64),
      planDigest: 'c'.repeat(64),
      implementationManifestDigest: 'd'.repeat(64),
      testManifestDigest: 'e'.repeat(64),
    },
    release: {
      protocolId: 'eternities-godskills-adapter-v1',
      portableReleaseDigest: 'f'.repeat(64),
      systemReceipt: { path: 'receipts/godskills-system-certification-v3.json', sha256: '1'.repeat(64) },
      routerReceipt: { path: 'receipts/agent-native-router-v8.json', sha256: '2'.repeat(64) },
      compilerReceipt: { path: 'receipts/intent-compiler-v3.json', sha256: '3'.repeat(64) },
      portableReceipt: { path: 'receipts/portable-capability-manifest-v1.json', sha256: '4'.repeat(64) },
      portableManifest: { path: 'artifacts/portable-capabilities/manifest.v1.json', sha256: '5'.repeat(64), manifestDigest: '6'.repeat(64) },
      selectedFixture: { id: 'eternities-architect', entrypointSha256: '7'.repeat(64), contractSha256: '8'.repeat(64) },
      capabilityCounts: { total: 44, topLevel: 22, operational: 22 },
    },
    testRuns: {
      godskillsSource: { status: 'pass', tests: 9 },
      godagentsFocused: { status: 'pass', tests: 50 },
      godagentsFull: { status: 'pass', tests: 300 },
    },
    metrics: {
      authorityExpansions: 0,
      unselectedBodyLoads: 0,
      coldQuarryReads: 0,
      orderedBindingBeforeCortex: true,
      recoveryReusesPackageDigest: true,
      migrationBoundaryProved: true,
      unboundOperationPreserved: true,
    },
    requirementEvidence: Object.fromEntries(requirementIds.map((id) => [id, [`tests/${id.toLowerCase()}.test.mjs`]])),
  };
}

test('integration receipt certifies all fourteen requirements and explicit proof limits', () => {
  const receipt = buildGodskillsV3IntegrationReceipt(fixtureInput());
  assert.equal(receipt.status, 'certified');
  assert.deepEqual(receipt.requirements.map(({ id }) => id), requirementIds);
  assert.equal(receipt.metrics.authorityExpansions, 0);
  assert.equal(receipt.metrics.unselectedBodyLoads, 0);
  assert.equal(receipt.metrics.coldQuarryReads, 0);
  assert.equal(receipt.proofLimits.includes('model-quality-on-unseen-missions'), true);
  assert.equal(receipt.proofLimits.includes('soul-or-inspiration-activation'), true);
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
});

test('failed tests, missing requirements, or nonzero boundary violations cannot certify', () => {
  const failed = fixtureInput();
  failed.testRuns.godagentsFocused.status = 'fail';
  assert.equal(buildGodskillsV3IntegrationReceipt(failed).status, 'rejected');

  const expanded = fixtureInput();
  expanded.metrics.authorityExpansions = 1;
  assert.equal(buildGodskillsV3IntegrationReceipt(expanded).status, 'rejected');

  const missing = fixtureInput();
  delete missing.requirementEvidence['GSV3-014'];
  assert.throws(() => buildGodskillsV3IntegrationReceipt(missing), /GSV3-014/);
});

test('checked integration receipt rebuilds byte-for-byte from exact source and release evidence', {
  skip: process.env.GODSKILLS_CERT_BUILD === '1' ? 'receipt is being generated' : false,
}, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const text = await readFile(new URL('../receipts/godskills-v3-integration.json', import.meta.url), 'utf8');
  const checked = JSON.parse(text);
  const rebuilt = await rebuildGodskillsV3IntegrationReceipt({
    repositoryRoot: root,
    godskillsRoot: 'C:/dev/eternities-godskills',
    sourceCommit: checked.source.commit,
    testRuns: checked.testRuns,
  });
  assert.equal(`${canonicalJson(rebuilt)}\n`, text);
});
