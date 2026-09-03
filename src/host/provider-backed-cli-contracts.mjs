import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text } from '../core/digest.mjs';
import { verifyIdentityBoundMissionVesselRequest } from '../runtime/identity-bound-mission-vessel-contracts.mjs';

const REQUIRED = Object.freeze([
  'family',
  'provider-policy',
  'admission',
  'policy',
  'identity-policy-digest',
  'mission',
  'request-id',
  'review-materialized-bytes',
  'revision-materialized-bytes',
]);

const KEY_MAP = Object.freeze({
  family: 'family',
  'provider-policy': 'providerPolicyPath',
  admission: 'admissionRoot',
  policy: 'identityPolicyPath',
  'identity-policy-digest': 'identityPolicyDigest',
  mission: 'missionPath',
  'request-id': 'requestId',
  'review-materialized-bytes': 'maximumReviewMaterializedBytes',
  'revision-materialized-bytes': 'maximumRevisionMaterializedBytes',
});

const FAMILIES = new Set([
  'openai-compatible-chat-completions-v1',
  'anthropic-messages-v1',
]);
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const MAX_OPTION_VALUE_LENGTH = 32_768;
const MAX_MISSION_BYTES = 1_048_576;

const MESSAGES = Object.freeze({
  'argument-invalid': 'provider-backed identity cli argument is invalid',
  'option-duplicate': 'provider-backed identity cli option is duplicated',
  'option-missing': 'provider-backed identity cli option is missing',
  'option-unexpected': 'provider-backed identity cli option is not allowed',
  'value-invalid': 'provider-backed identity cli option value is invalid',
  'provider-policy-integrity': 'provider-backed identity cli provider policy integrity failed',
  'identity-policy-integrity': 'provider-backed identity cli identity policy integrity failed',
  'identity-policy-incompatible': 'provider-backed identity cli identity policy is incompatible',
  'admission-invalid': 'provider-backed identity cli admission is invalid',
  'launch-failed': 'provider-backed identity cli launch failed',
  'mission-invalid': 'provider-backed identity cli mission request is invalid',
  'internal-failure': 'provider-backed identity cli failed internally',
});

export class ProviderBackedIdentityCliError extends Error {
  constructor(code) {
    if (!Object.hasOwn(MESSAGES, code)) {
      throw new TypeError('provider-backed identity cli error code is invalid');
    }
    super(MESSAGES[code]);
    this.name = 'ProviderBackedIdentityCliError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProviderBackedIdentityCliError(code);
}

function validateText(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_OPTION_VALUE_LENGTH
      || /[\0\r\n]/.test(value)) fail('value-invalid');
}

function parseBoundedInteger(value, minimum, maximum) {
  validateText(value);
  if (!DECIMAL.test(value)) fail('value-invalid');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) fail('value-invalid');
  return parsed;
}

function validateOptionValue(name, value) {
  validateText(value);
  if (name === 'family' && !FAMILIES.has(value)) fail('value-invalid');
  if (name === 'identity-policy-digest' && !DIGEST.test(value)) fail('value-invalid');
  if (name === 'request-id' && (value === '.' || value === '..' || !IDENTIFIER.test(value))) {
    fail('value-invalid');
  }
  if (name === 'review-materialized-bytes') return parseBoundedInteger(value, 128, 16_777_216);
  if (name === 'revision-materialized-bytes') return parseBoundedInteger(value, 1_024, 16_777_216);
  return value;
}

export function parseProviderBackedIdentityCliArgs(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) {
    fail('argument-invalid');
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token)) fail('argument-invalid');
    const name = token.slice(2);
    if (!REQUIRED.includes(name)) fail('option-unexpected');
    if (values.has(name)) fail('option-duplicate');
    if (value === undefined || value.startsWith('--')) fail('option-missing');
    values.set(name, validateOptionValue(name, value));
  }
  if (values.size !== REQUIRED.length || REQUIRED.some((name) => !values.has(name))) {
    fail('option-missing');
  }
  return Object.freeze(Object.fromEntries(REQUIRED.map((name) => [KEY_MAP[name], values.get(name)])));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function loadProviderBackedMissionRequest(text, requestId) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_MISSION_BYTES
      || text.length === 0 || /\0/.test(text)) fail('mission-invalid');
  let value;
  try {
    value = JSON.parse(text);
    if (text !== `${canonicalJson(value)}\n`) fail('mission-invalid');
    verifyIdentityBoundMissionVesselRequest(value);
  } catch (error) {
    if (error instanceof ProviderBackedIdentityCliError) throw error;
    fail('mission-invalid');
  }
  if (value.mission.missionId !== requestId) fail('mission-invalid');
  const loaded = structuredClone(value);
  return deepFreeze(loaded);
}

export function providerPolicyDigest(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_MISSION_BYTES
      || text.length === 0 || /\0/.test(text)) fail('provider-policy-integrity');
  try {
    const value = JSON.parse(text);
    if (text !== `${canonicalJson(value)}\n`) fail('provider-policy-integrity');
    const digest = sha256Text(text.slice(0, -1));
    return Object.freeze({ value: deepFreeze(value), digest });
  } catch (error) {
    if (error instanceof ProviderBackedIdentityCliError) throw error;
    fail('provider-policy-integrity');
  }
}
