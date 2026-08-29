import { timingSafeEqual } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { createHttpsTransport } from '../cortex/http-transport.mjs';
import { createOpenAICompatibleCortex } from '../cortex/openai-compatible.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { verifyGenesisAdmission } from '../genesis/verify.mjs';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';
import { createFixtureRealm } from '../realm/fixture-realm.mjs';
import { createPersistentVessel } from '../runtime/persistent-vessel.mjs';
import { createLocalGodskillsTransport } from '../skills/godskills-adapter.mjs';
import { readVerifiedJournal } from '../state/journal.mjs';
import { createCredentialResolver, loadHostPolicy } from './policy.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const KEEL_ID = /^keel-[a-f0-9]{64}$/;
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CREATOR_REF = /^[a-z0-9][a-z0-9:._-]{0,127}$/;
const BINDING_KEYS = Object.freeze([
  'bindingDigest', 'checkpointPurpose', 'creationBuildId', 'creatorRef', 'distributionBuildId',
  'genesisId', 'instanceId', 'keelId', 'policyDigest', 'schemaVersion',
]);
const ROOT_ENTRIES = Object.freeze(['binding.json', 'creation', 'distribution', 'keels', 'transaction', 'vessel']);
const MESSAGES = Object.freeze({
  'admission-invalid': 'admitted launch evidence is invalid',
  'input-invalid': 'admitted launch input is invalid',
  'launch-failed': 'admitted launch failed',
  'mission-invalid': 'admitted launch mission is invalid',
  'policy-integrity': 'admitted launch policy integrity failed',
  'policy-mismatch': 'admitted launch policy does not match admission',
  'recovery-required': 'another interrupted request was recovered',
  'request-aborted': 'admitted launch request is terminally aborted',
  'request-conflict': 'admitted launch request identity conflicts',
});

export class AdmittedLaunchError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('admitted launch error code is invalid');
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'AdmittedLaunchError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new AdmittedLaunchError(code, cause);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPathWithinRoot(root, target) {
  const remainder = relative(resolve(root), resolve(target));
  return remainder !== '' && remainder !== '..' && !remainder.startsWith(`..\\`)
    && !remainder.startsWith('../') && !isAbsolute(remainder);
}

async function assertSafeTree(root, directory = root) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail('admission-invalid');
  const canonical = await realpath(directory);
  if (directory !== root && !isPathWithinRoot(root, canonical)) fail('admission-invalid');
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail('admission-invalid');
    if (entry.isDirectory()) await assertSafeTree(root, path);
    else if (!entry.isFile()) fail('admission-invalid');
  }
}

async function readBinding(admissionRoot) {
  let text;
  try {
    text = await readFile(join(admissionRoot, 'binding.json'), 'utf8');
  } catch {
    fail('admission-invalid');
  }
  let binding;
  try {
    binding = JSON.parse(text);
  } catch {
    fail('admission-invalid');
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
      || binding.checkpointPurpose.length > 1024) fail('admission-invalid');
  const { bindingDigest, ...unsigned } = binding;
  if (bindingDigest !== sha256Value(unsigned)) fail('admission-invalid');
  return Object.freeze(binding);
}

