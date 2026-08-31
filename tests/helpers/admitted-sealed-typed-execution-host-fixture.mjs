import { writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { pinnedGodskillsTypedCompositionRelease } from '../../scripts/lib/pinned-godskills-typed-composition.mjs';
import { pinnedGodskillsTypedExecutionStepperRelease } from '../../scripts/lib/pinned-godskills-typed-execution-stepper.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';
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
    execute: functions[capabilityId],
  }));
}

function fixedClock(start) {
  let tick = 0;
  return () => new Date(Date.parse(start) + tick++ * 100).toISOString();
}

export async function admittedTypedExecutionHostFixture(context, suffix = 'complete') {
  const admitted = await setupAdmittedIdentity(context, `admitted-typed-host-${suffix}`);
  if (context) context.after(() => import('node:fs/promises').then(({ rm }) => rm(admitted.root, { recursive: true, force: true })));
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
      registryRoot: join(admitted.root, 'instance-registry'),
      clock: fixedClock('2026-09-01T02:00:00.000Z'),
      processClock: fixedClock('2026-09-01T01:00:00.000Z'),
    },
  };
}
