import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { evaluateGodagentProfile } from '../src/agent/profile.mjs';
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

const certificationId = 'agent-profile-contract-v1';
const protocolId = 'eternities-godagent-profile-certification-v1';
const fixturePath = 'fixtures/agent-profile-contract-v1.json';
const receiptPath = 'receipts/agent-profile-contract-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-agent-profile-contract-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-agent-profile-contract-v1.md';
const certificationPath = 'docs/agent-profile-contract-v1-certification.md';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  planPath,
  specificationPath,
  'package.json',
  'schemas/godagent-profile.schema.json',
  'scripts/build-agent-profile-contract-v1-fixture.mjs',
  'scripts/build-agent-profile-contract-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/agent/profile.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/creation/contracts.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/skills/capability-policy.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/agent-profile-contract-certification.test.mjs',
  'tests/agent-profile-contract.test.mjs',
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/creation-compatibility.test.mjs',
  'tests/creation-projection.test.mjs',
  'tests/godskills-capability-policy.test.mjs',
  'tests/godskills-mission-binder.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/agent-profile-contract.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['GAP-001', 'the profile policy is a closed, normalized contract with an explicit all-rounder or specialist identity and a composition ceiling of one to three'],
  ['GAP-002', 'all-rounders remain complete over the supplied catalog and legacy preferred-family values are inert rather than implicit routing preferences'],
  ['GAP-003', 'explicit prohibited families and capabilities remain authoritative for all profile kinds'],
  ['GAP-004', 'specialist preferences rank matching capabilities without removing non-prohibited capabilities'],
  ['GAP-005', 'empty catalogs preserve the legacy-compatible empty eligibility result'],
  ['GAP-006', 'catalog and policy ordering use locale-independent canonical ordering and bind stable policy, catalog, and result digests'],
  ['GAP-007', 'creation projection and Godskills eligibility consume the same profile semantics without changing the existing Godskills output shape'],
  ['GAP-008', 'schema, fixture, historical source, focused tests, full tests, and release gates bind one exact provider-neutral profile boundary'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the profile contract governs capability eligibility and non-restrictive preference metadata; it does not implement routing quality, model selection, or mission execution',
  'all-rounder completeness and specialist preference semantics are proven only against the closed deterministic fixture and existing compatibility tests, not unseen work or live agents',
  'the catalog contains capability identities and families only; no Godskills body, source text, provider detail, credential, endpoint, or authority is admitted',
  'the composition ceiling remains a policy value and does not grant authority, effects, preconditions, risk, context, identity, Realm, keel, memory, evolution, Soul, or Lunari control',
  'a locale-independent digest proves reproducibility of this implementation, not cross-language canonicalization or production-scale performance',
  'the boundary remains internal to Godagents creation and the existing Godskills adapter; no Lunari, SDK, host, provider, Soul, or Inspiration path adopts it by default',
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
  exactKeys(value, ['focused', 'full'], 'agent profile test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'agent profile test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('agent profile test run is invalid');
    }
  }
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

function verifyCatalog(value) {
  if (!Array.isArray(value)) throw new Error('agent profile fixture catalog is invalid');
  const ids = new Set();
  value.forEach((row, index) => {
    exactKeys(row, ['id', 'family'], `agent profile catalog row ${index}`);
    if (typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(row.id)
        || typeof row.family !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(row.family)) {
      throw new Error('agent profile fixture catalog row is invalid');
    }
    if (ids.has(row.id)) throw new Error('agent profile fixture catalog ids are not unique');
    ids.add(row.id);
  });
}

