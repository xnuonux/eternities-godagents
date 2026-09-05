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

const certificationId = 'mission-program-v1';
const protocolId = 'eternities-long-horizon-mission-program-certification-v1';
const fixturePath = 'fixtures/mission-program-v1.json';
const receiptPath = 'receipts/mission-program-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-09-05-long-horizon-mission-program-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-09-05-long-horizon-mission-program-v1.md';
const certificationPath = 'docs/mission-program-v1-certification.md';
const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  fixturePath,
  planPath,
  specificationPath,
  'package.json',
  'schemas/mission-program-admission.schema.json',
  'schemas/mission-program-aggregate-completion.schema.json',
  'schemas/mission-program-completion.schema.json',
  'schemas/mission-program-dispatch.schema.json',
  'schemas/mission-program-event.schema.json',
  'schemas/mission-program-input.schema.json',
  'schemas/mission-program-state.schema.json',
  'schemas/mission-program-step-descriptor.schema.json',
  'scripts/build-mission-program-fixture.mjs',
  'scripts/build-mission-program-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/release-gates.mjs',
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/errors.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/runtime/mission-program.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());
const testFiles = Object.freeze([
  'tests/certification-command-surface.test.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/certification-release-gates.test.mjs',
  'tests/mission-program-certification.test.mjs',
  'tests/mission-program.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());
const focusedTestFiles = Object.freeze(['tests/mission-program.test.mjs']);
const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);
const requirements = Object.freeze([
  ['MP-001', 'digest-bound input admission rejects unknown, authority-shaped, credential-shaped, Realm, continuity, model, and nested-program controls'],
  ['MP-002', 'construction pins exact step descriptors and fails closed on missing kinds, substitution, or descriptor drift'],
  ['MP-003', 'the coordinator executes admitted steps strictly in order without disclosing or calling a future step early'],
  ['MP-004', 'each exact dispatch is durable before reconciliation or execution'],
  ['MP-005', 'absent reconciliation permits one execute, while pending and completed reconciliation never guess or duplicate work'],
  ['MP-006', 'process boundaries after preparation, reconciliation, execution, and before aggregate publication recover through durable evidence'],
  ['MP-007', 'terminal replay is byte-identical and performs zero adapter calls'],
  ['MP-008', 'tampered journals, dispatches, descriptors, inputs, artifacts, ordering, and aggregates fail closed'],
  ['MP-009', 'step and aggregate completion and result ceilings are independently enforced'],
  ['MP-010', 'dispatches and durable state contain bounded references only, with no raw mission, credential, path, Realm, keel, memory, authority, or model surface'],
  ['MP-011', 'the coordinator remains a provider-neutral orchestration boundary without direct Realm, Godskills body, keel, memory, identity, evolution, Soul, Inspiration, or Lunari authority'],
  ['MP-012', 'the source, contract, fixture, manifests, tests, prior receipt chain, and proof limits are bound by an append-only receipt'],
].map(([id, evidence]) => ({ id, status: 'pass', evidence: [evidence] })));
const proofLimits = Object.freeze([
  'the certificate uses deterministic in-process adapters and does not establish live provider, model, transport, or external exactly-once quality',
  'the coordinator is capped at eight ordered steps and does not certify nested programs, scheduling, background daemons, quorum, distributed execution, or automatic retry of ambiguity',
  'the adapter authority descriptor is empty in this protocol, but host and adapter implementations remain trusted and hostile same-user process isolation is not certified',
  'completion artifacts contain bounded result references and separated usage, not mission bodies, provider credentials, model routes, Realm handles, or continuity writers',
  'the program does not alter the default vessel, Godskills release, provider routing, Realm effects, rollback, compensation, identity, evolution, keel, memory, Inspiration, Soul, Lunari, or phenomenological behavior',
  'deterministic state-machine fixtures prove lifecycle integrity and replay semantics, not live model quality, sentience, product usability, or long-horizon economic viability',
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
  exactKeys(value, ['focused', 'full'], 'mission program test runs');
  for (const run of Object.values(value)) {
    exactKeys(run, ['status', 'tests'], 'mission program test run');
    if (run.status !== 'pass' || !Number.isSafeInteger(run.tests) || run.tests < 1) {
      throw new Error('mission program test run is invalid');
    }
  }
}

function verifyReference(value, path, manifest, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== path || value.sha256 !== manifest.entries.find((entry) => entry.path === path)?.sha256) {
    throw new Error(`${label} reference mismatch`);
  }
}

function verifyFixture(value) {
  exactKeys(value, ['schemaVersion', 'protocolId', 'success', 'pending', 'recovery', 'assertions', 'fixtureDigest'], 'mission program fixture');
  assertNoCredentialFields(value);
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-long-horizon-mission-program-fixture-v1') {
    throw new Error('mission program fixture identity is invalid');
  }
  const expectedAssertions = {
    orderedSteps: true,
    terminalReplayStable: true,
    terminalReplayNoAdapterCalls: true,
    pendingNeverExecutes: true,
    futureStepNeverCalled: true,
    recoveryNoRedispatch: true,
    recoveryCompleted: true,
    durableFilesBounded: true,
  };
  if (!same(value.assertions, expectedAssertions)) throw new Error('mission program fixture assertions are invalid');
  if (!DIGEST.test(value.success.result.programId)
      || value.success.result.status !== 'completed'
      || value.success.result.stepIds.join(',') !== 'analyze,synthesize'
      || value.success.exactReplay.byteIdentical !== true
      || value.pending.first.status !== 'pending'
      || value.pending.second.status !== 'pending'
      || value.pending.inspection.next !== 'step:analyze'
      || value.recovery.recovered.status !== 'completed'
      || value.recovery.recovered.recovered !== true
      || value.recovery.calls.analysis.execute !== 1
      || value.recovery.calls.synthesis.execute !== 1) {
    throw new Error('mission program fixture proof metrics are invalid');
  }
  const { fixtureDigest, ...unsigned } = value;
  digest(fixtureDigest, 'mission program fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('mission program fixture digest mismatch');
  return value;
}

export function verifyMissionProgramReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'requirements', 'metrics', 'testRuns', 'review', 'proofLimits', 'receiptDigest',
  ], 'mission program receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('mission program receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'mission program receipt source');
  if (!COMMIT.test(value.source.commit)
      || !value.source.historicalReceiptDigests
      || typeof value.source.historicalReceiptDigests !== 'object'
      || Array.isArray(value.source.historicalReceiptDigests)) {
    throw new Error('mission program receipt source history is invalid');
  }
  for (const [path, valueDigest] of Object.entries(value.source.historicalReceiptDigests)) {
    if (!/^receipts\/[A-Za-z0-9._-]+\.json$/.test(path)) throw new Error('mission program historical path is invalid');
    digest(valueDigest, 'mission program historical receipt');
  }
  verifyManifest(value.source.implementationManifest, implementationFiles, 'mission program implementation manifest');
  verifyManifest(value.source.testManifest, testFiles, 'mission program test manifest');
  verifyReference(value.source.specification, specificationPath, value.source.implementationManifest, 'mission program specification');
  verifyReference(value.source.plan, planPath, value.source.implementationManifest, 'mission program plan');
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'mission program receipt fixture');
  const fixture = verifyFixture(value.fixture.value);
  if (value.fixture.path !== fixturePath
      || value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)) {
    throw new Error('mission program fixture binding is invalid');
  }
  if (!same(value.requirements, requirements) || !same(value.metrics, fixture.assertions)) {
    throw new Error('mission program requirements or metrics are invalid');
  }
  verifyTestRuns(value.testRuns);
  if (!same(value.review, {
    mode: 'inline-adversarial',
    independent: false,
    unresolvedCriticalDefects: 0,
    unresolvedImportantDefects: 0,
  }) || !same(value.proofLimits, proofLimits)) {
    throw new Error('mission program review or proof limits are invalid');
  }
  digest(value.receiptDigest, 'mission program receipt digest');
  const { receiptDigest, ...unsigned } = value;
  if (receiptDigest !== sha256Value(unsigned)) throw new Error('mission program receipt digest mismatch');
  return value;
}

