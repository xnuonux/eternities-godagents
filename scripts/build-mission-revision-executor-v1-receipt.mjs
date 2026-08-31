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
import { createMissionReviewJournal } from '../src/runtime/mission-review-journal.mjs';
import { createResumableMissionReviewKernel } from '../src/runtime/mission-review-kernel.mjs';
import { createMissionRevisionExecutor } from '../src/runtime/mission-revision-executor.mjs';
import {
  buildMissionRevisionTransportCompletion,
  buildMissionRevisionTransportDescriptor,
} from '../src/runtime/mission-revision-transport-contracts.mjs';
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
import {
  pinnedGodskillsReviewRelease,
  pinnedGodskillsReviewSourceCommit,
} from './lib/pinned-godskills-review-release.mjs';

const execFileAsync = promisify(execFile);
const certificationId = 'recoverable-mission-revision-executor-v1';
const protocolId = 'eternities-mission-revision-executor-v1';
const fixturePath = 'fixtures/recoverable-mission-revision-executor-v1.json';
const receiptPath = 'receipts/recoverable-mission-revision-executor-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-recoverable-mission-revision-executor-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-recoverable-mission-revision-executor-v1.md';
const certificationPath = 'docs/recoverable-mission-revision-executor-v1-certification.md';
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
  'receipts/deferred-godskills-review-executor-v1.json',
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
  'schemas/mission-revision-dispatch.schema.json',
  'schemas/mission-revision-package.schema.json',
  'schemas/mission-revision-transport-completion.schema.json',
  'schemas/mission-revision-transport-descriptor.schema.json',
  'scripts/build-mission-revision-executor-v1-receipt.mjs',
  'scripts/lib/pinned-godskills-review-release.mjs',
  specificationPath,
  'src/certification/verify-ledger.mjs',
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/runtime/mission-review-journal.mjs',
  'src/runtime/mission-review-kernel.mjs',
  'src/runtime/mission-revision-executor.mjs',
  'src/runtime/mission-revision-materializer.mjs',
  'src/runtime/mission-revision-transport-contracts.mjs',
  'src/skills/deferred-review-executor.mjs',
  'src/skills/deferred-review-materializer.mjs',
  'src/skills/release-verifier.mjs',
  'src/skills/review-transport-contracts.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/certification-ledger.test.mjs',
  'tests/deferred-godskills-review-executor.test.mjs',
  'tests/godskills-release-verifier.test.mjs',
  'tests/helpers/mission-review-fixture.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-journal.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/mission-revision-executor-certification.test.mjs',
  'tests/mission-revision-executor.test.mjs',
  'tests/recoverable-revision-executor-integration.test.mjs',
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
  'tests/mission-revision-executor.test.mjs',
  'tests/recoverable-revision-executor-integration.test.mjs',
  'tests/schemas.test.mjs',
]);

const releaseOnlyPaths = Object.freeze([certificationPath, receiptPath]);

const requirementEvidence = Object.freeze({
  'RRE-001': ['revision reconciliation receives exact immutable admission and committed artifacts'],
  'RRE-002': ['package construction validates request, artifacts, findings, bytes, tokens, and authority'],
  'RRE-003': ['revision materialization opens no Godskill body'],
  'RRE-004': ['executor identity binds materializer and transport descriptors'],
  'RRE-005': ['component reconstruction reproduces the exact revision dispatch'],
  'RRE-006': ['every possible execution follows exact absent reconciliation'],
  'RRE-007': ['pending, completed, and ambiguous reconciliation perform zero execution calls'],
  'RRE-008': ['completion addresses every required and only known finding'],
  'RRE-009': ['changed package, context, completion, usage, authority, time, and ceilings fail closed'],
  'RRE-010': ['process reconstruction recovers completed revision without redispatch'],
  'RRE-011': ['second Godskills review and terminal receipt close the exact revision'],
  'RRE-012': ['deterministic fixture, tests, receipt ledger, and release lineage remain gates'],
});

