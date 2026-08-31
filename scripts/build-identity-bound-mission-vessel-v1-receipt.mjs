import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicIdentityBoundMissionVesselFixture as buildFixture } from '../tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs';
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

const certificationId = 'identity-bound-mission-vessel-v1';
const protocolId = 'eternities-identity-bound-mission-vessel-certification-v1';
const fixturePath = 'fixtures/identity-bound-mission-vessel-v1.json';
const receiptPath = 'receipts/identity-bound-mission-vessel-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-identity-bound-mission-vessel-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-identity-bound-mission-vessel-v1.md';
const certificationPath = 'docs/identity-bound-mission-vessel-v1-certification.md';
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
  'schemas/identity-bound-mission-vessel-admission.schema.json',
  'schemas/identity-bound-mission-vessel-completion.schema.json',
  'schemas/identity-bound-mission-vessel-request.schema.json',
  'schemas/identity-bound-native-completion.schema.json',
  'schemas/identity-bound-native-dispatch.schema.json',
  'schemas/identity-bound-native-transport-descriptor.schema.json',
  'scripts/build-identity-bound-mission-vessel-v1-receipt.mjs',
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
  'src/skills/release-verifier.mjs',
  'src/skills/review-transport-contracts.mjs',
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
  'tests/identity-bound-mission-vessel-certification.test.mjs',
  'tests/identity-bound-mission-vessel-godskills-integration.test.mjs',
  'tests/identity-bound-mission-vessel.test.mjs',
  'tests/identity-bound-native-transport.test.mjs',
  'tests/mission-native-executor.test.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-journal.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/mission-revision-executor.test.mjs',
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
  'tests/recoverable-identity-bound-mission-vessel-integration.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'IMV-001': ['one strict request and verified genesis deterministically compile one immutable vessel admission'],
  'IMV-002': ['the exact verified model projection reaches native cognition beside the exact mission package'],
  'IMV-003': ['candidate, projection, task, mission, observation, ceiling, and Godskills drift fail closed'],
  'IMV-004': ['reconstruction rehydrates the stored Godskills binding without routing, classification, or activation'],
  'IMV-005': ['inner and outer native transports require exact absent reconciliation before execution'],
  'IMV-006': ['completed native work recovers after process reconstruction without redispatch'],
  'IMV-007': ['pending and ambiguous transport state cannot dispatch or commit'],
  'IMV-008': ['native, review, revision, and final review remain ordered and content-addressed'],
  'IMV-009': ['terminal replay performs no generation, review, revision, routing, classification, or activation call'],
  'IMV-010': ['identity, Godskills, artifact, usage, byte, time, and authority substitution fail closed'],
  'IMV-011': ['credentials and provider-routing fields cannot enter vessel contracts or certified wire evidence'],
  'IMV-012': ['Realm, continuity, personal-keel, identity, evolution, Inspiration, and Soul authority remain absent'],
  'IMV-013': ['two admitted identities executing the same mission remain cryptographically distinct'],
  'IMV-014': ['deterministic fixtures, full tests, and the append-only certification ledger remain release gates'],
  'IMV-015': ['release lineage binds every certified source as an ancestor of canonical main'],
});

const retainedRegressions = Object.freeze([
  'strict credential-free request schema',
  'verified genesis and request compile the identity candidate internally',
  'two admitted identities produce distinct cryptographic dispatches',
  'identity projection reaches the native payload exactly',
  'foreign outer transport descriptors are rejected',
  'exact absent reconciliation is required before native execution',
  'pending completed and ambiguous reconciliation cannot redispatch',
  'process reconstruction reproduces the same identity dispatch',
  'completion identity package usage time authority and bytes fail closed',
  'late artifact mutation fails verification',
  'immutable vessel admission rejects request drift',
  'immutable vessel admission rejects identity drift',
  'stored Godskills bindings are digest-checked before rehydration',
  'actual Godskills routing classification and activation occur once',
  'recovery never reroutes reclassifies or reactivates',
  'review mode discloses no selected body before native inference',
  'recovered native work enters the exact two-review revision loop',
  'no-qualified route remains native-only',
  'needs-decision performs no native dispatch',
  'legacy selected binding without adaptive trust root is rejected',
  'terminal replay performs no external work',
]);

