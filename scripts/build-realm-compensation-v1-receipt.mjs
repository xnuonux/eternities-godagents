import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
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

const certificationId = 'realm-compensation-v1';
const protocolId = 'eternities-realm-compensation-certification-v1';
const fixturePath = 'fixtures/realm-compensation-v1.json';
const receiptPath = 'receipts/realm-compensation-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-04-realm-compensation-boundary-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-04-realm-compensation-boundary-v1.md';
const releaseGateSpecificationPath = 'docs/superpowers/specs/2026-09-03-certification-release-gate-v1-design.md';
const releaseGatePlanPath = 'docs/superpowers/plans/2026-09-03-certification-release-gate-v1.md';
const certificationPath = 'docs/realm-compensation-v1-certification.md';
const historicalReceiptPaths = Object.freeze([
  'receipts/admitted-local-launch-v1.json',
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
  'receipts/portable-realm-consequence-sdk-v1.json',
  'receipts/provider-backed-identity-cli-v1.json',
  'receipts/provider-backed-mission-dependencies-v1.json',
  'receipts/provider-neutral-phase-protocol-v1.json',
  'receipts/provider-neutral-phase-resolution-v1.json',
  'receipts/provider-phase-host-sdk-v1.json',
  'receipts/provider-resolution-authority-handoff-v1.json',
  'receipts/provider-resolution-authority-outbox-v1.json',
  'receipts/provider-resolution-decision-preparer-v1.json',
  'receipts/provider-resolution-profile-v1.json',
  'receipts/realm-action-adapter-v1.json',
  'receipts/realm-consequence-executor-v1.json',
  'receipts/realm-negotiation-v1.json',
  'receipts/receipt-bound-typed-executor-bundle-v1.json',
  'receipts/recoverable-godskills-admission-v1.json',
  'receipts/recoverable-mission-native-executor-v1.json',
  'receipts/recoverable-mission-revision-executor-v1.json',
  'receipts/recoverable-realm-consequence-vessel-v1.json',
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
  'fixtures/realm-compensation-contract.json',
  'dist/fixture-agent/agent-genome.json',
  planPath,
  specificationPath,
  'package.json',
  'schemas/action-receipt.schema.json',
  'schemas/agent-genome.schema.json',
  'schemas/decision-commit.schema.json',
  'schemas/organ-proposal.schema.json',
  'schemas/realm-compensation-relation.schema.json',
  'schemas/realm-contract.schema.json',
  'schemas/realm-negotiated-action.schema.json',
  'schemas/realm-negotiated-consequence.schema.json',
  'schemas/realm-negotiation.schema.json',
  'schemas/recoverable-realm-compensation.schema.json',
  'schemas/recoverable-realm-consequence-receipt.schema.json',
  'schemas/vessel-event.schema.json',
  'scripts/build-realm-compensation-v1-fixture.mjs',
  'scripts/build-realm-compensation-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/errors.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/realm/action-gateway.mjs',
  'src/realm/compensation.mjs',
  'src/realm/fixture-realm.mjs',
  'src/realm/hand-contract.mjs',
  'src/realm/negotiated-action-adapter.mjs',
  'src/realm/negotiated-consequence-executor.mjs',
  'src/realm/negotiation.mjs',
  'src/realm/recoverable-compensation-host.mjs',
  'src/realm/recoverable-consequence-host.mjs',
  'src/runtime/arbiter.mjs',
  'src/runtime/fixture-cortex.mjs',
  'src/state/file-lock.mjs',
  'src/state/journal.mjs',
  releaseGatePlanPath,
  releaseGateSpecificationPath,
].sort());
const testFiles = Object.freeze([
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/realm-compensation-certification.test.mjs',
  'tests/realm-compensation.test.mjs',
  'tests/realm-consequence-executor.test.mjs',
  'tests/realm-negotiation.test.mjs',
  'tests/recoverable-realm-consequence.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/realm-compensation-certification.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['RCP-001', 'one exact relation binds declared idempotent inverse hands under one Realm Contract digest'],
  ['RCP-002', 'all required payload and outcome fields are covered one-to-one with equal payload values and opposite operations'],
  ['RCP-003', 'only a branded, terminal, applied, discrepancy-free completed primary consequence can be compensated'],
  ['RCP-004', 'the compensating consequence remains inside the existing mission, host, constitution, hand, and state ceilings'],
  ['RCP-005', 'one compensation execution owns a bounded canonical admission, result, and receipt journal'],
  ['RCP-006', 'recovery after admission and after an external effect reuses deterministic idempotency without duplicate mutation'],
  ['RCP-007', 'terminal replay, path integrity, journal integrity, credential absence, and relation drift fail or complete deterministically'],
  ['RCP-008', 'the source-bound fixture and receipt preserve the prior certification chain without default or Lunari wiring'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the fixture uses a local counter Realm and does not certify a live external Realm or connector',
  'the boundary supports only declared observation-delta add and subtract relations, not arbitrary business undo',
  'uncertain, pending, denied, failed, stale, or changed primary effects are not automatically compensated',
  'no automatic rollback, generic saga, cross-system atomicity, financial reversal, remote exactly-once effect, or live tool adapter is certified',
  'the opt-in host is not wired into default launch, the portable SDK root, Godskills, keel, memory, identity, evolution, Soul, Luna, or Lunari',
  'deterministic local recovery evidence does not establish live model quality, product usability, or sentience',
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
  exactKeys(value, ['focused', 'full'], 'Realm compensation test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'Realm compensation test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('Realm compensation test run is invalid');
    }
  }
}

function verifySource(value, path, label) {
  exactKeys(value, ['path', 'fileSha256', 'logicalDigest', 'value'], label);
  if (value.path !== path) throw new Error(`${label} path is invalid`);
  digest(value.fileSha256, `${label} file digest`);
  digest(value.logicalDigest, `${label} logical digest`);
  if (value.logicalDigest !== sha256Value(value.value)) throw new Error(`${label} logical digest mismatch`);
}

function verifyConsequence(value, label) {
  exactKeys(value, ['status', 'executionId', 'recovered', 'journalHeadDigest', 'consequence', 'receipt'], label);
  if (value.status !== 'completed' || typeof value.recovered !== 'boolean') throw new Error(`${label} status is invalid`);
  digest(value.executionId, `${label} execution id`);
  digest(value.journalHeadDigest, `${label} journal head`);
  assertSchema('realm-negotiated-consequence', value.consequence.receipt);
  assertSchema('recoverable-realm-consequence-receipt', value.receipt);
  assertNoCredentialFields(value);
}

function verifyCompensation(value, request, label) {
  exactKeys(value, ['status', 'executionId', 'recovered', 'journalHeadDigest', 'consequence', 'receipt'], label);
  if (value.status !== 'completed' || typeof value.recovered !== 'boolean') throw new Error(`${label} status is invalid`);
  digest(value.executionId, `${label} execution id`);
  digest(value.journalHeadDigest, `${label} journal head`);
  assertSchema('realm-negotiated-consequence', value.consequence.receipt);
  assertSchema('recoverable-realm-compensation', value.receipt);
  if (value.receipt.executionId !== value.executionId
      || value.receipt.primaryExecutionId !== request.primaryExecutionId
      || value.receipt.inputDigest !== sha256Value(request.input)
      || value.receipt.relationDigest !== request.relation.relationDigest
      || value.receipt.compensationConsequenceDigest !== sha256Value(value.consequence)
      || value.receipt.compensationReceiptDigest !== value.consequence.receipt.receiptDigest
      || value.receipt.resultEventDigest === value.journalHeadDigest) {
    throw new Error(`${label} receipt binding is invalid`);
  }
  assertNoCredentialFields(value);
}

function verifyRequest(value, contract, constitution, label) {
  exactKeys(value, ['primaryExecutionId', 'relation', 'input'], label);
  digest(value.primaryExecutionId, `${label} primary execution id`);
  assertSchema('realm-compensation-relation', value.relation);
  exactKeys(value.input, ['mission', 'proposal', 'contract', 'authority', 'constitution', 'state'], `${label} input`);
  if (!same(value.input.contract, contract) || !same(value.input.constitution, constitution)) {
    throw new Error(`${label} source binding is invalid`);
  }
  assertSchema('realm-contract', value.input.contract);
  assertSchema('organ-proposal', value.input.proposal);
  if (value.relation.compensatingHandId !== value.input.proposal.intent.handId) {
    throw new Error(`${label} compensating hand binding is invalid`);
  }
  assertNoCredentialFields(value);
}

function verifyRealmEvidence(value, label) {
  exactKeys(value, ['calls', 'state'], `${label} success Realm evidence`);
  exactKeys(value.calls, ['observe', 'invoke', 'reconcile'], `${label} Realm calls`);
  exactKeys(value.state, ['counter', 'invocationCount', 'reconciliationCount', 'idempotencyCount'], `${label} Realm state`);
  for (const entry of [value.calls, value.state]) {
    for (const count of Object.values(entry)) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label} Realm count is invalid`);
    }
  }
}

function verifyRecoveryEvidence(value, label) {
  exactKeys(value, [
    'primaryExecutionId', 'input', 'executionId', 'failure', 'recovered', 'eventTypes', 'realm',
  ], label);
  digest(value.primaryExecutionId, `${label} primary execution id`);
  digest(value.executionId, `${label} execution id`);
  exactKeys(value.failure, ['name', 'message'], `${label} failure`);
  if (value.failure.name !== 'Error' || typeof value.failure.message !== 'string') throw new Error(`${label} failure is invalid`);
  if (!same(value.eventTypes, ['compensation.admitted', 'compensation.resulted', 'compensation.receipted'])) {
    throw new Error(`${label} event sequence is invalid`);
  }
  verifyRequest(value.input, value.input.input.contract, value.input.input.constitution, `${label} request`);
  verifyCompensation(value.recovered, value.input, `${label} recovered`);
  exactKeys(value.realm, [
    'callsBeforeRecovery', 'callsAfterRecovery', 'beforeRecovery', 'afterRecovery',
  ], `${label} Realm evidence`);
  for (const calls of [value.realm.callsBeforeRecovery, value.realm.callsAfterRecovery]) {
    exactKeys(calls, ['observe', 'invoke', 'reconcile'], `${label} Realm calls`);
  }
  for (const state of [value.realm.beforeRecovery, value.realm.afterRecovery]) {
    exactKeys(state, ['counter', 'invocationCount', 'reconciliationCount', 'idempotencyCount'], `${label} Realm state`);
  }
}

export function verifyRealmCompensationFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'sourceContract', 'sourceConstitution', 'relation',
    'primaryInput', 'cases', 'assertions', 'fixtureDigest',
  ], 'Realm compensation fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-realm-compensation-fixture-v1') {
    throw new Error('Realm compensation fixture identity is invalid');
  }
  verifySource(value.sourceContract, 'fixtures/realm-compensation-contract.json', 'Realm compensation source Contract');
  verifySource(value.sourceConstitution, 'dist/fixture-agent/agent-genome.json', 'Realm compensation source constitution');
  if (!same(value.primaryInput.contract, value.sourceContract.value)
      || !same(value.primaryInput.constitution, value.sourceConstitution.value)) {
    throw new Error('Realm compensation primary source binding is invalid');
  }
  assertSchema('realm-compensation-relation', value.relation);
  exactKeys(value.primaryInput, [
    'mission', 'proposal', 'contract', 'authority', 'constitution', 'state',
  ], 'Realm compensation primary input');
  assertSchema('realm-contract', value.primaryInput.contract);
  assertSchema('organ-proposal', value.primaryInput.proposal);
  assertNoCredentialFields(value.primaryInput);
  exactKeys(value.cases, ['success', 'afterAdmission', 'afterEffect', 'afterResult'], 'Realm compensation cases');

  const success = value.cases.success;
  exactKeys(success, ['primary', 'primaryRetry', 'first', 'exactRetry', 'eventTypes', 'realm', 'input'], 'Realm compensation success case');
  verifyRequest(success.input, value.sourceContract.value, value.sourceConstitution.value, 'Realm compensation success request');
  verifyConsequence(success.primary, 'Realm compensation success primary');
  verifyConsequence(success.primaryRetry, 'Realm compensation success primary retry');
  verifyCompensation(success.first, success.input, 'Realm compensation success first');
  verifyCompensation(success.exactRetry, success.input, 'Realm compensation success retry');
  if (success.input.primaryExecutionId !== success.primary.executionId
      || success.first.receipt.primaryExecutionId !== success.primary.executionId
      || !same(success.first.consequence, success.exactRetry.consequence)
      || !same(success.first.receipt, success.exactRetry.receipt)
      || success.first.recovered !== false
      || success.exactRetry.recovered !== true
      || success.first.receipt.restorationStatus !== 'restored') {
    throw new Error('Realm compensation success replay is invalid');
  }
  if (!same(success.eventTypes, ['compensation.admitted', 'compensation.resulted', 'compensation.receipted'])) {
    throw new Error('Realm compensation success event sequence is invalid');
  }
  verifyRealmEvidence(success.realm, 'Realm compensation success');
  for (const caseName of ['afterAdmission', 'afterEffect', 'afterResult']) {
    verifyRecoveryEvidence(value.cases[caseName], `Realm compensation ${caseName}`);
  }
  if (!same(value.assertions, {
    authorityExpansions: 0,
    automaticRollbackCalls: 0,
    compensationEventCount: 3,
    compensationRealmCounter: 0,
    compensationRealmInvocationCount: 2,
    credentialLeaks: 0,
    exactCompensationRetryStable: true,
    inverseRelation: true,
    knownCompletePrimaryRequired: true,
    providerCalls: 0,
    successfulRestoration: true,
  })) throw new Error('Realm compensation fixture assertions are invalid');
  assertNoCredentialFields(value.cases);
  digest(value.fixtureDigest, 'Realm compensation fixture');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('Realm compensation fixture digest mismatch');
  return value;
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyRealmCompensationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'Realm compensation receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('Realm compensation receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'Realm compensation receipt source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests).sort(), historicalReceiptPaths)) {
    throw new Error('Realm compensation receipt history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'Realm compensation implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'Realm compensation test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'Realm compensation specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'Realm compensation plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'Realm compensation receipt fixture');
  const fixture = verifyRealmCompensationFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('Realm compensation fixture binding is invalid');
  }
  if (value.fixture.value.sourceContract.fileSha256
      !== value.source.implementationManifest.entries.find(
        (entry) => entry.path === 'fixtures/realm-compensation-contract.json',
      )?.sha256
      || value.fixture.value.sourceConstitution.fileSha256
      !== value.source.implementationManifest.entries.find(
        (entry) => entry.path === 'dist/fixture-agent/agent-genome.json',
      )?.sha256) {
    throw new Error('Realm compensation source file binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('Realm compensation requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('Realm compensation review or proof limits are invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'Realm compensation receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('Realm compensation receipt digest mismatch');
  return value;
}

export async function buildRealmCompensationReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyRealmCompensationFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('Realm compensation fixture is not canonical');
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
  return Object.freeze(verifyRealmCompensationReceipt({
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
  const preliminary = await buildRealmCompensationReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildRealmCompensationReceiptFromSource({
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
  const markdown = `# Realm compensation v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the explicit local inverse-action boundary over a verified recoverable Realm consequence host, including exact relation binding, completed-primary eligibility, three-event recovery, idempotent reconciliation, and terminal replay. It does not certify automatic rollback, uncertain-primary compensation, arbitrary business undo, a live connector, remote exactly-once effects, default launch, Godskills, or Lunari integration.\n`;
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
