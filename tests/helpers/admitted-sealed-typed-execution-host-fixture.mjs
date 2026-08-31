import { createHash } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { pinnedGodskillsTypedCompositionRelease } from '../../scripts/lib/pinned-godskills-typed-composition.mjs';
import { pinnedGodskillsTypedExecutionStepperRelease } from '../../scripts/lib/pinned-godskills-typed-execution-stepper.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { assertNoCredentialFields } from '../../src/cortex/receipt-safety.mjs';
import { readAdmissionBinding } from '../../src/host/admitted-identity-boundary.mjs';
import { defaultLocalInstanceRegistryRoot } from '../../src/host/local-instance-registry.mjs';
import { createRoutingEvidenceActivationClassifier } from '../../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../../src/skills/routing-executable-verifier.mjs';
import { setupAdmittedIdentity } from './admitted-identity-fixture.mjs';
import { vesselRequest } from './identity-bound-mission-vessel-certification-fixture.mjs';
import {
  executors as executorFunctions,
  godskillsRoot,
  missionInputs,
  topology,
} from './recoverable-typed-composition-fixture.mjs';

function normalizedRelative(from, to) {
  return relative(from, to).replaceAll('\\', '/');
}

export function typedExecutorDescriptor(capabilityId) {
  return {
    schemaVersion: 1,
    protocolId: 'eternities-typed-capability-executor-v1',
    executorId: `fixture:${capabilityId}`,
    capabilityId,
    authority: [],
    maximumInputBytes: 65_536,
    maximumOutputBytes: 65_536,
  };
}

export function liveTypedExecutors(observed = []) {
  const functions = executorFunctions(observed);
  return ['eternities-forge', 'eternities-muse'].map((capabilityId) => Object.freeze({
    descriptor: () => typedExecutorDescriptor(capabilityId),
    execute: async (input) => {
      const output = await functions[capabilityId](input);
      const visualSystem = output.slots?.['visual-system'];
      if (visualSystem && Object.hasOwn(visualSystem, 'tokens')) {
        visualSystem.visualPrimitives = visualSystem.tokens;
        delete visualSystem.tokens;
      }
      return output;
    },
  }));
}