const proofLimits = Object.freeze([
  'no-live-model-or-provider-qualification',
  'no-native-review-revision-or-mission-quality-claim',
  'trusted-transport-terminal-lookup-and-atomic-deduplication-remain-assumptions',
  'first-activation-crash-before-vessel-publication-can-repeat-idempotent-activation',
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

function validateFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'identity', 'vessel', 'execution',
    'measurements', 'assertions', 'fixtureDigest',
  ], 'identity-bound vessel fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-identity-bound-mission-vessel-fixture-v1') {
    throw new Error('identity-bound vessel fixture identity mismatch');
  }
  exactKeys(value.godskills, ['commit', 'releaseDigest', 'activationTrustRootDigest', 'capability'], 'fixture Godskills');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('fixture Godskills commit is invalid');
  requireDigest(value.godskills.releaseDigest, 'fixture Godskills release');
  requireDigest(value.godskills.activationTrustRootDigest, 'fixture activation root');
  exactKeys(value.godskills.capability, ['id', 'entrypointSha256', 'contractSha256'], 'fixture capability');
  if (value.godskills.capability.id !== 'eternities-aegis') throw new Error('fixture capability changed');
  requireDigest(value.godskills.capability.entrypointSha256, 'fixture capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'fixture capability contract');
  exactKeys(value.identity, [
    'name', 'instanceId', 'bindingCandidateId', 'candidateDigest',
    'fullEnvelopeDigest', 'modelProjectionDigest',
  ], 'fixture identity');
  if (value.identity.name !== 'Aether Architect' || value.identity.instanceId !== 'identity-vessel-certification') {
    throw new Error('fixture projected identity changed');
  }
  for (const key of ['bindingCandidateId', 'candidateDigest', 'fullEnvelopeDigest', 'modelProjectionDigest']) {
    requireDigest(value.identity[key], `fixture identity ${key}`);
  }
  exactKeys(value.vessel, [
    'vesselAdmissionDigest', 'completionReceiptDigest', 'missionCompletionReceiptDigest',
    'acceptedArtifactDigest', 'verdictReason',
  ], 'fixture vessel');
  for (const key of [
    'vesselAdmissionDigest', 'completionReceiptDigest', 'missionCompletionReceiptDigest',
    'acceptedArtifactDigest',
  ]) requireDigest(value.vessel[key], `fixture vessel ${key}`);
  if (value.vessel.verdictReason !== 'revision-review-accepted') throw new Error('fixture verdict changed');
  exactKeys(value.execution, [
    'innerTransportDescriptorDigest', 'identityDispatchDigest', 'identityCompletionDigest',
    'nativeCalls', 'reviewTransportDescriptorDigest', 'reviewCalls',
    'revisionTransportDescriptorDigest', 'revisionCalls', 'initialRouting', 'recoveryRouting',
  ], 'fixture execution');
  for (const key of [
    'innerTransportDescriptorDigest', 'identityDispatchDigest', 'identityCompletionDigest',
    'reviewTransportDescriptorDigest', 'revisionTransportDescriptorDigest',
  ]) requireDigest(value.execution[key], `fixture execution ${key}`);
  validateCalls(value.execution.nativeCalls, { descriptors: 3, reconciliations: 2, executions: 1 }, 'native calls');
  validateCalls(value.execution.reviewCalls, { descriptors: 2, reconciliations: 2, executions: 2 }, 'review calls');
  validateCalls(value.execution.revisionCalls, { descriptors: 2, reconciliations: 1, executions: 1 }, 'revision calls');
  exactKeys(value.execution.initialRouting, ['route', 'classify', 'activate'], 'initial routing');
  exactKeys(value.execution.recoveryRouting, ['route', 'classify', 'activate'], 'recovery routing');
  if (Object.values(value.execution.initialRouting).some((count) => count !== 1)
      || Object.values(value.execution.recoveryRouting).some((count) => count !== 0)) {
    throw new Error('fixture Godskills routing counts changed');
  }
  exactKeys(value.measurements, [
    'identityDispatchBytes', 'identityCompletionBytes', 'modelProjectionBytes',
  ], 'fixture measurements');
  Object.entries(value.measurements).forEach(([name, count]) => requireInteger(count, name, 1));
  exactKeys(value.assertions, [
    'processDeathObserved', 'completedAfterReconstruction', 'exactIdentityDispatchReproduced',
    'nativeRecoveredWithoutRedispatch', 'actualGodskillsActivatedOnce',
    'recoveryRehydratedWithoutExternalActivation', 'exactIdentityProjectionReachedNative',
    'deferredReviewBodyFreeBeforeInference', 'finalReviewAccepted', 'exactTerminalReplay',
    'replayExternalCalls', 'forbiddenWireKeys', 'filesystemRootsDisclosed',
    'authorityExpansions', 'realmEffects',
  ], 'fixture assertions');
  const zero = new Set([
    'replayExternalCalls', 'forbiddenWireKeys', 'filesystemRootsDisclosed',
    'authorityExpansions', 'realmEffects',
  ]);
  for (const [name, result] of Object.entries(value.assertions)) {
    if (result !== (zero.has(name) ? 0 : true)) throw new Error(`fixture assertion failed: ${name}`);
  }
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

export async function buildDeterministicIdentityBoundMissionVesselFixture(options) {
  return buildFixture(options);
}

export function verifyIdentityBoundMissionVesselCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'identity-bound vessel certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('identity-bound vessel certification identity mismatch');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan', 'sourceBoundary',
  ], 'identity-bound vessel certification source');
  if (!COMMIT.test(value.source.commit)) throw new Error('identity-bound vessel source commit is invalid');
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
  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'activationTrustRootDigest', 'capability',
  ], 'Godskills dependency');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('Godskills dependency commit is invalid');
  requireDigest(value.godskills.releaseDigest, 'Godskills release');
  requireDigest(value.godskills.activationTrustRootDigest, 'Godskills activation root');
  exactKeys(value.godskills.capability, [
    'id', 'entrypointSha256', 'contractSha256',
  ], 'Godskills dependency capability');
  if (value.godskills.capability.id !== 'eternities-aegis') throw new Error('Godskills dependency capability changed');
  requireDigest(value.godskills.capability.entrypointSha256, 'Godskills capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'Godskills capability contract');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions', 'measurements'], 'fixture binding');
  if (value.fixture.path !== fixturePath) throw new Error('fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'fixture file');
  requireDigest(value.fixture.logicalDigest, 'fixture logical');
  exactKeys(value.fixture.measurements, [
    'identityDispatchBytes', 'identityCompletionBytes', 'modelProjectionBytes',
  ], 'fixture binding measurements');
  Object.entries(value.fixture.measurements).forEach(([name, count]) => requireInteger(count, name, 1));
  exactKeys(value.fixture.assertions, [
    'processDeathObserved', 'completedAfterReconstruction', 'exactIdentityDispatchReproduced',
    'nativeRecoveredWithoutRedispatch', 'actualGodskillsActivatedOnce',
    'recoveryRehydratedWithoutExternalActivation', 'exactIdentityProjectionReachedNative',
    'deferredReviewBodyFreeBeforeInference', 'finalReviewAccepted', 'exactTerminalReplay',
    'replayExternalCalls', 'forbiddenWireKeys', 'filesystemRootsDisclosed',
    'authorityExpansions', 'realmEffects',
  ], 'fixture binding assertions');
  const zero = new Set([
    'replayExternalCalls', 'forbiddenWireKeys', 'filesystemRootsDisclosed',
    'authorityExpansions', 'realmEffects',
  ]);
  for (const [name, result] of Object.entries(value.fixture.assertions)) {
    if (result !== (zero.has(name) ? 0 : true)) throw new Error(`fixture binding assertion failed: ${name}`);
  }
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
  exactKeys(value.metrics, [
    'nativeTransportReconciliations', 'nativeTransportExecutions', 'reviewTransportExecutions',
    'revisionTransportExecutions', 'initialRoutingCalls', 'recoveryRoutingCalls',
    'replayExternalCalls', 'retainedInlineRegressions', 'forbiddenWireKeys',
    'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects',
  ], 'certification metrics');
  const expectedMetrics = {
    nativeTransportReconciliations: 2,
    nativeTransportExecutions: 1,
    reviewTransportExecutions: 2,
    revisionTransportExecutions: 1,
    initialRoutingCalls: 3,
    recoveryRoutingCalls: 0,
    replayExternalCalls: 0,
    retainedInlineRegressions: retainedRegressions.length,
    forbiddenWireKeys: 0,
    filesystemRootsDisclosed: 0,
    authorityExpansions: 0,
    realmEffects: 0,
  };
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics)) {
    throw new Error('certification metrics are invalid');
  }
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('proof limits mismatch');
  validateTestRuns(value.testRuns);
  exactKeys(value.review, ['mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions'], 'review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'identity-bound vessel receipt');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('identity-bound vessel receipt mismatch');
  return value;
}

