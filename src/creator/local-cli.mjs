import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../core/canonical-json.mjs';
import { CreatorCliError, parseCreatorCliArgs } from './cli-contracts.mjs';
import {
  CreatorWorkflowError,
  finalizeOperatorPreset,
  loadOperatorCatalog,
  previewOperatorPreset,
} from './operator-workflow.mjs';

function writeCanonical(stream, value) {
  stream.write(`${canonicalJson(value)}\n`);
}

export async function runCreatorCli({ argv, stdout = process.stdout, stderr = process.stderr }) {
  try {
    const parsed = parseCreatorCliArgs(argv);
    if (parsed.command === 'catalog') {
      const catalog = await loadOperatorCatalog(parsed.options);
      writeCanonical(stdout, { schemaVersion: 1, status: 'ok', command: 'catalog', catalog });
    } else if (parsed.command === 'preview-preset') {
      writeCanonical(stdout, await previewOperatorPreset(parsed.options));
    } else {
      writeCanonical(stdout, await finalizeOperatorPreset(parsed.options));
    }
    return 0;
  } catch (error) {
    const known = error instanceof CreatorCliError || error instanceof CreatorWorkflowError;
    writeCanonical(stderr, {
      schemaVersion: 1,
      status: 'failed',
      code: known ? error.code : 'internal-failure',
    });
    if (error instanceof CreatorCliError) return 2;
    return known ? 3 : 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  process.exitCode = await runCreatorCli({ argv: process.argv.slice(2) });
}
