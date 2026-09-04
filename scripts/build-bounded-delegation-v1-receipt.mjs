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

const certificationId = 'bounded-delegation-lifecycle-v1';
const protocolId = 'eternities-bounded-delegation-certification-v1';
const fixturePath = 'fixtures/bounded-delegation-v1.json';
const receiptPath = 'receipts/bounded-delegation-lifecycle-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-04-bounded-delegation-lifecycle-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-04-bounded-delegation-lifecycle-v1.md';
const releaseGateSpecificationPath = 'docs/superpowers/specs/2026-09-03-certification-release-gate-v1-design.md';
const releaseGatePlanPath = 'docs/superpowers/plans/2026-09-03-certification-release-gate-v1.md';
const certificationPath = 'docs/bounded-delegation-lifecycle-v1-certification.md';
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
  'package.json',
  'schemas/bounded-delegation-admission.schema.json',
  'schemas/bounded-delegation-completion.schema.json',
  'schemas/bounded-delegation-event.schema.json',
  'schemas/bounded-delegation-input.schema.json',
  'schemas/bounded-delegation-state.schema.json',
  'schemas/bounded-delegation-worker-completion.schema.json',
  'schemas/bounded-delegation-worker-descriptor.schema.json',
  'schemas/bounded-delegation-worker-dispatch.schema.json',
  'scripts/build-bounded-delegation-fixture.mjs',
  'scripts/build-bounded-delegation-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/errors.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/bounded-delegation.mjs',
  'src/runtime/temporary-worker.mjs',
  'src/sdk/index.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
  'docs/superpowers/plans/2026-09-03-certification-release-gate-v1.md',
  'docs/superpowers/specs/2026-09-03-certification-release-gate-v1-design.md',
  planPath,
  specificationPath,
].sort());
const testFiles = Object.freeze([
  'tests/bounded-delegation-certification.test.mjs',
  'tests/bounded-delegation.test.mjs',
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
  'tests/temporary-worker-boundary.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/bounded-delegation-certification.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['BDL-001', 'admission binds one lead mission, one bounded authority projection, one to three worker assignments, and one aggregate budget'],
  ['BDL-002', 'each worker receives only a typed temporary envelope, exact assignment, and descriptor-bound dispatch'],
  ['BDL-003', 'worker outputs are report-only typed observations and cannot expand authority into Realm, identity, keel, memory, credentials, or nested delegation'],
  ['BDL-004', 'prepared work is reconciled before execution and pending work remains pending without guessed completion or redispatch'],
  ['BDL-005', 'worker completions are content-addressed artifacts and the journal binds admission, dispatch, artifact, event chain, and aggregate'],
  ['BDL-006', 'a process boundary after worker execution or before aggregate publication recovers deterministically without duplicate worker execution'],
  ['BDL-007', 'terminal replay returns the exact bounded result without another adapter call and descriptor drift fails closed'],
  ['BDL-008', 'the source-bound fixture, manifests, release gates, and historical receipt links preserve the certified provider-neutral boundary without default launch or Lunari wiring'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the certificate uses injected local adapters and does not establish live provider, model, child-process, or network quality',
  'the coordinator supports at most three independent report-only workers and does not certify quorum, nested delegation, scheduling, or distributed exactly-once execution',
  'the authority projection is limited to observe, propose, and analyze; no worker may perform Realm action, identity mutation, keel or memory ownership, evolution, or credential use',
  'durable local journal recovery does not establish hostile same-user process isolation, remote durability, or external effect compensation',
  'the opt-in SDK surface does not alter the default vessel, Godskills release, provider routing, Soul, Inspiration, Luna, Lunari, or phenomenological-core behavior',
  'bounded typed observations are not interpreted as constitutional decisions or evidence of sentience, product usability, or autonomous agent quality',
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
  exactKeys(value, ['focused', 'full'], 'bounded delegation test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'bounded delegation test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('bounded delegation test run is invalid');
    }
  }
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

function verifyBoundedDelegationFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'input', 'success', 'pending', 'recovery', 'assertions', 'fixtureDigest',
  ], 'bounded delegation fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-bounded-delegation-fixture-v1') {
    throw new Error('bounded delegation fixture identity is invalid');
  }
  try {
    assertSchema('bounded-delegation-input', value.input);
  } catch (error) {
    throw new Error('bounded delegation fixture input is invalid', { cause: error });
  }
  if (value.input.assignments.length > 3 || value.input.budget.maxCompletionTokens < 1) {
    throw new Error('bounded delegation fixture ceilings are invalid');
  }
  exactKeys(value.success, [
    'result', 'exactRetry', 'callsAfterFirst', 'callsAfterRetry', 'inspection', 'eventTypes', 'files',
  ], 'bounded delegation success');
  exactKeys(value.success.result, ['status', 'delegationId', 'aggregateDigest', 'workerIds', 'usage'], 'bounded delegation result');
  exactKeys(value.success.exactRetry, ['status', 'delegationId', 'aggregateDigest'], 'bounded delegation replay');
  digest(value.success.result.delegationId, 'bounded delegation id');
  digest(value.success.result.aggregateDigest, 'bounded delegation aggregate digest');
  if (value.success.result.status !== 'completed'
      || !same(value.success.result.workerIds, ['worker-a', 'worker-b'])
      || !same(value.success.exactRetry, {
        status: 'completed',
        delegationId: value.success.result.delegationId,
        aggregateDigest: value.success.result.aggregateDigest,
      })
      || !same(value.success.callsAfterFirst, {
        workerA: { reconcile: 1, execute: 1 },
        workerB: { reconcile: 1, execute: 1 },
      })
      || !same(value.success.callsAfterRetry, value.success.callsAfterFirst)
      || !same(value.success.eventTypes, [
        'delegation.admitted', 'worker.prepared', 'worker.committed',
        'worker.prepared', 'worker.committed', 'delegation.completed',
      ])) {
    throw new Error('bounded delegation success evidence is invalid');
  }
  exactKeys(value.pending, ['first', 'second', 'calls'], 'bounded delegation pending evidence');
  exactKeys(value.pending.first, ['status', 'pendingWorkerIds'], 'bounded delegation first pending result');
  exactKeys(value.pending.second, ['status', 'pendingWorkerIds'], 'bounded delegation second pending result');
  exactKeys(value.pending.calls, ['reconcile', 'execute'], 'bounded delegation pending calls');
  if (value.pending.first.status !== 'pending' || value.pending.second.status !== 'pending'
      || !same(value.pending.first.pendingWorkerIds, ['worker-a'])
      || !same(value.pending.second.pendingWorkerIds, ['worker-a'])
      || value.pending.calls.execute !== 0 || value.pending.calls.reconcile !== 2) {
    throw new Error('bounded delegation pending evidence is invalid');
  }
  exactKeys(value.recovery, ['failure', 'delegationId', 'recovered', 'calls'], 'bounded delegation recovery evidence');
  exactKeys(value.recovery.failure, ['name', 'message'], 'bounded delegation recovery failure');
  exactKeys(value.recovery.recovered, ['status', 'aggregateDigest', 'recovered'], 'bounded delegation recovered result');
  exactKeys(value.recovery.calls, ['reconcile', 'execute'], 'bounded delegation recovery calls');
  digest(value.recovery.delegationId, 'bounded delegation recovery id');
  digest(value.recovery.recovered.aggregateDigest, 'bounded delegation recovery aggregate digest');
  if (value.recovery.failure.name !== 'Error' || value.recovery.failure.message !== 'fixture worker boundary'
      || value.recovery.recovered.status !== 'completed' || value.recovery.recovered.recovered !== true
      || value.recovery.calls.execute !== 1 || value.recovery.calls.reconcile !== 2) {
    throw new Error('bounded delegation recovery evidence is invalid');
  }
  exactKeys(value.assertions, [
    'maximumWorkers', 'stableWorkerOrder', 'terminalReplayStable', 'terminalReplayNoAdapterCalls',
    'pendingNeverExecutes', 'recoveryNoRedispatch', 'recoveryCompleted', 'journalHasPreparedAndCommittedWorkers',
  ], 'bounded delegation fixture assertions');
  if (value.assertions.maximumWorkers !== 3
      || Object.entries(value.assertions).some(([key, assertion]) => key !== 'maximumWorkers' && assertion !== true)) {
    throw new Error('bounded delegation fixture assertions are not proven');
  }
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'bounded delegation fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('bounded delegation fixture digest mismatch');
  return value;
}

