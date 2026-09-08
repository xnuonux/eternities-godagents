import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { assertNoCredentialFields } from '../../src/cortex/receipt-safety.mjs';
import { acquireFileLock } from '../../src/state/file-lock.mjs';
import { launchProviderBackedIdentity, verifyProviderBackedIdentityTerminalResult } from '../../src/host/provider-backed-cli.mjs';
import { writeAcceptedArtifact } from './artifact.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { createGrokCliPortablePhaseHost } from '../../src/transports/grok-cli-phase-transport.mjs';
import { createAdmittedEffectOnlyIdentityLauncher, assertAdmittedEffectOnlyTerminalResult,
  assertAdmittedEffectOnlyReconciliationResult } from '../../src/host/admitted-effect-only-identity-launcher.mjs';
import { loadVerifiedDistribution } from '../../src/foundry/compile.mjs';
import { verifyArtifactRealmBinding } from './realm-binding.mjs';
import { deepFreeze } from '../../src/creation/contracts.mjs';
import { assertAdmissionPolicyBinding, assertSafeAdmissionTree, readAdmissionBinding } from '../../src/host/admitted-identity-boundary.mjs';
import { loadIdentityHostPolicy } from '../../src/host/identity-policy.mjs';
import { localGenesisAdmission } from '../../src/host/local-genesis-admission.mjs';
import { compileCortexBindingCandidate } from '../../src/cortex/binding-compiler.mjs';
import { buildCortexBindingRequestFromVesselRequest } from '../../src/runtime/identity-bound-mission-vessel-contracts.mjs';
import { verifyIdentityHostRequest } from '../../src/host/admitted-sealed-identity-launch.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const pathIdentity = (path) => process.platform === 'win32' ? path.toLowerCase() : path;
const issuedOwners = new WeakMap();

export function assertLocalWorkflowOwner(owner) {
  const isOpen = issuedOwners.get(owner);
  if (!isOpen) throw new TypeError('workflow owner is not issued');
  if (!isOpen()) throw new Error('workflow owner is closed');
  return owner;
}

async function boundedText(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_048_576) {
    throw new Error('workflow input is not a bounded regular file');
  }
  return readFile(path, 'utf8');
}

async function verifiedWorkflowDistribution(root) {
  for (const directory of [join(root, 'admission'), join(root, 'admission', 'distribution')]) {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || pathIdentity(await realpath(directory)) !== pathIdentity(directory)) {
      throw new Error('artifact Realm distribution directory is aliased');
    }
  }
  const directory = join(root, 'admission', 'distribution');
  for (const name of ['agent-genome.json', 'distribution-manifest.json', 'prompt-os-artifact.md', 'realm-contract.json']) {
    await boundedText(join(directory, name));
  }
  return loadVerifiedDistribution(directory);
}

