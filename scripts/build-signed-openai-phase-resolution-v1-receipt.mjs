import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicSignedPhaseResolutionHostFixture } from '../tests/helpers/openai-compatible-phase-resolution-host-fixture.mjs';
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

export { buildDeterministicSignedPhaseResolutionHostFixture };

const certificationId = 'signed-openai-phase-resolution-v1';
const protocolId = 'eternities-signed-openai-phase-resolution-certification-v1';
const fixturePath = 'fixtures/signed-openai-phase-resolution-v1.json';
const receiptPath = 'receipts/signed-openai-phase-resolution-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-signed-openai-phase-resolution-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-signed-openai-phase-resolution-v1.md';
const certificationPath = 'docs/signed-openai-phase-resolution-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/admitted-sealed-identity-host-v1.json',
  'receipts/codex-bound-turn-v1.json',
  'receipts/codex-recoverable-turn-coordinator-v1.json',
  'receipts/codex-recoverable-turn-journal-v1.json',
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/deferred-godskills-review-executor-v1.json',
  'receipts/deferred-godskills-review-materializer-v1.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-specialist-preference-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/identity-bound-mission-vessel-v1.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/recoverable-godskills-admission-v1.json',
  'receipts/recoverable-mission-native-executor-v1.json',
  'receipts/recoverable-mission-revision-executor-v1.json',
  'receipts/resumable-mission-review-kernel-v1.json',
  'receipts/routing-evidence-activation-classifier-v1.json',
  'receipts/sealed-local-godskills-transport-v1.json',
  'receipts/sealed-local-identity-vessel-v1.json',
  'receipts/sealed-openai-compatible-phase-transport-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'schemas/openai-compatible-phase-resolution-policy.schema.json',
  'schemas/openai-compatible-phase-transport-policy.schema.json',
  'scripts/build-signed-openai-phase-resolution-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/errors.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/http-transport.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/genesis/verify.mjs',
  'src/host/admitted-identity-boundary.mjs',
  'src/host/admitted-sealed-identity-launch.mjs',
  'src/host/identity-policy.mjs',
  'src/host/local-instance-registry.mjs',
  'src/keel/local-reference-backend.mjs',
  'src/runtime/identity-bound-mission-vessel-contracts.mjs',
  'src/runtime/identity-bound-mission-vessel.mjs',
  'src/runtime/identity-bound-native-contracts.mjs',
  'src/runtime/identity-bound-native-transport.mjs',
  'src/runtime/mission-native-executor.mjs',
  'src/runtime/mission-native-materializer.mjs',
  'src/runtime/mission-native-transport-contracts.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/runtime/mission-review-journal.mjs',
  'src/runtime/mission-review-kernel.mjs',
  'src/runtime/mission-revision-executor.mjs',
  'src/runtime/mission-revision-materializer.mjs',
  'src/runtime/mission-revision-transport-contracts.mjs',
  'src/runtime/sealed-local-identity-bound-mission-vessel.mjs',
  'src/skills/deferred-review-executor.mjs',
  'src/skills/deferred-review-materializer.mjs',
  'src/skills/local-recoverable-godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-process-transport.mjs',
  'src/skills/recoverable-godskills-contracts.mjs',
  'src/skills/review-transport-contracts.mjs',
  'src/skills/routing-evidence-activation-classifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
  'src/transports/openai-compatible-phase-policy.mjs',
  'src/transports/openai-compatible-phase-protocol.mjs',
  'src/transports/openai-compatible-phase-resolution.mjs',
  'src/transports/openai-compatible-phase-transport.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/admitted-sealed-identity-launch.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/mission-review-fixture.mjs',
  'tests/helpers/openai-compatible-phase-operation-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/helpers/openai-compatible-phase-resolution-fixture.mjs',
  'tests/helpers/openai-compatible-phase-resolution-host-fixture.mjs',
  'tests/openai-compatible-admitted-host-integration.test.mjs',
  'tests/openai-compatible-phase-policy.test.mjs',
  'tests/openai-compatible-phase-resolution-certification.test.mjs',
  'tests/openai-compatible-phase-resolution-host-integration.test.mjs',
  'tests/openai-compatible-phase-resolution-policy.test.mjs',
  'tests/openai-compatible-phase-resolution.test.mjs',
  'tests/openai-compatible-phase-transport.test.mjs',
  'tests/release-lineage.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/openai-compatible-phase-resolution-policy.test.mjs',
  'tests/openai-compatible-phase-resolution.test.mjs',
  'tests/openai-compatible-phase-resolution-host-integration.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'SOR-001': ['canonical externally pinned resolution policy binds the exact transport policy and one Ed25519 authority'],
  'SOR-002': ['malformed noncanonical downgraded stale over-broad and mismatched policies fail closed'],
  'SOR-003': ['signed decisions bind exact operation disposition lifetime nonce and response witness'],
  'SOR-004': ['invalid wrong-key expired future overlong changed and cross-operation decisions fail before mutation'],
  'SOR-005': ['only a genuinely pending attempted operation can enter resolution'],
  'SOR-006': ['response adoption reuses strict phase completion verification with zero network calls'],
  'SOR-007': ['abandonment publishes one sanitized operator-abandoned failure and no model artifact'],
  'SOR-008': ['resolution records contain no raw request response credential endpoint model output Realm or continuity content'],
  'SOR-009': ['post-resolution interruption recovers exact abandonment and exact response adoption'],
  'SOR-010': ['accepted decisions recover after expiry while unaccepted expired decisions do not mutate state'],
  'SOR-011': ['concurrent and changed resolutions produce one terminal outcome or a collision'],
  'SOR-012': ['malformed unknown junctioned contradictory and terminal operation state fails closed'],
  'SOR-013': ['native review and revision adoption preserve their existing phase contracts'],
  'SOR-014': ['ordinary execute and reconcile surfaces remain resolution-free and never retry implicitly'],
  'SOR-015': ['the admitted host adopts one ambiguous native response and finishes review without native redispatch'],
  'SOR-016': ['deterministic fixture receipt ledger and release lineage reproduce exactly'],
});

