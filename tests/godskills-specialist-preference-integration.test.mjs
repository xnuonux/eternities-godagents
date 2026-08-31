import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildDeterministicSpecialistPreferenceFixture,
  buildGodskillsSpecialistPreferenceIntegrationReceipt,
  preferenceBoundaryEvidence,
  rebuildGodskillsSpecialistPreferenceIntegrationReceipt,
} from '../scripts/build-godskills-specialist-preference-integration-receipt.mjs';

const historicalPaths = Object.freeze([
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);
const requirementIds = Object.freeze(Array.from({ length: 12 }, (_, index) =>
  `GSP-${String(index + 1).padStart(3, '0')}`));
const evidenceTests = Object.freeze([...new Set(Object.values(preferenceBoundaryEvidence).flat())].sort());

function passingRun(tests, names = []) {
  return {
    status: 'pass',
    tests,
    evidenceDigest: sha256Value(names),
    evidenceTests: [...names],
  };
}

function fixtureInput() {
  const paths = Array.from({ length: 13 }, (_, index) => `src/module-${index}.mjs`);
  paths[0] = 'scripts/intent-preference.mjs';
  paths.sort();
  return {
    source: {
      commit: 'a'.repeat(40),
      specification: { path: 'docs/spec.md', sha256: 'b'.repeat(64) },
      plan: { path: 'docs/plan.md', sha256: 'c'.repeat(64) },
      implementationManifest: { paths: ['src/a.mjs'], digest: 'd'.repeat(64) },
      testManifest: { paths: ['tests/a.test.mjs'], digest: 'e'.repeat(64) },
      historicalReceiptDigests: Object.fromEntries(historicalPaths.map((path, index) => [
        path, String(index + 10).padStart(64, '0'),
      ])),
    },
    godskills: {
      commit: 'f'.repeat(40),
      protocolId: 'eternities-godskills-specialist-preference-v1',
      authorityExpanded: false,
      releaseReceipt: {
        path: 'receipts/specialist-preference-routing-v1.json',
        fileSha256: '1'.repeat(64),
        receiptDigest: '2'.repeat(64),
      },
      entrypoint: { path: 'scripts/intent-preference.mjs', sha256: '3'.repeat(64) },
      dependencyClosure: { paths, digest: sha256Value(paths) },
      outputFixture: {
        path: 'artifacts/specialist-preference-routing-v1/fixture.json',
        fileSha256: '4'.repeat(64),
        logicalDigest: '5'.repeat(64),
      },
      computedGates: {
        authorityExpansions: 0,
        equalQualityTieBreakApplied: true,
        legacyShapePreserved: true,
        preferenceOnlyDependencyBlocked: true,
        rejectedPreferenceNotQualified: true,
        shortlistOverflowRejected: true,
        strongerNonpreferredPreserved: true,
        unknownPreferenceRejected: true,
        unresolvedDecisionPreserved: true,
      },
      proofLimits: ['no-specialist-quality-superiority-claim', 'no-eligibility-or-authority-change'],
    },
    fixture: {
      path: 'fixtures/godskills-specialist-preference-v1.json',
      sha256: '6'.repeat(64),
      logicalDigest: '7'.repeat(64),
      assertions: {
        specialistPreferencePresent: true,
        allRounderPreferencePresent: false,
        legacyShapePreserved: true,
        recoveryRouteCalls: 0,
        recoveryPackageReproduced: true,
      },
    },
    testRuns: {
      godskillsFocused: passingRun(19),
      godskillsFull: passingRun(762),
      godagentsFocused: passingRun(evidenceTests.length, evidenceTests),
      godagentsFull: passingRun(400),
    },
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [
        'rejects selected routes carrying terminal-only preference reasons',
        'rejects recomputed preference receipts with incomplete closures',
      ],
    },
    requirementEvidence: Object.fromEntries(requirementIds.map((id) => [
      id, [`tests/${id.toLowerCase()}.test.mjs`],
    ])),
  };
}

test('specialist preference integration certifies twelve closed requirements without a quality claim', () => {
  const receipt = buildGodskillsSpecialistPreferenceIntegrationReceipt(fixtureInput());
  assert.equal(receipt.status, 'certified');
  assert.deepEqual(receipt.requirements.map(({ id }) => id), requirementIds);
  assert.equal(receipt.godskills.dependencyClosure.paths.length, 13);
  assert.equal(receipt.metrics.authorityExpansions, 0);
  assert.equal(receipt.metrics.recoveryRouteCalls, 0);
  assert.equal(receipt.review.independent, false);
  assert.equal(receipt.proofLimits.includes('no-specialist-quality-superiority-claim'), true);
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
});

test('failed evidence, changed closure, authority expansion, or false independent review cannot certify', () => {
  const failed = fixtureInput();
  failed.testRuns.godagentsFull.status = 'fail';
  assert.equal(buildGodskillsSpecialistPreferenceIntegrationReceipt(failed).status, 'rejected');

  const closure = fixtureInput();
  closure.godskills.dependencyClosure.paths.pop();
  assert.throws(() => buildGodskillsSpecialistPreferenceIntegrationReceipt(closure), /closure/i);

  const authority = fixtureInput();
  authority.godskills.authorityExpanded = true;
  assert.equal(buildGodskillsSpecialistPreferenceIntegrationReceipt(authority).status, 'rejected');

  const review = fixtureInput();
  review.review.independent = true;
  assert.throws(() => buildGodskillsSpecialistPreferenceIntegrationReceipt(review), /independent review/i);

  const evidence = fixtureInput();
  evidence.testRuns.godagentsFocused.evidenceTests.pop();
  assert.throws(() => buildGodskillsSpecialistPreferenceIntegrationReceipt(evidence), /evidence/i);
});

test('deterministic cross-repository fixture isolates specialist, all-rounder, legacy, and recovery behavior', async () => {
  const options = {
    repositoryRoot: fileURLToPath(new URL('../', import.meta.url)),
    godskillsRoot: 'C:/dev/eternities-godskills',
  };
  const first = await buildDeterministicSpecialistPreferenceFixture(options);
  const second = await buildDeterministicSpecialistPreferenceFixture(options);
  assert.deepEqual(second, first);
  assert.equal(first.specialist.preference.protocolId,
    'eternities-godskills-specialist-preference-v1');
  assert.equal(first.allRounder.preference, null);
  assert.equal(first.legacy.preference, null);
  assert.equal(first.recovery.routeCalls, 0);
  assert.equal(first.recovery.packageReproduced, true);
});

const checkedReceiptUrl = new URL('../receipts/godskills-specialist-preference-v1.json', import.meta.url);
test('checked specialist preference receipt rebuilds byte-for-byte from exact source and release evidence', {
  skip: process.env.GODSKILLS_SPECIALIST_CERT_BUILD === '1' || !existsSync(checkedReceiptUrl)
    ? 'receipt is being generated or has not been added yet'
    : false,
}, async () => {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const text = await readFile(checkedReceiptUrl, 'utf8');
  const checked = JSON.parse(text);
  const rebuilt = await rebuildGodskillsSpecialistPreferenceIntegrationReceipt({
    repositoryRoot,
    godskillsRoot: 'C:/dev/eternities-godskills',
    sourceCommit: checked.source.commit,
    godskillsCommit: checked.godskills.commit,
    testRuns: checked.testRuns,
  });
  assert.equal(`${canonicalJson(rebuilt)}\n`, text);
});
