import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicRecoverableTypedCompositionCompilerFixture } from '../tests/helpers/recoverable-typed-composition-fixture.mjs';
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

export { buildDeterministicRecoverableTypedCompositionCompilerFixture };

const certificationId = 'recoverable-typed-composition-compiler-v1';
const protocolId = 'eternities-recoverable-typed-composition-compiler-certification-v1';
const fixturePath = 'fixtures/recoverable-typed-composition-compiler-v1.json';
const receiptPath = 'receipts/recoverable-typed-composition-compiler-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-recoverable-typed-composition-compiler-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-recoverable-typed-composition-compiler-v1.md';
const certificationPath = 'docs/recoverable-typed-composition-compiler-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const expectedCompositionRoot = Object.freeze({
  sourceCommit: '7c1a183d55616310ac96255dd996536c53c8b577',
  trustRootDigest: 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a',
  policyDigest: 'f5934f9b22fc3ede905fec359cc9697f40b23ede4f7144eb298f4cd184b005fd',
  capabilityLayerReceiptDigest: '1c19271951abb00e93529656a35e8fb52dccc2f3cf0b6208bcee6821361ab788',
  activationTrustRootDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
  registryDigest: '5143a9ca74b5676605c33e94c7d610d830c3aafe7d57c32a48558d5112b713b8',
});
const expectedRecoveryDigests = Object.freeze({
  intentDigest: 'bd43a38cce8c968292d4c6b6f68fdaa91fe88b728c96d6d00c22c989eed3ef85',
  topologyDigest: 'd74a725cbc8ece04067c9ad01df184cc526a4d9afc1f08961313939299b68eb2',
  activationResultDigest: '0676bdfd2063affbd0be927853e7e632fff5eadf5474da85547c11ef2771f83d',
  planDigest: '64535bf3b7d01cda4f4ac8179ca7b8a9046519843e3ba499a554ce6dddaf08a8',
  methodDigest: '6f3e70c9c0f1689f955f971b0cad8c05380bd164bdbbb6ff5f1ff0a7057bcea6',
  compilationDigest: '608bc0c53aa96179f30d408a49461851e5438112c661cb9f7a7ae5617dda2198',
});

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
  'receipts/godskills-typed-composition-consumer-v1.json',
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
  'README.md',
  'docs/architecture.md',
  fixturePath,
  'package.json',
  planPath,
  'schemas/recoverable-typed-composition-intent.schema.json',
  'schemas/recoverable-typed-composition-pending.schema.json',
  'schemas/recoverable-typed-composition-record.schema.json',
  'schemas/recoverable-typed-composition-topology.schema.json',
  'scripts/build-recoverable-typed-composition-compiler-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-typed-composition.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/skills/activation-adapter.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/recoverable-godskills-adapter.mjs',
  'src/skills/recoverable-godskills-contracts.mjs',
  'src/skills/recoverable-godskills-outbox.mjs',
  'src/skills/recoverable-typed-composition-compiler.mjs',
  'src/skills/recoverable-typed-composition-contracts.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/typed-composition-adapter.mjs',
  'src/skills/typed-composition-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/godskills-typed-composition-consumer.test.mjs',
  'tests/helpers/recoverable-typed-composition-fixture.mjs',
  'tests/recoverable-godskills-adapter.test.mjs',
  'tests/recoverable-godskills-outbox.test.mjs',
  'tests/recoverable-typed-composition-compiler-certification.test.mjs',
  'tests/recoverable-typed-composition-compiler.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/godskills-typed-composition-consumer.test.mjs',
  'tests/recoverable-godskills-adapter.test.mjs',
  'tests/recoverable-godskills-outbox.test.mjs',
  'tests/recoverable-typed-composition-compiler.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'RTC-001': ['one immutable topology and complete binding input publish before any route or activation execution'],
  'RTC-002': ['caller topology contains no policy activation root result or decision digest field'],
  'RTC-003': ['unknown references duplicate bindings multiple owners duplicate phases cycles and nonterminal outputs reject before routing'],
  'RTC-004': ['routing and activation occur only through the existing recoverable Godskills admission boundary'],
  'RTC-005': ['certified composition roots and activation decision digests are inserted mechanically after binding'],
  'RTC-006': ['pending no-qualified-route and selected-set mismatch never create a typed method'],
  'RTC-007': ['durable compiler state contains digests but never serializes the private method'],
  'RTC-008': ['process death after Godskills binding or record publication reconstructs without external reexecution'],
  'RTC-009': ['same-process concurrent compiles serialize to one exact durable result'],
  'RTC-010': ['bounded canonical regular-file state and real contained directories reject aliases and oversized records'],
  'RTC-011': ['private provenance and compiler ownership prevent forged or cross-compiler execution handles'],
  'RTC-012': ['typed input executor output handoff and context checks remain owned by the certified Godskills module'],
  'RTC-013': ['certification observes no capability method or reviewer body read and no method field in state'],
  'RTC-014': ['authority stays closed and no default host or launch path changes'],
  'RTC-015': ['fixture receipt ledger and release lineage reproduce from one exact source commit'],
});

