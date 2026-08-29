import { canonicalJson } from '../core/canonical-json.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  MODULE_KINDS,
  deepFreeze,
  parseModuleRef,
} from '../creation/contracts.mjs';

export const CREATOR_COMMAND_KINDS = Object.freeze([
  'set-blueprint', 'set-genesis', 'set-expression', 'select-module',
  'set-telos', 'set-constitution', 'set-prompt-os', 'set-memory', 'set-realm',
]);

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const EXPRESSION_REFERENCE = /^expression:[a-z0-9][a-z0-9._-]{0,127}@[a-z0-9][a-z0-9._-]{0,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const FORBIDDEN_KEYS = new Set([
  '__proto__', 'prototype', 'constructor', 'credential', 'credentials',
  'credentialEnv', 'apiKey', 'token', 'password', 'endpointOrigin',
  'selectedModel', 'provider', 'maxAttempts', 'maxCompletionTokens',
  'maxCycleCompletionTokens', 'soulPort', 'soulState', 'inspiration',
  'firstLight', 'endingAuthority', 'evolution',
]);

const invalidChoice = () => new TypeError('creator choice is invalid');
const invalidCommand = () => new TypeError('creator command is invalid');

function canonicalClone(value) {
  return JSON.parse(canonicalJson(value));
}

function assertSafeStructure(value, depth = 0, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return;
  if (depth > 32 || seen.has(value)) throw invalidChoice();
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw invalidChoice();
    assertSafeStructure(child, depth + 1, seen);
  }
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidChoice();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalidChoice();
  }
}

function identifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw invalidChoice();
  return value;
}

function text(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096) throw invalidChoice();
  return value;
}

function stringSet(value, item, maximum = 32) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) throw invalidChoice();
  const output = value.map(item);
  if (new Set(output).size !== output.length) throw invalidChoice();
  return output;
}

function validatePayload(kind, payload) {
  if (kind === 'set-blueprint') {
    exactObject(payload, ['id', 'version']);
    return { id: identifier(payload.id), version: identifier(payload.version) };
  }
  if (kind === 'set-genesis') {
    exactObject(payload, ['createdBy', 'sourceManifest']);
    return {
      createdBy: identifier(payload.createdBy),
      sourceManifest: stringSet(payload.sourceManifest, identifier),
    };
  }
  if (kind === 'set-expression') {
    exactObject(payload, ['ref']);
    if (typeof payload.ref !== 'string' || !EXPRESSION_REFERENCE.test(payload.ref)) throw invalidChoice();
    return { ref: payload.ref };
  }
  if (kind === 'select-module') {
    exactObject(payload, ['kind', 'ref']);
    if (!MODULE_KINDS.includes(payload.kind)) throw invalidChoice();
    const parsed = parseModuleRef(payload.ref);
    if (parsed.kind !== payload.kind) throw invalidChoice();
    return { kind: payload.kind, ref: payload.ref };
  }
  if (kind === 'set-telos') {
    exactObject(payload, ['mission', 'successConditions', 'stopConditions']);
    return {
      mission: text(payload.mission),
      successConditions: stringSet(payload.successConditions, text),
      stopConditions: stringSet(payload.stopConditions, text),
    };
  }
  if (kind === 'set-constitution') {
    exactObject(payload, ['id', 'version', 'principles', 'allowedEffects', 'amendmentPolicy']);
    if (payload.amendmentPolicy !== 'frozen-v0') throw invalidChoice();
    return {
      id: identifier(payload.id),
      version: identifier(payload.version),
      principles: stringSet(payload.principles, text),
      allowedEffects: Array.isArray(payload.allowedEffects) && payload.allowedEffects.length === 0
        ? []
        : stringSet(payload.allowedEffects, identifier),
      amendmentPolicy: 'frozen-v0',
    };
  }
  if (kind === 'set-prompt-os') {
    exactObject(payload, ['edition', 'allowedAdapters', 'requiredCapabilities']);
    return {
      edition: identifier(payload.edition),
      allowedAdapters: stringSet(payload.allowedAdapters, identifier, 16),
      requiredCapabilities: stringSet(payload.requiredCapabilities, identifier),
    };
  }
  if (kind === 'set-memory') {
    exactObject(payload, ['classes', 'foreignHistoryPolicy']);
    if (payload.foreignHistoryPolicy !== 'provenance-only') throw invalidChoice();
    return {
      classes: stringSet(payload.classes, identifier, 16),
      foreignHistoryPolicy: 'provenance-only',
    };
  }
  if (kind === 'set-realm') {
    exactObject(payload, ['requiredCapabilities']);
    return { requiredCapabilities: stringSet(payload.requiredCapabilities, identifier) };
  }
  throw invalidChoice();
}

export function validateCreatorChoice(input) {
  try {
    assertSafeStructure(input);
    exactObject(input, ['kind', 'payload']);
    if (!CREATOR_COMMAND_KINDS.includes(input.kind)) throw invalidChoice();
    const choice = canonicalClone({
      kind: input.kind,
      payload: validatePayload(input.kind, input.payload),
    });
    return deepFreeze(choice);
  } catch {
    throw invalidChoice();
  }
}

export function validateCreatorCommand(input) {
  try {
    assertSafeStructure(input);
    exactObject(input, ['schemaVersion', 'kind', 'expectedDraftDigest', 'payload']);
    assertSchema('creator-command', input);
    if (!DIGEST.test(input.expectedDraftDigest)) throw invalidCommand();
    const choice = validateCreatorChoice({ kind: input.kind, payload: input.payload });
    return deepFreeze(canonicalClone({
      schemaVersion: 1,
      ...choice,
      expectedDraftDigest: input.expectedDraftDigest,
    }));
  } catch {
    throw invalidCommand();
  }
}
