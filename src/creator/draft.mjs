import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  MODULE_KINDS,
  deepFreeze,
  parseModuleRef,
} from '../creation/contracts.mjs';
import { validateCreatorChoice, validateCreatorCommand } from './contracts.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const CREATOR_REF = /^[a-z0-9][a-z0-9:._-]{0,127}$/;
const ZERO_DIGEST = '0'.repeat(64);
const OPTIONAL_FIELDS = Object.freeze([
  'blueprint', 'genesis', 'telos', 'constitution', 'promptOs',
  'memory', 'expressionRef', 'realm',
]);
const ROOT_FIELDS = new Set([
  'schemaVersion', 'catalogDigest', 'creatorRef', 'revision', 'previousDraftDigest',
  'moduleRefs', 'evolution', 'soulPort', 'draftDigest', ...OPTIONAL_FIELDS,
]);

const invalidDraft = () => new TypeError('creator draft is invalid');

function clone(value) {
  return structuredClone(value);
}

function projection(value) {
  const { draftDigest: _ignored, ...unsigned } = value;
  return unsigned;
}

function assertDraft(value) {
  try {
    assertSchema('creator-draft', value);
    if (Object.keys(value).some((key) => !ROOT_FIELDS.has(key))) throw invalidDraft();
    if (!DIGEST.test(value.catalogDigest)
        || !DIGEST.test(value.previousDraftDigest)
        || !DIGEST.test(value.draftDigest)
        || !CREATOR_REF.test(value.creatorRef)
        || !Number.isInteger(value.revision)
        || value.revision < 0) throw invalidDraft();
    if (value.revision === 0 && value.previousDraftDigest !== ZERO_DIGEST) throw invalidDraft();
    if (value.revision > 0 && value.previousDraftDigest === ZERO_DIGEST) throw invalidDraft();
    if (value.evolution?.policy !== 'frozen-v0'
        || value.soulPort?.schemaVersion !== 1
        || value.soulPort?.status !== 'dormant'
        || Object.keys(value.evolution).length !== 1
        || Object.keys(value.soulPort).length !== 2) throw invalidDraft();
    for (const [kind, ref] of Object.entries(value.moduleRefs)) {
      if (!MODULE_KINDS.includes(kind) || parseModuleRef(ref).kind !== kind) throw invalidDraft();
    }
    const validations = [
      ['blueprint', 'set-blueprint'],
      ['genesis', 'set-genesis'],
      ['telos', 'set-telos'],
      ['constitution', 'set-constitution'],
      ['promptOs', 'set-prompt-os'],
      ['memory', 'set-memory'],
      ['realm', 'set-realm'],
    ];
    for (const [field, kind] of validations) {
      if (Object.hasOwn(value, field)) validateCreatorChoice({ kind, payload: value[field] });
    }
    if (Object.hasOwn(value, 'expressionRef')) {
      validateCreatorChoice({ kind: 'set-expression', payload: { ref: value.expressionRef } });
    }
    if (sha256Value(projection(value)) !== value.draftDigest) throw invalidDraft();
    return value;
  } catch {
    throw invalidDraft();
  }
}

export function creatorDraftProjection(draft) {
  assertDraft(draft);
  return deepFreeze(clone(projection(draft)));
}

export function createCreatorDraft({ catalogDigest, creatorRef }) {
  const unsigned = {
    schemaVersion: 1,
    catalogDigest,
    creatorRef,
    revision: 0,
    previousDraftDigest: ZERO_DIGEST,
    moduleRefs: {},
    evolution: { policy: 'frozen-v0' },
    soulPort: { schemaVersion: 1, status: 'dormant' },
  };
  const draft = { ...unsigned, draftDigest: sha256Value(unsigned) };
  assertDraft(draft);
  return deepFreeze(clone(draft));
}

export function applyCreatorCommand({ draft, command }) {
  assertDraft(draft);
  const accepted = validateCreatorCommand(command);
  if (accepted.expectedDraftDigest !== draft.draftDigest) {
    throw new TypeError('creator command does not match current draft');
  }
  const next = clone(projection(draft));
  next.revision = draft.revision + 1;
  next.previousDraftDigest = draft.draftDigest;

  if (accepted.kind === 'set-blueprint') next.blueprint = accepted.payload;
  else if (accepted.kind === 'set-genesis') next.genesis = accepted.payload;
  else if (accepted.kind === 'set-expression') next.expressionRef = accepted.payload.ref;
  else if (accepted.kind === 'select-module') {
    next.moduleRefs = { ...next.moduleRefs, [accepted.payload.kind]: accepted.payload.ref };
  } else if (accepted.kind === 'set-telos') next.telos = accepted.payload;
  else if (accepted.kind === 'set-constitution') next.constitution = accepted.payload;
  else if (accepted.kind === 'set-prompt-os') next.promptOs = accepted.payload;
  else if (accepted.kind === 'set-memory') next.memory = accepted.payload;
  else if (accepted.kind === 'set-realm') next.realm = accepted.payload;

  const output = { ...next, draftDigest: sha256Value(next) };
  assertDraft(output);
  return deepFreeze(clone(output));
}

