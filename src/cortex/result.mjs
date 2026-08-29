import { SchemaError } from '../core/errors.mjs';
import { assertSchema } from '../core/schema-validator.mjs';

const commonKeys = Object.freeze([
  'adapterId',
  'attemptId',
  'modelId',
  'ordinal',
  'profile',
  'requestDigest',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function selectMetadata(metadata, optionalKeys) {
  const allowed = new Set([...commonKeys, ...optionalKeys]);
  for (const key of Object.keys(metadata)) {
    if (!allowed.has(key)) {
      throw new SchemaError('cortex-attempt', `/${key}`, 'additionalProperties');
    }
  }
  return Object.fromEntries([...commonKeys, ...optionalKeys]
    .filter((key) => Object.hasOwn(metadata, key))
    .map((key) => [key, metadata[key]]));
}

export function assertCortexResult(result) {
  assertSchema('cortex-attempt', result);
  if (result.status === 'accepted') {
    if (!Object.hasOwn(result, 'proposal')) {
      throw new SchemaError('cortex-attempt', '/proposal', 'required for accepted result');
    }
    if (!Object.hasOwn(result, 'responseDigest')) {
      throw new SchemaError('cortex-attempt', '/responseDigest', 'required for accepted result');
    }
    if (Object.hasOwn(result, 'reasonCode')) {
      throw new SchemaError('cortex-attempt', '/reasonCode', 'prohibited for accepted result');
    }
    assertSchema('organ-proposal', result.proposal);
  } else {
    if (!Object.hasOwn(result, 'reasonCode')) {
      throw new SchemaError('cortex-attempt', '/reasonCode', 'required for failed result');
    }
    if (Object.hasOwn(result, 'proposal')) {
      throw new SchemaError('cortex-attempt', '/proposal', 'prohibited for failed result');
    }
  }
  return result;
}

export function acceptedProposal(proposal, metadata) {
  const result = {
    schemaVersion: 1,
    status: 'accepted',
    ...selectMetadata(metadata, ['responseDigest', 'usage']),
    proposal,
  };
  assertCortexResult(result);
  return deepFreeze(result);
}

export function failedInference(reasonCode, metadata) {
  const result = {
    schemaVersion: 1,
    status: 'failed',
    ...selectMetadata(metadata, ['responseDigest', 'usage']),
    reasonCode,
  };
  assertCortexResult(result);
  return deepFreeze(result);
}

