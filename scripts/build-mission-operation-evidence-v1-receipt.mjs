import { writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { verifyMissionOperationEvidenceProjection } from '../src/runtime/mission-operation-evidence.mjs';
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

const certificationId = 'mission-operation-evidence-v1';
const protocolId = 'eternities-mission-operation-evidence-certification-v1';
const fixturePath = 'fixtures/mission-operation-evidence-v1.json';
const receiptPath = 'receipts/mission-operation-evidence-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-mission-operation-evidence-projection-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-mission-operation-evidence-projection-v1.md';
const certificationPath = 'docs/mission-operation-evidence-v1-certification.md';
const parentReceiptPath = 'receipts/mission-program-forensics-v1.json';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'schemas/mission-operation-evidence.schema.json',
  'scripts/build-mission-operation-evidence-v1-fixture.mjs',
  'scripts/build-mission-operation-evidence-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/mission-operation-adapter.mjs',
  'src/runtime/mission-operation-evidence.mjs',
  'src/runtime/mission-program.mjs',
  'src/sdk/index.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/mission-operation-adapter.test.mjs',
  'tests/mission-operation-evidence-certification.test.mjs',
  'tests/mission-operation-evidence.test.mjs',
  'tests/mission-program-forensics.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/mission-operation-evidence.test.mjs',
  'tests/mission-operation-evidence-certification.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const expectedAssertions = Object.freeze({
  authorityEmpty: true,
  bodyFreeProjection: true,
  deterministicProjection: true,
  exactJoin: true,
  noAdapterCalls: true,
  prefixPendingExact: true,
  sortedByStep: true,
});
const requirements = Object.freeze([
  ['MOE-001', 'one verified mission-program forensic projection is the only journal source'],
  ['MOE-002', 'every supplied operation description, dispatch, request, and receipt is revalidated'],
  ['MOE-003', 'each operation joins one exact program step and selected journal prefix'],
  ['MOE-004', 'the projection contains only bounded digests, statuses, and empty authority'],
  ['MOE-005', 'earlier prefixes cannot disclose a later prepared or committed operation'],
  ['MOE-006', 'credential-shaped input, drift, duplicate, unknown, and authority-bearing evidence fail closed'],
  ['MOE-007', 'repeated reads are canonical, deterministic, and bounded'],
  ['MOE-008', 'the boundary performs no adapter, provider, Realm, credential, or filesystem work'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the projection is a read-only provider-neutral join over one deterministic local mission and generic operation evidence entries',
  'the fixture proves binding, prefix disclosure, credential screening, authority preservation, and adapter-free projection mechanics only',
  'the projection does not certify any source adapter, provider, model, remote exactly-once effect, or live receipt truth',
  'cross-program indexing, branch replay, time travel, hosted durability, scheduler behavior, keel, memory, identity, evolution, Inspiration, Soul, and Lunari remain outside this boundary',
]);
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
  exactKeys(value, [
    'assertions', 'entries', 'fixtureDigest', 'missionForensics', 'prefixForensics',
    'prefixProjection', 'projection', 'protocolId', 'schemaVersion',
  ], 'mission-operation evidence fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-operation-evidence-fixture-v1') {
    throw new Error('mission-operation evidence fixture identity is invalid');
  }
  assertSchema('mission-program-forensics', value.missionForensics);
  assertSchema('mission-program-forensics', value.prefixForensics);
  verifyMissionOperationEvidenceProjection(value.projection);
  verifyMissionOperationEvidenceProjection(value.prefixProjection);
  if (!Array.isArray(value.entries) || value.entries.length !== 2) throw new Error('mission-operation evidence entries are invalid');
  if (!same(value.assertions, expectedAssertions) || Object.values(value.assertions).some((entry) => entry !== true)) {
    throw new Error('mission-operation evidence fixture assertions are invalid');
  }
  digest(value.fixtureDigest, 'mission-operation evidence fixture digest');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('mission-operation evidence fixture digest mismatch');
  return value;
}

