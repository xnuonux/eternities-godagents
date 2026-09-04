import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { verifyRealmNegotiation } from '../src/realm/negotiation.mjs';
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

const certificationId = 'realm-negotiation-v1';
const protocolId = 'eternities-realm-negotiation-certification-v1';
const fixturePath = 'fixtures/realm-negotiation-v1.json';
const receiptPath = 'receipts/realm-negotiation-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-03-realm-negotiation-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-03-realm-negotiation-v1.md';
const certificationPath = 'docs/realm-negotiation-v1-certification.md';
const historicalReceiptPaths = Object.freeze([
  'receipts/admitted-provider-backed-identity-launcher-v1.json',
  'receipts/admitted-sealed-identity-host-v1.json',
  'receipts/admitted-sealed-typed-execution-host-v1.json',
  'receipts/codex-bound-turn-v1.json',
  'receipts/codex-recoverable-turn-coordinator-v1.json',
  'receipts/codex-recoverable-turn-journal-v1.json',
  'receipts/creation-forge-phase1-certification.json',
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/deferred-godskills-review-executor-v1.json',
  'receipts/deferred-godskills-review-materializer-v1.json',
  'receipts/durable-anthropic-messages-phase-transport-v1.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-specialist-preference-v1.json',
  'receipts/godskills-typed-composition-consumer-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/identity-bound-mission-vessel-v1.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/portable-phase-host-conformance-v1.json',
  'receipts/provider-backed-identity-cli-v1.json',
  'receipts/provider-backed-mission-dependencies-v1.json',
  'receipts/provider-neutral-phase-protocol-v1.json',
  'receipts/provider-neutral-phase-resolution-v1.json',
  'receipts/provider-phase-host-sdk-v1.json',
  'receipts/provider-resolution-authority-handoff-v1.json',
  'receipts/provider-resolution-authority-outbox-v1.json',
  'receipts/provider-resolution-decision-preparer-v1.json',
  'receipts/provider-resolution-profile-v1.json',
  'receipts/receipt-bound-typed-executor-bundle-v1.json',
  'receipts/recoverable-godskills-admission-v1.json',
  'receipts/recoverable-mission-native-executor-v1.json',
  'receipts/recoverable-mission-revision-executor-v1.json',
  'receipts/recoverable-typed-composition-compiler-v1.json',
  'receipts/recoverable-typed-execution-journal-v1.json',
  'receipts/resumable-mission-review-kernel-v1.json',
  'receipts/routing-evidence-activation-classifier-v1.json',
  'receipts/sealed-local-godskills-transport-v1.json',
  'receipts/sealed-local-identity-vessel-v1.json',
  'receipts/sealed-local-typed-composition-compiler-v1.json',
  'receipts/sealed-local-typed-execution-runner-v1.json',
  'receipts/sealed-openai-compatible-phase-transport-v1.json',
  'receipts/signed-openai-phase-resolution-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
].sort());
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'fixtures/realm-contract.json',
  planPath,
  specificationPath,
  'package.json',
  'schemas/realm-contract.schema.json',
  'schemas/realm-negotiation.schema.json',
  'scripts/build-realm-negotiation-v1-fixture.mjs',
  'scripts/build-realm-negotiation-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/realm/negotiation.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/realm-negotiation-certification.test.mjs',
  'tests/realm-negotiation.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/realm-negotiation.test.mjs',
  'tests/realm-negotiation-certification.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['RN-001', 'the negotiation uses one exact versioned protocol and exact source contract digest'],
  ['RN-002', 'available hands are a deterministic subset of the supplied effect and authority ceiling'],
  ['RN-003', 'the projection is deeply frozen, canonical, and free of credential-shaped fields'],
  ['RN-004', 'contract references and required hand inputs are semantically validated'],
  ['RN-005', 'forged hand, authority, source, protocol, and digest changes fail closed'],
  ['RN-006', 'the output exposes declared hand contracts but no executable Realm capability'],
  ['RN-007', 'the fixture binds writable and read-only ceilings with zero authority expansion'],
  ['RN-008', 'the source-bound receipt preserves the prior certification chain and exact test evidence'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the fixture uses the local fixture Realm contract and does not certify a live external Realm',
  'no Realm invocation, credential binding, lease, compensation, rollback, or remote exactly-once effect is certified',
  'no tool discovery, delegation, scheduler, multi-agent coordination, or public SDK adoption is certified',
  'no Godskills body, keel, memory, identity, evolution, Inspiration, Soul, Lunari, or phenomenological-core authority is added',
  'the deterministic projection proves mechanism and integrity, not model quality or product usability',
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
  exactKeys(value, ['focused', 'full'], 'realm negotiation test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'realm negotiation test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('realm negotiation test run is invalid');
    }
  }
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'sourceContract', 'cases', 'assertions', 'fixtureDigest'], 'realm negotiation fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-realm-negotiation-fixture-v1') {
    throw new Error('realm negotiation fixture identity is invalid');
  }
  exactKeys(value.sourceContract, ['path', 'fileSha256', 'logicalDigest', 'value'], 'realm negotiation source contract');
  if (value.sourceContract.path !== 'fixtures/realm-contract.json') {
    throw new Error('realm negotiation source contract path is invalid');
  }
  digest(value.sourceContract.fileSha256, 'realm negotiation source contract file digest');
  digest(value.sourceContract.logicalDigest, 'realm negotiation source contract logical digest');
  if (value.sourceContract.logicalDigest !== sha256Value(value.sourceContract.value)) {
    throw new Error('realm negotiation source contract logical digest mismatch');
  }
  if (!same(Object.keys(value.cases), ['readOnly', 'writable'])) {
    throw new Error('realm negotiation fixture cases are invalid');
  }
  for (const record of Object.values(value.cases)) {
    exactKeys(record, ['authority', 'negotiation'], 'realm negotiation fixture case');
    exactKeys(record.authority, ['availableAuthority', 'permittedEffects'], 'realm negotiation fixture authority');
    if (!Array.isArray(record.authority.availableAuthority) || !Array.isArray(record.authority.permittedEffects)) {
      throw new Error('realm negotiation fixture authority is invalid');
    }
    verifyRealmNegotiation(record.negotiation, {
      contract: value.sourceContract.value,
      authority: record.authority,
    });
  }
  exactKeys(value.assertions, [
    'sourceContractCount', 'writableAvailableHands', 'readOnlyAvailableHands',
    'authorityExpansions', 'executableFields', 'providerCalls',
  ], 'realm negotiation fixture assertions');
  if (!same(value.assertions, {
    sourceContractCount: 1,
    writableAvailableHands: 1,
    readOnlyAvailableHands: 0,
    authorityExpansions: 0,
    executableFields: 0,
    providerCalls: 0,
  })) throw new Error('realm negotiation fixture assertions are invalid');
  digest(value.fixtureDigest, 'realm negotiation fixture');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('realm negotiation fixture digest mismatch');
  return value;
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyRealmNegotiationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'realm negotiation receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('realm negotiation receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'realm negotiation receipt source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('realm negotiation receipt source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'realm negotiation implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'realm negotiation test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'realm negotiation specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'realm negotiation plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'realm negotiation receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('realm negotiation receipt fixture binding is invalid');
  }
  if (value.fixture.value.sourceContract.fileSha256
      !== value.source.implementationManifest.entries.find(
        (entry) => entry.path === 'fixtures/realm-contract.json',
      )?.sha256) {
    throw new Error('realm negotiation source contract file binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('realm negotiation receipt requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('realm negotiation receipt review or proof limits are invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'realm negotiation receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('realm negotiation receipt digest mismatch');
  return value;
}

export async function buildRealmNegotiationReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('realm negotiation fixture is not canonical');
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
  return Object.freeze(verifyRealmNegotiationReceipt({
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
  const preliminary = await buildRealmNegotiationReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildRealmNegotiationReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/realm-negotiation-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  const markdown = `# Realm negotiation v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release tests: ${release.tests}\n\nThis certifies the read-only, authority-ceiling-bound Realm negotiation projection over the fixture contract. It does not certify a live Realm connector, execution, rollback, or Luna integration.\n`;
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
