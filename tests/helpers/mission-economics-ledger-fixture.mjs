import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import {
  buildMissionCompletionReceipt,
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
  buildMissionPhaseResult,
  buildMissionVerdict,
} from '../../src/runtime/mission-phase-contracts.mjs';
import { buildMissionEconomicsLedger } from '../../src/runtime/mission-economics-ledger.mjs';
import { buildReviewAdmission, fixtureDigest } from './mission-review-fixture.mjs';

function usage({ inputTokens, cachedInputTokens, reasoningTokens, visibleOutputTokens }) {
  return {
    inputTokens,
    cachedInputTokens,
    reasoningTokens,
    visibleOutputTokens,
    completionTokens: reasoningTokens + visibleOutputTokens,
  };
}

function phase({ admission, phase, round, inputs, artifact, phaseUsage, startedAt, completedAt }) {
  const descriptor = buildMissionExecutorDescriptor({
    executorId: `economics-${phase}-${round}-fixture-v1`,
    phase,
  });
  const request = buildMissionPhaseRequest({
    admission,
    phase,
    round,
    descriptor,
    inputs,
    maxCompletionTokens: phase === 'native'
      ? admission.budgets.nativeCompletionTokens
      : phase === 'review'
        ? admission.budgets.reviewCompletionTokensPerRound
        : admission.budgets.revisionCompletionTokens,
  });
  const result = buildMissionPhaseResult({
    request,
    descriptor,
    artifact,
    usage: phaseUsage,
    startedAt,
    completedAt,
  });
  return { descriptor, request, result };
}

export function buildMissionEconomicsSource() {
  const admission = buildReviewAdmission('mission-economics-ledger');
  const native = phase({
    admission,
    phase: 'native',
    round: 1,
    inputs: [{
      role: 'godskills-package',
      artifactDigest: admission.godskills.receipt.packageDigest,
    }],
    artifact: {
      schemaVersion: 1,
      artifactType: 'native',
      content: 'this body is source evidence and must not enter the ledger',
    },
    phaseUsage: usage({ inputTokens: 500, cachedInputTokens: 300, reasoningTokens: 180, visibleOutputTokens: 20 }),
    startedAt: '2026-08-31T14:00:01.000Z',
    completedAt: '2026-08-31T14:00:03.000Z',
  });
  const review = phase({
    admission,
    phase: 'review',
    round: 1,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
      { role: 'subject', artifactDigest: native.result.receipt.artifactDigest },
    ],
    artifact: {
      schemaVersion: 1,
      artifactType: 'review',
      subjectDigest: native.result.receipt.artifactDigest,
      recommendation: 'accept',
      findings: [],
      summary: 'the exact native result is accepted',
    },
    phaseUsage: usage({ inputTokens: 220, cachedInputTokens: 100, reasoningTokens: 80, visibleOutputTokens: 20 }),
    startedAt: '2026-08-31T14:00:04.000Z',
    completedAt: '2026-08-31T14:00:05.500Z',
  });
  const verdict = buildMissionVerdict({
    admission,
    disposition: 'accepted',
    reason: 'review-accepted',
    acceptedArtifactDigest: native.result.receipt.artifactDigest,
    nativeResultDigest: native.result.receipt.resultDigest,
    reviewResultDigests: [review.result.receipt.resultDigest],
    revisionResultDigest: null,
  });
  const completionReceipt = buildMissionCompletionReceipt({
    admission,
    transactionId: fixtureDigest('d'),
    preCompletionJournalHeadDigest: fixtureDigest('e'),
    verdict,
    phaseResults: {
      nativeResultDigest: native.result.receipt.resultDigest,
      reviewResultDigests: [review.result.receipt.resultDigest],
      revisionResultDigest: null,
    },
    usage: {
      inputTokens: 720,
      cachedInputTokens: 400,
      reasoningTokens: 260,
      visibleOutputTokens: 40,
      completionTokens: 300,
    },
    completedAt: '2026-08-31T14:00:06.000Z',
  });
  return {
    admission,
    completionReceipt,
    phases: [native, review],
    verdict,
  };
}

export function buildDeterministicMissionEconomicsLedgerFixture() {
  const source = buildMissionEconomicsSource();
  const ledger = buildMissionEconomicsLedger(source);
  const assertions = {
    exactPhaseCount: ledger.totals.phaseCount === 2,
    completionUsageMatches: ledger.totals.completionTokens === source.completionReceipt.usage.completionTokens,
    cacheIdentityPresent: ledger.phases.every(({ cacheKeyDigest }) => /^[a-f0-9]{64}$/.test(cacheKeyDigest)),
    ledgerBodyFree: !canonicalJson(ledger).includes('this body is source evidence'),
    proofLimitsHonest: Object.values(ledger.proofLimits).every((value) => value === false),
  };
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-economics-ledger-fixture-v1',
    source,
    ledger,
    assertions,
  };
  return {
    ...unsigned,
    fixtureDigest: sha256Value(unsigned),
  };
}

export function fixtureFileDigest(fixture) {
  return sha256Text(`${canonicalJson(fixture)}\n`);
}
