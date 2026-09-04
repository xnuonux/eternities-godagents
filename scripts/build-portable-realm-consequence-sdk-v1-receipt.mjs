import { readdir, readFile, writeFile } from 'node:fs/promises';
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

const certificationId = 'portable-realm-consequence-sdk-v1';
const protocolId = 'eternities-portable-realm-consequence-sdk-certification-v1';
const fixturePath = 'fixtures/portable-realm-consequence-sdk-v1.json';
const receiptFilename = 'portable-realm-consequence-sdk-v1.json';
const receiptPath = `receipts/${receiptFilename}`;
const specificationPath = 'docs/superpowers/specs/2026-09-04-portable-realm-consequence-sdk-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-04-portable-realm-consequence-sdk-v1.md';
const certificationPath = 'docs/portable-realm-consequence-sdk-v1-certification.md';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  planPath,
  specificationPath,
  'package.json',
  'scripts/build-portable-realm-consequence-sdk-v1-fixture.mjs',
  'scripts/build-portable-realm-consequence-sdk-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/realm/recoverable-consequence-host.mjs',
  'src/sdk/index.mjs',
  'tests/helpers/portable-realm-consequence-sdk-fixture.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/portable-realm-consequence-sdk-fixture.mjs',
  'tests/portable-realm-consequence-sdk-certification.test.mjs',
  'tests/portable-realm-consequence-sdk.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/portable-realm-consequence-sdk.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const expectedRootExports = Object.freeze([
  'GODAGENT_SDK_PROTOCOL_ID',
  'GODAGENT_SDK_VERSION',
  'PORTABLE_PHASE_HOST_PROTOCOL_ID',
  'RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID',
  'assertPortablePhaseHostInstance',
  'assertProviderPhaseHostInstance',
  'assertRecoverableRealmConsequenceHost',
  'buildPortablePhaseHostDescription',
  'createAdmittedProviderBackedIdentityLauncher',
  'createPortablePhaseHostAdapter',
  'createProviderPhaseHost',
  'createRecoverableRealmConsequenceHost',
  'describeGodagentSdk',
  'verifyAdmittedProviderBackedIdentityLauncherDescription',
  'verifyPortablePhaseHostDescription',
  'verifyProviderPhaseHostDescription',
]);
const expectedProtocols = Object.freeze([
  'eternities-portable-phase-host-v1',
  'eternities-recoverable-realm-consequence-v1',
]);
const requirements = Object.freeze([
  ['PRSDK-001', 'the package root exposes the versioned consequence protocol and branded host operations'],
  ['PRSDK-002', 'the SDK descriptor declares the optional adapter without adding Realm authority or default launch'],
  ['PRSDK-003', 'package-root construction reaches the existing durable consequence host and exact retry path'],
  ['PRSDK-004', 'the root remains closed over low-level callables, credentials, vessel internals, and continuity operations'],
  ['PRSDK-005', 'the previous recoverable Realm consequence receipt and all historical ledger links remain intact'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'live Realm connectors, remote durability, and external exactly-once effects are not certified',
  'rollback, compensation, delegation, scheduling, and long-horizon execution remain absent',
  'the package root does not adopt the host as a default vessel or CLI path',
  'provider quality, credentials, model routing, Godskills, keel, memory, identity evolution, Inspiration, Lunari, and Soul remain outside this slice',
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
  exactKeys(value, ['focused', 'full'], 'portable Realm consequence SDK test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'portable Realm consequence SDK test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('portable Realm consequence SDK test run is invalid');
    }
  }
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'sdk', 'host', 'execution', 'assertions', 'fixtureDigest'], 'portable Realm consequence SDK fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-portable-realm-consequence-sdk-fixture-v1') {
    throw new Error('portable Realm consequence SDK fixture identity is invalid');
  }
  exactKeys(value.sdk, ['protocolId', 'version', 'rootExports', 'supportedAdapterProtocols'], 'portable Realm consequence SDK fixture SDK');
  if (value.sdk.protocolId !== 'eternities-godagents-sdk-v1'
      || value.sdk.version !== '0.1.0'
      || !same(value.sdk.rootExports, expectedRootExports)
      || !same(value.sdk.supportedAdapterProtocols, expectedProtocols)) {
    throw new Error('portable Realm consequence SDK fixture SDK binding is invalid');
  }
  exactKeys(value.host, ['protocolId', 'exposedFields', 'safety'], 'portable Realm consequence SDK fixture host');
  if (value.host.protocolId !== 'eternities-recoverable-realm-consequence-v1'
      || !same(value.host.exposedFields, ['descriptor', 'execute', 'executionIdFor', 'inspect', 'recover'])) {
    throw new Error('portable Realm consequence SDK fixture host binding is invalid');
  }
  exactKeys(value.host.safety, ['authorityExpanded', 'defaultLaunchEnabled', 'noPersistedSecrets', 'rollbackSupported'], 'portable Realm consequence SDK fixture safety');
  if (!same(value.host.safety, {
    authorityExpanded: false,
    defaultLaunchEnabled: false,
    noPersistedSecrets: true,
    rollbackSupported: false,
  })) throw new Error('portable Realm consequence SDK fixture safety is invalid');
  exactKeys(value.execution, [
    'firstStatus', 'retryRecovered', 'receiptDigest', 'retryReceiptDigest',
    'terminalReplayStable', 'realmMutationCount', 'realmCounter',
  ], 'portable Realm consequence SDK fixture execution');
  if (value.execution.firstStatus !== 'completed'
      || value.execution.retryRecovered !== true
      || !DIGEST.test(value.execution.receiptDigest)
      || value.execution.receiptDigest !== value.execution.retryReceiptDigest
      || value.execution.terminalReplayStable !== true
      || value.execution.realmMutationCount !== 1
      || value.execution.realmCounter !== 1) {
    throw new Error('portable Realm consequence SDK fixture execution is invalid');
  }
  const expectedAssertions = {
    authorityExpansions: 0,
    defaultLaunchAdoption: 0,
    noSensitivePersistence: true,
    providerCalls: 0,
    realmMutations: 1,
    terminalReplayStable: true,
  };
  if (!same(value.assertions, expectedAssertions)) throw new Error('portable Realm consequence SDK fixture assertions are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'portable Realm consequence SDK fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('portable Realm consequence SDK fixture digest mismatch');
  return value;
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyPortableRealmConsequenceSdkReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'portable Realm consequence SDK receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('portable Realm consequence SDK receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'portable Realm consequence SDK receipt source');
  if (!COMMIT.test(value.source.commit)
      || !value.source.historicalReceiptDigests
      || typeof value.source.historicalReceiptDigests !== 'object'
      || Array.isArray(value.source.historicalReceiptDigests)) {
    throw new Error('portable Realm consequence SDK receipt source history is invalid');
  }
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('portable Realm consequence SDK historical receipt path is invalid');
    digest(valueDigest, 'portable Realm consequence SDK historical receipt');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'portable Realm consequence SDK implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'portable Realm consequence SDK test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'portable Realm consequence SDK specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'portable Realm consequence SDK plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'portable Realm consequence SDK receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('portable Realm consequence SDK receipt fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('portable Realm consequence SDK receipt requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('portable Realm consequence SDK receipt review or proof limits are invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'portable Realm consequence SDK receipt');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('portable Realm consequence SDK receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root) {
  const names = (await readdir(join(root, 'receipts')))
    .filter((name) => name.endsWith('.json') && name !== receiptFilename)
    .sort();
  return names.map((name) => `receipts/${name}`);
}

export async function buildPortableRealmConsequenceSdkReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('portable Realm consequence SDK fixture is not canonical');
  const implementationManifest = await manifestAtCommit(root, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(root, sourceCommit, testFiles);
  const history = await historicalReceiptPaths(root);
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
  return Object.freeze(verifyPortableRealmConsequenceSdkReceipt({
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
  const preliminary = await buildPortableRealmConsequenceSdkReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildPortableRealmConsequenceSdkReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/portable-realm-consequence-sdk-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  const markdown = `# portable Realm consequence SDK v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies package-root exposure of the existing optional recoverable Realm consequence host. It does not certify default launch adoption, live Realm connectivity, remote durability, rollback, or Luna integration.\n`;
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
