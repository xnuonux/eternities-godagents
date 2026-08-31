import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionAdmission,
  buildMissionExecutorDescriptor,
  buildMissionCompletionReceipt,
  buildMissionPhaseRequest,
  buildMissionPhaseResult,
  buildMissionVerdict,
  verifyMissionAdmission,
  verifyMissionCompletionReceipt,
  verifyMissionExecutorDescriptor,
  verifyMissionPhaseRequest,
  verifyMissionPhaseResult,
  verifyMissionVerdict,
} from '../src/runtime/mission-phase-contracts.mjs';

const digest = (character) => character.repeat(64);

function mission() {
  return {
    missionId: 'mission-review-kernel-contracts',
    objective: 'produce one reviewed portable artifact',
    successEvidence: ['artifact committed', 'verdict committed'],
    stopConditions: ['authority changes', 'review evidence is ambiguous'],
  };
}

function budgets() {
  return {
    nativeCompletionTokens: 1200,
    reviewCompletionTokensPerRound: 600,
    revisionCompletionTokens: 900,
    totalCompletionTokens: 3300,
    maxArtifactBytes: 8192,
  };
}

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

function godskillsBinding() {
  const selected = {
    id: 'eternities-aegis',
    entrypointSha256: digest('1'),
    contractSha256: digest('2'),
  };
  const decisionUnsigned = {
    schemaVersion: 1,
    selectedId: selected.id,
    taskClass: 'verification',
    consequenceClass: 'consequential',
    mode: 'review',
    reasonCodes: ['fixture-review'],
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
      failedGates: ['review-only'],
    },
    policyDigest: digest('3'),
    evidenceDigest: digest('4'),
    authorityProjection: authorityProjection(),
    authorityExpanded: false,
  };
  const decision = { ...decisionUnsigned, decisionDigest: sha256Value(decisionUnsigned) };
  const activationUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godskills-activation-v1',
    requestId: 'activation-mission-review-kernel-contracts',
    requestDigest: digest('5'),
    trustRootDigest: digest('6'),
    policyDigest: decision.policyDigest,
    evidenceDigest: decision.evidenceDigest,
    classification: {
      taskClass: 'verification',
      consequenceClass: 'consequential',
      reviewAvailable: true,
    },
    decisions: [decision],
  };
  const activation = { ...activationUnsigned, resultDigest: sha256Value(activationUnsigned) };
  const cortexPackage = {
    protocolId: 'eternities-godskills-adapter-v1',
    sourceEnvelopeDigest: digest('7'),
    releaseDigest: digest('8'),
    stackDigest: digest('9'),
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
    requestId: mission().missionId,
    sourceEnvelopeDigest: cortexPackage.sourceEnvelopeDigest,
    releaseDigest: cortexPackage.releaseDigest,
    routerReceiptDigest: digest('a'),
    selectionStatus: 'selected',
    selected: [selected],
    authorityCeilingDigest: digest('b'),
    stackDigest: cortexPackage.stackDigest,
    packageDigest: sha256Text(canonicalJson(cortexPackage)),
    activation,
  };
  return { receipt, cortexPackage };
}

function godskillsTrustPin(binding = godskillsBinding()) {
  return {
    protocolId: binding.receipt.protocolId,
    releaseDigest: binding.receipt.releaseDigest,
    activationProtocolId: binding.receipt.activation.protocolId,
    activationTrustRootDigest: binding.receipt.activation.trustRootDigest,
  };
}

function admission(overrides = {}) {
  const binding = Object.hasOwn(overrides, 'godskillsBinding') ? overrides.godskillsBinding : godskillsBinding();
  return buildMissionAdmission({
    mission: mission(),
    authorityCeilingDigest: digest('b'),
    budgets: budgets(),
    godskillsBinding: binding,
    godskillsTrustPin: binding === null ? null : godskillsTrustPin(binding),
    admittedAt: '2026-08-31T12:00:00.000Z',
    ...overrides,
    godskillsTrustPin: Object.hasOwn(overrides, 'godskillsTrustPin')
      ? overrides.godskillsTrustPin
      : binding === null ? null : godskillsTrustPin(binding),
  });
}

test('executor descriptors are deterministic, phase-scoped, and authority-empty', () => {
  const descriptor = buildMissionExecutorDescriptor({ executorId: 'fixture-native-v1', phase: 'native' });
  assert.deepEqual(verifyMissionExecutorDescriptor(descriptor, 'native'), descriptor);
  assert.equal(descriptor.authority.realmEffects, false);
  assert.equal(descriptor.authority.continuityAdmission, false);
  assert.match(descriptor.descriptorDigest, /^[a-f0-9]{64}$/);

  const expanded = structuredClone(descriptor);
  expanded.authority.realmEffects = true;
  assert.throws(() => verifyMissionExecutorDescriptor(expanded, 'native'), /authority|digest/i);

  const wrongPhase = structuredClone(descriptor);
  wrongPhase.phase = 'review';
  assert.throws(() => verifyMissionExecutorDescriptor(wrongPhase, 'native'), /phase|digest/i);

  assert.throws(
    () => verifyMissionExecutorDescriptor({ ...descriptor, endpoint: 'https://credential.invalid' }, 'native'),
    /fields|descriptor/i,
  );
});

