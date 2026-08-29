import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { AdmittedLaunchCliError, parseAdmittedLaunchCliArgs } from './admitted-cli-contracts.mjs';
import { AdmittedLaunchError, launchAdmittedLocalAgent } from './admitted-launch.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const KEEL_ID = /^keel-[a-f0-9]{64}$/;
const DISCREPANCY = new Set(['none', 'unexpected-state', 'unverified-effect', 'denied', 'failed']);
const RESULT_KEYS = Object.freeze([
  'actionId', 'decisionId', 'discrepancyClass', 'genesisId', 'instanceId', 'keelId', 'schemaVersion', 'status',
]);

function writeCanonical(stream, value) {
  stream.write(`${canonicalJson(value)}\n`);
}

function safeIdentifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\0\r\n]/.test(value);
}

function projectResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson(RESULT_KEYS)
      || value.schemaVersion !== 1 || value.status !== 'completed'
      || !safeIdentifier(value.instanceId) || !DIGEST.test(value.genesisId)
      || !KEEL_ID.test(value.keelId) || !safeIdentifier(value.decisionId)
      || !safeIdentifier(value.actionId) || !DISCREPANCY.has(value.discrepancyClass)) {
    throw new TypeError('admitted launch result is invalid');
  }
  return Object.freeze(structuredClone(value));
}

export async function runAdmittedLaunchCli({
  argv,
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  service = launchAdmittedLocalAgent,
}) {
  try {
    const options = parseAdmittedLaunchCliArgs(argv);
    if (typeof service !== 'function') throw new TypeError('admitted launch service is invalid');
    writeCanonical(stdout, projectResult(await service({ ...options, env })));
    return 0;
  } catch (error) {
    const known = error instanceof AdmittedLaunchCliError || error instanceof AdmittedLaunchError;
    writeCanonical(stderr, {
      schemaVersion: 1,
      status: 'failed',
      code: known ? error.code : 'internal-failure',
    });
    if (error instanceof AdmittedLaunchCliError) return 2;
    return known ? 3 : 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  process.exitCode = await runAdmittedLaunchCli({ argv: process.argv.slice(2) });
}
