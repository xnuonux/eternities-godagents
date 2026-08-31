import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { buildMissionAdmission } from '../../src/runtime/mission-phase-contracts.mjs';

export const fixtureDigest = (character) => character.repeat(64);

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

export function buildReviewGodskillsBinding(missionId = 'mission-review-kernel', {
  id = 'eternities-aegis',
  entrypointSha256 = fixtureDigest('1'),
  contractSha256 = fixtureDigest('2'),
  releaseDigest = fixtureDigest('8'),
  activationTrustRootDigest = fixtureDigest('6'),
  selections = null,
  authority = authorityProjection(),
  authorityCeilingDigest = fixtureDigest('b'),
} = {}) {
  const selected = (selections ?? [{ id, entrypointSha256, contractSha256 }])
    .map((row) => ({ ...row }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const decisions = selected.map((selection) => {
    const decisionUnsigned = {
      schemaVersion: 1,
      selectedId: selection.id,
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
      policyDigest: fixtureDigest('3'),
      evidenceDigest: fixtureDigest('4'),
      authorityProjection: structuredClone(authority),
      authorityExpanded: false,
    };
    return { ...decisionUnsigned, decisionDigest: sha256Value(decisionUnsigned) };
  });
  const activationUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godskills-activation-v1',
    requestId: `activation-${missionId}`,
    requestDigest: fixtureDigest('5'),
    trustRootDigest: activationTrustRootDigest,
    policyDigest: decisions[0].policyDigest,
    evidenceDigest: decisions[0].evidenceDigest,
    classification: {
      taskClass: 'verification',
      consequenceClass: 'consequential',
      reviewAvailable: true,
    },
    decisions,
  };
  const activation = { ...activationUnsigned, resultDigest: sha256Value(activationUnsigned) };
  const cortexPackage = {
    protocolId: 'eternities-godskills-adapter-v1',
    sourceEnvelopeDigest: fixtureDigest('7'),
    releaseDigest,
    stackDigest: fixtureDigest('9'),
    selectedCapabilities: selected.map(({ id: selectedId }) => selectedId),
    methods: [],
    evidenceRequirements: [],
    proposalRequirements: [],
    riskObligations: [],
    preconditionObligations: [],
    terminationConditions: [],
    authorityProjection: structuredClone(authority),
    disclosureBytes: 0,
    selectedPackages: [],
    deferredReviews: selected.map((selection) => ({
      id: selection.id,
      entrypointSha256: selection.entrypointSha256,
      contractSha256: selection.contractSha256,
      status: 'scheduled-not-executed',
    })),
    activation,
  };
  const receipt = {
    schemaVersion: 1,
    protocolId: 'eternities-godskills-adapter-v1',
    requestId: missionId,
    sourceEnvelopeDigest: cortexPackage.sourceEnvelopeDigest,
    releaseDigest: cortexPackage.releaseDigest,
    routerReceiptDigest: fixtureDigest('a'),
    selectionStatus: 'selected',
    selected,
    authorityCeilingDigest,
    stackDigest: cortexPackage.stackDigest,
    packageDigest: sha256Text(canonicalJson(cortexPackage)),
    activation,
  };
  return { receipt, cortexPackage };
}

export function buildReviewGodskillsTrustPin(binding) {
  return {
    protocolId: binding.receipt.protocolId,
    releaseDigest: binding.receipt.releaseDigest,
    activationProtocolId: binding.receipt.activation.protocolId,
    activationTrustRootDigest: binding.receipt.activation.trustRootDigest,
  };
}

export function buildReviewAdmission(missionId = 'mission-review-kernel', options = {}) {
  const godskillsBinding = options.godskillsBinding ?? buildReviewGodskillsBinding(missionId, options);
  return buildMissionAdmission({
    mission: {
      missionId,
      objective: 'produce and review one durable artifact',
      successEvidence: ['artifact committed', 'verdict committed'],
      stopConditions: ['authority changes', 'review evidence is ambiguous'],
    },
    authorityCeilingDigest: fixtureDigest('b'),
    budgets: {
      nativeCompletionTokens: 1000,
      reviewCompletionTokensPerRound: 500,
      revisionCompletionTokens: 800,
      totalCompletionTokens: 2800,
      maxArtifactBytes: 8192,
    },
    godskillsBinding,
    godskillsTrustPin: buildReviewGodskillsTrustPin(godskillsBinding),
    admittedAt: '2026-08-31T14:00:00.000Z',
  });
}
