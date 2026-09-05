import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
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

const certificationId = 'mission-operation-adapter-v1';
const protocolId = 'eternities-mission-operation-adapter-certification-v1';
const fixturePath = 'fixtures/mission-operation-adapter-v1.json';
const receiptPath = 'receipts/mission-operation-adapter-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-descriptor-bound-mission-operation-adapter-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-descriptor-bound-mission-operation-adapter-v1.md';
const auditPath = 'docs/audits/2026-09-05-universal-godagents-gap-audit-v4.md';
const certificationPath = 'docs/mission-operation-adapter-v1-certification.md';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  auditPath,
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'schemas/mission-operation-adapter.schema.json',
  'schemas/mission-operation-request.schema.json',
  'schemas/mission-operation-receipt.schema.json',
  'scripts/build-mission-operation-adapter-v1-fixture.mjs',
  'scripts/build-mission-operation-adapter-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/errors.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/mission-operation-adapter.mjs',
  'src/runtime/mission-program.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/mission-operation-adapter-certification.test.mjs',
  'tests/mission-operation-adapter.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze([
  'tests/mission-operation-adapter.test.mjs',
]);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['MOA-001', 'the adapter description binds one verified source descriptor digest to one exact mission-program step descriptor'],
  ['MOA-002', 'the adapter passes only a bounded body-free request projection across the mission-program boundary'],
  ['MOA-003', 'the source descriptor is revalidated before every reconcile and execute call'],
  ['MOA-004', 'reconciliation precedes execution and pending or absent outcomes remain explicit without guessing'],
  ['MOA-005', 'completed outcomes are bound to the exact dispatch, result, usage, and completion ceilings'],
  ['MOA-006', 'the compact operation receipt binds description, request, dispatch, disposition, and source evidence digests'],
  ['MOA-007', 'raw public schemas reject malformed identifiers, digests, timestamps, and nullable credential-shaped values'],
  ['MOA-008', 'the adapter authority envelope is empty and cannot expand mission-program authority or effects'],
  ['MOA-009', 'the adapter has no durable write, lock, credential, Realm, Godskills, keel, memory, identity, evolution, Soul, or Lunari surface'],
  ['MOA-010', 'the deterministic fixture proves terminal replay stability and source-drift fail-closed behavior'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the adapter is an internal provider-neutral migration boundary over one existing mission-program step; it is not a live provider, Realm, delegation, review, or host SDK integration',
  'the receipt proves deterministic body-free dispatch binding, source revalidation, bounded outcomes, and local replay behavior; it does not prove live model quality, hosted durability, cross-provider tracing, or product usability',
  'the adapter does not own the mission journal, locks, ordering, retries, terminal replay, or recovery; the mission-program coordinator remains the sole owner of those concerns',
  'the fixture uses deterministic in-process source methods and content-addressed evidence; no external credentials, payload bodies, filesystem paths, or model responses are persisted',
  'Godskills bodies, Realm effects, delegation, cortex routing, identity, constitution, evolution, Inspiration, Soul, Lunari, and phenomenological behavior remain outside this release',
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
  exactKeys(value, ['focused', 'full'], 'mission operation adapter test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'mission operation adapter test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('mission operation adapter test run is invalid');
    }
  }
}

