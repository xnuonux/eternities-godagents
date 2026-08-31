import { createPublicKey, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PHASES = new Set(['native', 'review', 'revision']);
const DISPOSITIONS = new Set(['adopt-response', 'abandon']);
const PIN_VARIABLE = 'GODAGENT_PHASE_RESOLUTION_POLICY_SHA256';
const DECISION_PROTOCOL = 'eternities-openai-compatible-phase-resolution-decision-v1';
const RESPONSE_WITNESS_PROTOCOL = 'eternities-openai-compatible-phase-response-witness-v1';

const MESSAGES = Object.freeze({
  'policy-integrity': 'OpenAI-compatible phase resolution policy integrity failed',
  'policy-invalid': 'OpenAI-compatible phase resolution policy is invalid',
  'decision-invalid': 'OpenAI-compatible phase resolution decision is invalid',
});

export class OpenAICompatiblePhaseResolutionError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('phase resolution error code is invalid');
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'OpenAICompatiblePhaseResolutionError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new OpenAICompatiblePhaseResolutionError(code, cause);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('decision-invalid');
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('decision-invalid');
  }
}

function canonicalBase64(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length > 0 && bytes.toString('base64') === value ? bytes : null;
}

function exactIso(value) {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
}

function pinnedDigest(env) {
  const value = env?.[PIN_VARIABLE];
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function sameDigest(left, right) {
  return DIGEST.test(left) && DIGEST.test(right)
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function verifyOpenAICompatiblePhaseResponseWitness(value) {
  try {
    exactKeys(value, [
      'schemaVersion', 'protocolId', 'status', 'contentType', 'bodyBytes',
      'bodySha256', 'witnessDigest',
    ]);
    const { witnessDigest, ...unsigned } = value;
    if (value.schemaVersion !== 1 || value.protocolId !== RESPONSE_WITNESS_PROTOCOL
        || !Number.isInteger(value.status) || value.status < 100 || value.status > 599
        || (value.contentType !== null
          && (typeof value.contentType !== 'string' || value.contentType.length > 256
            || /[\0\r\n]/.test(value.contentType)))
        || !Number.isInteger(value.bodyBytes) || value.bodyBytes < 0
        || !DIGEST.test(value.bodySha256) || !DIGEST.test(witnessDigest)
        || witnessDigest !== sha256Value(unsigned)) {
      fail('decision-invalid');
    }
    return deepFreeze(structuredClone(value));
  } catch (error) {
    if (error instanceof OpenAICompatiblePhaseResolutionError) throw error;
    fail('decision-invalid', error);
  }
}

export function buildOpenAICompatiblePhaseResponseWitness(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)
      || !Number.isInteger(response.status) || response.status < 100 || response.status > 599
      || typeof response.bodyText !== 'string') {
    fail('decision-invalid');
  }
  const rawContentType = response.headers?.['content-type'];
  if (rawContentType !== undefined && rawContentType !== null && typeof rawContentType !== 'string') {
    fail('decision-invalid');
  }
  const contentType = typeof rawContentType === 'string' && rawContentType.trim().length > 0
    ? rawContentType.trim().toLowerCase()
    : null;
  const unsigned = {
    schemaVersion: 1,
    protocolId: RESPONSE_WITNESS_PROTOCOL,
    status: response.status,
    contentType,
    bodyBytes: Buffer.byteLength(response.bodyText, 'utf8'),
    bodySha256: sha256Text(response.bodyText),
  };
  return verifyOpenAICompatiblePhaseResponseWitness({
    ...unsigned,
    witnessDigest: sha256Value(unsigned),
  });
}

