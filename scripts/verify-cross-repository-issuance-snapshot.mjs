import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { verifyCrossRepositoryIssuanceSnapshot } from '../src/integration/current-head-certificate.mjs';

const GODSKILLS_ROOT = resolve('C:/dev/eternities-godskills');
const CERTIFICATE_PATH = 'integrations/cross-repository-issuance-snapshot-v1.json';

async function main() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const text = await readFile(join(repositoryRoot, CERTIFICATE_PATH), 'utf8');
  const receipt = JSON.parse(text);
  if (text !== `${canonicalJson(receipt)}\n`) throw new Error('cross-repository certificate is not canonical');
  const result = await verifyCrossRepositoryIssuanceSnapshot(receipt, {
    godagentsRoot: repositoryRoot,
    godskillsRoot: GODSKILLS_ROOT,
  });
  process.stdout.write(`${canonicalJson({ ...result, path: CERTIFICATE_PATH })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
