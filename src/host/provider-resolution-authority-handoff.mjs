import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';
import { verifyOpenAICompatiblePhaseResponseWitness } from '../transports/openai-compatible-phase-resolution.mjs';
import { verifyProviderPhaseResponseWitness } from '../transports/provider-phase-resolution.mjs';
import { verifyProviderPhaseHostDescription } from './provider-phase-host-sdk.mjs';
import { prepareProviderPhaseResolutionDecision } from './provider-phase-resolution-decision-preparer.mjs';

const REQUEST_PROTOCOL = 'eternities-provider-resolution-authority-signing-request-v1';
const RETURN_PROTOCOL = 'eternities-provider-resolution-authority-signed-return-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WITNESS_VERIFIERS = Object.freeze({
  'openai-compatible-chat-completions-v1': verifyOpenAICompatiblePhaseResponseWitness,
  'anthropic-messages-v1': verifyProviderPhaseResponseWitness,
});

export class ProviderResolutionAuthorityHandoffError extends Error {
  constructor(cause) {
    super('Provider resolution authority handoff is invalid',
      cause === undefined ? undefined : { cause });
    this.name = 'ProviderResolutionAuthorityHandoffError';
    this.code = 'handoff-invalid';
  }
}

function fail(cause) {
  throw new ProviderResolutionAuthorityHandoffError(cause);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function exactIso(value) {
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
}

function canonicalSignature(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length === 64 && bytes.toString('base64') === value ? value : null;
}

function verifyContext({ hostDescription, controller, inspected }) {
  const description = verifyProviderPhaseHostDescription(hostDescription);
  exactKeys(controller, ['policyDigest', 'authorityKeyId'], 'controller metadata');
  if (!DIGEST.test(controller.policyDigest) || !IDENTIFIER.test(controller.authorityKeyId)) {
    throw new TypeError('controller metadata is invalid');
  }
  exactKeys(inspected, ['status', 'operation', 'resolutionAccepted'], 'inspection');
  exactKeys(inspected.operation, [
    'phase', 'dispatchDigest', 'requestDigest', 'attemptId',
  ], 'operation');
  if (inspected.status !== 'pending' || inspected.resolutionAccepted !== false
      || !description.capabilities.phases.includes(inspected.operation.phase)
      || !DIGEST.test(inspected.operation.dispatchDigest)
      || !DIGEST.test(inspected.operation.requestDigest)
      || !DIGEST.test(inspected.operation.attemptId)) {
    throw new TypeError('inspection is invalid');
  }
  return { description, profile: description.capabilities.resolutionProfile };
}

function verifyDecision(decision, { profile, controller, operation, responseWitness }) {
  const witnessField = profile.responseWitnessDigestField;
  exactKeys(decision, [
    'schemaVersion', 'protocolId', 'policyDigest', 'keyId', 'phase',
    'dispatchDigest', 'requestDigest', 'attemptId', 'disposition', witnessField,
    'issuedAt', 'expiresAt', 'nonce', 'decisionDigest',
  ], 'resolution decision');
  const { decisionDigest, ...unsigned } = decision;
  const issuedAt = exactIso(decision.issuedAt);
  const expiresAt = exactIso(decision.expiresAt);
  if (decision.schemaVersion !== 1 || decision.protocolId !== profile.decisionProtocolId
      || decision.policyDigest !== controller.policyDigest
      || decision.keyId !== controller.authorityKeyId
      || decision.phase !== operation.phase
      || decision.dispatchDigest !== operation.dispatchDigest
      || decision.requestDigest !== operation.requestDigest
      || decision.attemptId !== operation.attemptId
      || !profile.dispositions.includes(decision.disposition)
      || issuedAt === null || expiresAt === null || expiresAt <= issuedAt
      || !NONCE.test(decision.nonce) || !DIGEST.test(decisionDigest)
      || decisionDigest !== sha256Value(unsigned)) {
    throw new TypeError('resolution decision binding is invalid');
  }
  if (decision.disposition === 'adopt-response') {
    if (!responseWitness || decision[witnessField] !== responseWitness.witnessDigest) {
      throw new TypeError('response witness binding is invalid');
    }
  } else if (responseWitness !== null || decision[witnessField] !== null) {
    throw new TypeError('abandonment witness binding is invalid');
  }
}

function verifyRequest(request, context) {
  const { description, profile } = verifyContext(context);
  exactKeys(request, [
    'schemaVersion', 'protocolId', 'status', 'family', 'hostDescriptionDigest',
    'transportPolicyDigest', 'resolutionPolicyDigest', 'authorityKeyId',
    'operation', 'decision', 'responseWitness', 'signingPayload',
    'signingPayloadEncoding', 'signingPayloadSha256', 'signatureAlgorithm',
    'requestDigest',
  ], 'signing request');
  const { requestDigest, ...unsigned } = request;
  if (request.schemaVersion !== 1 || request.protocolId !== REQUEST_PROTOCOL
      || request.status !== 'awaiting-signature' || request.family !== description.family
      || request.hostDescriptionDigest !== description.descriptionDigest
      || request.transportPolicyDigest !== description.policyDigest
      || request.resolutionPolicyDigest !== context.controller.policyDigest
      || request.authorityKeyId !== context.controller.authorityKeyId
      || request.signatureAlgorithm !== 'Ed25519'
      || request.signingPayloadEncoding !== 'utf-8'
      || !same(request.operation, context.inspected.operation)
      || typeof request.signingPayload !== 'string'
      || request.signingPayload !== canonicalJson(request.decision)
      || !DIGEST.test(request.signingPayloadSha256)
      || request.signingPayloadSha256 !== sha256Text(request.signingPayload)
      || !DIGEST.test(requestDigest) || requestDigest !== sha256Value(unsigned)) {
    throw new TypeError('signing request binding is invalid');
  }
  let responseWitness = null;
  if (request.responseWitness !== null) {
    responseWitness = WITNESS_VERIFIERS[description.family](request.responseWitness);
    if (responseWitness.protocolId !== profile.responseWitnessProtocolId) {
      throw new TypeError('response witness protocol is invalid');
    }
  }
  verifyDecision(request.decision, {
    profile,
    controller: context.controller,
    operation: context.inspected.operation,
    responseWitness,
  });
  return deepFreeze(structuredClone(request));
}

export function buildProviderResolutionAuthoritySigningRequest(options = {}) {
  try {
    const prepared = prepareProviderPhaseResolutionDecision(options);
    const { description } = verifyContext(options);
    const unsigned = {
      schemaVersion: 1,
      protocolId: REQUEST_PROTOCOL,
      status: 'awaiting-signature',
      family: description.family,
      hostDescriptionDigest: description.descriptionDigest,
      transportPolicyDigest: description.policyDigest,
      resolutionPolicyDigest: options.controller.policyDigest,
      authorityKeyId: options.controller.authorityKeyId,
      operation: structuredClone(options.inspected.operation),
      decision: structuredClone(prepared.decision),
      responseWitness: prepared.responseWitness === null
        ? null
        : structuredClone(prepared.responseWitness),
      signingPayload: prepared.signingPayload,
      signingPayloadEncoding: 'utf-8',
      signingPayloadSha256: sha256Text(prepared.signingPayload),
      signatureAlgorithm: 'Ed25519',
    };
    return verifyRequest({ ...unsigned, requestDigest: sha256Value(unsigned) }, options);
  } catch (error) {
    if (error instanceof ProviderResolutionAuthorityHandoffError) throw error;
    fail(error);
  }
}

export function verifyProviderResolutionAuthoritySigningRequest(options = {}) {
  try {
    exactKeys(options, [
      'request', 'hostDescription', 'controller', 'inspected',
    ], 'signing request verification');
    return verifyRequest(options.request, options);
  } catch (error) {
    if (error instanceof ProviderResolutionAuthorityHandoffError) throw error;
    fail(error);
  }
}

export function bindProviderResolutionAuthoritySignature(options = {}) {
  try {
    exactKeys(options, [
      'request', 'hostDescription', 'controller', 'inspected', 'signature',
    ], 'signature binding');
    const request = verifyRequest(options.request, options);
    const signature = canonicalSignature(options.signature);
    if (!signature) throw new TypeError('authority signature encoding is invalid');
    const unsigned = {
      schemaVersion: 1,
      protocolId: RETURN_PROTOCOL,
      status: 'signed',
      cryptographicStatus: 'unverified',
      family: request.family,
      signatureAlgorithm: request.signatureAlgorithm,
      requestDigest: request.requestDigest,
      signedDecision: {
        decision: structuredClone(request.decision),
        signature,
      },
      responseWitness: request.responseWitness === null
        ? null
        : structuredClone(request.responseWitness),
    };
    return verifyProviderResolutionAuthoritySignedReturn({
      value: { ...unsigned, envelopeDigest: sha256Value(unsigned) },
      request,
      hostDescription: options.hostDescription,
      controller: options.controller,
      inspected: options.inspected,
    });
  } catch (error) {
    if (error instanceof ProviderResolutionAuthorityHandoffError) throw error;
    fail(error);
  }
}

export function verifyProviderResolutionAuthoritySignedReturn(options = {}) {
  try {
    exactKeys(options, [
      'value', 'request', 'hostDescription', 'controller', 'inspected',
    ], 'signed return verification');
    const request = verifyRequest(options.request, options);
    const value = options.value;
    exactKeys(value, [
      'schemaVersion', 'protocolId', 'status', 'family', 'requestDigest',
      'signatureAlgorithm', 'cryptographicStatus', 'signedDecision',
      'responseWitness', 'envelopeDigest',
    ], 'signed return');
    exactKeys(value.signedDecision, ['decision', 'signature'], 'signed decision');
    const { envelopeDigest, ...unsigned } = value;
    if (value.schemaVersion !== 1 || value.protocolId !== RETURN_PROTOCOL
        || value.status !== 'signed' || value.family !== request.family
        || value.signatureAlgorithm !== 'Ed25519'
        || value.cryptographicStatus !== 'unverified'
        || value.requestDigest !== request.requestDigest
        || !same(value.signedDecision.decision, request.decision)
        || !canonicalSignature(value.signedDecision.signature)
        || !same(value.responseWitness, request.responseWitness)
        || !DIGEST.test(envelopeDigest) || envelopeDigest !== sha256Value(unsigned)) {
      throw new TypeError('signed return binding is invalid');
    }
    return deepFreeze(structuredClone(value));
  } catch (error) {
    if (error instanceof ProviderResolutionAuthorityHandoffError) throw error;
    fail(error);
  }
}
