import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicPortableRealmConsequenceSdkFixture } from '../tests/helpers/portable-realm-consequence-sdk-fixture.mjs';

export async function buildPortableRealmConsequenceSdkFixture() {
  return buildDeterministicPortableRealmConsequenceSdkFixture();
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const fixture = await buildPortableRealmConsequenceSdkFixture();
  await writeFile(
    join(root, 'fixtures', 'portable-realm-consequence-sdk-v1.json'),
    `${canonicalJson(fixture)}\n`,
    'utf8',
  );
  process.stdout.write(`${canonicalJson({
    status: 'built',
    fixtureDigest: fixture.fixtureDigest,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
