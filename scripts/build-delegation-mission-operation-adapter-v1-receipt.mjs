import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import {
  verifyMissionOperationDescription,
  verifyMissionOperationRequest,
} from '../src/runtime/mission-operation-adapter.mjs';
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

const certificationId = 'delegation-mission-operation-adapter-v1';
const protocolId = 'eternities-delegation-mission-operation-adapter-certification-v1';
const fixturePath = 'fixtures/delegation-mission-operation-adapter-v1.json';
const receiptPath = 'receipts/delegation-mission-operation-adapter-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-delegation-mission-operation-adapter-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-delegation-mission-operation-adapter-v1.md';
const certificationPath = 'docs/delegation-mission-operation-adapter-v1-certification.md';
const parentReceiptPath = 'receipts/bounded-delegation-lifecycle-v1.json';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'scripts/build-delegation-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-delegation-mission-operation-adapter-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/bounded-delegation.mjs',
  'src/runtime/delegation-mission-operation-adapter.mjs',
  'src/runtime/mission-operation-adapter.mjs',
  'src/runtime/mission-program.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/bounded-delegation-certification.test.mjs',
  'tests/bounded-delegation.test.mjs',
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/delegation-mission-operation-adapter-certification.test.mjs',
  'tests/delegation-mission-operation-adapter.test.mjs',
  'tests/mission-operation-adapter-certification.test.mjs',
  'tests/mission-operation-adapter.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/delegation-mission-operation-adapter.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const expectedAssertions = Object.freeze({
  authorityEmpty: true,
  bodyFreeSourceDescriptor: true,
  ceilingsBound: true,
  compactProjection: true,
  inputDigestBound: true,
  pendingPreserved: true,
  recoveryNoRedispatch: true,
  sourceBoundToDelegation: true,
  terminalReplayStable: true,
});
const requirements = Object.freeze([
  ['DMA-001', 'one bounded delegation description binds the source and input digest'],
  ['DMA-002', 'the generic mission request is body-free and its ceilings equal the delegation budget'],
  ['DMA-003', 'source identity, worker set, authority envelope, and delegation identity cannot drift'],
  ['DMA-004', 'reconciliation maps absent, pending, and completed bounded states without widening authority'],
  ['DMA-005', 'completed delegation output projects only compact digest, ordered workers, and usage evidence'],
  ['DMA-006', 'bounded recovery after worker execution does not redispatch the worker'],
  ['DMA-007', 'mission-program terminal replay does not redispatch bounded workers'],
  ['DMA-008', 'the adapter owns no credentials, provider, Realm, continuity, identity, evolution, Soul, or scheduler authority'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the adapter is an opt-in provider-neutral bridge over one certified bounded delegation coordinator and one mission-program step',
  'the deterministic fixture proves binding and lifecycle mechanics over trusted in-process worker adapters, not worker or model quality',
  'the bounded delegation coordinator remains the owner of worker envelopes, journal, artifacts, reconciliation, recovery, and aggregate identity',
  'the mission-program coordinator remains the owner of mission ordering, step commitment, locks, and terminal replay',
  'no child process, remote provider, quorum, nested delegation, scheduler, Realm, keel, memory, identity, evolution, Inspiration, Soul, or Lunari behavior is certified',
]);
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) throw new Error(`${label} fields are invalid`);
}

function digest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}

function verifyTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'delegation adapter test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'delegation adapter test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) throw new Error('delegation adapter test run is invalid');
  }
}

function verifySourceDescriptor(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'sourceKind', 'sourceVersion',
    'delegationId', 'delegationInputDigest', 'delegationAuthorityDigest',
    'workerSetDigest', 'workerIds', 'workerCount', 'maxCompletionTokens',
    'maxResultBytes', 'missionAuthorityCeilingDigest',
  ], 'delegation operation source descriptor');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-bounded-delegation-mission-operation-source-v1'
      || value.sourceKind !== 'bounded-delegation-coordinator'
      || value.sourceVersion !== '1.0.0') throw new Error('delegation source descriptor identity is invalid');
  for (const [key, label] of [
    ['delegationId', 'delegation id'],
    ['delegationInputDigest', 'delegation input'],
    ['delegationAuthorityDigest', 'delegation authority'],
    ['workerSetDigest', 'worker set'],
    ['missionAuthorityCeilingDigest', 'mission authority ceiling'],
  ]) digest(value[key], label);
  if (!Array.isArray(value.workerIds) || value.workerIds.length < 1 || value.workerIds.length > 3
      || value.workerIds.some((id) => !IDENTIFIER.test(id))
      || !same(value.workerIds, [...value.workerIds].sort())
      || value.workerCount !== value.workerIds.length
      || !Number.isSafeInteger(value.maxCompletionTokens) || value.maxCompletionTokens < 1
      || !Number.isSafeInteger(value.maxResultBytes) || value.maxResultBytes < 1) {
    throw new Error('delegation source descriptor bounds are invalid');
  }
  return value;
}

