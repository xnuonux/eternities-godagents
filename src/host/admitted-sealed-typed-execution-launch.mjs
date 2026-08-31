import { timingSafeEqual } from 'node:crypto';
import { join, resolve } from 'node:path';

import { compileCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { verifyGenesisAdmission } from '../genesis/verify.mjs';
import { createLocalKeelBackend } from '../keel/local-reference-backend.mjs';
import { createSealedLocalTypedExecutionRunner } from '../runtime/sealed-local-typed-execution-runner.mjs';
import { buildCortexBindingRequestFromVesselRequest } from '../runtime/identity-bound-mission-vessel-contracts.mjs';
import { createRoutingEvidenceActivationClassifier } from '../skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../skills/routing-executable-verifier.mjs';
import { verifyGodskillsTypedCompositionRelease } from '../skills/typed-composition-verifier.mjs';
import { verifyGodskillsTypedExecutionStepperRelease } from '../skills/typed-execution-stepper-verifier.mjs';
import {
  assertAdmissionPolicyBinding,
  assertSafeAdmissionTree,
  readAdmissionBinding,
} from './admitted-identity-boundary.mjs';
import {
  buildAdmittedTypedExecutionHostCompletion,
  verifyAdmittedTypedExecutionHostRequest,
  verifyTypedCapabilityExecutorDescriptor,
} from './admitted-typed-execution-contracts.mjs';
import { loadAdmittedTypedExecutionPolicy } from './admitted-typed-execution-policy.mjs';
import { claimLocalInstanceResidency, defaultLocalInstanceRegistryRoot } from './local-instance-registry.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const MESSAGES = Object.freeze({
  'input-invalid': 'admitted typed execution host input is invalid',
  'admission-invalid': 'admitted typed execution host evidence is invalid',
  'policy-integrity': 'admitted typed execution host policy integrity failed',
  'policy-mismatch': 'admitted typed execution host policy does not match admission',
  'request-invalid': 'admitted typed execution host request exceeds policy',
  'dependency-mismatch': 'admitted typed execution host dependency differs from policy',
  'residency-conflict': 'admitted typed execution host identity is resident elsewhere',
  'launch-failed': 'admitted typed execution host launch failed',
});

