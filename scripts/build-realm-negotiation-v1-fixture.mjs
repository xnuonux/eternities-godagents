import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildRealmNegotiation } from '../src/realm/negotiation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = join(root, 'fixtures', 'realm-contract.json');
const outputPath = join(root, 'fixtures', 'realm-negotiation-v1.json');
const contractText = await readFile(contractPath, 'utf8');
const contract = JSON.parse(contractText);
const writableAuthority = {
  availableAuthority: ['realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};
const readOnlyAuthority = {
  availableAuthority: [],
  permittedEffects: ['local-read'],
};

const unsigned = {
  schemaVersion: 1,
  protocolId: 'eternities-realm-negotiation-fixture-v1',
  sourceContract: {
    path: 'fixtures/realm-contract.json',
    fileSha256: sha256Text(contractText),
    logicalDigest: sha256Value(contract),
    value: contract,
  },
  cases: {
    readOnly: {
      authority: readOnlyAuthority,
      negotiation: buildRealmNegotiation({ contract, authority: readOnlyAuthority }),
    },
    writable: {
      authority: writableAuthority,
      negotiation: buildRealmNegotiation({ contract, authority: writableAuthority }),
    },
  },
  assertions: {
    sourceContractCount: 1,
    writableAvailableHands: 1,
    readOnlyAvailableHands: 0,
    authorityExpansions: 0,
    executableFields: 0,
    providerCalls: 0,
  },
};
const fixture = { ...unsigned, fixtureDigest: sha256Value(unsigned) };
await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  status: 'written',
  outputPath,
  fixtureDigest: fixture.fixtureDigest,
})}\n`);
