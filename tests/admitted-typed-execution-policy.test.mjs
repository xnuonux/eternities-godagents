import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { pinnedGodskillsTypedCompositionRelease } from '../scripts/lib/pinned-godskills-typed-composition.mjs';
import { pinnedGodskillsTypedExecutionStepperRelease } from '../scripts/lib/pinned-godskills-typed-execution-stepper.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import {
  verifyAdmittedTypedExecutionHostRequest,
  verifyTypedCapabilityExecutorDescriptor,
} from '../src/host/admitted-typed-execution-contracts.mjs';
import { loadAdmittedTypedExecutionPolicy } from '../src/host/admitted-typed-execution-policy.mjs';
import { createRoutingEvidenceActivationClassifier } from '../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../src/skills/routing-executable-verifier.mjs';
import { vesselRequest } from './helpers/identity-bound-mission-vessel-certification-fixture.mjs';
import {
  godskillsRoot,
  missionInputs,
  topology,
} from './helpers/recoverable-typed-composition-fixture.mjs';

function executorDescriptor(capabilityId) {
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

async function policyFixture() {
  const release = pinnedGodskillsReviewRelease(godskillsRoot);
  const routing = pinnedGodskillsRoutingExecutable();
  const verifiedRouting = await verifyGodskillsRoutingExecutable({ releasePin: release, routingPin: routing });
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verifiedRouting,
    reviewAvailable: true,
  });
  return {
    schemaVersion: 1,
    policyId: 'typed-host-policy-fixture-v1',
    runtime: {
      protocolId: 'eternities-admitted-sealed-typed-execution-host-v1',
      instanceId: 'fixture-instance',
      distributionDir: 'distribution',
      journalPath: 'vessel/journal.jsonl',
      snapshotPath: 'vessel/snapshot.json',
      hostAdapterId: 'godagents-admitted-typed-v1',
      revocationEpoch: 0,
      godskillsRelease: release,
      routingExecutable: routing,
      typedCompositionRelease: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
      typedExecutionStepperRelease: pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot),
      activationClassifier: structuredClone(classifier.descriptor),
      executors: [
        executorDescriptor('eternities-forge'),
        executorDescriptor('eternities-muse'),
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
        maxArtifactBytes: 65_536,
        nativeCompletionTokens: 4096,
        reviewCompletionTokensPerRound: 4096,
        revisionCompletionTokens: 4096,
        totalCompletionTokens: 12_288,
        maxProjectionBytes: 65_536,
        maxCycles: 3,
      },
    },
    realmId: 'fixture-workbench',
    authority: ['local-read', 'local-write'],
    hostContext: {
      permittedEffects: ['local-read', 'local-write'],
      availableAuthority: ['local-read', 'local-write'],
      availablePreconditions: ['repository-present'],
      forbiddenCapabilities: [],
      maximumRisk: 'high',
      minimumEvidenceConfidence: 'verified',
      contextBudget: 32_768,
      maxCompositionSize: 3,
    },
  };
}

test('loads one canonical deeply frozen typed execution host policy', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godagents-typed-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'policy.json');
  const policy = await policyFixture();
  await writeFile(path, `${canonicalJson(policy)}\n`, 'utf8');
  const loaded = await loadAdmittedTypedExecutionPolicy(path);
  assert.deepEqual(loaded.policy, policy);
  assert.match(loaded.digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(loaded.policy.runtime.executors[0]), true);

  await writeFile(path, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  await assert.rejects(loadAdmittedTypedExecutionPolicy(path), /canonical|policy/i);
});

test('executor descriptor and policy reject authority fields drift and ordering ambiguity', async (t) => {
  const descriptor = executorDescriptor('eternities-muse');
  assert.deepEqual(verifyTypedCapabilityExecutorDescriptor(descriptor), descriptor);
  assert.throws(
    () => verifyTypedCapabilityExecutorDescriptor({ ...descriptor, authority: ['realm:write'] }),
    /authority/i,
  );
  assert.throws(
    () => verifyTypedCapabilityExecutorDescriptor({ ...descriptor, endpoint: 'https://example.invalid' }),
    /schema|field|descriptor/i,
  );

  const root = await mkdtemp(join(tmpdir(), 'godagents-typed-policy-negative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'policy.json');
  const policy = await policyFixture();
  policy.runtime.executors.reverse();
  await writeFile(path, `${canonicalJson(policy)}\n`, 'utf8');
  await assert.rejects(loadAdmittedTypedExecutionPolicy(path), /sorted|executor/i);
});

test('host request reuses the identity request and closes topology plus mission inputs', async () => {
  const missionRequest = vesselRequest();
  const value = verifyAdmittedTypedExecutionHostRequest({
    missionRequest,
    topology: await topology(missionRequest.mission.missionId),
    missionInputs: missionInputs(),
  });
  assert.equal(value.missionRequest.mission.missionId, missionRequest.mission.missionId);
  assert.equal(Object.isFrozen(value.topology), true);
  assert.throws(() => verifyAdmittedTypedExecutionHostRequest({ ...value, bindingInput: {} }), /field|request/i);
});
