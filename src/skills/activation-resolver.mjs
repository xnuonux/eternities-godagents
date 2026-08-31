const MODES = new Set(['native', 'guardrail', 'method', 'review']);
const DIGEST = /^[a-f0-9]{64}$/;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactDigest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} must be an exact sha256 digest`);
}

export function validateActivationResolver(resolver) {
  if (resolver === undefined || resolver === null) return null;
  if (!resolver || typeof resolver !== 'object' || Array.isArray(resolver)
      || typeof resolver.resolve !== 'function') {
    throw new TypeError('Godskills activation resolver is invalid');
  }
  exactDigest(resolver.policyDigest, 'activation policy digest');
  return resolver;
}

export function validateActivationResolution({ resolution, selected, expectedPolicyDigest }) {
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
    throw new TypeError('Godskills activation resolution is invalid');
  }
  exactDigest(resolution.policyDigest, 'activation resolution policy digest');
  if (resolution.policyDigest !== expectedPolicyDigest) throw new Error('Godskills activation policy digest mismatch');
  if (!Array.isArray(resolution.decisions) || resolution.decisions.length !== selected.length) {
    throw new Error('Godskills activation decisions do not match the selected capabilities');
  }
  const decisions = resolution.decisions.map((decision, index) => {
    const expected = selected[index];
    if (!decision || typeof decision !== 'object' || Array.isArray(decision) || decision.id !== expected.id) {
      throw new Error('Godskills activation decision identity mismatch');
    }
    if (!MODES.has(decision.mode)) throw new Error(`Godskills activation mode is invalid: ${decision.mode}`);
    exactDigest(decision.decisionDigest, `activation decision digest for ${decision.id}`);
    if (!Array.isArray(decision.reasonCodes)
        || decision.reasonCodes.some((value) => typeof value !== 'string' || value.length === 0)) {
      throw new TypeError(`Godskills activation reason codes are invalid for ${decision.id}`);
    }
    return {
      id: decision.id,
      mode: decision.mode,
      decisionDigest: decision.decisionDigest,
      reasonCodes: [...new Set(decision.reasonCodes)].sort((left, right) => left.localeCompare(right)),
    };
  });
  return deepFreeze({ policyDigest: resolution.policyDigest, decisions });
}
