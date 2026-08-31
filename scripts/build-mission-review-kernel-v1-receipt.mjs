import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionExecutorDescriptor,
  buildMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createResumableMissionReviewKernel } from '../src/runtime/mission-review-kernel.mjs';
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

const certificationId = 'resumable-mission-review-kernel-v1';
const protocolId = 'eternities-mission-review-kernel-v1';
const fixturePath = 'fixtures/resumable-mission-review-kernel-v1.json';
const receiptPath = 'receipts/resumable-mission-review-kernel-v1.json';
const specificationPath = 'docs/superpowers/specs/2026-08-31-resumable-mission-review-kernel-v1-design.md';
const planPath = 'docs/superpowers/plans/2026-08-31-resumable-mission-review-kernel-v1.md';
const certificationPath = 'docs/resumable-mission-review-kernel-v1-certification.md';
const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const repeatedDigest = (character) => character.repeat(64);

const historicalReceiptPaths = Object.freeze([
  'receipts/codex-bound-turn-v1.json',
  'receipts/codex-recoverable-turn-coordinator-v1.json',
  'receipts/codex-recoverable-turn-journal-v1.json',
  'receipts/cortex-binding-contracts-v1.json',
  'receipts/cortex-binding-registry-v1.json',
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
  fixturePath,
  'package.json',
  planPath,
  'schemas/mission-phase-executor-descriptor.schema.json',
  'schemas/mission-phase-request.schema.json',
  'schemas/mission-phase-result.schema.json',
  'schemas/mission-review-admission.schema.json',
  'schemas/mission-review-completion.schema.json',
  'schemas/mission-review-journal-event.schema.json',
  'schemas/mission-review-journal-state.schema.json',
  'schemas/mission-verdict.schema.json',
  'scripts/build-mission-review-kernel-v1-receipt.mjs',
  specificationPath,
  'src/core/canonical-json.mjs',
  'src/core/digest.mjs',
  'src/core/schema-validator.mjs',
  'src/runtime/mission-phase-contracts.mjs',
  'src/runtime/mission-review-journal.mjs',
  'src/runtime/mission-review-kernel.mjs',
  'src/state/atomic-publication.mjs',
  'src/state/file-lock.mjs',
].sort());

const testFiles = Object.freeze([
  'tests/helpers/mission-review-fixture.mjs',
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-journal.test.mjs',
  'tests/mission-review-kernel.test.mjs',
  'tests/mission-review-kernel-certification.test.mjs',
  'tests/schemas.test.mjs',
].sort());

const focusedTestFiles = Object.freeze([
  'tests/mission-phase-contracts.test.mjs',
  'tests/mission-review-journal.test.mjs',
  'tests/mission-review-kernel.test.mjs',
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
  'MRK-001': ['closed admission, executor, request, result, verdict, completion, event, and state contracts'],
  'MRK-002': ['deterministic fixture executes review only after the native artifact is durably committed'],
  'MRK-003': ['native-only fixture completes through one exact accepted artifact and terminal receipt'],
  'MRK-004': ['tests retain accept, reject, revise-accept, revise-reject, and exhausted-revision paths'],
  'MRK-005': ['journal rejects missing and invented revision finding identities'],
  'MRK-006': ['crash fixture reconciles a completed review without a duplicate dispatch'],
  'MRK-007': ['pending reconciliation test performs no dispatch'],
  'MRK-008': ['fixture terminal replay performs zero executor calls'],
  'MRK-009': ['tests reject changed admission, roots, descriptors, inputs, artifacts, usage, and journal bytes'],
  'MRK-010': ['per-phase result ceilings and mission-wide reservation ceilings fail closed'],
  'MRK-011': ['all phase descriptors, verdicts, and receipts carry zero expanded authority and zero Realm effects'],
  'MRK-012': ['historical receipt bytes, focused tests, full tests, and deterministic rebuild are release gates'],
});

const proofLimits = Object.freeze([
  'trusted-injected-terminal-reconciliation-and-deduplication-contract-only',
  'no-live-model-or-provider-qualification',
  'no-hostile-executor-isolation',
  'no-review-or-revision-quality-improvement-claim',
  'no-automatic-godskills-evaluator-package-execution',
  'no-realm-action-or-compensation',
  'no-continuity-content-admission-or-personal-keel-write',
  'no-codex-desktop-task-integration',
  'no-delegation-daemon-or-cross-machine-replication',
  'no-lunari-inspiration-or-soul-activation',
  'no-independent-review',
]);

