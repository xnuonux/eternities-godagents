import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSchema } from '../src/core/schema-validator.mjs';
import { deriveGenesisIdentity } from '../src/genesis/identity.mjs';

const digest = (character) => character.repeat(64);

const identityInput = Object.freeze({
  instanceId: 'agent-a',
  creatorRef: 'creator:dom',
  creationBuildId: digest('1'),
  distributionBuildId: digest('2'),
  genomeValueDigest: digest('3'),
  genomeContentDigest: digest('4'),
});

const identity = Object.freeze({
  genesisId: 'b1c701473f08fc1571f7d50ac2dc050944e2888c69e17b59b9ba35c9a86319bf',
  keelId: 'keel-be2a4c40f6cbdf5b188a9b89f6c56c8a4123b1a0bb5c03207d6e7f9bfdb14a68',
});

const validState = Object.freeze({
  schemaVersion: 1,
  ...identity,
  instanceId: identityInput.instanceId,
  state: 'prepared',
  previousStateDigest: digest('0'),
  evidence: { creationBuildId: identityInput.creationBuildId },
  stateDigest: digest('5'),
  recordedAt: '2026-08-29T10:00:00.000Z',
});

const validReceipt = Object.freeze({
  schemaVersion: 1,
  status: 'admitted',
  ...identity,
  instanceId: identityInput.instanceId,
  creatorRef: identityInput.creatorRef,
  creationBuildId: identityInput.creationBuildId,
  distributionBuildId: identityInput.distributionBuildId,
  policyDigest: digest('6'),
  genomeValueDigest: identityInput.genomeValueDigest,
  genomeContentDigest: identityInput.genomeContentDigest,
  constitutionDigest: digest('7'),
  soulPortDigest: digest('8'),
  journalBindingBaseDigest: digest('9'),
  journalHeadDigest: digest('a'),
  keelBindingBaseDigest: digest('b'),
  keelHeadDigest: digest('c'),
  transactionStateDigest: digest('d'),
  receiptDigest: digest('e'),
});

test('genesis identity is deterministic across property order and binds both genome digest domains', () => {
  assert.deepEqual(deriveGenesisIdentity(identityInput), identity);
  assert.deepEqual(deriveGenesisIdentity({
    genomeContentDigest: identityInput.genomeContentDigest,
    creatorRef: identityInput.creatorRef,
    distributionBuildId: identityInput.distributionBuildId,
    instanceId: identityInput.instanceId,
    genomeValueDigest: identityInput.genomeValueDigest,
    creationBuildId: identityInput.creationBuildId,
  }), identity);

  assert.notDeepEqual(deriveGenesisIdentity({ ...identityInput, genomeContentDigest: digest('f') }), identity);
});

test('genesis identity rejects path-shaped identifiers and malformed digest pins', () => {
  for (const instanceId of ['../escape', 'agent/a', 'agent\\a', '', '.']) {
    assert.throws(() => deriveGenesisIdentity({ ...identityInput, instanceId }), /instanceId/);
  }
  assert.throws(() => deriveGenesisIdentity({ ...identityInput, creatorRef: 'creator dom' }), /creatorRef/);
  assert.throws(() => deriveGenesisIdentity({ ...identityInput, creationBuildId: digest('A') }), /creationBuildId/);
});

test('genesis schemas close transaction states and reject unknown fields', () => {
  assert.equal(assertSchema('genesis-state', validState), validState);
  assert.throws(() => assertSchema('genesis-state', { ...validState, state: 'running' }), /enum/);
  assert.throws(() => assertSchema('genesis-state', { ...validState, surprise: true }), /additionalProperties/);
  assert.throws(() => assertSchema('genesis-state', { ...validState, stateDigest: digest('a').slice(1) }), /minLength/);
});

test('genesis receipt admits only a fully bound closed record', () => {
  assert.equal(assertSchema('genesis-receipt', validReceipt), validReceipt);
  assert.throws(() => assertSchema('genesis-receipt', { ...validReceipt, status: 'prepared' }), /const/);
  assert.throws(() => assertSchema('genesis-receipt', { ...validReceipt, receiptDigest: `${digest('e')}0` }), /maxLength/);
  assert.throws(() => assertSchema('genesis-receipt', { ...validReceipt, backendRoot: 'C:\\secret' }), /additionalProperties/);
});

test('keel records require one exact hash-chain envelope', () => {
  const record = {
    schemaVersion: 1,
    sequence: 1,
    previousDigest: digest('0'),
    kind: 'bedrock',
    payload: { genesisId: identity.genesisId },
    contentDigest: digest('f'),
    recordedAt: '2026-08-29T10:00:00.000Z',
  };
  assert.equal(assertSchema('keel-record', record), record);
  assert.throws(() => assertSchema('keel-record', { ...record, kind: 'model-command' }), /enum/);
  assert.throws(() => assertSchema('keel-record', { ...record, sql: 'drop table' }), /additionalProperties/);
});
