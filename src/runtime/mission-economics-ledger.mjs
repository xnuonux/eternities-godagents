import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  verifyMissionAdmission,
  verifyMissionCompletionReceipt,
  verifyMissionExecutorDescriptor,
  verifyMissionPhaseRequest,
  verifyMissionPhaseResult,
  verifyMissionVerdict,
} from './mission-phase-contracts.mjs';

export const MISSION_ECONOMICS_LEDGER_PROTOCOL_ID = 'eternities-mission-economics-ledger-v1';
export const MISSION_ECONOMICS_CACHE_KEY_PROTOCOL_ID = 'eternities-mission-economics-cache-key-v1';

const DIGEST = /^[a-f0-9]{64}$/;
const PHASE_ORDER = new Map([
  ['native:1', 0],
  ['review:1', 1],
  ['revision:1', 2],
  ['review:2', 3],
]);
const SOURCE_KEYS = ['admission', 'completionReceipt', 'phases', 'verdict'];
const PROOF_LIMITS = Object.freeze({
  liveProviderQuality: false,
  liveProviderPricing: false,
  liveCacheAvailability: false,
});

export class MissionEconomicsLedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionEconomicsLedgerError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MissionEconomicsLedgerError(code, message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('object-invalid', `${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('fields-invalid', `${label} fields are invalid`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} digest is invalid`);
  return value;
}

function requireInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    fail('integer-invalid', `${label} must be a non-negative safe integer`);
  }
  return value;
}

function requireIso(value, label) {
  if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || Number.isNaN(Date.parse(value))
      || new Date(value).toISOString() !== value) {
    fail('time-invalid', `${label} time is invalid`);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function verifySource(value) {
  exactKeys(value, SOURCE_KEYS, 'mission economics source');
  verifyMissionAdmission(value.admission);
  verifyMissionVerdict(value.verdict, value.admission);
  verifyMissionCompletionReceipt(value.completionReceipt, {
    admission: value.admission,
    verdict: value.verdict,
  });
  if (!Array.isArray(value.phases) || value.phases.length < 1 || value.phases.length > 4) {
    fail('phase-set-invalid', 'mission economics source phases are invalid');
  }

  const expectedDigests = [
    value.completionReceipt.phases.nativeResultDigest,
    ...value.completionReceipt.phases.reviewResultDigests,
    value.completionReceipt.phases.revisionResultDigest,
  ].filter((digest) => digest !== null);
  const seen = new Set();
  const verified = [];
  for (const [index, entry] of value.phases.entries()) {
    exactKeys(entry, ['descriptor', 'request', 'result'], `mission economics phase ${index}`);
    verifyMissionExecutorDescriptor(entry.descriptor, entry.request.phase);
    verifyMissionPhaseRequest(entry.request, {
      admission: value.admission,
      descriptor: entry.descriptor,
    });
    verifyMissionPhaseResult(entry.result, {
      request: entry.request,
      descriptor: entry.descriptor,
    });
    const receipt = entry.result.receipt;
    if (!expectedDigests.includes(receipt.resultDigest)) {
      fail('phase-binding-invalid', 'mission economics phase is not referenced by the completion receipt');
    }
    if (seen.has(receipt.resultDigest)) fail('phase-binding-invalid', 'mission economics phase results must be unique');
    seen.add(receipt.resultDigest);
    if (Date.parse(receipt.startedAt) < Date.parse(value.admission.admittedAt)) {
      fail('phase-time-invalid', 'mission economics phase predates admission');
    }
    if (Date.parse(receipt.completedAt) > Date.parse(value.completionReceipt.completedAt)) {
      fail('phase-time-invalid', 'mission economics phase completes after the mission receipt');
    }
    verified.push(entry);
  }
  if (seen.size !== expectedDigests.length) {
    fail('phase-binding-invalid', 'mission economics source does not contain every completed phase');
  }
  return verified.sort((left, right) => {
    const leftKey = `${left.request.phase}:${left.request.round}`;
    const rightKey = `${right.request.phase}:${right.request.round}`;
    return (PHASE_ORDER.get(leftKey) ?? 99) - (PHASE_ORDER.get(rightKey) ?? 99);
  });
}

function verifyUsage(value) {
  exactKeys(value, [
    'cachedInputTokens',
    'completionTokens',
    'inputTokens',
    'reasoningTokens',
    'visibleOutputTokens',
  ], 'mission economics usage');
  for (const [name, count] of Object.entries(value)) requireInteger(count, `mission economics usage ${name}`, 10_000_000);
  if (value.cachedInputTokens > value.inputTokens
      || value.completionTokens !== value.reasoningTokens + value.visibleOutputTokens) {
    fail('usage-invalid', 'mission economics usage is contradictory');
  }
  return value;
}

function cacheKey({ admissionDigest, phase, round, requestDigest, executorDescriptorDigest }) {
  return sha256Value({
    schemaVersion: 1,
    protocolId: MISSION_ECONOMICS_CACHE_KEY_PROTOCOL_ID,
    admissionDigest,
    phase,
    round,
    requestDigest,
    executorDescriptorDigest,
  });
}

function basisPoints(numerator, denominator) {
  return denominator === 0 ? 0 : Math.floor((numerator * 10_000) / denominator);
}

function metricFor(entry, admissionDigest) {
  const { request, descriptor, result } = entry;
  const receipt = result.receipt;
  const usage = verifyUsage(receipt.usage);
  const latencyMs = Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt);
  if (latencyMs < 0) fail('phase-time-invalid', 'mission economics phase latency is negative');
  const completionBudgetTokens = request.maxCompletionTokens;
  const cacheKeyDigest = cacheKey({
    admissionDigest,
    phase: request.phase,
    round: request.round,
    requestDigest: request.requestDigest,
    executorDescriptorDigest: descriptor.descriptorDigest,
  });
  return {
    phase: request.phase,
    round: request.round,
    requestDigest: request.requestDigest,
    executorDescriptorDigest: descriptor.descriptorDigest,
    resultDigest: receipt.resultDigest,
    cacheKeyDigest,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    uncachedInputTokens: usage.inputTokens - usage.cachedInputTokens,
    reasoningTokens: usage.reasoningTokens,
    visibleOutputTokens: usage.visibleOutputTokens,
    completionTokens: usage.completionTokens,
    completionBudgetTokens,
    completionHeadroomTokens: completionBudgetTokens - usage.completionTokens,
    completionUtilizationBps: basisPoints(usage.completionTokens, completionBudgetTokens),
    cacheCoverageBps: basisPoints(usage.cachedInputTokens, usage.inputTokens),
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    latencyMs,
  };
}

