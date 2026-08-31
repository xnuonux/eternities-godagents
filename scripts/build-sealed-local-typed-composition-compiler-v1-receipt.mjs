import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildDeterministicSealedLocalTypedCompositionFixture } from '../tests/helpers/sealed-local-typed-composition-certification-fixture.mjs';
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

export { buildDeterministicSealedLocalTypedCompositionFixture };

const certificationId = 'sealed-local-typed-composition-compiler-v1';
const protocolId = 'eternities-sealed-local-typed-composition-certification-v1';
const fixturePath = 'fixtures/sealed-local-typed-composition-compiler-v1.json';
const receiptPath = 'receipts/sealed-local-typed-composition-compiler-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-sealed-local-typed-composition-compiler-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-sealed-local-typed-composition-compiler-v1.md';
const certificationPath = 'docs/sealed-local-typed-composition-compiler-v1-certification.md';
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

const expectedGodskills = Object.freeze({
  reviewSourceCommit: '3a63c07322808b6958593bd765c0fb32023a2da5',
  routingSourceCommit: '7aad930bdb5408ba65e03acf8a56d1978021bcaf',
  typedCompositionSourceCommit: '7c1a183d55616310ac96255dd996536c53c8b577',
  releaseDigest: 'c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f',
  routingReceiptDigest: '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28',
  activationReceiptDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
  typedCompositionReceiptDigest: 'da81b62ead231bdd89fd449e8a17d444685c92ad272a02a20a28e26e0563bc6a',
});

const expectedLocalExecution = Object.freeze({
  routingTrustRootDigest: '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28',
  activationTrustRootDigest: 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7',
  routeMode: 'default',
  routeDescriptorDigest: '7e53e9f2c95b38535abe0832e7a7554a530162263ca079cad45f9fdd23514868',
  activationDescriptorDigest: 'a8d239bf34c2aa1729c5213e85d3e57e6eb9554258cbc1cb87c16ab1c1497cd5',
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
  'receipts/recoverable-typed-composition-compiler-v1.json',
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
  'scripts/build-sealed-local-typed-composition-compiler-v1-receipt.mjs',
  'scripts/lib/certification-support.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  'scripts/lib/pinned-godskills-routing-executable.mjs',
  'scripts/lib/pinned-godskills-typed-composition.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/certification/verify-release-lineage.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/receipt-safety.mjs',
  'src/skills/activation-adapter.mjs',
  'src/skills/local-recoverable-godskills-adapter.mjs',
  'src/skills/local-recoverable-godskills-process-transport.mjs',
  'src/skills/mission-binder.mjs',
  'src/skills/recoverable-godskills-adapter.mjs',
  'src/skills/recoverable-godskills-contracts.mjs',
  'src/skills/recoverable-godskills-outbox.mjs',
  'src/skills/recoverable-typed-composition-compiler.mjs',
  'src/skills/recoverable-typed-composition-contracts.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/routing-executable-verifier.mjs',
  'src/skills/sealed-local-typed-composition-compiler.mjs',
  'src/skills/typed-composition-adapter.mjs',
  'src/skills/typed-composition-verifier.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/helpers/sealed-local-typed-composition-certification-fixture.mjs',
  'tests/local-recoverable-godskills-adapter.test.mjs',
  'tests/local-recoverable-godskills-process-transport.test.mjs',
  'tests/recoverable-typed-composition-compiler.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/sealed-local-godskills-transport-certification.test.mjs',
  'tests/sealed-local-typed-composition-compiler-certification.test.mjs',
  'tests/sealed-local-typed-composition-compiler.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/local-recoverable-godskills-adapter.test.mjs',
  'tests/local-recoverable-godskills-process-transport.test.mjs',
  'tests/recoverable-typed-composition-compiler.test.mjs',
  'tests/sealed-local-godskills-transport-certification.test.mjs',
  'tests/sealed-local-typed-composition-compiler.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'SLT-001': ['one explicit factory pins the Godskills release routing executable activation executable and typed-composition release'],
  'SLT-002': ['the caller supplies no route transport activation transport activation result or typed method'],
  'SLT-003': ['one shared provenance-branded helper creates the process pair for both existing and typed local adapters'],
  'SLT-004': ['the exact local router selects Forge and Muse for the retained predeclared topology'],
  'SLT-005': ['route and activation execute as hidden shell-free environment-scrubbed Node children'],
  'SLT-006': ['activation result and zero-exit success evidence persist before completion publication'],
  'SLT-007': ['process reconstruction materializes completion without another route or activation launch'],
  'SLT-008': ['recoverable Godskills binding and typed method compilation finish from the recovered result'],
  'SLT-009': ['exact compilation replay launches no child and reproduces one digest'],
  'SLT-010': ['typed Muse-to-Forge handoff and four terminal outputs execute through the private method'],
  'SLT-011': ['impossible topology rejects before either local child launches'],
  'SLT-012': ['pin drift partial configuration caller transport injection forged wrappers and cross-factory handles fail closed'],
  'SLT-013': ['the existing local recoverable adapter and process transport retain their certified behavior'],
  'SLT-014': ['no method is serialized no authority expands and no default host path changes'],
  'SLT-015': ['fixture receipt ledger and release lineage reproduce from one exact source commit'],
});

