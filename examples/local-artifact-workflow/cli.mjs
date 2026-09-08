import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { prepareLocalWorkflow } from './prepare.mjs';
import { runLocalWorkflow } from './run.mjs';

const help = 'prepare --config PATH --workspace PATH\nrun --manifest PATH --manifest-digest SHA256\n'
  + 'prepare is inert. run may contact the explicitly configured provider. credentials come from its configured environment variable only.\n';

function parse(argv) {
  if (!Array.isArray(argv) || !['prepare', 'run'].includes(argv[0]) || argv.length !== 5) return null;
  const allowed = argv[0] === 'prepare' ? ['--config', '--workspace'] : ['--manifest', '--manifest-digest'];
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.includes(key) || Object.hasOwn(options, key) || typeof value !== 'string'
        || !value.trim() || value.startsWith('--') || /[\0\r\n]/.test(value)) return null;
    options[key] = value;
  }
  if (argv[0] === 'run' && !/^[a-f0-9]{64}$/.test(options['--manifest-digest'])) return null;
  return { command: argv[0], options };
}

export async function runLocalWorkflowCli({ argv, stdout = process.stdout, stderr = process.stderr,
  env = process.env } = {}) {
  if (Array.isArray(argv) && argv.length === 1 && argv[0] === '--help') {
    stdout.write(help);
    return 0;
  }
  const parsed = parse(argv);
  if (!parsed) {
    stderr.write(`${canonicalJson({ status: 'failed', code: 'invalid-arguments' })}\n`);
    return 2;
  }
  try {
    const { command, options } = parsed;
    let result;
    if (command === 'prepare') {
      const configPath = resolve(options['--config']);
      const stat = await lstat(configPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_048_576) throw new Error('invalid configuration file');
      const configuration = JSON.parse(await readFile(configPath, 'utf8'));
      const base = dirname(configPath);
      configuration.providerPolicyPath = resolve(base, configuration.providerPolicyPath);
      for (const key of ['creationDir', 'promptArtifactPath', 'realmContractPath']) {
        configuration.admission[key] = resolve(base, configuration.admission[key]);
      }
      if (configuration.schemaVersion === 2) {
        configuration.effectOnly.repositoryRoot = resolve(base, configuration.effectOnly.repositoryRoot);
      } else configuration.releasePin.repositoryRoot = resolve(base, configuration.releasePin.repositoryRoot);
      result = await prepareLocalWorkflow({ workspace: resolve(options['--workspace']), configuration });
    } else {
      result = await runLocalWorkflow({ manifestPath: resolve(options['--manifest']),
        expectedManifestDigest: options['--manifest-digest'], env });
    }
    stdout.write(`${canonicalJson(result)}\n`);
    if (result.status === 'rejected') return 4;
    return result.status === 'pending' || result.status === 'needs-decision' ? 3 : 0;
  } catch {
    // Never print provider bodies, configuration contents, paths from exceptions, or credentials.
    stderr.write(`${canonicalJson({ status: 'failed', code: 'workflow-failed' })}\n`);
    return 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) process.exitCode = await runLocalWorkflowCli({ argv: process.argv.slice(2) });
