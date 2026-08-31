import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildDeterministicReceiptBoundTypedExecutorBundleHostFixture } from '../tests/helpers/receipt-bound-typed-executor-bundle-fixture.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const outputPath = resolve(repositoryRoot, 'fixtures/receipt-bound-typed-executor-bundle-v1.json');
const fixture = await buildDeterministicReceiptBoundTypedExecutorBundleHostFixture();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${fixture.fixtureDigest}\n`);
