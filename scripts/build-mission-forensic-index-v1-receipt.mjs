import { writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { verifyMissionForensicIndex } from '../src/runtime/mission-forensic-index.mjs';
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

const certificationId = 'mission-forensic-index-v1';
const protocolId = 'eternities-mission-forensic-index-certification-v1';
const fixturePath = 'fixtures/mission-forensic-index-v1.json';
const receiptPath = 'receipts/mission-forensic-index-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-cross-program-forensic-index-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-cross-program-forensic-index-v1.md';
const certificationPath = 'docs/mission-forensic-index-v1-certification.md';
const parentReceiptPath = 'receipts/mission-operation-evidence-v1.json';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'schemas/mission-forensic-index.schema.json',
  'scripts/build-mission-forensic-index-v1-fixture.mjs',
  'scripts/build-mission-forensic-index-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/mission-forensic-index.mjs',
  'src/runtime/mission-operation-adapter.mjs',
  'src/runtime/mission-operation-evidence.mjs',
  'src/runtime/mission-program.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/mission-forensic-index-certification.test.mjs',
  'tests/mission-forensic-index.test.mjs',
  'tests/mission-operation-adapter.test.mjs',
  'tests/mission-operation-evidence-certification.test.mjs',
  'tests/mission-operation-evidence.test.mjs',
  'tests/mission-program-forensics.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/mission-forensic-index.test.mjs',
  'tests/mission-forensic-index-certification.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const expectedAssertions = Object.freeze({
  bodyFreeIndex: true,
  crossProgramIsolation: true,
  deterministicIndex: true,
  exactProgramBindings: true,
  lifecyclePreserved: true,
  noAdapterCalls: true,
  sortedPrograms: true,
  sourceReceiptBindings: true,
});
const requirements = Object.freeze([
  ['MFI-001', 'two independently verified mission heads index without identity collision'],
  ['MFI-002', 'each program retains its exact selected prefix and head digests'],
  ['MFI-003', 'operations and source receipt bindings remain body-free and digest-bound'],
  ['MFI-004', 'recovered and failed lifecycle evidence is preserved only with an evidence digest'],
  ['MFI-005', 'duplicate programs, projection drift, and receipt drift fail closed'],
  ['MFI-006', 'future-prefix disclosure, credential-shaped input, and authority expansion fail closed'],
  ['MFI-007', 'program and operation ordering is deterministic and bounded'],
  ['MFI-008', 'index construction performs no adapter, provider, or filesystem work'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the index is a read-only provider-neutral view over already verified local projections and digest-only source receipt summaries',
  'recovered and failed lifecycle values are caller-supplied evidence assertions and are not live recovery or provider-failure certification',
  'the fixture proves multi-program isolation, prefix and receipt binding, status preservation, authority screening, and deterministic body-free output only',
  'the index does not infer cross-program causality, replay branches, perform time travel, execute effects, read credentials, or provide hosted durability',
  'keel, memory, identity, evolution, Inspiration, Soul, and Lunari remain outside this boundary',
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
  exactKeys(value, ['assertions', 'fixtureDigest', 'index', 'programs', 'protocolId', 'schemaVersion'], 'mission forensic index fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-forensic-index-fixture-v1') {
    throw new Error('mission forensic index fixture identity is invalid');
  }
  assertSchema('mission-forensic-index', value.index);
  verifyMissionForensicIndex(value.index);
  if (!Array.isArray(value.programs) || value.programs.length !== 2) throw new Error('mission forensic index fixture programs are invalid');
  if (!same(value.assertions, expectedAssertions) || Object.values(value.assertions).some((entry) => entry !== true)) {
    throw new Error('mission forensic index fixture assertions are invalid');
  }
  digest(value.fixtureDigest, 'mission forensic index fixture digest');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('mission forensic index fixture digest mismatch');
  return value;
}

export function verifyMissionForensicIndexReceipt(value) {
  exactKeys(value, [
    'certificationId', 'fixture', 'metrics', 'proofLimits', 'protocolId',
    'receiptDigest', 'requirements', 'review', 'schemaVersion', 'source',
    'status', 'testRuns',
  ], 'mission forensic index receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.protocolId !== protocolId || value.status !== 'certified') throw new Error('mission forensic index receipt identity is invalid');
  exactKeys(value.source, ['commit', 'historicalReceiptDigests', 'implementationManifest', 'parentReceipt', 'plan', 'specification', 'testManifest'], 'mission forensic index receipt source');
  if (!COMMIT.test(value.source.commit) || !value.source.historicalReceiptDigests || typeof value.source.historicalReceiptDigests !== 'object' || Array.isArray(value.source.historicalReceiptDigests)) throw new Error('mission forensic index receipt history is invalid');
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('mission forensic index historical receipt path is invalid');
    digest(valueDigest, 'mission forensic index historical receipt');
  }
  exactKeys(value.source.parentReceipt, ['certificationId', 'path', 'receiptDigest'], 'mission forensic index parent receipt');
  if (value.source.parentReceipt.certificationId !== 'mission-operation-evidence-v1' || value.source.parentReceipt.path !== parentReceiptPath) throw new Error('mission forensic index parent receipt identity is invalid');
  digest(value.source.parentReceipt.receiptDigest, 'mission forensic index parent receipt digest');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[field], ['path', 'sha256'], `mission forensic index ${field}`);
    if (value.source[field].path !== path) throw new Error(`mission forensic index ${field} path mismatch`);
    digest(value.source[field].sha256, `mission forensic index ${field} digest`);
  }
  for (const [field, paths] of [['implementationManifest', implementationFiles], ['testManifest', testFiles]]) {
    const manifest = value.source[field];
    exactKeys(manifest, ['digest', 'entries', 'paths'], `mission forensic index ${field}`);
    if (!same(manifest.paths, paths) || !Array.isArray(manifest.entries) || manifest.entries.length !== paths.length || manifest.digest !== sha256Value(manifest.entries)) throw new Error(`mission forensic index ${field} is invalid`);
    manifest.entries.forEach((entry, index) => {
      exactKeys(entry, ['bytes', 'path', 'sha256'], `mission forensic index ${field} entry`);
      if (entry.path !== paths[index] || !DIGEST.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) throw new Error(`mission forensic index ${field} entry is invalid`);
    });
  }
  exactKeys(value.fixture, ['fileSha256', 'logicalDigest', 'path', 'value'], 'mission forensic index receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) throw new Error('mission forensic index fixture binding is invalid');
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)
      || !same(value.proofLimits, proofLimits)
      || !same(value.review, { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 })) throw new Error('mission forensic index receipt evidence is invalid');
  if (!value.testRuns || !same(Object.keys(value.testRuns).sort(), ['focused', 'full'])) throw new Error('mission forensic index test runs are invalid');
  for (const run of Object.values(value.testRuns)) {
    exactKeys(run, ['status', 'tests'], 'mission forensic index test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) throw new Error('mission forensic index test run is invalid');
  }
  digest(value.receiptDigest, 'mission forensic index receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('mission forensic index receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts')).filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildMissionForensicIndexReceiptFromSource({ repositoryRoot, sourceCommit, testRuns } = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  if (!same(Object.keys(testRuns ?? {}).sort(), ['focused', 'full'])
      || Object.values(testRuns).some((run) => !run || run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1)) {
    throw new Error('mission forensic index test runs are invalid');
  }
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('mission forensic index fixture is not canonical');
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
      parentReceipt: { certificationId: 'mission-operation-evidence-v1', path: parentReceiptPath, receiptDigest: parent.receiptDigest },
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
  return Object.freeze(verifyMissionForensicIndexReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
}

async function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(repository, ...receiptPath.split('/'));
  await requireCleanExcept(repository, [...releaseOnlyPaths, 'package-lock.json']);
  const sourceCommit = await resolveSourceCommit({ root: repository, headCommit: await headCommit(repository), outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, repository);
  const preliminary = await buildMissionForensicIndexReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full: { status: 'pass', tests: focused.tests } } });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildMissionForensicIndexReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full } });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({ root: repository, certificationTestFile: 'tests/mission-forensic-index-certification.test.mjs' });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# mission-forensic index v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the bounded, body-free, provider-neutral index over independently verified mission-program forensic and mission-operation evidence projections. It preserves program heads, selected prefixes, operation identities, digest-only source receipt bindings, and explicit recovered or failed lifecycle evidence. It does not certify live provider truth, cross-program causality, replay, time travel, hosted durability, credentials, effects, keel, memory, identity, evolution, Soul, Inspiration, or Lunari behavior.\n`;
  await writeFile(join(repository, ...certificationPath.split('/')), markdown, 'utf8');
  process.stdout.write(`${canonicalJson({ status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest, fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