async function removeCanonicalResidency(instanceId, admissionRoot) {
  const key = sha256Text(instanceId);
  const root = defaultLocalInstanceRegistryRoot();
  const recordPath = join(root, `${key}.json`);
  let record;
  try {
    record = JSON.parse(await readFile(recordPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    return;
  }
  if (typeof record.admissionRoot !== 'string'
      || resolve(record.admissionRoot) !== resolve(admissionRoot)) return;
  await rm(recordPath, { force: true });
}

export async function admittedTypedExecutionHostFixture(context, suffix = 'complete') {
  const admitted = await setupAdmittedIdentity(context, `admitted-typed-host-${suffix}`);
  if (context) context.after(async () => {
    await removeCanonicalResidency(admitted.admission.instanceId, admitted.admissionRoot);
    await rm(admitted.root, { recursive: true, force: true });
  });
  const request = vesselRequest();
  request.task.hostAdapterId = 'godagents-admitted-typed-v1';
  request.mission.missionId = `admitted-typed-execution-${suffix}`;
  request.mission.objective = 'define one visual language across interface motion and accessibility, then carry the approved cross-component change through implementation tests review and integration';
  request.requestedAuthority = ['local-read', 'local-write', 'repository-write'];
  request.hostCeiling = {
    availableAuthority: ['local-read', 'local-write', 'repository-write'],
    permittedEffects: ['local-read', 'local-write'],
    availablePreconditions: ['repository-present', 'settled-outcome'],
    forbiddenCapabilities: [],
    maximumRisk: 'high',
    minimumEvidenceConfidence: 'verified',
    contextBudget: 4096,
    maxCompositionSize: 3,
  };
  request.budgets.maxArtifactBytes = 65_536;
  const release = pinnedGodskillsReviewRelease(godskillsRoot);
  const routing = pinnedGodskillsRoutingExecutable();
  const composition = pinnedGodskillsTypedCompositionRelease(godskillsRoot);
  const stepper = pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot);
  const verifiedRouting = await verifyGodskillsRoutingExecutable({ releasePin: release, routingPin: routing });
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verifiedRouting,
    reviewAvailable: true,
  });
  const policyPath = join(admitted.root, 'typed-execution-host-policy.json');
  const policyRoot = dirname(policyPath);
  const policy = {
    schemaVersion: 1,
    policyId: `admitted-typed-execution-${suffix}-v1`,
    runtime: {
      protocolId: 'eternities-admitted-sealed-typed-execution-host-v1',
      instanceId: admitted.admission.instanceId,
      distributionDir: normalizedRelative(policyRoot, admitted.admission.distributionDir),
      journalPath: normalizedRelative(policyRoot, admitted.admission.journalPath),
      snapshotPath: normalizedRelative(policyRoot, join(admitted.admissionRoot, 'vessel', 'snapshot.json')),
      hostAdapterId: request.task.hostAdapterId,
      revocationEpoch: request.task.revocationEpoch,
      godskillsRelease: release,
      routingExecutable: routing,
      typedCompositionRelease: composition,
      typedExecutionStepperRelease: stepper,
      activationClassifier: structuredClone(classifier.descriptor),
      executors: [
        typedExecutorDescriptor('eternities-forge'),
        typedExecutorDescriptor('eternities-muse'),
      ],
      limits: {
        timeoutMs: 30_000,
        maximumGodskillsDispatchBytes: 1_048_576,
        maximumGodskillsCompletionBytes: 1_048_576,
        maximumGodskillsResultBytes: 1_048_576,
        maximumExecutorInputBytes: 65_536,
        maximumExecutorOutputBytes: 65_536,
        maximumMissionInputBytes: 131_072,
        maximumTopologyNodes: 3,
        maximumTopologyLinks: 12,
        maxArtifactBytes: request.budgets.maxArtifactBytes,
        nativeCompletionTokens: request.budgets.nativeCompletionTokens,
        reviewCompletionTokensPerRound: request.budgets.reviewCompletionTokensPerRound,
        revisionCompletionTokens: request.budgets.revisionCompletionTokens,
        totalCompletionTokens: request.budgets.totalCompletionTokens,
        maxProjectionBytes: request.maxProjectionBytes,
        maxCycles: request.maxCycles,
      },
    },
    realmId: 'fixture-workbench',
    authority: structuredClone(request.requestedAuthority),
    hostContext: structuredClone(request.hostCeiling),
  };
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  return {
    admitted,
    policy,
    policyPath,
    request: {
      missionRequest: request,
      topology: await topology(request.mission.missionId),
      missionInputs: missionInputs(),
    },
    common: {
      admissionRoot: admitted.admissionRoot,
      policyPath,
      env: { GODAGENT_TYPED_EXECUTION_POLICY_SHA256: sha256Text(canonicalJson(policy)) },
    },
  };
}