export function verifyBoundedDelegationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'bounded delegation receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('bounded delegation receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest', 'specification', 'plan',
  ], 'bounded delegation receipt source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests).sort(), historicalReceiptPaths)) {
    throw new Error('bounded delegation receipt history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'bounded delegation implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'bounded delegation test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'bounded delegation specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'bounded delegation plan');
  verifyReference(
    { path: releaseGateSpecificationPath, sha256: value.source.implementationManifest.entries.find((entry) => entry.path === releaseGateSpecificationPath)?.sha256 },
    releaseGateSpecificationPath,
    value.source.implementationManifest,
    'bounded delegation release-gate specification',
  );
  verifyReference(
    { path: releaseGatePlanPath, sha256: value.source.implementationManifest.entries.find((entry) => entry.path === releaseGatePlanPath)?.sha256 },
    releaseGatePlanPath,
    value.source.implementationManifest,
    'bounded delegation release-gate plan',
  );
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'bounded delegation receipt fixture');
  const fixture = verifyBoundedDelegationFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('bounded delegation fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('bounded delegation requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('bounded delegation review or proof limits are invalid');
  }
  digest(value.receiptDigest, 'bounded delegation receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('bounded delegation receipt digest mismatch');
  return value;
}

export async function buildBoundedDelegationReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyBoundedDelegationFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('bounded delegation fixture is not canonical');
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
  return Object.freeze(verifyBoundedDelegationReceipt({
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
  const preliminary = await buildBoundedDelegationReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildBoundedDelegationReceiptFromSource({
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
  const markdown = `# Bounded delegation lifecycle v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the opt-in provider-neutral bounded delegation lifecycle over one to three injected report-only worker adapters, including strict admission, typed dispatch, reconciliation-before-execution, pending preservation, content-addressed completion artifacts, crash recovery without redispatch, deterministic aggregate publication, terminal replay, descriptor pinning, and fail-closed authority boundaries. It does not certify live providers, child-process isolation, remote exactly-once execution, quorum, nested delegation, scheduling, default vessel wiring, Realm action, keel or memory ownership, evolution, Inspiration, Soul, Luna, or Lunari integration.\n`;
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
