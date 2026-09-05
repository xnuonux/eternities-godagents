import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { verifyMissionEconomicsLedger } from '../src/runtime/mission-economics-ledger.mjs';
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

const certificationId = 'mission-economics-ledger-v1';
const protocolId = 'eternities-mission-economics-ledger-certification-v1';
const fixturePath = 'fixtures/mission-economics-ledger-v1.json';
const receiptPath = 'receipts/mission-economics-ledger-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-mission-economics-ledger-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-mission-economics-ledger-v1.md';
const certificationPath = 'docs/mission-economics-ledger-v1-certification.md';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  planPath,
  specificationPath,
  'package.json',
  'schemas/mission-economics-ledger.schema.json',
  'scripts/build-mission-economics-ledger-fixture.mjs',
  'scripts/build-mission-economics-ledger-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/mission-economics-ledger.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/sdk/economics.mjs',
  'tests/helpers/mission-economics-ledger-fixture.mjs',
  'tests/helpers/mission-review-fixture.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/mission-economics-ledger-fixture.mjs',
  'tests/helpers/mission-review-fixture.mjs',
  'tests/mission-economics-ledger-certification.test.mjs',
  'tests/mission-economics-ledger.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/mission-economics-ledger.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['MEL-001', 'the sidecar accepts only verified admission, verdict, completion, request, descriptor, and phase-result evidence'],
  ['MEL-002', 'the ledger binds every completed phase to the terminal receipt and preserves exact separated usage'],
  ['MEL-003', 'cache identities are stable digests over the admitted mission, exact phase request, and executor descriptor'],
  ['MEL-004', 'completion headroom, cache coverage, utilization, and timing use bounded integer projections'],
  ['MEL-005', 'the journal-evidence bridge emits no artifact bodies or provider-sensitive fields'],
  ['MEL-006', 'tampered source, output, phase membership, usage, and authority-shaped fields fail closed'],
  ['MEL-007', 'the explicit sdk subpath is closed and the pre-existing root sdk contract remains unchanged'],
  ['MEL-008', 'the source-bound fixture, historical links, release gates, and lineage preserve the certified boundary'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the ledger is observation and planning data, not a cache implementation or cache-hit claim',
  'no provider pricing, live provider quality, latency-quality, model comparison, or live availability is certified',
  'cache identity does not authorize cache reads, writes, eviction, admission, or replay',
  'the sidecar does not alter mission execution, default launch, provider routing, or root sdk behavior',
  'Realm action, identity ownership, continuity, keel, evolution, Inspiration, Lunari, Soul, and public publication remain outside this slice',
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
  exactKeys(value, ['focused', 'full'], 'mission economics test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'mission economics test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('mission economics test run is invalid');
    }
  }
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'source', 'ledger', 'assertions', 'fixtureDigest'], 'mission economics fixture');
  assertNoCredentialFields(value.source);
  if (/credential|secret|authorization|endpoint/i.test(canonicalJson(value.ledger))) {
    throw new Error('mission economics ledger contains a sensitive field');
  }
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-economics-ledger-fixture-v1') {
    throw new Error('mission economics fixture identity is invalid');
  }
  verifyMissionEconomicsLedger(value.ledger, value.source);
  if (!same(value.assertions, {
    exactPhaseCount: true,
    completionUsageMatches: true,
    cacheIdentityPresent: true,
    ledgerBodyFree: true,
    proofLimitsHonest: true,
  }) || canonicalJson(value.ledger).includes('this body is source evidence')) {
    throw new Error('mission economics fixture assertions are invalid');
  }
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'mission economics fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('mission economics fixture digest mismatch');
  return value;
}

export function verifyMissionEconomicsLedgerReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'mission economics receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('mission economics receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'mission economics receipt source');
  if (!COMMIT.test(value.source.commit)
      || !value.source.historicalReceiptDigests
      || typeof value.source.historicalReceiptDigests !== 'object'
      || Array.isArray(value.source.historicalReceiptDigests)) {
    throw new Error('mission economics receipt source history is invalid');
  }
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('mission economics historical path is invalid');
    digest(valueDigest, 'mission economics historical receipt');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'mission economics implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'mission economics test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'mission economics specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'mission economics plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'mission economics receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath
      || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('mission economics fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('mission economics requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('mission economics review or proof limits are invalid');
  }
  digest(value.receiptDigest, 'mission economics receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('mission economics receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts'))
    .filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildMissionEconomicsLedgerReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('mission economics fixture is not canonical');
  const implementationManifest = await manifestAtCommit(root, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(root, sourceCommit, testFiles);
  const history = await historicalReceiptPaths(root, sourceCommit);
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, history),
      implementationManifest,
      testManifest,
      specification: {
        path: specificationPath,
        sha256: sha256Text(await gitText(root, sourceCommit, specificationPath)),
      },
      plan: {
        path: planPath,
        sha256: sha256Text(await gitText(root, sourceCommit, planPath)),
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
  return Object.freeze(verifyMissionEconomicsLedgerReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  await requireCleanExcept(root, releaseOnlyPaths);
  const sourceCommit = await resolveSourceCommit({
    root,
    headCommit: await headCommit(root),
    outputPath,
    releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await buildMissionEconomicsLedgerReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildMissionEconomicsLedgerReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({
    root,
    certificationTestFile: focusedTestFiles[0],
  });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Mission economics ledger v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the opt-in provider-neutral observation sidecar over exact completed mission review evidence. It proves separated usage aggregation, stable request cache identities, bounded integer ratios and timing, body-free output, journal-evidence projection, fail-closed source binding, and an explicit sdk subpath. It does not certify cache storage or cache-hit availability, provider pricing or quality, model comparison, live transport, default launch behavior, or any Realm, identity, continuity, keel, evolution, Inspiration, Lunari, or Soul authority.\n`;
  await writeFile(join(root, ...certificationPath.split('/')), markdown, 'utf8');
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
if (import.meta.url === invoked) main();