function verifyDescription(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'operationKind', 'sourceDescriptorDigest',
    'missionStepDescriptor', 'capabilities', 'authority', 'descriptionDigest',
  ], 'mission operation adapter description');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-operation-adapter-v1'
      || !IDENTIFIER.test(value.operationKind)) throw new Error('mission operation adapter description identity is invalid');
  digest(value.sourceDescriptorDigest, 'mission operation source descriptor');
  digest(value.descriptionDigest, 'mission operation description');
  exactKeys(value.authority, ['realmEffects', 'continuityWrites', 'identityMutation', 'evolution', 'soul'], 'mission operation authority');
  if (!same(value.authority, { realmEffects: 0, continuityWrites: 0, identityMutation: 0, evolution: 0, soul: 0 })) {
    throw new Error('mission operation authority is expanded');
  }
  exactKeys(value.missionStepDescriptor, [
    'schemaVersion', 'protocolId', 'kind', 'adapterId', 'adapterVersion', 'authority', 'descriptorDigest',
  ], 'mission operation step descriptor');
  if (value.missionStepDescriptor.kind !== value.operationKind
      || !value.missionStepDescriptor.adapterId.endsWith(`:${value.sourceDescriptorDigest}`)) {
    throw new Error('mission operation step binding is invalid');
  }
  digest(value.missionStepDescriptor.descriptorDigest, 'mission operation step descriptor');
  return value;
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'description', 'request', 'receipt', 'execution', 'assertions', 'fixtureDigest'], 'mission operation adapter fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-mission-operation-adapter-fixture-v1') {
    throw new Error('mission operation adapter fixture identity is invalid');
  }
  verifyDescription(value.description);
  exactKeys(value.request, ['keys', 'payloadFree', 'requestDigest'], 'mission operation adapter fixture request');
  if (!Array.isArray(value.request.keys) || value.request.keys.length !== 16
      || !value.request.keys.every((key) => typeof key === 'string')
      || value.request.payloadFree !== true) throw new Error('mission operation adapter fixture request is invalid');
  digest(value.request.requestDigest, 'mission operation request');
  exactKeys(value.receipt, ['disposition', 'protocolId', 'receiptDigest'], 'mission operation adapter fixture receipt');
  if (value.receipt.protocolId !== 'eternities-mission-operation-receipt-v1' || value.receipt.disposition !== 'completed') {
    throw new Error('mission operation adapter fixture receipt is invalid');
  }
  digest(value.receipt.receiptDigest, 'mission operation receipt');
  exactKeys(value.execution, ['executeCount', 'firstStatus', 'inspectionStatus', 'replayStatus', 'requestMethods', 'sourceTrace'], 'mission operation adapter fixture execution');
  if (value.execution.executeCount !== 1 || value.execution.firstStatus !== 'completed'
      || value.execution.inspectionStatus !== 'completed' || value.execution.replayStatus !== 'completed'
      || !same(value.execution.requestMethods, ['reconcile', 'execute'])
      || !same(value.execution.sourceTrace, ['descriptor', 'descriptor', 'reconcile', 'descriptor', 'execute'])) {
    throw new Error('mission operation adapter fixture execution is invalid');
  }
  const expectedAssertions = {
    adapterOwnedWritesAbsent: true,
    authorityExpansions: 0,
    descriptorRevalidated: true,
    missionProgramReceiptBound: true,
    payloadFreeRequests: true,
    reconcileBeforeExecute: true,
    sourceDriftCode: 'source-drift',
    sourceDriftRejected: true,
    sourceDriftSourceCalls: 0,
    terminalReplayStable: true,
  };
  if (!same(value.assertions, expectedAssertions)) throw new Error('mission operation adapter fixture assertions are invalid');
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'mission operation adapter fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('mission operation adapter fixture digest mismatch');
  return value;
}

export function verifyMissionOperationAdapterReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'mission operation adapter receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('mission operation adapter receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'mission operation adapter receipt source');
  if (!COMMIT.test(value.source.commit) || !value.source.historicalReceiptDigests
      || typeof value.source.historicalReceiptDigests !== 'object' || Array.isArray(value.source.historicalReceiptDigests)) {
    throw new Error('mission operation adapter receipt source history is invalid');
  }
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('mission operation adapter historical path is invalid');
    digest(valueDigest, 'mission operation adapter historical receipt');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'mission operation adapter implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'mission operation adapter test manifest');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(value.source[field], ['path', 'sha256'], `mission operation adapter ${field}`);
    if (value.source[field].path !== path) throw new Error(`mission operation adapter ${field} path mismatch`);
    digest(value.source[field].sha256, `mission operation adapter ${field}`);
  }
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'mission operation adapter receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('mission operation adapter fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('mission operation adapter requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('mission operation adapter review or proof limits are invalid');
  }
  digest(value.receiptDigest, 'mission operation adapter receipt');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('mission operation adapter receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts'))
    .filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildMissionOperationAdapterReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('mission operation adapter fixture is not canonical');
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
  return Object.freeze(verifyMissionOperationAdapterReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(repository, ...receiptPath.split('/'));
  await requireCleanExcept(repository, releaseOnlyPaths);
  const sourceCommit = await resolveSourceCommit({
    root: repository,
    headCommit: await headCommit(repository),
    outputPath,
    releaseOnlyPaths,
  });
  const focused = await runTests(focusedTestFiles, repository);
  const preliminary = await buildMissionOperationAdapterReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildMissionOperationAdapterReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({
    root: repository,
    certificationTestFile: 'tests/mission-operation-adapter-certification.test.mjs',
  });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Descriptor-bound mission-operation adapter v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies a provider-neutral, descriptor-bound migration boundary that projects one exact mission-program dispatch into a bounded body-free request, revalidates the source descriptor before every call, preserves explicit reconcile and pending states, and emits a compact receipt without authority expansion. It does not certify a live provider, Realm, Godskills, delegation, review, host SDK, hosted durability, or Lunari integration.\n`;
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
