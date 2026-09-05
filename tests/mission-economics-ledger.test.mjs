import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionCompletionReceipt,
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
  buildMissionPhaseResult,
  buildMissionVerdict,
} from '../src/runtime/mission-phase-contracts.mjs';
import { buildReviewAdmission, fixtureDigest } from './helpers/mission-review-fixture.mjs';

const EXPECTED_EXPORTS = [
  'MISSION_ECONOMICS_CACHE_KEY_PROTOCOL_ID',
  'MISSION_ECONOMICS_LEDGER_PROTOCOL_ID',
  'buildMissionEconomicsLedger',
  'buildMissionEconomicsLedgerFromEvidence',
  'verifyMissionEconomicsLedger',
];

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

function fixture() {
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
      content: 'this body must never be copied into the economics ledger',
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
  return { admission, verdict, completionReceipt, phases: [native, review] };
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('the economics subpath exposes one closed provider-neutral surface', async () => {
  const economics = await import('@eternities/godagents/economics');
  assert.deepEqual(Object.keys(economics).sort(), EXPECTED_EXPORTS);
  assert.equal(economics.MISSION_ECONOMICS_LEDGER_PROTOCOL_ID, 'eternities-mission-economics-ledger-v1');
  assert.equal(economics.MISSION_ECONOMICS_CACHE_KEY_PROTOCOL_ID, 'eternities-mission-economics-cache-key-v1');
  for (const key of Object.keys(economics)) {
    assert.equal(/credential|secret|authority|keel|continuity|evolution|soul|lunari|inspiration|provider/i.test(key), false);
  }
});

test('the ledger is deterministic, deeply frozen, cache-addressable, and body-free', async () => {
  const economics = await import('@eternities/godagents/economics');
  const state = fixture();
  const first = economics.buildMissionEconomicsLedger(state);
  const second = economics.buildMissionEconomicsLedger({ ...state, phases: [...state.phases].reverse() });

  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    schemaVersion: 1,
    protocolId: 'eternities-mission-economics-ledger-v1',
    missionId: state.admission.mission.missionId,
    admissionDigest: state.admission.admissionDigest,
    completionReceiptDigest: state.completionReceipt.receiptDigest,
    phases: [
      {
        phase: 'native',
        round: 1,
        requestDigest: state.phases[0].request.requestDigest,
        executorDescriptorDigest: state.phases[0].descriptor.descriptorDigest,
        resultDigest: state.phases[0].result.receipt.resultDigest,
        cacheKeyDigest: sha256Value({
          schemaVersion: 1,
          protocolId: 'eternities-mission-economics-cache-key-v1',
          admissionDigest: state.admission.admissionDigest,
          phase: 'native',
          round: 1,
          requestDigest: state.phases[0].request.requestDigest,
          executorDescriptorDigest: state.phases[0].descriptor.descriptorDigest,
        }),
        inputTokens: 500,
        cachedInputTokens: 300,
        uncachedInputTokens: 200,
        reasoningTokens: 180,
        visibleOutputTokens: 20,
        completionTokens: 200,
        completionBudgetTokens: 1000,
        completionHeadroomTokens: 800,
        completionUtilizationBps: 2000,
        cacheCoverageBps: 6000,
        startedAt: '2026-08-31T14:00:01.000Z',
        completedAt: '2026-08-31T14:00:03.000Z',
        latencyMs: 2000,
      },
      {
        phase: 'review',
        round: 1,
        requestDigest: state.phases[1].request.requestDigest,
        executorDescriptorDigest: state.phases[1].descriptor.descriptorDigest,
        resultDigest: state.phases[1].result.receipt.resultDigest,
        cacheKeyDigest: sha256Value({
          schemaVersion: 1,
          protocolId: 'eternities-mission-economics-cache-key-v1',
          admissionDigest: state.admission.admissionDigest,
          phase: 'review',
          round: 1,
          requestDigest: state.phases[1].request.requestDigest,
          executorDescriptorDigest: state.phases[1].descriptor.descriptorDigest,
        }),
        inputTokens: 220,
        cachedInputTokens: 100,
        uncachedInputTokens: 120,
        reasoningTokens: 80,
        visibleOutputTokens: 20,
        completionTokens: 100,
        completionBudgetTokens: 500,
        completionHeadroomTokens: 400,
        completionUtilizationBps: 2000,
        cacheCoverageBps: 4545,
        startedAt: '2026-08-31T14:00:04.000Z',
        completedAt: '2026-08-31T14:00:05.500Z',
        latencyMs: 1500,
      },
    ],
    totals: {
      phaseCount: 2,
      inputTokens: 720,
      cachedInputTokens: 400,
      uncachedInputTokens: 320,
      reasoningTokens: 260,
      visibleOutputTokens: 40,
      completionTokens: 300,
      completionBudgetTokens: 1500,
      completionHeadroomTokens: 1200,
      completionUtilizationBps: 2000,
      cacheCoverageBps: 5555,
      sumPhaseLatencyMs: 3500,
      elapsedLatencyMs: 4500,
    },
    proofLimits: {
      liveProviderQuality: false,
      liveProviderPricing: false,
      liveCacheAvailability: false,
    },
    ledgerDigest: first.ledgerDigest,
  });
  assert.equal(canonicalJson(first).includes('this body must never be copied'), false);
  assertDeepFrozen(first);
  assert.deepEqual(economics.verifyMissionEconomicsLedger(first, state), first);
});

test('verification fails closed when source phase evidence or the ledger is changed', async () => {
  const economics = await import('@eternities/godagents/economics');
  const state = fixture();
  const ledger = economics.buildMissionEconomicsLedger(state);

  const changedUsage = structuredClone(state);
  changedUsage.phases[0].result.receipt.usage.inputTokens += 1;
  assert.throws(
    () => economics.buildMissionEconomicsLedger(changedUsage),
    /digest|phase|usage|receipt/i,
  );

  const changedLedger = structuredClone(ledger);
  changedLedger.phases[0].cacheKeyDigest = fixtureDigest('z');
  assert.throws(
    () => economics.verifyMissionEconomicsLedger(changedLedger, state),
    /digest|cache|ledger/i,
  );

  const missingPhase = { ...state, phases: [state.phases[0]] };
  assert.throws(
    () => economics.buildMissionEconomicsLedger(missingPhase),
    /phase|receipt|complete/i,
  );
});

test('journal-shaped completed evidence is a lossless input bridge without copying artifact bodies', async () => {
  const economics = await import('@eternities/godagents/economics');
  const state = fixture();
  const ledger = economics.buildMissionEconomicsLedgerFromEvidence({
    admission: state.admission,
    verdict: state.verdict,
    terminal: state.completionReceipt,
    native: state.phases[0],
    reviews: [state.phases[1]],
    revision: null,
  });
  assert.deepEqual(ledger, economics.buildMissionEconomicsLedger(state));
  assert.equal(canonicalJson(ledger).includes('this body must never be copied'), false);
  assert.throws(
    () => economics.buildMissionEconomicsLedgerFromEvidence({
      admission: state.admission,
      verdict: state.verdict,
      terminal: null,
      native: state.phases[0],
      reviews: [state.phases[1]],
      revision: null,
    }),
    /evidence|completed|terminal/i,
  );
});