async function fileManifest(root) {
  const rows = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else {
        const bytes = await readFile(path);
        rows.push({
          path: normalizedRelative(root, path),
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
  }
  await visit(root);
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

function countNamedFields(value, names) {
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + countNamedFields(child, names), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce(
    (sum, [name, child]) => sum + Number(names.has(name)) + countNamedFields(child, names),
    0,
  );
}

export async function buildDeterministicAdmittedSealedTypedExecutionHostFixture() {
  const fixture = await admittedTypedExecutionHostFixture(null, 'certification');
  try {
    const firstObserved = [];
    const firstExecutors = liveTypedExecutors(firstObserved).map((executor) => (
      executor.descriptor().capabilityId === 'eternities-forge'
        ? { ...executor, execute: async () => { throw new Error('certification crash after persisted Muse output'); } }
        : executor
    ));
    let crashObserved = false;
    try {
      const { launchAdmittedSealedTypedExecutionMission } = await import(
        '../../src/host/admitted-sealed-typed-execution-launch.mjs'
      );
      await launchAdmittedSealedTypedExecutionMission({
        ...fixture.common,
        request: fixture.request,
        executors: firstExecutors,
      });
    } catch (error) {
      if (error?.cause?.message !== 'certification crash after persisted Muse output') throw error;
      crashObserved = true;
    }
    const { launchAdmittedSealedTypedExecutionMission } = await import(
      '../../src/host/admitted-sealed-typed-execution-launch.mjs'
    );
    const recoveryObserved = [];
    const recovered = await launchAdmittedSealedTypedExecutionMission({
      ...fixture.common,
      request: fixture.request,
      executors: liveTypedExecutors(recoveryObserved),
    });
    const replayObserved = [];
    const replay = await launchAdmittedSealedTypedExecutionMission({
      ...fixture.common,
      request: fixture.request,
      executors: liveTypedExecutors(replayObserved),
    });
    const files = await fileManifest(fixture.admitted.admissionRoot);
    const durableOperations = Object.fromEntries(['route', 'activation'].map((stage) => {
      const marker = `/local-process-terminal/${stage}/`;
      const operations = new Set(files.map(({ path }) => {
        const suffix = path.includes(marker) ? path.split(marker)[1] : '';
        return suffix ? suffix.split('/')[0] : '';
      }).filter(Boolean));
      return [stage, operations.size];
    }));
    const admissionBinding = await readAdmissionBinding(fixture.admitted.admissionRoot);
    let serializedMethodFields = 0;
    let forbiddenFields = 0;
    const forbiddenNonCredentialFields = new Set(['endpoint', 'method', 'model', 'provider']);
    for (const row of files.filter(({ path }) => path.endsWith('.json'))) {
      const value = JSON.parse(await readFile(join(fixture.admitted.admissionRoot, ...row.path.split('/')), 'utf8'));
      serializedMethodFields += countNamedFields(value, new Set(['method']));
      assertNoCredentialFields(value);
      forbiddenFields += countNamedFields(value, forbiddenNonCredentialFields);
    }
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-admitted-sealed-typed-execution-host-fixture-v1',
      policy: {
        digest: fixture.common.env.GODAGENT_TYPED_EXECUTION_POLICY_SHA256,
        policyId: fixture.policy.policyId,
        instanceId: fixture.policy.runtime.instanceId,
        realmId: fixture.policy.realmId,
        executorCapabilities: fixture.policy.runtime.executors.map(({ capabilityId }) => capabilityId),
      },
      identity: {
        bindingDigest: admissionBinding.bindingDigest,
        admittedInstanceId: fixture.admitted.admission.instanceId,
      },
      roots: {
        runnerReceiptDigest: '7558bed70b3199936f39244d44c0402807818c286b5eaf8c68688d96821ea831',
        routingTrustRootDigest: fixture.policy.runtime.routingExecutable.executableReceipt.receiptDigest,
        activationTrustRootDigest: fixture.policy.runtime.godskillsRelease.activation.executableReceipt.receiptDigest,
        typedCompositionReceiptDigest: fixture.policy.runtime.typedCompositionRelease.releaseReceipt.receiptDigest,
        stepperReceiptDigest: fixture.policy.runtime.typedExecutionStepperRelease.releaseReceipt.receiptDigest,
      },
      completion: {
        receiptDigest: recovered.receipt.receiptDigest,
        executionBindingDigest: recovered.receipt.executionBindingDigest,
        candidateDigest: recovered.receipt.candidateDigest,
        compilationDigest: recovered.receipt.compilationDigest,
        executionDigest: recovered.receipt.executionDigest,
      },
      recovery: {
        crashObserved,
        durableOperations,
        firstExecutions: firstObserved.map(({ capabilityId }) => capabilityId),
        recoveryExecutions: recoveryObserved.map(({ capabilityId }) => capabilityId),
        recoveredSteps: recovered.execution.execution.recoveredSteps,
        executedSteps: recovered.execution.execution.executedSteps,
        replayExecutions: replayObserved.map(({ capabilityId }) => capabilityId),
        replayRecoveredSteps: replay.execution.execution.recoveredSteps,
        replayExecutedSteps: replay.execution.execution.executedSteps,
        replayReceiptMatched: replay.receipt.receiptDigest === recovered.receipt.receiptDigest,
      },
      durableState: {
        files: files.length,
        structuralManifestDigest: sha256Value(files.map(({ path, bytes }) => ({ path, bytes }))),
        serializedMethodFields,
        forbiddenFields,
      },
      guarantees: {
        externallyPinnedPolicy: true,
        admissionBound: true,
        descriptorBoundExecutors: true,
        policyExecutorBoundDurableNamespace: true,
        canonicalResidencyRegistry: true,
        callerRuntimeHooks: false,
        callerBindingInput: false,
        callerRunnerComponents: false,
        externalExactlyOnce: false,
        authorityExpanded: false,
        defaultLaunchEnabled: false,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await removeCanonicalResidency(fixture.admitted.admission.instanceId, fixture.admitted.admissionRoot);
    await rm(fixture.admitted.root, { recursive: true, force: true });
  }
}
