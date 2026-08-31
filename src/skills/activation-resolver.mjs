import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';

const MODES = new Set(['native', 'guardrail', 'method', 'review']);
const TASK_CLASSES = new Set([
  'creative-generation', 'debugging-recovery', 'implementation', 'research', 'continuity', 'verification', 'general',
]);
const CONSEQUENCE_CLASSES = new Set(['low', 'consequential', 'critical']);
const TRUSTED_POLICY_DIGEST = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const TRUSTED_EVIDENCE_DIGEST = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';
const METHOD_THRESHOLD = Object.freeze({
  minimumMatchedEvaluations: 3,
  minimumWins: 2,
  minimumWinRate: 0.6666666666666666,
  maximumCriticalRegressions: 0,
  maximumOverheadRatio: 1.35,
});
const DISCLOSURE = Object.freeze({
  native: 'none',
  guardrail: 'guardrails-only',
  method: 'entrypoint-and-contract',
  review: 'none',
});
const TRUSTED_PROFILES = new Map([[
  'eternities-muse:creative-generation',
  Object.freeze({
    matchedEvaluations: 4,
    wins: 1,
    losses: 3,
    ties: 0,
    criticalRegressions: 0,
    maximumObservedOverheadRatio: 1.44,
    methodEligible: false,
    preferredMode: 'review',
  }),
]]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sorted(values) {
  return [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right));
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error(`${label} fields are invalid`);
}

function nonEmptyStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0
      || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new TypeError(`${label} must be a non-empty string array`);
  }
  return sorted(value);
}

export function compileContractGuardrails(contract, capabilityId) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new TypeError(`Godskills guardrail contract for ${capabilityId} is invalid`);
  }
  if (typeof contract.successCondition !== 'string' || contract.successCondition.length === 0) {
    throw new TypeError(`Godskills guardrail contract successCondition for ${capabilityId} is invalid`);
  }
  return deepFreeze({
    successCondition: contract.successCondition,
    failureModes: nonEmptyStringArray(contract.failureModes, `contract.failureModes for ${capabilityId}`),
    effects: nonEmptyStringArray(contract.effects, `contract.effects for ${capabilityId}`),
    terminationConditions: nonEmptyStringArray(
      contract.terminationConditions,
      `contract.terminationConditions for ${capabilityId}`,
    ),
  });
}

function methodEvidence(profile) {
  if (!profile) {
    return {
      eligible: false,
      matchedEvaluations: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winRate: 0,
      criticalRegressions: 0,
      overheadRatio: null,
      failedGates: ['reviewed-task-class-evidence'],
    };
  }
  const winRate = profile.matchedEvaluations === 0 ? 0 : profile.wins / profile.matchedEvaluations;
  const gates = {
    matchedEvaluations: profile.matchedEvaluations >= METHOD_THRESHOLD.minimumMatchedEvaluations,
    wins: profile.wins >= METHOD_THRESHOLD.minimumWins,
    winRate: winRate >= METHOD_THRESHOLD.minimumWinRate,
    criticalRegressions: profile.criticalRegressions <= METHOD_THRESHOLD.maximumCriticalRegressions,
    overhead: profile.maximumObservedOverheadRatio !== null
      && profile.maximumObservedOverheadRatio <= METHOD_THRESHOLD.maximumOverheadRatio,
  };
  const failedGates = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name);
  if (profile.methodEligible !== (failedGates.length === 0)) {
    throw new Error('trusted activation evidence profile is internally contradictory');
  }
  return {
    eligible: failedGates.length === 0,
    matchedEvaluations: profile.matchedEvaluations,
    wins: profile.wins,
    losses: profile.losses,
    ties: profile.ties,
    winRate,
    criticalRegressions: profile.criticalRegressions,
    overheadRatio: profile.maximumObservedOverheadRatio,
    failedGates,
  };
}

function validateClassification(classification) {
  if (!classification || typeof classification !== 'object' || Array.isArray(classification)) {
    throw new TypeError('Godskills activation classification is invalid');
  }
  exactKeys(classification, ['taskClass', 'consequenceClass', 'reviewAvailable'], 'Godskills activation classification');
  if (!TASK_CLASSES.has(classification.taskClass)) throw new Error('Godskills activation task class is invalid');
  if (!CONSEQUENCE_CLASSES.has(classification.consequenceClass)) {
    throw new Error('Godskills activation consequence class is invalid');
  }
  if (typeof classification.reviewAvailable !== 'boolean') {
    throw new TypeError('Godskills activation review availability must be boolean');
  }
  return classification;
}

function validateExplicitMethodRequests(values, selectedIds) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new TypeError('Godskills explicit method requests must be capability ids');
  }
  const normalized = sorted(values);
  if (normalized.length !== values.length || normalized.some((id) => !selectedIds.has(id))) {
    throw new Error('Godskills explicit method requests must be unique selected capability ids');
  }
  return normalized;
}