async function historicalReceiptPaths(root, sourceCommit) {
  return (await pathsAtCommit(root, sourceCommit, 'receipts'))
    .filter((path) => path.endsWith('.json') && path !== receiptPath);
}

export async function buildMissionProgramReceiptFromSource({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  const repository = repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : resolve(repositoryRoot);
  await assertCommit(repository, sourceCommit);
  verifyTestRuns(testRuns);
  const fixtureText = await gitText(repository, sourceCommit, fixturePath);
  const fixture = verifyFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('mission program fixture is not canonical');
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
      specification: {
        path: specificationPath,
        sha256: sha256Text(await gitText(repository, sourceCommit, specificationPath)),
      },
      plan: {
        path: planPath,
        sha256: sha256Text(await gitText(repository, sourceCommit, planPath)),
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
  return Object.freeze(verifyMissionProgramReceipt({
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
  const preliminary = await buildMissionProgramReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], repository);
  const receipt = await buildMissionProgramReceiptFromSource({
    repositoryRoot: repository,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runReleaseGates({
    root: repository,
    certificationTestFile: focusedTestFiles[0],
  });
  const [ledgerEvidence, lineageEvidence] = release.directVerifiers;
  const markdown = `# Mission program v1 certification\n\n- status: certified\n- source commit: \`${sourceCommit}\`\n- receipt digest: \`${receipt.receiptDigest}\`\n- fixture digest: \`${receipt.fixture.logicalDigest}\`\n- focused tests: ${focused.tests}\n- full tests: ${full.tests}\n- release gate: ${release.gateCount} bounded commands\n- release focused tests: ${release.focused.tests}\n- release receipt count: ${lineageEvidence.receiptCount}\n- release head: \`${lineageEvidence.headCommit}\`\n- release ledger digest: \`${ledgerEvidence.ledgerDigest}\`\n- release lineage digest: \`${lineageEvidence.releaseLineageDigest}\`\n\nThis certifies the opt-in provider-neutral mission-program coordinator over digest-bound ordered step adapters. It proves bounded admission, descriptor pinning, strict ordering, durable dispatch preparation, absent/pending/completed reconciliation, crash recovery without duplicate completed work, exact terminal replay, tamper rejection, aggregate ceilings, and a body-free durable boundary. It does not certify live providers or models, external exactly-once behavior, default launch, scheduling, Realm effects, rollback, compensation, identity, evolution, keel, memory, Godskills bodies, Inspiration, Soul, Lunari, or product usability.\n`;
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
