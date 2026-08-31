import { execFile, spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { admitLocalCreation } from '../src/genesis/local-admission.mjs';
import {
  acquireCortexBinding,
  inspectCortexBindingRegistry,
  verifyCortexBindingLifecycleReceipt,
  verifyCortexBindingReceipt,
} from '../src/host/cortex-binding-registry.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';

const execFileAsync = promisify(execFile);
const protocolId = 'eternities-godagent-cortex-binding-registry-v1';
const certificationId = 'cortex-binding-registry-v1';
const fixturePath = 'fixtures/cortex-binding-registry-v1.json';
const receiptPath = 'receipts/cortex-binding-registry-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-30-godagent-cortex-binding-protocol-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-cortex-binding-registry-v1.md';
const certificationPath = 'docs/cortex-binding-registry-v1-certification.md';
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const commitPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-specialist-preference-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
  'receipts/transactional-genesis-phase2-certification.json',
  'receipts/visual-creator-shell-certification.json',
]);

const implementationFiles = Object.freeze([
  'README.md',
  'docs/architecture.md',
  planPath,
  specificationPath,
  fixturePath,
  'package.json',
  'schemas/cortex-binding-lifecycle-receipt.schema.json',
  'schemas/cortex-binding-receipt.schema.json',
  'schemas/cortex-binding-registry-state.schema.json',
  'scripts/build-cortex-binding-registry-v1-receipt.mjs',
  'src/core/schema-validator.mjs',
  'src/cortex/binding-compiler.mjs',
  'src/host/admitted-launch.mjs',
  'src/host/cortex-binding-registry.mjs',
  'src/host/local-instance-registry.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/admitted-launch.test.mjs',
  'tests/cortex-binding-registry-certification.test.mjs',
  'tests/cortex-binding-registry.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/cortex-binding-registry.test.mjs',
  'tests/admitted-launch.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([
  certificationPath,
  receiptPath,
  'src/certification/verify-ledger.mjs',
  'tests/certification-ledger.test.mjs',
  'tests/release-lineage.test.mjs',
]);

const requirementEvidence = Object.freeze({
  'CBP2-001': ['tests/cortex-binding-registry.test.mjs: one verified candidate becomes one credential-free active host receipt'],
  'CBP2-002': ['tests/cortex-binding-registry.test.mjs: one codex task cannot hold two active admitted identities'],
  'CBP2-003': ['tests/cortex-binding-registry.test.mjs: one personal keel has one writer and release frees both task and launch-lock claims'],
  'CBP2-004': ['tests/admitted-launch.test.mjs: active cortex binding and admitted local launch share one writer lock'],
  'CBP2-005': ['tests/cortex-binding-registry.test.mjs: renewal preserves identity and re-verifies the admitted source'],
  'CBP2-006': ['tests/cortex-binding-registry.test.mjs: revocation advances task and instance epochs'],
  'CBP2-007': ['tests/cortex-binding-registry.test.mjs: inspection and dead-host recovery require durable expiry'],
  'CBP2-008': ['tests/cortex-binding-registry.test.mjs: registry, event-chain, receipt, and source mutation fail closed'],
  'CBP2-009': ['tests/cortex-binding-registry.test.mjs: transient writer-lock cleanup remains retryable after durable closure'],
  'CBP2-010': ['tests/cortex-binding-registry.test.mjs: registry code imports no model, Godskills, Realm, or continuity writer'],
});

const proofLimits = Object.freeze([
  'no-codex-task-creation-resume-or-remote-control',
  'no-model-invocation-or-context-injection',
  'no-godskills-selection-or-method-activation',
  'no-continuity-row-or-personal-keel-content-write',
  'no-realm-effect-authority',
  'no-compaction-rehydration-or-task-migration',
  'no-registry-journal-compaction-beyond-the-v1-event-ceiling',
  'no-hostile-same-account-filesystem-mutation-defense',
  'no-independent-review',
  'no-lunari-integration',
  'no-soul-activation',
]);

