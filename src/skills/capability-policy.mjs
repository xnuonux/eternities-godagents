import { evaluateGodagentProfile } from '../agent/profile.mjs';

const PROTOCOL_ID = 'eternities-godskills-adapter-v1';

const rowsFrom = (manifest) => Array.isArray(manifest) ? manifest : manifest?.capabilities;

export function compileCapabilityEligibility(policy, manifest) {
  if (policy.protocolId !== PROTOCOL_ID) throw new TypeError('unsupported capability policy protocol');
  const rows = rowsFrom(manifest);
  if (!Array.isArray(rows)) throw new TypeError('manifest capabilities are required');
  const familyOf = (row) => row.family ?? row.ownerGodskillId;
  const result = evaluateGodagentProfile({
    profile: policy.profile,
    preferredFamilies: policy.preferredFamilies,
    prohibitedFamilies: policy.prohibitedFamilies,
    prohibitedCapabilities: policy.prohibitedCapabilities,
    maxComposition: policy.maxComposition,
  }, rows.map((row) => ({ id: row.id, family: familyOf(row) })));
  return Object.freeze({
    eligibleIds: result.eligibleIds,
    preferredIds: result.preferredIds,
    prohibitedIds: result.prohibitedIds,
    maxComposition: result.maxComposition,
  });
}
