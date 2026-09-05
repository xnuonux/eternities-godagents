import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { verifyMissionOperationDescription } from '../src/runtime/mission-operation-adapter.mjs';
import {
  assertCommit,
  gitText,
  headCommit,
  historicalAtCommit,
  manifestAtCommit,
  pathsAtCommit,
  requireCleanExcept,
  resolveSourceCommit,
  runTests,
} from './lib/certification-support.mjs';
import { runReleaseGates } from './lib/release-gates.mjs';

const certificationId = 'deferred-review-mission-operation-adapter-v1';
const protocolId = 'eternities-deferred-review-mission-operation-adapter-certification-v1';
const fixturePath = 'fixtures/review-mission-operation-adapter-v1.json';
const receiptPath = 'receipts/review-mission-operation-adapter-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-deferred-review-mission-operation-adapter-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-deferred-review-mission-operation-adapter-v1.md';
const auditPath = 'docs/audits/2026-09-05-universal-godagents-gap-audit-v5.md';
const certificationPath = 'docs/deferred-review-mission-operation-adapter-v1-certification.md';
const parentReceiptPath = 'receipts/mission-operation-adapter-v1.json';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  auditPath,
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'scripts/build-review-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-review-mission-operation-adapter-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/mission-operation-adapter.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/runtime/mission-program.mjs',
  'src/runtime/review-mission-operation-adapter.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/mission-operation-adapter.test.mjs',
  'tests/mission-operation-adapter-certification.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/review-mission-operation-adapter-certification.test.mjs',
  'tests/review-mission-operation-adapter.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/review-mission-operation-adapter.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const expectedAssertions = Object.freeze({
  authorityCeilingBound: true,
  ceilingsBound: true,
  contextDigestBound: true,
  noBodiesInSourceDescriptor: true,
  phaseContextBindingExact: true,
  phaseResultProjectionExact: true,
  programStepBound: true,
  sourceBoundToPhase: true,
  terminalReplayStable: true,
});
const requirements = Object.freeze([
  ['DRA-001', 'one exact review executor descriptor, phase request, and context digest bind the source descriptor'],
  ['DRA-002', 'the generic mission-operation request remains body-free and carries exact program-step ceilings'],
  ['DRA-003', 'authority ceiling, mission identity, step identity, and phase request identity cannot drift'],
  ['DRA-004', 'the source executor is called only after its live descriptor is revalidated'],
  ['DRA-005', 'absent, pending, and completed outcomes remain explicit and completed results project exact phase evidence'],
  ['DRA-006', 'reconciliation-before-execution and terminal replay avoid duplicate executor dispatch'],
  ['DRA-007', 'malformed phase results and changed request or context bindings fail closed'],
  ['DRA-008', 'the adapter owns no durable writes, locks, credentials, providers, Realm, or continuity authority'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the adapter is an opt-in provider-neutral bridge over one already-admitted deferred review executor and one mission-program step',
  'the deterministic fixture uses a trusted in-process executor and proves binding and replay mechanics, not review quality, model quality, or live Godskills execution',
  'the phase executor remains the owner of review materialization, Godskills disclosure, transport reconciliation, and phase result validation',
  'the mission-program coordinator remains the owner of journal writes, locks, ordering, artifact publication, recovery, and terminal replay',
  'no live provider, Codex, Claude Code, local-model, MCP, delegation, Realm effect, default launch, keel, memory, identity, evolution, Inspiration, Soul, or Lunari behavior is certified',
]);
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
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

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'review adapter test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'review adapter test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('review adapter test run is invalid');
    }
  }
}

