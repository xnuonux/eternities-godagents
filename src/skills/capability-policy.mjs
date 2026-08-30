const PROTOCOL_ID = 'eternities-godskills-adapter-v1';

const rowsFrom = (manifest) => Array.isArray(manifest) ? manifest : manifest?.capabilities;

export function compileCapabilityEligibility(policy, manifest) {
  if (policy.protocolId !== PROTOCOL_ID) throw new TypeError('unsupported capability policy protocol');
  if (!['all-rounder', 'specialist'].includes(policy.profile)) throw new TypeError('invalid capability profile');
  if (!Number.isInteger(policy.maxComposition) || policy.maxComposition < 1 || policy.maxComposition > 3) {
    throw new TypeError('maxComposition must be between 1 and 3');
  }

  const rows = rowsFrom(manifest);
  if (!Array.isArray(rows)) throw new TypeError('manifest capabilities are required');
  const byId = new Map(rows.map((row) => [row.id, row]));
  const familyOf = (row) => row.family ?? row.ownerGodskillId;
  const families = new Set(rows.map(familyOf));
  const ensureUnique = (values, label) => {
    if (new Set(values).size !== values.length) throw new TypeError(`duplicate ${label}`);
  };
  ensureUnique(policy.preferredFamilies, 'preferred family');
  ensureUnique(policy.prohibitedFamilies, 'prohibited family');
  ensureUnique(policy.prohibitedCapabilities, 'prohibited capability');
  for (const family of [...policy.preferredFamilies, ...policy.prohibitedFamilies]) {
    if (!families.has(family)) throw new TypeError(`unknown family: ${family}`);
  }
  for (const id of policy.prohibitedCapabilities) {
    if (!byId.has(id)) throw new TypeError(`unknown capability: ${id}`);
  }

  const prohibited = rows.filter((row) => policy.prohibitedFamilies.includes(familyOf(row))
    || policy.prohibitedCapabilities.includes(row.id)).map((row) => row.id);
  const eligibleIds = rows.filter((row) => !prohibited.includes(row.id)).map((row) => row.id).sort();
  const preferredIds = eligibleIds.filter((id) => policy.preferredFamilies.includes(familyOf(byId.get(id))));
  return Object.freeze({
    eligibleIds: Object.freeze(eligibleIds),
    preferredIds: Object.freeze(preferredIds),
    prohibitedIds: Object.freeze(prohibited.sort()),
    maxComposition: policy.maxComposition,
  });
}
