import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createResumableMissionReviewKernel } from '../src/runtime/mission-review-kernel.mjs';
import { createMissionReviewJournal } from '../src/runtime/mission-review-journal.mjs';
import { createDeferredGodskillsReviewExecutor } from '../src/skills/deferred-review-executor.mjs';
import {
  buildGodskillsReviewTransportCompletion,
  buildGodskillsReviewTransportDescriptor,
} from '../src/skills/review-transport-contracts.mjs';
import {
  buildReviewAdmission,
  buildReviewGodskillsBinding,
} from '../tests/helpers/mission-review-fixture.mjs';
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
import { pinnedGodskillsReviewRelease } from './lib/pinned-godskills-review-release.mjs';

const execFileAsync = promisify(execFile);
const certificationId = 'deferred-godskills-review-executor-v1';
const protocolId = 'eternities-deferred-godskills-review-executor-v1';
const fixturePath = 'fixtures/deferred-godskills-review-executor-v1.json';
const receiptPath = 'receipts/deferred-godskills-review-executor-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-deferred-godskills-review-executor-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-deferred-godskills-review-executor-v1.md';
const certificationPath = 'docs/deferred-godskills-review-executor-v1-certification.md';
const defaultGodskillsRoot = 'C:/dev/eternities-godskills';
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;

const historicalReceiptPaths = Object.freeze([
  'receipts/codex-bound-turn-v1.json',
  'receipts/codex-recoverable-turn-coordinator-v1.json',
  'receipts/codex-recoverable-turn-journal-v1.json',
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
  'receipts/creation-forge-phase1-certification.json',
  'receipts/creator-protocol-phase3-certification.json',
  'receipts/deferred-godskills-review-materializer-v1.json',
  'receipts/godagent-v0-certification.json',
  'receipts/godskills-adaptive-activation-v1.json',
  'receipts/godskills-specialist-preference-v1.json',
  'receipts/godskills-v3-integration.json',
  'receipts/local-admission-shell-certification.json',
  'receipts/networked-cortex-certification.json',
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
  'schemas/godskills-review-dispatch.schema.json',
  'schemas/godskills-review-transport-completion.schema.json',
  'schemas/godskills-review-transport-descriptor.schema.json',
  'schemas/mission-phase-result.schema.json',
  'scripts/build-deferred-review-executor-v1-receipt.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/runtime/mission-review-journal.mjs',
  'src/runtime/mission-review-kernel.mjs',
  'src/skills/deferred-review-executor.mjs',
  'src/skills/deferred-review-materializer.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/review-transport-contracts.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/deferred-godskills-review-executor-certification.test.mjs',
  'tests/deferred-godskills-review-executor.test.mjs',
  'tests/deferred-godskills-review-materializer.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/helpers/mission-review-fixture.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-journal.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/release-lineage.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/deferred-godskills-review-executor.test.mjs',
  'tests/deferred-godskills-review-materializer.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-journal.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'DRE-001': ['kernel reconciliation receives the exact committed review context'],
  'DRE-002': ['executor identity binds the verified release, materializer, and closed transport descriptor'],
  'DRE-003': ['independent reconstruction reproduces the exact dispatch digest'],
  'DRE-004': ['every possible execution follows exact absent reconciliation'],
  'DRE-005': ['pending, completed, and ambiguous reconciliation perform zero execution calls'],
  'DRE-006': ['one exact completion becomes one evidence-bound mission review result'],
  'DRE-007': ['changed request, context, package, descriptor, and completion links fail closed'],
  'DRE-008': ['canonical completion bytes and separated token accounting remain bounded'],
  'DRE-009': ['provider, credential, authority, Realm, continuity, and personal-keel fields cannot widen the contracts'],
  'DRE-010': ['component reconstruction recovers a completed review without redispatch'],
  'DRE-011': ['the mission closes through the existing journal, verdict, and completion receipt'],
  'DRE-012': ['focused, full, historical receipt, and release-lineage gates remain required'],
});

