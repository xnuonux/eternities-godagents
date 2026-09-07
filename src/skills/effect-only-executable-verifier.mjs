import { createHash } from 'node:crypto';
import { open, realpath, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';

const PROTOCOL = 'eternities-godskills-effect-only-executable-v2';
const RECEIPT = 'receipts/effect-only-executable-v2.json';
const SOURCES = ['scripts/effect-only-v2.mjs', 'src/effect-intent-v2.mjs',
  'src/intent-contracts.mjs', 'src/io.mjs', 'src/routing-contracts.mjs'];
const LIMIT = 1_048_576;
const verified = new WeakSet();
const verifiedSidecars = new WeakSet();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
const identity = p => process.platform === 'win32' ? p.toLowerCase() : p;
function exact(value, keys) {
  if (!value || Array.isArray(value) || !equal(Object.keys(value).sort(), [...keys].sort())) {
    throw new Error('effect-only manifest fields are invalid');
  }
}
function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('invalid digest');
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
async function capture(root, reference) {
  // Paths have already been compared against the fixed protocol allowlist.
  digest(reference.sha256);
  const lexical = resolve(root, reference.path);
  const actual = await realpath(lexical);
  if (identity(actual) !== identity(lexical)) throw new Error('effect-only source alias rejected');
  const handle = await open(actual, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > LIMIT) throw new Error('effect-only file exceeds bound');
    const bytes = Buffer.alloc(LIMIT + 1);
    let length = 0;
    while (length < bytes.length) {
      const next = await handle.read(bytes, length, bytes.length - length, null);
      if (!next.bytesRead) break;
      length += next.bytesRead;
    }
    if (length > LIMIT) throw new Error('effect-only file exceeds bound');
    const captured = bytes.subarray(0, length);
    if (hash(captured) !== reference.sha256) throw new Error('effect-only file digest mismatch');
    return captured;
  } finally { await handle.close(); }
}

export function assertVerifiedEffectOnlyExecutable(value) {
  if (!value || !verified.has(value)) throw new Error('effect-only snapshot lacks verified provenance');
  return value;
}

// The caller must obtain the pin through authenticated host policy. This checks
// consistency with that pin, not reviewer authenticity, semantic quality or
// release eligibility. Captured bytes, never the mutable checkout, are the
// future execution input. This function itself never writes or executes code.
export async function verifyEffectOnlyExecutable({ repositoryRoot, pin: inputPin }) {
  return verifySourceCapture({ repositoryRoot, pin: inputPin });
}

export async function verifyEffectOnlyVerifier({ repositoryRoot, pin, routingExecutable }) {
  assertVerifiedEffectOnlyExecutable(routingExecutable);
  return verifySourceCapture({ repositoryRoot, pin }, routingExecutable);
}

async function verifySourceCapture({ repositoryRoot, pin: inputPin }, routingExecutable = null) {
  const protocol = routingExecutable ? 'eternities-godskills-effect-only-verifier-v2' : PROTOCOL;
  const receiptPath = routingExecutable ? 'receipts/effect-only-verifier-v2.json' : RECEIPT;
  const sourcePaths = routingExecutable ? ['scripts/verify-effect-only-v2.mjs', ...SOURCES.slice(1)] : SOURCES;
  const pin = structuredClone(inputPin);
  exact(pin, ['protocolId', 'executableReceipt', 'entrypoint']);
  exact(pin.executableReceipt, ['path', 'sha256', 'receiptDigest']);
  exact(pin.entrypoint, ['path', 'sha256']);
  if (pin.protocolId !== protocol || pin.executableReceipt.path !== receiptPath
      || pin.entrypoint.path !== sourcePaths[0]) throw new Error('unsupported effect-only pin');
  digest(pin.executableReceipt.receiptDigest);
  digest(pin.entrypoint.sha256);
  const root = await realpath(resolve(repositoryRoot));
  const receiptBytes = await capture(root, pin.executableReceipt);
  const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes));
  exact(receipt, ['schemaVersion', 'protocolId', 'status', 'sourceCommit', 'entrypoint',
    'sources', 'builder', 'tests', 'vectors', 'verification', 'proofLimits', 'receiptDigest',
    ...(routingExecutable ? ['parent'] : [])]);
  const { receiptDigest, ...body } = receipt;
  if (receipt.schemaVersion !== 1 || receipt.protocolId !== protocol
      || receipt.status !== 'verified-structural-only'
      || !/^[a-f0-9]{40}$/.test(receipt.sourceCommit)
      || receiptDigest !== pin.executableReceipt.receiptDigest
      || hash(canonicalJson(body)) !== receiptDigest) throw new Error('effect-only receipt identity/digest mismatch');
  if (!Array.isArray(receipt.sources) || !equal(receipt.sources.map(s => s.path), sourcePaths)
      || !equal(receipt.entrypoint, pin.entrypoint) || !equal(receipt.entrypoint, receipt.sources[0])) {
    throw new Error('effect-only executable closure mismatch');
  }
  if (routingExecutable) {
    if (!equal(receipt.parent, routingExecutable.pin.executableReceipt)) throw new Error('sidecar parent binding mismatch');
    if (!equal(receipt.sources.slice(1), routingExecutable.receipt.sources.slice(1))) {
      throw new Error('sidecar shared consumer mismatch');
    }
  }
  const sources = [];
  for (const source of receipt.sources) {
    exact(source, ['path', 'sha256']);
    const bytes = await capture(root, source);
    sources.push({ ...source, contentBase64: bytes.toString('base64') });
  }
  const result = freeze({ pin, receipt, sources });
  (routingExecutable ? verifiedSidecars : verified).add(result);
  return result;
}

// The parent must be a host-owned directory. This is source isolation, not an
// OS sandbox against another process with the same filesystem permissions.
// Failed partial snapshots are preserved for forensics and are never returned
// as executable handles. No retry, cleanup, launch, or policy adoption occurs.
export async function materializeEffectOnlyExecutable({ verifiedExecutable, parent }) {
  const captured = verifiedSidecars.has(verifiedExecutable)
    ? verifiedExecutable : assertVerifiedEffectOnlyExecutable(verifiedExecutable);
  const lexicalParent = resolve(parent);
  const actualParent = await realpath(lexicalParent);
  if (identity(actualParent) !== identity(lexicalParent)) throw new Error('effect-only snapshot parent alias rejected');
  const root = await mkdtemp(join(actualParent, 'effect-only-'));
  for (const source of captured.sources) {
    const destination = join(root, source.path);
    await mkdir(dirname(destination), { recursive: true });
    const bytes = Buffer.from(source.contentBase64, 'base64');
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
    await capture(root, source);
  }
  return freeze({ root, entrypoint: join(root, captured.pin.entrypoint.path),
    receiptDigest: captured.receipt.receiptDigest });
}
