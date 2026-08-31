import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicRecoverableGodskillsAdmissionFixture as buildFixture } from '../tests/helpers/recoverable-godskills-admission-certification-fixture.mjs';
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

const certificationId = 'recoverable-godskills-admission-v1';
const protocolId = 'eternities-recoverable-godskills-admission-certification-v1';
const fixturePath = 'fixtures/recoverable-godskills-admission-v1.json';
const receiptPath = 'receipts/recoverable-godskills-admission-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-recoverable-godskills-admission-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-recoverable-godskills-admission-v1.md';
const certificationPath = 'docs/recoverable-godskills-admission-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const historicalReceiptPaths = Object.freeze([
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
  'receipts/recoverable-mission-native-executor-v1.json',
  'receipts/recoverable-mission-revision-executor-v1.json',
  'receipts/resumable-mission-review-kernel-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'schemas/recoverable-godskills-binding-intent.schema.json',
  'schemas/recoverable-godskills-binding-record.schema.json',
  'schemas/recoverable-godskills-completion.schema.json',
  'schemas/recoverable-godskills-dispatch.schema.json',
  'schemas/recoverable-godskills-pending.schema.json',
  'schemas/recoverable-godskills-transport-descriptor.schema.json',
  'scripts/build-recoverable-godskills-admission-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/binding-compiler.mjs',
  'src/cortex/receipt-safety.mjs',
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
  'src/skills/activation-adapter.mjs',
  'src/skills/deferred-review-executor.mjs',
  'src/skills/deferred-review-materializer.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/recoverable-godskills-adapter.mjs',
  'src/skills/recoverable-godskills-contracts.mjs',
  'src/skills/recoverable-godskills-outbox.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/review-transport-contracts.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/cortex-binding-compiler.test.mjs',
  'tests/deferred-godskills-review-executor.test.mjs',
  'tests/godskills-adaptive-activation.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/mission-review-fixture.mjs',
  'tests/helpers/recoverable-godskills-admission-certification-fixture.mjs',
  'tests/identity-bound-mission-vessel-certification.test.mjs',
  'tests/identity-bound-mission-vessel-godskills-integration.test.mjs',
  'tests/identity-bound-mission-vessel.test.mjs',
  'tests/identity-bound-native-transport.test.mjs',
  'tests/mission-native-executor.test.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-journal.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/mission-revision-executor.test.mjs',
  'tests/recoverable-godskills-adapter.test.mjs',
  'tests/recoverable-godskills-admission-certification.test.mjs',
  'tests/recoverable-godskills-admission-integration.test.mjs',
  'tests/recoverable-godskills-outbox.test.mjs',
  'tests/recoverable-godskills-vessel-integration.test.mjs',
  'tests/recoverable-identity-bound-mission-vessel-integration.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/cortex-binding-compiler.test.mjs',
  'tests/deferred-godskills-review-executor.test.mjs',
  'tests/godskills-adaptive-activation.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/identity-bound-mission-vessel-godskills-integration.test.mjs',
  'tests/identity-bound-mission-vessel.test.mjs',
  'tests/identity-bound-native-transport.test.mjs',
  'tests/mission-native-executor.test.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-journal.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/mission-revision-executor.test.mjs',
  'tests/recoverable-godskills-adapter.test.mjs',
  'tests/recoverable-godskills-admission-integration.test.mjs',
  'tests/recoverable-godskills-outbox.test.mjs',
  'tests/recoverable-godskills-vessel-integration.test.mjs',
  'tests/recoverable-identity-bound-mission-vessel-integration.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'RGA-001': ['one mission id publishes one immutable complete Godskills binding intent before external work'],
  'RGA-002': ['changed binding input or release collides and fails before any transport call'],
  'RGA-003': ['route and activation dispatches bind exact requests stages descriptors ceilings and empty authority'],
  'RGA-004': ['every possible external execution follows exact absent reconciliation'],
  'RGA-005': ['pending completed and ambiguous states cannot cause duplicate execution'],
  'RGA-006': ['route completion recovers across process death without rerouting'],
  'RGA-007': ['activation completion recovers across process death without reactivation'],
  'RGA-008': ['classification drift after interrupted activation fails before external work'],
  'RGA-009': ['final binding publishes once and exact replay performs no routing classification or activation'],
  'RGA-010': ['the pinned Godskills adapter validates every recovered route and activation result'],
  'RGA-011': ['pending admission returns without vessel publication or native dispatch'],
  'RGA-012': ['credentials provider routing Realm continuity keel identity evolution Inspiration and Soul authority remain absent'],
  'RGA-013': ['identity-bound vessel recovery completes from the same binding without duplicate external work'],
  'RGA-014': ['deterministic fixtures full tests append-only ledger and release lineage remain release gates'],
});

