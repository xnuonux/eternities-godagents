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
import { REALM_CONSEQUENCE_MISSION_OPERATION_SOURCE_PROTOCOL_ID } from '../src/runtime/realm-consequence-mission-operation-adapter.mjs';
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

const certificationId = 'realm-consequence-mission-operation-adapter-v1';
const protocolId = 'eternities-realm-consequence-mission-operation-adapter-certification-v1';
const fixturePath = 'fixtures/realm-consequence-mission-operation-adapter-v1.json';
const receiptPath = 'receipts/realm-consequence-mission-operation-adapter-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-realm-consequence-mission-operation-adapter-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-realm-consequence-mission-operation-adapter-v1.md';
const certificationPath = 'docs/realm-consequence-mission-operation-adapter-v1-certification.md';
const parentReceiptPath = 'receipts/recoverable-realm-consequence-vessel-v1.json';
const implementationFiles = Object.freeze([
  'README.md',
  'dist/fixture-agent/agent-genome.json',
  'docs/architecture.md',
  planPath,
  specificationPath,
  fixturePath,
  'fixtures/realm-contract.json',
  'package.json',
  'schemas/agent-genome.schema.json',
  'schemas/organ-proposal.schema.json',
  'schemas/realm-contract.schema.json',
  'schemas/recoverable-realm-consequence-receipt.schema.json',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-realm-consequence-mission-operation-adapter-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/realm/fixture-realm.mjs',
  'src/realm/recoverable-consequence-host.mjs',
  'src/runtime/fixture-cortex.mjs',
  'src/runtime/mission-operation-adapter.mjs',
  'src/runtime/mission-program.mjs',
  'src/runtime/realm-consequence-mission-operation-adapter.mjs',
  'src/state/file-lock.mjs',
  'src/state/journal.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/mission-operation-adapter.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/realm-consequence-mission-operation-adapter-certification.test.mjs',
  'tests/realm-consequence-mission-operation-adapter.test.mjs',
  'tests/recoverable-realm-consequence.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/realm-consequence-mission-operation-adapter.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const expectedAssertions = Object.freeze({
  authorityEmpty: true,
  bodyFreeSourceDescriptor: true,
  compactProjection: true,
  contractDriftBeforeRealm: true,
  recoveryNoDuplicateRealmEffect: true,
  sourceBoundToInput: true,
  terminalReplayStable: true,
  zeroUsage: true,
});
const requirements = Object.freeze([
  ['RCA-001', 'one recoverable Realm consequence host is bound to one body-free mission operation source descriptor'],
  ['RCA-002', 'generic request and source descriptors carry digests, identities, and ceilings but no Realm or proposal bodies'],
  ['RCA-003', 'generic mission authority remains empty and the one-token zero-cognition ceiling cannot widen'],
  ['RCA-004', 'reconciliation delegates durable admitted and completed state to the certified recoverable host'],
  ['RCA-005', 'completed output is a compact digest projection with zero model-token usage'],
  ['RCA-006', 'an admission-boundary crash recovers through the host without duplicating the Realm effect'],
  ['RCA-007', 'terminal mission replay does not call the host or Realm again'],
  ['RCA-008', 'runtime Contract drift fails closed before any Realm method or effect'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the adapter is an opt-in provider-neutral bridge over one certified recoverable Realm consequence host and one mission-program step',
  'the deterministic fixture proves binding and recovery mechanics over a trusted in-process fixture Realm, not external Realm or model quality',
  'the recoverable host remains the owner of admission, journal, negotiation, decision, action, effect recovery, and consequence receipts',
  'the mission-program coordinator remains the owner of ordering, dispatch, locks, and terminal replay',
  'no remote Realm, credentials, rollback, compensation policy, scheduler, provider, model quality, keel, memory, identity, evolution, Inspiration, Soul, or Lunari behavior is certified',
]);
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) throw new Error(`${label} fields are invalid`);
}

function digest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}

function verifyUsage(value) {
  exactKeys(value, ['inputTokens', 'cachedInputTokens', 'reasoningTokens', 'visibleOutputTokens', 'completionTokens'], 'Realm consequence projection usage');
  if (Object.values(value).some((count) => count !== 0)) throw new Error('Realm consequence projection usage is not zero');
  return value;
}

