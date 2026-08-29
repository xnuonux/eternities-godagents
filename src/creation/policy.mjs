import { readFile } from 'node:fs/promises';

import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import { byteCompare, deepFreeze } from './contracts.mjs';

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const FORBIDDEN_CAPABILITY_PART = /(credential|authority|admin|provider|endpoint|secret|token)/i;

function sortedSet(value, label, { capability = false } = {}) {
  const entries = [...value];
  for (const entry of entries) {
    if (!IDENTIFIER.test(entry)) throw new TypeError(`invalid ${label} entry`);
    if (capability && FORBIDDEN_CAPABILITY_PART.test(entry)) throw new TypeError('forbidden capability token');
  }
  return entries.sort(byteCompare);
}

export function validateCreationPolicy(input) {
  assertSchema('creation-policy', input);
  const policy = {
    schemaVersion: 1,
    policyId: input.policyId,
    allowedEffects: sortedSet(input.allowedEffects, 'allowedEffects'),
    allowedCapabilities: sortedSet(input.allowedCapabilities, 'allowedCapabilities', { capability: true }),
    allowedPromptAdapters: sortedSet(input.allowedPromptAdapters, 'allowedPromptAdapters'),
    allowedCortexAdapters: sortedSet(input.allowedCortexAdapters, 'allowedCortexAdapters'),
    allowedGodskillsContracts: sortedSet(input.allowedGodskillsContracts, 'allowedGodskillsContracts'),
    allowedGodskillEntrypoints: sortedSet(input.allowedGodskillEntrypoints, 'allowedGodskillEntrypoints'),
    allowedRealmCapabilities: sortedSet(input.allowedRealmCapabilities, 'allowedRealmCapabilities', { capability: true }),
    maxGodskillsComposition: input.maxGodskillsComposition,
  };
  return deepFreeze(policy);
}

export async function loadCreationPolicy(policyPath, expectedPolicyDigest) {
  if (typeof expectedPolicyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedPolicyDigest)) {
    throw new TypeError('creation policy digest pin is required');
  }
  const input = JSON.parse(await readFile(policyPath, 'utf8'));
  const policy = validateCreationPolicy(input);
  const policyDigest = sha256Value(policy);
  if (policyDigest !== expectedPolicyDigest) throw new TypeError('creation policy digest pin mismatch');
  return Object.freeze({ policy, policyDigest });
}
