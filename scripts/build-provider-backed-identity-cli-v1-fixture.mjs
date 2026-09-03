import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicProviderBackedIdentityCliFixture } from '../tests/helpers/provider-backed-identity-cli-certification-fixture.mjs';

export { buildDeterministicProviderBackedIdentityCliFixture };

const output = resolve(
  process.argv[2] ?? 'fixtures/provider-backed-identity-cli-v1.json',
);
const fixture = await buildDeterministicProviderBackedIdentityCliFixture();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  fixtureDigest: fixture.fixtureDigest,
  output,
  status: 'built',
})}\n`);