export class AdmittedTypedExecutionHostError extends Error {
  constructor(code, cause) {
    if (!Object.hasOwn(MESSAGES, code)) throw new TypeError('typed execution host error code is invalid');
    super(MESSAGES[code], cause === undefined ? undefined : { cause });
    this.name = 'AdmittedTypedExecutionHostError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new AdmittedTypedExecutionHostError(code, cause);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotExecutors(executors) {
  if (!Array.isArray(executors) || executors.length < 1 || executors.length > 3) fail('input-invalid');
  try {
    return executors.map((executor) => {
      if (!object(executor) || typeof executor.descriptor !== 'function' || typeof executor.execute !== 'function') {
        throw new TypeError('typed executor shape is invalid');
      }
      const descriptor = executor.descriptor();
      if (descriptor && typeof descriptor.then === 'function') {
        throw new TypeError('typed executor descriptor must be synchronous');
      }
      return Object.freeze({
        descriptor: verifyTypedCapabilityExecutorDescriptor(descriptor),
        execute: executor.execute,
      });
    });
  } catch (error) {
    fail('input-invalid', error);
  }
}

function validateInputs(value) {
  if (!object(value)
      || typeof value.admissionRoot !== 'string' || value.admissionRoot.length === 0 || /[\0\r\n]/.test(value.admissionRoot)
      || typeof value.policyPath !== 'string' || value.policyPath.length === 0 || /[\0\r\n]/.test(value.policyPath)
      || !object(value.env)
      || (value.registryRoot !== undefined && (typeof value.registryRoot !== 'string' || value.registryRoot.length === 0 || /[\0\r\n]/.test(value.registryRoot)))
      || typeof value.clock !== 'function' || typeof value.processClock !== 'function'
      || typeof value.processCheckpoint !== 'function' || typeof value.admissionCheckpoint !== 'function'
      || typeof value.compilerCheckpoint !== 'function' || typeof value.journalCheckpoint !== 'function'
      || !object(value.processLockOptions) || !object(value.admissionLockOptions)
      || !object(value.compilerLockOptions) || !object(value.journalLockOptions)
      || !(value.artifactCache instanceof Map) || !object(value.io)
      || !object(value.compositionIo) || !object(value.stepperIo)) fail('input-invalid');
}

function verifyRequestPolicy(policy, request) {
  const mission = request.missionRequest;
  if (mission.task.hostAdapterId !== policy.runtime.hostAdapterId
      || mission.task.revocationEpoch !== policy.runtime.revocationEpoch
      || !same(mission.hostCeiling, policy.hostContext)
      || mission.requestedAuthority.some((entry) => !policy.authority.includes(entry))) {
    throw new Error('typed execution request identity authority or context differs from policy');
  }
  const limits = policy.runtime.limits;
  for (const [actual, maximum, label] of [
    [mission.budgets.maxArtifactBytes, limits.maxArtifactBytes, 'artifact bytes'],
    [mission.budgets.nativeCompletionTokens, limits.nativeCompletionTokens, 'native tokens'],
    [mission.budgets.reviewCompletionTokensPerRound, limits.reviewCompletionTokensPerRound, 'review tokens'],
    [mission.budgets.revisionCompletionTokens, limits.revisionCompletionTokens, 'revision tokens'],
    [mission.budgets.totalCompletionTokens, limits.totalCompletionTokens, 'total tokens'],
    [mission.maxProjectionBytes, limits.maxProjectionBytes, 'projection bytes'],
    [mission.maxCycles, limits.maxCycles, 'cycles'],
    [request.topology.nodes.length, limits.maximumTopologyNodes, 'topology nodes'],
    [request.topology.links.length, limits.maximumTopologyLinks, 'topology links'],
    [Buffer.byteLength(canonicalJson(request.missionInputs), 'utf8'), limits.maximumMissionInputBytes, 'mission input bytes'],
  ]) {
    if (actual > maximum) throw new Error(`typed execution request ${label} exceeds policy`);
  }
  if (!same(request.topology.authorityProjection, {
    availableAuthority: mission.hostCeiling.availableAuthority,
    availablePreconditions: mission.hostCeiling.availablePreconditions,
    contextBudget: mission.hostCeiling.contextBudget,
    maximumRisk: mission.hostCeiling.maximumRisk,
    minimumEvidenceConfidence: mission.hostCeiling.minimumEvidenceConfidence,
    permittedEffects: mission.hostCeiling.permittedEffects,
  })) throw new Error('typed execution topology authority differs from mission ceiling');
}

async function verifyDependencies(policy, liveExecutors, artifactCache, io, compositionIo, stepperIo) {
  const verifiedRouting = await verifyGodskillsRoutingExecutable({
    releasePin: policy.runtime.godskillsRelease,
    routingPin: policy.runtime.routingExecutable,
    artifactCache,
    io,
  });
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verifiedRouting,
    reviewAvailable: policy.runtime.executors.some(({ capabilityId }) => capabilityId === 'eternities-muse'),
  });
  if (!same(classifier.descriptor, policy.runtime.activationClassifier)) {
    throw new Error('typed execution activation classifier differs from policy');
  }
  await verifyGodskillsTypedCompositionRelease({
    releasePin: policy.runtime.typedCompositionRelease,
    io: compositionIo,
  });
  await verifyGodskillsTypedExecutionStepperRelease({
    releasePin: policy.runtime.typedExecutionStepperRelease,
    io: stepperIo,
  });
  const descriptors = liveExecutors.map(({ descriptor }) => descriptor);
  if (!same(descriptors, policy.runtime.executors)) {
    throw new Error('typed execution live executor descriptors differ from policy');
  }
  return Object.freeze({ classifier: classifier.classify });
}

