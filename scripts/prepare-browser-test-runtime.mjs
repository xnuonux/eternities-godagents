import { open, lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { prepareBrowserRuntimeConfig } from '../src/workspace/browser-test-runtime.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';

async function readSelection(path) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 16384) throw new TypeError('selection exceeds limit');
    const buffer = Buffer.alloc(16385); let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > 16384) throw new TypeError('selection exceeds limit');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
  } finally { await file.close(); }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--selection' || args[2] !== '--output'
    || !isAbsolute(args[1]) || !isAbsolute(args[3])) throw new TypeError('expected explicit selection and output paths');
  const output = resolve(args[3]), parent = dirname(output);
  const stat = await lstat(parent), actual = await realpath(parent);
  const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!stat.isDirectory() || stat.isSymbolicLink() || key(actual) !== key(parent)) throw new TypeError('output parent is an alias');
  try { await lstat(output); throw new TypeError('output already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const runtime = await prepareBrowserRuntimeConfig(await readSelection(args[1]));
  const file = await open(output, 'wx', 0o600);
  try { await file.writeFile(`${canonicalJson(runtime)}\n`); await file.sync(); }
  finally { await file.close(); }
  process.stdout.write(`${JSON.stringify({ runtimePinScope: 'named-driver-and-engine-files',
    checkedFileCount: runtime.driver.files.length + runtime.browser.engineFiles.length + 2,
    runtimeDigest: sha256Value(runtime), importedDriver: false, launchedBrowser: false })}\n`);
} catch (error) {
  // Configuration/paths remain private; no raw stack or parsed input is echoed.
  process.stderr.write(`browser runtime preparation failed (${error.code ?? 'invalid-input-or-pins'})\n`);
  process.exitCode = 1;
}
