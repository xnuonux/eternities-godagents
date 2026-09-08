import { spawn } from 'node:child_process';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { resolve, join, toNamespacedPath } from 'node:path';
import { assertVerifiedEffectOnlyExecutable, assertVerifiedEffectOnlyVerifier,
  materializeEffectOnlyExecutable } from './effect-only-executable-verifier.mjs';

const key = p => process.platform === 'win32' ? p.toLowerCase() : p;
function encoded(value, limit) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || Buffer.byteLength(text) > limit) throw new Error('effect-only process input exceeds bound');
  return text;
}
async function existingDirectory(input) {
  const path = resolve(input);
  if (key(await realpath(path)) !== key(path)) throw new Error('effect-only process directory alias rejected');
  return path;
}
function run(entrypoint, args, cwd, timeoutMs) {
  const env = {};
  for (const name of ['SystemRoot', 'WINDIR']) if (process.env[name]) env[name] = process.env[name];
  return new Promise((accept, reject) => {
    let timedOut = false;
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd, env, shell: false, windowsHide: true, stdio: 'ignore',
    });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.once('error', () => { clearTimeout(timer); reject(new Error('effect-only process launch failed')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('effect-only process observation timed out'));
      else accept(code === 0);
    });
  });
}

// Internal process boundary, not host-policy authentication or native admission.
// Inputs and snapshots stay within host-owned directories. No provider, shell,
// inherited credential environment, automatic retry, or captured child output.
export async function createEffectOnlyProcessAdapters({ routingExecutable,
  verifierExecutable, snapshotParent, timeoutMs = 5000 }) {
  assertVerifiedEffectOnlyExecutable(routingExecutable);
  assertVerifiedEffectOnlyVerifier(verifierExecutable, routingExecutable);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('effect-only process timeout invalid');
  const parent = await existingDirectory(snapshotParent);
  const routing = await materializeEffectOnlyExecutable({ verifiedExecutable: routingExecutable, parent });
  const verification = await materializeEffectOnlyExecutable({ verifiedExecutable: verifierExecutable, parent });
  const counters = { routingSubprocesses: 0, verificationSubprocesses: 0 };
  async function inputs(operationRoot, request, expectedSource, result) {
    // Bound serialization before creating any per-call files.
    const requestBytes = encoded(request, 1_048_576);
    const sourceBytes = encoded(expectedSource, 1_048_576);
    const resultBytes = result === undefined ? null : encoded(result, 2_097_152);
    const root = await existingDirectory(operationRoot);
    const folder = await mkdtemp(toNamespacedPath(join(root, 'process-input-')));
    const requestPath = join(folder, 'request.json');
    const sourcePath = join(folder, 'source.json');
    await writeFile(requestPath, requestBytes, { flag: 'wx', mode: 0o600 });
    await writeFile(sourcePath, sourceBytes, { flag: 'wx', mode: 0o600 });
    const args = ['--request', requestPath, '--expected-source', sourcePath];
    if (resultBytes !== null) {
      const resultPath = join(folder, 'result.json');
      await writeFile(resultPath, resultBytes, { flag: 'wx', mode: 0o600 });
      args.push('--result', resultPath);
    }
    return args;
  }
  return Object.freeze({
    async route({ operationRoot, resultPath, request, expectedSource }) {
      const root = await existingDirectory(operationRoot);
      if (key(resolve(resultPath)) !== key(join(root, 'result.json'))) throw new Error('effect-only result path invalid');
      const args = await inputs(root, request, expectedSource);
      counters.routingSubprocesses += 1;
      if (!await run(routing.entrypoint, [...args, '--output', resultPath], routing.root, timeoutMs)) throw new Error('effect-only routing process failed');
    },
    async verify({ operationRoot, request, expectedSource, result }) {
      const args = await inputs(operationRoot, request, expectedSource, result);
      counters.verificationSubprocesses += 1;
      return run(verification.entrypoint, args, verification.root, timeoutMs);
    },
    counters: () => Object.freeze({ ...counters }),
  });
}
