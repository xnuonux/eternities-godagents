import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicPortablePhaseHostConformanceFixture } from '../tests/helpers/portable-phase-host-conformance-fixture.mjs';

export { buildDeterministicPortablePhaseHostConformanceFixture };

const output = resolve(process.argv[2] ?? 'fixtures/portable-phase-host-conformance-v1.json');
const fixture = await buildDeterministicPortablePhaseHostConformanceFixture();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({ fixtureDigest: fixture.fixtureDigest, output, status: 'built' })}\n`);