export async function withLocalWorkflowOwner({ manifestPath, expectedManifestDigest, env = process.env,
  createProviderPhaseHostImpl } = {}, callback) {
  if (typeof callback !== 'function') throw new TypeError('workflow owner callback is required');
  if (typeof manifestPath !== 'string' || /[\0\r\n]/.test(manifestPath)
      || basename(manifestPath) !== 'workflow.json' || !DIGEST.test(expectedManifestDigest ?? '')) {
    throw new Error('workflow manifest reference is invalid');
  }
  const path = resolve(manifestPath);
  const root = await realpath(dirname(path));
  if (pathIdentity(root) !== pathIdentity(dirname(path))) throw new Error('workflow location is aliased');
  const text = await boundedText(path);
  if (sha256Text(text) !== expectedManifestDigest) throw new Error('workflow manifest digest changed');
  const manifest = JSON.parse(text);
  const realmBound = manifest.schemaVersion === 3;
  const effectOnly = manifest.schemaVersion === 2 || realmBound;
  const keys = ['schemaVersion', 'status', 'workspaceRoot', 'family', 'instanceId', 'missionId', 'genesisId',
    'identityPolicyDigest', 'inputs', ...(realmBound ? ['realmBinding'] : []),
    ...(!effectOnly ? ['maximumReviewMaterializedBytes', 'maximumRevisionMaterializedBytes'] : [])];
  if (text !== `${canonicalJson(manifest)}\n`
      || canonicalJson(Object.keys(manifest).sort()) !== canonicalJson(keys.sort())
      || ![1, 2, 3].includes(manifest.schemaVersion) || manifest.status !== 'prepared'
      || pathIdentity(manifest.workspaceRoot) !== pathIdentity(root)
      || canonicalJson(Object.keys(manifest.inputs).sort()) !== '["identityPolicy","mission","providerPolicy"]') {
    throw new Error('workflow manifest is invalid');
  }
  const lock = await acquireFileLock({ lockPath: join(root, 'workflow-run.lock') });
  try {
    const texts = {};
    for (const [key, name] of Object.entries({ providerPolicy: 'provider-policy.json',
      identityPolicy: 'identity-policy.json', mission: 'mission-request.json' })) {
      texts[key] = await boundedText(join(root, name));
      if (sha256Text(texts[key]) !== manifest.inputs[key]) throw new Error('prepared workflow input changed');
    }
    const policy = JSON.parse(texts.identityPolicy);
    const mission = JSON.parse(texts.mission);
    if (policy.runtime.instanceId !== manifest.instanceId || mission.mission.missionId !== manifest.missionId) {
      throw new Error('workflow identity or mission differs from preparation');
    }
    const verifyRealm = async () => verifyArtifactRealmBinding({
      verifiedDistribution: await verifiedWorkflowDistribution(root), binding: manifest.realmBinding,
      maximumArtifactBytes: policy.runtime.limits.maxArtifactBytes + 1,
    });
    if (realmBound) await verifyRealm();
    else if (JSON.parse(await boundedText(join(root, 'admission', 'distribution', 'realm-contract.json'))).schemaVersion !== 1) {
      throw new Error('legacy workflow requires the fixture Realm profile');
    }
    let phase = 'active';
    const pending = new Set();
    const assertLive = () => { if (phase === 'closed') throw new Error('workflow owner is closed'); };
    const requireRealmBound = () => { if (!realmBound) throw new Error('artifact operations require workflow version 3'); };
    function track(work) {
      if (phase !== 'active') return Promise.reject(new Error(`workflow owner is ${phase}`));
      const promise = Promise.resolve().then(() => { assertLive(); return work(); })
        .then(result => { assertLive(); return result; });
      pending.add(promise);
      // Observe settlement without spawning a rejected, unobserved finally chain.
      void promise.then(() => pending.delete(promise), () => pending.delete(promise));
      return promise;
    }
    async function verifyInputs() {
      assertLive();
      if (await boundedText(path) !== text) throw new Error('workflow manifest changed within owner scope');
      for (const [key, name] of Object.entries({ providerPolicy: 'provider-policy.json',
        identityPolicy: 'identity-policy.json', mission: 'mission-request.json' })) {
        if (await boundedText(join(root, name)) !== texts[key]) throw new Error('prepared workflow input changed');
      }
      if (realmBound) await verifyRealm();
      assertLive();
    }
    async function describeArtifactBinding() {
      requireRealmBound();
      await verifyInputs();
      const admissionRoot = join(root, 'admission');
      await assertSafeAdmissionTree(admissionRoot);
      const binding = await readAdmissionBinding(admissionRoot);
      const loaded = await loadIdentityHostPolicy(join(root, 'identity-policy.json'));
      if (loaded.digest !== manifest.identityPolicyDigest) throw new Error('workflow identity policy digest differs');
      assertAdmissionPolicyBinding({ policy: loaded.policy, policyPath: join(root, 'identity-policy.json'), admissionRoot, binding });
      const verifiedRequest = verifyIdentityHostRequest(loaded.policy, mission);
      const { routeMode, effectAssessment, ...legacy } = verifiedRequest;
      const candidate = await compileCortexBindingCandidate({ admission: localGenesisAdmission(admissionRoot, binding),
        request: buildCortexBindingRequestFromVesselRequest({ ...legacy, schemaVersion: 1 }) });
      const b = candidate.fullEnvelope.binding;
      if (b.genesisId !== manifest.genesisId || b.instanceId !== manifest.instanceId) throw new Error('workflow genesis identity differs from admission');
      if (loaded.policy.realmId !== candidate.fullEnvelope.authority.realmId) throw new Error('workflow policy Realm differs from admission');
      const sourceBinding = { workflowManifestDigest: expectedManifestDigest, identityPolicyDigest: loaded.digest,
        providerPolicyDigest: sha256Value(JSON.parse(texts.providerPolicy)), realmBindingDigest: sha256Value(manifest.realmBinding),
        producerDescriptorDigest: loaded.policy.runtime.effectProducerDescriptorDigest,
        genesisId: b.genesisId, keelId: b.keelId, creationBuildId: b.creationBuildId,
        distributionBuildId: b.distributionBuildId, admissionReceiptDigest: b.admissionReceiptDigest,
        actor: { instanceId: b.instanceId, identityDigest: sha256Value(candidate.fullEnvelope.identity),
          genomeDigest: b.genomeValueDigest, keelHeadDigest: b.currentKeelHeadDigest } };
      await verifyInputs();
      return deepFreeze({ sourceBinding, baseRequest: structuredClone(verifiedRequest), policy: structuredClone(loaded.policy) });
    }
    async function runMission(request, operation, includeMission = false) {
      if (!['launch', 'reconcile'].includes(operation)) throw new TypeError('workflow operation is invalid');
      if (operation === 'reconcile' && !realmBound) throw new Error('reconciliation requires workflow version 3');
      await verifyInputs();
      if (effectOnly) request = verifyIdentityHostRequest(policy, request);
      const missionId = request.mission.missionId;
      let rawResult;
      let effectReceipt;
      if (effectOnly) {
        if (policy.schemaVersion !== 2 || request.schemaVersion !== 2 || request.routeMode !== 'effect-only') {
          throw new Error('effect-only workflow versions differ');
        }
        const providerPins = {
          'openai-compatible-chat-completions-v1': 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
          'anthropic-messages-v1': 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
          'grok-cli-subscription-v1': 'GODAGENT_GROK_PHASE_POLICY_SHA256',
        };
        if (!Object.hasOwn(providerPins, manifest.family)) throw new Error('workflow provider family is unsupported');
        const grok = manifest.family === 'grok-cli-subscription-v1';
        const host = await (grok ? createGrokCliPortablePhaseHost : (createProviderPhaseHostImpl ?? createProviderPhaseHost))({
          ...(!grok ? { family: manifest.family } : {}), policyPath: join(root, 'provider-policy.json'),
          runtimeRoot: join(root, 'admission', 'vessel', 'provider-phase', manifest.family),
          env: { ...env, [providerPins[manifest.family]]: sha256Text(canonicalJson(JSON.parse(texts.providerPolicy))) },
        });
        const launcher = createAdmittedEffectOnlyIdentityLauncher({ host, hostKind: grok ? 'portable' : 'provider' });
        rawResult = await launcher[operation]({ admissionRoot: join(root, 'admission'),
          policyPath: join(root, 'identity-policy.json'), request,
          identityPolicyDigest: manifest.identityPolicyDigest });
        if (operation === 'reconcile') {
          assertAdmittedEffectOnlyReconciliationResult(rawResult, {
            requestDigest: sha256Value(request), identityPolicyDigest: manifest.identityPolicyDigest });
          rawResult = rawResult.result;
        }
        // Assert the original issued object before cloning. The authenticated host
        // already verifies completion against recovered admission/kernel evidence.
        if (rawResult.status === 'completed') effectReceipt = assertAdmittedEffectOnlyTerminalResult(rawResult);
      } else rawResult = await launchProviderBackedIdentity({
        family: manifest.family,
        providerPolicyPath: join(root, 'provider-policy.json'),
        admissionRoot: join(root, 'admission'),
        identityPolicyPath: join(root, 'identity-policy.json'),
        identityPolicyDigest: manifest.identityPolicyDigest,
        missionPath: join(root, 'mission-request.json'),
        requestId: manifest.missionId,
        maximumReviewMaterializedBytes: manifest.maximumReviewMaterializedBytes,
        maximumRevisionMaterializedBytes: manifest.maximumRevisionMaterializedBytes,
        env,
        // Pin the request snapshot even if an operator edits its file during this invocation.
        readFileImpl: (input, encoding) => input === join(root, 'mission-request.json')
          ? Promise.resolve(texts.mission) : readFile(input, encoding),
        ...(createProviderPhaseHostImpl ? { createProviderPhaseHostImpl } : {}),
      });
      const result = effectOnly && rawResult.status === 'needs-decision'
        ? { status: 'needs-decision', unresolvedDecisions: structuredClone(rawResult.result?.routeReceipt?.unresolvedDecisions) }
        : structuredClone(rawResult);
      if (result.status === 'needs-decision') {
        assertNoCredentialFields(result);
        if (canonicalJson(Object.keys(result).sort()) !== '["status","unresolvedDecisions"]'
            || !Array.isArray(result.unresolvedDecisions)
            || result.unresolvedDecisions.some((item) => typeof item !== 'string')
            || Buffer.byteLength(canonicalJson(result)) > 65_536) {
          throw new Error('workflow decision result is invalid');
        }
        return Object.freeze({ status: 'needs-decision', instanceId: manifest.instanceId,
          missionId, artifact: null,
          unresolvedDecisions: Object.freeze([...result.unresolvedDecisions]) });
      }
      if (result.status === 'pending' || (operation === 'reconcile' && result.status === 'absent')) {
        return Object.freeze({ status: result.status, instanceId: manifest.instanceId,
          missionId, artifact: null });
      }
      const receipt = effectOnly ? effectReceipt : verifyProviderBackedIdentityTerminalResult(result);
      if (!receipt) throw new Error('workflow terminal result is not verified');
      const rejected = receipt.acceptedArtifactDigest === null;
      const disposition = rejected ? 'rejected' : 'accepted';
      if (result.mission.receipt.disposition !== disposition || result.mission.verdict.disposition !== disposition) {
        throw new Error('mission terminal disposition is inconsistent');
      }
      if (rejected) {
        return Object.freeze({ status: 'rejected', instanceId: manifest.instanceId,
          missionId, receipt, artifact: null, usage: result.mission.receipt.usage,
          ...(includeMission ? { mission: deepFreeze(result.mission) } : {}) });
      }
      const realmMaximumBytes = realmBound ? await verifyRealm() : Infinity;
      await verifyInputs();
      const directory = join(root, 'artifacts');
      try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const artifact = await writeAcceptedArtifact({
        directory,
        artifact: result.mission.artifact,
        expectedDigest: receipt.acceptedArtifactDigest,
        maximumBytes: Math.min(request.budgets.maxArtifactBytes + 1, policy.runtime.limits.maxArtifactBytes + 1, realmMaximumBytes),
      });
      return Object.freeze({ status: 'completed', instanceId: manifest.instanceId,
        missionId, receipt, artifact, usage: result.mission.receipt.usage,
        ...(includeMission ? { mission: deepFreeze(result.mission) } : {}) });
    }
    function artifactOperation(request, operation) {
      if (phase !== 'active') return Promise.reject(new Error(`workflow owner is ${phase}`));
      let snapshot;
      try { snapshot = structuredClone(request); } catch (error) { return Promise.reject(error); }
      return track(() => { requireRealmBound(); return runMission(snapshot, operation, true); });
    }
    const owner = Object.freeze({
      runPrepared: operation => track(() => runMission(structuredClone(mission), operation)),
      describeArtifactBinding: () => track(describeArtifactBinding),
      launchArtifactMission: request => artifactOperation(request, 'launch'),
      reconcileArtifactMission: request => artifactOperation(request, 'reconcile'),
    });
    issuedOwners.set(owner, () => phase === 'active');
    try { return await callback(owner); }
    finally {
      phase = 'closing';
      try {
        const settled = await Promise.allSettled([...pending]);
        const failed = settled.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      } finally { phase = 'closed'; }
    }
  } finally {
    await lock.release();
  }
}
