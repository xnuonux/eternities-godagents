import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateCreatorChoice,
  validateCreatorCommand,
} from '../src/creator/contracts.mjs';

const digest = (character) => character.repeat(64);

const choices = Object.freeze([
  { kind: 'set-blueprint', payload: { id: 'aether-architect', version: '1.0.0' } },
  { kind: 'set-genesis', payload: { createdBy: 'dom', sourceManifest: ['canonical-creator-fixture'] } },
  { kind: 'set-expression', payload: { ref: 'expression:aether-architect@1.0.0' } },
  { kind: 'select-module', payload: { kind: 'lineage', ref: 'lineage:synthetic-explorer@1.0.0' } },
  {
    kind: 'set-telos',
    payload: {
      mission: 'build one bounded system',
      successConditions: ['verified artifact exists'],
      stopConditions: ['required authority is absent'],
    },
  },
  {
    kind: 'set-constitution',
    payload: {
      id: 'eternities-builder-v1',
      version: '1.0.0',
      principles: ['evidence before claims'],
      allowedEffects: ['local-read'],
      amendmentPolicy: 'frozen-v0',
    },
  },
  {
    kind: 'set-prompt-os',
    payload: {
      edition: 'godagent-v0',
      allowedAdapters: ['prompt-os-v1'],
      requiredCapabilities: ['reasoning'],
    },
  },
  { kind: 'set-memory', payload: { classes: ['working'], foreignHistoryPolicy: 'provenance-only' } },
  { kind: 'set-realm', payload: { requiredCapabilities: ['filesystem.read'] } },
]);

test('creator choices and commands accept every closed creation field without changing values', () => {
  for (const choice of choices) {
    const validatedChoice = validateCreatorChoice(choice);
    assert.deepEqual(validatedChoice, choice);
    assert.notEqual(validatedChoice, choice);
    assert.equal(Object.isFrozen(validatedChoice), true);

    const command = {
      schemaVersion: 1,
      ...choice,
      expectedDraftDigest: digest('a'),
    };
    const validatedCommand = validateCreatorCommand(command);
    assert.deepEqual(validatedCommand, command);
    assert.notEqual(validatedCommand, command);
    assert.equal(Object.isFrozen(validatedCommand), true);
  }
});

test('creator contracts reject unknown kinds, fields, mismatched refs, and stale-shaped digests', () => {
  const base = {
    schemaVersion: 1,
    kind: 'select-module',
    expectedDraftDigest: digest('a'),
    payload: { kind: 'lineage', ref: 'lineage:synthetic-explorer@1.0.0' },
  };
  assert.throws(() => validateCreatorCommand({ ...base, surprise: true }), /creator command is invalid/);
  assert.throws(() => validateCreatorCommand({ ...base, kind: 'activate-soul' }), /creator command is invalid/);
  assert.throws(() => validateCreatorCommand({ ...base, expectedDraftDigest: 'not-a-digest' }), /creator command is invalid/);
  assert.throws(
    () => validateCreatorCommand({ ...base, payload: { kind: 'lineage', ref: 'archetype:systems-architect@1.0.0' } }),
    /creator command is invalid/,
  );
  assert.throws(
    () => validateCreatorChoice({ kind: 'set-expression', payload: { ref: '../expression.json' } }),
    /creator choice is invalid/,
  );
});

test('creator contracts reject non-json and sensitive payloads without echoing their values', () => {
  const canary = 'creator-contract-secret-canary';
  const attacks = [
    { kind: 'set-blueprint', payload: { id: 'agent', version: '1.0.0', credential: canary } },
    { kind: 'set-telos', payload: { mission: canary, successConditions: ['ok'], stopConditions: [undefined] } },
    { kind: 'set-realm', payload: { requiredCapabilities: ['filesystem.read'], provider: canary } },
    { kind: 'set-memory', payload: { classes: ['working'], foreignHistoryPolicy: 'provenance-only', callback: () => canary } },
    JSON.parse(`{"kind":"set-expression","payload":{"ref":"expression:agent@1.0.0","__proto__":{"credential":"${canary}"}}}`),
  ];
  for (const attack of attacks) {
    assert.throws(
      () => validateCreatorChoice(attack),
      (error) => /creator choice is invalid/.test(error.message) && !error.message.includes(canary),
    );
  }
});