function verifyUsage(value) {
  exactKeys(value, ['inputTokens', 'cachedInputTokens', 'reasoningTokens', 'visibleOutputTokens', 'completionTokens'], 'delegation projection usage');
  for (const count of Object.values(value)) if (!Number.isSafeInteger(count) || count < 0) throw new Error('delegation projection usage is invalid');
  if (value.cachedInputTokens > value.inputTokens
      || value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens) throw new Error('delegation projection usage is incoherent');
  return value;
}

function verifyFixture(value) {
  exactKeys(value, [
    'assertions', 'description', 'dispatch', 'execution', 'fixtureDigest',
    'projection', 'protocolId', 'request', 'schemaVersion', 'sourceDescriptor',
  ], 'delegation mission-operation adapter fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-delegation-mission-operation-adapter-fixture-v1') throw new Error('delegation fixture identity is invalid');
  verifySourceDescriptor(value.sourceDescriptor);
  verifyMissionOperationDescription(value.description);
  if (value.description.sourceDescriptorDigest !== sha256Value(value.sourceDescriptor)) throw new Error('delegation source binding is invalid');
  verifyMissionOperationRequest(value.request, { description: value.description, dispatch: value.dispatch });
  exactKeys(value.execution, [
    'firstStatus', 'retryStatus', 'workerCalls', 'pendingFirstStatus',
    'pendingSecondStatus', 'pendingCalls', 'recoveryStatus', 'recoveryCalls',
  ], 'delegation fixture execution');
  if (value.execution.firstStatus !== 'completed' || value.execution.retryStatus !== 'completed'
      || value.execution.pendingFirstStatus !== 'pending' || value.execution.pendingSecondStatus !== 'completed'
      || value.execution.recoveryStatus !== 'completed'
      || !same(value.execution.pendingCalls, { execute: 1, reconcile: 2 })
      || !same(value.execution.recoveryCalls, { execute: 1, reconcile: 1 })
      || !Array.isArray(value.execution.workerCalls)
      || value.execution.workerCalls.length !== 2
      || value.execution.workerCalls.some((row) => !same(row, { execute: 1, reconcile: 1, workerId: row.workerId }))) throw new Error('delegation fixture execution evidence is invalid');
  exactKeys(value.projection, ['completedAt', 'resultBytes', 'resultDigest', 'startedAt', 'usage'], 'delegation fixture projection');
  digest(value.projection.resultDigest, 'delegation projection result');
  verifyUsage(value.projection.usage);
  if (!Number.isSafeInteger(value.projection.resultBytes) || value.projection.resultBytes < 1
      || value.projection.startedAt !== '2026-09-05T18:00:00.000Z'
      || value.projection.completedAt !== '2026-09-05T18:00:00.000Z') throw new Error('delegation fixture projection is invalid');
  if (!same(value.assertions, expectedAssertions) || Object.values(value.assertions).some((entry) => entry !== true)) throw new Error('delegation fixture assertions are invalid');
  digest(value.fixtureDigest, 'delegation fixture digest');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('delegation fixture digest mismatch');
  return value;
}