const retainedRegressions = Object.freeze([
  'strict credential-free transport descriptor dispatch completion intent record and pending schemas',
  'generic request and result bodies reject credential-shaped fields',
  'operation identities bind protocol stage request identity request digest and transport descriptor',
  'changed descriptor request result time byte and stage data fail closed',
  'every possible execution follows exact absent reconciliation',
  'pending completed and ambiguous reconciliation cannot execute',
  'route process death recovers without another route execution',
  'activation process death recovers without another activation execution',
  'classification drift collides with the immutable activation request',
  'one mission id publishes one immutable binding intent before external work',
  'changed mission input or release fails before transport use',
  'one final binding record is immutable and digest verified',
  'exact final replay bypasses routing classification and activation',
  'recovery uses the pinned Godskills release and existing semantic validators',
  'pending Godskills admission publishes no vessel and dispatches no native cognition',
  'identity candidate and model projection remain derived from admitted genesis',
  'exact identity dispatch recovers after native process death without redispatch',
  'review mode carries no selected body before native inference',
  'real deferred review revision and final review remain ordered',
  'terminal vessel replay performs zero external calls',
  'no-qualified routing remains native-only',
  'needs-decision performs no native dispatch',
  'identity release projection artifact usage time byte and authority drift fail closed',
  'Realm continuity personal-keel identity evolution Inspiration and Soul authority remain absent',
]);