function bindingInput(request, candidate) {
  const mission = request.missionRequest;
  return {
    mission: {
      requestId: mission.mission.missionId,
      text: mission.mission.objective,
      authority: structuredClone(mission.requestedAuthority),
      explicitMethodRequests: structuredClone(mission.explicitMethodRequests),
    },
    observation: structuredClone(mission.observation),
    genomePolicy: structuredClone(candidate.fullEnvelope.capability.godskills),
    hostEnvelope: {
      ...structuredClone(mission.hostCeiling),
      constitutionAllowedEffects: structuredClone(candidate.fullEnvelope.authority.declaredEffectCeiling),
      realmHandContractDigest: candidate.fullEnvelope.authority.realmContractDigest,
    },
    sourceStateEpoch: mission.sourceStateEpoch,
  };
}

export async function launchAdmittedSealedTypedExecutionMission(input = {}) {
  const liveExecutors = snapshotExecutors(input.executors);
  const options = {
    admissionRoot: input.admissionRoot,
    policyPath: input.policyPath,
    request: input.request,
    env: input.env,
    registryRoot: input.registryRoot,
    clock: input.clock ?? (() => new Date().toISOString()),
    processClock: input.processClock ?? (() => new Date().toISOString()),
    processCheckpoint: input.processCheckpoint ?? (async () => {}),
    admissionCheckpoint: input.admissionCheckpoint ?? (async () => {}),
    compilerCheckpoint: input.compilerCheckpoint ?? (async () => {}),
    journalCheckpoint: input.journalCheckpoint ?? (async () => {}),
    processLockOptions: input.processLockOptions ?? {},
    admissionLockOptions: input.admissionLockOptions ?? {},
    compilerLockOptions: input.compilerLockOptions ?? {},
    journalLockOptions: input.journalLockOptions ?? {},
    artifactCache: input.artifactCache ?? new Map(),
    io: input.io ?? {},
    compositionIo: input.compositionIo ?? {},
    stepperIo: input.stepperIo ?? {},
  };
  validateInputs(options);
  const root = resolve(options.admissionRoot);
  const policyPath = resolve(options.policyPath);
  let binding;
  try {
    await assertSafeAdmissionTree(root);
    binding = await readAdmissionBinding(root);
  } catch (error) {
    fail('admission-invalid', error);
  }
  let loaded;
  try {
    loaded = await loadAdmittedTypedExecutionPolicy(policyPath);
  } catch (error) {
    fail('policy-integrity', error);
  }
  const pin = options.env.GODAGENT_TYPED_EXECUTION_POLICY_SHA256?.toLowerCase();
  if (!DIGEST.test(pin ?? '')
      || !timingSafeEqual(Buffer.from(pin, 'hex'), Buffer.from(loaded.digest, 'hex'))) {
    fail('policy-integrity');
  }
  try {
    assertAdmissionPolicyBinding({ policy: loaded.policy, policyPath, admissionRoot: root, binding });
  } catch (error) {
    fail('policy-mismatch', error);
  }
  const genesisAdmission = {
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
    keelAdapter: createLocalKeelBackend({ root: join(root, 'keels') }),
  };
  let verifiedAdmission;
  try {
    verifiedAdmission = await verifyGenesisAdmission(genesisAdmission);
  } catch (error) {
    fail('admission-invalid', error);
  }
  if (loaded.policy.realmId !== verifiedAdmission.distributionSnapshot.realmContract.realmId) {
    fail('policy-mismatch');
  }
  try {
    await claimLocalInstanceResidency({
      registryRoot: options.registryRoot ?? defaultLocalInstanceRegistryRoot(),
      binding,
      admissionRoot: root,
    });
  } catch (error) {
    fail('residency-conflict', error);
  }
  let request;
  try {
    request = verifyAdmittedTypedExecutionHostRequest(options.request);
    verifyRequestPolicy(loaded.policy, request);
  } catch (error) {
    fail('request-invalid', error);
  }
  let dependencies;
  try {
    dependencies = await verifyDependencies(
      loaded.policy,
      liveExecutors,
      options.artifactCache,
      options.io,
      options.compositionIo,
      options.stepperIo,
    );
    const topologyCapabilities = [...new Set(request.topology.nodes.map(({ capabilityId }) => capabilityId))].sort();
    const executorCapabilities = loaded.policy.runtime.executors.map(({ capabilityId }) => capabilityId);
    if (!same(topologyCapabilities, executorCapabilities)) {
      throw new Error('typed execution topology capability set differs from policy executors');
    }
  } catch (error) {
    fail('dependency-mismatch', error);
  }
  let candidate;
  try {
    candidate = await compileCortexBindingCandidate({
      admission: genesisAdmission,
      request: buildCortexBindingRequestFromVesselRequest(request.missionRequest),
    });
  } catch (error) {
    fail('admission-invalid', error);
  }
  try {
    const limits = loaded.policy.runtime.limits;
    const runner = await createSealedLocalTypedExecutionRunner({
      runtimeRoot: join(root, 'vessel', 'sealed-typed-execution-v1'),
      releasePin: loaded.policy.runtime.godskillsRelease,
      routingPin: loaded.policy.runtime.routingExecutable,
      compositionReleasePin: loaded.policy.runtime.typedCompositionRelease,
      stepperReleasePin: loaded.policy.runtime.typedExecutionStepperRelease,
      activationClassifier: dependencies.classifier,
      artifactCache: options.artifactCache,
      io: options.io,
      compositionIo: options.compositionIo,
      stepperIo: options.stepperIo,
      timeoutMs: limits.timeoutMs,
      maximumGodskillsDispatchBytes: limits.maximumGodskillsDispatchBytes,
      maximumGodskillsCompletionBytes: limits.maximumGodskillsCompletionBytes,
      maximumGodskillsResultBytes: limits.maximumGodskillsResultBytes,
      processClock: options.processClock,
      processCheckpoint: options.processCheckpoint,
      admissionCheckpoint: options.admissionCheckpoint,
      compilerCheckpoint: options.compilerCheckpoint,
      journalCheckpoint: options.journalCheckpoint,
      processLockOptions: options.processLockOptions,
      admissionLockOptions: options.admissionLockOptions,
      compilerLockOptions: options.compilerLockOptions,
      journalLockOptions: options.journalLockOptions,
    });
    const executorMap = Object.fromEntries(liveExecutors.map(({ descriptor, execute }) => [
      descriptor.capabilityId,
      async (executorInput) => {
        if (Buffer.byteLength(canonicalJson(executorInput), 'utf8') > descriptor.maximumInputBytes) {
          throw new Error('typed executor input exceeds descriptor ceiling');
        }
        const output = await execute(deepFreeze(structuredClone(executorInput)));
        if (Buffer.byteLength(canonicalJson(output), 'utf8') > descriptor.maximumOutputBytes) {
          throw new Error('typed executor output exceeds descriptor ceiling');
        }
        return output;
      },
    ]));
    const result = await runner.run({
      bindingInput: bindingInput(request, candidate),
      topology: request.topology,
      missionInputs: request.missionInputs,
      executors: executorMap,
    });
    if (result.status === 'pending') return result;
    const receipt = buildAdmittedTypedExecutionHostCompletion({
      missionId: result.missionId,
      policyDigest: loaded.digest,
      admissionBindingDigest: binding.bindingDigest,
      candidateDigest: candidate.candidateDigest,
      compilationDigest: result.compilation.compilationDigest,
      executionDigest: result.execution.completion.result.receipt.executionDigest,
    });
    return deepFreeze({ status: 'completed', receipt, execution: structuredClone(result) });
  } catch (error) {
    if (error instanceof AdmittedTypedExecutionHostError) throw error;
    fail('launch-failed', error);
  }
}
