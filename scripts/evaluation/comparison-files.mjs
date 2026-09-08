import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
const maximumFileBytes = 1_048_576;

// Verifies only the explicitly declared files. It does not establish a complete
// import closure, approve source code, load modules or authorize dispatch.
export async function captureComparisonFiles(input) {
  const pins = structuredClone(input);
  if (!Array.isArray(pins) || pins.length < 1 || pins.length > 32) throw new Error('comparison file count exceeds bound');
  const seen = new Set();
  for (const pin of pins) {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin)
        || Object.keys(pin).sort().join(',') !== 'path,sha256'
        || typeof pin.path !== 'string' || !isAbsolute(pin.path) || /[\0\r\n]/.test(pin.path)
        || typeof pin.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw new Error('comparison file pin is invalid');
    pin.path = resolve(pin.path);
    if (seen.has(key(pin.path))) throw new Error('duplicate comparison file');
    seen.add(key(pin.path));
  }
  let total = 0;
  const captured = [];
  for (const pin of pins) {
    if (key(await realpath(pin.path)) !== key(pin.path)) throw new Error('comparison file alias rejected');
    const linkStat = await lstat(pin.path);
    if (!linkStat.isFile() || linkStat.isSymbolicLink()) throw new Error('comparison file must be regular');
    const file = await open(pin.path, 'r');
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > maximumFileBytes) throw new Error('comparison file exceeds bound');
      const buffer = Buffer.alloc(maximumFileBytes + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
        if (!bytesRead) break;
        size += bytesRead;
      }
      total += size;
      if (size > maximumFileBytes || total > 4_194_304) throw new Error('comparison bytes exceed bound');
      const bytes = buffer.subarray(0, size);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== pin.sha256) throw new Error('comparison file digest mismatch');
      if (key(await realpath(pin.path)) !== key(pin.path)) throw new Error('comparison file alias changed');
      captured.push(Object.freeze({ path: pin.path, sha256, base64: bytes.toString('base64') }));
    } finally { await file.close(); }
  }
  return Object.freeze(captured);
}
