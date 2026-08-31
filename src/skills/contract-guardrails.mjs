function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function nonEmptyStringSet(value, label) {
  if (!Array.isArray(value) || value.length === 0
      || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new TypeError(`${label} must be a non-empty string array`);
  }
  return [...new Set(value)].sort((left, right) => left.localeCompare(right));
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
    failureModes: nonEmptyStringSet(contract.failureModes, `contract.failureModes for ${capabilityId}`),
    effects: nonEmptyStringSet(contract.effects, `contract.effects for ${capabilityId}`),
    terminationConditions: nonEmptyStringSet(
      contract.terminationConditions,
      `contract.terminationConditions for ${capabilityId}`,
    ),
  });
}
