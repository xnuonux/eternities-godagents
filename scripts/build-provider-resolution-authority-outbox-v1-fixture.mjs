import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicProviderResolutionAuthorityOutboxFixture } from '../tests/helpers/provider-resolution-authority-outbox-certification-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'fixtures', 'provider-resolution-authority-outbox-v1.json');
const fixture = await buildDeterministicProviderResolutionAuthorityOutboxFixture();
await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({ status: 'written', outputPath, fixtureDigest: fixture.fixtureDigest })}\n`);
