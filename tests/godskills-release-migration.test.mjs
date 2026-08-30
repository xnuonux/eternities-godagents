import assert from 'node:assert/strict';
import test from 'node:test';

import { planGodskillsReleaseMigration } from '../src/skills/release-migration.mjs';

const digest = (character) => character.repeat(64);

const basePolicy = Object.freeze({
  protocolId: 'eternities-godskills-adapter-v1',
  profile: 'all-rounder',
  preferredFamilies: [],
  prohibitedFamilies: [],
  prohibitedCapabilities: [],
  maxComposition: 3,
});

const baseIdentity = Object.freeze({
  instanceId: 'fixture-agent-1',
  genomeDigest: digest('1'),
  genesisId: digest('2'),
  keelId: `keel-${digest('3')}`,
  constitutionDigest: digest('4'),
});

function capability(id, overrides = {}) {
  return {
    id,
    family: 'engineering',
    tier: 'godskill',
    ownerGodskillId: null,
    entrypoint: { path: `skills/${id}/SKILL.md`, sha256: digest('5'), bytes: 100 },
    contract: { path: `skills/${id}/references/capability-contract.json`, sha256: digest('6'), bytes: 100 },
    capabilityDoesNotGrantAuthority: true,
    effectVocabulary: ['read', 'write'],
    ...overrides,
  };
}

function release(releaseDigest, capabilities = [capability('eternities-forge')], pin = {}) {
  const rows = capabilities.map((row) => structuredClone(row));
  return Object.freeze({
    releaseDigest,
    pin: Object.freeze({
      adapterProtocol: 'eternities-godskills-adapter-v1',
      semanticEffectBindings: { read: ['local-read'], write: ['local-write'] },
      maximumSelected: 3,
      maximumPackageBytes: 16000,
      ...pin,
    }),
    manifest: Object.freeze({ capabilities: rows }),
    capabilitiesById: new Map(rows.map((row) => [row.id, Object.freeze(row)])),
  });
}

function inputs(overrides = {}) {
  return {
    from: release(digest('a')),
    to: release(digest('b'), [capability('eternities-forge', {
      entrypoint: { path: 'skills/eternities-forge/SKILL.md', sha256: digest('7'), bytes: 110 },
      contract: { path: 'skills/eternities-forge/references/capability-contract.json', sha256: digest('8'), bytes: 120 },
    })]),
    genomePolicy: { before: basePolicy, after: structuredClone(basePolicy), requiredCapabilityIds: ['eternities-forge'] },
    identity: { before: baseIdentity, after: structuredClone(baseIdentity) },
    ...overrides,
  };
}

test('compatible release update emits a body-free operational migration receipt and rollback pin', () => {
  const receipt = planGodskillsReleaseMigration(inputs());

  assert.equal(receipt.status, 'compatible-operational-migration');
  assert.equal(receipt.fromReleaseDigest, digest('a'));
  assert.equal(receipt.toReleaseDigest, digest('b'));
  assert.deepEqual(receipt.manifestDelta, {
    addedCapabilityIds: [],
    removedCapabilityIds: [],
    changedContractIds: ['eternities-forge'],
    changedEntrypointIds: ['eternities-forge'],
  });
  assert.deepEqual(receipt.rollbackPin, {
    adapterProtocol: 'eternities-godskills-adapter-v1',
    releaseDigest: digest('a'),
  });
  assert.equal(receipt.identity.instanceId, baseIdentity.instanceId);
  assert.equal(receipt.identity.genomeDigest, baseIdentity.genomeDigest);
  assert.equal(receipt.identity.genesisId, baseIdentity.genesisId);
  assert.equal(receipt.identity.keelId, baseIdentity.keelId);
  assert.equal(receipt.identity.constitutionDigest, baseIdentity.constitutionDigest);
  assert.equal(JSON.stringify(receipt).includes('selectedPackages'), false);
  assert.equal(JSON.stringify(receipt).includes('entrypointBody'), false);
  assert.equal(JSON.stringify(receipt).includes('contractBody'), false);
  assert.equal(Object.isFrozen(receipt), true);
});

test('protocol downgrade and removal of a required capability are rejected', () => {
  assert.throws(() => planGodskillsReleaseMigration(inputs({
    to: release(digest('b'), [capability('eternities-forge')], { adapterProtocol: 'eternities-godskills-adapter-v0' }),
  })), /protocol/i);
  assert.throws(() => planGodskillsReleaseMigration(inputs({
    to: release(digest('b'), []),
  })), /required capability/i);
});

test('release expansion is classified as governed evolution rather than dependency migration', () => {
  const cases = [
    ['capability', release(digest('b'), [capability('eternities-forge'), capability('eternities-oracle')])],
    ['effects', release(digest('b'), [capability('eternities-forge')], {
      semanticEffectBindings: { read: ['local-read', 'external-read'], write: ['local-write'] },
    })],
    ['authority', release(digest('b'), [capability('eternities-forge', {
      authorityVocabulary: ['repository-write'],
    })])],
    ['composition', release(digest('b'), [capability('eternities-forge')], { maximumSelected: 4 })],
    ['context', release(digest('b'), [capability('eternities-forge')], { maximumPackageBytes: 16001 })],
  ];

  for (const [reason, to] of cases) {
    const receipt = planGodskillsReleaseMigration(inputs({ to }));
    assert.equal(receipt.status, 'governed-evolution-required', reason);
    assert.equal(receipt.evolutionReasons.includes(reason), true, reason);
  }
});

test('genome policy or identity mutation cannot be smuggled through an operational migration', () => {
  assert.throws(() => planGodskillsReleaseMigration(inputs({
    genomePolicy: { before: basePolicy, after: structuredClone(basePolicy) },
  })), /required capability/i);
  assert.throws(() => planGodskillsReleaseMigration(inputs({
    genomePolicy: {
      before: basePolicy,
      after: { ...basePolicy, prohibitedCapabilities: ['eternities-forge'] },
      requiredCapabilityIds: ['eternities-forge'],
    },
  })), /genome policy/i);
  assert.throws(() => planGodskillsReleaseMigration(inputs({
    identity: { before: baseIdentity, after: { ...baseIdentity, genomeDigest: digest('9') } },
  })), /identity/i);
});