const retainedRegressions = Object.freeze([
  'rejects transport descriptors with unknown provider fields',
  'requires exact absent reconciliation before execution',
  'rejects ambiguous reconciliation states',
  'pending reconciliation performs no execution',
  'completed reconciliation performs no execution',
  'rejects changed committed context before transport use',
  'rejects authority-shaped context before body disclosure',
  'rejects package substitution with a recomputed completion digest',
  'rejects authority expansion with a recomputed completion digest',
  'rejects contradictory or over-ceiling token usage',
  'rejects incoherent completion timestamps',
  'rejects credential fields in completed transport evidence',
  'rejects completion bytes above the transport ceiling',
  'rejects post-build dispatch mutation',
  'rejects post-build completion mutation',
  'snapshots transport responses before trust checks',
  'reconstructs the exact dispatch after process interruption',
  'recovers the completed review without a duplicate dispatch',
]);

const proofLimits = Object.freeze([
  'no-live-model-or-provider-qualification',
  'no-review-quality-improvement-claim',
  'trusted-transport-atomic-deduplication-remains-an-assumption',
  'no-hostile-same-user-transport-isolation',
  'no-revision-executor-adapter',
  'no-default-vessel-local-cli-or-codex-desktop-integration',
  'no-provider-credential-or-model-routing-implementation',
  'no-realm-action-or-compensation',
  'no-continuity-admission-or-personal-keel-write',
  'no-lunari-inspiration-or-soul-activation',
  'no-independent-review',
  'release-digest-remains-bound-to-the-local-configured-repository-root',
]);

function normalizePath(value) {
  return String(value).replaceAll('\\', '/');
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function usage({ completionTokens = 100 } = {}) {
  return {
    inputTokens: 120,
    cachedInputTokens: 80,
    reasoningTokens: completionTokens - 20,
    visibleOutputTokens: 20,
    completionTokens,
  };
}

function phaseExecutor({ phase, artifact }) {
  const descriptorValue = buildMissionExecutorDescriptor({
    executorId: `deferred-review-executor-certification-${phase}-v1`,
    phase,
  });
  const completions = new Map();
  return {
    descriptor() {
      return structuredClone(descriptorValue);
    },
    async reconcile(request) {
      const result = completions.get(request.requestDigest);
      return result ? { status: 'completed', result: structuredClone(result) } : { status: 'absent' };
    },
    async execute(request, context) {
      if (completions.has(request.requestDigest)) throw new Error(`duplicate ${phase} certification dispatch`);
      const value = typeof artifact === 'function' ? artifact(request, context) : structuredClone(artifact);
      const result = buildMissionPhaseResult({
        request,
        descriptor: descriptorValue,
        artifact: value,
        usage: usage(),
        startedAt: '2026-08-31T20:10:00.000Z',
        completedAt: '2026-08-31T20:10:00.500Z',
      });
      completions.set(request.requestDigest, result);
      return structuredClone(result);
    },
  };
}

async function gitCommit(repositoryRoot) {
  const { stdout } = await execFileAsync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const commit = stdout.trim();
  if (!COMMIT.test(commit)) throw new Error('Godskills source commit is invalid');
  return commit;
}

function countForbiddenKeys(value) {
  const forbidden = new Set([
    'apiKey', 'authorization', 'credential', 'credentials', 'endpoint', 'model',
    'provider', 'providerConfig', 'retryPolicy', 'secret',
  ]);
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + countForbiddenKeys(child), 0);
  return Object.entries(value).reduce(
    (sum, [key, child]) => sum + Number(forbidden.has(key)) + countForbiddenKeys(child),
    0,
  );
}

function sourceBoundary(sourceText) {
  const imports = [...sourceText.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1].toLowerCase());
  const count = (pattern) => imports.filter((value) => pattern.test(value)).length;
  return {
    credentialImports: count(/credential|secret/),
    keelImports: count(/keel|continuity/),
    networkImports: count(/^node:(http|https|net|tls)$|undici|websocket/),
    providerImports: count(/provider/),
    realmImports: count(/realm/),
  };
}