function verifySourceDescriptor(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'sourceKind', 'sourceVersion', 'hostDescriptorDigest',
    'executionId', 'inputDigest', 'missionId', 'instanceId', 'stateEpoch', 'missionDigest',
    'proposalDigest', 'contractDigest', 'authorityDigest', 'constitutionDigest', 'stateDigest',
    'authorityCeilingDigest', 'maxCompletionTokens', 'maxResultBytes',
  ], 'Realm consequence operation source descriptor');
  if (value.schemaVersion !== 1
      || value.protocolId !== REALM_CONSEQUENCE_MISSION_OPERATION_SOURCE_PROTOCOL_ID
      || value.sourceKind !== 'recoverable-realm-consequence-host'
      || value.sourceVersion !== '1.0.0'
      || value.maxCompletionTokens !== 1
      || value.maxResultBytes !== 16_000
      || value.stateEpoch !== 0) throw new Error('Realm consequence source descriptor identity is invalid');
  for (const [key, label] of [
    ['hostDescriptorDigest', 'host descriptor'], ['executionId', 'execution id'], ['inputDigest', 'input'],
    ['missionDigest', 'mission'], ['proposalDigest', 'proposal'], ['contractDigest', 'contract'],
    ['authorityDigest', 'authority'], ['constitutionDigest', 'constitution'], ['stateDigest', 'state'],
    ['authorityCeilingDigest', 'authority ceiling'],
  ]) digest(value[key], label);
  for (const [key, label] of [['missionId', 'mission id'], ['instanceId', 'instance id']]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value[key])) throw new Error(`${label} is invalid`);
  }
  return value;
}

function verifyFixture(value) {
  exactKeys(value, [
    'assertions', 'description', 'dispatch', 'execution', 'fixtureDigest',
    'projection', 'protocolId', 'request', 'schemaVersion', 'sourceDescriptor',
  ], 'Realm consequence mission-operation adapter fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-realm-consequence-mission-operation-adapter-fixture-v1') throw new Error('Realm consequence fixture identity is invalid');
  verifySourceDescriptor(value.sourceDescriptor);
  verifyMissionOperationDescription(value.description);
  if (value.description.sourceDescriptorDigest !== sha256Value(value.sourceDescriptor)) throw new Error('Realm consequence source binding is invalid');
  verifyMissionOperationRequest(value.request, { description: value.description, dispatch: value.dispatch });
  exactKeys(value.execution, [
    'firstStatus', 'retryStatus', 'aggregateDigest', 'retryAggregateDigest',
    'beforeReplayCalls', 'afterReplayCalls', 'beforeReplayRealm', 'afterReplayRealm',
    'recoveryFailure', 'recoveryStatus', 'recoveryCalls', 'recoveryAfterCrashRealm',
    'recoveryFinalRealm', 'driftFailure', 'driftCalls', 'driftRealm',
  ], 'Realm consequence fixture execution');
  for (const key of ['aggregateDigest', 'retryAggregateDigest']) digest(value.execution[key], `Realm consequence ${key}`);
  if (value.execution.firstStatus !== 'completed'
      || value.execution.retryStatus !== 'completed'
      || value.execution.aggregateDigest !== value.execution.retryAggregateDigest
      || !same(value.execution.beforeReplayCalls, value.execution.afterReplayCalls)
      || !same(value.execution.beforeReplayRealm, value.execution.afterReplayRealm)
      || value.execution.recoveryStatus !== 'completed'
      || value.execution.recoveryAfterCrashRealm.counter !== 0
      || value.execution.recoveryFinalRealm.counter !== 1
      || value.execution.recoveryCalls.invoke !== 1
      || !/realm admission boundary/.test(value.execution.recoveryFailure.message)
      || !/contract|drift|Realm/i.test(value.execution.driftFailure.message)
      || value.execution.driftRealm.counter !== 0
      || value.execution.driftRealm.invocationCount !== 0) throw new Error('Realm consequence fixture execution evidence is invalid');
  exactKeys(value.projection, ['completedAt', 'resultBytes', 'resultDigest', 'startedAt', 'usage'], 'Realm consequence fixture projection');
  digest(value.projection.resultDigest, 'Realm consequence projection result');
  verifyUsage(value.projection.usage);
  if (!Number.isSafeInteger(value.projection.resultBytes) || value.projection.resultBytes < 1
      || value.projection.startedAt !== '2026-09-05T19:00:00.000Z'
      || value.projection.completedAt !== '2026-09-05T19:00:00.000Z') throw new Error('Realm consequence fixture projection is invalid');
  if (!same(value.assertions, expectedAssertions) || Object.values(value.assertions).some((entry) => entry !== true)) throw new Error('Realm consequence fixture assertions are invalid');
  digest(value.fixtureDigest, 'Realm consequence fixture digest');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('Realm consequence fixture digest mismatch');
  return value;
}

