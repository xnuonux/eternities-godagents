import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GODAGENT_PROFILE_PROTOCOL_ID,
  evaluateGodagentProfile,
  validateGodagentProfilePolicy,
} from '../src/agent/profile.mjs';

const catalog = [
  { id: 'eternities-aegis', family: 'security' },
  { id: 'eternities-forge', family: 'construction' },
  { id: 'eternities-muse', family: 'visual' },
];

const allRounder = {
  profile: 'all-rounder',
  preferredFamilies: [],
  prohibitedFamilies: [],
  prohibitedCapabilities: [],
  maxComposition: 3,
};

const specialist = {
  profile: 'specialist',
  preferredFamilies: ['construction'],
  prohibitedFamilies: ['visual'],
  prohibitedCapabilities: [],
  maxComposition: 2,
};

test('all-rounder is complete over the supplied body-free catalog', () => {
  const result = evaluateGodagentProfile(allRounder, catalog);
  assert.equal(result.protocolId, GODAGENT_PROFILE_PROTOCOL_ID);
  assert.deepEqual(result.eligibleIds, ['eternities-aegis', 'eternities-forge', 'eternities-muse']);
  assert.deepEqual(result.preferredIds, []);
  assert.deepEqual(result.prohibitedIds, []);
  assert.equal(result.maxComposition, 3);
  assert.deepEqual(result.semantics, {
    allRounderComplete: true,
    allRounderPreferencesInert: true,
    explicitProhibitionsAuthoritative: true,
    nonProhibitedCapabilitiesPreserved: true,
    preferenceIsNonRestrictive: true,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.eligibleIds), true);
});

test('specialist preference never removes non-prohibited capabilities', () => {
  const result = evaluateGodagentProfile(specialist, catalog);
  assert.deepEqual(result.eligibleIds, ['eternities-aegis', 'eternities-forge']);
  assert.deepEqual(result.preferredIds, ['eternities-forge']);
  assert.deepEqual(result.prohibitedIds, ['eternities-muse']);
  assert.equal(result.semantics.allRounderComplete, false);
  assert.equal(result.semantics.nonProhibitedCapabilitiesPreserved, true);
  assert.equal(result.semantics.preferenceIsNonRestrictive, true);
});

test('an empty catalog remains a valid legacy-compatible all-rounder result', () => {
  const result = evaluateGodagentProfile(allRounder, []);

  assert.deepEqual(result.eligibleIds, []);
  assert.deepEqual(result.preferredIds, []);
  assert.deepEqual(result.prohibitedIds, []);
  assert.equal(result.semantics.allRounderComplete, true);
});

test('profile and catalog ordering do not change the result digest', () => {
  const reordered = evaluateGodagentProfile({
    ...specialist,
    preferredFamilies: ['construction'],
    prohibitedFamilies: ['visual'],
  }, [...catalog].reverse());
  const canonical = evaluateGodagentProfile(specialist, catalog);
  assert.deepEqual(reordered, canonical);
});

test('all-rounder preferences remain inert while specialist contradictions fail closed', () => {
  const result = evaluateGodagentProfile({ ...allRounder, preferredFamilies: ['construction'] }, catalog);
  assert.deepEqual(result.eligibleIds, ['eternities-aegis', 'eternities-forge', 'eternities-muse']);
  assert.deepEqual(result.preferredIds, []);
  assert.equal(result.semantics.allRounderComplete, true);
  assert.equal(result.semantics.allRounderPreferencesInert, true);
  assert.throws(
    () => validateGodagentProfilePolicy({ ...specialist, prohibitedFamilies: ['construction'] }),
    /contradictory|preferred.*prohibited/i,
  );
});

test('all-rounder explicit prohibitions remain authoritative and are visible in semantics', () => {
  const result = evaluateGodagentProfile({ ...allRounder, prohibitedCapabilities: ['eternities-muse'] }, catalog);
  assert.deepEqual(result.eligibleIds, ['eternities-aegis', 'eternities-forge']);
  assert.deepEqual(result.prohibitedIds, ['eternities-muse']);
  assert.deepEqual(result.preferredIds, []);
  assert.equal(result.semantics.allRounderComplete, false);
  assert.equal(result.semantics.allRounderPreferencesInert, true);
  assert.equal(result.semantics.explicitProhibitionsAuthoritative, true);
  assert.equal(result.semantics.nonProhibitedCapabilitiesPreserved, true);
});

test('unknown fields, duplicate entries, unknown families, and unknown ids fail closed', () => {
  assert.throws(
    () => evaluateGodagentProfile({ ...allRounder, unexpected: true }, catalog),
    /fields|unknown/i,
  );
  assert.throws(
    () => evaluateGodagentProfile({ ...specialist, preferredFamilies: ['construction', 'construction'] }, catalog),
    /duplicate/i,
  );
  assert.throws(
    () => evaluateGodagentProfile({ ...allRounder, prohibitedFamilies: ['unknown'] }, catalog),
    /unknown family/i,
  );
  assert.throws(
    () => evaluateGodagentProfile({ ...allRounder, prohibitedCapabilities: ['missing'] }, catalog),
    /unknown capability/i,
  );
  assert.throws(
    () => evaluateGodagentProfile(allRounder, [{ id: 'eternities-forge', family: 'construction' }, ...catalog]),
    /duplicate.*id/i,
  );
});