const retainedRegressions = Object.freeze([
  'intent publishes before route execution',
  'exact topology and binding-input drift collide before external reuse',
  'caller activation fields reject before routing',
  'structurally impossible graphs reject before routing',
  'route and activation each execute once across process reconstruction',
  'pending and no-qualified routing create no method',
  'selected capabilities and activation decisions must match topology exactly',
  'recomputed changed durable records fail closed',
  'oversized files and escaped junction slots fail before state parsing',
  'forged and cross-compiler handles cannot execute',
  'same-process concurrent compilation serializes deterministically',
  'missing executors malformed inputs and malformed outputs fail closed',
  'changed certified composition roots fail before transport use',
  'capability method and reviewer bodies remain unread',
  'no private method field enters compiler state',
]);

const proofLimits = Object.freeze([
  'trusted-injected-route-and-activation-terminal-reconciliation-remains-an-assumption',
  'in-process-typed-execution-not-durable-graph-execution',
  'same-process-serialization-not-cross-process-waiting-or-scheduling',
  'no-exactly-once-hostile-executor-or-external-effect-guarantee',
  'no-live-model-provider-or-skill-quality-qualification',
  'no-hostile-same-user-operating-system-isolation',
  'no-provider-credential-realm-continuity-keel-identity-evolution-lunari-inspiration-or-soul-authority',
  'no-default-vessel-host-cli-or-codex-desktop-adoption',
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
  if (value.full.tests < value.focused.tests) throw new Error('full test run is narrower than focused');
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

export function verifyRecoverableTypedCompositionCompilerFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'missionId', 'roots', 'recovery', 'state',
    'execution', 'evidence', 'assertions', 'fixtureDigest',
  ], 'recoverable typed composition fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-recoverable-typed-composition-compiler-fixture-v1'
      || value.missionId !== 'recoverable-typed-composition-certification-v1') {
    throw new Error('recoverable typed composition fixture identity is invalid');
  }
  exactKeys(value.roots, ['godskillsReleaseDigest', 'composition'], 'fixture roots');
  requireDigest(value.roots.godskillsReleaseDigest, 'Godskills release');
  exactKeys(value.roots.composition, [
    'sourceCommit', 'trustRootDigest', 'policyDigest', 'capabilityLayerReceiptDigest',
    'activationTrustRootDigest', 'registryDigest',
  ], 'fixture composition root');
  if (value.roots.godskillsReleaseDigest !== 'c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f'
      || canonicalJson(value.roots.composition) !== canonicalJson(expectedCompositionRoot)) {
    throw new Error('fixture release roots changed');
  }
  Object.entries(value.roots.composition).filter(([name]) => name !== 'sourceCommit')
    .forEach(([name, digest]) => requireDigest(digest, `fixture composition ${name}`));

  exactKeys(value.recovery, [
    'crashObserved', 'routeExecutions', 'activationExecutions', 'concurrentReplayMatched',
    'intentDigest', 'topologyDigest', 'activationResultDigest', 'planDigest', 'methodDigest',
    'compilationDigest',
  ], 'fixture recovery');
  if (value.recovery.crashObserved !== true || value.recovery.routeExecutions !== 1
      || value.recovery.activationExecutions !== 1 || value.recovery.concurrentReplayMatched !== true) {
    throw new Error('fixture recovery evidence changed');
  }
  for (const name of [
    'intentDigest', 'topologyDigest', 'activationResultDigest', 'planDigest', 'methodDigest',
    'compilationDigest',
  ]) requireDigest(value.recovery[name], `fixture recovery ${name}`);
  if (Object.entries(expectedRecoveryDigests)
    .some(([name, digest]) => value.recovery[name] !== digest)) {
    throw new Error('fixture recovery coordinates changed');
  }

  exactKeys(value.state, [
    'intentFileSha256', 'recordFileSha256', 'canonicalIntent', 'canonicalRecord',
    'serializedMethodFields',
  ], 'fixture state');
  requireDigest(value.state.intentFileSha256, 'fixture intent file');
  requireDigest(value.state.recordFileSha256, 'fixture record file');
  if (value.state.canonicalIntent !== true || value.state.canonicalRecord !== true
      || value.state.serializedMethodFields !== 0
      || value.state.intentFileSha256 !== '3e0a32253d86412641c448140a59db97ec1fab7ac1f7fc4a433184f3a27d672a'
      || value.state.recordFileSha256 !== '06f53e6c0c186c994187b91067ec85c35b25505aaf90c170c51bb37f67ce788e') {
    throw new Error('fixture durable state evidence changed');
  }

  exactKeys(value.execution, ['outputs', 'receipt'], 'fixture execution');
  const receipt = value.execution.receipt;
  if (receipt?.protocolId !== 'eternities-typed-composition-execution-v1'
      || receipt.missionId !== value.missionId
      || receipt.methodDigest !== value.recovery.methodDigest
      || receipt.authorityExpanded !== false) {
    throw new Error('fixture execution binding changed');
  }
  const { executionDigest, ...unsignedExecution } = receipt;
  requireDigest(executionDigest, 'fixture execution');
  if (executionDigest !== sha256Value(unsignedExecution)
      || executionDigest !== 'f0dd7a791b55221018910ca9e72176be38f81e64fba7bbcd4c052a98f08638ca'
      || canonicalJson(value.execution.outputs) !== canonicalJson({
        'claim-evidence-ledger': { claims: 3, evidence: 3 },
        implementation: { status: 'verified' },
        'integration-state': { state: 'ready' },
        'review-disposition': { disposition: 'accepted' },
      })) {
    throw new Error('fixture execution evidence changed');
  }

  exactKeys(value.evidence, [
    'intentPublishedBeforeRoute', 'observedArtifactFiles',
    'capabilityMethodOrReviewerBodyReads',
  ], 'fixture evidence');
  if (value.evidence.intentPublishedBeforeRoute !== true
      || !Array.isArray(value.evidence.observedArtifactFiles)
      || value.evidence.observedArtifactFiles.length !== 45
      || !sameArray(value.evidence.observedArtifactFiles, [...value.evidence.observedArtifactFiles].sort())
      || new Set(value.evidence.observedArtifactFiles).size !== value.evidence.observedArtifactFiles.length
      || value.evidence.observedArtifactFiles.some((path) => typeof path !== 'string'
        || path.length < 1 || path.includes('\\') || path.startsWith('/')
        || path.split('/').some((part) => part === '' || part === '.' || part === '..'))
      || !sameArray(value.evidence.capabilityMethodOrReviewerBodyReads, [])) {
    throw new Error('fixture read evidence changed');
  }
  exactKeys(value.assertions, [
    'authorityExpanded', 'defaultLaunchEnabled', 'methodSerialized',
    'replayExternalExecutions',
  ], 'fixture assertions');
  if (canonicalJson(value.assertions) !== canonicalJson({
    authorityExpanded: false,
    defaultLaunchEnabled: false,
    methodSerialized: false,
    replayExternalExecutions: 0,
  })) throw new Error('fixture assertions changed');
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'fixture');
  if (fixtureDigest !== sha256Value(unsigned)
      || fixtureDigest !== '7fb7eebf7b4c997dc1c8628aab8f98465c35c8c3bfd8f785200b9536435b1f5b') {
    throw new Error('fixture digest mismatch');
  }
  return value;
}