function totalFor(phases) {
  const totals = {
    phaseCount: phases.length,
    inputTokens: 0,
    cachedInputTokens: 0,
    uncachedInputTokens: 0,
    reasoningTokens: 0,
    visibleOutputTokens: 0,
    completionTokens: 0,
    completionBudgetTokens: 0,
    completionHeadroomTokens: 0,
    completionUtilizationBps: 0,
    cacheCoverageBps: 0,
    sumPhaseLatencyMs: 0,
    elapsedLatencyMs: 0,
  };
  for (const phase of phases) {
    for (const key of [
      'inputTokens', 'cachedInputTokens', 'uncachedInputTokens', 'reasoningTokens',
      'visibleOutputTokens', 'completionTokens', 'completionBudgetTokens',
      'completionHeadroomTokens',
    ]) totals[key] += phase[key];
    totals.sumPhaseLatencyMs += phase.latencyMs;
  }
  totals.completionUtilizationBps = basisPoints(totals.completionTokens, totals.completionBudgetTokens);
  totals.cacheCoverageBps = basisPoints(totals.cachedInputTokens, totals.inputTokens);
  const starts = phases.map(({ startedAt }) => Date.parse(startedAt));
  const completions = phases.map(({ completedAt }) => Date.parse(completedAt));
  totals.elapsedLatencyMs = Math.max(...completions) - Math.min(...starts);
  return totals;
}

function deriveUnsigned(source) {
  const phases = verifySource(source).map((entry) => metricFor(entry, source.admission.admissionDigest));
  const unsigned = {
    schemaVersion: 1,
    protocolId: MISSION_ECONOMICS_LEDGER_PROTOCOL_ID,
    missionId: source.admission.mission.missionId,
    admissionDigest: source.admission.admissionDigest,
    completionReceiptDigest: source.completionReceipt.receiptDigest,
    phases,
    totals: totalFor(phases),
    proofLimits: clone(PROOF_LIMITS),
  };
  const aggregate = {
    inputTokens: unsigned.totals.inputTokens,
    cachedInputTokens: unsigned.totals.cachedInputTokens,
    reasoningTokens: unsigned.totals.reasoningTokens,
    visibleOutputTokens: unsigned.totals.visibleOutputTokens,
    completionTokens: unsigned.totals.completionTokens,
  };
  if (!same(aggregate, source.completionReceipt.usage)) {
    fail('usage-binding-invalid', 'mission economics totals do not match the completion receipt');
  }
  return unsigned;
}

function buildValue(source) {
  const unsigned = deriveUnsigned(source);
  const value = { ...unsigned, ledgerDigest: sha256Value(unsigned) };
  assertSchema('mission-economics-ledger', value);
  return deepFreeze(value);
}

export function buildMissionEconomicsLedger(source = {}) {
  return buildValue(source);
}

export function buildMissionEconomicsLedgerFromEvidence(evidence = {}) {
  object(evidence, 'mission review evidence');
  if (!evidence.admission || !evidence.verdict || !evidence.terminal) {
    fail('evidence-incomplete', 'completed mission review evidence is required');
  }
  const entries = [evidence.native, ...(evidence.reviews ?? []), evidence.revision]
    .filter((entry) => entry?.result);
  return buildValue({
    admission: evidence.admission,
    completionReceipt: evidence.terminal,
    phases: entries.map(({ request, descriptor, result }) => ({ request, descriptor, result })),
    verdict: evidence.verdict,
  });
}

export function verifyMissionEconomicsLedger(value, source = {}) {
  assertSchema('mission-economics-ledger', value);
  exactKeys(value, [
    'admissionDigest',
    'completionReceiptDigest',
    'ledgerDigest',
    'missionId',
    'phases',
    'proofLimits',
    'protocolId',
    'schemaVersion',
    'totals',
  ], 'mission economics ledger');
  const expected = buildValue(source);
  if (!same(value, expected)) fail('ledger-digest-invalid', 'mission economics ledger does not match source evidence');
  return value;
}
