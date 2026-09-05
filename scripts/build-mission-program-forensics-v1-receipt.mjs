import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
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

const certificationId = 'mission-program-forensics-v1';
const protocolId = 'eternities-mission-program-forensics-certification-v1';
const fixturePath = 'fixtures/mission-program-forensics-v1.json';
const receiptPath = 'receipts/mission-program-forensics-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-mission-program-forensics-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-mission-program-forensics-v1.md';
const auditPath = 'docs/audits/2026-09-05-universal-godagents-gap-audit-v3.md';
const certificationPath = 'docs/mission-program-forensics-v1-certification.md';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  auditPath,
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'schemas/mission-program-forensics.schema.json',
  'scripts/build-mission-program-forensics-fixture.mjs',
  'scripts/build-mission-program-forensics-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/errors.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/mission-program.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/mission-program-certification.test.mjs',
  'tests/mission-program-forensics-certification.test.mjs',
  'tests/mission-program-forensics.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/mission-program-forensics.test.mjs',
  'tests/mission-program-forensics-certification.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['MF-001', 'the projection is available only on an authentic mission-program coordinator and binds the requested program id'],
  ['MF-002', 'the complete journal and every referenced completion artifact are verified before any projection is returned'],
  ['MF-003', 'the projection exposes deterministic bounded event and step metadata without event payloads or result bodies'],
  ['MF-004', 'state-at-sequence summaries are exact, contiguous, and cannot disclose future events'],
  ['MF-005', 'absent programs and invalid sequence requests have closed deterministic behavior'],
  ['MF-006', 'the projection performs no adapter calls, locks, writes, reconciliation, dispatch, or provider work'],
  ['MF-007', 'projection and selected-prefix digests preserve exact evidence identity'],
  ['MF-008', 'tampered journals, future events, artifacts, and malformed projection inputs fail closed'],
  ['MF-009', 'the output ceiling and existing journal event ceiling bound the read-only evidence surface'],
  ['MF-010', 'the boundary remains provider-neutral and does not grant Realm, Godskills, keel, memory, identity, evolution, Soul, or Lunari authority'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the projection reads one local mission-program journal and its content-addressed completion artifacts; it is not a cross-program or cross-vessel index',
  'the receipt proves deterministic local metadata projection and zero adapter calls, not a live operator UI, hosted durability, branch replay, reversible time travel, or cross-provider tracing',
  'the projection does not disclose mission bodies, result bodies, credentials, filesystem paths, Realm handles, model routes, personal-keel writers, or memory content',
  'the certificate relies on the existing mission-program replay verifier and deterministic in-process fixture adapters; it does not qualify live providers or models',
  'the boundary does not execute, recover, route, reconcile, dispatch, publish, mutate, schedule, or retry a mission program',
  'Godskills bodies, Realm effects, delegation, identity, constitution, evolution, Inspiration, Soul, Lunari, and phenomenological behavior remain outside the release',
]);
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function digest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}

function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!same(value.paths, paths) || !Array.isArray(value.entries) || value.entries.length !== paths.length) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
  });
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'mission-program forensics test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'mission-program forensics test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('mission-program forensics test run is invalid');
    }
  }
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