function expectedMetrics(fixture) {
  return {
    routeExecutions: fixture.recovery.routeExecutions,
    activationExecutions: fixture.recovery.activationExecutions,
    replayExternalExecutions: fixture.assertions.replayExternalExecutions,
    observedArtifactFiles: fixture.evidence.observedArtifactFiles.length,
    capabilityMethodOrReviewerBodyReads: fixture.evidence.capabilityMethodOrReviewerBodyReads.length,
    serializedMethodFields: fixture.state.serializedMethodFields,
    authorityExpansions: fixture.assertions.authorityExpanded ? 1 : 0,
    defaultLaunchPathsEnabled: fixture.assertions.defaultLaunchEnabled ? 1 : 0,
    retainedInlineRegressions: retainedRegressions.length,
  };
}

export function verifyRecoverableTypedCompositionCompilerReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'roots',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'recoverable typed composition receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('recoverable typed composition receipt identity is invalid');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan',
  ], 'certification source');
  if (!COMMIT.test(value.source.commit)
      || !sameArray(Object.keys(value.source.historicalReceiptDigests), historicalReceiptPaths)) {
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
  const fixture = verifyRecoverableTypedCompositionCompilerFixture(value.fixture.value);
  if (value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)
      || canonicalJson(value.roots) !== canonicalJson(fixture.roots)) {
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

export async function rebuildRecoverableTypedCompositionCompilerReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = verifyRecoverableTypedCompositionCompilerFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(
        repositoryRoot, sourceCommit, historicalReceiptPaths,
      ),
      implementationManifest: await manifestAtCommit(
        repositoryRoot, sourceCommit, implementationFiles,
      ),
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
    roots: structuredClone(fixture.roots),
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
  return Object.freeze(verifyRecoverableTypedCompositionCompilerReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function writeCertification(path, receipt, release) {
  const lines = [
    '# Recoverable typed-composition compiler v1 certification',
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
    'the optional compiler persists exact caller topology before routing, obtains activation only through recoverable Godskills admission, reconstructs one private typed method without external reexecution, serializes no method body, expands no authority, and changes no default launch path.',
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
    const fixture = verifyRecoverableTypedCompositionCompilerFixture(
      await buildDeterministicRecoverableTypedCompositionCompilerFixture(),
    );
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
  const liveFixture = await buildDeterministicRecoverableTypedCompositionCompilerFixture();
  if (canonicalJson(liveFixture) !== canonicalJson(committedFixture)) {
    throw new Error('live recoverable typed composition fixture differs from committed source fixture');
  }
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildRecoverableTypedCompositionCompilerReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildRecoverableTypedCompositionCompilerReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/recoverable-typed-composition-compiler-certification.test.mjs',
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