const retainedRegressions = Object.freeze([
  'existing local recoverable adapter still executes and recovers route plus activation',
  'existing process transport still scrubs ambient environment and avoids a shell',
  'real route and activation children each launch exactly once',
  'activation result plus success witness recover without relaunch',
  'route naturally selects exactly Forge plus Muse for the retained mission',
  'recoverable typed compilation reconstructs without caller replay',
  'exact compilation replay performs no process work',
  'impossible topology rejects before process launch',
  'changed routing and typed-composition pins reject before process launch',
  'partial and caller-transport configuration reject',
  'shared process bundles and sealed compiler wrappers require private provenance brands',
  'cross-factory compilation handles cannot execute',
  'typed executor input handoff and output rejection remain intact',
  'private methods remain absent from durable state',
  'authority Realm and default-launch counts remain zero',
]);

const proofLimits = Object.freeze([
  'caller-owned-activation-classifier-remains-trusted',
  'typed-node-executors-remain-injected-and-trusted',
  'in-process-graph-execution-is-not-durably-journaled-per-node',
  'no-hostile-same-user-operating-system-or-filesystem-isolation',
  'no-live-model-provider-skill-quality-or-output-quality-qualification',
  'no-exactly-once-external-effect-or-realm-action-guarantee',
  'no-provider-credential-cross-machine-recovery-or-default-host-adoption',
  'no-continuity-keel-identity-evolution-lunari-inspiration-or-soul-authority',
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

export function verifySealedLocalTypedCompositionFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'localExecution', 'recovery',
    'binding', 'compilation', 'execution', 'state', 'assertions', 'fixtureDigest',
  ], 'sealed local typed composition fixture');
  if (value.schemaVersion !== 1
      || value.protocolId !== 'eternities-sealed-local-typed-composition-fixture-v1') {
    throw new Error('sealed local typed composition fixture identity is invalid');
  }
  if (canonicalJson(value.godskills) !== canonicalJson(expectedGodskills)
      || canonicalJson(value.localExecution) !== canonicalJson(expectedLocalExecution)) {
    throw new Error('sealed local typed composition trust roots changed');
  }
  Object.entries(value.godskills)
    .filter(([name]) => !name.endsWith('Commit'))
    .forEach(([name, digest]) => requireDigest(digest, `fixture Godskills ${name}`));
  Object.entries(value.localExecution)
    .filter(([name]) => name.endsWith('Digest'))
    .forEach(([name, digest]) => requireDigest(digest, `fixture local execution ${name}`));

  const expectedRecovery = {
    processDeathObserved: true,
    activationResultDurableBeforeRecovery: true,
    activationSuccessDurableBeforeRecovery: true,
    activationCompletionAbsentBeforeRecovery: true,
    routeLaunches: 1,
    activationLaunches: 1,
    classifications: 2,
    terminalResultFiles: 2,
    terminalSuccessFiles: 2,
    terminalCompletionFiles: 2,
    exactCompilationReplay: true,
  };
  if (canonicalJson(value.recovery) !== canonicalJson(expectedRecovery)) {
    throw new Error('sealed local typed composition recovery evidence changed');
  }

  exactKeys(value.binding, ['selectedIds', 'bindingDigest', 'activationResultDigest'], 'fixture binding');
  if (!sameArray(value.binding.selectedIds, ['eternities-forge', 'eternities-muse'])
      || value.binding.bindingDigest !== '4edd691dec55cd38541dc4d5a90a32a68baa0ab3b76ac1351e895b3de38e76f7'
      || value.binding.activationResultDigest !== '586b050aed17c9d2abe5f9286a944619e8ab355f62d446a617ff3fda367414be') {
    throw new Error('sealed local typed composition binding changed');
  }
  exactKeys(value.compilation, [
    'missionId', 'planDigest', 'methodDigest', 'compilationDigest',
  ], 'fixture compilation');
  if (value.compilation.missionId !== 'sealed-local-typed-composition-certification-v1'
      || value.compilation.planDigest !== '56136926816a441b3ffb9a905c591b70acc9c20f67cc91f0a2040c16e28614db'
      || value.compilation.methodDigest !== 'c6af2000e68a9d5dacb1fd004cc0be88c5b49f1c91efdc68858bd50eddca369c'
      || value.compilation.compilationDigest !== '6a18cfe4d0f0545797cc081d051347e482cdca011bec15b61ce159cf89c4454a') {
    throw new Error('sealed local typed composition compilation changed');
  }

  exactKeys(value.execution, ['outputs', 'receipt'], 'fixture execution');
  const execution = value.execution.receipt;
  const { executionDigest, ...unsignedExecution } = execution;
  if (execution?.protocolId !== 'eternities-typed-composition-execution-v1'
      || execution.missionId !== value.compilation.missionId
      || execution.methodDigest !== value.compilation.methodDigest
      || execution.authorityExpanded !== false
      || executionDigest !== sha256Value(unsignedExecution)
      || executionDigest !== '04f35feeaaa1f7a950520a26e2e06a3d504c2ed0ccf1023c952676088e8d2ead'
      || canonicalJson(value.execution.outputs) !== canonicalJson({
        'claim-evidence-ledger': { claims: 3, evidence: 3 },
        implementation: { status: 'verified' },
        'integration-state': { state: 'ready' },
        'review-disposition': { disposition: 'accepted' },
      })) {
    throw new Error('sealed local typed composition execution changed');
  }

  exactKeys(value.state, [
    'intentFileSha256', 'recordFileSha256', 'bindingFileSha256', 'serializedMethodFields',
  ], 'fixture state');
  if (canonicalJson(value.state) !== canonicalJson({
    intentFileSha256: 'fd2cd995e0c807bf7824502ae54af7cc1fb429c1180fc242659c451c4bfc332a',
    recordFileSha256: 'dda40fed9ebf199e7b836db95864b31796a81aa6f9fe960e02784bfca0afdb62',
    bindingFileSha256: '45c256a709198e63f9a8d57f5b72416ce8ebf8839eacd5bd832c76f5d784dd11',
    serializedMethodFields: 0,
  })) throw new Error('sealed local typed composition state changed');
  const expectedAssertions = {
    exactPinnedExecutables: true,
    callerTransportInjection: false,
    recoveredWithoutRelaunch: true,
    methodSerialized: false,
    authorityExpanded: false,
    defaultLaunchEnabled: false,
    realmEffects: 0,
  };
  if (canonicalJson(value.assertions) !== canonicalJson(expectedAssertions)) {
    throw new Error('sealed local typed composition assertions changed');
  }
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'fixture');
  if (fixtureDigest !== sha256Value(unsigned)
      || fixtureDigest !== '866b04538cf2f2e35a4168f4da1e453cebc5af533d6b384447366df55a6e5263') {
    throw new Error('sealed local typed composition fixture digest mismatch');
  }
  return value;
}

