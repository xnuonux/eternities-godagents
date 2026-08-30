import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

const sorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function requireVerifiedRelease(release, label) {
  if (!release || !DIGEST.test(release.releaseDigest ?? '')
      || typeof release.pin?.adapterProtocol !== 'string'
      || !Array.isArray(release.manifest?.capabilities)
      || !(release.capabilitiesById instanceof Map)) {
    throw new TypeError(`${label} must be a verified Godskills release`);
  }
  return release;
}

function exactUnchanged(before, after, label) {
  if (!before || !after || canonicalJson(before) !== canonicalJson(after)) {
    throw new Error(`${label} cannot change during an operational dependency migration`);
  }
}

function addedValues(next, previous) {
  const known = new Set(previous ?? []);
  return sorted((next ?? []).filter((value) => !known.has(value)));
}

function capabilityMap(release) {
  return new Map(release.manifest.capabilities.map((row) => [row.id, row]));
}

function isExplicitlyProhibited(capability, policy) {
  const family = capability.family ?? capability.ownerGodskillId;
  return policy.prohibitedCapabilities.includes(capability.id)
    || policy.prohibitedFamilies.includes(family);
}

function effectExpansion(from, to, sharedIds) {
  for (const semantic of Object.keys(to.pin.semanticEffectBindings ?? {})) {
    if (addedValues(to.pin.semanticEffectBindings[semantic], from.pin.semanticEffectBindings?.[semantic]).length > 0) {
      return true;
    }
  }
  const fromMap = capabilityMap(from);
  const toMap = capabilityMap(to);
  return sharedIds.some((id) => addedValues(
    toMap.get(id).effectVocabulary,
    fromMap.get(id).effectVocabulary,
  ).length > 0);
}

function authorityExpansion(from, to, sharedIds) {
  const fromMap = capabilityMap(from);
  const toMap = capabilityMap(to);
  return sharedIds.some((id) => {
    const previous = fromMap.get(id);
    const next = toMap.get(id);
    return next.capabilityDoesNotGrantAuthority !== true
      || addedValues(next.authorityVocabulary, previous.authorityVocabulary).length > 0;
  });
}

export function planGodskillsReleaseMigration({ from, to, genomePolicy, identity } = {}) {
  requireVerifiedRelease(from, 'from');
  requireVerifiedRelease(to, 'to');
  if (from.pin.adapterProtocol !== to.pin.adapterProtocol) {
    throw new Error('Godskills adapter protocol change is not an operational migration');
  }
  exactUnchanged(genomePolicy?.before, genomePolicy?.after, 'genome policy');
  exactUnchanged(identity?.before, identity?.after, 'identity');
  const policy = genomePolicy.before;
  const identityValue = structuredClone(identity.before);
  for (const field of ['genomeDigest', 'genesisId', 'constitutionDigest']) {
    if (!DIGEST.test(identityValue[field] ?? '')) throw new TypeError(`identity ${field} is invalid`);
  }
  if (!/^keel-[a-f0-9]{64}$/.test(identityValue.keelId ?? '') || typeof identityValue.instanceId !== 'string') {
    throw new TypeError('identity descriptor is invalid');
  }
  for (const field of ['preferredFamilies', 'prohibitedFamilies', 'prohibitedCapabilities']) {
    if (!Array.isArray(policy[field])) throw new TypeError(`genome policy ${field} is invalid`);
  }

  const fromMap = capabilityMap(from);
  const toMap = capabilityMap(to);
  const fromIds = sorted(fromMap.keys());
  const toIds = sorted(toMap.keys());
  const addedCapabilityIds = toIds.filter((id) => !fromMap.has(id));
  const removedCapabilityIds = fromIds.filter((id) => !toMap.has(id));
  const sharedIds = fromIds.filter((id) => toMap.has(id));
  const changedContractIds = sharedIds.filter((id) => fromMap.get(id).contract?.sha256 !== toMap.get(id).contract?.sha256);
  const changedEntrypointIds = sharedIds.filter((id) => fromMap.get(id).entrypoint?.sha256 !== toMap.get(id).entrypoint?.sha256);
  if (!Object.hasOwn(genomePolicy, 'requiredCapabilityIds')
      || !Array.isArray(genomePolicy.requiredCapabilityIds)
      || genomePolicy.requiredCapabilityIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new TypeError('required capability ids must be declared for migration');
  }
  const requiredCapabilityIds = sorted(genomePolicy.requiredCapabilityIds);
  if (requiredCapabilityIds.length !== genomePolicy.requiredCapabilityIds.length
      || requiredCapabilityIds.some((id) => !fromMap.has(id))) {
    throw new TypeError('required capability ids are invalid for the current release');
  }
  const removedRequired = requiredCapabilityIds.filter((id) => !toMap.has(id));
  if (removedRequired.length > 0) {
    throw new Error(`Godskills required capability was removed: ${removedRequired.join(', ')}`);
  }

  const evolutionReasons = [];
  if (addedCapabilityIds.some((id) => !isExplicitlyProhibited(toMap.get(id), policy))) evolutionReasons.push('capability');
  if (effectExpansion(from, to, sharedIds)) evolutionReasons.push('effects');
  if (authorityExpansion(from, to, sharedIds)) evolutionReasons.push('authority');
  if (to.pin.maximumSelected > from.pin.maximumSelected || to.pin.maximumSelected > policy.maxComposition) {
    evolutionReasons.push('composition');
  }
  if (to.pin.maximumPackageBytes > from.pin.maximumPackageBytes) evolutionReasons.push('context');

  const unsigned = {
    schemaVersion: 1,
    receiptId: `godskills-release-migration-${to.releaseDigest.slice(0, 16)}`,
    status: evolutionReasons.length === 0
      ? 'compatible-operational-migration'
      : 'governed-evolution-required',
    protocolCompatibility: {
      from: from.pin.adapterProtocol,
      to: to.pin.adapterProtocol,
      compatible: true,
    },
    fromReleaseDigest: from.releaseDigest,
    toReleaseDigest: to.releaseDigest,
    genomePolicyDigest: sha256Value(policy),
    identity: identityValue,
    manifestDelta: {
      addedCapabilityIds,
      removedCapabilityIds,
      changedContractIds,
      changedEntrypointIds,
    },
    selectedContractCompatibility: {
      requiredCapabilityIds,
      allRequiredPresent: true,
      changedRequiredContractIds: changedContractIds.filter((id) => requiredCapabilityIds.includes(id)),
    },
    verificationEvidence: {
      fromVerified: true,
      toVerified: true,
      fromCapabilityCount: fromIds.length,
      toCapabilityCount: toIds.length,
    },
    activationBoundary: 'next-admitted-mission',
    rollbackPin: {
      adapterProtocol: from.pin.adapterProtocol,
      releaseDigest: from.releaseDigest,
    },
    evolutionReasons: sorted(evolutionReasons),
  };
  const receipt = deepFreeze({ ...unsigned, receiptDigest: sha256Text(canonicalJson(unsigned)) });
  assertSchema('godskills-release-migration', receipt);
  return receipt;
}