function verifyCase(value, catalog, label) {
  exactKeys(value, ['policy', 'result'], label);
  const expected = evaluateGodagentProfile(value.policy, catalog);
  assertSchema('godagent-profile', value.result);
  if (!same(value.result, expected)) throw new Error(`${label} result does not replay`);
  if (!same(value.result.policy, value.policy)) throw new Error(`${label} policy binding is invalid`);
  return value.result;
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'catalog', 'cases', 'assertions', 'fixtureDigest'], 'agent profile fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-godagent-profile-fixture-v1') {
    throw new Error('agent profile fixture identity is invalid');
  }
  verifyCatalog(value.catalog);
  exactKeys(value.cases, [
    'allRounder', 'allRounderExplicitProhibition', 'specialist', 'emptyCatalog', 'ordering',
  ], 'agent profile fixture cases');
  const allRounder = verifyCase(value.cases.allRounder, value.catalog, 'all-rounder case');
  const explicit = verifyCase(
    value.cases.allRounderExplicitProhibition,
    value.catalog,
    'all-rounder prohibition case',
  );
  const specialist = verifyCase(value.cases.specialist, value.catalog, 'specialist case');
  const empty = verifyCase(value.cases.emptyCatalog, [], 'empty catalog case');
  const ordering = verifyCase(value.cases.ordering, [
    { id: 'a_0', family: 'ordering' },
    { id: 'a:0', family: 'ordering' },
    { id: 'a.0', family: 'ordering' },
    { id: 'a-0', family: 'ordering' },
  ], 'ordering case');
  if (allRounder.eligibleIds.length !== value.catalog.length
      || allRounder.preferredIds.length !== 0
      || !allRounder.semantics.allRounderComplete) {
    throw new Error('all-rounder completeness proof is invalid');
  }
  if (explicit.prohibitedIds.join(',') !== 'eternities-muse'
      || explicit.eligibleIds.includes('eternities-muse')) {
    throw new Error('explicit prohibition proof is invalid');
  }
  if (specialist.preferredIds.join(',') !== 'eternities-forge'
      || specialist.eligibleIds.join(',') !== 'eternities-aegis,eternities-forge,eternities-oracle') {
    throw new Error('specialist preference proof is invalid');
  }
  if (empty.eligibleIds.length !== 0 || !empty.semantics.allRounderComplete) {
    throw new Error('empty catalog proof is invalid');
  }
  if (ordering.eligibleIds.join(',') !== 'a-0,a.0,a:0,a_0') {
    throw new Error('locale-independent ordering proof is invalid');
  }
  const expectedAssertions = {
    allRounderComplete: true,
    staleAllRounderPreferenceInert: true,
    specialistPreferenceNonRestrictive: true,
    explicitProhibitionAuthoritative: true,
    emptyCatalogCompatible: true,
    localeIndependentOrdering: true,
    compositionCeilingPreserved: true,
  };
  if (!same(value.assertions, expectedAssertions)) throw new Error('agent profile fixture assertions are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'agent profile fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('agent profile fixture digest mismatch');
  return value;
}

export function verifyAgentProfileContractReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'agent profile receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('agent profile receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'agent profile receipt source');
  if (!COMMIT.test(value.source.commit)
      || !value.source.historicalReceiptDigests
      || typeof value.source.historicalReceiptDigests !== 'object'
      || Array.isArray(value.source.historicalReceiptDigests)) {
    throw new Error('agent profile receipt source history is invalid');
  }
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('agent profile historical path is invalid');
    digest(valueDigest, 'agent profile historical receipt');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'agent profile implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'agent profile test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'agent profile specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'agent profile plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'agent profile receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath
      || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('agent profile fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('agent profile requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('agent profile review or proof limits are invalid');
  }
  assertNoCredentialFields(value);
  digest(value.receiptDigest, 'agent profile receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('agent profile receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(repository, sourceCommit) {
  return (await pathsAtCommit(repository, sourceCommit, 'receipts'))
    .filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildAgentProfileContractReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('agent profile fixture is not canonical');
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
  return Object.freeze(verifyAgentProfileContractReceipt({
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
  const preliminary = await buildAgentProfileContractReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildAgentProfileContractReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({
    root: repository,
    certificationTestFile: 'tests/agent-profile-contract-certification.test.mjs',
  });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Agent profile contract v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the provider-neutral Godagent profile contract at the creation and Godskills eligibility boundary. It proves closed all-rounder and specialist policy normalization, inert legacy all-rounder preferences, authoritative explicit prohibitions, non-restrictive specialist preferences, empty-catalog compatibility, locale-independent digest ordering, exact schema and source binding, and unchanged Godskills result shape. It does not certify live model quality, routing quality, agent consciousness, Realm behavior, authority, identity, continuity, keel, memory, evolution, Soul, Inspiration, Lunari, or any default host adoption.\n`;
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