function pathIdentity(path) {
  const normalized = resolve(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function assertPolicyBinding({ policy, policyPath, admissionRoot, binding }) {
  if (policy.runtime.instanceId !== binding.instanceId) fail('policy-mismatch');
  const expected = {
    distributionDir: join(admissionRoot, 'distribution'),
    journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
    snapshotPath: join(admissionRoot, 'vessel', 'snapshot.json'),
  };
  for (const [name, target] of Object.entries(expected)) {
    if (pathIdentity(resolve(dirname(policyPath), policy.runtime[name])) !== pathIdentity(target)) {
      fail('policy-mismatch');
    }
  }
}

function projectRecordedRequest(events, mission, binding) {
  const starts = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.eventType === 'mission.admitted'
      && event.payload?.mission?.requestId === mission.requestId);
  if (starts.length === 0) return Object.freeze({ status: 'unseen' });
  if (starts.length !== 1) fail('admission-invalid');
  const start = starts[0];
  if (canonicalJson(start.event.payload.mission) !== canonicalJson(mission)) fail('request-conflict');
  const nextMission = events.findIndex((event, index) => index > start.index && event.eventType === 'mission.admitted');
  const segment = events.slice(start.index, nextMission === -1 ? undefined : nextMission);
  if (segment.some((event) => event.eventType === 'cycle.aborted')) fail('request-aborted');
  if (!segment.some((event) => event.eventType === 'cycle.completed')) {
    return Object.freeze({ status: 'interrupted' });
  }
  const decision = segment.findLast((event) => event.eventType === 'decision.committed')?.payload?.decision;
  const receipt = segment.findLast((event) => event.eventType === 'action.receipt')?.payload?.receipt;
  if (!decision || !receipt || receipt.decisionId !== decision.decisionId) fail('admission-invalid');
  return Object.freeze({
    status: 'completed',
    value: Object.freeze({
      schemaVersion: 1,
      status: 'completed',
      instanceId: binding.instanceId,
      genesisId: binding.genesisId,
      keelId: binding.keelId,
      decisionId: decision.decisionId,
      actionId: receipt.actionId,
      discrepancyClass: receipt.discrepancyClass,
    }),
  });
}

async function defaultRuntimeFactory({ policy, policyDigest, policyPath, realmContract, credentialResolver, fetchImpl, clock }) {
  const realm = createFixtureRealm({ contract: realmContract });
  const godskillsTransport = await createLocalGodskillsTransport({ repositoryRoot: policy.runtime.godskillsRepository });
  const cortex = createOpenAICompatibleCortex({
    adapterId: policy.provider.adapterId,
    profile: policy.provider.profile,
    endpoint: `${policy.provider.endpointOrigin}${policy.provider.endpointPath}`,
    modelId: policy.provider.selectedModel,
    timeoutMs: policy.provider.timeoutMs,
    maxResponseBytes: policy.provider.maxResponseBytes,
    maxProposalTtlMs: policy.provider.maxProposalTtlMs,
    maxPromptBytes: policy.provider.maxPromptBytes,
    maxCompletionTokens: policy.provider.maxCompletionTokens,
    transport: createHttpsTransport({ fetchImpl }),
    resolveCredential: credentialResolver.resolve,
  });
  return Object.freeze({
    cortex,
    realm,
    godskillsTransport,
    clock,
    inferencePolicy: {
      ...policy.inference,
      maxCompletionTokens: policy.provider.maxCompletionTokens,
      hostPolicyId: policy.policyId,
      hostPolicyDigest: policyDigest,
    },
  });
}

export async function launchAdmittedLocalAgent({
  admissionRoot,
  policyPath,
  missionPath,
  requestId,
  env,
  fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString(),
  runtimeFactory = defaultRuntimeFactory,
}) {
  if ([admissionRoot, policyPath, missionPath].some((value) => typeof value !== 'string'
      || value.length === 0 || /[\0\r\n]/.test(value))
      || typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)
      || requestId === '.' || requestId === '..'
      || typeof runtimeFactory !== 'function' || typeof clock !== 'function') fail('input-invalid');

  const root = resolve(admissionRoot);
  const resolvedPolicyPath = resolve(policyPath);
  try {
    await assertSafeTree(root);
    if (!sameArray((await readdir(root)).sort(), ROOT_ENTRIES)) fail('admission-invalid');
  } catch (error) {
    if (error instanceof AdmittedLaunchError) throw error;
    fail('admission-invalid');
  }
  const binding = await readBinding(root);

  let loaded;
  try {
    loaded = await loadHostPolicy(resolvedPolicyPath);
  } catch {
    fail('policy-integrity');
  }
  const pinnedDigest = env?.GODAGENT_POLICY_SHA256?.toLowerCase();
  if (!DIGEST.test(pinnedDigest ?? '')
      || !timingSafeEqual(Buffer.from(pinnedDigest, 'hex'), Buffer.from(loaded.digest, 'hex'))) {
    fail('policy-integrity');
  }
  assertPolicyBinding({ policy: loaded.policy, policyPath: resolvedPolicyPath, admissionRoot: root, binding });

  let missionText;
  try {
    missionText = (await readFile(resolve(missionPath), 'utf8')).trim();
  } catch {
    fail('mission-invalid');
  }
  if (!missionText) fail('mission-invalid');
  const genesis = {
    receiptPath: join(root, 'transaction', 'genesis-receipt.json'),
    creationDir: join(root, 'creation'),
    distributionDir: join(root, 'distribution'),
    expectedPolicyDigest: binding.policyDigest,
    expectedCreationBuildId: binding.creationBuildId,
    instanceId: binding.instanceId,
    creatorRef: binding.creatorRef,
    transactionDir: join(root, 'transaction'),
    journalPath: join(root, 'vessel', 'journal.jsonl'),
    snapshotPath: join(root, 'vessel', 'snapshot.json'),
  };
  const keelAdapter = createLocalKeelBackend({ root: join(root, 'keels'), clock });
  let verified;
  try {
    verified = await verifyGenesisAdmission({ ...genesis, keelAdapter });
  } catch {
    fail('admission-invalid');
  }
  if (loaded.policy.realmId !== verified.distributionSnapshot.realmContract.realmId) fail('policy-mismatch');

  const mission = Object.freeze({
    requestId,
    text: missionText,
    authority: [...loaded.policy.authority],
    hostContext: structuredClone(loaded.policy.hostContext),
  });
  let journal;
  try {
    journal = await readVerifiedJournal(genesis.journalPath);
    if (journal.quarantinedTail) fail('admission-invalid');
  } catch (error) {
    if (error instanceof AdmittedLaunchError) throw error;
    fail('admission-invalid');
  }
  let recorded = projectRecordedRequest(journal.events, mission, binding);
  if (recorded.status === 'completed') return recorded.value;

  let credentialResolver;
  try {
    credentialResolver = createCredentialResolver({ env, variableName: loaded.policy.provider.credentialEnv });
  } catch {
    fail('policy-integrity');
  }
  if (missionText.includes(credentialResolver.resolve())) fail('mission-invalid');

  try {
    const runtime = await runtimeFactory({
      policy: loaded.policy,
      policyDigest: loaded.digest,
      policyPath: resolvedPolicyPath,
      realmContract: verified.distributionSnapshot.realmContract,
      credentialResolver,
      fetchImpl,
      clock,
    });
    const vessel = await createPersistentVessel({ genesis, runtime, keelAdapter });
    if (recorded.status === 'interrupted') {
      await vessel.recover();
      const recoveredJournal = await readVerifiedJournal(genesis.journalPath);
      recorded = projectRecordedRequest(recoveredJournal.events, mission, binding);
      if (recorded.status === 'completed') return recorded.value;
      fail('request-aborted');
    }
    if (vessel.inspect().status !== 'idle') {
      await vessel.recover();
      fail('recovery-required');
    }
    const result = await vessel.runCycle(mission);
    if (result.status !== 'completed') fail('launch-failed');
    const identity = vessel.inspect();
    return Object.freeze({
      schemaVersion: 1,
      status: 'completed',
      instanceId: identity.instanceId,
      genesisId: identity.genesisId,
      keelId: identity.keelId,
      decisionId: result.decision.decisionId,
      actionId: result.receipt.actionId,
      discrepancyClass: result.receipt.discrepancyClass,
    });
  } catch (error) {
    if (error instanceof AdmittedLaunchError) throw error;
    fail('launch-failed', error);
  }
}
