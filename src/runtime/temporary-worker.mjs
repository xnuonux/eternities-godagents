import { canonicalJson } from '../core/canonical-json.mjs';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const allowedAuthority = new Set(['observe', 'propose', 'analyze']);

function assertIdentifier(label, value) {
  if (typeof value !== 'string'
      || !identifierPattern.test(value)
      || value === '.'
      || value === '..'
      || value.includes('/')
      || value.includes('\\')) {
    throw new TypeError(`${label} is invalid`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function createTemporaryWorkerEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('temporary worker input is required');
  const expectedKeys = ['authority', 'excerpts', 'leadInstanceId', 'taskId'];
  if (canonicalJson(Object.keys(input).sort()) !== canonicalJson(expectedKeys)) {
    throw new TypeError('temporary worker input has an unknown field');
  }
  assertIdentifier('taskId', input.taskId);
  assertIdentifier('leadInstanceId', input.leadInstanceId);
  if (!Array.isArray(input.authority)
      || input.authority.length < 1
      || new Set(input.authority).size !== input.authority.length
      || input.authority.some((entry) => !allowedAuthority.has(entry))) {
    throw new TypeError('temporary worker authority is invalid');
  }
  if (!Array.isArray(input.excerpts) || input.excerpts.length > 16) {
    throw new TypeError('temporary worker excerpt count is invalid');
  }
  const excerpts = input.excerpts.map((excerpt) => {
    if (!excerpt || typeof excerpt !== 'object' || Array.isArray(excerpt)
        || canonicalJson(Object.keys(excerpt).sort()) !== canonicalJson(['content', 'provenance', 'sourceRef'])) {
      throw new TypeError('temporary worker excerpt has an unknown field');
    }
    if (typeof excerpt.sourceRef !== 'string' || excerpt.sourceRef.length < 1 || excerpt.sourceRef.length > 256) {
      throw new TypeError('temporary worker excerpt sourceRef is invalid');
    }
    if (typeof excerpt.provenance !== 'string' || excerpt.provenance.length < 1 || excerpt.provenance.length > 128) {
      throw new TypeError('temporary worker excerpt provenance is invalid');
    }
    if (typeof excerpt.content !== 'string' || excerpt.content.length < 1 || excerpt.content.length > 8192) {
      throw new TypeError('temporary worker excerpt content is invalid');
    }
    return structuredClone(excerpt);
  });
  const envelope = {
    schemaVersion: 1,
    role: 'temporary-worker',
    taskId: input.taskId,
    lead: { instanceId: input.leadInstanceId, relation: 'external-provenance-only' },
    authority: [...input.authority],
    excerpts,
  };
  if (Buffer.byteLength(canonicalJson(envelope), 'utf8') > 8192) {
    throw new TypeError('temporary worker envelope exceeds byte budget');
  }
  return deepFreeze(envelope);
}
