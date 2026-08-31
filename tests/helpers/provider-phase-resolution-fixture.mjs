import { createPrivateKey, sign } from 'node:crypto';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';

export const providerResolutionPublicKeySpki = 'MCowBQYDK2VwAyEAnWaL/39HoXXKbeBHHJTiW0nvAUPY6/icoRu6zaU3xHo=';
const providerResolutionPrivateKeyPkcs8 = 'MC4CAQAwBQYDK2VwBCIEIPKRSJQwF0v/2CpVxQCRpkQyCxmBIn9KaLXFs8NndObN';

export function validProviderPhaseResolutionPolicy({
  transportPolicyDigest = '1'.repeat(64),
  maximumAdoptedResponseBytes = 1_048_576,
} = {}) {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-provider-phase-resolution-policy-v1',
    policyId: 'provider-phase-resolution-fixture-v1',
    transportPolicyDigest,
    authority: {
      algorithm: 'Ed25519',
      keyId: 'fixture-provider-resolution-authority-v1',
      publicKeySpki: providerResolutionPublicKeySpki,
    },
    maximumDecisionLifetimeMs: 300_000,
    maximumAdoptedResponseBytes,
  };
}

export function unsignedProviderResolutionDecision({
  policyDigest = '2'.repeat(64),
  phase = 'native',
  dispatchDigest = '3'.repeat(64),
  requestDigest = '4'.repeat(64),
  attemptId = '5'.repeat(64),
  disposition = 'abandon',
  responseWitnessDigest = null,
  issuedAt = '2026-08-31T20:00:00.000Z',
  expiresAt = '2026-08-31T20:05:00.000Z',
  nonce = 'fixture-provider-resolution-001',
} = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-provider-phase-resolution-decision-v1',
    policyDigest,
    keyId: 'fixture-provider-resolution-authority-v1',
    phase,
    dispatchDigest,
    requestDigest,
    attemptId,
    disposition,
    responseWitnessDigest,
    issuedAt,
    expiresAt,
    nonce,
  };
  return { ...unsigned, decisionDigest: sha256Value(unsigned) };
}

export function signProviderResolutionDecision(decision) {
  const privateKey = createPrivateKey({
    key: Buffer.from(providerResolutionPrivateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return {
    decision: structuredClone(decision),
    signature: sign(null, Buffer.from(canonicalJson(decision), 'utf8'), privateKey).toString('base64'),
  };
}