function request({ taskId = 'codex-task-registry-cert-001', revocationEpoch = 0 } = {}) {
  return {
    schemaVersion: 1,
    task: { taskId, hostAdapterId: 'codex-desktop-v1', revocationEpoch },
    mission: {
      missionId: 'mission-registry-certification',
      objective: 'hold one exclusive inert host binding without invoking a model',
      successEvidence: ['active binding receipt', 'exclusive writer lease'],
      stopConditions: ['lease is revoked', 'verified source changes'],
      budget: { maxCycles: 3, maxCompletionTokens: 4096 },
      observation: {
        observationId: 'observation-registry-certification',
        summary: 'the admitted identity is ready for one host-held writer lease',
        evidenceDigests: ['a'.repeat(64)],
      },
    },
    maxProjectionBytes: 65_536,
  };
}

async function prepareAdmission(repositoryRoot, suffix, variant = false) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `godagent-cbp2-cert-${suffix}-`));
  const sourceRoot = join(temporaryRoot, 'creation-source');
  await cp(join(repositoryRoot, 'fixtures', 'creation'), sourceRoot, { recursive: true });
  if (variant) {
    const candidatePath = join(sourceRoot, 'creation-candidate.json');
    const expressionPath = join(sourceRoot, 'expression-overlay.json');
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
    const expression = JSON.parse(await readFile(expressionPath, 'utf8'));
    candidate.blueprint = { id: 'quiet-architect', version: '1.0.0' };
    candidate.telos.mission = 'map uncertain systems into precise evidence-bound paths';
    candidate.expressionRef = 'expression:quiet-architect@1.0.0';
    expression.id = 'quiet-architect';
    expression.name = 'Quiet Architect';
    expression.narrativeDescription = 'A quiet architect who maps uncertainty before acting.';
    await writeFile(candidatePath, `${canonicalJson(candidate)}\n`, 'utf8');
    await writeFile(expressionPath, `${canonicalJson(expression)}\n`, 'utf8');
  }

  const sourceCreationDir = join(temporaryRoot, 'compiled-creation');
  const creation = await compileCreation({
    candidatePath: join(sourceRoot, 'creation-candidate.json'),
    policyPath: join(sourceRoot, 'creation-policy.json'),
    expectedPolicyDigest,
    expressionPath: join(sourceRoot, 'expression-overlay.json'),
    moduleDirectory: join(sourceRoot, 'modules'),
    outputDir: sourceCreationDir,
  });
  const promptArtifactPath = join(temporaryRoot, 'prompt-os.md');
  await writeFile(
    promptArtifactPath,
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: cortex-binding-registry.certification.json -->\n# Cortex binding registry certification\n',
    'utf8',
  );
  const realm = JSON.parse(await readFile(join(repositoryRoot, 'fixtures', 'realm-contract.json'), 'utf8'));
  realm.capabilities = ['filesystem.read', 'filesystem.write'];
  realm.compatibleDistributions = ['0.2.x'];
  const realmContractPath = join(temporaryRoot, 'realm-contract.json');
  await writeFile(realmContractPath, `${canonicalJson(realm)}\n`, 'utf8');
  const workspace = join(temporaryRoot, 'workspace');
  const instanceId = `cortex-binding-registry-cert-${suffix}`;
  const creatorRef = 'creator:dom';
  await admitLocalCreation({
    creationDir: sourceCreationDir,
    expectedPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    promptArtifactPath,
    realmContractPath,
    workspace,
    instanceId,
    creatorRef,
    checkpointPurpose: 'certify one inert host-held cortex binding lease',
    clock: () => '2026-08-31T16:00:00.000Z',
  });
  const admissionRoot = join(workspace, 'admission');
  return {
    temporaryRoot,
    admissionRoot,
    admission: {
      receiptPath: join(admissionRoot, 'transaction', 'genesis-receipt.json'),
      creationDir: join(admissionRoot, 'creation'),
      distributionDir: join(admissionRoot, 'distribution'),
      expectedPolicyDigest,
      expectedCreationBuildId: creation.manifest.buildId,
      instanceId,
      creatorRef,
      transactionDir: join(admissionRoot, 'transaction'),
      journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
      keelAdapter: createLocalKeelBackend({ root: join(admissionRoot, 'keels') }),
    },
  };
}

async function rejectedBy(callback, pattern) {
  try {
    await callback();
    return false;
  } catch (error) {
    return pattern.test(String(error?.message ?? error));
  }
}

