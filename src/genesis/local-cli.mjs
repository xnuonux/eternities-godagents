import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { LocalAdmissionCliError, parseLocalAdmissionCliArgs } from './local-cli-contracts.mjs';
import { admitLocalCreation, LocalAdmissionError } from './local-admission.mjs';

function writeCanonical(stream, value) {
  stream.write(`${canonicalJson(value)}\n`);
}

const DIGEST = /^[a-f0-9]{64}$/;
const KEEL_ID = /^keel-[a-f0-9]{64}$/;

function projectAdmission(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([
        'creationBuildId', 'distributionBuildId', 'genesisId', 'keelId',
        'receiptDigest', 'schemaVersion', 'status',
      ])) throw new TypeError('local admission result is invalid');
  if (value.schemaVersion !== 1 || value.status !== 'admitted'
      || !DIGEST.test(value.creationBuildId) || !DIGEST.test(value.distributionBuildId)
      || !DIGEST.test(value.genesisId) || !KEEL_ID.test(value.keelId)
      || !DIGEST.test(value.receiptDigest)) throw new TypeError('local admission result is invalid');
  return Object.freeze(structuredClone(value));
}

export async function runLocalAdmissionCli({
  argv,
  stdout = process.stdout,
  stderr = process.stderr,
  service = admitLocalCreation,
}) {
  try {
    const options = parseLocalAdmissionCliArgs(argv);
    if (typeof service !== 'function') throw new TypeError('local admission service is invalid');
    writeCanonical(stdout, projectAdmission(await service(options)));
    return 0;
  } catch (error) {
    const known = error instanceof LocalAdmissionCliError
      || (typeof LocalAdmissionError === 'function' && error instanceof LocalAdmissionError);
    writeCanonical(stderr, {
      schemaVersion: 1,
      status: 'failed',
      code: known ? error.code : 'internal-failure',
    });
    if (error instanceof LocalAdmissionCliError) return 2;
    return known ? 3 : 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  process.exitCode = await runLocalAdmissionCli({ argv: process.argv.slice(2) });
}