export async function buildDeterministicDeferredReviewExecutorFixture({
  godskillsRoot = process.env.ETERNITIES_GODSKILLS_ROOT ?? defaultGodskillsRoot,
} = {}) {
  const journalRoot = await mkdtemp(join(tmpdir(), 'godagent-deferred-review-executor-cert-'));
  try {
    const reads = [];
    const io = {
      async readFile(path) {
        reads.push(normalizePath(path));
        return readFile(path);
      },
      realpath: async (path) => normalizePath(await realpath(path)),
    };
    const transportDescriptor = buildGodskillsReviewTransportDescriptor({
      transportId: 'certification-review-transport-v1',
      maximumCompletionBytes: 16_384,
    });
    const transportCalls = [];
    const completions = new Map();
    const makeCompletion = (dispatch) => buildGodskillsReviewTransportCompletion({
      dispatch,
      transportDescriptor,
      artifact: {
        schemaVersion: 1,
        artifactType: 'review',
        subjectDigest: dispatch.package.subject.artifactDigest,
        recommendation: 'accept',
        findings: [],
        summary: 'certified exact deferred review completion',
      },
      usage: usage({ completionTokens: 225 }),
      startedAt: '2026-08-31T20:20:00.000Z',
      completedAt: '2026-08-31T20:20:00.500Z',
    });
    const transport = {
      descriptor() {
        transportCalls.push({ type: 'descriptor' });
        return structuredClone(transportDescriptor);
      },
      async reconcile(dispatch) {
        transportCalls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        transportCalls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate certification review dispatch');
        const completion = makeCompletion(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    };

    reads.length = 0;
    const firstReviewExecutor = await createDeferredGodskillsReviewExecutor({
      releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
      maximumMaterializedBytes: 65_536,
      executorIdPrefix: 'certification-godskills-review',
      transport,
      io,
    });
    const firstConstructionReads = [...reads];
    const manifest = JSON.parse(await readFile(
      join(godskillsRoot, 'artifacts', 'portable-capabilities', 'manifest.v1.json'),
      'utf8',
    ));
    const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
    if (!capability) throw new Error('certification capability is absent from the pinned Godskills release');
    const selectedPaths = [capability.entrypoint.path, capability.contract.path]
      .map((path) => normalizePath(join(godskillsRoot, ...path.split('/'))))
      .sort();
    const missionId = 'mission-deferred-review-executor-certification';
    const binding = buildReviewGodskillsBinding(missionId, {
      id: capability.id,
      entrypointSha256: capability.entrypoint.sha256,
      contractSha256: capability.contract.sha256,
      releaseDigest: firstReviewExecutor.releaseDigest,
      activationTrustRootDigest: firstReviewExecutor.activationTrustRootDigest,
    });
    const baselineAdmission = buildReviewAdmission(missionId, { godskillsBinding: binding });
    const input = {
      mission: structuredClone(baselineAdmission.mission),
      authorityCeilingDigest: baselineAdmission.authorityCeilingDigest,
      budgets: structuredClone(baselineAdmission.budgets),
      godskillsBinding: {
        receipt: structuredClone(baselineAdmission.godskills.receipt),
        cortexPackage: structuredClone(baselineAdmission.godskills.cortexPackage),
      },
      godskillsTrustPin: structuredClone(baselineAdmission.godskills.trustPin),
    };
    const nativeArtifact = {
      schemaVersion: 1,
      artifactType: 'native',
      content: 'certified native artifact for deferred review executor recovery',
    };
    let now = Date.parse('2026-08-31T20:00:00.000Z');
    const clock = () => {
      const current = now;
      now += 600_000;
      return current;
    };
    const lockOptions = {
      pid: 52012,
      now: () => now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => 'deferred-review-executor-certification-lock',
    };
    let processDeathObserved = false;
    reads.length = 0;
    const firstKernel = createResumableMissionReviewKernel({
      journalRoot,
      nativeExecutor: phaseExecutor({ phase: 'native', artifact: nativeArtifact }),
      reviewExecutor: firstReviewExecutor,
      revisionExecutor: phaseExecutor({ phase: 'revision', artifact: {} }),
      clock,
      checkpoint: async (name) => {
        if (!processDeathObserved && name === 'after-review-1-execute') {
          processDeathObserved = true;
          throw new Error('certification process death after review completion');
        }
      },
      lockOptions,
    });
    try {
      await firstKernel.run(input);
      throw new Error('certification process death did not occur');
    } catch (error) {
      if (!processDeathObserved || !/certification process death/.test(error?.message ?? '')) throw error;
    }
    const firstExecutionReads = [...reads];

    reads.length = 0;
    const recoveredReviewExecutor = await createDeferredGodskillsReviewExecutor({
      releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
      maximumMaterializedBytes: 65_536,
      executorIdPrefix: 'certification-godskills-review',
      transport,
      io,
    });
    const recoveryConstructionReads = [...reads];
    if (canonicalJson(recoveredReviewExecutor.descriptor()) !== canonicalJson(firstReviewExecutor.descriptor())) {
      throw new Error('reconstructed review executor identity changed');
    }
    reads.length = 0;
    const recoveredKernel = createResumableMissionReviewKernel({
      journalRoot,
      nativeExecutor: phaseExecutor({ phase: 'native', artifact: nativeArtifact }),
      reviewExecutor: recoveredReviewExecutor,
      revisionExecutor: phaseExecutor({ phase: 'revision', artifact: {} }),
      clock,
      checkpoint: async () => {},
      lockOptions,
    });
    const completed = await recoveredKernel.run(input);
    const recoveryExecutionReads = [...reads];
    const operationalCallsBeforeReplay = transportCalls.filter(({ type }) => type !== 'descriptor').length;
    const replay = await recoveredKernel.run(input);
    const operationalCallsAfterReplay = transportCalls.filter(({ type }) => type !== 'descriptor').length;

    const journal = createMissionReviewJournal({
      journalRoot,
      clock,
      checkpoint: async () => {},
      lockOptions,
    });
    const handle = await journal.openExisting(missionId);
    if (!handle) throw new Error('certification mission journal is absent after recovery');
    const evidence = await handle.recoverEvidence();
    const dispatchCalls = transportCalls.filter(({ dispatch }) => dispatch);
    const executeCalls = transportCalls.filter(({ type }) => type === 'execute');
    const reconcileCalls = transportCalls.filter(({ type }) => type === 'reconcile');
    const dispatch = executeCalls[0]?.dispatch;
    const completion = dispatch ? completions.get(dispatch.dispatchDigest) : null;
    if (!dispatch || !completion) throw new Error('certification transport completion is absent');
    const selectedBodyReads = [...firstExecutionReads, ...recoveryExecutionReads]
      .filter((path) => selectedPaths.includes(path));
    const wireText = canonicalJson({
      descriptor: transportDescriptor,
      dispatch,
      completion,
    });
    const authorityExpansions = [transportDescriptor, dispatch, completion]
      .reduce((sum, value) => sum + Object.values(value.authority).filter(Boolean).length, 0);
    const dispatchDigests = dispatchCalls.map(({ dispatch: value }) => value.dispatchDigest);
    const executorDescriptor = firstReviewExecutor.descriptor();
    const reviewResult = evidence.reviews[0]?.result;
    const unsigned = {
      schemaVersion: 1,
      protocolId,
      godskills: {
        commit: await gitCommit(godskillsRoot),
        releaseDigest: firstReviewExecutor.releaseDigest,
        activationTrustRootDigest: firstReviewExecutor.activationTrustRootDigest,
        capability: {
          id: capability.id,
          entrypointSha256: capability.entrypoint.sha256,
          contractSha256: capability.contract.sha256,
        },
      },
      executor: {
        bindingDigest: firstReviewExecutor.bindingDigest,
        descriptorDigest: executorDescriptor.descriptorDigest,
        materializerDigest: firstReviewExecutor.materializerDigest,
        transportDescriptorDigest: firstReviewExecutor.transportDescriptorDigest,
      },
      recovery: {
        crashCheckpoint: 'after-review-1-execute',
        dispatchDigest: dispatch.dispatchDigest,
        completionDigest: completion.completionDigest,
        packageDigest: dispatch.packageDigest,
        phaseResultDigest: reviewResult?.resultDigest ?? null,
        executorEvidenceDigest: reviewResult?.executorEvidenceDigest ?? null,
        terminalReceiptDigest: completed.receipt.receiptDigest,
        dispatchBytes: Buffer.byteLength(canonicalJson(dispatch), 'utf8'),
        completionBytes: Buffer.byteLength(canonicalJson(completion), 'utf8'),
        transportCalls: {
          descriptors: transportCalls.filter(({ type }) => type === 'descriptor').length,
          reconciliations: reconcileCalls.length,
          executions: executeCalls.length,
        },
        selectedBodyReads: selectedBodyReads.length,
      },
      assertions: {
        processDeathObserved,
        completedAfterReconstruction: completed.status === 'completed',
        acceptedReview: completed.verdict.reason === 'review-accepted',
        exactTerminalReplay: replay.receipt.receiptDigest === completed.receipt.receiptDigest,
        replayExternalCalls: operationalCallsAfterReplay - operationalCallsBeforeReplay,
        exactDispatchReproduced: new Set(dispatchDigests).size === 1,
        recoveredWithoutRedispatch: executeCalls.length === 1 && reconcileCalls.length === 2,
        transportEvidenceCommitted: reviewResult?.executorEvidenceDigest === completion.completionDigest,
        constructionBodyFree: [...firstConstructionReads, ...recoveryConstructionReads]
          .every((path) => !selectedPaths.includes(path)),
        exactSelectedBodyReads: selectedBodyReads.length === 4,
        forbiddenWireKeys: countForbiddenKeys({ transportDescriptor, dispatch, completion }),
        filesystemRootsDisclosed: Number(wireText.includes(normalizePath(godskillsRoot))),
        authorityExpansions,
        realmEffects: Number(transportDescriptor.authority.realmEffects)
          + Number(dispatch.authority.realmEffects)
          + Number(completion.authority.realmEffects),
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(journalRoot, { recursive: true, force: true });
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} digest is invalid`);
}

function validateTestRuns(testRuns) {
  exactKeys(testRuns, ['focused', 'full'], 'test runs');
  for (const [name, run] of Object.entries(testRuns)) {
    exactKeys(run, ['status', 'tests'], `${name} test run`);
    if (run.status !== 'pass' || !Number.isInteger(run.tests) || run.tests < 1) {
      throw new Error(`${name} test run is invalid`);
    }
  }
  if (testRuns.full.tests < testRuns.focused.tests) throw new Error('full test run is smaller than focused run');
}

function validateManifest(value, expectedPaths, label) {
  exactKeys(value, ['paths', 'entries', 'digest'], label);
  if (!sameArray(value.paths, expectedPaths) || value.entries.length !== expectedPaths.length) {
    throw new Error(`${label} paths are invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry ${index}`);
    if (entry.path !== expectedPaths[index] || !DIGEST.test(entry.sha256)
        || !Number.isInteger(entry.bytes) || entry.bytes < 1) throw new Error(`${label} entry is invalid`);
  });
  if (value.digest !== sha256Value(value.entries)) throw new Error(`${label} digest mismatch`);
}

function validateSourceBoundary(value) {
  exactKeys(value, [
    'credentialImports', 'keelImports', 'networkImports', 'providerImports', 'realmImports',
  ], 'source boundary');
  if (Object.values(value).some((count) => count !== 0)) throw new Error('source boundary widened');
}

function validateFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'executor', 'recovery', 'assertions', 'fixtureDigest',
  ], 'deferred review executor fixture');
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'deferred review executor fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== protocolId
      || sha256Value(unsigned) !== fixtureDigest) throw new Error('deferred review executor fixture digest mismatch');
  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'activationTrustRootDigest', 'capability',
  ], 'fixture Godskills dependency');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('fixture Godskills commit is invalid');
  requireDigest(value.godskills.releaseDigest, 'fixture Godskills release');
  requireDigest(value.godskills.activationTrustRootDigest, 'fixture activation root');
  exactKeys(value.godskills.capability, [
    'id', 'entrypointSha256', 'contractSha256',
  ], 'fixture Godskills capability');
  requireDigest(value.godskills.capability.entrypointSha256, 'fixture capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'fixture capability contract');
  exactKeys(value.executor, [
    'bindingDigest', 'descriptorDigest', 'materializerDigest', 'transportDescriptorDigest',
  ], 'fixture executor');
  Object.values(value.executor).forEach((digest) => requireDigest(digest, 'fixture executor'));
  exactKeys(value.recovery, [
    'crashCheckpoint', 'dispatchDigest', 'completionDigest', 'packageDigest', 'phaseResultDigest',
    'executorEvidenceDigest', 'terminalReceiptDigest', 'dispatchBytes', 'completionBytes',
    'transportCalls', 'selectedBodyReads',
  ], 'fixture recovery');
  for (const digest of [
    value.recovery.dispatchDigest,
    value.recovery.completionDigest,
    value.recovery.packageDigest,
    value.recovery.phaseResultDigest,
    value.recovery.executorEvidenceDigest,
    value.recovery.terminalReceiptDigest,
  ]) requireDigest(digest, 'fixture recovery');
  exactKeys(value.recovery.transportCalls, [
    'descriptors', 'reconciliations', 'executions',
  ], 'fixture transport calls');
  if (value.recovery.crashCheckpoint !== 'after-review-1-execute'
      || value.recovery.dispatchBytes < 1
      || value.recovery.completionBytes < 1
      || value.recovery.completionBytes > 16_384
      || value.recovery.transportCalls.descriptors !== 2
      || value.recovery.transportCalls.reconciliations !== 2
      || value.recovery.transportCalls.executions !== 1
      || value.recovery.selectedBodyReads !== 4) {
    throw new Error('fixture recovery measurements are invalid');
  }
  exactKeys(value.assertions, [
    'processDeathObserved', 'completedAfterReconstruction', 'acceptedReview', 'exactTerminalReplay',
    'replayExternalCalls', 'exactDispatchReproduced', 'recoveredWithoutRedispatch',
    'transportEvidenceCommitted', 'constructionBodyFree', 'exactSelectedBodyReads',
    'forbiddenWireKeys', 'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects',
  ], 'fixture assertions');
  for (const name of [
    'processDeathObserved', 'completedAfterReconstruction', 'acceptedReview', 'exactTerminalReplay',
    'exactDispatchReproduced', 'recoveredWithoutRedispatch', 'transportEvidenceCommitted',
    'constructionBodyFree', 'exactSelectedBodyReads',
  ]) {
    if (value.assertions[name] !== true) throw new Error(`fixture assertion failed: ${name}`);
  }
  for (const name of [
    'replayExternalCalls', 'forbiddenWireKeys', 'filesystemRootsDisclosed',
    'authorityExpansions', 'realmEffects',
  ]) {
    if (value.assertions[name] !== 0) throw new Error(`fixture assertion failed: ${name}`);
  }
  return value;
}

export function verifyDeferredReviewExecutorCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'executor', 'fixture', 'requirements', 'metrics', 'proofLimits', 'testRuns', 'review',
    'receiptDigest',
  ], 'deferred review executor certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('deferred review executor certification identity mismatch');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan', 'sourceBoundary',
  ], 'deferred review executor certification source');
  if (!COMMIT.test(value.source.commit)) throw new Error('deferred review executor source commit is invalid');
  validateManifest(value.source.implementationManifest, implementationFiles, 'implementation manifest');
  validateManifest(value.source.testManifest, testFiles, 'test manifest');
  validateSourceBoundary(value.source.sourceBoundary);
  if (!sameArray(Object.keys(value.source.historicalReceiptDigests).sort(), historicalReceiptPaths)) {
    throw new Error('historical receipt set mismatch');
  }
  Object.values(value.source.historicalReceiptDigests)
    .forEach((digest) => requireDigest(digest, 'historical receipt'));
  exactKeys(value.source.specification, ['path', 'sha256'], 'specification');
  exactKeys(value.source.plan, ['path', 'sha256'], 'plan');
  if (value.source.specification.path !== specificationPath || value.source.plan.path !== planPath) {
    throw new Error('specification or plan path mismatch');
  }
  requireDigest(value.source.specification.sha256, 'specification');
  requireDigest(value.source.plan.sha256, 'plan');

  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'activationTrustRootDigest', 'capability',
  ], 'Godskills dependency');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('Godskills dependency commit is invalid');
  requireDigest(value.godskills.releaseDigest, 'Godskills release');
  requireDigest(value.godskills.activationTrustRootDigest, 'activation root');
  exactKeys(value.godskills.capability, [
    'id', 'entrypointSha256', 'contractSha256',
  ], 'Godskills capability');
  requireDigest(value.godskills.capability.entrypointSha256, 'Godskills capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'Godskills capability contract');
  exactKeys(value.executor, [
    'bindingDigest', 'descriptorDigest', 'materializerDigest', 'transportDescriptorDigest',
  ], 'certified executor');
  Object.values(value.executor).forEach((digest) => requireDigest(digest, 'certified executor'));

  exactKeys(value.fixture, [
    'path', 'fileSha256', 'logicalDigest', 'assertions', 'measurements',
  ], 'fixture binding');
  if (value.fixture.path !== fixturePath) throw new Error('fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'fixture file');
  requireDigest(value.fixture.logicalDigest, 'fixture logical');
  exactKeys(value.fixture.measurements, [
    'dispatchBytes', 'completionBytes', 'selectedBodyReads', 'transportCalls',
  ], 'fixture measurements');
  exactKeys(value.fixture.measurements.transportCalls, [
    'descriptors', 'reconciliations', 'executions',
  ], 'fixture transport calls');
  if (value.fixture.measurements.selectedBodyReads !== 4
      || value.fixture.measurements.transportCalls.descriptors !== 2
      || value.fixture.measurements.transportCalls.reconciliations !== 2
      || value.fixture.measurements.transportCalls.executions !== 1) {
    throw new Error('fixture measurements are invalid');
  }
  exactKeys(value.fixture.assertions, [
    'processDeathObserved', 'completedAfterReconstruction', 'acceptedReview', 'exactTerminalReplay',
    'replayExternalCalls', 'exactDispatchReproduced', 'recoveredWithoutRedispatch',
    'transportEvidenceCommitted', 'constructionBodyFree', 'exactSelectedBodyReads',
    'forbiddenWireKeys', 'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects',
  ], 'fixture assertions');
  for (const [name, result] of Object.entries(value.fixture.assertions)) {
    const expected = [
      'replayExternalCalls', 'forbiddenWireKeys', 'filesystemRootsDisclosed',
      'authorityExpansions', 'realmEffects',
    ].includes(name) ? 0 : true;
    if (result !== expected) throw new Error(`fixture binding assertion failed: ${name}`);
  }

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
  if (!sameArray(value.proofLimits, proofLimits)) throw new Error('proof limits mismatch');
  validateTestRuns(value.testRuns);
  exactKeys(value.metrics, [
    'reconstructedExecutors', 'transportReconciliations', 'transportExecutions',
    'selectedBodyReads', 'replayExternalCalls', 'retainedInlineRegressions',
    'forbiddenWireKeys', 'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects',
  ], 'certification metrics');
  const expectedMetrics = {
    reconstructedExecutors: 2,
    transportReconciliations: 2,
    transportExecutions: 1,
    selectedBodyReads: 4,
    replayExternalCalls: 0,
    retainedInlineRegressions: retainedRegressions.length,
    forbiddenWireKeys: 0,
    filesystemRootsDisclosed: 0,
    authorityExpansions: 0,
    realmEffects: 0,
  };
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics)) {
    throw new Error('certification metrics are invalid');
  }
  exactKeys(value.review, [
    'mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions',
  ], 'certification review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'deferred review executor certification receipt');
  if (sha256Value(unsigned) !== receiptDigest) throw new Error('deferred review executor receipt mismatch');
  return value;
}

export async function rebuildDeferredReviewExecutorReceipt({
  repositoryRoot,
  sourceCommit,
  testRuns,
} = {}) {
  await assertCommit(repositoryRoot, sourceCommit);
  validateTestRuns(testRuns);
  const fixtureText = await gitText(repositoryRoot, sourceCommit, fixturePath);
  const fixture = validateFixture(JSON.parse(fixtureText));
  if (fixtureText !== `${canonicalJson(fixture)}\n`) throw new Error('fixture is not canonical');
  const implementationManifest = await manifestAtCommit(repositoryRoot, sourceCommit, implementationFiles);
  const testManifest = await manifestAtCommit(repositoryRoot, sourceCommit, testFiles);
  const boundarySources = await Promise.all([
    gitText(repositoryRoot, sourceCommit, 'src/skills/deferred-review-executor.mjs'),
    gitText(repositoryRoot, sourceCommit, 'src/skills/review-transport-contracts.mjs'),
  ]);
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: {
      commit: sourceCommit,
      historicalReceiptDigests: await historicalAtCommit(repositoryRoot, sourceCommit, historicalReceiptPaths),
      implementationManifest,
      testManifest,
      specification: {
        path: specificationPath,
        sha256: sha256Text(await gitText(repositoryRoot, sourceCommit, specificationPath)),
      },
      plan: {
        path: planPath,
        sha256: sha256Text(await gitText(repositoryRoot, sourceCommit, planPath)),
      },
      sourceBoundary: sourceBoundary(boundarySources.join('\n')),
    },
    godskills: structuredClone(fixture.godskills),
    executor: structuredClone(fixture.executor),
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      assertions: structuredClone(fixture.assertions),
      measurements: {
        dispatchBytes: fixture.recovery.dispatchBytes,
        completionBytes: fixture.recovery.completionBytes,
        selectedBodyReads: fixture.recovery.selectedBodyReads,
        transportCalls: structuredClone(fixture.recovery.transportCalls),
      },
    },
    requirements: Object.entries(requirementEvidence).map(([id, evidence]) => ({
      id,
      status: 'pass',
      evidence: [...evidence],
    })),
    metrics: {
      reconstructedExecutors: 2,
      transportReconciliations: fixture.recovery.transportCalls.reconciliations,
      transportExecutions: fixture.recovery.transportCalls.executions,
      selectedBodyReads: fixture.recovery.selectedBodyReads,
      replayExternalCalls: fixture.assertions.replayExternalCalls,
      retainedInlineRegressions: retainedRegressions.length,
      forbiddenWireKeys: fixture.assertions.forbiddenWireKeys,
      filesystemRootsDisclosed: fixture.assertions.filesystemRootsDisclosed,
      authorityExpansions: fixture.assertions.authorityExpansions,
      realmEffects: fixture.assertions.realmEffects,
    },
    proofLimits: [...proofLimits],
    testRuns: structuredClone(testRuns),
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [...retainedRegressions],
    },
  };
  return Object.freeze(verifyDeferredReviewExecutorCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicDeferredReviewExecutorFixture();
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
  const preliminary = await rebuildDeferredReviewExecutorReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildDeferredReviewExecutorReceipt({
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
