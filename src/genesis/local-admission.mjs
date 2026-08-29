import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyCreationBuild } from '../creation/compile.mjs';
import { compileDistribution, loadVerifiedDistribution } from '../foundry/compile.mjs';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';
import { prepareGenesis } from './coordinator.mjs';
import { verifyGenesisInputs } from './preflight.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CREATOR_REF = /^[a-z0-9][a-z0-9:._-]{0,127}$/;
const MESSAGES = Object.freeze({
  'admission-failed': 'local admission failed',
  'compatibility-invalid': 'local admission compatibility is invalid',
  'input-invalid': 'local admission input is invalid',
  'source-invalid': 'local admission source is invalid',
  'workspace-invalid': 'local admission workspace is invalid',
  'workspace-occupied': 'local admission workspace is occupied',
});

export class LocalAdmissionError extends Error {
  constructor(code) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('local admission error code is invalid');
    super(MESSAGES[code]);
    this.name = 'LocalAdmissionError';
    this.code = code;
  }
}

function fail(code) {
  throw new LocalAdmissionError(code);
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input-invalid');
  for (const name of ['creationDir', 'promptArtifactPath', 'realmContractPath', 'workspace']) {
    if (typeof input[name] !== 'string' || input[name].length === 0 || /[\0\r\n]/.test(input[name])) fail('input-invalid');
  }
  if (!DIGEST.test(input.expectedPolicyDigest) || !DIGEST.test(input.expectedCreationBuildId)) fail('input-invalid');
  if (!IDENTIFIER.test(input.instanceId) || input.instanceId === '.' || input.instanceId === '..'
      || input.instanceId.includes('/') || input.instanceId.includes('\\')) fail('input-invalid');
  if (!CREATOR_REF.test(input.creatorRef)) fail('input-invalid');
  if (typeof input.checkpointPurpose !== 'string' || input.checkpointPurpose.length < 1
      || input.checkpointPurpose.length > 1024 || input.checkpointPurpose.includes('\0')) fail('input-invalid');
  if (input.clock !== undefined && typeof input.clock !== 'function') fail('input-invalid');
}

const byteCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPathWithinRoot(root, target) {
  const remainder = relative(resolve(root), resolve(target));
  return remainder !== '' && remainder !== '..' && !remainder.startsWith(`..\\`)
    && !remainder.startsWith('../') && !isAbsolute(remainder);
}

async function readCanonical(path, label) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    fail(label);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(label);
  }
  if (text !== `${canonicalJson(value)}\n`) fail(label);
  return value;
}

function bindingValue(input, inputs) {
  const unsigned = {
    schemaVersion: 1,
    genesisId: inputs.identity.genesisId,
    keelId: inputs.identity.keelId,
    instanceId: input.instanceId,
    creatorRef: input.creatorRef,
    checkpointPurpose: input.checkpointPurpose,
    creationBuildId: inputs.creation.buildId,
    distributionBuildId: inputs.distribution.buildId,
    policyDigest: input.expectedPolicyDigest,
  };
  return { ...unsigned, bindingDigest: sha256Value(unsigned) };
}

async function preflight(input, temporaryRoot) {
  const sourceCreation = resolve(input.creationDir);
  const creationSnapshot = join(temporaryRoot, 'creation');
  const promptSnapshot = join(temporaryRoot, 'prompt-os-artifact.md');
  const realmSnapshot = join(temporaryRoot, 'realm-contract.json');
  const distributionSnapshot = join(temporaryRoot, 'distribution');
  let creation;
  try {
    creation = await verifyCreationBuild(sourceCreation, { expectedPolicyDigest: input.expectedPolicyDigest });
    if (creation.buildId !== input.expectedCreationBuildId) fail('source-invalid');
    await cp(sourceCreation, creationSnapshot, { recursive: true, errorOnExist: true });
    const copied = await verifyCreationBuild(creationSnapshot, { expectedPolicyDigest: input.expectedPolicyDigest });
    if (copied.buildId !== creation.buildId) fail('source-invalid');
    await Promise.all([
      cp(resolve(input.promptArtifactPath), promptSnapshot, { errorOnExist: true }),
      cp(resolve(input.realmContractPath), realmSnapshot, { errorOnExist: true }),
    ]);
  } catch (error) {
    if (error instanceof LocalAdmissionError) throw error;
    fail('source-invalid');
  }

  try {
    await compileDistribution({
      genomePath: join(creationSnapshot, 'agent-genome.json'),
      promptArtifactPath: promptSnapshot,
      realmContractPath: realmSnapshot,
      outputDir: distributionSnapshot,
    });
    const distribution = await loadVerifiedDistribution(distributionSnapshot);
    const required = [...distribution.genome.realm.requiredCapabilities].sort(byteCompare);
    const supplied = [...distribution.realmContract.capabilities].sort(byteCompare);
    if (!sameArray(required, supplied)) fail('compatibility-invalid');
    const inputs = await verifyGenesisInputs({
      creationDir: creationSnapshot,
      distributionDir: distributionSnapshot,
      expectedPolicyDigest: input.expectedPolicyDigest,
      expectedCreationBuildId: input.expectedCreationBuildId,
      instanceId: input.instanceId,
      creatorRef: input.creatorRef,
    });
    return { creationSnapshot, distributionSnapshot, inputs };
  } catch (error) {
    if (error instanceof LocalAdmissionError) throw error;
    fail('compatibility-invalid');
  }
}

