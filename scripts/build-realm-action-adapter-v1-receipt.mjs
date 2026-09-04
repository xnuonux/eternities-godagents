import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
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
import { runReleaseGates } from './lib/release-gates.mjs';

const certificationId = 'realm-action-adapter-v1';
const protocolId = 'eternities-realm-action-adapter-certification-v1';
const fixturePath = 'fixtures/realm-negotiated-action-v1.json';
const receiptPath = 'receipts/realm-action-adapter-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-03-realm-action-adapter-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-03-realm-action-adapter-v1.md';
const releaseGateSpecificationPath = 'docs/superpowers/specs/2026-09-03-certification-release-gate-v1-design.md';
const releaseGatePlanPath = 'docs/superpowers/plans/2026-09-03-certification-release-gate-v1.md';
const certificationPath = 'docs/realm-action-adapter-v1-certification.md';
const historicalReceiptPaths = Object.freeze([
  'receipts/admitted-provider-backed-identity-launcher-v1.json',
  'receipts/admitted-sealed-identity-host-v1.json',
  'receipts/admitted-sealed-typed-execution-host-v1.json',
  'receipts/codex-bound-turn-v1.json',
  'receipts/codex-recoverable-turn-coordinator-v1.json',
  'receipts/codex-recoverable-turn-journal-v1.json',
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
  'receipts/creation-forge-phase1-certification.json',
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
  'receipts/realm-negotiation-v1.json',
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
  'schemas/action-receipt.schema.json',
  'schemas/decision-commit.schema.json',
  'schemas/realm-contract.schema.json',
  'schemas/realm-negotiated-action.schema.json',
  'scripts/build-realm-action-adapter-v1-fixture.mjs',
  'scripts/build-realm-action-adapter-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/errors.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/realm/action-gateway.mjs',
  'src/realm/fixture-realm.mjs',
  'src/realm/hand-contract.mjs',
  'src/realm/negotiated-action-adapter.mjs',
  'src/realm/negotiation.mjs',
  'src/runtime/arbiter.mjs',
  releaseGatePlanPath,
  releaseGateSpecificationPath,
].sort());
const testFiles = Object.freeze([
  'tests/action-awareness.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/local-persistent-realm.test.mjs',
  'tests/realm-action-adapter-certification.test.mjs',
  'tests/realm-action-adapter.test.mjs',
  'tests/realm-negotiation-certification.test.mjs',
  'tests/realm-negotiation.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/realm-action-adapter.test.mjs',
  'tests/realm-action-adapter-certification.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['RA-001', 'the adapter verifies one exact negotiation against the supplied contract and authority ceiling'],
  ['RA-002', 'only an available, contract-identical, idempotent hand can reach the existing action gateway'],
  ['RA-003', 'invalid action, payload, authority, effect, or input shape fails before Realm observation or invocation'],
  ['RA-004', 'the existing gateway remains the sole effect path and exact retries do not duplicate the fixture mutation'],
  ['RA-005', 'the wrapper receipt binds negotiation, contract, authority, decision, action, and child receipt digests'],
  ['RA-006', 'the wrapper receipt contains no payload, Realm handle, callable field, credential, or authority grant'],
  ['RA-007', 'the source-bound fixture proves one applied action, one exact retry, and zero authority expansion'],
  ['RA-008', 'the source-bound receipt preserves the prior certification chain and exact test evidence'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the fixture uses the local fixture Realm and does not certify a live external Realm or tool connector',
  'no credential binding, lease, compensation, rollback, remote exactly-once effect, or provider quality is certified',
  'no default vessel launch, durable journal publication, delegation, scheduler, public SDK adoption, or multi-agent coordination is certified',
  'no Godskills body, keel, memory, identity, constitution, evolution, Inspiration, Soul, Lunari, or phenomenological-core authority is added',
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
  exactKeys(value, ['focused', 'full'], 'Realm action adapter test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'Realm action adapter test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('Realm action adapter test run is invalid');
    }
  }
}

function verifyAdapterFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'sourceContract', 'cases', 'assertions', 'fixtureDigest'], 'Realm action adapter fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-realm-negotiated-action-fixture-v1') {
    throw new Error('Realm action adapter fixture identity is invalid');
  }
  exactKeys(value.sourceContract, ['path', 'fileSha256', 'logicalDigest', 'value'], 'Realm action adapter source contract');
  if (value.sourceContract.path !== 'fixtures/realm-contract.json') throw new Error('Realm action adapter source contract path is invalid');
  digest(value.sourceContract.fileSha256, 'Realm action adapter source contract file digest');
  digest(value.sourceContract.logicalDigest, 'Realm action adapter source contract logical digest');
  if (value.sourceContract.logicalDigest !== sha256Value(value.sourceContract.value)) {
    throw new Error('Realm action adapter source contract logical digest mismatch');
  }
  exactKeys(value.cases, ['input', 'first', 'exactRetry'], 'Realm action adapter fixture cases');
  exactKeys(value.cases.input, ['authority', 'negotiation', 'decision', 'action'], 'Realm action adapter fixture input');
  verifyRealmNegotiation(value.cases.input.negotiation, {
    contract: value.sourceContract.value,
    authority: value.cases.input.authority,
  });
  assertSchema('decision-commit', value.cases.input.decision);
  assertNoCredentialFields(value.cases.input);

  for (const result of [value.cases.first, value.cases.exactRetry]) {
    exactKeys(result, ['actionReceipt', 'receipt'], 'Realm action adapter fixture result');
    assertSchema('action-receipt', result.actionReceipt);
    assertSchema('realm-negotiated-action', result.receipt);
    assertNoCredentialFields(result.receipt);
  }
  if (!same(value.cases.first, value.cases.exactRetry)) throw new Error('Realm action adapter retry is not exact');
  const first = value.cases.first;
  const input = value.cases.input;
  if (first.receipt.negotiationDigest !== input.negotiation.negotiationDigest
      || first.receipt.contractDigest !== input.negotiation.contractDigest
      || first.receipt.authorityCeilingDigest !== sha256Value(input.negotiation.authorityCeiling)
      || first.receipt.decisionDigest !== input.decision.receiptDigest
      || first.receipt.actionDigest !== sha256Value(input.action)
      || first.receipt.actionReceiptDigest !== first.actionReceipt.receiptDigest
      || first.receipt.decisionId !== input.decision.decisionId
      || first.receipt.actionId !== input.action.actionId
      || first.receipt.invocationStatus !== first.actionReceipt.invocation.status
      || first.receipt.discrepancyClass !== first.actionReceipt.discrepancyClass
      || first.receipt.disposition !== first.actionReceipt.disposition) {
    throw new Error('Realm action adapter fixture receipt binding is invalid');
  }
  const { receiptDigest, ...receiptUnsigned } = first.receipt;
  if (receiptDigest !== sha256Value(receiptUnsigned)) throw new Error('Realm action adapter child receipt digest mismatch');
  if (canonicalJson(first.receipt).match(/amount|observe|invoke|credential/i)) {
    throw new Error('Realm action adapter fixture receipt contains a forbidden surface');
  }
  const expectedAssertions = {
    sourceContractCount: 1,
    successfulActions: 1,
    exactRetryStable: true,
    realmInvocationCount: 1,
    realmCounter: 1,
    idempotencyCount: 1,
    observeCalls: 3,
    invokeCalls: 1,
    reconcileCalls: 1,
    authorityExpansions: 0,
    executableFields: 0,
    credentialLeaks: 0,
    providerCalls: 0,
  };
  if (!same(value.assertions, expectedAssertions)) throw new Error('Realm action adapter fixture assertions are invalid');
  digest(value.fixtureDigest, 'Realm action adapter fixture');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('Realm action adapter fixture digest mismatch');
  return value;
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyRealmActionAdapterReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'Realm action adapter receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('Realm action adapter receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'Realm action adapter receipt source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests).sort(), historicalReceiptPaths)) {
    throw new Error('Realm action adapter receipt history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'Realm action adapter implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'Realm action adapter test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'Realm action adapter specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'Realm action adapter plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'Realm action adapter receipt fixture');
  const fixture = verifyAdapterFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('Realm action adapter fixture binding is invalid');
  }
  if (value.fixture.value.sourceContract.fileSha256
      !== value.source.implementationManifest.entries.find(
        (entry) => entry.path === 'fixtures/realm-contract.json',
      )?.sha256) {
    throw new Error('Realm action adapter source contract file binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('Realm action adapter requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('Realm action adapter review or proof limits are invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'Realm action adapter receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('Realm action adapter receipt digest mismatch');
  return value;
}

export async function buildRealmActionAdapterReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyAdapterFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('Realm action adapter fixture is not canonical');
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
  return Object.freeze(verifyRealmActionAdapterReceipt({
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
  const preliminary = await buildRealmActionAdapterReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildRealmActionAdapterReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({
    root,
    certificationTestFile: 'tests/realm-action-adapter-certification.test.mjs',
  });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Realm action adapter v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the local receipt-bound adapter over the verified Realm negotiation and existing action gateway. It does not certify a live external Realm, credentials, leases, compensation, rollback, remote exactly-once effects, or Luna integration.\n`;
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
