import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { SchemaError } from '../src/core/errors.mjs';
import { assertSchema, validateAgainstSchema } from '../src/core/schema-validator.mjs';

const fixtureUrl = (name) => new URL(`../fixtures/${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(fixtureUrl(name), 'utf8'));

test('canonical JSON is independent of object insertion order', () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');
});

test('canonical JSON rejects values that cannot have stable JSON meaning', () => {
  const cyclic = {};
  cyclic.self = cyclic;

  assert.throws(() => canonicalJson({ value: Number.NaN }), /finite number/);
  assert.throws(() => canonicalJson(cyclic), /cyclic value/);
});

test('schema validator enforces bounded strings, numbers, and arrays', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'score', 'tags'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 8 },
      score: { type: 'integer', minimum: 0, maximum: 100 },
      tags: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
        items: { type: 'string', minLength: 1 },
      },
    },
  };

  assert.equal(validateAgainstSchema('bounded-fixture', schema, {
    name: 'aegis', score: 90, tags: ['guardian'],
  }).score, 90);
  assert.throws(() => validateAgainstSchema('bounded-fixture', schema, {
    name: 'name-too-long', score: 90, tags: ['guardian'],
  }), /maxLength 8/);
  assert.throws(() => validateAgainstSchema('bounded-fixture', schema, {
    name: 'aegis', score: 101, tags: ['guardian'],
  }), /maximum 100/);
  assert.throws(() => validateAgainstSchema('bounded-fixture', schema, {
    name: 'aegis', score: 90, tags: ['guardian', 'guardian'],
  }), /uniqueItems/);
});

test('strict schemas accept the complete v0 fixtures', async () => {
  const genome = await readJson('agent-genome.json');
  const realm = await readJson('realm-contract.json');

  assert.equal(assertSchema('agent-genome', genome), genome);
  assert.equal(assertSchema('realm-contract', realm), realm);
});

test('agent genome rejects unknown fields without exposing their values', async () => {
  const genome = await readJson('agent-genome.json');
  const invalid = { ...genome, unexpected: 'do-not-echo-this-value' };

  assert.throws(
    () => assertSchema('agent-genome', invalid),
    (error) => error instanceof SchemaError
      && error.pointer === '/unexpected'
      && !error.message.includes('do-not-echo-this-value'),
  );
});

test('agent genome rejects an active Soul port', async () => {
  const genome = await readJson('agent-genome.json');
  const invalid = { ...genome, soulPort: { schemaVersion: 1, status: 'active' } };

  assert.throws(
    () => assertSchema('agent-genome', invalid),
    (error) => error instanceof SchemaError && error.pointer === '/soulPort/status',
  );
});

test('agent genome rejects missing constitutional identity', async () => {
  const genome = await readJson('agent-genome.json');
  const { constitution, ...invalid } = genome;

  assert.throws(
    () => assertSchema('agent-genome', invalid),
    (error) => error instanceof SchemaError && error.pointer === '/constitution',
  );
});

test('all runtime contract schemas accept hand-derived valid records', () => {
  const digest = 'a'.repeat(64);
  const validRecords = {
    'distribution-manifest': {
      schemaVersion: 1,
      artifactId: 'fixture-agent@0.1.0',
      buildId: digest,
      genomeDigest: digest,
      sources: [{ role: 'genome', path: 'genome.json', sha256: digest }],
      resolvedComponents: ['genome', 'prompt-os', 'realm'],
      omittedComponents: [],
      compatibility: { cortexAdapters: ['fixture-a'], realmIds: ['fixture-workbench'], schemaRange: '1' },
      artifacts: [{ path: 'agent-genome.json', sha256: digest }],
      validations: [{ id: 'schema', status: 'pass' }],
    },
    'vessel-event': {
      schemaVersion: 1,
      instanceId: 'instance-1',
      sequence: 1,
      stateEpoch: 0,
      eventType: 'mission.admitted',
      sourceClass: 'user',
      sourceRef: 'mission-1',
      causationId: 'mission-1',
      correlationId: 'cycle-1',
      payload: { mission: 'increment the counter' },
      previousDigest: '0'.repeat(64),
      contentDigest: digest,
      recordedAt: '2026-08-28T00:00:00.000Z',
    },
    'organ-proposal': {
      schemaVersion: 1,
      proposalId: 'proposal-1',
      organId: 'planner',
      organVersion: '1',
      sourceStateEpoch: 0,
      claim: 'the counter should increment once',
      evidenceRefs: ['observation-1'],
      intent: { handId: 'counter.increment', amount: 1 },
      expectedOutcome: { counter: 1 },
      cost: 1,
      risk: 'low',
      uncertainty: 'verified-fixture',
      requiredAuthority: ['realm:write'],
      preconditions: ['realm-observed'],
      expiresAt: '2026-08-28T00:01:00.000Z',
      priority: 10,
    },
    'decision-commit': {
      schemaVersion: 1,
      decisionId: 'decision-1',
      missionId: 'mission-1',
      selectedProposalIds: ['proposal-1'],
      sourceStateEpoch: 0,
      constitutionalBasis: ['purpose-is-not-permission'],
      authorityBasis: ['realm:write'],
      committedIntent: { handId: 'counter.increment', amount: 1 },
      expectedOutcome: { counter: 1 },
      allowedEffects: ['local-write'],
      budget: { maxActions: 1 },
      expiresAt: '2026-08-28T00:01:00.000Z',
      stopConditions: ['one-action-complete'],
      receiptDigest: digest,
    },
    'action-receipt': {
      schemaVersion: 1,
      actionId: 'action-1',
      idempotencyKey: 'cycle-1:decision-1',
      decisionId: 'decision-1',
      realmId: 'fixture-workbench',
      handId: 'counter.increment',
      authorityRef: 'realm:write',
      expectedTransition: { counter: 1 },
      invocation: { status: 'applied', externalReceipt: 'fixture-1' },
      observedTransition: { counter: 1 },
      discrepancyClass: 'none',
      disposition: 'complete',
      receiptDigest: digest,
    },
  };

  for (const [schemaName, record] of Object.entries(validRecords)) {
    assert.equal(assertSchema(schemaName, record), record, schemaName);
  }
});

test('digest references reject structurally invalid values through a local schema reference', () => {
  const invalid = {
    schemaVersion: 1,
    artifactId: 'fixture-agent@0.1.0',
    buildId: 'short',
    genomeDigest: 'a'.repeat(64),
    sources: [],
    resolvedComponents: [],
    omittedComponents: [],
    compatibility: { cortexAdapters: [], realmIds: [], schemaRange: '1' },
    artifacts: [],
    validations: [],
  };

  assert.throws(
    () => assertSchema('distribution-manifest', invalid),
    (error) => error instanceof SchemaError && error.pointer === '/buildId',
  );
});
