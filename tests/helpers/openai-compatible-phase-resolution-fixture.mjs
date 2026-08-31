import { createPrivateKey, sign } from 'node:crypto';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';

export const resolutionPublicKeySpki = 'MCowBQYDK2VwAyEAnWaL/39HoXXKbeBHHJTiW0nvAUPY6/icoRu6zaU3xHo=';
const resolutionPrivateKeyPkcs8 = 'MC4CAQAwBQYDK2VwBCIEIPKRSJQwF0v/2CpVxQCRpkQyCxmBIn9KaLXFs8NndObN';

export function validOpenAICompatiblePhaseResolutionPolicy({
  transportPolicyDigest = '1'.repeat(64),
} = {}) {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-openai-compatible-phase-resolution-policy-v1',
    policyId: 'openai-compatible-phase-resolution-fixture-v1',
    transportPolicyDigest,
    authority: {
      algorithm: 'Ed25519',
      keyId: 'fixture-resolution-authority-v1',
      publicKeySpki: resolutionPublicKeySpki,
    },
    maximumDecisionLifetimeMs: 300_000,
    maximumAdoptedResponseBytes: 1_048_576,
  };
}

export function unsignedResolutionDecision({
  policyDigest = '2'.repeat(64),
  phase = 'native',
  dispatchDigest = '3'.repeat(64),
  requestDigest = '4'.repeat(64),
  attemptId = '5'.repeat(64),
  disposition = 'abandon',
  responseDigest = null,
  issuedAt = '2026-08-31T20:00:00.000Z',
  expiresAt = '2026-08-31T20:05:00.000Z',
  nonce = 'fixture-resolution-decision-001',
} = {}) {
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-openai-compatible-phase-resolution-decision-v1',
    policyDigest,
    keyId: 'fixture-resolution-authority-v1',
    phase,
    dispatchDigest,
    requestDigest,
    attemptId,
    disposition,
    responseDigest,
    issuedAt,
    expiresAt,
    nonce,
  };
  return { ...unsigned, decisionDigest: sha256Value(unsigned) };
}

export function signResolutionDecision(decision) {
  const privateKey = createPrivateKey({
    key: Buffer.from(resolutionPrivateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return {
    decision: structuredClone(decision),
    signature: sign(null, Buffer.from(canonicalJson(decision), 'utf8'), privateKey).toString('base64'),
  };
}
