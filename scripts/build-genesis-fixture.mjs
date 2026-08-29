import { rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGenesisFixture } from '../src/certification/certify-transactional-genesis-phase2.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(root, 'artifacts', 'genesis-fixture');
await rm(outputRoot, { recursive: true, force: true });
const result = await buildGenesisFixture({ repositoryRoot: root, outputRoot });
process.stdout.write(`${result.genesisReceipt.receiptDigest}\n`);
