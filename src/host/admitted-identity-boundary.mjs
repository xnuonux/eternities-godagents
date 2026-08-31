import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const KEEL_ID = /^keel-[a-f0-9]{64}$/;
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CREATOR_REF = /^[a-z0-9][a-z0-9:._-]{0,127}$/;
const BINDING_KEYS = Object.freeze([
  'bindingDigest', 'checkpointPurpose', 'creationBuildId', 'creatorRef', 'distributionBuildId',
  'genesisId', 'instanceId', 'keelId', 'policyDigest', 'schemaVersion',
]);
const ROOT_ENTRIES = Object.freeze(['binding.json', 'creation', 'distribution', 'keels', 'transaction', 'vessel']);

function invalidBoundary() {
  throw new Error('admission identity boundary is invalid');
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function pathIdentity(path) {
  const normalized = resolve(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isPathWithinRoot(root, target) {
  const remainder = relative(resolve(root), resolve(target));
  return remainder !== '' && remainder !== '..' && !remainder.startsWith(`..\\`)
    && !remainder.startsWith('../') && !isAbsolute(remainder);
}

async function assertSafeTree(root, directory = root) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) invalidBoundary();
  const canonical = await realpath(directory);
  if (directory !== root && !isPathWithinRoot(root, canonical)) invalidBoundary();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) invalidBoundary();
    if (entry.isDirectory()) await assertSafeTree(root, path);
    else if (!entry.isFile()) invalidBoundary();
  }
}

export async function assertSafeAdmissionTree(admissionRoot) {
  const root = resolve(admissionRoot);
  await assertSafeTree(root);
  if (!sameArray((await readdir(root)).sort(), ROOT_ENTRIES)) invalidBoundary();
  return root;
}

export async function readAdmissionBinding(admissionRoot) {
  let text;
  let binding;
  try {
    text = await readFile(join(admissionRoot, 'binding.json'), 'utf8');
    binding = JSON.parse(text);
  } catch {
    invalidBoundary();
  }
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)
      || text !== `${canonicalJson(binding)}\n`
      || !sameArray(Object.keys(binding).sort(), BINDING_KEYS)
      || binding.schemaVersion !== 1
      || !DIGEST.test(binding.genesisId)
      || !KEEL_ID.test(binding.keelId)
      || !DIGEST.test(binding.creationBuildId)
      || !DIGEST.test(binding.distributionBuildId)
      || !DIGEST.test(binding.policyDigest)
      || !DIGEST.test(binding.bindingDigest)
      || !INSTANCE_ID.test(binding.instanceId)
      || !CREATOR_REF.test(binding.creatorRef)
      || typeof binding.checkpointPurpose !== 'string'
      || binding.checkpointPurpose.length < 1
      || binding.checkpointPurpose.length > 1024) invalidBoundary();
  const { bindingDigest, ...unsigned } = binding;
  if (bindingDigest !== sha256Value(unsigned)) invalidBoundary();
  return Object.freeze(binding);
}

export function assertAdmissionPolicyBinding({ policy, policyPath, admissionRoot, binding }) {
  if (policy.runtime.instanceId !== binding.instanceId) {
    throw new Error('admission policy instance differs from binding');
  }
  const expected = {
    distributionDir: join(admissionRoot, 'distribution'),
    journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
    snapshotPath: join(admissionRoot, 'vessel', 'snapshot.json'),
  };
  for (const [name, target] of Object.entries(expected)) {
    if (pathIdentity(resolve(dirname(policyPath), policy.runtime[name])) !== pathIdentity(target)) {
      throw new Error(`admission policy ${name} differs from admission`);
    }
  }
  return true;
}
