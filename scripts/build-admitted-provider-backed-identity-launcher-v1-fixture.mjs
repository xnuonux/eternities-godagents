import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicAdmittedProviderBackedIdentityLauncherFixture } from '../tests/helpers/admitted-provider-backed-identity-launcher-certification-fixture.mjs';

const output = resolve(
  process.argv[2] ?? 'fixtures/admitted-provider-backed-identity-launcher-v1.json',
);
const fixture = await buildDeterministicAdmittedProviderBackedIdentityLauncherFixture();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  fixtureDigest: fixture.fixtureDigest,
  output,
  status: 'built',
})}\n`);
