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

const certificationId = 'recoverable-realm-consequence-vessel-v1';
const protocolId = 'eternities-recoverable-realm-consequence-vessel-certification-v1';
const fixturePath = 'fixtures/recoverable-realm-consequence-v1.json';
const receiptPath = 'receipts/recoverable-realm-consequence-vessel-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-04-realm-consequence-vessel-recovery-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-04-realm-consequence-vessel-recovery-v1.md';
const releaseGateSpecificationPath = 'docs/superpowers/specs/2026-09-03-certification-release-gate-v1-design.md';
const releaseGatePlanPath = 'docs/superpowers/plans/2026-09-03-certification-release-gate-v1.md';
const certificationPath = 'docs/recoverable-realm-consequence-vessel-v1-certification.md';
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
  'receipts/realm-action-adapter-v1.json',
  'receipts/realm-consequence-executor-v1.json',
  'receipts/realm-negotiation-v1.json',
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
  'dist/fixture-agent/agent-genome.json',
  planPath,
  specificationPath,
  'package.json',
  'schemas/action-receipt.schema.json',
  'schemas/agent-genome.schema.json',
  'schemas/decision-commit.schema.json',
  'schemas/organ-proposal.schema.json',
  'schemas/realm-contract.schema.json',
  'schemas/realm-negotiated-action.schema.json',
  'schemas/realm-negotiated-consequence.schema.json',
  'schemas/realm-negotiation.schema.json',
  'schemas/recoverable-realm-consequence-receipt.schema.json',
  'scripts/build-recoverable-realm-consequence-v1-fixture.mjs',
  'scripts/build-recoverable-realm-consequence-v1-receipt.mjs',
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
  'src/realm/negotiated-consequence-executor.mjs',
  'src/realm/negotiation.mjs',
  'src/realm/recoverable-consequence-host.mjs',
  'src/runtime/arbiter.mjs',
  'src/runtime/fixture-cortex.mjs',
  'src/state/file-lock.mjs',
  'src/state/journal.mjs',
  releaseGatePlanPath,
  releaseGateSpecificationPath,
].sort());
const testFiles = Object.freeze([
  'tests/action-awareness.test.mjs',
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/local-persistent-realm.test.mjs',
  'tests/realm-action-adapter-certification.test.mjs',
  'tests/realm-action-adapter.test.mjs',
  'tests/realm-consequence-executor-certification.test.mjs',
  'tests/realm-consequence-executor.test.mjs',
  'tests/realm-negotiation-certification.test.mjs',
  'tests/realm-negotiation.test.mjs',
  'tests/recoverable-realm-consequence-certification.test.mjs',
  'tests/recoverable-realm-consequence.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/recoverable-realm-consequence-certification.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['RRCV-001', 'effect-free validation precedes durable admission and any Realm method'],
  ['RRCV-002', 'one execution id owns a bounded canonical three-event admission, result, and receipt chain'],
  ['RRCV-003', 'recovery after admission resumes the exact consequence input'],
  ['RRCV-004', 'recovery after an external effect reuses the deterministic child idempotency and reconciliation path'],
  ['RRCV-005', 'recovery after result publication emits only the missing host receipt'],
  ['RRCV-006', 'terminal replay performs no Realm operation and returns stable consequence evidence'],
  ['RRCV-007', 'authority, credential, path, ordering, digest, size, and source mismatches fail closed'],
  ['RRCV-008', 'fixture, source closure, historical receipts, ledger, and release lineage are exact'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the fixture uses the local fixture Realm and does not certify a live external Realm or connector',
  'no credentials, remote durable storage, remote exactly-once effect, compensation, rollback, delegation, or scheduler is certified',
  'the seam remains opt-in and is not wired into default vessel launch or the portable SDK root',
  'no Godskills body or runtime change, keel, memory, identity, evolution, Inspiration, Soul, Luna, Lunari, or phenomenological-core authority is added',
  'deterministic recovery machinery does not establish live model quality, product usability, or sentience',
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
  exactKeys(value, ['focused', 'full'], 'recoverable consequence test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'recoverable consequence test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('recoverable consequence test run is invalid');
    }
  }
}

function verifyHostResult(value, input, label) {
  exactKeys(value, [
    'status', 'executionId', 'recovered', 'journalHeadDigest', 'consequence', 'receipt',
  ], label);
  if (value.status !== 'completed' || typeof value.recovered !== 'boolean') {
    throw new Error(`${label} status is invalid`);
  }
  digest(value.executionId, `${label} execution id`);
  digest(value.journalHeadDigest, `${label} journal head`);
  assertSchema('recoverable-realm-consequence-receipt', value.receipt);
  assertSchema('realm-negotiated-consequence', value.consequence.receipt);
  assertNoCredentialFields(value.consequence);
  if (value.executionId !== sha256Value({
    schemaVersion: 1,
    protocolId: 'eternities-recoverable-realm-consequence-v1',
    inputDigest: sha256Value(input),
  }) || value.receipt.inputDigest !== sha256Value(input)
      || value.receipt.executionId !== value.executionId
      || value.receipt.instanceId !== input.state.instanceId
      || value.receipt.missionId !== input.mission.missionId
      || value.receipt.stateEpoch !== input.state.epoch
      || value.receipt.consequenceDigest !== sha256Value(value.consequence)
      || value.receipt.consequenceReceiptDigest !== value.consequence.receipt.receiptDigest
      || value.receipt.actionReceiptDigest !== value.consequence.actionReceipt.receiptDigest
      || value.receipt.resultEventDigest === value.journalHeadDigest) {
    throw new Error(`${label} receipt binding is invalid`);
  }
  return value;
}

function verifyCase(value, input, label) {
  exactKeys(value, ['executionId', 'failure', 'recovered', 'eventTypes', 'realm'], label);
  digest(value.executionId, `${label} execution id`);
  exactKeys(value.failure, ['name', 'message'], `${label} failure`);
  if (value.failure.name !== 'Error' || typeof value.failure.message !== 'string') {
    throw new Error(`${label} failure is invalid`);
  }
  if (!same(value.eventTypes, ['consequence.admitted', 'consequence.resulted', 'consequence.receipted'])) {
    throw new Error(`${label} event sequence is invalid`);
  }
  verifyHostResult(value.recovered, input, `${label} recovery`);
  exactKeys(value.realm, [
    'callsBeforeRecovery', 'callsAfterRecovery', 'beforeRecovery', 'afterRecovery',
  ], `${label} realm evidence`);
  for (const calls of [value.realm.callsBeforeRecovery, value.realm.callsAfterRecovery]) {
    exactKeys(calls, ['observe', 'invoke', 'reconcile'], `${label} Realm calls`);
    for (const count of Object.values(calls)) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label} Realm call count is invalid`);
    }
  }
  for (const state of [value.realm.beforeRecovery, value.realm.afterRecovery]) {
    exactKeys(state, ['counter', 'invocationCount', 'reconciliationCount', 'idempotencyCount'], `${label} Realm state`);
    for (const count of Object.values(state)) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label} Realm state count is invalid`);
    }
  }
}

export function verifyRecoverableRealmConsequenceFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'sourceContract', 'sourceConstitution', 'cases', 'assertions',
    'fixtureDigest',
  ], 'recoverable consequence fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-recoverable-realm-consequence-fixture-v1') {
    throw new Error('recoverable consequence fixture identity is invalid');
  }
  for (const [key, path] of [
    ['sourceContract', 'fixtures/realm-contract.json'],
    ['sourceConstitution', 'dist/fixture-agent/agent-genome.json'],
  ]) {
    exactKeys(value[key], ['path', 'fileSha256', 'logicalDigest', 'value'], `recoverable consequence ${key}`);
    if (value[key].path !== path) throw new Error(`recoverable consequence ${key} path is invalid`);
    digest(value[key].fileSha256, `recoverable consequence ${key} file digest`);
    digest(value[key].logicalDigest, `recoverable consequence ${key} logical digest`);
  }
  if (value.sourceContract.logicalDigest !== sha256Value(value.sourceContract.value)
      || value.sourceConstitution.logicalDigest !== sha256Value(value.sourceConstitution.value)) {
    throw new Error('recoverable consequence source logical digest mismatch');
  }
  exactKeys(value.cases, ['input', 'primary', 'afterAdmission', 'afterEffect', 'afterResult'], 'recoverable consequence cases');
  exactKeys(value.cases.input, ['mission', 'proposal', 'contract', 'authority', 'constitution', 'state'], 'recoverable consequence input');
  assertSchema('organ-proposal', value.cases.input.proposal);
  assertSchema('realm-contract', value.cases.input.contract);
  assertNoCredentialFields(value.cases);
  exactKeys(value.cases.primary, ['first', 'exactRetry', 'eventTypes', 'realm'], 'recoverable consequence primary case');
  verifyHostResult(value.cases.primary.first, value.cases.input, 'recoverable consequence primary first');
  verifyHostResult(value.cases.primary.exactRetry, value.cases.input, 'recoverable consequence primary retry');
  if (!same(value.cases.primary.first.consequence, value.cases.primary.exactRetry.consequence)
      || !same(value.cases.primary.first.receipt, value.cases.primary.exactRetry.receipt)
      || value.cases.primary.first.recovered !== false
      || value.cases.primary.exactRetry.recovered !== true) {
    throw new Error('recoverable consequence terminal replay is not stable');
  }
  if (!same(value.cases.primary.eventTypes, ['consequence.admitted', 'consequence.resulted', 'consequence.receipted'])) {
    throw new Error('recoverable consequence primary event sequence is invalid');
  }
  exactKeys(value.cases.primary.realm, ['calls', 'state'], 'recoverable consequence primary Realm evidence');
  exactKeys(value.cases.primary.realm.calls, ['observe', 'invoke', 'reconcile'], 'recoverable consequence primary Realm calls');
  exactKeys(value.cases.primary.realm.state, ['counter', 'invocationCount', 'reconciliationCount', 'idempotencyCount'], 'recoverable consequence primary Realm state');
  for (const caseName of ['afterAdmission', 'afterEffect', 'afterResult']) {
    verifyCase(value.cases[caseName], value.cases.input, `recoverable consequence ${caseName}`);
  }
  if (!same(value.assertions, {
    admissionEventCount: 4,
    authorityExpansions: 0,
    credentialLeaks: 0,
    operationCount: 4,
    postEffectMutationCount: 1,
    postEffectReconciliationCount: 1,
    postResultRecoveryCalls: 0,
    providerCalls: 0,
    realmMutations: 4,
    receiptEventCount: 4,
    resultEventCount: 4,
    rollbackCalls: 0,
    terminalReplayStable: true,
  })) throw new Error('recoverable consequence fixture assertions are invalid');
  digest(value.fixtureDigest, 'recoverable consequence fixture');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('recoverable consequence fixture digest mismatch');
  return value;
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyRecoverableRealmConsequenceReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'recoverable consequence receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('recoverable consequence receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest', 'specification', 'plan',
  ], 'recoverable consequence receipt source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests).sort(), historicalReceiptPaths)) {
    throw new Error('recoverable consequence receipt history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'recoverable consequence implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'recoverable consequence test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'recoverable consequence specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'recoverable consequence plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'recoverable consequence receipt fixture');
  const fixture = verifyRecoverableRealmConsequenceFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('recoverable consequence fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('recoverable consequence requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('recoverable consequence review or proof limits are invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  digest(receiptDigest, 'recoverable consequence receipt');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('recoverable consequence receipt digest mismatch');
  return value;
}

export async function buildRecoverableRealmConsequenceReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyRecoverableRealmConsequenceFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('recoverable consequence fixture is not canonical');
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
  return Object.freeze(verifyRecoverableRealmConsequenceReceipt({
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
  const preliminary = await buildRecoverableRealmConsequenceReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildRecoverableRealmConsequenceReceiptFromSource({
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
  const markdown = `# Recoverable Realm consequence vessel v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the explicit local durable host seam around the verified Realm consequence executor, including admission, recovery after the meaningful local process boundaries, child idempotency and reconciliation, and terminal replay. It does not certify default vessel adoption, a live external Realm, credentials, remote exactly-once effects, rollback, delegation, scheduling, Godskills integration, or Luna integration.\n`;
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