function verifySummary(value, label) {
  exactKeys(value, [
    'status', 'selectedSequence', 'headSequence', 'selectedHeadDigest', 'eventTypes',
    'stepStatuses', 'next', 'aggregateDigest', 'projectionDigest',
  ], label);
  if (!['absent', 'admitted', 'pending', 'completed'].includes(value.status)
      || !Number.isSafeInteger(value.selectedSequence) || !Number.isSafeInteger(value.headSequence)
      || value.selectedSequence < 0 || value.selectedSequence > value.headSequence
      || !Array.isArray(value.eventTypes) || !Array.isArray(value.stepStatuses)
      || typeof value.next !== 'string') {
    throw new Error(`${label} values are invalid`);
  }
  digest(value.selectedHeadDigest, `${label} selected head`);
  digest(value.projectionDigest, `${label} projection`);
  if (value.aggregateDigest !== null) digest(value.aggregateDigest, `${label} aggregate`);
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'full', 'prefixes', 'absent', 'assertions', 'fixtureDigest'], 'mission-program forensics fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-program-forensics-fixture-v1') {
    throw new Error('mission-program forensics fixture identity is invalid');
  }
  verifySummary(value.full, 'mission-program forensics full summary');
  exactKeys(value.prefixes, ['admitted', 'pending', 'committed'], 'mission-program forensics prefixes');
  verifySummary(value.prefixes.admitted, 'mission-program forensics admitted summary');
  verifySummary(value.prefixes.pending, 'mission-program forensics pending summary');
  verifySummary(value.prefixes.committed, 'mission-program forensics committed summary');
  verifySummary(value.absent, 'mission-program forensics absent summary');
  const expectedAssertions = {
    deterministicProjection: true,
    fullCompleted: true,
    prefixAdmissionExact: true,
    prefixPendingExact: true,
    prefixCommittedExact: true,
    noFutureDisclosure: true,
    noPayloadDisclosure: true,
    absentStable: true,
    invalidSequenceRejected: true,
    readOnly: true,
    noAdapterCalls: true,
  };
  if (!same(value.assertions, expectedAssertions)) throw new Error('mission-program forensics assertions are invalid');
  if (value.full.status !== 'completed' || value.full.selectedSequence !== 6
      || value.full.eventTypes.join(',') !== 'program.admitted,step.prepared,step.committed,step.prepared,step.committed,program.completed'
      || value.prefixes.admitted.status !== 'admitted'
      || value.prefixes.pending.status !== 'pending'
      || value.prefixes.committed.stepStatuses.join(',') !== 'committed,admitted'
      || value.absent.status !== 'absent') {
    throw new Error('mission-program forensics fixture proof metrics are invalid');
  }
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'mission-program forensics fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('mission-program forensics fixture digest mismatch');
  return value;
}

export function verifyMissionProgramForensicsReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'mission-program forensics receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('mission-program forensics receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'mission-program forensics receipt source');
  if (!COMMIT.test(value.source.commit)
      || !value.source.historicalReceiptDigests
      || typeof value.source.historicalReceiptDigests !== 'object'
      || Array.isArray(value.source.historicalReceiptDigests)) {
    throw new Error('mission-program forensics receipt source history is invalid');
  }
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('mission-program forensics historical path is invalid');
    digest(valueDigest, 'mission-program forensics historical receipt');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'mission-program forensics implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'mission-program forensics test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'mission-program forensics specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'mission-program forensics plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'mission-program forensics receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath
      || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('mission-program forensics fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('mission-program forensics requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('mission-program forensics review or proof limits are invalid');
  }
  digest(value.receiptDigest, 'mission-program forensics receipt');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('mission-program forensics receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts'))
    .filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildMissionProgramForensicsReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('mission-program forensics fixture is not canonical');
  const implementationManifest = await manifestAtCommit(repository, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(repository, sourceCommit, testFiles);
  const history = await historicalReceiptPaths(repository, sourceCommit);
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
      specification: {
        path: specificationPath,
        sha256: sha256Text(await gitText(repository, sourceCommit, specificationPath)),
      },
      plan: {
        path: planPath,
        sha256: sha256Text(await gitText(repository, sourceCommit, planPath)),
      },
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: fixture,
    },
    requirements: structuredClone(requirements),
    metrics: structuredClone(fixture.assertions),
    testRuns: structuredClone(testRuns),
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      unresolvedImportantDefects: 0,
    },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyMissionProgramForensicsReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(repository, ...receiptPath.split('/'));
  await requireCleanExcept(repository, releaseOnlyPaths);
  const sourceCommit = await resolveSourceCommit({
    root: repository,
    headCommit: await headCommit(repository),
    outputPath,
    releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, repository);
  const preliminary = await buildMissionProgramForensicsReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildMissionProgramForensicsReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({
    root: repository,
    certificationTestFile: 'tests/mission-program-forensics-certification.test.mjs',
  });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Mission-program forensic projection v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the read-only mission-program forensic projection over one verified local journal and its content-addressed completion artifacts. It proves deterministic event metadata, exact selected-prefix summaries, bounded output, payload non-disclosure, tamper rejection, and zero adapter calls or writes. It does not certify a cross-program index, live provider trace correlation, an operator UI, hosted durability, branch replay, reversible time travel, or any execution, authority, Realm, Godskills, identity, continuity, evolution, Inspiration, Soul, Lunari, or phenomenological behavior.\n`;
  await writeFile(join(repository, ...certificationPath.split('/')), markdown, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: 'certified',
    sourceCommit,
    receiptDigest: receipt.receiptDigest,
    fixtureDigest: receipt.fixture.logicalDigest,
    testRuns: receipt.testRuns,
    release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
