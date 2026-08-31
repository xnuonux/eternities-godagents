import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicSealedLocalGodskillsTransportFixture } from '../tests/helpers/sealed-local-godskills-transport-certification-fixture.mjs';
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

export { buildDeterministicSealedLocalGodskillsTransportFixture };

const certificationId = 'sealed-local-godskills-transport-v1';
const protocolId = 'eternities-sealed-local-godskills-transport-certification-v1';
const fixturePath = 'fixtures/sealed-local-godskills-transport-v1.json';
const receiptPath = 'receipts/sealed-local-godskills-transport-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-sealed-local-godskills-transport-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-sealed-local-godskills-transport-v1.md';
const certificationPath = 'docs/sealed-local-godskills-transport-v1-certification.md';
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
  'receipts/recoverable-godskills-admission-v1.json',
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
  'schemas/godskills-routing-executable-pin.schema.json',
  'scripts/build-deferred-review-executor-v1-receipt.mjs',
  'scripts/build-deferred-review-materializer-v1-receipt.mjs',
  'scripts/build-godskills-specialist-preference-integration-receipt.mjs',
  'scripts/build-mission-native-executor-v1-receipt.mjs',
  'scripts/build-mission-revision-executor-v1-receipt.mjs',
  'scripts/build-sealed-local-godskills-transport-v1-receipt.mjs',
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
  'src/skills/activation-adapter.mjs',
  'src/skills/local-recoverable-godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-process-transport.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/recoverable-godskills-adapter.mjs',
  'src/skills/recoverable-godskills-contracts.mjs',
  'src/skills/recoverable-godskills-outbox.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/deferred-godskills-review-executor-certification.test.mjs',
  'tests/deferred-godskills-review-materializer-certification.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/godskills-routing-executable-verifier.test.mjs',
  'tests/godskills-specialist-preference-integration.test.mjs',
  'tests/helpers/identity-bound-mission-vessel-certification-fixture.mjs',
  'tests/helpers/recoverable-godskills-admission-certification-fixture.mjs',
  'tests/helpers/sealed-local-godskills-transport-certification-fixture.mjs',
  'tests/identity-bound-mission-vessel-certification.test.mjs',
  'tests/local-recoverable-godskills-adapter.test.mjs',
  'tests/local-recoverable-godskills-process-transport.test.mjs',
  'tests/mission-native-executor-certification.test.mjs',
  'tests/mission-revision-executor-certification.test.mjs',
  'tests/recoverable-godskills-adapter.test.mjs',
  'tests/recoverable-godskills-admission-certification.test.mjs',
  'tests/recoverable-godskills-admission-integration.test.mjs',
  'tests/recoverable-godskills-outbox.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
  'tests/sealed-local-godskills-transport-certification.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/godskills-release-verifier.test.mjs',
  'tests/godskills-routing-executable-verifier.test.mjs',
  'tests/local-recoverable-godskills-adapter.test.mjs',
  'tests/local-recoverable-godskills-process-transport.test.mjs',
  'tests/recoverable-godskills-adapter.test.mjs',
  'tests/recoverable-godskills-outbox.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'SLT-001': ['exact pushed Godskills routing and activation executable roots verify before process construction'],
  'SLT-002': ['route and activation execute in shell-free hidden child processes with a two-layer environment scrub'],
  'SLT-003': ['dispatch request execution result success and completion records are durable and content bound'],
  'SLT-004': ['a successful child result without a success witness cannot be accepted or recovered'],
  'SLT-005': ['process death after activation output recovers without another route or activation launch'],
  'SLT-006': ['live contention returns pending while timeout byte provenance and mutation failures close'],
  'SLT-007': ['exact final binding replay and rehydration perform no child process work'],
  'SLT-008': ['routing mode is fixed by the verified release and cannot be supplied per mission'],
  'SLT-009': ['credentials provider routing Realm continuity keel identity evolution Inspiration and Soul authority remain absent'],
  'SLT-010': ['deterministic fixture full suite append-only ledger and release lineage remain release gates'],
  'SLT-011': ['historical fixtures remain bound to their original Godskills source while accepting verified descendant releases'],
});

const retainedRegressions = Object.freeze([
  'rejects forged routing-verification wrappers before transport creation',
  'rejects changed routing receipt module artifact parent and entrypoint bytes',
  'rejects missing changed noncanonical oversized and non-regular terminal records',
  'requires durable process success before result recovery',
  'recovers one atomic child result without redispatch',
  'returns pending under a live operation lock',
  'kills and rejects a child that exceeds the fixed timeout',
  'binds route mode trust roots ceilings and timeout into transport identity',
  'preserves the existing immutable recoverable Godskills binding contract',
  'performs no process work on exact terminal binding replay',
  'reproduces historical Godskills fixtures after append-only upstream releases without changing historical evidence',
  'carries no provider credential Realm continuity identity evolution Inspiration or Soul authority',
]);