export function verifyDelegationMissionOperationAdapterReceipt(value) {
  exactKeys(value, [
    'certificationId', 'fixture', 'metrics', 'proofLimits', 'protocolId',
    'receiptDigest', 'requirements', 'review', 'schemaVersion', 'source',
    'status', 'testRuns',
  ], 'delegation mission-operation adapter receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.protocolId !== protocolId || value.status !== 'certified') throw new Error('delegation receipt identity is invalid');
  exactKeys(value.source, ['commit', 'historicalReceiptDigests', 'implementationManifest', 'parentAdapterReceipt', 'plan', 'specification', 'testManifest'], 'delegation receipt source');
  if (!COMMIT.test(value.source.commit) || !value.source.historicalReceiptDigests || typeof value.source.historicalReceiptDigests !== 'object' || Array.isArray(value.source.historicalReceiptDigests)) throw new Error('delegation receipt history is invalid');
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('delegation historical receipt path is invalid');
    digest(valueDigest, 'delegation historical receipt');
  }
  exactKeys(value.source.parentAdapterReceipt, ['certificationId', 'path', 'receiptDigest'], 'delegation parent receipt');
  if (value.source.parentAdapterReceipt.certificationId !== 'bounded-delegation-lifecycle-v1' || value.source.parentAdapterReceipt.path !== parentReceiptPath) throw new Error('delegation parent receipt identity is invalid');
  digest(value.source.parentAdapterReceipt.receiptDigest, 'delegation parent receipt');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[field], ['path', 'sha256'], `delegation ${field}`);
    if (value.source[field].path !== path) throw new Error(`delegation ${field} path mismatch`);
    digest(value.source[field].sha256, `delegation ${field}`);
  }
  for (const [field, paths] of [['implementationManifest', implementationFiles], ['testManifest', testFiles]]) {
    const manifest = value.source[field];
    exactKeys(manifest, ['digest', 'entries', 'paths'], `delegation ${field}`);
    if (!same(manifest.paths, paths) || !Array.isArray(manifest.entries) || manifest.entries.length !== paths.length || manifest.digest !== sha256Value(manifest.entries)) throw new Error(`delegation ${field} is invalid`);
    manifest.entries.forEach((entry, index) => {
      exactKeys(entry, ['bytes', 'path', 'sha256'], `delegation ${field} entry`);
      if (entry.path !== paths[index] || !DIGEST.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) throw new Error(`delegation ${field} entry is invalid`);
    });
  }
  exactKeys(value.fixture, ['fileSha256', 'logicalDigest', 'path', 'value'], 'delegation receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) throw new Error('delegation fixture binding is invalid');
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions) || !same(value.proofLimits, proofLimits)
      || !same(value.review, { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 })) throw new Error('delegation receipt evidence is invalid');
  verifyTestRuns(value.testRuns);
  digest(value.receiptDigest, 'delegation receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('delegation receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts')).filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildDelegationMissionOperationAdapterReceiptFromSource({ repositoryRoot, sourceCommit, testRuns } = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('delegation fixture is not canonical');
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
        certificationId: 'bounded-delegation-lifecycle-v1',
        path: parentReceiptPath,
        receiptDigest: JSON.parse(await gitText(repository, sourceCommit, parentReceiptPath)).receiptDigest,
      },
      specification: { path: specificationPath, sha256: sha256Text(await gitText(repository, sourceCommit, specificationPath)) },
      plan: { path: planPath, sha256: sha256Text(await gitText(repository, sourceCommit, planPath)) },
    },
    fixture: { path: fixturePath, fileSha256: sha256Text(fixtureText), logicalDigest: fixture.fixtureDigest, value: fixture },
    requirements: structuredClone(requirements),
    metrics: structuredClone(fixture.assertions),
    testRuns: structuredClone(testRuns),
    review: { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 },
    proofLimits: [...proofLimits],
  };
  return Object.freeze(verifyDelegationMissionOperationAdapterReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
}

async function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(repository, ...receiptPath.split('/'));
  await requireCleanExcept(repository, [...releaseOnlyPaths, 'package-lock.json']);
  const sourceCommit = await resolveSourceCommit({ root: repository, headCommit: await headCommit(repository), outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, repository);
  const preliminary = await buildDelegationMissionOperationAdapterReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full: { status: 'pass', tests: focused.tests } } });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildDelegationMissionOperationAdapterReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full } });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({ root: repository, certificationTestFile: 'tests/delegation-mission-operation-adapter-certification.test.mjs' });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Delegation mission-operation adapter v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the opt-in provider-neutral bridge from the certified bounded delegation lifecycle to one descriptor-bound mission-program step. It proves body-free input binding, exact worker-set and budget binding, pending preservation, compact aggregate projection, bounded recovery, and terminal replay without redispatch. It does not certify worker or model quality, child-process isolation, remote execution, quorum, nested delegation, scheduling, Realm action, continuity, identity, evolution, Soul, or Lunari integration.\n`;
  await writeFile(join(repository, ...certificationPath.split('/')), markdown, 'utf8');
  process.stdout.write(`${canonicalJson({ status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest, fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