test('admission binds the exact body-free deferred Godskills review set', () => {
  const built = admission();
  assert.deepEqual(verifyMissionAdmission(built), built);
  assert.equal(built.godskills.deferredReviews.length, 1);
  assert.equal(built.godskills.deferredReviews[0].status, 'scheduled-not-executed');
  assert.match(built.godskills.bindingDigest, /^[a-f0-9]{64}$/);

  const changedPackage = structuredClone(built);
  changedPackage.godskills.cortexPackage.deferredReviews[0].contractSha256 = digest('d');
  assert.throws(() => verifyMissionAdmission(changedPackage), /Godskills|deferred|digest/i);

  const disclosedReview = structuredClone(built);
  disclosedReview.godskills.cortexPackage.selectedPackages.push({
    id: 'eternities-aegis',
    activationMode: 'method',
    entrypoint: 'must not be disclosed before native inference',
  });
  assert.throws(() => verifyMissionAdmission(disclosedReview), /review|disclos|package|digest/i);

  assert.throws(
    () => buildMissionAdmission({
      mission: mission(),
      authorityCeilingDigest: digest('b'),
      budgets: budgets(),
      godskillsBinding: godskillsBinding(),
      godskillsTrustPin: { ...godskillsTrustPin(), releaseDigest: digest('f') },
      admittedAt: '2026-08-31T12:00:00.000Z',
    }),
    /trust|release|Godskills/i,
  );
});

test('native-only admission is explicit and carries no phantom review', () => {
  const built = admission({ godskillsBinding: null });
  assert.equal(built.godskills, null);
  assert.deepEqual(verifyMissionAdmission(built), built);
  assert.throws(
    () => buildMissionAdmission({
      mission: mission(),
      authorityCeilingDigest: digest('c'),
      budgets: { ...budgets(), totalCompletionTokens: 100 },
      godskillsBinding: null,
      admittedAt: '2026-08-31T12:00:00.000Z',
    }),
    /budget/i,
  );
});

test('phase requests bind ordered inputs, descriptor identity, and the reserved token ceiling', () => {
  const descriptor = buildMissionExecutorDescriptor({ executorId: 'fixture-native-v1', phase: 'native' });
  const request = buildMissionPhaseRequest({
    admission: admission(),
    phase: 'native',
    round: 1,
    descriptor,
    inputs: [{ role: 'godskills-package', artifactDigest: godskillsBinding().receipt.packageDigest }],
    maxCompletionTokens: 1200,
  });
  assert.deepEqual(verifyMissionPhaseRequest(request, { admission: admission(), descriptor }), request);
  assert.match(request.requestDigest, /^[a-f0-9]{64}$/);

  const reordered = structuredClone(request);
  reordered.inputs = [
    { role: 'z-last', artifactDigest: digest('e') },
    { role: 'a-first', artifactDigest: digest('f') },
  ];
  assert.throws(() => verifyMissionPhaseRequest(reordered, { admission: admission(), descriptor }), /input|digest|sorted/i);
});

test('completed phase results bind canonical artifact bytes and exact token arithmetic', () => {
  const descriptor = buildMissionExecutorDescriptor({ executorId: 'fixture-native-v1', phase: 'native' });
  const request = buildMissionPhaseRequest({
    admission: admission({ godskillsBinding: null }),
    phase: 'native',
    round: 1,
    descriptor,
    inputs: [],
    maxCompletionTokens: 1200,
  });
  const artifact = { schemaVersion: 1, artifactType: 'native', content: 'one native artifact' };
  const result = buildMissionPhaseResult({
    request,
    descriptor,
    artifact,
    usage: {
      inputTokens: 300,
      cachedInputTokens: 200,
      reasoningTokens: 500,
      visibleOutputTokens: 100,
      completionTokens: 600,
    },
    startedAt: '2026-08-31T12:00:01.000Z',
    completedAt: '2026-08-31T12:00:02.000Z',
  });
  assert.deepEqual(verifyMissionPhaseResult(result, { request, descriptor }), result);
  assert.equal(result.receipt.artifactBytes, Buffer.byteLength(canonicalJson(artifact), 'utf8'));

  const badUsage = structuredClone(result);
  badUsage.receipt.usage.completionTokens = 599;
  assert.throws(() => verifyMissionPhaseResult(badUsage, { request, descriptor }), /token|digest/i);

  const changedArtifact = structuredClone(result);
  changedArtifact.artifact.content = 'substituted';
  assert.throws(() => verifyMissionPhaseResult(changedArtifact, { request, descriptor }), /artifact|digest/i);
});

