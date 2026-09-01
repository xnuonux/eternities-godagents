import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { buildOpenAICompatiblePhaseResponseWitness } from '../transports/openai-compatible-phase-resolution.mjs';
import { buildProviderPhaseResponseWitness } from '../transports/provider-phase-resolution.mjs';
import { verifyProviderPhaseHostDescription } from './provider-phase-host-sdk.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INPUT_FIELDS = new Set([
  'hostDescription', 'controller', 'inspected', 'disposition', 'response',
  'issuedAt', 'expiresAt', 'nonce',
]);
const REQUIRED_INPUT_FIELDS = Object.freeze([
  'hostDescription', 'controller', 'inspected', 'disposition',
  'issuedAt', 'expiresAt', 'nonce',
]);
const FAMILY_WITNESS_BUILDERS = Object.freeze({
  'openai-compatible-chat-completions-v1': buildOpenAICompatiblePhaseResponseWitness,
  'anthropic-messages-v1': buildProviderPhaseResponseWitness,
});

export class ProviderPhaseResolutionDecisionPreparationError extends Error {
  constructor(cause) {
    super('Provider phase resolution decision preparation is invalid',
      cause === undefined ? undefined : { cause });
    this.name = 'ProviderPhaseResolutionDecisionPreparationError';
    this.code = 'preparation-invalid';
  }
}

function fail(cause) {
  throw new ProviderPhaseResolutionDecisionPreparationError(cause);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} fields are invalid`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} fields are invalid`);
  }
}

function exactInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('preparation input is invalid');
  }
  const keys = Object.keys(value);
  if (keys.some((key) => !INPUT_FIELDS.has(key))
      || REQUIRED_INPUT_FIELDS.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError('preparation input fields are invalid');
  }
}

function exactIso(value) {
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
}

function responseForWitness(value) {
  exactKeys(value, ['status', 'headers', 'bodyText'], 'provider response');
  if (!value.headers || typeof value.headers !== 'object' || Array.isArray(value.headers)) {
    throw new TypeError('provider response headers are invalid');
  }
  const headerKeys = Object.keys(value.headers);
  if (headerKeys.some((key) => key !== 'content-type')) {
    throw new TypeError('provider response headers are invalid');
  }
  return structuredClone(value);
}

export function prepareProviderPhaseResolutionDecision(options = {}) {
  try {
    exactInput(options);
    const description = verifyProviderPhaseHostDescription(options.hostDescription);
    const profile = description.capabilities.resolutionProfile;

    exactKeys(options.controller, ['policyDigest', 'authorityKeyId'], 'controller metadata');
    if (!DIGEST.test(options.controller.policyDigest)
        || !IDENTIFIER.test(options.controller.authorityKeyId)) {
      throw new TypeError('controller metadata identity is invalid');
    }

    exactKeys(options.inspected, ['status', 'operation', 'resolutionAccepted'], 'inspection');
    exactKeys(
      options.inspected.operation,
      ['phase', 'dispatchDigest', 'requestDigest', 'attemptId'],
      'inspected operation',
    );
    const operation = options.inspected.operation;
    if (options.inspected.status !== 'pending' || options.inspected.resolutionAccepted !== false
        || !description.capabilities.phases.includes(operation.phase)
        || !DIGEST.test(operation.dispatchDigest) || !DIGEST.test(operation.requestDigest)
        || !DIGEST.test(operation.attemptId)) {
      throw new TypeError('inspected operation is invalid');
    }

    if (!profile.dispositions.includes(options.disposition)) {
      throw new TypeError('resolution disposition is invalid');
    }
    const hasResponse = Object.hasOwn(options, 'response');
    if ((options.disposition === 'adopt-response') !== hasResponse) {
      throw new TypeError('resolution response binding is invalid');
    }

    const issuedAt = exactIso(options.issuedAt);
    const expiresAt = exactIso(options.expiresAt);
    if (issuedAt === null || expiresAt === null || expiresAt <= issuedAt
        || !NONCE.test(options.nonce)) {
      throw new TypeError('resolution decision time or nonce is invalid');
    }

    const responseWitness = hasResponse
      ? FAMILY_WITNESS_BUILDERS[description.family](responseForWitness(options.response))
      : null;
    const unsigned = {
      schemaVersion: 1,
      protocolId: profile.decisionProtocolId,
      policyDigest: options.controller.policyDigest,
      keyId: options.controller.authorityKeyId,
      phase: operation.phase,
      dispatchDigest: operation.dispatchDigest,
      requestDigest: operation.requestDigest,
      attemptId: operation.attemptId,
      disposition: options.disposition,
      [profile.responseWitnessDigestField]: responseWitness?.witnessDigest ?? null,
      issuedAt: options.issuedAt,
      expiresAt: options.expiresAt,
      nonce: options.nonce,
    };
    const decision = { ...unsigned, decisionDigest: sha256Value(unsigned) };
    return deepFreeze({
      decision: structuredClone(decision),
      responseWitness: responseWitness === null ? null : structuredClone(responseWitness),
      signingPayload: canonicalJson(decision),
    });
  } catch (error) {
    if (error instanceof ProviderPhaseResolutionDecisionPreparationError) throw error;
    fail(error);
  }
}