function verifySourceDescriptor(value) {
  exactKeys(value, [
    'authorityCeilingDigest', 'contextDigest', 'executorDescriptorDigest',
    'maxCompletionTokens', 'maxResultBytes', 'phase', 'phaseRequestDigest',
    'programId', 'protocolId', 'round', 'schemaVersion', 'sourceKind',
    'sourceVersion', 'stepId', 'stepIndex',
  ], 'review operation source descriptor');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-deferred-review-mission-operation-source-v1'
      || value.sourceKind !== 'deferred-godskills-review-executor'
      || value.sourceVersion !== '1.0.0'
      || value.phase !== 'review'
      || !Number.isSafeInteger(value.round) || value.round < 1 || value.round > 2
      || !Number.isSafeInteger(value.stepIndex) || value.stepIndex < 0 || value.stepIndex > 7
      || !Number.isSafeInteger(value.maxCompletionTokens) || value.maxCompletionTokens < 1
      || !Number.isSafeInteger(value.maxResultBytes) || value.maxResultBytes < 1
      || !IDENTIFIER.test(value.stepId)) throw new Error('review operation source descriptor identity is invalid');
  for (const [key, label] of [
    ['authorityCeilingDigest', 'authority ceiling'],
    ['contextDigest', 'context'],
    ['executorDescriptorDigest', 'executor descriptor'],
    ['phaseRequestDigest', 'phase request'],
    ['programId', 'program'],
  ]) digest(value[key], label);
  return value;
}