async function assertDirectory(path, root, code) {
  let stats;
  try {
    stats = await lstat(path);
  } catch {
    fail(code);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail(code);
  const canonical = await realpath(path);
  if (root !== null && !isPathWithinRoot(root, canonical)) fail(code);
  return canonical;
}

async function assertSafeTree(root, directory = root) {
  const stats = await lstat(directory).catch(() => fail('workspace-invalid'));
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail('workspace-invalid');
  const canonical = await realpath(directory);
  if (directory !== root && !isPathWithinRoot(root, canonical)) fail('workspace-invalid');
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail('workspace-invalid');
    if (entry.isDirectory()) await assertSafeTree(root, path);
    else if (!entry.isFile()) fail('workspace-invalid');
  }
}

async function verifyPublished(admissionRoot, input, binding) {
  await assertSafeTree(admissionRoot);
  const actual = await readCanonical(join(admissionRoot, 'binding.json'), 'workspace-invalid');
  if (canonicalJson(actual) !== canonicalJson(binding)) fail('workspace-occupied');
  try {
    const creation = await verifyCreationBuild(join(admissionRoot, 'creation'), {
      expectedPolicyDigest: input.expectedPolicyDigest,
    });
    const distribution = await loadVerifiedDistribution(join(admissionRoot, 'distribution'));
    if (creation.buildId !== binding.creationBuildId || distribution.manifest.buildId !== binding.distributionBuildId) {
      fail('workspace-invalid');
    }
  } catch (error) {
    if (error instanceof LocalAdmissionError) throw error;
    fail('workspace-invalid');
  }
}

async function publishAdmission(input, prepared) {
  const configured = resolve(input.workspace);
  try {
    await mkdir(configured, { recursive: true });
  } catch {
    fail('workspace-invalid');
  }
  const workspaceRoot = await assertDirectory(configured, null, 'workspace-invalid');
  const admissionRoot = join(workspaceRoot, 'admission');
  const binding = bindingValue(input, prepared.inputs);
  const names = (await readdir(workspaceRoot)).sort(byteCompare);
  if (names.length > 0) {
    if (!sameArray(names, ['admission'])) fail('workspace-occupied');
    const canonicalAdmission = await assertDirectory(admissionRoot, workspaceRoot, 'workspace-invalid');
    await verifyPublished(canonicalAdmission, input, binding);
    return canonicalAdmission;
  }

  const pending = await mkdtemp(join(workspaceRoot, '.pending-'));
  try {
    await Promise.all([
      cp(prepared.creationSnapshot, join(pending, 'creation'), { recursive: true, errorOnExist: true }),
      cp(prepared.distributionSnapshot, join(pending, 'distribution'), { recursive: true, errorOnExist: true }),
    ]);
    await writeFile(join(pending, 'binding.json'), `${canonicalJson(binding)}\n`, { encoding: 'utf8', flag: 'wx' });
    await verifyPublished(pending, input, binding);
    await rename(pending, admissionRoot);
  } catch (error) {
    await rm(pending, { recursive: true, force: true }).catch(() => {});
    if (error instanceof LocalAdmissionError) throw error;
    fail('workspace-invalid');
  }
  return await assertDirectory(admissionRoot, workspaceRoot, 'workspace-invalid');
}

export async function admitLocalCreation(input) {
  validateInput(input);
  const clock = input.clock ?? (() => new Date().toISOString());
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'godagent-local-admission-'));
  try {
    const prepared = await preflight(input, temporaryRoot);
    const admissionRoot = await publishAdmission(input, prepared);
    for (const name of ['transaction', 'vessel', 'keels']) {
      const directory = join(admissionRoot, name);
      await mkdir(directory, { recursive: true });
      await assertDirectory(directory, admissionRoot, 'workspace-invalid');
    }
    await assertSafeTree(admissionRoot);
    const keelAdapter = createLocalKeelBackend({ root: join(admissionRoot, 'keels'), clock });
    let admitted;
    try {
      admitted = await prepareGenesis({
        creationDir: join(admissionRoot, 'creation'),
        distributionDir: join(admissionRoot, 'distribution'),
        expectedPolicyDigest: input.expectedPolicyDigest,
        expectedCreationBuildId: input.expectedCreationBuildId,
        instanceId: input.instanceId,
        creatorRef: input.creatorRef,
        transactionDir: join(admissionRoot, 'transaction'),
        journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
        snapshotPath: join(admissionRoot, 'vessel', 'snapshot.json'),
        keelAdapter,
        clock,
        crashAt: input.crashAt,
        initialCheckpoint: {
          purpose: input.checkpointPurpose,
          constraints: ['Soul remains dormant', 'local admission only'],
          carry: ['first wake pending'],
        },
      });
    } catch (error) {
      if (input.crashAt !== undefined) throw error;
      fail('admission-failed');
    }
    await assertSafeTree(admissionRoot);
    const receipt = admitted.genesisReceipt;
    return Object.freeze({
      schemaVersion: 1,
      status: 'admitted',
      creationBuildId: receipt.creationBuildId,
      distributionBuildId: receipt.distributionBuildId,
      genesisId: receipt.genesisId,
      keelId: receipt.keelId,
      receiptDigest: receipt.receiptDigest,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