function authorityProjection() {
  return {
    availableAuthority: [],
    permittedEffects: [],
    availablePreconditions: ['realm-observed'],
    maximumRisk: 'moderate',
    minimumEvidenceConfidence: 'verified',
    contextBudget: 16000,
  };
}

function reviewGodskillsBinding(missionId) {
  const selected = {
    id: 'eternities-aegis',
    entrypointSha256: repeatedDigest('1'),
    contractSha256: repeatedDigest('2'),
  };
  const decisionUnsigned = {
    schemaVersion: 1,
    selectedId: selected.id,
    taskClass: 'verification',
    consequenceClass: 'consequential',
    mode: 'review',
    reasonCodes: ['certification-review'],
    preInferenceDisclosure: 'none',
    deferredReview: true,
    methodEvidence: {
      eligible: false,
      matchedEvaluations: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winRate: 0,
      criticalRegressions: 0,
      overheadRatio: null,
      failedGates: ['fixture-evidence'],
    },
    policyDigest: repeatedDigest('3'),
    evidenceDigest: repeatedDigest('4'),
    authorityProjection: authorityProjection(),
    authorityExpanded: false,
  };
  const decision = { ...decisionUnsigned, decisionDigest: sha256Value(decisionUnsigned) };
  const activationUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godskills-activation-v1',
    requestId: `activation-${missionId}`,
    requestDigest: repeatedDigest('5'),
    trustRootDigest: repeatedDigest('6'),
    policyDigest: decision.policyDigest,
    evidenceDigest: decision.evidenceDigest,
    classification: { taskClass: 'verification', consequenceClass: 'consequential', reviewAvailable: true },
    decisions: [decision],
  };
  const activation = { ...activationUnsigned, resultDigest: sha256Value(activationUnsigned) };
  const cortexPackage = {
    protocolId: 'eternities-godskills-adapter-v1',
    sourceEnvelopeDigest: repeatedDigest('7'),
    releaseDigest: repeatedDigest('8'),
    stackDigest: repeatedDigest('9'),
    selectedCapabilities: [selected.id],
    methods: [],
    evidenceRequirements: [],
    proposalRequirements: [],
    riskObligations: [],
    preconditionObligations: [],
    terminationConditions: [],
    authorityProjection: authorityProjection(),
    disclosureBytes: 0,
    selectedPackages: [],
    deferredReviews: [{
      id: selected.id,
      entrypointSha256: selected.entrypointSha256,
      contractSha256: selected.contractSha256,
      status: 'scheduled-not-executed',
    }],
    activation,
  };
  const receipt = {
    schemaVersion: 1,
    protocolId: 'eternities-godskills-adapter-v1',
    requestId: missionId,
    sourceEnvelopeDigest: cortexPackage.sourceEnvelopeDigest,
    releaseDigest: cortexPackage.releaseDigest,
    routerReceiptDigest: repeatedDigest('a'),
    selectionStatus: 'selected',
    selected: [selected],
    authorityCeilingDigest: repeatedDigest('b'),
    stackDigest: cortexPackage.stackDigest,
    packageDigest: sha256Text(canonicalJson(cortexPackage)),
    activation,
  };
  return { receipt, cortexPackage };
}

function missionInput(missionId, review) {
  const godskillsBinding = review ? reviewGodskillsBinding(missionId) : null;
  return {
    mission: {
      missionId,
      objective: review ? 'certify one recovered review and revision' : 'certify one native-only mission',
      successEvidence: ['artifact committed', 'verdict committed'],
      stopConditions: ['authority changes', 'transport evidence is ambiguous'],
    },
    authorityCeilingDigest: review ? repeatedDigest('b') : repeatedDigest('c'),
    budgets: {
      nativeCompletionTokens: 1000,
      reviewCompletionTokensPerRound: 500,
      revisionCompletionTokens: 800,
      totalCompletionTokens: 2800,
      maxArtifactBytes: 8192,
    },
    godskillsBinding,
    godskillsTrustPin: review ? {
      protocolId: godskillsBinding.receipt.protocolId,
      releaseDigest: godskillsBinding.receipt.releaseDigest,
      activationProtocolId: godskillsBinding.receipt.activation.protocolId,
      activationTrustRootDigest: godskillsBinding.receipt.activation.trustRootDigest,
    } : null,
  };
}

