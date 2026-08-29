const forbiddenKeys = new Set([
  'authorization',
  'apikey',
  'api_key',
  'token',
  'secret',
  'credential',
  'password',
  'headers',
  'rawrequest',
  'rawresponse',
  'environment',
]);

const failureReasons = new Set([
  'connect-failed',
  'timeout',
  'rate-limited',
  'transient-server',
  'authentication',
  'authorization',
  'invalid-request',
  'forbidden-endpoint',
  'forbidden-model',
  'refusal',
  'oversized-output',
  'invalid-response',
  'schema-rejected',
  'semantic-rejected',
  'retry-exhausted',
  'budget-exhausted',
]);

const commonKeys = Object.freeze([
  'attemptId',
  'ordinal',
  'adapterId',
  'profile',
  'modelId',
  'requestDigest',
  'stateEpoch',
  'hostPolicyId',
  'hostPolicyDigest',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function assertNoCredentialFields(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key.toLowerCase())) {
      throw new Error(`credential-shaped field rejected: ${key}`);
    }
    assertNoCredentialFields(child, seen);
  }
  return value;
}

function requireString(event, key) {
  if (typeof event[key] !== 'string' || event[key].length === 0) {
    throw new Error(`inference projection requires ${key}`);
  }
}

function requireDigest(event, key) {
  if (!/^[a-f0-9]{64}$/i.test(event[key] ?? '')) {
    throw new Error(`inference projection requires ${key}`);
  }
}

function commonProjection(event) {
  for (const key of ['attemptId', 'adapterId', 'profile', 'modelId', 'hostPolicyId']) requireString(event, key);
  for (const key of ['requestDigest', 'hostPolicyDigest']) requireDigest(event, key);
  if (!Number.isInteger(event.ordinal) || event.ordinal < 1) throw new Error('inference projection requires ordinal');
  if (!Number.isInteger(event.stateEpoch) || event.stateEpoch < 0) throw new Error('inference projection requires stateEpoch');
  return Object.fromEntries(commonKeys.map((key) => [key, event[key]]));
}

function optionalTerminalFields(event) {
  const fields = {};
  if (Object.hasOwn(event, 'responseDigest')) {
    requireDigest(event, 'responseDigest');
    fields.responseDigest = event.responseDigest;
  }
  if (Object.hasOwn(event, 'usage')) {
    const { inputTokens, outputTokens } = event.usage ?? {};
    if (!Number.isInteger(inputTokens) || inputTokens < 0 || !Number.isInteger(outputTokens) || outputTokens < 0) {
      throw new Error('inference projection requires non-negative usage counters');
    }
    fields.usage = { inputTokens, outputTokens };
  }
  return fields;
}

export function projectInferenceEvent(event) {
  assertNoCredentialFields(event);
  if (!['cortex.requested', 'cortex.accepted', 'cortex.failed'].includes(event.eventType)) {
    throw new Error('unknown inference event type');
  }
  const projected = {
    schemaVersion: 1,
    eventType: event.eventType,
    ...commonProjection(event),
  };
  if (event.eventType === 'cortex.accepted') {
    requireDigest(event, 'responseDigest');
    Object.assign(projected, optionalTerminalFields(event));
  }
  if (event.eventType === 'cortex.failed') {
    if (!failureReasons.has(event.reasonCode)) throw new Error('inference projection rejected reasonCode');
    projected.reasonCode = event.reasonCode;
    Object.assign(projected, optionalTerminalFields(event));
  }
  return deepFreeze(projected);
}
