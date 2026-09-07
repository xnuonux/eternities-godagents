import { open, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';

const FIELDS = ['hostBindingDigest', 'requestDigest', 'routingReceiptDigest', 'verifierReceiptDigest'];
const identity = p => process.platform === 'win32' ? p.toLowerCase() : p;

// The host owns the canonical parent and derives one stable slot per mission.
// This is a single-attempt claim, not authorization, completion, or retry logic.
// An interrupted write remains evidence. Never delete, replace or reinterpret
// an existing record as permission for a new launch.
export async function claimEffectOnlyRoutingExecution({ recordPath, executionIdentity }) {
  const binding = structuredClone(executionIdentity);
  if (!binding || canonicalJson(Object.keys(binding).sort()) !== canonicalJson(FIELDS)
      || Object.values(binding).some(v => typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))) {
    throw new Error('effect-only execution binding is invalid');
  }
  const target = resolve(recordPath);
  const parent = dirname(target);
  if (identity(await realpath(parent)) !== identity(parent)) throw new Error('execution parent alias rejected');
  const unsigned = { schemaVersion: 1, protocolId: 'eternities-effect-only-routing-execution-v2',
    state: 'started', executionIdentity: binding };
  const record = { ...unsigned, executionDigest: sha256Value(unsigned) };
  const content = `${canonicalJson(record)}\n`;
  let handle;
  try {
    handle = await open(target, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (identity(await realpath(target)) !== identity(target)) throw new Error('execution record alias rejected');
    const existing = await open(target, 'r');
    try {
      const stat = await existing.stat();
      if (!stat.isFile() || stat.size > 4096) throw new Error('execution record exceeds bound');
      const bytes = Buffer.alloc(4097);
      let length = 0;
      while (length < bytes.length) {
        const next = await existing.read(bytes, length, bytes.length - length, null);
        if (!next.bytesRead) break;
        length += next.bytesRead;
      }
      if (length > 4096 || !bytes.subarray(0, length).equals(Buffer.from(content))) {
        throw new Error('execution record binding mismatch or incomplete publication');
      }
    } finally { await existing.close(); }
    return Object.freeze({ status: 'pending', record: freezeRecord(record) });
  }
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
  return Object.freeze({ status: 'claimed', record: freezeRecord(record) });
}

function freezeRecord(record) {
  Object.freeze(record.executionIdentity);
  return Object.freeze(record);
}
