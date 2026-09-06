import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { verifyExternalHostQualificationDossier } from '../src/host/external-host-qualification.mjs';
import {
  assertCommit,
  gitText,
  headCommit,
  historicalAtCommit,
  manifestAtCommit,
  pathsAtCommit,
  requireCleanExcept,
  resolveSourceCommit,
  runTests,
} from './lib/certification-support.mjs';
import { runReleaseGates } from './lib/release-gates.mjs';

const certificationId = 'external-host-qualification-v1';
const protocolId = 'eternities-external-host-qualification-certification-v1';
const fixturePath = 'fixtures/external-host-qualification-v1.json';
const receiptPath = 'receipts/external-host-qualification-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-external-host-qualification-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-external-host-qualification-v1.md';
const certificationPath = 'docs/external-host-qualification-v1-certification.md';
const baselineReceipts = Object.freeze([
  {
    path: 'receipts/portable-phase-host-conformance-v1.json',
    receiptDigest: '4c82249de231aab58d35778e357ec03d8d830fe8421d58699fb95b2c55be0553',
  },
  {
    path: 'receipts/portable-phase-host-adversarial-v1.json',
    receiptDigest: '0c1923a3033668b56e8013a98f7adad0f73a5a8cc93496848ff1c9d6ad72a4cc',
  },
]);
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'schemas/external-host-qualification-dossier.schema.json',
  'scripts/build-external-host-qualification-v1-fixture.mjs',
  'scripts/build-external-host-qualification-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/host/external-host-qualification.mjs',
  'src/runtime/identity-bound-native-contracts.mjs',
  'src/runtime/mission-revision-transport-contracts.mjs',
  'src/sdk/index.mjs',
  'src/sdk/portable-phase-host.mjs',
  'src/skills/review-transport-contracts.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/external-host-qualification-certification.test.mjs',
  'tests/external-host-qualification.test.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/external-host-qualification-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/portable-phase-host-adversarial-fixture.mjs',
  'tests/portable-phase-host-adversarial.test.mjs',
  'tests/portable-phase-host-conformance.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/external-host-qualification.test.mjs',
  'tests/external-host-qualification-certification.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['EHQ-001', 'the exact portable host description and digest are reverified before dossier acceptance'],
  ['EHQ-002', 'the certified conformance and adversarial receipt digests are pinned exactly'],
  ['EHQ-003', 'contract-only evidence never claims a live provider or external host qualification'],
  ['EHQ-004', 'reserved live evidence has one provider family, source commit, run, security, and three phase digests'],
  ['EHQ-005', 'credential-shaped, authority-shaped, unknown, stale, and oversized input fails closed'],
  ['EHQ-006', 'construction is deterministic, immutable, body-free, and provider-free'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the contract-only dossier binds local portable-host evidence and contains no live-provider result',
  'live-evidence-bound is a digest-bearing handoff state and does not authenticate external truth or model quality',
  'the fixture makes no provider call and resolves no credential',
  'Codex, Claude Code, local-model, MCP, hosted durability, remote exactly-once effects, and default launch remain unqualified',
  'keel, memory, identity, evolution, Inspiration, Soul, Lunari, and the Luna phenomenological core remain outside this boundary',
]);
const expectedMetrics = Object.freeze({
  authorityExpansions: 0,
  credentialLeaks: 0,
  liveQualification: false,
  providerCalls: 0,
  reservedLiveEvidenceShape: true,
});
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function digest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) throw new Error(`${label} fields are invalid`);
}

function verifyFixture(value) {
  assertNoCredentialFields(value);
  verifyExternalHostQualificationDossier(value);
  return value;
}

