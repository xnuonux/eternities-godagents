import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicGodskillsTypedCompositionConsumerFixture } from '../tests/helpers/godskills-typed-composition-consumer-fixture.mjs';
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

export { buildDeterministicGodskillsTypedCompositionConsumerFixture };

const certificationId = 'godskills-typed-composition-consumer-v1';
const protocolId = 'eternities-godagents-typed-composition-consumer-certification-v1';
const fixturePath = 'fixtures/godskills-typed-composition-consumer-v1.json';
const receiptPath = 'receipts/godskills-typed-composition-consumer-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-godskills-typed-composition-consumer-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-godskills-typed-composition-consumer-v1.md';
const certificationPath = 'docs/godskills-typed-composition-consumer-v1-certification.md';
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
  'receipts/signed-openai-phase-resolution-v1.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  fixturePath,
  planPath,
  'schemas/godskills-typed-composition-pin.schema.json',
  'scripts/build-godskills-typed-composition-consumer-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-typed-composition.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/skills/typed-composition-adapter.mjs',
  'src/skills/typed-composition-verifier.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/godskills-typed-composition-consumer-certification.test.mjs',
  'tests/godskills-typed-composition-consumer.test.mjs',
  'tests/helpers/godskills-typed-composition-consumer-fixture.mjs',
  'tests/helpers/sealed-local-godskills-transport-certification-fixture.mjs',
  'tests/release-lineage.test.mjs',
  'tests/sealed-local-godskills-transport-certification.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/godskills-typed-composition-consumer.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'GTC-001': ['one static sidecar pins the exact pushed Godskills commit receipt module policy parents and canary roots'],
  'GTC-002': ['every release source module declared artifact generated artifact and parent file is verified byte-for-byte'],
  'GTC-003': ['repository-relative regular-file containment rejects aliases traversal symlinks and conflicting descriptors'],
  'GTC-004': ['the release verifier returns one frozen module-private provenance brand'],
  'GTC-005': ['the complete source closure is rechecked immediately before the exact module is imported'],
  'GTC-006': ['registry reconstruction binds the exact policy capability-layer receipt and activation trust root'],
  'GTC-007': ['the checked Muse-to-Forge plan and method recompile to the published Godskills digests'],
  'GTC-008': ['deterministic host executors reproduce the exact published execution digest and four terminal outputs'],
  'GTC-009': ['method and reviewer bodies remain unread with zero embedded or transported source bodies'],
  'GTC-010': ['authority remains closed and the adapter is absent from every default launch path'],
  'GTC-011': ['pin byte plan activation method executor input and output drift fail closed'],
  'GTC-012': ['fixture receipt ledger and release lineage reproduce from one exact source commit'],
  'GTC-013': ['the existing sealed transport fixture records its declared static routing source rather than ambient Godskills HEAD'],
});

const retainedRegressions = Object.freeze([
  'rejects changed release receipt module policy parent schema source test and generated bytes',
  'rejects noncanonical paths extra pin fields and changed source coordinates',
  'rejects forged verification and adapter lookalikes',
  'rejects missing module exports before adapter exposure',
  'rejects context overflow and changed activation identity',
  'rejects foreign serialized methods without compiler provenance',
  'rejects missing executors malformed mission inputs and malformed outputs',
  'preserves exact Muse-to-Forge handoff and terminal output evidence',
  'preserves sealed local transport evidence when the ambient Godskills checkout advances',
]);

const proofLimits = Object.freeze([
  'structurally-verified-activation-result-not-origin-authentication',
  'deterministic-injected-executors-not-real-skill-or-model-quality',
  'in-process-reference-execution-not-durable-recovery',
  'no-retry-scheduling-persistence-or-exactly-once-external-effects',
  'no-provider-credential-routing-realm-continuity-keel-evolution-lunari-inspiration-or-soul-authority',
  'no-default-launch-path-or-existing-vessel-migration',
  'no-hostile-same-user-operating-system-isolation',
  'inline-adversarial-review-only',
]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function requireDigest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} digest is invalid`);
}

function validateTestRuns(value) {
  exactKeys(value, ['focused', 'full'], 'certification test runs');
  for (const [name, run] of Object.entries(value)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run did not pass`);
    }
  }
}

function verifyManifest(value, paths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!sameArray(value.paths, paths) || !Array.isArray(value.entries)
      || !sameArray(value.entries.map(({ path }) => path), paths)) {
    throw new Error(`${label} paths are invalid`);
  }
  for (const entry of value.entries) {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    requireDigest(entry.sha256, `${label} entry`);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} byte count is invalid`);
  }
  requireDigest(value.digest, label);
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} logical digest mismatch`);
}

export function verifyGodskillsTypedCompositionConsumerFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'composition', 'execution',
    'evidence', 'assertions', 'fixtureDigest',
  ], 'typed composition consumer fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-godagents-typed-composition-consumer-fixture-v1') {
    throw new Error('typed composition consumer fixture identity is invalid');
  }
  exactKeys(value.godskills, [
    'sourceCommit', 'releaseReceiptDigest', 'capabilityLayerReceiptDigest',
    'activationTrustRootDigest', 'registryDigest',
  ], 'fixture Godskills roots');
  exactKeys(value.composition, [
    'missionId', 'activationResultDigest', 'planDigest', 'methodDigest',
    'executionDigest', 'nodes', 'links', 'missionOutputs',
  ], 'fixture composition');
  exactKeys(value.execution, ['outputs', 'receipt', 'acceptanceRiskBoundary'], 'fixture execution');
  exactKeys(value.evidence, [
    'sourceModules', 'declaredArtifacts', 'generatedArtifacts',
    'observedArtifactFiles', 'capabilityMethodOrReviewerBodyReads',
  ], 'fixture evidence');
  exactKeys(value.assertions, [
    'exactReleaseVerified', 'exactRegistryReconstructed', 'exactPlanRecompiled',
    'exactMethodRecompiled', 'exactExecutionReproduced', 'methodBodiesEmbedded',
    'sourceBodiesTransported', 'authorityExpanded', 'defaultLaunchEnabled',
  ], 'fixture assertions');
  const expectedAssertions = {
    exactReleaseVerified: true,
    exactRegistryReconstructed: true,
    exactPlanRecompiled: true,
    exactMethodRecompiled: true,
    exactExecutionReproduced: true,
    methodBodiesEmbedded: 0,
    sourceBodiesTransported: 0,
    authorityExpanded: false,
    defaultLaunchEnabled: false,
  };
  if (canonicalJson(value.assertions) !== canonicalJson(expectedAssertions)
      || value.evidence.sourceModules !== 9 || value.evidence.declaredArtifacts !== 9
      || value.evidence.generatedArtifacts !== 9
      || !Array.isArray(value.evidence.observedArtifactFiles)
      || value.evidence.observedArtifactFiles.length < 1
      || new Set(value.evidence.observedArtifactFiles).size !== value.evidence.observedArtifactFiles.length
      || !sameArray(value.evidence.observedArtifactFiles, [...value.evidence.observedArtifactFiles].sort())
      || value.evidence.observedArtifactFiles.some((path) => typeof path !== 'string'
        || path.length === 0 || path.includes('\\') || path.startsWith('/') || path.split('/').includes('..'))
      || !sameArray(value.evidence.capabilityMethodOrReviewerBodyReads, [])) {
    throw new Error('typed composition consumer fixture evidence is invalid');
  }
  if (value.godskills.sourceCommit !== '7c1a183d55616310ac96255dd996536c53c8b577'
      || value.godskills.releaseReceiptDigest !== 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a'
      || value.godskills.capabilityLayerReceiptDigest !== '1c19271951abb00e93529656a35e8fb52dccc2f3cf0b6208bcee6821361ab788'
      || value.godskills.activationTrustRootDigest !== 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7'
      || value.godskills.registryDigest !== '5143a9ca74b5676605c33e94c7d610d830c3aafe7d57c32a48558d5112b713b8'
      || value.composition.missionId !== 'canary:muse-to-forge:v1'
      || value.composition.activationResultDigest !== 'f2210917bcb5d4d462332d2f871b026faf81317bfd6472c74d36c17f393a539c'
      || value.composition.planDigest !== '9849b421071a74535028cabd70d92db3cd4df6d4b0433f83bb562fb14d47d48f'
      || value.composition.methodDigest !== '63b0a268841992c55953415b279f8e76277a80b0152f49260b3a22db9a75e3c2'
      || value.composition.executionDigest !== 'dce249713684b029ffae62bb8b4b8e55b2d394a7b4a49f3ddbb846421e914bf7'
      || value.composition.nodes !== 2 || value.composition.links !== 6
      || !sameArray(value.composition.missionOutputs, [
        'claim-evidence-ledger', 'implementation', 'integration-state', 'review-disposition',
      ])
      || value.execution.receipt?.executionDigest !== value.composition.executionDigest
      || value.execution.receipt?.authorityExpanded !== false) {
    throw new Error('typed composition consumer fixture roots are invalid');
  }
  const { executionDigest, ...unsignedExecution } = value.execution.receipt;
  if (executionDigest !== sha256Value(unsignedExecution)
      || canonicalJson(value.execution.acceptanceRiskBoundary) !== canonicalJson({
        invariants: ['typed-handoff', 'no-authority-expansion'],
        rejectionCriteria: ['implicit-coercion', 'missing-evidence'],
      })
      || canonicalJson(value.execution.outputs) !== canonicalJson({
        'claim-evidence-ledger': { claims: 2, evidence: 2 },
        implementation: { status: 'verified' },
        'integration-state': { state: 'ready' },
        'review-disposition': { disposition: 'accepted' },
      })) {
    throw new Error('typed composition consumer execution evidence is invalid');
  }
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'fixture');
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('typed composition consumer fixture digest mismatch');
  return value;
}