const retainedRegressions = Object.freeze([
  'rejects resolution policy pin and transport-policy drift before operation inspection',
  'accepts only canonical Ed25519 public keys and exact authority identifiers',
  'rejects invalid future expired overlong tampered and cross-operation signatures',
  'binds adopted response status content type byte count body digest and witness digest',
  'forbids response evidence on abandonment and requires it on adoption',
  'closes abandonment without another provider call or model artifact',
  'adopts a recovered response through the ordinary trusted completion contract',
  'recovers an accepted resolution after interruption and signature expiry',
  'requires exact response bytes to finish an interrupted adoption',
  'mutates no resolution state for expired decisions or invalid provider output',
  'rejects a coherently rehashed but incorrectly signed resolution record',
  'enforces the narrower signed-resolution response ceiling',
  'preserves native review and revision completion bindings',
  'allows at most one changed concurrent operator outcome',
  'rejects unknown entries and junctioned operation slots through a stable error',
  'keeps operator resolution absent from ordinary phase adapter surfaces',
  'completes the admitted reviewed host with exactly one ambiguous native call',
  'preserves all sealed transport provider policy and admitted host tests',
]);

const proofLimits = Object.freeze([
  'deterministic-fake-provider-only',
  'external-operator-evidence-truth-is-not-proven',
  'no-automatic-or-operator-authorized-retry',
  'no-provider-dashboard-query-or-provider-specific-retrieval',
  'strict-json-schema-compatible-models-only',
  'local-resolution-not-remote-exactly-once',
  'trusted-local-policy-path-external-pin-and-private-key-holder',
  'no-live-quality-latency-cost-or-provider-equivalence-qualification',
  'no-cli-or-default-launcher-migration',
  'no-hostile-same-user-operating-system-isolation',
  'no-realm-action-continuity-keel-evolution-lunari-inspiration-or-soul-authority',
  'no-independent-review',
]);