export async function rebuildIdentityBoundMissionVesselReceipt({
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
    gitText(repositoryRoot, sourceCommit, 'src/runtime/identity-bound-mission-vessel.mjs'),
    gitText(repositoryRoot, sourceCommit, 'src/runtime/identity-bound-native-transport.mjs'),
    gitText(repositoryRoot, sourceCommit, 'src/skills/mission-binder.mjs'),
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
      measurements: structuredClone(fixture.measurements),
    },
    requirements: Object.entries(requirementEvidence).map(([id, evidence]) => ({
      id,
      status: 'pass',
      evidence: [...evidence],
    })),
    metrics: {
      nativeTransportReconciliations: fixture.execution.nativeCalls.reconciliations,
      nativeTransportExecutions: fixture.execution.nativeCalls.executions,
      reviewTransportExecutions: fixture.execution.reviewCalls.executions,
      revisionTransportExecutions: fixture.execution.revisionCalls.executions,
      initialRoutingCalls: Object.values(fixture.execution.initialRouting).reduce((sum, count) => sum + count, 0),
      recoveryRoutingCalls: Object.values(fixture.execution.recoveryRouting).reduce((sum, count) => sum + count, 0),
      replayExternalCalls: fixture.assertions.replayExternalCalls,
      retainedInlineRegressions: retainedRegressions.length,
      forbiddenWireKeys: fixture.assertions.forbiddenWireKeys,
      filesystemRootsDisclosed: fixture.assertions.filesystemRootsDisclosed,
      authorityExpansions: fixture.assertions.authorityExpansions,
      realmEffects: fixture.assertions.realmEffects,
    },
    proofLimits: [...proofLimits],
    testRuns: structuredClone(testRuns),
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [...retainedRegressions],
    },
  };
  return Object.freeze(verifyIdentityBoundMissionVesselCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicIdentityBoundMissionVesselFixture();
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
  const preliminary = await rebuildIdentityBoundMissionVesselReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildIdentityBoundMissionVesselReceipt({
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