function verifyManifest(manifest, paths, label) {
  exactKeys(manifest, ['digest', 'entries', 'paths'], `${label} manifest`);
  if (!same(manifest.paths, paths) || !Array.isArray(manifest.entries)
      || manifest.entries.length !== paths.length || manifest.digest !== sha256Value(manifest.entries)) {
    throw new Error(`${label} manifest is invalid`);
  }
  manifest.entries.forEach((entry, index) => {
    exactKeys(entry, ['bytes', 'path', 'sha256'], `${label} entry`);
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry is invalid`);
  });
}

export function verifyExternalHostQualificationReceipt(value) {
  exactKeys(value, [
    'certificationId', 'fixture', 'metrics', 'proofLimits', 'protocolId',
    'receiptDigest', 'requirements', 'review', 'schemaVersion', 'source',
    'status', 'testRuns',
  ], 'external host qualification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.protocolId !== protocolId || value.status !== 'certified') {
    throw new Error('external host qualification receipt identity is invalid');
  }
  exactKeys(value.metrics, Object.keys(expectedMetrics), 'external host qualification metrics');
  if (!same(value.metrics, expectedMetrics)) throw new Error('external host qualification metrics are invalid');
  if (!same(value.requirements, requirements) || !same(value.proofLimits, proofLimits)) {
    throw new Error('external host qualification evidence is invalid');
  }
  exactKeys(value.review, ['independent', 'mode', 'unresolvedCriticalDefects', 'unresolvedImportantDefects'], 'external host qualification review');
  if (!same(value.review, {
    mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0,
  })) throw new Error('external host qualification review is invalid');
  exactKeys(value.source, [
    'baselineReceipts', 'commit', 'historicalReceiptDigests', 'implementationManifest',
    'plan', 'specification', 'testManifest',
  ], 'external host qualification receipt source');
  if (!COMMIT.test(value.source.commit)) throw new Error('external host qualification source commit is invalid');
  for (const entry of value.source.baselineReceipts) {
    exactKeys(entry, ['path', 'receiptDigest'], 'external host qualification baseline receipt');
    if (!baselineReceipts.some((expected) => same(expected, entry))) throw new Error('external host qualification baseline receipt is invalid');
  }
  if (!same(value.source.baselineReceipts, baselineReceipts)) throw new Error('external host qualification baseline receipt order is invalid');
  if (!value.source.historicalReceiptDigests || typeof value.source.historicalReceiptDigests !== 'object') throw new Error('external host qualification history is invalid');
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('external host qualification historical path is invalid');
    digest(valueDigest, 'external host qualification historical receipt');
  }
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[field], ['path', 'sha256'], `external host qualification ${field}`);
    if (value.source[field].path !== path) throw new Error(`external host qualification ${field} path mismatch`);
    digest(value.source[field].sha256, `external host qualification ${field}`);
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'external host qualification implementation');
  verifyManifest(value.source.testManifest, testFiles, 'external host qualification test');
  exactKeys(value.fixture, ['fileSha256', 'logicalDigest', 'path', 'value'], 'external host qualification fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.dossierDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('external host qualification fixture binding is invalid');
  }
  if (!value.testRuns || !same(Object.keys(value.testRuns).sort(), ['focused', 'full'])) throw new Error('external host qualification test runs are invalid');
  for (const run of Object.values(value.testRuns)) {
    exactKeys(run, ['status', 'tests'], 'external host qualification test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) throw new Error('external host qualification test run is invalid');
  }
  digest(value.receiptDigest, 'external host qualification receipt');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('external host qualification receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts')).filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildExternalHostQualificationReceiptFromSource({ repositoryRoot, sourceCommit, testRuns } = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  if (!same(Object.keys(testRuns ?? {}).sort(), ['focused', 'full'])
      || Object.values(testRuns).some((run) => !run || run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1)) {
    throw new Error('external host qualification test runs are invalid');
  }
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('external host qualification fixture is not canonical');
  const implementationManifest = await manifestAtCommit(repository, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(repository, sourceCommit, testFiles);
  const history = await historicalReceiptPaths(repository, sourceCommit);
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      baselineReceipts: structuredClone(baselineReceipts),
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(repository, sourceCommit, history),
      implementationManifest,
      plan: { path: planPath, sha256: sha256Text(await gitText(repository, sourceCommit, planPath)) },
      specification: { path: specificationPath, sha256: sha256Text(await gitText(repository, sourceCommit, specificationPath)) },
      testManifest,
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.dossierDigest,
      value: fixture,
    },
    requirements: structuredClone(requirements),
    metrics: structuredClone(expectedMetrics),
    testRuns: structuredClone(testRuns),
    review: { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyExternalHostQualificationReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
}

async function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(repository, ...receiptPath.split('/'));
  await requireCleanExcept(repository, [...releaseOnlyPaths, 'package-lock.json']);
  const sourceCommit = await resolveSourceCommit({ root: repository, headCommit: await headCommit(repository), outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, repository);
  const preliminary = await buildExternalHostQualificationReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full: { status: 'pass', tests: focused.tests } } });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildExternalHostQualificationReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full } });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({ root: repository, certificationTestFile: 'tests/external-host-qualification-certification.test.mjs' });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  await writeFile(join(repository, ...certificationPath.split('/')), `# external host qualification dossier v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- dossier digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- live qualification: false\n- release receipt count: ${lineageEvidence.receiptCount}\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies a contract-only, provider-neutral qualification dossier. It binds the portable host description and certified local baselines, but it does not qualify Codex, Claude Code, local-model, MCP, a live provider, model quality, hosted durability, or remote exactly-once execution.\n`, 'utf8');
  process.stdout.write(`${canonicalJson({ status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest, fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
