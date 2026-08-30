import { createHash } from 'node:crypto';

const PROFILE_FIELDS = Object.freeze([
  'schemaVersion',
  'profileId',
  'hostKind',
  'adapterId',
  'capsuleProtocol',
  'requiredAuthorityAttestation',
  'maxPackageBytes',
  'supportsRecoveryStatus',
  'globalInstructionMutation',
]);

const HOST_ADAPTERS = Object.freeze({
  codex: 'codex-session-v1',
  'claude-code': 'claude-code-session-v1',
  lunari: 'lunari-session-v1',
});

function fail(message) {
  throw new Error(`HostProfileV1 ${message}`);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

export function validateHostProfile(profile) {
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) {
    fail('must be an object');
  }

  const prototype = Object.getPrototypeOf(profile);
  if (prototype !== Object.prototype && prototype !== null) fail('must be a plain object');

  for (const key of Reflect.ownKeys(profile)) {
    if (typeof key !== 'string' || !PROFILE_FIELDS.includes(key)) {
      fail(`has unknown closed-schema field: ${String(key)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(profile, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail(`field must be an enumerable data value: ${key}`);
    }
  }
  for (const field of PROFILE_FIELDS) {
    if (!Object.hasOwn(profile, field)) fail(`is missing required field: ${field}`);
  }

  const values = Object.fromEntries(PROFILE_FIELDS.map((field) => [
    field,
    Object.getOwnPropertyDescriptor(profile, field).value,
  ]));

  if (values.schemaVersion !== 1) fail('has unsupported schema version');
  if (!Object.hasOwn(HOST_ADAPTERS, values.hostKind)) fail('has unsupported host kind');
  if (values.profileId !== `host:${values.hostKind}@1`) fail('profile identity does not match host kind');
  if (values.adapterId !== HOST_ADAPTERS[values.hostKind]) fail('adapter identity does not match host kind');
  if (values.capsuleProtocol !== 'godagent-host-capsule-v1') fail('has unsupported capsule protocol');
  if (values.requiredAuthorityAttestation !== 'host-envelope-v1') fail('has unsupported authority attestation');
  if (!Number.isInteger(values.maxPackageBytes) || values.maxPackageBytes < 1 || values.maxPackageBytes > 65536) {
    fail('has invalid package byte limit');
  }
  if (typeof values.supportsRecoveryStatus !== 'boolean') fail('recovery declaration must be boolean');
  if (values.globalInstructionMutation !== false) fail('forbids global instruction mutation');

  return deepFreeze({
    schemaVersion: values.schemaVersion,
    profileId: values.profileId,
    hostKind: values.hostKind,
    adapterId: values.adapterId,
    capsuleProtocol: values.capsuleProtocol,
    requiredAuthorityAttestation: values.requiredAuthorityAttestation,
    maxPackageBytes: values.maxPackageBytes,
    supportsRecoveryStatus: values.supportsRecoveryStatus,
    globalInstructionMutation: values.globalInstructionMutation,
  });
}

export function digestHostProfile(profile) {
  const canonicalProfile = validateHostProfile(profile);
  return createHash('sha256').update(JSON.stringify(canonicalProfile)).digest('hex');
}
