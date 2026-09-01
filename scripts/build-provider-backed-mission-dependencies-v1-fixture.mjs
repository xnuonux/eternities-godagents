import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicProviderBackedMissionDependenciesFixture } from '../tests/helpers/provider-backed-mission-dependencies-certification-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'fixtures', 'provider-backed-mission-dependencies-v1.json');
const fixture = await buildDeterministicProviderBackedMissionDependenciesFixture();
await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  status: 'built',
  path: 'fixtures/provider-backed-mission-dependencies-v1.json',
  fixtureDigest: fixture.fixtureDigest,
})}\n`);