function compileDecision({ selectedId, classification, explicitMethodRequest, authority }) {
  const profile = TRUSTED_PROFILES.get(`${selectedId}:${classification.taskClass}`) ?? null;
  const evaluated = methodEvidence(profile);
  let mode;
  const reasonCodes = [];
  if (explicitMethodRequest) {
    mode = 'method';
    reasonCodes.push('explicit-method-request');
  } else if (evaluated.eligible) {
    mode = 'method';
    reasonCodes.push('matched-method-advantage');
  } else if (profile?.preferredMode === 'review' && classification.reviewAvailable) {
    mode = 'review';
    reasonCodes.push('mixed-evidence-native-first', 'review-phase-available');
  } else if (classification.consequenceClass !== 'low') {
    mode = 'guardrail';
    reasonCodes.push(
      classification.reviewAvailable ? 'insufficient-method-evidence' : 'review-unavailable',
      'consequence-guardrails',
    );
  } else {
    mode = 'native';
    reasonCodes.push(profile ? 'native-floor-preferred' : 'no-reviewed-method-advantage');
  }
  if (!MODES.has(mode)) throw new Error('Godskills activation mode could not be compiled');
  const unsigned = {
    id: selectedId,
    taskClass: classification.taskClass,
    consequenceClass: classification.consequenceClass,
    mode,
    reasonCodes,
    preInferenceDisclosure: DISCLOSURE[mode],
    deferredReview: mode === 'review',
    methodEvidence: evaluated,
    policyDigest: TRUSTED_POLICY_DIGEST,
    evidenceDigest: TRUSTED_EVIDENCE_DIGEST,
    authorityProjection: structuredClone(authority),
    authorityExpanded: false,
  };
  return deepFreeze({ ...unsigned, decisionDigest: sha256Value(unsigned) });
}

export function validateActivationResolver(resolver) {
  if (resolver === undefined || resolver === null) return null;
  if (!resolver || typeof resolver !== 'object' || Array.isArray(resolver)
      || typeof resolver.classify !== 'function') {
    throw new TypeError('Godskills activation resolver is invalid');
  }
  if (resolver.policyDigest !== TRUSTED_POLICY_DIGEST) {
    throw new Error('Godskills activation policy digest does not match the trusted activation policy');
  }
  if (resolver.evidenceDigest !== TRUSTED_EVIDENCE_DIGEST) {
    throw new Error('Godskills activation evidence digest does not match the trusted activation evidence');
  }
  return resolver;
}

export function compileEmptyActivation() {
  return deepFreeze({
    policyDigest: TRUSTED_POLICY_DIGEST,
    evidenceDigest: TRUSTED_EVIDENCE_DIGEST,
    context: null,
    decisions: [],
  });
}

export function compileActivationResolution({ classification, selected, authority, explicitMethodRequests }) {
  validateClassification(classification);
  const selectedIds = new Set(selected.map(({ id }) => id));
  const explicit = validateExplicitMethodRequests(explicitMethodRequests, selectedIds);
  const context = {
    taskClass: classification.taskClass,
    consequenceClass: classification.consequenceClass,
    reviewAvailable: classification.reviewAvailable,
    explicitMethodRequests: explicit,
  };
  const decisions = selected.map(({ id }) => compileDecision({
    selectedId: id,
    classification,
    explicitMethodRequest: explicit.includes(id),
    authority,
  }));
  return deepFreeze({
    policyDigest: TRUSTED_POLICY_DIGEST,
    evidenceDigest: TRUSTED_EVIDENCE_DIGEST,
    context,
    decisions,
  });
}

export function validateStoredActivation({ activation, selected, authority, explicitMethodRequests }) {
  if (!activation || typeof activation !== 'object' || Array.isArray(activation)) {
    throw new TypeError('Godskills stored activation is invalid');
  }
  if (activation.policyDigest !== TRUSTED_POLICY_DIGEST) throw new Error('Godskills activation policy digest mismatch');
  if (activation.evidenceDigest !== TRUSTED_EVIDENCE_DIGEST) throw new Error('Godskills activation evidence digest mismatch');
  const expected = selected.length === 0
    ? compileEmptyActivation()
    : compileActivationResolution({
      classification: {
        taskClass: activation.context?.taskClass,
        consequenceClass: activation.context?.consequenceClass,
        reviewAvailable: activation.context?.reviewAvailable,
      },
      selected,
      authority,
      explicitMethodRequests,
    });
  if (canonicalJson(activation) !== canonicalJson(expected)) {
    throw new Error('Godskills activation decision digest or context mismatch');
  }
  return expected;
}