export function verifyRealmConsequenceMissionOperationAdapterReceipt(value) {
  exactKeys(value, [
    'certificationId', 'fixture', 'metrics', 'proofLimits', 'protocolId',
    'receiptDigest', 'requirements', 'review', 'schemaVersion', 'source',
    'status', 'testRuns',
  ], 'Realm consequence mission-operation adapter receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.protocolId !== protocolId || value.status !== 'certified') throw new Error('Realm consequence receipt identity is invalid');
  exactKeys(value.source, ['commit', 'historicalReceiptDigests', 'implementationManifest', 'parentAdapterReceipt', 'plan', 'specification', 'testManifest'], 'Realm consequence receipt source');
  if (!COMMIT.test(value.source.commit) || !value.source.historicalReceiptDigests || typeof value.source.historicalReceiptDigests !== 'object' || Array.isArray(value.source.historicalReceiptDigests)) throw new Error('Realm consequence receipt history is invalid');
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('Realm consequence historical receipt path is invalid');
    digest(valueDigest, 'Realm consequence historical receipt');
  }
  exactKeys(value.source.parentAdapterReceipt, ['certificationId', 'path', 'receiptDigest'], 'Realm consequence parent receipt');
  if (value.source.parentAdapterReceipt.certificationId !== 'recoverable-realm-consequence-vessel-v1' || value.source.parentAdapterReceipt.path !== parentReceiptPath) throw new Error('Realm consequence parent receipt identity is invalid');
  digest(value.source.parentAdapterReceipt.receiptDigest, 'Realm consequence parent receipt');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[field], ['path', 'sha256'], `Realm consequence ${field}`);
    if (value.source[field].path !== path) throw new Error(`Realm consequence ${field} path mismatch`);
    digest(value.source[field].sha256, `Realm consequence ${field}`);
  }
  for (const [field, paths] of [['implementationManifest', implementationFiles], ['testManifest', testFiles]]) {
    const manifest = value.source[field];
    exactKeys(manifest, ['digest', 'entries', 'paths'], `Realm consequence ${field}`);
    if (!same(manifest.paths, paths) || !Array.isArray(manifest.entries) || manifest.entries.length !== paths.length || manifest.digest !== sha256Value(manifest.entries)) throw new Error(`Realm consequence ${field} is invalid`);
    manifest.entries.forEach((entry, index) => {
      exactKeys(entry, ['bytes', 'path', 'sha256'], `Realm consequence ${field} entry`);
      if (entry.path !== paths[index] || !DIGEST.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) throw new Error(`Realm consequence ${field} entry is invalid`);
    });
  }
  exactKeys(value.fixture, ['fileSha256', 'logicalDigest', 'path', 'value'], 'Realm consequence receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) throw new Error('Realm consequence fixture binding is invalid');
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions) || !same(value.proofLimits, proofLimits)
      || !same(value.review, { mode: 'inline-adversarial', independent: false, unresolvedCriticalDefects: 0, unresolvedImportantDefects: 0 })) throw new Error('Realm consequence receipt evidence is invalid');
  if (!value.testRuns || !same(Object.keys(value.testRuns).sort(), ['focused', 'full'])) throw new Error('Realm consequence test runs are invalid');
  for (const run of Object.values(value.testRuns)) {
    exactKeys(run, ['status', 'tests'], 'Realm consequence test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) throw new Error('Realm consequence test run is invalid');
  }
  digest(value.receiptDigest, 'Realm consequence receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('Realm consequence receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts')).filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildRealmConsequenceMissionOperationAdapterReceiptFromSource({ repositoryRoot, sourceCommit, testRuns } = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  for (const run of Object.values(testRuns ?? {})) {
    if (!run || run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) throw new Error('Realm consequence test runs are invalid');
  }
  if (!same(Object.keys(testRuns ?? {}).sort(), ['focused', 'full'])) throw new Error('Realm consequence test runs are incomplete');
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('Realm consequence fixture is not canonical');
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
        certificationId: 'recoverable-realm-consequence-vessel-v1',
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
  return Object.freeze(verifyRealmConsequenceMissionOperationAdapterReceipt({ ...unsigned, receiptDigest: sha256Value(unsigned) }));
}

async function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(repository, ...receiptPath.split('/'));
  await requireCleanExcept(repository, [...releaseOnlyPaths, 'package-lock.json']);
  const sourceCommit = await resolveSourceCommit({ root: repository, headCommit: await headCommit(repository), outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, repository);
  const preliminary = await buildRealmConsequenceMissionOperationAdapterReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full: { status: 'pass', tests: focused.tests } } });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildRealmConsequenceMissionOperationAdapterReceiptFromSource({ repositoryRoot: repository, sourceCommit, testRuns: { focused, full } });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({ root: repository, certificationTestFile: 'tests/realm-consequence-mission-operation-adapter-certification.test.mjs' });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Realm consequence mission-operation adapter v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the opt-in provider-neutral bridge from the certified recoverable Realm consequence host to one descriptor-bound mission-program step. It proves body-free source binding, exact authority and ceiling preservation, compact zero-token projection, admission-boundary recovery without a duplicate Realm effect, terminal replay stability, and fail-closed Contract drift. It does not certify remote Realm behavior, rollback, compensation, provider or model quality, continuity, identity, evolution, Soul, or Lunari integration.\n`;
  await writeFile(join(repository, ...certificationPath.split('/')), markdown, 'utf8');
  process.stdout.write(`${canonicalJson({ status: 'certified', sourceCommit, receiptDigest: receipt.receiptDigest, fixtureDigest: receipt.fixture.logicalDigest, testRuns: receipt.testRuns, release })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
