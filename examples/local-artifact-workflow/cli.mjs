import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { prepareLocalWorkflow } from './prepare.mjs';
import { runLocalWorkflow, reconcileLocalWorkflow } from './run.mjs';
import { prepareArtifactProgram, runArtifactProgram } from './program.mjs';
import { readProgramRecord } from './program-store.mjs';

const help = 'prepare --config PATH --workspace PATH\nrun --manifest PATH --manifest-digest SHA256\n'
  + 'reconcile --manifest PATH --manifest-digest SHA256\n'
  + 'program-prepare --manifest PATH --manifest-digest SHA256 --definition PATH\n'
  + 'program-run --program PATH --program-digest SHA256\n'
  + 'program-prepare is inert. program-run may execute newly absent dependent tasks; it is not a no-inference inspection command.\n'
  + 'reconcile requires workflow 3. It may recover local evidence and publish a saved accepted artifact, but never starts new inference.\n'
  + 'prepare is inert. run may contact the explicitly configured provider. HTTP credentials come from the configured environment variable; Grok subscription credentials come from the auth file named in its pinned policy.\n';

function parse(argv) {
  const shapes = { prepare: ['--config', '--workspace'], run: ['--manifest', '--manifest-digest'],
    reconcile: ['--manifest', '--manifest-digest'], 'program-prepare': ['--manifest', '--manifest-digest', '--definition'],
    'program-run': ['--program', '--program-digest'] };
  if (!Array.isArray(argv) || !Object.hasOwn(shapes, argv[0]) || argv.length !== shapes[argv[0]].length * 2 + 1) return null;
  const allowed = shapes[argv[0]];
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.includes(key) || Object.hasOwn(options, key) || typeof value !== 'string'
        || !value.trim() || value.startsWith('--') || /[\0\r\n]/.test(value)) return null;
    options[key] = value;
  }
  const digestKey = argv[0] === 'program-run' ? '--program-digest' : '--manifest-digest';
  if (argv[0] !== 'prepare' && !/^[a-f0-9]{64}$/.test(options[digestKey])) return null;
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
      if ([2, 3].includes(configuration.schemaVersion)) {
        configuration.effectOnly.repositoryRoot = resolve(base, configuration.effectOnly.repositoryRoot);
      } else configuration.releasePin.repositoryRoot = resolve(base, configuration.releasePin.repositoryRoot);
      result = await prepareLocalWorkflow({ workspace: resolve(options['--workspace']), configuration });
    } else if (command === 'program-prepare') {
      const { value: definition } = await readProgramRecord(resolve(options['--definition']));
      result = await prepareArtifactProgram({ manifestPath: resolve(options['--manifest']), expectedManifestDigest: options['--manifest-digest'], definition });
    } else if (command === 'program-run') {
      result = await runArtifactProgram({ programManifestPath: resolve(options['--program']), expectedProgramManifestDigest: options['--program-digest'], env });
    } else {
      result = await (command === 'reconcile' ? reconcileLocalWorkflow : runLocalWorkflow)({ manifestPath: resolve(options['--manifest']),
        expectedManifestDigest: options['--manifest-digest'], env });
    }
    stdout.write(`${canonicalJson(result)}\n`);
    if (result.status === 'rejected') return 4;
    return ['absent', 'pending', 'needs-decision'].includes(result.status) ? 3 : 0;
  } catch {
    // Never print provider bodies, configuration contents, paths from exceptions, or credentials.
    stderr.write(`${canonicalJson({ status: 'failed', code: 'workflow-failed' })}\n`);
    return 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) process.exitCode = await runLocalWorkflowCli({ argv: process.argv.slice(2) });