export function verifyMissionOperationEvidenceReceipt(value) {
  exactKeys(value, [
    'certificationId', 'fixture', 'metrics', 'proofLimits', 'protocolId',
    'receiptDigest', 'requirements', 'review', 'schemaVersion', 'source',
    'status', 'testRuns',
  ], 'mission-operation evidence receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.protocolId !== protocolId || value.status !== 'certified') throw new Error('mission-operation evidence receipt identity is invalid');
  exactKeys(value.source, ['commit', 'historicalReceiptDigests', 'implementationManifest', 'parentReceipt', 'plan', 'specification', 'testManifest'], 'mission-operation evidence receipt source');
  if (!COMMIT.test(value.source.commit) || !value.source.historicalReceiptDigests || typeof value.source.historicalReceiptDigests !== 'object' || Array.isArray(value.source.historicalReceiptDigests)) throw new Error('mission-operation evidence receipt history is invalid');
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('mission-operation evidence historical receipt path is invalid');
    digest(valueDigest, 'mission-operation evidence historical receipt');
  }
  exactKeys(value.source.parentReceipt, ['certificationId', 'path', 'receiptDigest'], 'mission-operation evidence parent receipt');
  if (value.source.parentReceipt.certificationId !== 'mission-program-forensics-v1' || value.source.parentReceipt.path !== parentReceiptPath) throw new Error('mission-operation evidence parent receipt identity is invalid');
  digest(value.source.parentReceipt.receiptDigest, 'mission-operation evidence parent receipt digest');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[field], ['path', 'sha256'], `mission-operation evidence ${field}`);
    if (value.source[field].path !== path) throw new Error(`mission-operation evidence ${field} path mismatch`);
    digest(value.source[field].sha256, `mission-operation evidence ${field} digest`);
  }
  for (const [field, paths] of [['implementationManifest', implementationFiles], ['testManifest', testFiles]]) {
    const manifest = value.source[field];
    exactKeys(manifest, ['digest', 'entries', 'paths'], `mission-operation evidence ${field}`);
    if (!same(manifest.paths, paths) || !Array.isArray(manifest.entries) || manifest.entries.length !== paths.length || manifest.digest !== sha256Value(manifest.entries)) throw new Error(`mission-operation evidence ${field} is invalid`);
    manifest.entries.forEach((entry, index) => {
      exactKeys(entry, ['bytes', 'path', 'sha256'], `mission-operation evidence ${field} entry`);
      if (entry.path !== paths[index] || !DIGEST.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) throw new Error(`mission-operation evidence ${field} entry is invalid`);
    });
  }
  exactKeys(value.fixture, ['fileSha256', 'logicalDigest', 'path', 'value'], 'mission-operation evidence receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) throw new Error('mission-operation evidence fixture binding is invalid');
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)
      || !same(value.proofLimits, proofLimits)
      || !same(value.review, { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 })) throw new Error('mission-operation evidence receipt evidence is invalid');
  if (!value.testRuns || !same(Object.keys(value.testRuns).sort(), ['focused', 'full'])) throw new Error('mission-operation evidence test runs are invalid');
  for (const run of Object.values(value.testRuns)) {
    exactKeys(run, ['status', 'tests'], 'mission-operation evidence test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) throw new Error('mission-operation evidence test run is invalid');
  }
  digest(value.receiptDigest, 'mission-operation evidence receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('mission-operation evidence receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts')).filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildMissionOperationEvidenceReceiptFromSource({ repositoryRoot, sourceCommit, testRuns } = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  if (!same(Object.keys(testRuns ?? {}).sort(), ['focused', 'full'])
      || Object.values(testRuns).some((run) => !run || run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1)) {
    throw new Error('mission-operation evidence test runs are invalid');
  }
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('mission-operation evidence fixture is not canonical');
  const implementationManifest = await manifestAtCommit(repository, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(repository, sourceCommit, testFiles);
  const history = await historicalReceiptPaths(repository, sourceCommit);
  const parent = JSON.parse(await gitText(repository, sourceCommit, parentReceiptPath));
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(repository, sourceCommit, history),
      implementationManifest,
      testManifest,
      parentReceipt: { certificationId: 'mission-program-forensics-v1', path: parentReceiptPath, receiptDigest: parent.receiptDigest },
      specification: { path: specificationPath, sha256: sha256Text(await gitText(repository, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(repository, sourceCommit, planPath)) },
    },
    fixture: { path: fixturePath, fileSha256: sha256Text(fixtureText), logicalDigest: fixture.fixtureDigest, value: fixture },
    requirements: structuredClone(requirements),
    metrics: structuredClone(fixture.assertions),
    testRuns: structuredClone(testRuns),
    review: { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyMissionOperationEvidenceReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
}

async function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(repository, ...receiptPath.split('/'));
  await requireCleanExcept(repository, [...releaseOnlyPaths, 'package-lock.json']);
  const sourceCommit = await resolveSourceCommit({ root: repository, headCommit: await headCommit(repository), outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, repository);
  const preliminary = await buildMissionOperationEvidenceReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full: { status: 'pass', tests: focused.tests } } });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildMissionOperationEvidenceReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full } });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({ root: repository, certificationTestFile: 'tests/mission-operation-evidence-certification.test.mjs' });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# mission-operation evidence projection v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the opt-in, body-free, provider-neutral join from one verified mission-program forensic projection to exact generic mission-operation evidence. It proves descriptor, request, dispatch, receipt, authority, prefix, ordering, credential-screening, and adapter-free projection boundaries. It does not certify a source adapter, provider, model, remote effect, cross-program index, hosted durability, keel, memory, identity, evolution, Soul, or Lunari integration.\n`;
  await writeFile(join(repository, ...certificationPath.split('/')), markdown, 'utf8');
  process.stdout.write(`${canonicalJson({ status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest, fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
