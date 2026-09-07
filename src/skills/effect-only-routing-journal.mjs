import { mkdir, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value, sha256Text } from '../core/digest.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { claimEffectOnlyRoutingExecution } from './effect-only-execution-claim.mjs';

const key = p => process.platform === 'win32' ? p.toLowerCase() : p;
const json = value => `${canonicalJson(value)}\n`;
function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('journal binding digest invalid');
}
async function canonicalDirectory(path) {
  if (key(await realpath(path)) !== key(path)) throw new Error('journal directory alias rejected');
}
async function readBounded(path, limit) {
  let actual;
  try { actual = await realpath(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (key(actual) !== key(path)) throw new Error('journal file alias rejected');
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('journal file exceeds bound');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const next = await handle.read(buffer, length, buffer.length - length, null);
      if (!next.bytesRead) break;
      length += next.bytesRead;
    }
    if (length > limit) throw new Error('journal file exceeds bound');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
  } finally { await handle.close(); }
}
async function preserveExact(path, value, limit) {
  const content = json(value);
  if (Buffer.byteLength(content) > limit) throw new Error('journal input exceeds bound');
  let handle;
  try { handle = await open(path, 'wx', 0o600); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (await readBounded(path, limit) !== content) throw new Error('journal binding mismatch or incomplete publication');
    return;
  }
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
}

// Internal state machine. The production factory must authenticate host inputs
// and provide independently pinned route/verify adapters. These callbacks are
// trusted host dependencies, not model-supplied functions. This journal neither
// grants authority nor invokes a native model or Realm effect.
// Directories must remain host-exclusive during a run. This is not protection
// against same-user path replacement, nor power-loss exactly-once execution.
// The route adapter owns exclusive result publication (the pinned CLI uses an
// exclusive hardlink). Partial results are preserved and rejected, never retried.
export function createEffectOnlyRoutingJournal({ root: inputRoot, routingReceiptDigest,
  verifierReceiptDigest, route, verify }) {
  digest(routingReceiptDigest); digest(verifierReceiptDigest);
  if (typeof route !== 'function' || typeof verify !== 'function') throw new Error('pinned host adapters required');
  const root = resolve(inputRoot);
  async function run(input) {
    const { slotId, request, expectedSource, hostBindingDigest } = structuredClone(input);
    if (typeof slotId !== 'string' || slotId.length < 1 || slotId.length > 256) throw new Error('journal slot invalid');
    digest(hostBindingDigest);
    const inputs = { schemaVersion: 1, slotId, request, expectedSource, hostBindingDigest,
      routingReceiptDigest, verifierReceiptDigest };
    const inputBytes = json(inputs);
    if (Buffer.byteLength(inputBytes) > 1_048_576) throw new Error('journal input exceeds bound');
    await canonicalDirectory(root);
    const operationRoot = join(root, sha256Value({ protocolId: 'effect-only-routing-journal-v2', slotId }));
    await mkdir(operationRoot, { recursive: true });
    await canonicalDirectory(operationRoot);
    const lock = await acquireFileLock({ lockPath: join(operationRoot, 'journal.lock') });
    try {
      await preserveExact(join(operationRoot, 'inputs.json'), inputs, 1_048_576);
      const executionIdentity = { hostBindingDigest, routingReceiptDigest, verifierReceiptDigest,
        requestDigest: sha256Value({ request, expectedSource }) };
      const resultPath = join(operationRoot, 'result.json');
      const completionPath = join(operationRoot, 'completion.json');
      const executionPath = join(operationRoot, 'execution.json');
      let resultText = await readBounded(resultPath, 2_097_152);
      if (await readBounded(executionPath, 4096) === null
          && (resultText !== null || await readBounded(completionPath, 4096) !== null)) {
        throw new Error('unclaimed prior result evidence');
      }
      const claim = await claimEffectOnlyRoutingExecution({ recordPath: executionPath, executionIdentity });
      if (claim.status === 'claimed') {
        if (resultText !== null || await readBounded(completionPath, 4096) !== null) throw new Error('unclaimed prior result evidence');
        try {
          await route({ operationRoot, resultPath, request: structuredClone(request), expectedSource: structuredClone(expectedSource) });
        } catch {
          return { status: 'pending', reason: 'routing-observation-uncertain' };
        }
        resultText = await readBounded(resultPath, 2_097_152);
      }
      if (resultText === null) {
        if (await readBounded(completionPath, 4096) !== null) throw new Error('completed journal result missing');
        return { status: 'pending', reason: 'started-without-result' };
      }
      let result;
      try { result = JSON.parse(resultText); } catch { throw new Error('saved routing result invalid JSON'); }
      if (await verify({ operationRoot, request: structuredClone(request), expectedSource: structuredClone(expectedSource), result: structuredClone(result) }) !== true) {
        throw new Error('saved routing result verification failed');
      }
      if (!['needs-decision', 'no-qualified-route'].includes(result?.routeReceipt?.status)) throw new Error('unexpected effect-only route status');
      const unsigned = { schemaVersion: 1, protocolId: 'eternities-effect-only-routing-completion-v2',
        executionDigest: claim.record.executionDigest, inputsDigest: sha256Value(inputs),
        resultDigest: sha256Value(result), resultFileDigest: sha256Text(resultText),
        status: result.routeReceipt.status };
      const completion = { ...unsigned, completionDigest: sha256Value(unsigned) };
      await preserveExact(completionPath, completion, 4096);
      return { status: completion.status, result, completion };
    } finally { await lock.release(); }
  }
  return Object.freeze({ run });
}