function expectedMetrics(fixture) {
  return {
    routeLaunches: fixture.recovery.routeLaunches,
    activationLaunches: fixture.recovery.activationLaunches,
    classifications: fixture.recovery.classifications,
    terminalResultFiles: fixture.recovery.terminalResultFiles,
    terminalSuccessFiles: fixture.recovery.terminalSuccessFiles,
    terminalCompletionFiles: fixture.recovery.terminalCompletionFiles,
    selectedCapabilities: fixture.binding.selectedIds.length,
    serializedMethodFields: fixture.state.serializedMethodFields,
    authorityExpansions: fixture.assertions.authorityExpanded ? 1 : 0,
    realmEffects: fixture.assertions.realmEffects,
    defaultLaunchPathsEnabled: fixture.assertions.defaultLaunchEnabled ? 1 : 0,
    retainedInlineRegressions: retainedRegressions.length,
  };
}

export function verifySealedLocalTypedCompositionReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'sealed local typed composition receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('sealed local typed composition receipt identity is invalid');
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
  const fixture = verifySealedLocalTypedCompositionFixture(value.fixture.value);
  if (value.fixture.logicalDigest !== fixture.fixtureDigest
      || value.fixture.fileSha256 !== sha256Text(`${canonicalJson(fixture)}\n`)
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

export async function rebuildSealedLocalTypedCompositionReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = verifySealedLocalTypedCompositionFixture(JSON.parse(fixtureText));
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
  return Object.freeze(verifySealedLocalTypedCompositionReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function writeCertification(path, receipt, release) {
  const lines = [
    '# Sealed local typed-composition compiler v1 certification',
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
    'the optional sealed factory runs the exact pinned local Godskills route and activation binaries, recovers activation success without relaunch, compiles and executes the private typed Muse-to-Forge method, expands no authority, and changes no default launch path.',
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
    const fixture = verifySealedLocalTypedCompositionFixture(
      await buildDeterministicSealedLocalTypedCompositionFixture(),
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
  const liveFixture = await buildDeterministicSealedLocalTypedCompositionFixture();
  if (canonicalJson(liveFixture) !== canonicalJson(committedFixture)) {
    throw new Error('live sealed local typed fixture differs from committed source fixture');
  }
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildSealedLocalTypedCompositionReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildSealedLocalTypedCompositionReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  const release = await runTests([
    'tests/sealed-local-typed-composition-compiler-certification.test.mjs',
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