const expectedAssertions = Object.freeze({
  ambiguousNativeObserved: true,
  signedResolutionAccepted: true,
  nativeResponseAdoptedWithoutRedispatch: true,
  exactReviewedPhaseOrder: true,
  finalReviewAccepted: true,
  exactTerminalReplay: true,
  replayExternalCalls: 0,
  resolutionBodyAbsent: true,
  secretLeaks: 0,
  noRealmAuthorityExpansion: true,
});

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!sameArray(value.paths, paths) || !Array.isArray(value.entries) || value.entries.length !== paths.length) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== paths[index] || !DIGEST.test(entry.sha256)
        || !Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry is invalid`);
  });
  requireDigest(value.digest, `${label} digest`);
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function validateTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'certification test runs');
  for (const [name, run] of Object.entries(value)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
  }
}

function verifyGodskills(value) {
  exactKeys(value, ['commit', 'releaseDigest', 'routingTrustRootDigest', 'activationTrustRootDigest'], 'fixture Godskills');
  if (!COMMIT.test(value.commit)) throw new Error('fixture Godskills commit is invalid');
  for (const key of ['releaseDigest', 'routingTrustRootDigest', 'activationTrustRootDigest']) {
    requireDigest(value[key], `fixture Godskills ${key}`);
  }
}

function verifyFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'providerPolicyDigest',
    'resolutionPolicyDigest', 'identityPolicyDigest', 'resolution',
    'execution', 'recovery', 'assertions', 'fixtureDigest',
  ], 'signed phase resolution host fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-signed-openai-phase-resolution-host-fixture-v1') {
    throw new Error('signed phase resolution host fixture identity is invalid');
  }
  verifyGodskills(value.godskills);
  for (const [name, digest] of [
    ['provider policy', value.providerPolicyDigest],
    ['resolution policy', value.resolutionPolicyDigest],
    ['identity policy', value.identityPolicyDigest],
  ]) requireDigest(digest, `fixture ${name}`);
  exactKeys(value.resolution, [
    'decisionDigest', 'responseWitnessDigest', 'resolutionRecordDigest',
  ], 'fixture resolution');
  Object.values(value.resolution).forEach((digest) => requireDigest(digest, 'fixture resolution'));
  exactKeys(value.execution, [
    'phaseOrder', 'missionCompletionReceiptDigest', 'vesselCompletionReceiptDigest',
  ], 'fixture execution');
  if (!sameArray(value.execution.phaseOrder, ['native', 'review', 'revision', 'review'])) {
    throw new Error('fixture phase order is invalid');
  }
  requireDigest(value.execution.missionCompletionReceiptDigest, 'fixture mission completion');
  requireDigest(value.execution.vesselCompletionReceiptDigest, 'fixture vessel completion');
  const expectedRecovery = {
    providerCalls: 4,
    nativeProviderCalls: 1,
    routeLaunches: 1,
    activationLaunches: 1,
  };
  if (canonicalJson(value.recovery) !== canonicalJson(expectedRecovery)
      || canonicalJson(value.assertions) !== canonicalJson(expectedAssertions)) {
    throw new Error('fixture recovery or assertions are invalid');
  }
  requireDigest(value.fixtureDigest, 'signed phase resolution host fixture');
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (sha256Value(unsigned) !== value.fixtureDigest) throw new Error('fixture digest mismatch');
  return value;
}

function expectedMetrics(fixture) {
  return {
    providerCalls: fixture.recovery.providerCalls,
    nativeProviderCalls: fixture.recovery.nativeProviderCalls,
    routeLaunches: fixture.recovery.routeLaunches,
    activationLaunches: fixture.recovery.activationLaunches,
    replayExternalCalls: fixture.assertions.replayExternalCalls,
    secretLeaks: fixture.assertions.secretLeaks,
    authorityExpansions: fixture.assertions.noRealmAuthorityExpansion ? 0 : 1,
    retainedInlineRegressions: retainedRegressions.length,
  };
}

export function verifySignedOpenAIPhaseResolutionReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source',
    'godskills', 'fixture', 'requirements', 'metrics', 'proofLimits',
    'testRuns', 'review', 'receiptDigest',
  ], 'signed OpenAI phase resolution receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('signed OpenAI phase resolution receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'certification source');
  if (!COMMIT.test(value.source.commit)
      || canonicalJson(Object.keys(value.source.historicalReceiptDigests))
        !== canonicalJson(historicalReceiptPaths)) {
    throw new Error('certification source history is invalid');
  }
  Object.values(value.source.historicalReceiptDigests)
    .forEach((digest) => requireDigest(digest, 'historical receipt'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  for (const [name, artifact, path] of [
    ['specification', value.source.specification, specificationPath],
    ['plan', value.source.plan, planPath],
  ]) {
    exactKeys(artifact, ['path', 'sha256'], `source ${name}`);
    if (artifact.path !== path) throw new Error(`source ${name} path mismatch`);
    requireDigest(artifact.sha256, `source ${name}`);
  }
  verifyGodskills(value.godskills);
  exactKeys(value.fixture, [
    'schemaVersion', 'protocolId', 'path', 'fileSha256', 'logicalDigest',
    'providerPolicyDigest', 'resolutionPolicyDigest', 'identityPolicyDigest',
    'resolution', 'execution', 'recovery', 'assertions',
  ], 'certification fixture');
  if (value.fixture.path !== fixturePath) throw new Error('fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'fixture file');
  requireDigest(value.fixture.logicalDigest, 'fixture logical');
  const fixture = verifyFixture({
    schemaVersion: value.fixture.schemaVersion,
    protocolId: value.fixture.protocolId,
    godskills: structuredClone(value.godskills),
    providerPolicyDigest: value.fixture.providerPolicyDigest,
    resolutionPolicyDigest: value.fixture.resolutionPolicyDigest,
    identityPolicyDigest: value.fixture.identityPolicyDigest,
    resolution: structuredClone(value.fixture.resolution),
    execution: structuredClone(value.fixture.execution),
    recovery: structuredClone(value.fixture.recovery),
    assertions: structuredClone(value.fixture.assertions),
    fixtureDigest: value.fixture.logicalDigest,
  });
  if (!Array.isArray(value.requirements)
      || !sameArray(value.requirements.map(({ id }) => id), Object.keys(requirementEvidence))) {
    throw new Error('certification requirements are invalid');
  }
  value.requirements.forEach((row) => {
    exactKeys(row, ['id', 'status', 'evidence'], `requirement ${row.id}`);
    if (row.status !== 'pass' || !sameArray(row.evidence, requirementEvidence[row.id])) {
      throw new Error(`requirement ${row.id} evidence mismatch`);
    }
  });
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics(fixture))) {
    throw new Error('certification metrics are invalid');
  }
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('certification proof limits mismatch');
  validateTestRuns(value.testRuns);
  exactKeys(value.review, [
    'mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions',
  ], 'certification review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'certification receipt');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('certification receipt digest mismatch');
  return value;
}

export async function rebuildSignedOpenAIPhaseResolutionReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(repositoryRoot, sourceCommit, historicalReceiptPaths),
      implementationManifest: await manifestAtCommit(repositoryRoot, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(repositoryRoot, sourceCommit, testFiles),
      specification: {
        path: specificationPath,
        sha256: sha256Text(await gitText(repositoryRoot, sourceCommit, specificationPath)),
      },
      plan: {
        path: planPath,
        sha256: sha256Text(await gitText(repositoryRoot, sourceCommit, planPath)),
      },
    },
    godskills: structuredClone(fixture.godskills),
    fixture: {
      schemaVersion: fixture.schemaVersion,
      protocolId: fixture.protocolId,
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      providerPolicyDigest: fixture.providerPolicyDigest,
      resolutionPolicyDigest: fixture.resolutionPolicyDigest,
      identityPolicyDigest: fixture.identityPolicyDigest,
      resolution: structuredClone(fixture.resolution),
      execution: structuredClone(fixture.execution),
      recovery: structuredClone(fixture.recovery),
      assertions: structuredClone(fixture.assertions),
    },
    requirements: Object.entries(requirementEvidence).map(([id, evidence]) => ({
      id,
      status: 'pass',
      evidence: [...evidence],
    })),
    metrics: expectedMetrics(fixture),
    proofLimits: [...proofLimits],
    testRuns: structuredClone(testRuns),
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [...retainedRegressions],
    },
  };
  return Object.freeze(verifySignedOpenAIPhaseResolutionReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicSignedPhaseResolutionHostFixture();
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({
      status: 'written', destination, fixtureDigest: fixture.fixtureDigest,
    })}\n`);
    return;
  }
  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({
    root,
    headCommit: head,
    outputPath,
    releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildSignedOpenAIPhaseResolutionReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildSignedOpenAIPhaseResolutionReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/openai-compatible-phase-resolution-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    testRuns: receipt.testRuns,
    release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