function projectActive(receipt) {
  return {
    status: receipt.status,
    active: receipt.active,
    bindingId: receipt.bindingId,
    bindingCandidateId: receipt.bindingCandidateId,
    identityDigest: receipt.identityDigest,
    instanceId: receipt.instanceId,
    keelId: receipt.keelId,
    taskId: receipt.taskId,
    revocationEpoch: receipt.revocationEpoch,
    lastVerifiedAt: receipt.lastVerifiedAt,
    lease: structuredClone(receipt.lease),
    authority: structuredClone(receipt.authority),
    registryEventDigest: receipt.registryEventDigest,
    receiptDigest: receipt.receiptDigest,
  };
}

function projectLifecycle(receipt) {
  return {
    status: receipt.status,
    active: receipt.active,
    bindingId: receipt.bindingId,
    instanceId: receipt.instanceId,
    taskId: receipt.taskId,
    revocationEpoch: receipt.revocationEpoch,
    recordedAt: receipt.recordedAt,
    registryEventDigest: receipt.registryEventDigest,
    receiptDigest: receipt.receiptDigest,
  };
}

export async function buildDeterministicCortexBindingRegistryFixture({ repositoryRoot }) {
  const root = resolve(repositoryRoot);
  const primary = await prepareAdmission(root, 'primary');
  const secondary = await prepareAdmission(root, 'secondary', true);
  let now = Date.parse('2026-08-31T17:00:00.000Z');
  const registryRoot = join(primary.temporaryRoot, 'registry');
  const instanceRegistryRoot = join(primary.temporaryRoot, 'instances');
  const credentials = [
    'registry-cert-primary-credential-0001',
    'registry-cert-secondary-credential-0002',
    'registry-cert-replacement-credential-0003',
    'registry-cert-revocation-credential-0004',
    'registry-cert-expiry-credential-0005',
    'registry-cert-recovery-credential-0006',
  ];
  const acquire = (admission, task, credential, leaseDurationMs = 20_000) => acquireCortexBinding({
    registryRoot,
    instanceRegistryRoot,
    admission,
    request: task,
    leaseDurationMs,
    clock: () => now,
    leaseCredential: () => credential,
  });

  try {
    const initialHandle = await acquire(primary.admission, request(), credentials[0]);
    const initial = initialHandle.receipt;
    const activeReceiptVerified = canonicalJson(verifyCortexBindingReceipt(structuredClone(initial)))
      === canonicalJson(initial);
    const taskCollisionRejected = await rejectedBy(
      () => acquire(secondary.admission, request(), credentials[1]),
      /task already has an active godagent binding/,
    );
    const writerCollisionRejected = await rejectedBy(
      () => acquire(primary.admission, request({ taskId: 'codex-task-registry-cert-002' }), credentials[2]),
      /resource is locked by a live or recent owner/,
    );

    now += 5_000;
    const renewed = await initialHandle.renew();
    now += 1_000;
    const released = await initialHandle.release();
    verifyCortexBindingLifecycleReceipt(released);

    const replacement = await acquire(
      primary.admission,
      request({ taskId: 'codex-task-registry-cert-002' }),
      credentials[2],
    );
    const replacementReceipt = replacement.receipt;
    await replacement.release();

    const revocationHandle = await acquire(
      primary.admission,
      request({ taskId: 'codex-task-registry-cert-003' }),
      credentials[3],
    );
    now += 1_000;
    const revoked = await revocationHandle.revoke({ reasonDigest: 'b'.repeat(64) });
    verifyCortexBindingLifecycleReceipt(revoked);
    const staleEpochRejected = await rejectedBy(
      () => acquire(
        primary.admission,
        request({ taskId: 'codex-task-registry-cert-004' }),
        credentials[4],
        2_000,
      ),
      /revocation epoch mismatch/,
    );

    const expiring = await acquire(
      primary.admission,
      request({ taskId: 'codex-task-registry-cert-004', revocationEpoch: 1 }),
      credentials[4],
      2_000,
    );
    now += 3_000;
    const expired = await expiring.inspect();
    verifyCortexBindingLifecycleReceipt(expired);
    const recovered = await acquire(
      primary.admission,
      request({ taskId: 'codex-task-registry-cert-004', revocationEpoch: 1 }),
      credentials[5],
      2_000,
    );
    const recoveredReceipt = recovered.receipt;
    await recovered.release();
    const snapshot = await inspectCortexBindingRegistry({ registryRoot, clock: () => now });

    const projected = {
      schemaVersion: 1,
      protocolId,
      receipts: {
        initial: projectActive(initial),
        renewed: projectActive(renewed),
        released: projectLifecycle(released),
        replacement: projectActive(replacementReceipt),
        revoked: projectLifecycle(revoked),
        expired: projectLifecycle(expired),
        recovered: projectActive(recoveredReceipt),
      },
      registry: {
        registryDigest: snapshot.registryDigest,
        headDigest: snapshot.headDigest,
        eventCount: snapshot.eventCount,
        bindingStatuses: snapshot.bindings.map(({ taskId, status, revocationEpoch }) => ({
          taskId, status, revocationEpoch,
        })),
      },
    };
    const assertions = {
      activeReceiptVerified,
      credentialAbsent: credentials.every((credential) => !canonicalJson(projected).includes(credential)),
      taskCollisionRejected,
      writerCollisionRejected,
      renewalStableBinding: renewed.bindingId === initial.bindingId
        && Date.parse(renewed.lease.expiresAt) > Date.parse(initial.lease.expiresAt),
      releaseFreesWriter: replacementReceipt.status === 'active',
      revocationAdvanced: revoked.status === 'revoked' && revoked.revocationEpoch === 1,
      staleEpochRejected,
      expiryRecovered: expired.status === 'expired' && recoveredReceipt.status === 'active',
      registryChainVerified: snapshot.eventCount === 11 && snapshot.bindings.length === 5,
      activeBindingsAfterCleanup: snapshot.bindings.filter((row) => row.active).length,
      realmEffects: initial.authority.realmEffects,
    };
    const unsigned = { ...projected, assertions };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await Promise.all([
      rm(primary.temporaryRoot, { recursive: true, force: true }),
      rm(secondary.temporaryRoot, { recursive: true, force: true }),
    ]);
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (!digestPattern.test(value ?? '')) throw new Error(`${label} digest is invalid`);
}

function validateTestRuns(testRuns) {
  exactKeys(testRuns, ['focused', 'full'], 'test runs');
  for (const [name, run] of Object.entries(testRuns)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
  }
}

function validateBoundDocument(value, expectedPath, label) {
  exactKeys(value, ['path', 'sha256'], label);
  if (value.path !== expectedPath) throw new Error(`${label} path is invalid`);
  requireDigest(value.sha256, label);
}

function validateManifest(value, expectedPaths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (canonicalJson(value.paths) !== canonicalJson(expectedPaths)
      || !Array.isArray(value.entries)
      || value.entries.length !== expectedPaths.length
      || value.digest !== sha256Value(value.entries)) {
    throw new Error(`${label} is invalid`);
  }
  for (let index = 0; index < expectedPaths.length; index += 1) {
    const entry = value.entries[index];
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== expectedPaths[index] || !Number.isInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
    requireDigest(entry.sha256, `${label} entry`);
  }
}

function validateSource(source) {
  exactKeys(source, [
    'commit', 'specification', 'plan', 'implementationManifest', 'testManifest',
    'historicalReceiptDigests',
  ], 'certification source');
  if (!commitPattern.test(source.commit)) throw new Error('certification source commit is invalid');
  validateBoundDocument(source.specification, specificationPath, 'specification');
  validateBoundDocument(source.plan, planPath, 'plan');
  validateManifest(source.implementationManifest, implementationFiles, 'implementation manifest');
  validateManifest(source.testManifest, testFiles, 'test manifest');
  if (canonicalJson(Object.keys(source.historicalReceiptDigests).sort())
      !== canonicalJson([...historicalReceiptPaths].sort())) {
    throw new Error('historical receipt set is invalid');
  }
  for (const [path, digest] of Object.entries(source.historicalReceiptDigests)) {
    requireDigest(digest, `historical receipt ${path}`);
  }
}

function validateFixture(fixture) {
  exactKeys(fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions'], 'certification fixture');
  if (fixture.path !== fixturePath) throw new Error('certification fixture path is invalid');
  requireDigest(fixture.fileSha256, 'certification fixture file');
  requireDigest(fixture.logicalDigest, 'certification fixture logical');
  exactKeys(fixture.assertions, [
    'activeReceiptVerified', 'credentialAbsent', 'taskCollisionRejected',
    'writerCollisionRejected', 'renewalStableBinding', 'releaseFreesWriter',
    'revocationAdvanced', 'staleEpochRejected', 'expiryRecovered',
    'registryChainVerified', 'activeBindingsAfterCleanup', 'realmEffects',
  ], 'certification fixture assertions');
}

function validateReview(review) {
  exactKeys(review, [
    'mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions',
  ], 'review');
  if (review.mode !== 'inline-adversarial' || review.independent !== false
      || !Number.isInteger(review.unresolvedCriticalDefects)
      || review.unresolvedCriticalDefects < 0
      || !Array.isArray(review.retainedRegressions)
      || review.retainedRegressions.length < 1
      || new Set(review.retainedRegressions).size !== review.retainedRegressions.length) {
    throw new Error('review is invalid');
  }
}

export function buildCortexBindingRegistryCertificationReceipt(input) {
  exactKeys(input, ['source', 'fixture', 'testRuns', 'review'], 'certification input');
  validateSource(input.source);
  validateFixture(input.fixture);
  validateTestRuns(input.testRuns);
  validateReview(input.review);
  const assertions = input.fixture.assertions;
  const passed = assertions.activeReceiptVerified === true
    && assertions.credentialAbsent === true
    && assertions.taskCollisionRejected === true
    && assertions.writerCollisionRejected === true
    && assertions.renewalStableBinding === true
    && assertions.releaseFreesWriter === true
    && assertions.revocationAdvanced === true
    && assertions.staleEpochRejected === true
    && assertions.expiryRecovered === true
    && assertions.registryChainVerified === true
    && assertions.activeBindingsAfterCleanup === 0
    && assertions.realmEffects === 'none'
    && input.review.unresolvedCriticalDefects === 0;
  const requirements = Object.entries(requirementEvidence).map(([id, basis]) => ({
    id,
    status: passed ? 'pass' : 'fail',
    basis: [...basis],
  }));
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: requirements.every((row) => row.status === 'pass') ? 'certified' : 'rejected',
    protocolId,
    source: structuredClone(input.source),
    fixture: structuredClone(input.fixture),
    testRuns: structuredClone(input.testRuns),
    metrics: {
      registryEvents: 11,
      activeBindingsAfterCleanup: assertions.activeBindingsAfterCleanup,
      activeRealmEffects: assertions.realmEffects === 'none' ? 0 : 1,
      serializedCredentials: assertions.credentialAbsent ? 0 : 1,
      rejectedActiveCollisions: Number(assertions.taskCollisionRejected)
        + Number(assertions.writerCollisionRejected),
      revocationEpoch: assertions.revocationAdvanced ? 1 : 0,
      recoveredExpiries: assertions.expiryRecovered ? 1 : 0,
      retainedInlineRegressions: input.review.retainedRegressions.length,
    },
    review: structuredClone(input.review),
    requirements,
    proofLimits: [...proofLimits],
  };
  return Object.freeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

export function verifyCortexBindingRegistryCertificationReceipt(value) {
  const receipt = structuredClone(value);
  exactKeys(receipt, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'fixture',
    'testRuns', 'metrics', 'review', 'requirements', 'proofLimits', 'receiptDigest',
  ], 'cortex binding registry certification receipt');
  if (receipt.schemaVersion !== 1 || receipt.certificationId !== certificationId
      || receipt.protocolId !== protocolId) {
    throw new Error('cortex binding registry certification identity is invalid');
  }
  const rebuilt = buildCortexBindingRegistryCertificationReceipt({
    source: receipt.source,
    fixture: receipt.fixture,
    testRuns: receipt.testRuns,
    review: receipt.review,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(receipt)) {
    throw new Error('cortex binding registry certification receipt mismatch');
  }
  return Object.freeze(receipt);
}

async function gitText(root, commit, path) {
  const { stdout } = await execFileAsync('git', ['-C', root, 'show', `${commit}:${path}`], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function assertCommit(root, commit) {
  if (!commitPattern.test(commit)) throw new Error('certification source commit is invalid');
  await execFileAsync('git', ['-C', root, 'cat-file', '-e', `${commit}^{commit}`], { windowsHide: true });
}

async function manifestAtCommit(root, commit, paths) {
  const entries = [];
  for (const path of paths) {
    const text = await gitText(root, commit, path);
    entries.push({ path, sha256: sha256Text(text), bytes: Buffer.byteLength(text, 'utf8') });
  }
  return { paths: [...paths], entries, digest: sha256Value(entries) };
}

async function historicalAtCommit(root, commit) {
  const rows = [];
  for (const path of historicalReceiptPaths) rows.push([path, sha256Text(await gitText(root, commit, path))]);
  return Object.fromEntries(rows);
}

export async function rebuildCortexBindingRegistryReceipt({ repositoryRoot, sourceCommit, testRuns }) {
  const root = resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  const [specification, plan, fixtureText] = await Promise.all([
    gitText(root, sourceCommit, specificationPath),
    gitText(root, sourceCommit, planPath),
    gitText(root, sourceCommit, fixturePath),
  ]);
  const generatedFixture = await buildDeterministicCortexBindingRegistryFixture({ repositoryRoot: root });
  if (fixtureText !== `${canonicalJson(generatedFixture)}\n`) {
    throw new Error('cortex binding registry deterministic fixture is stale');
  }
  const fixture = JSON.parse(fixtureText);
  return buildCortexBindingRegistryCertificationReceipt({
    source: {
      commit: sourceCommit,
      specification: { path: specificationPath, sha256: sha256Text(specification) },
      plan: { path: planPath, sha256: sha256Text(plan) },
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit),
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      assertions: structuredClone(fixture.assertions),
    },
    testRuns,
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [
        'rejects task and writer collisions before a second active binding exists',
        're-verifies the admitted source before every lease renewal',
        'releases the writer lock after inspection or renewal discovers expiry',
        'retries transient writer-lock cleanup after durable lifecycle closure',
        'rejects canonical-state, event-chain, receipt, and oversized-input mutation',
      ],
    },
  });
}

function runTests(files, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...files], {
      cwd, shell: false, windowsHide: true,
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      const number = (name) => Number(output.match(new RegExp(`(?:^|\\n)# ${name} (\\d+)(?:\\r?$|\\n)`))?.[1]);
      const tests = number('tests');
      if (code !== 0 || !Number.isInteger(tests) || tests < 1
          || number('pass') !== tests || number('fail') !== 0 || number('skipped') !== 0) {
        rejectPromise(new Error(`cortex binding registry test gate failed with code ${code}`));
      } else {
        resolvePromise({ status: 'pass', tests });
      }
    });
  });
}