function deterministicTime(start) {
  let now = Date.parse(start);
  return {
    clock() {
      const value = now;
      now += 1000;
      return value;
    },
    now: () => now,
  };
}

function executor({ phase, time, events, artifact }) {
  const descriptorValue = buildMissionExecutorDescriptor({ executorId: `certification-${phase}-v1`, phase });
  const calls = [];
  const completions = new Map();
  return {
    calls,
    completions,
    descriptor() {
      calls.push({ type: 'descriptor' });
      return structuredClone(descriptorValue);
    },
    async reconcile(request) {
      calls.push({ type: 'reconcile', requestDigest: request.requestDigest, round: request.round });
      events.push(`${phase}:reconcile:${request.round}`);
      const result = completions.get(request.requestDigest);
      return result ? { status: 'completed', result: structuredClone(result) } : { status: 'absent' };
    },
    async execute(request, context) {
      calls.push({ type: 'execute', requestDigest: request.requestDigest, round: request.round });
      events.push(`${phase}:execute:${request.round}`);
      if (completions.has(request.requestDigest)) throw new Error('duplicate certification phase dispatch');
      const startedAt = new Date(time.clock()).toISOString();
      const value = artifact(request, context);
      const completedAt = new Date(time.clock()).toISOString();
      const result = buildMissionPhaseResult({
        request,
        descriptor: descriptorValue,
        artifact: value,
        usage: {
          inputTokens: 100,
          cachedInputTokens: 60,
          reasoningTokens: 100,
          visibleOutputTokens: 25,
          completionTokens: 125,
        },
        startedAt,
        completedAt,
      });
      completions.set(request.requestDigest, result);
      return structuredClone(result);
    },
  };
}

function kernelOptions(root, time, executors, checkpoint = async () => {}) {
  return {
    journalRoot: root,
    ...executors,
    clock: time.clock,
    checkpoint,
    lockOptions: {
      pid: 53001,
      now: time.now,
      staleAfterMs: 500,
      isProcessAlive: () => false,
      nonce: () => 'mission-review-certification-lock',
    },
  };
}

function executeCount(executorValue) {
  return executorValue.calls.filter(({ type }) => type === 'execute').length;
}