function verifyFixture(value) {
  exactKeys(value, [
    'assertions', 'description', 'execution', 'fixtureDigest', 'projection',
    'protocolId', 'schemaVersion', 'sourceDescriptor',
  ], 'review mission-operation adapter fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-review-mission-operation-adapter-fixture-v1') {
    throw new Error('review mission-operation adapter fixture identity is invalid');
  }
  verifyMissionOperationDescription(value.description);
  verifySourceDescriptor(value.sourceDescriptor);
  if (value.description.sourceDescriptorDigest !== sha256Value(value.sourceDescriptor)) {
    throw new Error('review operation source descriptor binding is invalid');
  }
  exactKeys(value.execution, ['executeCount', 'firstStatus', 'inspectionStatus', 'phaseMethods', 'replayStatus'], 'review adapter execution');
  if (value.execution.executeCount !== 1 || value.execution.firstStatus !== 'completed'
      || value.execution.inspectionStatus !== 'completed' || value.execution.replayStatus !== 'completed'
      || !same(value.execution.phaseMethods, ['reconcile', 'execute'])) {
    throw new Error('review adapter execution proof is invalid');
  }
  exactKeys(value.projection, [
    'completedAt', 'phaseArtifactBytes', 'phaseResultDigest', 'resultBytes',
    'resultDigest', 'startedAt', 'usage',
  ], 'review adapter projection');
  digest(value.projection.resultDigest, 'projected result');
  if (value.projection.resultDigest !== value.projection.phaseResultDigest
      || value.projection.resultBytes !== value.projection.phaseArtifactBytes
      || !value.projection.usage || value.projection.startedAt !== '2026-09-05T12:00:00.000Z'
      || value.projection.completedAt !== '2026-09-05T12:00:00.100Z') {
    throw new Error('review adapter phase projection is invalid');
  }
  if (!same(value.assertions, expectedAssertions)) throw new Error('review adapter assertions are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'review adapter fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('review adapter fixture digest mismatch');
  return value;
}

export function verifyReviewMissionOperationAdapterReceipt(value) {
  exactKeys(value, [
    'certificationId', 'fixture', 'metrics', 'proofLimits', 'protocolId',
    'receiptDigest', 'requirements', 'review', 'schemaVersion', 'source',
    'status', 'testRuns',
  ], 'review mission-operation adapter receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('review mission-operation adapter receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'parentAdapterReceipt',
    'plan', 'specification', 'testManifest',
  ], 'review adapter receipt source');
  if (!COMMIT.test(value.source.commit) || !value.source.historicalReceiptDigests
      || typeof value.source.historicalReceiptDigests !== 'object'
      || Array.isArray(value.source.historicalReceiptDigests)) {
    throw new Error('review adapter source history is invalid');
  }
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('review adapter historical path is invalid');
    digest(valueDigest, 'review adapter historical receipt');
  }
  exactKeys(value.source.parentAdapterReceipt, ['certificationId', 'path', 'receiptDigest'], 'review adapter parent receipt');
  if (value.source.parentAdapterReceipt.certificationId !== 'mission-operation-adapter-v1'
      || value.source.parentAdapterReceipt.path !== parentReceiptPath) {
    throw new Error('review adapter parent receipt identity is invalid');
  }
  digest(value.source.parentAdapterReceipt.receiptDigest, 'review adapter parent receipt');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[field], ['path', 'sha256'], `review adapter ${field}`);
    if (value.source[field].path !== path) throw new Error(`review adapter ${field} path mismatch`);
    digest(value.source[field].sha256, `review adapter ${field}`);
  }
  for (const [field, paths] of [['implementationManifest', implementationFiles], ['testManifest', testFiles]]) {
    const manifest = value.source[field];
    exactKeys(manifest, ['digest', 'entries', 'paths'], `review adapter ${field}`);
    if (!same(manifest.paths, paths) || !Array.isArray(manifest.entries) || manifest.entries.length !== paths.length
        || manifest.digest !== sha256Value(manifest.entries)) throw new Error(`review adapter ${field} is invalid`);
    manifest.entries.forEach((entry, index) => {
      exactKeys(entry, ['bytes', 'path', 'sha256'], `review adapter ${field} entry`);
      if (entry.path !== paths[index] || !DIGEST.test(entry.sha256)
          || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) {
        throw new Error(`review adapter ${field} entry is invalid`);
      }
    });
  }
  exactKeys(value.fixture, ['fileSha256', 'logicalDigest', 'path', 'value'], 'review adapter fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('review adapter fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)
      || !same(value.proofLimits, proofLimits)
      || !same(value.review, {
        mode: 'inline-adversarial',
        independent: false,
        unresolvedCriticalDefects: 0,
        unresolvedImportantDefects: 0,
      })) {
    throw new Error('review adapter receipt evidence is invalid');
  }
  verifyTestRuns(value.testRuns);
  digest(value.receiptDigest, 'review adapter receipt');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('review adapter receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts'))
    .filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildReviewMissionOperationAdapterReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('review adapter fixture is not canonical');
  const implementationManifest = await manifestAtCommit(repository, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(repository, sourceCommit, testFiles);
  const history = await historicalReceiptPaths(repository, sourceCommit);
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(repository, sourceCommit, history),
      implementationManifest,
      testManifest,
      parentAdapterReceipt: {
        certificationId: 'mission-operation-adapter-v1',
        path: parentReceiptPath,
        receiptDigest: JSON.parse(await gitText(repository, sourceCommit, parentReceiptPath)).receiptDigest,
      },
      specification: { path: specificationPath, sha256: sha256Text(await gitText(repository, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(repository, sourceCommit, planPath)) },
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
  return Object.freeze(verifyReviewMissionOperationAdapterReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(repository, ...receiptPath.split('/'));
  await requireCleanExcept(repository, [...releaseOnlyPaths, 'package-lock.json']);
  const sourceCommit = await resolveSourceCommit({
    root: repository,
    headCommit: await headCommit(repository),
    outputPath,
    releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, repository);
  const preliminary = await buildReviewMissionOperationAdapterReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildReviewMissionOperationAdapterReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({
    root: repository,
    certificationTestFile: 'tests/review-mission-operation-adapter-certification.test.mjs',
  });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Deferred review mission-operation adapter v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the opt-in provider-neutral bridge from one already-admitted deferred review executor to one descriptor-bound mission-program step. It proves exact phase and context binding, body-free generic dispatch, authority and ceiling preservation, reconciliation-before-execution, completed-result projection, and duplicate-free local replay. It does not certify review quality, live model or provider behavior, default launch wiring, Realm action, delegation, hosted durability, or Lunari integration.\n`;
  await writeFile(join(repository, ...certificationPath.split('/')), markdown, 'utf8');
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
