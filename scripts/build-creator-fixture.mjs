import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildCreatorFixture } from '../src/certification/certify-creator-protocol-phase3.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputRoot = resolve(repositoryRoot, 'artifacts', 'creator-fixture');
await rm(outputRoot, { recursive: true, force: true });
const result = await buildCreatorFixture({ repositoryRoot, outputRoot });
process.stdout.write(`${canonicalJson(result.fixture)}\n`);