const proofLimits = Object.freeze([
  'local-deterministic-godskills-processes-only',
  'no-live-model-provider-or-model-quality-qualification',
  'activation-classifier-remains-an-injected-trusted-host-function',
  'no-admitted-host-local-cli-or-identity-vessel-default-migration',
  'no-hostile-same-user-operating-system-isolation',
  'no-universal-exactly-once-execution-before-observable-child-output',
  'no-cross-machine-terminal-replication',
  'no-provider-credential-or-model-routing-implementation',
  'no-realm-action-compensation-or-rollback',
  'no-continuity-admission-or-personal-keel-write',
  'no-lunari-inspiration-or-soul-activation',
  'no-independent-review',
]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error(`${label} fields are invalid`);
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function requireDigest(value, label) {
  if (!DIGEST.test(value)) throw new Error(`${label} is invalid`);
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

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'godskills', 'execution', 'recovery', 'assertions', 'fixtureDigest'], 'fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-sealed-local-godskills-transport-fixture-v1') {
    throw new Error('fixture identity is invalid');
  }
  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'routingReceiptDigest', 'routingReceiptFileSha256',
    'routingEntrypointSha256', 'activationReceiptDigest', 'activationReceiptFileSha256',
    'activationEntrypointSha256',
  ], 'fixture Godskills identity');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('fixture Godskills commit is invalid');
  for (const [name, digest] of Object.entries(value.godskills).filter(([name]) => name !== 'commit')) {
    requireDigest(digest, `fixture Godskills ${name}`);
  }
  exactKeys(value.execution, [
    'routeMode', 'routeDescriptorDigest', 'activationDescriptorDigest',
    'selectedCapabilities', 'selectedCapabilitiesDigest', 'bindingDigest',
  ], 'fixture execution');
  if (!['default', 'specialist'].includes(value.execution.routeMode)
      || !Number.isInteger(value.execution.selectedCapabilities) || value.execution.selectedCapabilities < 1) {
    throw new Error('fixture execution values are invalid');
  }
  for (const key of ['routeDescriptorDigest', 'activationDescriptorDigest', 'selectedCapabilitiesDigest', 'bindingDigest']) {
    requireDigest(value.execution[key], `fixture execution ${key}`);
  }
  exactKeys(value.recovery, [
    'routeLaunches', 'activationLaunches', 'classifications',
    'terminalResultFiles', 'terminalSuccessFiles', 'terminalCompletionFiles',
  ], 'fixture recovery');
  const expectedRecovery = {
    routeLaunches: 1,
    activationLaunches: 1,
    classifications: 2,
    terminalResultFiles: 2,
    terminalSuccessFiles: 2,
    terminalCompletionFiles: 2,
  };
  if (canonicalJson(value.recovery) !== canonicalJson(expectedRecovery)) throw new Error('fixture recovery metrics are invalid');
  const assertionKeys = [
    'processDeathObserved', 'activationResultDurableBeforeRecovery',
    'activationSuccessDurableBeforeRecovery', 'activationCompletionAbsentBeforeRecovery',
    'routeExecutedOnce', 'activationExecutedOnce', 'recoveredWithoutRelaunch',
    'exactBindingReplay', 'exactRehydration', 'ambientEnvironmentAbsent',
    'authorityExpansions', 'realmEffects',
  ];
  exactKeys(value.assertions, assertionKeys, 'fixture assertions');
  for (const key of assertionKeys) {
    const expected = ['authorityExpansions', 'realmEffects'].includes(key) ? 0 : true;
    if (value.assertions[key] !== expected) throw new Error(`fixture assertion ${key} failed`);
  }
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'fixture digest');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('fixture digest mismatch');
  return value;
}

function expectedMetrics(fixture) {
  return {
    routeLaunches: fixture.recovery.routeLaunches,
    activationLaunches: fixture.recovery.activationLaunches,
    activationClassifications: fixture.recovery.classifications,
    terminalResultFiles: fixture.recovery.terminalResultFiles,
    terminalSuccessFiles: fixture.recovery.terminalSuccessFiles,
    terminalCompletionFiles: fixture.recovery.terminalCompletionFiles,
    selectedCapabilities: fixture.execution.selectedCapabilities,
    replayProcessLaunches: 0,
    authorityExpansions: fixture.assertions.authorityExpansions,
    realmEffects: fixture.assertions.realmEffects,
    retainedInlineRegressions: retainedRegressions.length,
  };
}

export function verifySealedLocalGodskillsTransportCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('certification identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'certification source');
  if (!COMMIT.test(value.source.commit)) throw new Error('certification source commit is invalid');
  if (!value.source.historicalReceiptDigests
      || !sameArray(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
    throw new Error('historical receipt set mismatch');
  }
  Object.values(value.source.historicalReceiptDigests).forEach((digest) => requireDigest(digest, 'historical receipt digest'));
  verifyManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'test manifest');
  for (const [name, expectedPath] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[name], ['path', 'sha256'], `source ${name}`);
    if (value.source[name].path !== expectedPath) throw new Error(`source ${name} path mismatch`);
    requireDigest(value.source[name].sha256, `source ${name} digest`);
  }
  const fixture = verifyFixture({
    schemaVersion: value.fixture.schemaVersion,
    protocolId: value.fixture.protocolId,
    godskills: structuredClone(value.godskills),
    execution: structuredClone(value.fixture.execution),
    recovery: structuredClone(value.fixture.recovery),
    assertions: structuredClone(value.fixture.assertions),
    fixtureDigest: value.fixture.logicalDigest,
  });
  exactKeys(value.fixture, [
    'schemaVersion', 'protocolId', 'path', 'fileSha256', 'logicalDigest',
    'execution', 'recovery', 'assertions',
  ], 'certification fixture');
  if (value.fixture.path !== fixturePath) throw new Error('certification fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'certification fixture file digest');
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
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics(fixture))) throw new Error('certification metrics are invalid');
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('proof limits mismatch');
  validateTestRuns(value.testRuns);
  exactKeys(value.review, ['mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions'], 'review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'certification receipt digest');
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('certification receipt mismatch');
  return value;
}

export async function rebuildSealedLocalGodskillsTransportReceipt({
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
  return Object.freeze(verifySealedLocalGodskillsTransportCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicSealedLocalGodskillsTransportFixture();
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
  const preliminary = await rebuildSealedLocalGodskillsTransportReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildSealedLocalGodskillsTransportReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/sealed-local-godskills-transport-certification.test.mjs',
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