export async function loadOpenAICompatiblePhaseResolutionPolicy({
  path,
  env,
  transportPolicyDigest,
  maximumProviderResponseBytes,
} = {}) {
  if (typeof path !== 'string' || path.length === 0 || /[\0\r\n]/.test(path)) fail('policy-integrity');
  let text;
  let policy;
  try {
    text = await readFile(path, 'utf8');
    policy = JSON.parse(text);
  } catch (error) {
    fail('policy-integrity', error);
  }
  if (text !== `${canonicalJson(policy)}\n`) fail('policy-integrity');
  const digest = sha256Text(canonicalJson(policy));
  if (!sameDigest(pinnedDigest(env), digest)) fail('policy-integrity');

  let publicKey;
  try {
    assertSchema('openai-compatible-phase-resolution-policy', policy);
    if (!IDENTIFIER.test(policy.policyId)
        || !DIGEST.test(transportPolicyDigest)
        || !sameDigest(policy.transportPolicyDigest, transportPolicyDigest)
        || !Number.isInteger(maximumProviderResponseBytes)
        || maximumProviderResponseBytes < 256
        || policy.maximumAdoptedResponseBytes > maximumProviderResponseBytes
        || !IDENTIFIER.test(policy.authority.keyId)) {
      throw new Error('resolution policy semantic mismatch');
    }
    const keyBytes = canonicalBase64(policy.authority.publicKeySpki);
    if (!keyBytes) throw new Error('resolution policy key encoding is invalid');
    publicKey = createPublicKey({ key: keyBytes, format: 'der', type: 'spki' });
    if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('resolution policy key type is invalid');
  } catch (error) {
    fail('policy-invalid', error);
  }
  return Object.freeze({ policy: deepFreeze(policy), digest, publicKey });
}

export function verifyOpenAICompatiblePhaseResolutionDecision({
  signedDecision,
  loadedPolicy,
  operation,
  responseDigest,
  now = Date.now(),
} = {}) {
  try {
    exactKeys(signedDecision, ['decision', 'signature']);
    exactKeys(signedDecision.decision, [
      'schemaVersion', 'protocolId', 'policyDigest', 'keyId', 'phase',
      'dispatchDigest', 'requestDigest', 'attemptId', 'disposition',
      'responseDigest', 'issuedAt', 'expiresAt', 'nonce', 'decisionDigest',
    ]);
    if (!loadedPolicy || typeof loadedPolicy !== 'object'
        || !loadedPolicy.policy || !DIGEST.test(loadedPolicy.digest)
        || loadedPolicy.publicKey?.asymmetricKeyType !== 'ed25519') fail('decision-invalid');
    exactKeys(operation, ['phase', 'dispatchDigest', 'requestDigest', 'attemptId']);
    const decision = signedDecision.decision;
    const { decisionDigest, ...unsigned } = decision;
    const issuedAt = exactIso(decision.issuedAt);
    const expiresAt = exactIso(decision.expiresAt);
    const signature = canonicalBase64(signedDecision.signature);
    if (decision.schemaVersion !== 1 || decision.protocolId !== DECISION_PROTOCOL
        || !sameDigest(decision.policyDigest, loadedPolicy.digest)
        || decision.keyId !== loadedPolicy.policy.authority.keyId
        || !PHASES.has(decision.phase) || !DISPOSITIONS.has(decision.disposition)
        || !DIGEST.test(decision.dispatchDigest) || !DIGEST.test(decision.requestDigest)
        || !DIGEST.test(decision.attemptId) || !DIGEST.test(decisionDigest)
        || decisionDigest !== sha256Value(unsigned)
        || !NONCE.test(decision.nonce)
        || issuedAt === null || expiresAt === null || expiresAt <= issuedAt
        || expiresAt - issuedAt > loadedPolicy.policy.maximumDecisionLifetimeMs
        || !Number.isFinite(now) || now < issuedAt || now > expiresAt
        || decision.phase !== operation.phase
        || decision.dispatchDigest !== operation.dispatchDigest
        || decision.requestDigest !== operation.requestDigest
        || decision.attemptId !== operation.attemptId
        || (decision.disposition === 'adopt-response'
          ? !sameDigest(decision.responseDigest, responseDigest)
          : decision.responseDigest !== null || responseDigest !== null)
        || !signature || signature.length !== 64
        || !verifySignature(
          null,
          Buffer.from(canonicalJson(decision), 'utf8'),
          loadedPolicy.publicKey,
          signature,
        )) {
      fail('decision-invalid');
    }
    return deepFreeze({
      decision: structuredClone(decision),
      signature: signedDecision.signature,
    });
  } catch (error) {
    if (error instanceof OpenAICompatiblePhaseResolutionError) throw error;
    fail('decision-invalid', error);
  }
}