function expectedMetrics(fixture) {
  return {
    sourceModules: fixture.evidence.sourceModules,
    declaredArtifacts: fixture.evidence.declaredArtifacts,
    generatedArtifacts: fixture.evidence.generatedArtifacts,
    observedArtifactFiles: fixture.evidence.observedArtifactFiles.length,
    methodBodiesEmbedded: fixture.assertions.methodBodiesEmbedded,
    sourceBodiesTransported: fixture.assertions.sourceBodiesTransported,
    authorityExpansions: fixture.assertions.authorityExpanded ? 1 : 0,
    defaultLaunchPathsEnabled: fixture.assertions.defaultLaunchEnabled ? 1 : 0,
    retainedInlineRegressions: retainedRegressions.length,
  };
}

export function verifyGodskillsTypedCompositionConsumerReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'typed composition consumer receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('typed composition consumer receipt identity is invalid');
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
  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'value'], 'certification fixture');
  if (value.fixture.path !== fixturePath) throw new Error('certification fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'fixture file');
  requireDigest(value.fixture.logicalDigest, 'fixture logical');
  const fixture = verifyGodskillsTypedCompositionConsumerFixture(value.fixture.value);
  if (value.fixture.logicalDigest !== fixture.fixtureDigest
      || canonicalJson(value.godskills) !== canonicalJson(fixture.godskills)) {
    throw new Error('certification fixture binding mismatch');
  }
  if (!Array.isArray(value.requirements)
      || !sameArray(value.requirements.map(({ id }) => id), Object.keys(requirementEvidence))) {
    throw new Error('certification requirements are invalid');
  }
  for (const row of value.requirements) {
    exactKeys(row, ['id', 'status', 'evidence'], `requirement ${row.id}`);
    if (row.status !== 'pass' || !sameArray(row.evidence, requirementEvidence[row.id])) {
      throw new Error(`requirement ${row.id} evidence mismatch`);
    }
  }
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

export async function rebuildGodskillsTypedCompositionConsumerReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = verifyGodskillsTypedCompositionConsumerFixture(JSON.parse(fixtureText));
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
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      value: structuredClone(fixture),
    },
    requirements: Object.entries(requirementEvidence).map(([id, evidence]) => ({
      id, status: 'pass', evidence: [...evidence],
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
  return Object.freeze(verifyGodskillsTypedCompositionConsumerReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function writeCertification(path, receipt, release) {
  const lines = [
    '# Godskills typed-composition consumer v1 certification',
    '',
    `source commit: \`${receipt.source.commit}\``,
    '',
    `receipt digest: \`${receipt.receiptDigest}\``,
    '',
    `fixture digest: \`${receipt.fixture.logicalDigest}\``,
    '',
    `focused tests: ${receipt.testRuns.focused.tests}`,
    '',
    `full tests: ${receipt.testRuns.full.tests}`,
    '',
    `release tests: ${release.tests}`,
    '',
    'the optional adapter verifies one exact Godskills typed-composition release, reconstructs its private registry, recompiles and executes the retained Muse-to-Forge canary, reads no capability method or reviewer body, expands no authority, and remains absent from default launch paths.',
    '',
    'proof remains limited to the boundaries declared in the certification receipt.',
    '',
  ];
  await writeFile(path, lines.join('\n'), 'utf8');
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  const fixtureOutputPath = join(root, ...fixturePath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicGodskillsTypedCompositionConsumerFixture();
    await writeFile(fixtureOutputPath, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({
      status: 'written', destination: fixtureOutputPath, fixtureDigest: fixture.fixtureDigest,
    })}\n`);
    return;
  }
  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({
    root, headCommit: head, outputPath, releaseOnlyPaths,
  });
  const committedFixture = JSON.parse(await gitText(root, sourceCommit, fixturePath));
  const liveFixture = await buildDeterministicGodskillsTypedCompositionConsumerFixture();
  if (canonicalJson(liveFixture) !== canonicalJson(committedFixture)) {
    throw new Error('live typed composition fixture differs from the committed source fixture');
  }
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildGodskillsTypedCompositionConsumerReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildGodskillsTypedCompositionConsumerReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/godskills-typed-composition-consumer-certification.test.mjs',
    'tests/certification-ledger.test.mjs',
    'tests/release-lineage.test.mjs',
  ], root);
  await writeCertification(join(root, ...certificationPath.split('/')), receipt, release);
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    sourceCommit,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    fixtureDigest: receipt.fixture.logicalDigest,
    testRuns: receipt.testRuns,
    release,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