test('portable artifacts reject authority-bearing or phase-incoherent structures', () => {
  const descriptor = buildMissionExecutorDescriptor({ executorId: 'fixture-review-v1', phase: 'review' });
  const request = buildMissionPhaseRequest({
    admission: admission(),
    phase: 'review',
    round: 1,
    descriptor,
    inputs: [{ role: 'subject', artifactDigest: digest('d') }],
    maxCompletionTokens: 600,
  });
  const base = {
    schemaVersion: 1,
    artifactType: 'review',
    subjectDigest: digest('d'),
    recommendation: 'accept',
    findings: [],
    summary: 'accepted by the fixture reviewer',
  };
  const options = {
    request,
    descriptor,
    usage: {
      inputTokens: 200,
      cachedInputTokens: 0,
      reasoningTokens: 100,
      visibleOutputTokens: 40,
      completionTokens: 140,
    },
    startedAt: '2026-08-31T12:00:03.000Z',
    completedAt: '2026-08-31T12:00:04.000Z',
  };
  assert.doesNotThrow(() => buildMissionPhaseResult({ ...options, artifact: base }));
  assert.throws(
    () => buildMissionPhaseResult({ ...options, artifact: { ...base, realmEffects: ['write'] } }),
    /artifact|field|authority|Realm/i,
  );
  assert.throws(
    () => buildMissionPhaseResult({ ...options, artifact: { ...base, artifactType: 'native' } }),
    /phase|artifact/i,
  );
  assert.throws(
    () => buildMissionPhaseResult({
      ...options,
      artifact: {
        ...base,
        findings: [{ id: 'blocking', severity: 'critical', required: true, message: 'cannot accept this' }],
      },
    }),
    /accept|finding|recommendation/i,
  );
});

test('verdict contracts encode only the bounded deterministic path', () => {
  const accepted = buildMissionVerdict({
    admission: admission({ godskillsBinding: null }),
    disposition: 'accepted',
    reason: 'native-no-review',
    acceptedArtifactDigest: digest('d'),
    nativeResultDigest: digest('e'),
    reviewResultDigests: [],
    revisionResultDigest: null,
  });
  assert.deepEqual(verifyMissionVerdict(accepted, admission({ godskillsBinding: null })), accepted);
  assert.equal(accepted.realmEffects, 0);
  assert.equal(accepted.authorityExpanded, false);

  assert.throws(
    () => buildMissionVerdict({
      admission: admission(),
      disposition: 'accepted',
      reason: 'revision-review-accepted',
      acceptedArtifactDigest: digest('d'),
      nativeResultDigest: digest('e'),
      reviewResultDigests: [digest('f')],
      revisionResultDigest: digest('1'),
    }),
    /review|verdict|path/i,
  );

  const expanded = structuredClone(accepted);
  expanded.realmEffects = 1;
  assert.throws(() => verifyMissionVerdict(expanded, admission({ godskillsBinding: null })), /Realm|authority|digest/i);
});

test('completion receipts cross-bind the pre-completion journal head, phases, verdict, and usage', () => {
  const admitted = admission({ godskillsBinding: null });
  const verdict = buildMissionVerdict({
    admission: admitted,
    disposition: 'accepted',
    reason: 'native-no-review',
    acceptedArtifactDigest: digest('d'),
    nativeResultDigest: digest('e'),
    reviewResultDigests: [],
    revisionResultDigest: null,
  });
  const receipt = buildMissionCompletionReceipt({
    admission: admitted,
    transactionId: digest('1'),
    preCompletionJournalHeadDigest: digest('2'),
    verdict,
    phaseResults: {
      nativeResultDigest: digest('e'),
      reviewResultDigests: [],
      revisionResultDigest: null,
    },
    usage: {
      inputTokens: 300,
      cachedInputTokens: 200,
      reasoningTokens: 500,
      visibleOutputTokens: 100,
      completionTokens: 600,
    },
    completedAt: '2026-08-31T12:00:10.000Z',
  });
  assert.deepEqual(verifyMissionCompletionReceipt(receipt, { admission: admitted, verdict }), receipt);
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.acceptedArtifactDigest, digest('d'));

  const changed = structuredClone(receipt);
  changed.phases.nativeResultDigest = digest('3');
  assert.throws(
    () => verifyMissionCompletionReceipt(changed, { admission: admitted, verdict }),
    /phase|receipt|digest/i,
  );
});
