import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicOpenAICompatibleAdmittedHostFixture } from '../tests/helpers/openai-compatible-admitted-host-fixture.mjs';
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

export { buildDeterministicOpenAICompatibleAdmittedHostFixture };

const certificationId = 'sealed-openai-compatible-phase-transport-v1';
const protocolId = 'eternities-sealed-openai-compatible-phase-transport-certification-v1';
const fixturePath = 'fixtures/sealed-openai-compatible-phase-transport-v1.json';
const receiptPath = 'receipts/sealed-openai-compatible-phase-transport-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-sealed-openai-compatible-phase-transport-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-sealed-openai-compatible-phase-transport-v1.md';
const certificationPath = 'docs/sealed-openai-compatible-phase-transport-v1-certification.md';
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
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'schemas/openai-compatible-phase-transport-policy.schema.json',
  'scripts/build-sealed-openai-compatible-phase-transport-v1-receipt.mjs',
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
  'src/skills/local-recoverable-godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-process-transport.mjs',
  'src/skills/recoverable-godskills-contracts.mjs',
  'src/skills/routing-evidence-activation-classifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
  'src/transports/openai-compatible-phase-policy.mjs',
  'src/transports/openai-compatible-phase-protocol.mjs',
  'src/transports/openai-compatible-phase-transport.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/admitted-sealed-identity-launch.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/helpers/admitted-identity-fixture.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/openai-compatible-admitted-host-fixture.mjs',
  'tests/helpers/openai-compatible-phase-policy-fixture.mjs',
  'tests/identity-bound-native-transport.test.mjs',
  'tests/mission-native-executor.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/mission-revision-executor.test.mjs',
  'tests/openai-compatible-admitted-host-integration.test.mjs',
  'tests/openai-compatible-phase-policy.test.mjs',
  'tests/openai-compatible-phase-transport-certification.test.mjs',
  'tests/openai-compatible-phase-transport.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/sealed-local-identity-bound-mission-vessel.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/openai-compatible-admitted-host-integration.test.mjs',
  'tests/openai-compatible-phase-policy.test.mjs',
  'tests/openai-compatible-phase-transport.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'OPT-001': ['canonical provider policy and external digest pin bind endpoint model credential variable and every ceiling before use'],
  'OPT-002': ['one policy digest deterministically binds the native review and revision descriptors'],
  'OPT-003': ['all three adapters emit bounded strict structured-output requests and existing completion contracts'],
  'OPT-004': ['trusted adapters assign all identity authority subject input and completion bindings'],
  'OPT-005': ['the bearer credential reaches only the in-memory Authorization header'],
  'OPT-006': ['credential-bearing input and reflected output fail closed without raw-value disclosure'],
  'OPT-007': ['request response artifact provider-token and transport-completion ceilings fail closed'],
  'OPT-008': ['provider shape usage model and semantic contradictions fail closed'],
  'OPT-009': ['exact completion reconstruction replays without another provider request or credential'],
  'OPT-010': ['same-dispatch concurrency performs at most one provider request'],
  'OPT-011': ['durable attempt publication makes ambiguous execution pending and non-retriable'],
  'OPT-012': ['malformed substituted symlinked and contradictory durable state fails before provider access'],
  'OPT-013': ['closed failures persist only reason status and raw-response digest evidence'],
  'OPT-014': ['the admitted host and historical provider-neutral contracts remain unchanged and passing'],
  'OPT-015': ['the deterministic fixture receipt ledger and release lineage reproduce exactly'],
});

const retainedRegressions = Object.freeze([
  'rejects noncanonical downgraded ambiguous and unavailable provider policies before use',
  'keeps credential resolution lazy rotatable and absent from serializable surfaces',
  'changes every phase descriptor when any provider policy field changes',
  'rejects credential-bearing input before durable or network work',
  'assigns trusted native identity and dispatch bindings around model-supplied content',
  'reconciles a completed native call without another credential or network request',
  'allows at most one provider request under same-dispatch contention',
  'never automatically retries interruption or ambiguity after attempt publication',
  'rejects credential reflection without persisting the secret or raw response',
  'persists only status and response digest for provider rejection',
  'enforces request response provider-token and transport completion ceilings',
  'rejects model mismatch refusal tool use multiple choices invalid usage and invalid JSON',
  'rejects symlinked operation slots and coherently rehashed prepared-state substitution',
  'assigns exact review subject and revision input digests in trusted code',
  'rejects contradictory review and revision semantics before artifact acceptance',
  'executes native review revision review through the real admitted sealed identity host',
  'replays the terminal host result with no provider routing or activation call',
  'persists no credential canary anywhere beneath the complete fixture root',
]);

const proofLimits = Object.freeze([
  'fake-provider-only',
  'strict-json-schema-compatible-models-only',
  'local-at-most-once-not-remote-exactly-once',
  'ambiguous-calls-require-future-operator-resolution',
  'no-live-quality-latency-cost-or-provider-equivalence-qualification',
  'no-cli-or-default-launcher-migration',
  'trusted-local-policy-path-and-external-digest-pin',
  'no-hostile-same-user-operating-system-isolation',
  'no-streaming-tools-files-images-audio-or-web-search',
  'no-realm-action-continuity-keel-evolution-lunari-inspiration-or-soul-authority',
  'no-independent-review',
]);

