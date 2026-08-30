import { createHash } from 'node:crypto';

const MAX_PACKAGE_BYTES = 65_536;
const PROFILE_IDENTITIES = new Map([
  ['codex', { profileId: 'host:codex@1', adapterId: 'codex-session-v1' }],
  ['claude-code', { profileId: 'host:claude-code@1', adapterId: 'claude-code-session-v1' }],
  ['lunari', { profileId: 'host:lunari@1', adapterId: 'lunari-session-v1' }],
]);
const REQUIRED_FIELDS = [
  'schemaVersion',
  'profileId',
  'hostKind',
  'adapterId',
  'capsuleProtocol',
  'requiredAuthorityAttestation',
  'maxPackageBytes',
  'supportsRecoveryStatus',
  'globalInstructionMutation',
];
const ALLOWED_FIELDS = new Set(REQUIRED_FIELDS);

function fail(message) {
  throw new Error(`Invalid HostProfileV1: ${message}`);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function validateHostProfile(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    fail('profile must be an object');
  }

  for (const field of Object.keys(candidate)) {
    if (!ALLOWED_FIELDS.has(field)) fail(`unknown field: ${field}`);
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(candidate, field)) fail(`required field missing: ${field}`);
  }

  if (candidate.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (candidate.capsuleProtocol !== 'godagent-host-capsule-v1') {
    fail('capsule protocol is invalid');
  }
  if (candidate.requiredAuthorityAttestation !== 'host-envelope-v1') {
    fail('authority attestation is invalid');
  }
  if (candidate.globalInstructionMutation !== false) {
    fail('global instruction mutation must be false');
  }
  if (typeof candidate.supportsRecoveryStatus !== 'boolean') {
    fail('recovery status must be boolean');
  }
  if (!Number.isInteger(candidate.maxPackageBytes)
    || candidate.maxPackageBytes < 1
    || candidate.maxPackageBytes > MAX_PACKAGE_BYTES) {
    fail(`package bytes must be an integer from 1 to ${MAX_PACKAGE_BYTES}`);
  }

  const identity = PROFILE_IDENTITIES.get(candidate.hostKind);
  if (!identity) fail('host kind is invalid');
  if (candidate.profileId !== identity.profileId) fail('profile identity does not match host');
  if (candidate.adapterId !== identity.adapterId) fail('adapter identity does not match host');

  return deepFreeze(Object.fromEntries(
    REQUIRED_FIELDS.map((field) => [field, candidate[field]]),
  ));
}

export function digestHostProfile(candidate) {
  const profile = validateHostProfile(candidate);
  const canonicalJson = JSON.stringify(canonicalize(profile));
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
