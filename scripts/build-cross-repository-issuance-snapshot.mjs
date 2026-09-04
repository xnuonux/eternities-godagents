import { execFile, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { buildCrossRepositoryIssuanceSnapshot } from '../src/integration/current-head-certificate.mjs';
import {
  pinnedGodskillsReviewRelease,
  pinnedGodskillsReviewSourceCommit,
} from './lib/pinned-godskills-review-release.mjs';

const execFileAsync = promisify(execFile);
const GODSKILLS_ROOT = resolve('C:/dev/eternities-godskills');
const OUTPUT_PATH = 'integrations/cross-repository-issuance-snapshot-v1.json';
const FOCUSED_GODAGENTS_TESTS = [
  'tests/cross-repository-issuance-snapshot.test.mjs',
  'tests/godskills-adaptive-activation.test.mjs',
  'tests/godskills-mission-binder.test.mjs',
  'tests/godskills-v3-integration.test.mjs',
  'tests/portable-sdk-surface.test.mjs',
];
const FOCUSED_GODSKILLS_TESTS = [
  'tests/eternities-beacon-release.test.mjs',
  'tests/godskills-system-v3-certification.test.mjs',
  'tests/intent-compiler-v3-certification.test.mjs',
  'tests/portable-capability-manifest.test.mjs',
];

function cleanGitEnvironment() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return env;
}

async function git(repositoryRoot, args, label) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repositoryRoot, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      env: cleanGitEnvironment(),
    });
    return stdout.trim();
  } catch {
    throw new Error(`${label} failed`);
  }
}

function runTests(args, cwd, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--test', ...args], {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      const matches = [...output.matchAll(/(?:^|\n)[^\S\r\n]*(?:ℹ|#)?\s*tests\s+(\d+)/g)];
      const tests = Number(matches.at(-1)?.[1]);
      if (code !== 0 || !Number.isInteger(tests) || tests < 1) {
        rejectPromise(new Error(`${label} failed`));
      } else {
        resolvePromise({ status: 'pass', tests });
      }
    });
  });
}

async function main() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [godagentsCommit, godagentsOrigin, godskillsCommit, godskillsOrigin] = await Promise.all([
    git(repositoryRoot, ['rev-parse', 'main'], 'Godagents main'),
    git(repositoryRoot, ['rev-parse', 'origin/main'], 'Godagents origin main'),
    git(GODSKILLS_ROOT, ['rev-parse', 'main'], 'Godskills main'),
    git(GODSKILLS_ROOT, ['rev-parse', 'origin/main'], 'Godskills origin main'),
  ]);
  if (godagentsCommit !== godagentsOrigin || godskillsCommit !== godskillsOrigin) {
    throw new Error('repositories are not reconciled at identical main heads');
  }
  const godagentsFocused = await runTests(
    FOCUSED_GODAGENTS_TESTS,
    repositoryRoot,
    'Godagents focused tests',
  );
  const godagentsFull = await runTests([], repositoryRoot, 'Godagents full tests');
  const godskillsFocused = await runTests(
    FOCUSED_GODSKILLS_TESTS,
    GODSKILLS_ROOT,
    'Godskills focused tests',
  );
  const receipt = await buildCrossRepositoryIssuanceSnapshot({
    godagentsRoot: repositoryRoot,
    godskillsRoot: GODSKILLS_ROOT,
    godagentsCommit,
    godskillsCommit,
    refs: {
      godagents: { main: godagentsCommit, originMain: godagentsOrigin },
      godskills: { main: godskillsCommit, originMain: godskillsOrigin },
    },
    adaptiveReviewPin: pinnedGodskillsReviewRelease(GODSKILLS_ROOT),
    adaptiveReviewSource: {
      path: 'scripts/lib/pinned-godskills-review-release.mjs',
      sourceCommit: pinnedGodskillsReviewSourceCommit,
    },
    testRuns: { godagentsFocused, godagentsFull, godskillsFocused },
  });
  const outputPath = join(repositoryRoot, OUTPUT_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({
    status: receipt.status,
    receiptDigest: receipt.receiptDigest,
    outputPath,
    godagentsCommit,
    godskillsCommit,
    testRuns: receipt.testRuns,
  })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