const proofLimits = Object.freeze([
  'no-live-model-provider-routing-or-activation-quality-qualification',
  'trusted-transport-terminal-lookup-and-atomic-deduplication-remain-assumptions',
  'no-hostile-same-user-filesystem-or-transport-isolation',
  'no-concrete-openai-anthropic-codex-claude-local-or-mcp-adapter',
  'no-provider-credential-or-model-routing-implementation',
  'no-realm-action-compensation-or-rollback',
  'no-continuity-admission-or-personal-keel-write',
  'no-lunari-inspiration-or-soul-activation',
  'no-cli-or-codex-desktop-integration',
  'no-independent-review',
  'release-digest-remains-bound-to-the-local-configured-repository-root',
]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`);
  }
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} digest is invalid`);
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} is invalid`);
}

function validateManifest(value, expectedPaths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!sameArray(value.paths, expectedPaths) || !Array.isArray(value.entries)
      || value.entries.length !== expectedPaths.length) throw new Error(`${label} paths are invalid`);
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== expectedPaths[index]) throw new Error(`${label} entry order is invalid`);
    requireDigest(entry.sha256, `${label} entry`);
    requireInteger(entry.bytes, `${label} entry bytes`, 1);
  });
  requireDigest(value.digest, label);
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function validateTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'test runs');
  for (const [name, run] of Object.entries(value)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass') throw new Error(`${name} test run did not pass`);
    requireInteger(run.tests, `${name} test count`, 1);
  }
  if (value.full.tests < value.focused.tests) throw new Error('full test count is narrower than focused tests');
}

function validateCalls(value, expected, label) {
  exactKeys(value, ['descriptors', 'reconciliations', 'executions'], label);
  for (const [key, count] of Object.entries(expected)) {
    if (value[key] !== count) throw new Error(`${label} ${key} changed`);
  }
}

function validateAssertions(value, label) {
  const expected = {
    routeProcessDeathObserved: true,
    routeRecoveredWithoutReexecution: true,
    activationProcessDeathObserved: true,
    activationRecoveredWithoutReexecution: true,
    nativeProcessDeathObserved: true,
    nativeRecoveredWithoutReexecution: true,
    exactIdentityDispatchReproduced: true,
    actualGodskillsReviewMode: true,
    deferredReviewBodyFreeBeforeInference: true,
    finalReviewAccepted: true,
    exactTerminalReplay: true,
    replayExternalCalls: 0,
    authorityExpansions: 0,
    realmEffects: 0,
  };
  exactKeys(value, Object.keys(expected), label);
  if (canonicalJson(value) !== canonicalJson(expected)) throw new Error(`${label} failed`);
}

function validateFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'routeRecovery',
    'vesselRecovery', 'assertions', 'fixtureDigest',
  ], 'recoverable Godskills fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-recoverable-godskills-admission-fixture-v1') {
    throw new Error('recoverable Godskills fixture identity mismatch');
  }
  exactKeys(value.godskills, ['commit', 'releaseDigest', 'activationTrustRootDigest', 'capability'], 'fixture Godskills');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('fixture Godskills commit is invalid');
  requireDigest(value.godskills.releaseDigest, 'fixture Godskills release');
  requireDigest(value.godskills.activationTrustRootDigest, 'fixture activation root');
  exactKeys(value.godskills.capability, ['id', 'entrypointSha256', 'contractSha256'], 'fixture capability');
  if (value.godskills.capability.id !== 'eternities-aegis') throw new Error('fixture capability changed');
  requireDigest(value.godskills.capability.entrypointSha256, 'fixture capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'fixture capability contract');

  exactKeys(value.routeRecovery, [
    'dispatchDigest', 'completionDigest', 'routeCalls', 'activationCalls',
    'classifications', 'bindingDigest',
  ], 'fixture route recovery');
  for (const key of ['dispatchDigest', 'completionDigest', 'bindingDigest']) {
    requireDigest(value.routeRecovery[key], `fixture route ${key}`);
  }
  validateCalls(value.routeRecovery.routeCalls, { descriptors: 2, reconciliations: 2, executions: 1 }, 'fixture route calls');
  validateCalls(value.routeRecovery.activationCalls, { descriptors: 2, reconciliations: 1, executions: 1 }, 'fixture route-window activation calls');
  if (value.routeRecovery.classifications !== 1) throw new Error('fixture route classifications changed');

  exactKeys(value.vesselRecovery, [
    'routeDispatchDigest', 'activationDispatchDigest', 'activationCompletionDigest',
    'identityDispatchDigest', 'identityModelProjectionDigest', 'vesselCompletionReceiptDigest',
    'missionCompletionReceiptDigest', 'routeCalls', 'activationCalls', 'nativeCalls',
    'reviewCalls', 'revisionCalls', 'classifications',
  ], 'fixture vessel recovery');
  for (const key of [
    'routeDispatchDigest', 'activationDispatchDigest', 'activationCompletionDigest',
    'identityDispatchDigest', 'identityModelProjectionDigest', 'vesselCompletionReceiptDigest',
    'missionCompletionReceiptDigest',
  ]) requireDigest(value.vesselRecovery[key], `fixture vessel ${key}`);
  validateCalls(value.vesselRecovery.routeCalls, { descriptors: 3, reconciliations: 1, executions: 1 }, 'fixture vessel route calls');
  validateCalls(value.vesselRecovery.activationCalls, { descriptors: 3, reconciliations: 2, executions: 1 }, 'fixture vessel activation calls');
  validateCalls(value.vesselRecovery.nativeCalls, { descriptors: 3, reconciliations: 2, executions: 1 }, 'fixture vessel native calls');
  validateCalls(value.vesselRecovery.reviewCalls, { descriptors: 2, reconciliations: 2, executions: 2 }, 'fixture vessel review calls');
  validateCalls(value.vesselRecovery.revisionCalls, { descriptors: 2, reconciliations: 1, executions: 1 }, 'fixture vessel revision calls');
  if (value.vesselRecovery.classifications !== 2) throw new Error('fixture vessel classifications changed');
  validateAssertions(value.assertions, 'fixture assertions');
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('fixture digest mismatch');
  return value;
}

function sourceBoundary(sourceText) {
  const imports = [...sourceText.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1].toLowerCase());
  const count = (pattern) => imports.filter((value) => pattern.test(value)).length;
  return {
    credentialImports: count(/credential|secret/),
    networkImports: count(/^node:(http|https|net|tls)$|undici|websocket/),
    providerImports: count(/provider/),
    realmImports: count(/realm/),
    continuityWriterImports: count(/continuity|keel.*backend/),
  };
}

function validateSourceBoundary(value) {
  exactKeys(value, [
    'credentialImports', 'networkImports', 'providerImports', 'realmImports',
    'continuityWriterImports',
  ], 'source boundary');
  if (Object.values(value).some((count) => count !== 0)) throw new Error('source boundary widened');
}

function expectedMetrics(fixture) {
  return {
    routeWindowReconciliations: fixture.routeRecovery.routeCalls.reconciliations,
    routeWindowExecutions: fixture.routeRecovery.routeCalls.executions,
    routeWindowActivationExecutions: fixture.routeRecovery.activationCalls.executions,
    routeWindowClassifications: fixture.routeRecovery.classifications,
    vesselRouteExecutions: fixture.vesselRecovery.routeCalls.executions,
    vesselActivationReconciliations: fixture.vesselRecovery.activationCalls.reconciliations,
    vesselActivationExecutions: fixture.vesselRecovery.activationCalls.executions,
    nativeReconciliations: fixture.vesselRecovery.nativeCalls.reconciliations,
    nativeExecutions: fixture.vesselRecovery.nativeCalls.executions,
    reviewExecutions: fixture.vesselRecovery.reviewCalls.executions,
    revisionExecutions: fixture.vesselRecovery.revisionCalls.executions,
    vesselClassifications: fixture.vesselRecovery.classifications,
    replayExternalCalls: fixture.assertions.replayExternalCalls,
    retainedInlineRegressions: retainedRegressions.length,
    authorityExpansions: fixture.assertions.authorityExpansions,
    realmEffects: fixture.assertions.realmEffects,
  };
}

export async function buildDeterministicRecoverableGodskillsAdmissionFixture(options) {
  return buildFixture(options);
}

export function verifyRecoverableGodskillsAdmissionCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'recoverable Godskills admission certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('recoverable Godskills admission certification identity mismatch');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan', 'sourceBoundary',
  ], 'recoverable Godskills certification source');
  if (!COMMIT.test(value.source.commit)) throw new Error('recoverable Godskills source commit is invalid');
  validateManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  validateManifest(value.source.testManifest, testFiles, 'test manifest');
  validateSourceBoundary(value.source.sourceBoundary);
  if (!sameArray(Object.keys(value.source.historicalReceiptDigests).sort(), historicalReceiptPaths)) {
    throw new Error('historical receipt set mismatch');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt'));
  exactKeys(value.source.specification, ['path', 'sha256'], 'specification');
  exactKeys(value.source.plan, ['path', 'sha256'], 'plan');
  if (value.source.specification.path !== specificationPath || value.source.plan.path !== planPath) {
    throw new Error('specification or plan path mismatch');
  }
  requireDigest(value.source.specification.sha256, 'specification');
  requireDigest(value.source.plan.sha256, 'plan');

  exactKeys(value.godskills, ['commit', 'releaseDigest', 'activationTrustRootDigest', 'capability'], 'Godskills dependency');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('Godskills dependency commit is invalid');
  requireDigest(value.godskills.releaseDigest, 'Godskills release');
  requireDigest(value.godskills.activationTrustRootDigest, 'Godskills activation root');
  exactKeys(value.godskills.capability, ['id', 'entrypointSha256', 'contractSha256'], 'Godskills dependency capability');
  if (value.godskills.capability.id !== 'eternities-aegis') throw new Error('Godskills dependency capability changed');
  requireDigest(value.godskills.capability.entrypointSha256, 'Godskills capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'Godskills capability contract');

  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions'], 'fixture binding');
  if (value.fixture.path !== fixturePath) throw new Error('fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'fixture file');
  requireDigest(value.fixture.logicalDigest, 'fixture logical');
  validateAssertions(value.fixture.assertions, 'fixture binding assertions');
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
  exactKeys(value.metrics, Object.keys(expectedMetrics({
    routeRecovery: {
      routeCalls: { reconciliations: 2, executions: 1 },
      activationCalls: { executions: 1 },
      classifications: 1,
    },
    vesselRecovery: {
      routeCalls: { executions: 1 },
      activationCalls: { reconciliations: 2, executions: 1 },
      nativeCalls: { reconciliations: 2, executions: 1 },
      reviewCalls: { executions: 2 },
      revisionCalls: { executions: 1 },
      classifications: 2,
    },
    assertions: { replayExternalCalls: 0, authorityExpansions: 0, realmEffects: 0 },
  })), 'certification metrics');
  const fixedMetrics = {
    routeWindowReconciliations: 2,
    routeWindowExecutions: 1,
    routeWindowActivationExecutions: 1,
    routeWindowClassifications: 1,
    vesselRouteExecutions: 1,
    vesselActivationReconciliations: 2,
    vesselActivationExecutions: 1,
    nativeReconciliations: 2,
    nativeExecutions: 1,
    reviewExecutions: 2,
    revisionExecutions: 1,
    vesselClassifications: 2,
    replayExternalCalls: 0,
    retainedInlineRegressions: retainedRegressions.length,
    authorityExpansions: 0,
    realmEffects: 0,
  };
  if (canonicalJson(value.metrics) !== canonicalJson(fixedMetrics)) throw new Error('certification metrics are invalid');
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('proof limits mismatch');
  validateTestRuns(value.testRuns);
  exactKeys(value.review, ['mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions'], 'review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'recoverable Godskills admission receipt');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('recoverable Godskills admission receipt mismatch');
  return value;
}

export async function rebuildRecoverableGodskillsAdmissionReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = validateFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const boundarySources = await Promise.all([
    gitText(repositoryRoot, sourceCommit, 'src/skills/recoverable-godskills-adapter.mjs'),
    gitText(repositoryRoot, sourceCommit, 'src/skills/recoverable-godskills-contracts.mjs'),
    gitText(repositoryRoot, sourceCommit, 'src/skills/recoverable-godskills-outbox.mjs'),
    gitText(repositoryRoot, sourceCommit, 'src/runtime/identity-bound-mission-vessel.mjs'),
  ]);
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
      sourceBoundary: sourceBoundary(boundarySources.join('\n')),
    },
    godskills: structuredClone(fixture.godskills),
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
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
  return Object.freeze(verifyRecoverableGodskillsAdmissionCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicRecoverableGodskillsAdmissionFixture();
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({
      status: 'written',
      destination,
      fixtureDigest: fixture.fixtureDigest,
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
  const preliminary = await rebuildRecoverableGodskillsAdmissionReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildRecoverableGodskillsAdmissionReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    testRuns: receipt.testRuns,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
