import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { assertSchema } from '../src/core/schema-validator.mjs';
import { compileCapabilityEligibility } from '../src/skills/capability-policy.mjs';

const manifest = [
  { id: 'forge', ownerGodskillId: 'construction' },
  { id: 'observe', ownerGodskillId: 'perception' },
  { id: 'reason', ownerGodskillId: 'cognition' },
  { id: 'write', ownerGodskillId: 'construction' },
];

test('all-rounder is eligible for every manifest capability', () => {
  const result = compileCapabilityEligibility({
    protocolId: 'eternities-godskills-adapter-v1',
    profile: 'all-rounder',
    preferredFamilies: [],
    prohibitedFamilies: [],
    prohibitedCapabilities: [],
    maxComposition: 3,
  }, manifest);

  assert.deepEqual(result.eligibleIds, ['forge', 'observe', 'reason', 'write']);
  assert.deepEqual(result.preferredIds, []);
  assert.deepEqual(result.prohibitedIds, []);
  assert.equal(result.maxComposition, 3);
});

test('specialist preferences rank matching rows without removing other rows', () => {
  const result = compileCapabilityEligibility({
    protocolId: 'eternities-godskills-adapter-v1',
    profile: 'specialist',
    preferredFamilies: ['construction'],
    prohibitedFamilies: [],
    prohibitedCapabilities: [],
    maxComposition: 2,
  }, manifest);

  assert.deepEqual(result.eligibleIds, ['forge', 'observe', 'reason', 'write']);
  assert.deepEqual(result.preferredIds, ['forge', 'write']);
  assert.equal(result.maxComposition, 2);
});

test('explicit family and capability prohibitions remove only matching rows', () => {
  const result = compileCapabilityEligibility({
    protocolId: 'eternities-godskills-adapter-v1',
    profile: 'specialist',
    preferredFamilies: ['construction'],
    prohibitedFamilies: ['perception'],
    prohibitedCapabilities: ['write'],
    maxComposition: 3,
  }, manifest);

  assert.deepEqual(result.eligibleIds, ['forge', 'reason']);
  assert.deepEqual(result.preferredIds, ['forge']);
  assert.deepEqual(result.prohibitedIds, ['observe', 'write']);
});

test('policy rejects unknown families, capabilities, duplicate entries, and composition above three', () => {
  const base = {
    protocolId: 'eternities-godskills-adapter-v1',
    profile: 'all-rounder',
    preferredFamilies: [],
    prohibitedFamilies: [],
    prohibitedCapabilities: [],
    maxComposition: 3,
  };

  assert.throws(() => compileCapabilityEligibility({ ...base, prohibitedFamilies: ['unknown'] }, manifest), /unknown family/);
  assert.throws(() => compileCapabilityEligibility({ ...base, prohibitedCapabilities: ['unknown'] }, manifest), /unknown capability/);
  assert.throws(() => compileCapabilityEligibility({ ...base, preferredFamilies: ['construction', 'construction'] }, manifest), /duplicate/);
  assert.throws(() => compileCapabilityEligibility({ ...base, maxComposition: 4 }, manifest), /maxComposition/);
});

test('genome policy shape rejects the legacy contract id and accepts the persistent policy', () => {
  const valid = JSON.parse(readFileSync(new URL('../fixtures/agent-genome.json', import.meta.url)));
  assert.doesNotThrow(() => assertSchema('agent-genome', valid));
  valid.godskills = { contractId: 'eternities-portable-router-v1', maxComposition: 3 };
  assert.throws(() => assertSchema('agent-genome', valid), /required/);
});

test('real portable owner identities are the specialization families', async () => {
  const portable = JSON.parse(await readFile('C:/dev/eternities-godskills/artifacts/portable-capabilities/manifest.v1.json'));
  const result = compileCapabilityEligibility({
    protocolId: 'eternities-godskills-adapter-v1',
    profile: 'specialist',
    preferredFamilies: ['eternities-daedalus'],
    prohibitedFamilies: [],
    prohibitedCapabilities: [],
    maxComposition: 3,
  }, portable);
  assert.ok(result.preferredIds.includes('eternities-daedalus'));
  assert.ok(result.preferredIds.includes('bounded-service-shutdown'));
  assert.equal(result.eligibleIds.length, 44);
});
