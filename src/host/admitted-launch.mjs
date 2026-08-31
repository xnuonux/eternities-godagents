import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { createHttpsTransport } from '../cortex/http-transport.mjs';
import { createOpenAICompatibleCortex } from '../cortex/openai-compatible.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { verifyGenesisAdmission } from '../genesis/verify.mjs';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';
import { createPersistentLocalRealm } from '../realm/local-persistent-realm.mjs';
import { createPersistentVessel } from '../runtime/persistent-vessel.mjs';
import { createLocalGodskillsTransport } from '../skills/godskills-adapter.mjs';
import { createGodskillsAdapter } from '../skills/mission-binder.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { readVerifiedJournal } from '../state/journal.mjs';
import { claimLocalInstanceResidency, defaultLocalInstanceRegistryRoot } from './local-instance-registry.mjs';
import {
  assertAdmissionPolicyBinding,
  assertSafeAdmissionTree,
  readAdmissionBinding,
} from './admitted-identity-boundary.mjs';
import { createCredentialResolver, loadHostPolicy } from './policy.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const MESSAGES = Object.freeze({
  'admission-invalid': 'admitted launch evidence is invalid',
  'input-invalid': 'admitted launch input is invalid',
  'launch-busy': 'admitted launch is already active',
  'launch-failed': 'admitted launch failed',
  'mission-invalid': 'admitted launch mission is invalid',
  'policy-integrity': 'admitted launch policy integrity failed',
  'policy-mismatch': 'admitted launch policy does not match admission',
  'recovery-required': 'another interrupted request was recovered',
  'request-aborted': 'admitted launch request is terminally aborted',
  'request-conflict': 'admitted launch request identity conflicts',
  'residency-conflict': 'admitted launch identity is resident elsewhere',
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

async function defaultRuntimeFactory({
  policy, policyDigest, policyPath, realmContract, realmStatePath, credentialResolver, fetchImpl, clock,
  activationClassifier, activationTransport,
}) {
  const realm = await createPersistentLocalRealm({ contract: realmContract, statePath: realmStatePath });
  const godskillsTransport = await createLocalGodskillsTransport({
    repositoryRoot: policy.runtime.godskillsRelease.repositoryRoot,
    preferenceProtocol: policy.runtime.godskillsRelease.preference?.protocolId ?? null,
  });
  const godskillsAdapter = await createGodskillsAdapter({
    releasePin: policy.runtime.godskillsRelease,
    transport: godskillsTransport,
    activationClassifier,
    activationTransport,
  });
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
    godskillsAdapter,
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
  registryRoot,
  fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString(),
  runtimeFactory = defaultRuntimeFactory,
  activationClassifier,
  activationTransport,
}) {
  if ([admissionRoot, policyPath, missionPath].some((value) => typeof value !== 'string'
      || value.length === 0 || /[\0\r\n]/.test(value))
      || typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)
      || requestId === '.' || requestId === '..'
      || typeof runtimeFactory !== 'function' || typeof clock !== 'function'
      || (activationClassifier !== undefined && typeof activationClassifier !== 'function')
      || (activationTransport !== undefined && typeof activationTransport !== 'function')) fail('input-invalid');

  const root = resolve(admissionRoot);
  const resolvedPolicyPath = resolve(policyPath);
  try {
    await assertSafeAdmissionTree(root);
  } catch {
    fail('admission-invalid');
  }
  let binding;
  try {
    binding = await readAdmissionBinding(root);
  } catch {
    fail('admission-invalid');
  }

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
  try {
    assertAdmissionPolicyBinding({
      policy: loaded.policy,
      policyPath: resolvedPolicyPath,
      admissionRoot: root,
      binding,
    });
  } catch {
    fail('policy-mismatch');
  }

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

  try {
    await claimLocalInstanceResidency({
      registryRoot: registryRoot ?? defaultLocalInstanceRegistryRoot(),
      binding,
      admissionRoot: root,
    });
  } catch {
    fail('residency-conflict');
  }

  const mission = Object.freeze({
    requestId,
    text: missionText,
    authority: [...loaded.policy.authority],
    hostContext: structuredClone(loaded.policy.hostContext),
  });
  let launchLock;
  try {
    launchLock = await acquireFileLock({ lockPath: join(root, 'vessel', 'launch.lock') });
  } catch {
    fail('launch-busy');
  }
  try {
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
      realmStatePath: join(root, 'vessel', 'realm-state.json'),
      credentialResolver,
      fetchImpl,
      clock,
      activationClassifier,
      activationTransport,
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
  } finally {
    await launchLock.release();
  }
}