const expectedAssertions = Object.freeze({
  exactProviderPolicyPinned: true,
  identityPolicyPinsNativeDescriptor: true,
  allCredentialsReachedOnlyHeaders: true,
  exactReviewedPhaseOrder: true,
  fourDurablePhaseCompletions: true,
  finalReviewAccepted: true,
  exactTerminalReplay: true,
  replayProviderCalls: 0,
  replayRouteLaunches: 0,
  replayActivationLaunches: 0,
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
    'identityPolicyDigest', 'descriptors', 'execution', 'recovery',
    'assertions', 'fixtureDigest',
  ], 'OpenAI-compatible admitted host fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-openai-compatible-admitted-host-fixture-v1') {
    throw new Error('OpenAI-compatible admitted host fixture identity is invalid');
  }
  verifyGodskills(value.godskills);
  requireDigest(value.providerPolicyDigest, 'fixture provider policy');
  requireDigest(value.identityPolicyDigest, 'fixture identity policy');
  exactKeys(value.descriptors, ['native', 'review', 'revision'], 'fixture descriptors');
  Object.values(value.descriptors).forEach((digest) => requireDigest(digest, 'fixture descriptor'));
  exactKeys(value.execution, [
    'phaseOrder', 'requestDigests', 'missionCompletionReceiptDigest',
    'vesselCompletionReceiptDigest',
  ], 'fixture execution');
  if (!sameArray(value.execution.phaseOrder, ['native', 'review', 'revision', 'review'])
      || !Array.isArray(value.execution.requestDigests)
      || value.execution.requestDigests.length !== 4) {
    throw new Error('fixture phase execution is invalid');
  }
  value.execution.requestDigests.forEach((digest) => requireDigest(digest, 'fixture request'));
  requireDigest(value.execution.missionCompletionReceiptDigest, 'fixture mission completion');
  requireDigest(value.execution.vesselCompletionReceiptDigest, 'fixture vessel completion');
  const expectedRecovery = { providerCalls: 4, routeLaunches: 1, activationLaunches: 1 };
  if (canonicalJson(value.recovery) !== canonicalJson(expectedRecovery)
      || canonicalJson(value.assertions) !== canonicalJson(expectedAssertions)) {
    throw new Error('fixture recovery or assertions are invalid');
  }
  requireDigest(value.fixtureDigest, 'OpenAI-compatible admitted host fixture');
  const unsigned = structuredClone(value);
  delete unsigned.fixtureDigest;
  if (sha256Value(unsigned) !== value.fixtureDigest) throw new Error('fixture digest mismatch');
  return value;
}

function expectedMetrics(fixture) {
  return {
    providerCalls: fixture.recovery.providerCalls,
    routeLaunches: fixture.recovery.routeLaunches,
    activationLaunches: fixture.recovery.activationLaunches,
    durablePhaseCompletions: fixture.assertions.fourDurablePhaseCompletions ? 4 : 0,
    replayExternalCalls: fixture.assertions.replayProviderCalls
      + fixture.assertions.replayRouteLaunches
      + fixture.assertions.replayActivationLaunches,
    secretLeaks: fixture.assertions.secretLeaks,
    authorityExpansions: fixture.assertions.noRealmAuthorityExpansion ? 0 : 1,
    retainedInlineRegressions: retainedRegressions.length,
  };
}

export function verifySealedOpenAICompatiblePhaseTransportReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source',
    'godskills', 'fixture', 'requirements', 'metrics', 'proofLimits',
    'testRuns', 'review', 'receiptDigest',
  ], 'sealed OpenAI-compatible phase transport receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('sealed OpenAI-compatible phase transport identity is invalid');
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
    'providerPolicyDigest', 'identityPolicyDigest', 'descriptors', 'execution',
    'recovery', 'assertions',
  ], 'certification fixture');
  if (value.fixture.path !== fixturePath) throw new Error('fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'fixture file');
  requireDigest(value.fixture.logicalDigest, 'fixture logical');
  const fixture = verifyFixture({
    schemaVersion: value.fixture.schemaVersion,
    protocolId: value.fixture.protocolId,
    godskills: structuredClone(value.godskills),
    providerPolicyDigest: value.fixture.providerPolicyDigest,
    identityPolicyDigest: value.fixture.identityPolicyDigest,
    descriptors: structuredClone(value.fixture.descriptors),
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

export async function rebuildSealedOpenAICompatiblePhaseTransportReceipt({
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
      identityPolicyDigest: fixture.identityPolicyDigest,
      descriptors: structuredClone(fixture.descriptors),
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
  return Object.freeze(verifySealedOpenAICompatiblePhaseTransportReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicOpenAICompatibleAdmittedHostFixture();
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
  const preliminary = await rebuildSealedOpenAICompatiblePhaseTransportReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildSealedOpenAICompatiblePhaseTransportReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/openai-compatible-phase-transport-certification.test.mjs',
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
