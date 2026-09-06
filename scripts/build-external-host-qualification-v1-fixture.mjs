import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicExternalHostQualificationFixture } from '../tests/helpers/external-host-qualification-fixture.mjs';

export async function buildExternalHostQualificationFixture() {
  return (await buildDeterministicExternalHostQualificationFixture()).dossier;
}

const output = resolve(process.argv[2] ?? 'fixtures/external-host-qualification-v1.json');
const fixture = await buildExternalHostQualificationFixture();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({ output, dossierDigest: fixture.dossierDigest, status: 'built' })}\n`);