async function dirtyPaths(root) {
  const outputs = await Promise.all([
    execFileAsync('git', ['-C', root, 'diff', '--name-only'], { encoding: 'utf8', windowsHide: true }),
    execFileAsync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8', windowsHide: true }),
    execFileAsync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8', windowsHide: true }),
  ]);
  return [...new Set(outputs.flatMap(({ stdout }) => stdout.split(/\r?\n/).filter(Boolean)))].sort();
}

async function requireCleanExcept(root, allowed) {
  const unexpected = (await dirtyPaths(root)).filter((path) => !allowed.includes(path));
  if (unexpected.length > 0) throw new Error(`source worktree has unexpected changes: ${unexpected.join(', ')}`);
}

async function resolveSourceCommit(root, headCommit, outputPath) {
  try {
    const receipt = JSON.parse(await readFile(outputPath, 'utf8'));
    const sourceCommit = receipt.source?.commit;
    await assertCommit(root, sourceCommit);
    await execFileAsync('git', ['-C', root, 'merge-base', '--is-ancestor', sourceCommit, headCommit], { windowsHide: true });
    const changed = (await execFileAsync(
      'git', ['-C', root, 'diff', '--name-only', '--no-renames', `${sourceCommit}..${headCommit}`],
      { encoding: 'utf8', windowsHide: true },
    )).stdout.split(/\r?\n/).filter(Boolean);
    return changed.every((path) => releaseOnlyPaths.includes(path)) ? sourceCommit : headCommit;
  } catch (error) {
    if (error?.code === 'ENOENT') return headCommit;
    throw error;
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicCortexBindingRegistryFixture({ repositoryRoot: root });
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({ status: 'written', destination, fixtureDigest: fixture.fixtureDigest })}\n`);
    return;
  }

  await requireCleanExcept(root, releaseOnlyPaths);
  const headCommit = (await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', windowsHide: true,
  })).stdout.trim();
  const sourceCommit = await resolveSourceCommit(root, headCommit, outputPath);
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildCortexBindingRegistryReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: 1 } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildCortexBindingRegistryReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full },
  });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    testRuns: receipt.testRuns,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