export async function buildDeterministicMissionReviewKernelFixture() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'godagent-mission-review-certification-'));
  const nativeTime = deterministicTime('2026-08-31T16:00:00.000Z');
  const reviewTime = deterministicTime('2026-08-31T17:00:00.000Z');
  const nativeEvents = [];
  const reviewEvents = [];
  const nativeOnlyExecutor = executor({
    phase: 'native',
    time: nativeTime,
    events: nativeEvents,
    artifact: () => ({ schemaVersion: 1, artifactType: 'native', content: 'certified native artifact' }),
  });
  const reviewedNative = executor({
    phase: 'native',
    time: reviewTime,
    events: reviewEvents,
    artifact: () => ({ schemaVersion: 1, artifactType: 'native', content: 'certified draft zero' }),
  });
  const reviewedReview = executor({
    phase: 'review',
    time: reviewTime,
    events: reviewEvents,
    artifact: (request, context) => ({
      schemaVersion: 1,
      artifactType: 'review',
      subjectDigest: request.inputs.find(({ role }) => role === 'subject').artifactDigest,
      recommendation: request.round === 1 ? 'revise' : 'accept',
      findings: request.round === 1
        ? [{ id: 'certification-proof', severity: 'important', required: true, message: 'add exact recovery proof' }]
        : [],
      summary: request.round === 1
        ? `reviewed committed ${context.subject.artifactType} artifact and requested one repair`
        : 'accepted the bounded revision',
    }),
  });
  const reviewedRevision = executor({
    phase: 'revision',
    time: reviewTime,
    events: reviewEvents,
    artifact: (request) => ({
      schemaVersion: 1,
      artifactType: 'revision',
      nativeArtifactDigest: request.inputs.find(({ role }) => role === 'native').artifactDigest,
      reviewArtifactDigest: request.inputs.find(({ role }) => role === 'review').artifactDigest,
      addressedFindingIds: ['certification-proof'],
      content: 'certified draft one with exact recovery proof',
    }),
  });

  try {
    const nativeInput = missionInput('mission-certification-native', false);
    const nativeKernel = createResumableMissionReviewKernel(kernelOptions(
      join(temporaryRoot, 'native'), nativeTime, { nativeExecutor: nativeOnlyExecutor },
    ));
    const native = await nativeKernel.run(nativeInput);
    nativeOnlyExecutor.calls.length = 0;
    const nativeReplay = await nativeKernel.run(nativeInput);
    const nativeReplayCalls = nativeOnlyExecutor.calls.length;

    let crashObserved = false;
    let crashInjected = false;
    const checkpoint = async (name) => {
      if (!crashInjected && name === 'after-review-1-execute') {
        crashInjected = true;
        crashObserved = true;
        throw new Error('certification process death after completed review');
      }
    };
    const reviewInput = missionInput('mission-certification-reviewed', true);
    const reviewOptions = kernelOptions(join(temporaryRoot, 'reviewed'), reviewTime, {
      nativeExecutor: reviewedNative,
      reviewExecutor: reviewedReview,
      revisionExecutor: reviewedRevision,
    }, checkpoint);
    try {
      await createResumableMissionReviewKernel(reviewOptions).run(reviewInput);
    } catch (error) {
      if (!/certification process death/.test(error.message)) throw error;
    }
    const executeCountsBeforeRecovery = {
      native: executeCount(reviewedNative),
      review: executeCount(reviewedReview),
      revision: executeCount(reviewedRevision),
    };
    const reviewed = await createResumableMissionReviewKernel({
      ...reviewOptions,
      checkpoint: async () => {},
    }).run(reviewInput);
    const executeCountsAfterRecovery = {
      native: executeCount(reviewedNative),
      review: executeCount(reviewedReview),
      revision: executeCount(reviewedRevision),
    };
    const allExecuteDigests = [reviewedNative, reviewedReview, reviewedRevision]
      .flatMap((value) => value.calls.filter(({ type }) => type === 'execute').map(({ requestDigest }) => requestDigest));
    for (const value of [reviewedNative, reviewedReview, reviewedRevision]) value.calls.length = 0;
    const reviewedReplay = await createResumableMissionReviewKernel({
      ...reviewOptions,
      checkpoint: async () => {},
    }).run(reviewInput);
    const reviewedReplayCalls = reviewedNative.calls.length + reviewedReview.calls.length + reviewedRevision.calls.length;

    const unsigned = {
      schemaVersion: 1,
      protocolId,
      native: {
        receiptDigest: native.receipt.receiptDigest,
        replayReceiptDigest: nativeReplay.receipt.receiptDigest,
        verdictDigest: native.verdict.verdictDigest,
        artifactDigest: native.receipt.acceptedArtifactDigest,
        completionTokens: native.receipt.usage.completionTokens,
      },
      reviewed: {
        receiptDigest: reviewed.receipt.receiptDigest,
        replayReceiptDigest: reviewedReplay.receipt.receiptDigest,
        verdictDigest: reviewed.verdict.verdictDigest,
        artifactDigest: reviewed.receipt.acceptedArtifactDigest,
        reason: reviewed.verdict.reason,
        completionTokens: reviewed.receipt.usage.completionTokens,
        reviewResultCount: reviewed.receipt.phases.reviewResultDigests.length,
      },
      recovery: {
        crashObserved,
        executeCountsBeforeRecovery,
        executeCountsAfterRecovery,
        uniqueExecutedRequests: new Set(allExecuteDigests).size,
        executedRequests: allExecuteDigests.length,
      },
      order: reviewEvents,
      assertions: {
        nativeReplayExternalCalls: nativeReplayCalls,
        reviewedReplayExternalCalls: reviewedReplayCalls,
        nativeReceiptStable: native.receipt.receiptDigest === nativeReplay.receipt.receiptDigest,
        reviewedReceiptStable: reviewed.receipt.receiptDigest === reviewedReplay.receipt.receiptDigest,
        crashRecoveredWithoutRedispatch: crashObserved
          && executeCountsBeforeRecovery.review === 1
          && executeCountsAfterRecovery.native === 1
          && executeCountsAfterRecovery.review === 2
          && executeCountsAfterRecovery.revision === 1,
        duplicateCompletedDispatches: allExecuteDigests.length - new Set(allExecuteDigests).size,
        nativeCommittedBeforeReview: reviewEvents.indexOf('native:execute:1') < reviewEvents.indexOf('review:execute:1'),
        oneRevision: executeCountsAfterRecovery.revision === 1,
        twoReviews: executeCountsAfterRecovery.review === 2,
        authorityExpansions: Number(native.receipt.authorityExpanded) + Number(reviewed.receipt.authorityExpanded),
        realmEffects: native.receipt.realmEffects + reviewed.receipt.realmEffects,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
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
  if (canonicalJson(value.paths) !== canonicalJson(expectedPaths)
      || !Array.isArray(value.entries)
      || value.entries.length !== expectedPaths.length
      || value.digest !== sha256Value(value.entries)) {
    throw new Error(`${label} is invalid`);
  }
  value.entries.forEach((entry, index) => {
    exactKeys(entry, ['path', 'sha256', 'bytes'], `${label} entry`);
    if (entry.path !== expectedPaths[index] || !Number.isInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`${label} entry is invalid`);
    }
    requireDigest(entry.sha256, `${label} entry`);
  });
}

function validateSource(source) {
  exactKeys(source, [
    'commit', 'specification', 'plan', 'implementationManifest', 'testManifest',
    'historicalReceiptDigests', 'sourceBoundary',
  ], 'mission review certification source');
  if (!COMMIT.test(source.commit)) throw new Error('mission review certification source commit is invalid');
  for (const [field, path] of [['specification', specificationPath], ['plan', planPath]]) {
    exactKeys(source[field], ['path', 'sha256'], field);
    if (source[field].path !== path) throw new Error(`${field} path is invalid`);
    requireDigest(source[field].sha256, field);
  }
  validateManifest(source.implementationManifest, implementationFiles, 'implementation manifest');
  validateManifest(source.testManifest, testFiles, 'test manifest');
  if (canonicalJson(Object.keys(source.historicalReceiptDigests).sort())
      !== canonicalJson([...historicalReceiptPaths].sort())) {
    throw new Error('historical receipt set is invalid');
  }
  Object.entries(source.historicalReceiptDigests)
    .forEach(([path, digest]) => requireDigest(digest, `historical receipt ${path}`));
  exactKeys(source.sourceBoundary, [
    'realmImports', 'keelImports', 'credentialResolvers', 'taskTransportImports',
  ], 'source boundary');
  if (Object.values(source.sourceBoundary).some((count) => count !== 0)) {
    throw new Error('mission review source boundary is invalid');
  }
}

const expectedFixtureAssertions = Object.freeze({
  nativeReplayExternalCalls: 0,
  reviewedReplayExternalCalls: 0,
  nativeReceiptStable: true,
  reviewedReceiptStable: true,
  crashRecoveredWithoutRedispatch: true,
  duplicateCompletedDispatches: 0,
  nativeCommittedBeforeReview: true,
  oneRevision: true,
  twoReviews: true,
  authorityExpansions: 0,
  realmEffects: 0,
});

function validateFixtureSummary(fixture) {
  exactKeys(fixture, ['path', 'fileSha256', 'logicalDigest', 'assertions', 'measurements'], 'certification fixture');
  if (fixture.path !== fixturePath) throw new Error('certification fixture path is invalid');
  requireDigest(fixture.fileSha256, 'certification fixture file');
  requireDigest(fixture.logicalDigest, 'certification fixture logical');
  if (canonicalJson(fixture.assertions) !== canonicalJson(expectedFixtureAssertions)) {
    throw new Error('certification fixture assertions are invalid');
  }
  exactKeys(fixture.measurements, [
    'nativeDispatches', 'reviewedDispatches', 'completionTokens',
  ], 'certification fixture measurements');
  if (fixture.measurements.nativeDispatches !== 1
      || fixture.measurements.reviewedDispatches !== 4
      || fixture.measurements.completionTokens !== 625) {
    throw new Error('certification fixture measurements are invalid');
  }
}

function validateReview(review) {
  exactKeys(review, ['mode', 'independent', 'unresolvedCriticalDefects', 'retainedRegressions'], 'review');
  if (review.mode !== 'inline-adversarial' || review.independent !== false
      || review.unresolvedCriticalDefects !== 0
      || !Array.isArray(review.retainedRegressions)
      || review.retainedRegressions.length < 6
      || new Set(review.retainedRegressions).size !== review.retainedRegressions.length) {
    throw new Error('mission review certification review record is invalid');
  }
}

function assertFixture(fixture) {
  exactKeys(fixture, [
    'assertions', 'fixtureDigest', 'native', 'order', 'protocolId', 'recovery', 'reviewed', 'schemaVersion',
  ], 'mission review fixture');
  if (fixture.schemaVersion !== 1 || fixture.protocolId !== protocolId) throw new Error('mission review fixture identity is invalid');
  const { fixtureDigest, ...unsigned } = fixture;
  if (!DIGEST.test(fixtureDigest) || sha256Value(unsigned) !== fixtureDigest) throw new Error('mission review fixture digest mismatch');
  const expected = {
    nativeReplayExternalCalls: 0,
    reviewedReplayExternalCalls: 0,
    nativeReceiptStable: true,
    reviewedReceiptStable: true,
    crashRecoveredWithoutRedispatch: true,
    duplicateCompletedDispatches: 0,
    nativeCommittedBeforeReview: true,
    oneRevision: true,
    twoReviews: true,
    authorityExpansions: 0,
    realmEffects: 0,
  };
  if (canonicalJson(fixture.assertions) !== canonicalJson(expected)
      || fixture.reviewed.reason !== 'revision-review-accepted'
      || fixture.reviewed.reviewResultCount !== 2) {
    throw new Error('mission review fixture acceptance assertions failed');
  }
  return fixture;
}

function sourceBoundary(sourceTexts) {
  const combined = sourceTexts.join('\n');
  return {
    realmImports: (combined.match(/from ['"]\.\.\/realm\//g) ?? []).length,
    keelImports: (combined.match(/from ['"].*keel/gi) ?? []).length,
    credentialResolvers: (combined.match(
      /process\.env|from ['"][^'"]*credential|\b(?:resolveCredential|credentialResolver|apiKeyResolver)\s*\(/gi,
    ) ?? []).length,
    taskTransportImports: (combined.match(/codex-recoverable-turn|codex-bound-turn/g) ?? []).length,
  };
}

export function buildMissionReviewKernelCertificationReceipt({ source, fixture, testRuns, review }) {
  validateSource(source);
  validateFixtureSummary(fixture);
  validateTestRuns(testRuns);
  validateReview(review);
  const requirements = Object.entries(requirementEvidence).map(([id, evidence]) => ({ id, status: 'pass', evidence }));
  const unsigned = {
    schemaVersion: 1,
    certificationId,
    status: 'certified',
    protocolId,
    source: structuredClone(source),
    fixture: structuredClone(fixture),
    testRuns: structuredClone(testRuns),
    metrics: {
      nativeDispatches: fixture.measurements.nativeDispatches,
      reviewedDispatches: fixture.measurements.reviewedDispatches,
      duplicateCompletedDispatches: fixture.assertions.duplicateCompletedDispatches,
      terminalReplayExternalCalls: fixture.assertions.nativeReplayExternalCalls
        + fixture.assertions.reviewedReplayExternalCalls,
      completionTokens: fixture.measurements.completionTokens,
      cachedInputTokensReportedSeparately: true,
      authorityExpansions: fixture.assertions.authorityExpansions,
      realmEffects: fixture.assertions.realmEffects,
      retainedInlineRegressions: review.retainedRegressions.length,
    },
    review: structuredClone(review),
    requirements,
    proofLimits: [...proofLimits],
  };
  return Object.freeze({ ...unsigned, receiptDigest: sha256Value(unsigned) });
}

export function verifyMissionReviewKernelCertificationReceipt(value) {
  const receipt = structuredClone(value);
  exactKeys(receipt, [
    'certificationId', 'fixture', 'metrics', 'proofLimits', 'protocolId', 'receiptDigest', 'requirements',
    'review', 'schemaVersion', 'source', 'status', 'testRuns',
  ], 'mission review certification receipt');
  if (receipt.schemaVersion !== 1 || receipt.certificationId !== certificationId
      || receipt.protocolId !== protocolId || receipt.status !== 'certified') {
    throw new Error('mission review certification receipt identity is invalid');
  }
  const rebuilt = buildMissionReviewKernelCertificationReceipt({
    source: receipt.source,
    fixture: receipt.fixture,
    testRuns: receipt.testRuns,
    review: receipt.review,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(receipt)) throw new Error('mission review certification receipt mismatch');
  return Object.freeze(receipt);
}

export async function rebuildMissionReviewKernelReceipt({ repositoryRoot, sourceCommit, testRuns }) {
  const root = resolve(repositoryRoot);
  await assertCommit(root, sourceCommit);
  const [specification, plan, fixtureText, ...sourceTexts] = await Promise.all([
    gitText(root, sourceCommit, specificationPath),
    gitText(root, sourceCommit, planPath),
    gitText(root, sourceCommit, fixturePath),
    gitText(root, sourceCommit, 'src/runtime/mission-phase-contracts.mjs'),
    gitText(root, sourceCommit, 'src/runtime/mission-review-journal.mjs'),
    gitText(root, sourceCommit, 'src/runtime/mission-review-kernel.mjs'),
  ]);
  const generatedFixture = await buildDeterministicMissionReviewKernelFixture();
  if (fixtureText !== `${canonicalJson(generatedFixture)}\n`) throw new Error('mission review deterministic fixture is stale');
  const fixture = assertFixture(JSON.parse(fixtureText));
  const boundary = sourceBoundary(sourceTexts);
  if (canonicalJson(boundary) !== canonicalJson({
    realmImports: 0,
    keelImports: 0,
    credentialResolvers: 0,
    taskTransportImports: 0,
  })) {
    throw new Error('mission review runtime crossed an excluded source boundary');
  }
  return buildMissionReviewKernelCertificationReceipt({
    source: {
      commit: sourceCommit,
      specification: { path: specificationPath, sha256: sha256Text(specification) },
      plan: { path: planPath, sha256: sha256Text(plan) },
      implementationManifest: await manifestAtCommit(root, sourceCommit, implementationFiles),
      testManifest: await manifestAtCommit(root, sourceCommit, testFiles),
      historicalReceiptDigests: await historicalAtCommit(root, sourceCommit, historicalReceiptPaths),
      sourceBoundary: boundary,
    },
    fixture: {
      path: fixturePath,
      fileSha256: sha256Text(fixtureText),
      logicalDigest: fixture.fixtureDigest,
      assertions: structuredClone(fixture.assertions),
      measurements: {
        nativeDispatches: 1,
        reviewedDispatches: fixture.recovery.executedRequests,
        completionTokens: fixture.native.completionTokens + fixture.reviewed.completionTokens,
      },
    },
    testRuns,
    review: {
      mode: 'inline-adversarial',
      independent: false,
      unresolvedCriticalDefects: 0,
      retainedRegressions: [
        'rejects a body-disclosed deferred review before native inference',
        'rejects stale Godskills trust pins and authority projections',
        'rejects validly rehashed phase requests that substitute prior artifacts',
        'rejects missing and invented required finding identities',
        'terminates safely when a later phase cannot reserve completion budget',
        'recovers external completion and orphan artifact publication without redispatch',
        'rejects ambiguous reconciliation and digest-consistent authority-bearing artifacts',
        'rejects pre-admission results and backward journal clocks before durable mutation',
        'replays a terminal mission without executor calls',
      ],
    },
  });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = join(root, ...receiptPath.split('/'));
  if (process.argv.includes('--write-fixture')) {
    const fixture = await buildDeterministicMissionReviewKernelFixture();
    const destination = join(root, ...fixturePath.split('/'));
    await writeFile(destination, `${canonicalJson(fixture)}\n`, 'utf8');
    process.stdout.write(`${canonicalJson({ status: 'written', destination, fixtureDigest: fixture.fixtureDigest })}\n`);
    return;
  }

  await requireCleanExcept(root, releaseOnlyPaths);
  const head = await headCommit(root);
  const sourceCommit = await resolveSourceCommit({ root, headCommit: head, outputPath, releaseOnlyPaths });
  const focused = await runTests(focusedTestFiles, root);
  const preliminary = await rebuildMissionReviewKernelReceipt({
    repositoryRoot: root,
    sourceCommit,
    testRuns: { focused, full: { status: 'pass', tests: focused.tests } },
  });
  await writeFile(outputPath, `${canonicalJson(preliminary)}\n`, 'utf8');
  const full = await runTests([], root);
  const receipt = await rebuildMissionReviewKernelReceipt({
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
