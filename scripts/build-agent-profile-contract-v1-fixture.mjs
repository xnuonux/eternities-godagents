import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { assertNoCredentialFields } from '../src/cortex/receipt-safety.mjs';
import { evaluateGodagentProfile } from '../src/agent/profile.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = resolve(root, 'fixtures', 'agent-profile-contract-v1.json');

const catalog = [
  { id: 'eternities-aegis', family: 'security' },
  { id: 'eternities-forge', family: 'construction' },
  { id: 'eternities-muse', family: 'visual' },
  { id: 'eternities-oracle', family: 'research' },
];

const allRounder = {
  profile: 'all-rounder',
  preferredFamilies: ['construction'],
  prohibitedFamilies: [],
  prohibitedCapabilities: [],
  maxComposition: 3,
};

const allRounderExplicitProhibition = {
  profile: 'all-rounder',
  preferredFamilies: ['construction'],
  prohibitedFamilies: [],
  prohibitedCapabilities: ['eternities-muse'],
  maxComposition: 3,
};

const specialist = {
  profile: 'specialist',
  preferredFamilies: ['construction'],
  prohibitedFamilies: ['visual'],
  prohibitedCapabilities: [],
  maxComposition: 2,
};

const orderingCatalog = [
  { id: 'a_0', family: 'ordering' },
  { id: 'a:0', family: 'ordering' },
  { id: 'a.0', family: 'ordering' },
  { id: 'a-0', family: 'ordering' },
];

const summarize = (result) => ({
  policy: result.policy,
  result,
});

export function buildAgentProfileContractFixture() {
  const cases = {
    allRounder: summarize(evaluateGodagentProfile(allRounder, catalog)),
    allRounderExplicitProhibition: summarize(
      evaluateGodagentProfile(allRounderExplicitProhibition, catalog),
    ),
    specialist: summarize(evaluateGodagentProfile(specialist, catalog)),
    emptyCatalog: summarize(evaluateGodagentProfile({
      profile: 'all-rounder',
      preferredFamilies: [],
      prohibitedFamilies: [],
      prohibitedCapabilities: [],
      maxComposition: 3,
    }, [])),
    ordering: summarize(evaluateGodagentProfile({
      profile: 'all-rounder',
      preferredFamilies: [],
      prohibitedFamilies: [],
      prohibitedCapabilities: [],
      maxComposition: 1,
    }, orderingCatalog)),
  };
  const assertions = {
    allRounderComplete: cases.allRounder.result.semantics.allRounderComplete
      && cases.allRounder.result.eligibleIds.length === catalog.length,
    staleAllRounderPreferenceInert: cases.allRounder.result.preferredIds.length === 0
      && cases.allRounder.result.eligibleIds.length === catalog.length,
    specialistPreferenceNonRestrictive: cases.specialist.result.preferredIds.join(',') === 'eternities-forge'
      && cases.specialist.result.eligibleIds.join(',') === 'eternities-aegis,eternities-forge,eternities-oracle',
    explicitProhibitionAuthoritative: cases.allRounderExplicitProhibition.result.prohibitedIds.join(',') === 'eternities-muse'
      && !cases.allRounderExplicitProhibition.result.eligibleIds.includes('eternities-muse'),
    emptyCatalogCompatible: cases.emptyCatalog.result.eligibleIds.length === 0
      && cases.emptyCatalog.result.semantics.allRounderComplete,
    localeIndependentOrdering: cases.ordering.result.eligibleIds.join(',') === 'a-0,a.0,a:0,a_0',
    compositionCeilingPreserved: cases.specialist.result.maxComposition === specialist.maxComposition,
  };
  const unsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-godagent-profile-fixture-v1',
    catalog,
    cases,
    assertions,
  };
  assertNoCredentialFields(unsigned);
  return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
}

async function main() {
  const fixture = buildAgentProfileContractFixture();
  await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    path: outputPath,
    fixtureDigest: fixture.fixtureDigest,
    bytes: Buffer.byteLength(`${canonicalJson(fixture)}\n`, 'utf8'),
    status: 'built',
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
