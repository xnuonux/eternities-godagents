import assert from 'node:assert/strict';
import test from 'node:test';

import { digestHostProfile, validateHostProfile } from '../src/host-profile.mjs';

const valid = (overrides = {}) => ({
  schemaVersion: 1,
  profileId: 'host:codex@1',
  hostKind: 'codex',
  adapterId: 'codex-session-v1',
  capsuleProtocol: 'godagent-host-capsule-v1',
  requiredAuthorityAttestation: 'host-envelope-v1',
  maxPackageBytes: 16000,
  supportsRecoveryStatus: true,
  globalInstructionMutation: false,
  ...overrides,
});

test('accepts and deeply freezes each exact supported host profile', () => {
  for (const [hostKind, adapterId] of [['codex', 'codex-session-v1'], ['claude-code', 'claude-code-session-v1'], ['lunari', 'lunari-session-v1']]) {
    const profile = validateHostProfile(valid({ profileId: `host:${hostKind}@1`, hostKind, adapterId }));
    assert.equal(profile.hostKind, hostKind);
    assert.equal(Object.isFrozen(profile), true);
  }
});

test('rejects unknown fields and executable or authority-shaped configuration', () => {
  for (const extra of [{ command: 'codex' }, { executablePath: 'C:/tool.exe' }, { credentialEnv: 'TOKEN' }, { authority: ['write'] }, { unexpected: true }]) {
    assert.throws(() => validateHostProfile({ ...valid(), ...extra }), /unknown|closed|field/i);
  }
});

test('rejects mismatched profile host and adapter identities', () => {
  assert.throws(() => validateHostProfile(valid({ profileId: 'host:lunari@1' })), /profile|host/i);
  assert.throws(() => validateHostProfile(valid({ adapterId: 'lunari-session-v1' })), /adapter|host/i);
  assert.throws(() => validateHostProfile(valid({ hostKind: 'unknown' })), /host/i);
});

test('requires the exact protocols and forbids global instruction mutation', () => {
  assert.throws(() => validateHostProfile(valid({ schemaVersion: 2 })), /schema/i);
  assert.throws(() => validateHostProfile(valid({ capsuleProtocol: 'other' })), /capsule|protocol/i);
  assert.throws(() => validateHostProfile(valid({ requiredAuthorityAttestation: 'caller-claim-v1' })), /authority|attestation/i);
  assert.throws(() => validateHostProfile(valid({ globalInstructionMutation: true })), /global|mutation/i);
});

test('bounds package bytes and requires a boolean recovery declaration', () => {
  for (const value of [0, -1, 65537, 1.5, '16000']) assert.throws(() => validateHostProfile(valid({ maxPackageBytes: value })), /package|bytes/i);
  assert.throws(() => validateHostProfile(valid({ supportsRecoveryStatus: 'yes' })), /recovery|boolean/i);
});

test('returns a canonical sha256 digest independent of key insertion order', () => {
  const profile = valid();
  const reversed = Object.fromEntries(Object.entries(profile).reverse());
  assert.match(digestHostProfile(profile), /^[a-f0-9]{64}$/);
  assert.equal(digestHostProfile(profile), digestHostProfile(reversed));
});

test('digest validation rejects invalid profiles rather than hashing them', () => {
  assert.throws(() => digestHostProfile({ ...valid(), command: 'unsafe' }), /unknown|closed|field/i);
});
