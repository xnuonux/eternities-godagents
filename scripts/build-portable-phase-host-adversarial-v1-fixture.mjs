import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicPortablePhaseHostAdversarialFixture } from '../tests/helpers/portable-phase-host-adversarial-fixture.mjs';

export { buildDeterministicPortablePhaseHostAdversarialFixture };

const output = resolve(process.argv[2] ?? 'fixtures/portable-phase-host-adversarial-v1.json');
const fixture = await buildDeterministicPortablePhaseHostAdversarialFixture();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({ fixtureDigest: fixture.fixtureDigest, output, status: 'built' })}\n`);