const retainedRegressions = Object.freeze([
  'revision reconciliation receives the exact immutable admission and artifacts',
  'transport descriptors reject provider fields and authority expansion',
  'direct execution without exact absent reconciliation is rejected',
  'pending and completed reconciliation perform no execution',
  'ambiguous reconciliation states fail closed',
  'changed review context fails before transport use',
  'missing required finding ids are rejected',
  'unknown addressed finding ids are rejected',
  'package substitution is rejected after outer rehash',
  'mission and admission detachment are rejected after coherent rehash',
  'artifact ceiling detachment is rejected after coherent rehash',
  'contradictory and over-ceiling token usage is rejected',
  'authority expansion is rejected after outer rehash',
  'incoherent completion time is rejected',
  'credential-shaped completion fields are rejected',
  'oversized revision artifacts are rejected',
  'oversized packages and completions are rejected',
  'transport responses are snapshotted before trust checks',
  'revision dispatch reproduces after component reconstruction',
  'completed revision recovers without redispatch',
  'final review binds the exact recovered revision',
  'review dispatch rejects coherently rehashed mission and admission detachment',
]);

const proofLimits = Object.freeze([
  'no-live-model-or-provider-qualification',
  'no-revision-quality-improvement-claim',
  'trusted-transport-terminal-lookup-and-atomic-deduplication-remain-assumptions',
  'no-hostile-same-user-transport-isolation',
  'no-generic-native-executor-adapter',
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

function usage(completionTokens) {
  return {
    inputTokens: 800,
    cachedInputTokens: 600,
    reasoningTokens: completionTokens - 40,
    visibleOutputTokens: 40,
    completionTokens,
  };
}

async function gitCommit(repositoryRoot) {
  await execFileAsync('git', [
    '-C', repositoryRoot, 'merge-base', '--is-ancestor', pinnedGodskillsReviewSourceCommit, 'HEAD',
  ], { windowsHide: true });
  return pinnedGodskillsReviewSourceCommit;
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

function nativeExecutor() {
  const descriptor = buildMissionExecutorDescriptor({
    executorId: 'revision-executor-certification-native-v1',
    phase: 'native',
  });
  const completions = new Map();
  return {
    descriptor() {
      return structuredClone(descriptor);
    },
    async reconcile(request) {
      const result = completions.get(request.requestDigest);
      return result ? { status: 'completed', result: structuredClone(result) } : { status: 'absent' };
    },
    async execute(request) {
      const result = buildMissionPhaseResult({
        request,
        descriptor,
        artifact: {
          schemaVersion: 1,
          artifactType: 'native',
          content: 'certification draft whose evidence link requires exact repair',
        },
        usage: usage(120),
        startedAt: '2026-08-31T23:10:00.000Z',
        completedAt: '2026-08-31T23:10:00.500Z',
      });
      completions.set(request.requestDigest, result);
      return structuredClone(result);
    },
  };
}

function deterministicReviewTransport() {
  const descriptor = buildGodskillsReviewTransportDescriptor({
    transportId: 'revision-certification-review-v1',
    maximumCompletionBytes: 16_384,
  });
  const calls = [];
  const completions = new Map();
  const complete = (dispatch) => buildGodskillsReviewTransportCompletion({
    dispatch,
    transportDescriptor: descriptor,
    artifact: {
      schemaVersion: 1,
      artifactType: 'review',
      subjectDigest: dispatch.package.subject.artifactDigest,
      recommendation: dispatch.package.round === 1 ? 'revise' : 'accept',
      findings: dispatch.package.round === 1
        ? [{
          id: 'repair-evidence-link',
          severity: 'important',
          required: true,
          message: 'replace the ambiguous evidence link with the exact committed digest',
        }]
        : [],
      summary: dispatch.package.round === 1
        ? 'one exact evidence repair is required'
        : 'the recovered revision is accepted',
    },
    usage: usage(220),
    startedAt: dispatch.package.round === 1
      ? '2026-08-31T23:20:00.000Z'
      : '2026-08-31T23:40:00.000Z',
    completedAt: dispatch.package.round === 1
      ? '2026-08-31T23:20:00.500Z'
      : '2026-08-31T23:40:00.500Z',
  });
  return {
    descriptor,
    calls,
    completions,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate certification review dispatch');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

function deterministicRevisionTransport() {
  const descriptor = buildMissionRevisionTransportDescriptor({
    transportId: 'revision-certification-transport-v1',
    maximumCompletionBytes: 16_384,
  });
  const calls = [];
  const completions = new Map();
  const complete = (dispatch) => buildMissionRevisionTransportCompletion({
    dispatch,
    transportDescriptor: descriptor,
    artifact: {
      schemaVersion: 1,
      artifactType: 'revision',
      nativeArtifactDigest: dispatch.package.native.artifactDigest,
      reviewArtifactDigest: dispatch.package.review.artifactDigest,
      addressedFindingIds: ['repair-evidence-link'],
      content: `certified revision bound to ${dispatch.package.native.artifactDigest}`,
    },
    usage: usage(300),
    startedAt: '2026-08-31T23:30:00.000Z',
    completedAt: '2026-08-31T23:30:00.500Z',
  });
  return {
    descriptor,
    calls,
    completions,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        return completion
          ? { status: 'completed', completion: structuredClone(completion) }
          : { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate certification revision dispatch');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

export async function buildDeterministicMissionRevisionExecutorFixture({
  godskillsRoot = process.env.ETERNITIES_GODSKILLS_ROOT ?? defaultGodskillsRoot,
} = {}) {
  const journalRoot = await mkdtemp(join(tmpdir(), 'godagent-revision-executor-cert-'));
  try {
    const reads = [];
    const io = {
      async readFile(path) {
        reads.push(normalizePath(path));
        return readFile(path);
      },
      realpath: async (path) => normalizePath(await realpath(path)),
    };
    const reviewTransport = deterministicReviewTransport();
    const revisionTransport = deterministicRevisionTransport();
    reads.length = 0;
    const firstReviewExecutor = await createDeferredGodskillsReviewExecutor({
      releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
      maximumMaterializedBytes: 65_536,
      executorIdPrefix: 'revision-certification-review',
      transport: reviewTransport.adapter,
      io,
    });
    const firstReviewConstructionReads = [...reads];
    const firstRevisionExecutor = await createMissionRevisionExecutor({
      maximumMaterializedBytes: 32_768,
      executorIdPrefix: 'revision-certification',
      transport: revisionTransport.adapter,
    });
    const manifest = JSON.parse(await readFile(
      join(godskillsRoot, 'artifacts', 'portable-capabilities', 'manifest.v1.json'),
      'utf8',
    ));
    const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
    if (!capability) throw new Error('certification capability is absent from the pinned Godskills release');
    const selectedPaths = [capability.entrypoint.path, capability.contract.path]
      .map((path) => normalizePath(join(godskillsRoot, ...path.split('/'))))
      .sort();
    const missionId = 'mission-recoverable-revision-executor-certification';
    const binding = buildReviewGodskillsBinding(missionId, {
      id: capability.id,
      entrypointSha256: capability.entrypoint.sha256,
      contractSha256: capability.contract.sha256,
      releaseDigest: firstReviewExecutor.releaseDigest,
      activationTrustRootDigest: firstReviewExecutor.activationTrustRootDigest,
    });
    const baseline = buildReviewAdmission(missionId, { godskillsBinding: binding });
    const input = {
      mission: structuredClone(baseline.mission),
      authorityCeilingDigest: baseline.authorityCeilingDigest,
      budgets: structuredClone(baseline.budgets),
      godskillsBinding: {
        receipt: structuredClone(baseline.godskills.receipt),
        cortexPackage: structuredClone(baseline.godskills.cortexPackage),
      },
      godskillsTrustPin: structuredClone(baseline.godskills.trustPin),
    };
    let now = Date.parse('2026-08-31T23:00:00.000Z');
    const clock = () => {
      const current = now;
      now += 600_000;
      return current;
    };
    const lockOptions = {
      pid: 52022,
      now: () => now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => 'revision-executor-certification-lock',
    };
    let processDeathObserved = false;
    reads.length = 0;
    const firstKernel = createResumableMissionReviewKernel({
      journalRoot,
      nativeExecutor: nativeExecutor(),
      reviewExecutor: firstReviewExecutor,
      revisionExecutor: firstRevisionExecutor,
      clock,
      checkpoint: async (name) => {
        if (!processDeathObserved && name === 'after-revision-execute') {
          processDeathObserved = true;
          throw new Error('certification process death after revision completion');
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
    const firstRunReads = [...reads];

    reads.length = 0;
    const recoveredReviewExecutor = await createDeferredGodskillsReviewExecutor({
      releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
      maximumMaterializedBytes: 65_536,
      executorIdPrefix: 'revision-certification-review',
      transport: reviewTransport.adapter,
      io,
    });
    const recoveryReviewConstructionReads = [...reads];
    const recoveredRevisionExecutor = await createMissionRevisionExecutor({
      maximumMaterializedBytes: 32_768,
      executorIdPrefix: 'revision-certification',
      transport: revisionTransport.adapter,
    });
    if (canonicalJson(recoveredReviewExecutor.descriptor()) !== canonicalJson(firstReviewExecutor.descriptor())
        || canonicalJson(recoveredRevisionExecutor.descriptor()) !== canonicalJson(firstRevisionExecutor.descriptor())) {
      throw new Error('reconstructed executor identity changed');
    }
    reads.length = 0;
    const recoveredKernel = createResumableMissionReviewKernel({
      journalRoot,
      nativeExecutor: nativeExecutor(),
      reviewExecutor: recoveredReviewExecutor,
      revisionExecutor: recoveredRevisionExecutor,
      clock,
      checkpoint: async () => {},
      lockOptions,
    });
    const completed = await recoveredKernel.run(input);
    const recoveryRunReads = [...reads];
    const operationsBeforeReplay = reviewTransport.calls.filter(({ type }) => type !== 'descriptor').length
      + revisionTransport.calls.filter(({ type }) => type !== 'descriptor').length;
    const replay = await recoveredKernel.run(input);
    const operationsAfterReplay = reviewTransport.calls.filter(({ type }) => type !== 'descriptor').length
      + revisionTransport.calls.filter(({ type }) => type !== 'descriptor').length;

    const journal = createMissionReviewJournal({ journalRoot, clock, checkpoint: async () => {}, lockOptions });
    const handle = await journal.openExisting(missionId);
    if (!handle) throw new Error('certification mission journal is absent');
    const evidence = await handle.recoverEvidence();
    const revisionDispatchCalls = revisionTransport.calls.filter(({ dispatch }) => dispatch);
    const revisionExecuteCalls = revisionTransport.calls.filter(({ type }) => type === 'execute');
    const revisionReconcileCalls = revisionTransport.calls.filter(({ type }) => type === 'reconcile');
    const reviewExecuteCalls = reviewTransport.calls.filter(({ type }) => type === 'execute');
    const revisionDispatch = revisionExecuteCalls[0]?.dispatch;
    const revisionCompletion = revisionDispatch
      ? revisionTransport.completions.get(revisionDispatch.dispatchDigest)
      : null;
    if (!revisionDispatch || !revisionCompletion) throw new Error('certification revision completion is absent');
    const finalReviewDispatch = reviewExecuteCalls.at(-1)?.dispatch;
    if (!finalReviewDispatch || finalReviewDispatch.package.round !== 2) {
      throw new Error('certification final review dispatch is absent');
    }
    const selectedBodyReads = [...firstRunReads, ...recoveryRunReads]
      .filter((path) => selectedPaths.includes(path));
    const revisionWire = {
      descriptor: revisionTransport.descriptor,
      dispatch: revisionDispatch,
      completion: revisionCompletion,
    };
    const revisionWireText = canonicalJson(revisionWire);
    const authorityExpansions = Object.values(revisionTransport.descriptor.authority).filter(Boolean).length
      + Object.values(revisionDispatch.authority).filter(Boolean).length
      + Object.values(revisionCompletion.authority).filter(Boolean).length;
    const revisionEvidence = evidence.revision?.result;
    const finalReviewEvidence = evidence.reviews[1];
    const reviewDescriptor = firstReviewExecutor.descriptor();
    const revisionDescriptor = firstRevisionExecutor.descriptor();
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
      reviewExecutor: {
        bindingDigest: firstReviewExecutor.bindingDigest,
        descriptorDigest: reviewDescriptor.descriptorDigest,
        materializerDigest: firstReviewExecutor.materializerDigest,
        transportDescriptorDigest: firstReviewExecutor.transportDescriptorDigest,
      },
      revisionExecutor: {
        bindingDigest: firstRevisionExecutor.bindingDigest,
        descriptorDigest: revisionDescriptor.descriptorDigest,
        materializerDigest: firstRevisionExecutor.materializerDigest,
        transportDescriptorDigest: firstRevisionExecutor.transportDescriptorDigest,
      },
      recovery: {
        crashCheckpoint: 'after-revision-execute',
        revisionDispatchDigest: revisionDispatch.dispatchDigest,
        revisionCompletionDigest: revisionCompletion.completionDigest,
        revisionPackageDigest: revisionDispatch.packageDigest,
        revisionResultDigest: revisionEvidence?.resultDigest ?? null,
        revisionExecutorEvidenceDigest: revisionEvidence?.executorEvidenceDigest ?? null,
        finalReviewDispatchDigest: finalReviewDispatch.dispatchDigest,
        finalReviewResultDigest: finalReviewEvidence?.result?.resultDigest ?? null,
        terminalReceiptDigest: completed.receipt.receiptDigest,
        revisionPackageBytes: Buffer.byteLength(canonicalJson(revisionDispatch.package), 'utf8'),
        revisionDispatchBytes: Buffer.byteLength(canonicalJson(revisionDispatch), 'utf8'),
        revisionCompletionBytes: Buffer.byteLength(canonicalJson(revisionCompletion), 'utf8'),
        reviewTransportCalls: {
          descriptors: reviewTransport.calls.filter(({ type }) => type === 'descriptor').length,
          reconciliations: reviewTransport.calls.filter(({ type }) => type === 'reconcile').length,
          executions: reviewExecuteCalls.length,
        },
        revisionTransportCalls: {
          descriptors: revisionTransport.calls.filter(({ type }) => type === 'descriptor').length,
          reconciliations: revisionReconcileCalls.length,
          executions: revisionExecuteCalls.length,
        },
        selectedGodskillBodyReads: selectedBodyReads.length,
      },
      assertions: {
        processDeathObserved,
        completedAfterReconstruction: completed.status === 'completed',
        acceptedRevision: completed.verdict.reason === 'revision-review-accepted',
        exactTerminalReplay: replay.receipt.receiptDigest === completed.receipt.receiptDigest,
        replayExternalCalls: operationsAfterReplay - operationsBeforeReplay,
        exactRevisionDispatchReproduced: new Set(revisionDispatchCalls
          .map(({ dispatch }) => dispatch.dispatchDigest)).size === 1,
        revisionRecoveredWithoutRedispatch: revisionExecuteCalls.length === 1
          && revisionReconcileCalls.length === 2,
        revisionEvidenceCommitted: revisionEvidence?.executorEvidenceDigest === revisionCompletion.completionDigest,
        finalReviewBoundExactRevision: finalReviewDispatch.package.subject.artifactDigest
          === revisionEvidence?.artifactDigest,
        finalReviewAccepted: finalReviewEvidence?.artifact?.recommendation === 'accept',
        constructionGodskillBodyFree: [...firstReviewConstructionReads, ...recoveryReviewConstructionReads]
          .every((path) => !selectedPaths.includes(path)),
        exactGodskillBodyReads: selectedBodyReads.length === 4,
        revisionPackageGodskillBodyFree: !revisionWireText.includes('entrypointSha256')
          && !revisionWireText.includes('contractSha256')
          && !revisionWireText.includes('deferredReviews'),
        forbiddenRevisionWireKeys: countForbiddenKeys(revisionWire),
        filesystemRootsDisclosed: Number(revisionWireText.includes(normalizePath(godskillsRoot))),
        authorityExpansions,
        realmEffects: Number(revisionTransport.descriptor.authority.realmEffects)
          + Number(revisionDispatch.authority.realmEffects)
          + Number(revisionCompletion.authority.realmEffects),
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

function validateExecutorIdentity(value, label) {
  exactKeys(value, [
    'bindingDigest', 'descriptorDigest', 'materializerDigest', 'transportDescriptorDigest',
  ], label);
  Object.values(value).forEach((digest) => requireDigest(digest, label));
}

function validateFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'godskills', 'reviewExecutor', 'revisionExecutor',
    'recovery', 'assertions', 'fixtureDigest',
  ], 'mission revision executor fixture');
  const { fixtureDigest, ...unsigned } = value;
  requireDigest(fixtureDigest, 'mission revision executor fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== protocolId
      || sha256Value(unsigned) !== fixtureDigest) throw new Error('mission revision executor fixture digest mismatch');
  exactKeys(value.godskills, [
    'commit', 'releaseDigest', 'activationTrustRootDigest', 'capability',
  ], 'fixture Godskills dependency');
  if (!COMMIT.test(value.godskills.commit)) throw new Error('fixture Godskills commit is invalid');
  requireDigest(value.godskills.releaseDigest, 'fixture Godskills release');
  requireDigest(value.godskills.activationTrustRootDigest, 'fixture activation root');
  exactKeys(value.godskills.capability, [
    'id', 'entrypointSha256', 'contractSha256',
  ], 'fixture capability');
  requireDigest(value.godskills.capability.entrypointSha256, 'fixture capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'fixture capability contract');
  validateExecutorIdentity(value.reviewExecutor, 'fixture review executor');
  validateExecutorIdentity(value.revisionExecutor, 'fixture revision executor');
  exactKeys(value.recovery, [
    'crashCheckpoint', 'revisionDispatchDigest', 'revisionCompletionDigest',
    'revisionPackageDigest', 'revisionResultDigest', 'revisionExecutorEvidenceDigest',
    'finalReviewDispatchDigest', 'finalReviewResultDigest', 'terminalReceiptDigest',
    'revisionPackageBytes', 'revisionDispatchBytes', 'revisionCompletionBytes',
    'reviewTransportCalls', 'revisionTransportCalls', 'selectedGodskillBodyReads',
  ], 'fixture recovery');
  for (const name of [
    'revisionDispatchDigest', 'revisionCompletionDigest', 'revisionPackageDigest',
    'revisionResultDigest', 'revisionExecutorEvidenceDigest', 'finalReviewDispatchDigest',
    'finalReviewResultDigest', 'terminalReceiptDigest',
  ]) requireDigest(value.recovery[name], `fixture recovery ${name}`);
  for (const [name, calls] of Object.entries({
    reviewTransportCalls: value.recovery.reviewTransportCalls,
    revisionTransportCalls: value.recovery.revisionTransportCalls,
  })) {
    exactKeys(calls, ['descriptors', 'reconciliations', 'executions'], name);
  }
  if (value.recovery.crashCheckpoint !== 'after-revision-execute'
      || value.recovery.revisionPackageBytes < 1
      || value.recovery.revisionDispatchBytes < value.recovery.revisionPackageBytes
      || value.recovery.revisionCompletionBytes < 1
      || value.recovery.revisionCompletionBytes > 16_384
      || value.recovery.reviewTransportCalls.descriptors !== 2
      || value.recovery.reviewTransportCalls.reconciliations !== 2
      || value.recovery.reviewTransportCalls.executions !== 2
      || value.recovery.revisionTransportCalls.descriptors !== 2
      || value.recovery.revisionTransportCalls.reconciliations !== 2
      || value.recovery.revisionTransportCalls.executions !== 1
      || value.recovery.selectedGodskillBodyReads !== 4) {
    throw new Error('fixture recovery measurements are invalid');
  }
  exactKeys(value.assertions, [
    'processDeathObserved', 'completedAfterReconstruction', 'acceptedRevision',
    'exactTerminalReplay', 'replayExternalCalls', 'exactRevisionDispatchReproduced',
    'revisionRecoveredWithoutRedispatch', 'revisionEvidenceCommitted',
    'finalReviewBoundExactRevision', 'finalReviewAccepted', 'constructionGodskillBodyFree',
    'exactGodskillBodyReads', 'revisionPackageGodskillBodyFree', 'forbiddenRevisionWireKeys',
    'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects',
  ], 'fixture assertions');
  const zeroAssertions = new Set([
    'replayExternalCalls', 'forbiddenRevisionWireKeys', 'filesystemRootsDisclosed',
    'authorityExpansions', 'realmEffects',
  ]);
  for (const [name, result] of Object.entries(value.assertions)) {
    if (result !== (zeroAssertions.has(name) ? 0 : true)) {
      throw new Error(`fixture assertion failed: ${name}`);
    }
  }
  return value;
}

export function verifyMissionRevisionExecutorCertificationReceipt(value) {
  exactKeys(value, [
    'schemaVersion', 'certificationId', 'status', 'protocolId', 'source', 'godskills',
    'reviewExecutor', 'revisionExecutor', 'fixture', 'requirements', 'metrics',
    'proofLimits', 'testRuns', 'review', 'receiptDigest',
  ], 'mission revision executor certification receipt');
  if (value.schemaVersion !== 1 || value.certificationId !== certificationId
      || value.status !== 'certified' || value.protocolId !== protocolId) {
    throw new Error('mission revision executor certification identity mismatch');
  }
  exactKeys(value.source, [
    'commit', 'historicalReceiptDigests', 'implementationManifest', 'testManifest',
    'specification', 'plan', 'sourceBoundary',
  ], 'mission revision executor certification source');
  if (!COMMIT.test(value.source.commit)) throw new Error('mission revision executor source commit is invalid');
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
  exactKeys(value.godskills.capability, ['id', 'entrypointSha256', 'contractSha256'], 'Godskills capability');
  requireDigest(value.godskills.capability.entrypointSha256, 'Godskills capability entrypoint');
  requireDigest(value.godskills.capability.contractSha256, 'Godskills capability contract');
  validateExecutorIdentity(value.reviewExecutor, 'certified review executor');
  validateExecutorIdentity(value.revisionExecutor, 'certified revision executor');

  exactKeys(value.fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions', 'measurements'], 'fixture binding');
  if (value.fixture.path !== fixturePath) throw new Error('fixture path mismatch');
  requireDigest(value.fixture.fileSha256, 'fixture file');
  requireDigest(value.fixture.logicalDigest, 'fixture logical');
  exactKeys(value.fixture.measurements, [
    'revisionPackageBytes', 'revisionDispatchBytes', 'revisionCompletionBytes',
    'reviewTransportCalls', 'revisionTransportCalls', 'selectedGodskillBodyReads',
  ], 'fixture measurements');
  for (const name of ['reviewTransportCalls', 'revisionTransportCalls']) {
    exactKeys(value.fixture.measurements[name], ['descriptors', 'reconciliations', 'executions'], name);
  }
  exactKeys(value.fixture.assertions, [
    'processDeathObserved', 'completedAfterReconstruction', 'acceptedRevision',
    'exactTerminalReplay', 'replayExternalCalls', 'exactRevisionDispatchReproduced',
    'revisionRecoveredWithoutRedispatch', 'revisionEvidenceCommitted',
    'finalReviewBoundExactRevision', 'finalReviewAccepted', 'constructionGodskillBodyFree',
    'exactGodskillBodyReads', 'revisionPackageGodskillBodyFree', 'forbiddenRevisionWireKeys',
    'filesystemRootsDisclosed', 'authorityExpansions', 'realmEffects',
  ], 'fixture assertions');
  const zeroAssertions = new Set([
    'replayExternalCalls', 'forbiddenRevisionWireKeys', 'filesystemRootsDisclosed',
    'authorityExpansions', 'realmEffects',
  ]);
  for (const [name, result] of Object.entries(value.fixture.assertions)) {
    if (result !== (zeroAssertions.has(name) ? 0 : true)) throw new Error(`fixture binding assertion failed: ${name}`);
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
    'reconstructedReviewExecutors', 'reconstructedRevisionExecutors',
    'reviewTransportExecutions', 'revisionTransportReconciliations',
    'revisionTransportExecutions', 'selectedGodskillBodyReads', 'replayExternalCalls',
    'retainedInlineRegressions', 'forbiddenRevisionWireKeys', 'filesystemRootsDisclosed',
    'authorityExpansions', 'realmEffects',
  ], 'certification metrics');
  const expectedMetrics = {
    reconstructedReviewExecutors: 2,
    reconstructedRevisionExecutors: 2,
    reviewTransportExecutions: 2,
    revisionTransportReconciliations: 2,
    revisionTransportExecutions: 1,
    selectedGodskillBodyReads: 4,
    replayExternalCalls: 0,
    retainedInlineRegressions: retainedRegressions.length,
    forbiddenRevisionWireKeys: 0,
    filesystemRootsDisclosed: 0,
    authorityExpansions: 0,
    realmEffects: 0,
  };
  if (canonicalJson(value.metrics) !== canonicalJson(expectedMetrics)) {
    throw new Error('certification metrics are invalid');
  }
  exactKeys(value.review, ['mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions'], 'review');
  if (value.review.mode !== 'inline-adversarial' || value.review.independent !== false
      || value.review.unresolvedCriticalDefects !== 0
      || !sameArray(value.review.retainedRegressions, retainedRegressions)) {
    throw new Error('certification review is invalid');
  }
  const { receiptDigest, ...unsigned } = value;
  requireDigest(receiptDigest, 'mission revision executor receipt');
  if (sha256Value(unsigned) !== receiptDigest) throw new Error('mission revision executor receipt mismatch');
  return value;
}

export async function rebuildMissionRevisionExecutorReceipt({
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
    gitText(repositoryRoot, sourceCommit, 'src/runtime/mission-revision-executor.mjs'),
    gitText(repositoryRoot, sourceCommit, 'src/runtime/mission-revision-materializer.mjs'),
    gitText(repositoryRoot, sourceCommit, 'src/runtime/mission-revision-transport-contracts.mjs'),
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
    reviewExecutor: structuredClone(fixture.reviewExecutor),
    revisionExecutor: structuredClone(fixture.revisionExecutor),
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      assertions: structuredClone(fixture.assertions),
      measurements: {
        revisionPackageBytes: fixture.recovery.revisionPackageBytes,
        revisionDispatchBytes: fixture.recovery.revisionDispatchBytes,
        revisionCompletionBytes: fixture.recovery.revisionCompletionBytes,
        reviewTransportCalls: structuredClone(fixture.recovery.reviewTransportCalls),
        revisionTransportCalls: structuredClone(fixture.recovery.revisionTransportCalls),
        selectedGodskillBodyReads: fixture.recovery.selectedGodskillBodyReads,
      },
    },
    requirements: Object.entries(requirementEvidence).map(([id, evidence]) => ({
      id,
      status: 'pass',
      evidence: [...evidence],
    })),
    metrics: {
      reconstructedReviewExecutors: 2,
      reconstructedRevisionExecutors: 2,
      reviewTransportExecutions: fixture.recovery.reviewTransportCalls.executions,
      revisionTransportReconciliations: fixture.recovery.revisionTransportCalls.reconciliations,
      revisionTransportExecutions: fixture.recovery.revisionTransportCalls.executions,
      selectedGodskillBodyReads: fixture.recovery.selectedGodskillBodyReads,
      replayExternalCalls: fixture.assertions.replayExternalCalls,
      retainedInlineRegressions: retainedRegressions.length,
      forbiddenRevisionWireKeys: fixture.assertions.forbiddenRevisionWireKeys,
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
  return Object.freeze(verifyMissionRevisionExecutorCertificationReceipt({
    ...unsigned,
    receiptDigest: sha256Value(unsigned),
  }));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicMissionRevisionExecutorFixture();
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
  const preliminary = await rebuildMissionRevisionExecutorReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildMissionRevisionExecutorReceipt({
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
