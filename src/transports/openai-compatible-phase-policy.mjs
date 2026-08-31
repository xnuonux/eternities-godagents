import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CREDENTIAL_ENV = /^[A-Z][A-Z0-9_]{2,63}$/;
const CONTROL = /[\0\r\n]/;
const PIN_VARIABLE = 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256';

const MESSAGES = Object.freeze({
  'policy-integrity': 'OpenAI-compatible phase transport policy integrity failed',
  'policy-invalid': 'OpenAI-compatible phase transport policy is invalid',
  'credential-unavailable': 'OpenAI-compatible phase transport credential is unavailable',
});

export class OpenAICompatiblePhasePolicyError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('phase policy error code is invalid');
    const detail = code === 'policy-invalid' && cause?.message ? `: ${cause.message}` : '';
    super(`${MESSAGES[code]}${detail}`, cause === undefined ? undefined : { cause });
    this.name = 'OpenAICompatiblePhasePolicyError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new OpenAICompatiblePhasePolicyError(code, cause);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateSemantics(policy) {
  if (!IDENTIFIER.test(policy.policyId)) throw new Error('policyId is invalid');
  let origin;
  try {
    origin = new URL(policy.provider.endpointOrigin);
  } catch {
    throw new Error('provider endpoint origin is invalid');
  }
  if (origin.protocol !== 'https:') throw new Error('provider endpoint origin requires HTTPS');
  if (origin.origin !== policy.provider.endpointOrigin || origin.pathname !== '/') {
    throw new Error('provider endpointOrigin must contain only one HTTPS origin');
  }
  const path = policy.provider.endpointPath;
  if (!path.startsWith('/') || path.startsWith('//') || /[?#]/.test(path) || CONTROL.test(path)) {
    throw new Error('provider endpointPath must be one query-free absolute path');
  }
  if (CONTROL.test(policy.provider.modelId)) throw new Error('provider modelId contains control characters');
  if (!CREDENTIAL_ENV.test(policy.provider.credentialEnv)) {
    throw new Error('provider credential variable is invalid');
  }
  return policy;
}

function pinnedDigest(env) {
  const value = env?.[PIN_VARIABLE];
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export async function loadOpenAICompatiblePhaseTransportPolicy({ path, env } = {}) {
  if (typeof path !== 'string' || path.length === 0 || CONTROL.test(path)) fail('policy-integrity');
  let text;
  let policy;
  try {
    text = await readFile(path, 'utf8');
    policy = JSON.parse(text);
  } catch (error) {
    fail('policy-integrity', error);
  }
  if (text !== `${canonicalJson(policy)}\n`) fail('policy-integrity');
  try {
    assertSchema('openai-compatible-phase-transport-policy', policy);
    validateSemantics(policy);
  } catch (error) {
    fail('policy-invalid', error);
  }
  const digest = sha256Text(canonicalJson(policy));
  const expected = pinnedDigest(env);
  if (!DIGEST.test(expected)
      || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(digest, 'hex'))) {
    fail('policy-integrity');
  }
  return deepFreeze({ policy, digest });
}

export function createOpenAICompatiblePhaseCredentialResolver({ env, variableName } = {}) {
  if (!env || typeof env !== 'object' || !CREDENTIAL_ENV.test(variableName ?? '')) {
    throw new TypeError('phase transport credential resolver configuration is invalid');
  }
  return Object.freeze({
    resolve() {
      const value = env[variableName];
      if (typeof value !== 'string' || value.length < 8 || value.length > 4096 || CONTROL.test(value)) {
        fail('credential-unavailable');
      }
      return value;
    },
  });
}
