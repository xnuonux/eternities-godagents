import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

const expectedCommands = Object.freeze({
  'certify:admitted-sealed-typed-execution-host':
    'node scripts/build-admitted-sealed-typed-execution-host-v1-receipt.mjs',
  'certify:godskills-typed-composition-consumer':
    'node scripts/build-godskills-typed-composition-consumer-v1-receipt.mjs',
  'certify:recoverable-typed-execution-journal':
    'node scripts/build-recoverable-typed-execution-journal-v1-receipt.mjs',
  'certify:recoverable-realm-consequence':
    'node scripts/build-recoverable-realm-consequence-v1-receipt.mjs',
  'certify:sealed-local-typed-execution-runner':
    'node scripts/build-sealed-local-typed-execution-runner-v1-receipt.mjs',
});

test('certified typed-execution builders have stable public npm commands', async () => {
  const packageJson = JSON.parse(await readFile(`${repositoryRoot}/package.json`, 'utf8'));
  for (const [name, command] of Object.entries(expectedCommands)) {
    assert.equal(packageJson.scripts?.[name], command, `${name} must expose its receipt builder`);
    const scriptPath = command.replace(/^node /, '');
    await access(join(repositoryRoot, scriptPath));
  }
});
