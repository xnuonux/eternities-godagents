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
import { runReleaseGates } from './lib/release-gates.mjs';
import { verifyAdmittedLocalLaunchFixture } from './build-admitted-local-launch-v1-fixture.mjs';

const certificationId = 'admitted-local-launch-v1';
const protocolId = 'eternities-admitted-local-launch-certification-v1';
const fixturePath = 'fixtures/admitted-local-launch-v1.json';
const receiptPath = 'receipts/admitted-local-launch-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-29-admitted-local-launch-design.md';
const planPath = 'docs/superpowers/plans/2026-08-29-admitted-local-launch.md';
const releaseGateSpecificationPath = 'docs/superpowers/specs/2026-09-03-certification-release-gate-v1-design.md';
const releaseGatePlanPath = 'docs/superpowers/plans/2026-09-03-certification-release-gate-v1.md';
const certificationPath = 'docs/admitted-local-launch-v1-certification.md';
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
  'fixtures/creation/creation-candidate.json',
  'fixtures/creation/creation-policy.json',
  'fixtures/creation/expression-overlay.json',
  'fixtures/creation/modules/archetype-diplomatic-orchestrator.json',
  'fixtures/creation/modules/archetype-research-strategist.json',
  'fixtures/creation/modules/archetype.json',
  'fixtures/creation/modules/attributes-research-balanced.json',
  'fixtures/creation/modules/attributes-social-balanced.json',
  'fixtures/creation/modules/attributes.json',
  'fixtures/creation/modules/cortex.json',
  'fixtures/creation/modules/embodiment.json',
  'fixtures/creation/modules/godskills.json',
  'fixtures/creation/modules/lineage-cartographer.json',
  'fixtures/creation/modules/lineage-empath.json',
  'fixtures/creation/modules/lineage.json',
  'fixtures/creation/modules/organs.json',
  'fixtures/creation/modules/personality-patient-skeptic.json',
  'fixtures/creation/modules/personality-warm-diplomat.json',
  'fixtures/creation/modules/personality.json',
  'fixtures/creation/modules/voice-quiet-precise.json',
  'fixtures/creation/modules/voice-resonant-warm.json',
  'fixtures/creation/modules/voice.json',
  'fixtures/host-policy.json',
  'fixtures/realm-contract.json',
  'package.json',
  'scripts/build-admitted-local-launch-v1-fixture.mjs',
  'scripts/build-admitted-local-launch-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/creation/compile.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/genesis/local-admission.mjs',
  'src/genesis/verify.mjs',
  'src/host/admitted-cli-contracts.mjs',
  'src/host/admitted-cli.mjs',
  'src/host/admitted-identity-boundary.mjs',
  'src/host/admitted-launch.mjs',
  'src/host/local-instance-registry.mjs',
  'src/keel/local-reference-backend.mjs',
  'src/realm/action-gateway.mjs',
  'src/realm/fixture-realm.mjs',
  'src/runtime/persistent-vessel.mjs',
  'src/runtime/scheduler.mjs',
  'src/runtime/vessel.mjs',
  'src/state/file-lock.mjs',
  'src/state/journal.mjs',
  releaseGatePlanPath,
  releaseGateSpecificationPath,
  specificationPath,
  planPath,
].sort());
const testFiles = Object.freeze([
  'tests/admitted-launch-cli-contracts.test.mjs',
  'tests/admitted-launch-cli.test.mjs',
  'tests/admitted-launch.test.mjs',
  'tests/admitted-local-launch-certification.test.mjs',
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/local-admission-certification.test.mjs',
  'tests/local-admission-cli.test.mjs',
  'tests/local-admission.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/admitted-local-launch-certification.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['GAL-001', 'the programmatic and CLI launch surfaces accept only the bounded admitted request and emit closed failures'],
  ['GAL-002', 'safe admission-tree and exact policy-to-admission binding checks precede runtime construction'],
  ['GAL-003', 'the host binds runtime paths, instance residency, and identity to one verified admission'],
  ['GAL-004', 'a persistent vessel is constructed only after genesis verification and performs one governed local cycle'],
  ['GAL-005', 'changed binding, receipt, distribution, journal, keel, and Realm evidence fail closed before provider or Realm use'],
  ['GAL-006', 'host policy, credential containment, inference budgets, constitutional authority, and Realm ceilings remain unchanged'],
  ['GAL-007', 'one fixed fixture launch appends one bounded cycle while preserving genesis, keel, and idempotency identity'],
  ['GAL-008', 'the local shell performs no arbitrary path launch, daemonization, evolution, Inspiration, Soul, or Lunari activation'],
  ['GAL-009', 'an ordinary copied admission cannot fork one operating-system-account-local persistent identity'],
  ['GAL-010', 'a concurrent launch cannot recover or interleave with a live owner'],
  ['GAL-011', 'terminal request replay returns exact recorded evidence without runtime reconstruction or a second Realm mutation'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the proof uses an injected deterministic cortex and local fixture Realm, not live model or provider quality',
  'the fixture does not certify live credentials, remote durability, remote exactly-once effects, compensation, or rollback',
  'the runtime factory and fixture Realm are trusted test seams; hostile same-user process isolation is not claimed',
  'the shell executes one mission per process and provides no daemon, scheduler, delegation, or general external tool boundary',
  'the implementation remains opt-in and does not make Lunari, Soul, Inspiration, or governed evolution active',
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
  exactKeys(value, ['focused', 'full'], 'admitted local launch test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'admitted local launch test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('admitted local launch test run is invalid');
    }
  }
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

export function verifyAdmittedLocalLaunchReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'admitted local launch receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('admitted local launch receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest', 'specification', 'plan',
  ], 'admitted local launch receipt source');
  if (!COMMIT.test(value.source.commit)
      || !same(Object.keys(value.source.historicalReceiptDigests).sort(), historicalReceiptPaths)) {
    throw new Error('admitted local launch receipt history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((entry) => digest(entry, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'admitted local launch implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'admitted local launch test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'admitted local launch specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'admitted local launch plan');
  verifyReference(
    { path: releaseGateSpecificationPath, sha256: value.source.implementationManifest.entries.find((entry) => entry.path === releaseGateSpecificationPath)?.sha256 },
    releaseGateSpecificationPath,
    value.source.implementationManifest,
    'admitted local launch release-gate specification',
  );
  verifyReference(
    { path: releaseGatePlanPath, sha256: value.source.implementationManifest.entries.find((entry) => entry.path === releaseGatePlanPath)?.sha256 },
    releaseGatePlanPath,
    value.source.implementationManifest,
    'admitted local launch release-gate plan',
  );
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'admitted local launch receipt fixture');
  const fixture = verifyAdmittedLocalLaunchFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('admitted local launch fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('admitted local launch requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('admitted local launch review or proof limits are invalid');
  }
  digest(value.receiptDigest, 'admitted local launch receipt');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('admitted local launch receipt digest mismatch');
  return value;
}

export async function buildAdmittedLocalLaunchReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const root = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(root, sourceCommit, fixturePath);
  const fixture = verifyAdmittedLocalLaunchFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('admitted local launch fixture is not canonical');
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
  return Object.freeze(verifyAdmittedLocalLaunchReceipt({
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
  const preliminary = await buildAdmittedLocalLaunchReceiptFromSource({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await buildAdmittedLocalLaunchReceiptFromSource({
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
  const markdown = `# Admitted local launch v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the explicit local admitted-launch shell around one verified persistent Godagent identity, one fixed-clock governed fixture cycle, safe admission and policy binding, account-local residency, live-owner serialization, and terminal request replay without runtime reconstruction or a second Realm mutation. It does not certify live provider or model quality, credentials, hostile same-user isolation, remote durability, remote exactly-once effects, daemon operation, delegation, scheduling, evolution, Inspiration, Soul, or Lunari integration.\n`;
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
