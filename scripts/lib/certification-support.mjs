import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { sha256Text, sha256Value } from '../../src/core/digest.mjs';

const execFileAsync = promisify(execFile);
const commitPattern = /^[a-f0-9]{40}$/;

function controlledGitEnvironment() {
  const environment = { ...process.env };
  for (const name of [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR',
  ]) delete environment[name];
  return environment;
}

async function git(root, args, options = {}) {
  return execFileAsync('git', ['-C', root, ...args], {
    windowsHide: true,
    env: controlledGitEnvironment(),
    ...options,
  });
}

export async function gitText(root, commit, path) {
  const { stdout } = await git(root, ['show', `${commit}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export async function assertCommit(root, commit) {
  if (!commitPattern.test(commit)) throw new Error('certification source commit is invalid');
  await git(root, ['cat-file', '-e', `${commit}^{commit}`]);
}

export async function manifestAtCommit(root, commit, paths) {
  const entries = [];
  for (const path of paths) {
    const text = await gitText(root, commit, path);
    entries.push({ path, sha256: sha256Text(text), bytes: Buffer.byteLength(text, 'utf8') });
  }
  return { paths: [...paths], entries, digest: sha256Value(entries) };
}

export async function pathsAtCommit(root, commit, directory) {
  const { stdout } = await git(root, ['ls-tree', '-r', '--name-only', commit, '--', directory], {
    encoding: 'utf8',
  });
  return stdout.split(/\r?\n/).filter(Boolean).sort();
}

export async function historicalAtCommit(root, commit, paths) {
  const rows = [];
  for (const path of paths) rows.push([path, sha256Text(await gitText(root, commit, path))]);
  return Object.fromEntries(rows);
}

export async function changedPathsBetween(root, fromCommit, toCommit) {
  await assertCommit(root, fromCommit);
  await assertCommit(root, toCommit);
  await git(root, ['merge-base', '--is-ancestor', fromCommit, toCommit]);
  const { stdout } = await git(
    root,
    ['diff', '--name-only', '--no-renames', `${fromCommit}..${toCommit}`],
    { encoding: 'utf8' },
  );
  return stdout.split(/\r?\n/).filter(Boolean).sort();
}

export function runTests(files, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...files], {
      cwd,
      shell: false,
      windowsHide: true,
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => {
      const number = (name) => Number(output.match(new RegExp(`(?:^|\\n)# ${name} (\\d+)(?:\\r?$|\\n)`))?.[1]);
      const tests = number('tests');
      if (code !== 0 || !Number.isInteger(tests) || tests < 1
          || number('pass') !== tests || number('fail') !== 0 || number('skipped') !== 0) {
        rejectPromise(new Error(`certification test gate failed with code ${code}`));
      } else {
        resolvePromise({ status: 'pass', tests });
      }
    });
  });
}

async function dirtyPaths(root) {
  const outputs = await Promise.all([
    git(root, ['diff', '--name-only'], { encoding: 'utf8' }),
    git(root, ['diff', '--cached', '--name-only'], { encoding: 'utf8' }),
    git(root, ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }),
  ]);
  return [...new Set(outputs.flatMap(({ stdout }) => stdout.split(/\r?\n/).filter(Boolean)))].sort();
}

export async function requireCleanExcept(root, allowed) {
  const unexpected = (await dirtyPaths(root)).filter((path) => !allowed.includes(path));
  if (unexpected.length > 0) throw new Error(`source worktree has unexpected changes: ${unexpected.join(', ')}`);
}

export async function resolveSourceCommit({ root, headCommit, outputPath, releaseOnlyPaths }) {
  try {
    const receipt = JSON.parse(await readFile(outputPath, 'utf8'));
    const sourceCommit = receipt.source?.commit;
    await assertCommit(root, sourceCommit);
    await git(root, ['merge-base', '--is-ancestor', sourceCommit, headCommit]);
    const changed = (await git(
      root,
      ['diff', '--name-only', '--no-renames', `${sourceCommit}..${headCommit}`],
      { encoding: 'utf8' },
    )).stdout.split(/\r?\n/).filter(Boolean);
    return changed.every((path) => releaseOnlyPaths.includes(path)) ? sourceCommit : headCommit;
  } catch (error) {
    if (error?.code === 'ENOENT') return headCommit;
    throw error;
  }
}

export async function headCommit(root) {
  return (await git(root, ['rev-parse', 'HEAD'], { encoding: 'utf8' })).stdout.trim();
}
