import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicProviderPhaseResolutionFixture } from '../tests/helpers/provider-phase-resolution-certification-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'fixtures', 'provider-neutral-phase-resolution-v1.json');
const fixture = await buildDeterministicProviderPhaseResolutionFixture();
await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  status: 'written', outputPath, fixtureDigest: fixture.fixtureDigest,
})}\n`);
