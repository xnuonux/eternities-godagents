import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicAdmittedPortableIdentityLauncherFixture } from '../tests/helpers/admitted-portable-identity-launcher-certification-fixture.mjs';

const output = resolve(
  process.argv[2] ?? 'fixtures/admitted-portable-identity-launcher-v1.json',
);
const fixture = await buildDeterministicAdmittedPortableIdentityLauncherFixture();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  fixtureDigest: fixture.fixtureDigest,
  output,
  status: 'built',
})}\n`);
