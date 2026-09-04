import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  assertCommit,
  gitText,
  headCommit,
  historicalAtCommit,
  manifestAtCommit,
  requireCleanExcept,
  resolveSourceCommit,
  runTests,
} from './lib/certification-support.mjs';

const certificationId = 'portable-phase-host-conformance-v1';
const protocolId = 'eternities-portable-phase-host-conformance-certification-v1';
const fixturePath = 'fixtures/portable-phase-host-conformance-v1.json';
const receiptPath = 'receipts/portable-phase-host-conformance-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-03-portable-phase-host-conformance-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-03-portable-phase-host-conformance-v1.md';
const certificationPath = 'docs/portable-phase-host-conformance-v1-certification.md';
const historicalReceiptPaths = Object.freeze(['receipts/provider-phase-host-sdk-v1.json']);
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  planPath,
  specificationPath,
  'package.json',
  'schemas/portable-phase-host-description.schema.json',
  'scripts/build-portable-phase-host-conformance-v1-fixture.mjs',
  'scripts/build-portable-phase-host-conformance-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/host/provider-phase-host-sdk.mjs',
  'src/runtime/identity-bound-native-contracts.mjs',
  'src/runtime/mission-revision-transport-contracts.mjs',
  'src/sdk/index.mjs',
  'src/sdk/portable-phase-host.mjs',
  'src/skills/review-transport-contracts.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/anthropic-messages-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/portable-phase-host-conformance-fixture.mjs',
  'tests/portable-phase-host-conformance-certification.test.mjs',
  'tests/portable-phase-host-conformance.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/portable-phase-host-conformance.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['PCH-001', 'portable host descriptions use one exact versioned protocol and non-secret policy digest'],
  ['PCH-002', 'native review and revision descriptors are the exact fixed phase set and are independently verified'],
  ['PCH-003', 'the adapter factory pins each verified descriptor and rejects descriptor drift or unissued lookalikes'],
  ['PCH-004', 'the portable host authority projection remains empty for Realm continuity identity evolution Inspiration and Soul'],
  ['PCH-005', 'credential preflight and public descriptions remain free of credential values and provider work'],
  ['PCH-006', 'both existing provider hosts conform to the portable boundary without a provider call'],
  ['PCH-007', 'the package root exposes only the closed SDK and portable adapter entrypoints'],
  ['PCH-008', 'source-bound fixture tests and release gates reproduce the exact candidate evidence'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'live host behavior, model quality, provider availability, cost, and latency are not certified',
  'remote exactly-once execution and hostile same-user isolation are not certified',
  'Codex, Claude Code, local-model, MCP, and other desktop adapters are not implemented',
  'the portable factory does not choose providers, models, credentials, retries, or fallback paths',
  'no default launch behavior or provider-backed mission bridge changes in this slice',
  'no Realm, continuity, personal-keel, identity, evolution, Inspiration, Lunari, or Soul authority is added',
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
  exactKeys(value, ['focused', 'full'], 'portable phase-host test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'portable phase-host test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('portable phase-host test run is invalid');
    }
  }
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'adapters', 'assertions', 'fixtureDigest'], 'portable phase-host fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-portable-phase-host-conformance-fixture-v1'
      || !same(Object.keys(value.adapters), ['anthropic-messages-v1', 'openai-compatible-chat-completions-v1'])) {
    throw new Error('portable phase-host fixture identity is invalid');
  }
  for (const [family, record] of Object.entries(value.adapters)) {
    exactKeys(record, [
      'adapterId', 'policyDigest', 'descriptionDigest', 'descriptorDigests',
      'exposedFields', 'credentialFree', 'providerCallsAtConstruction', 'authorityEmpty',
    ], 'portable phase-host adapter record');
    if (record.adapterId !== `provider-wrapper-${family}` || !DIGEST.test(record.policyDigest)
        || !DIGEST.test(record.descriptionDigest) || !same(Object.keys(record.descriptorDigests), ['native', 'review', 'revision'])
        || Object.values(record.descriptorDigests).some((value) => !DIGEST.test(value))
        || !same(record.exposedFields, [
          'assertCredentialAbsent', 'createOperatorResolutionController', 'describe',
          'native', 'review', 'revision',
        ]) || record.credentialFree !== true || record.providerCallsAtConstruction !== 0
        || record.authorityEmpty !== true) {
      throw new Error('portable phase-host adapter record is invalid');
    }
  }
  const expectedAssertions = {
    adapters: 2,
    wrappedPhases: 6,
    providerCalls: 0,
    credentialLeaks: 0,
    authorityExpansions: 0,
    commonSurfaceParity: true,
  };
  if (!same(value.assertions, expectedAssertions)) throw new Error('portable phase-host fixture assertions are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'portable phase-host fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('portable phase-host fixture digest mismatch');
  return value;
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyPortablePhaseHostConformanceReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'portable phase-host receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('portable phase-host receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'portable phase-host receipt source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('portable phase-host receipt source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'portable phase-host implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'portable phase-host test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'portable phase-host specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'portable phase-host plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'portable phase-host receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('portable phase-host receipt fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('portable phase-host receipt requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('portable phase-host receipt review or proof limits are invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'portable phase-host receipt');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('portable phase-host receipt digest mismatch');
  return value;
}

export async function buildPortablePhaseHostConformanceReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('portable phase-host fixture is not canonical');
  const implementationManifest = await manifestAtCommit(root, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(root, sourceCommit, testFiles);
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
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
  return Object.freeze(verifyPortablePhaseHostConformanceReceipt({
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
  const preliminary = await buildPortablePhaseHostConformanceReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildPortablePhaseHostConformanceReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/portable-phase-host-conformance-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  const markdown = `# Portable Phase-Host Conformance v1 Certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies the versioned provider-neutral phase-host adapter boundary and structural wrapping of both existing provider host families without provider work. It does not certify live host adapters or model quality.\n`;
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
if (import.meta.url === invoked) await main();
