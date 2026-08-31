import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

async function adapterModule() {
  try {
    return await import('../src/skills/local-recoverable-godskills-adapter.mjs');
  } catch (error) {
    assert.fail(`local recoverable Godskills adapter is unavailable: ${error.message}`);
  }
}

function bindingInput(requestId = 'sealed-local-admission') {
  return {
    mission: {
      requestId,
      text: 'coordinate implementation tests review verification and integration for the settled release',
      authority: ['local-read', 'local-write', 'realm:write', 'repository-write'],
      explicitMethodRequests: [],
    },
    observation: { observationId: `${requestId}-observation`, counter: 0 },
    genomePolicy: {
      protocolId: 'eternities-godskills-adapter-v1',
      profile: 'all-rounder',
      preferredFamilies: [],
      prohibitedFamilies: [],
      prohibitedCapabilities: [],
      maxComposition: 3,
    },
    hostEnvelope: {
      availableAuthority: ['local-read', 'local-write', 'realm:write', 'repository-write'],
      permittedEffects: ['local-read', 'local-write'],
      availablePreconditions: ['repository-present', 'settled-outcome'],
      forbiddenCapabilities: [],
      maximumRisk: 'moderate',
      minimumEvidenceConfidence: 'verified',
      contextBudget: 16_000,
      maxCompositionSize: 3,
      constitutionAllowedEffects: ['local-read', 'local-write'],
      realmHandContractDigest: 'a'.repeat(64),
    },
    sourceStateEpoch: 0,
  };
}

function classifier(counter) {
  return () => {
    counter.count += 1;
    return {
      taskClass: 'verification',
      consequenceClass: 'consequential',
      reviewAvailable: true,
    };
  };
}

async function workspace(t, name) {
  const root = await mkdtemp(join(tmpdir(), `godagents-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function allFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path.slice(root.length + 1).replaceAll('\\', '/'));
    }
  }
  await walk(root);
  return files.sort();
}

test('opt-in local composition recovers route and activation before immutable binding replay', async (t) => {
  const root = await workspace(t, 'local-composition');
  const { createLocalRecoverableGodskillsAdapter } = await adapterModule();
  const counters = { routeLaunches: 0, activationLaunches: 0 };
  const classifications = { count: 0 };
  let crash = true;
  const common = {
    admissionRoot: root,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
    activationClassifier: classifier(classifications),
  };
  const first = await createLocalRecoverableGodskillsAdapter({
    ...common,
    checkpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') counters.routeLaunches += 1;
      if (name === 'before-local-godskills-activation-process') counters.activationLaunches += 1;
      if (crash && name === 'after-local-godskills-activation-process') {
        crash = false;
        throw new Error('simulated process death after activation result');
      }
    },
  });
  const input = bindingInput();
  await assert.rejects(first.bindMission(input), /simulated process death/i);
  assert.deepEqual(counters, { routeLaunches: 1, activationLaunches: 1 });
  assert.equal(classifications.count, 1);

  const recovered = await createLocalRecoverableGodskillsAdapter({
    ...common,
    checkpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') throw new Error('route must not relaunch');
      if (name === 'before-local-godskills-activation-process') throw new Error('activation must not relaunch');
    },
  });
  const binding = await recovered.bindMission(input);
  assert.equal(binding.status, 'bound');
  assert.ok(binding.cortexPackage.selectedCapabilities.length > 0);
  assert.equal(binding.receipt.activation.trustRootDigest, 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7');
  assert.equal(classifications.count, 2);
  assert.deepEqual(counters, { routeLaunches: 1, activationLaunches: 1 });
  assert.equal(recovered.localExecution.routingTrustRootDigest, '30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28');
  assert.equal(recovered.localExecution.routeMode, 'default');

  const replay = await recovered.bindMission(input);
  assert.deepEqual(replay, binding);
  assert.deepEqual(await recovered.rehydrateMission({ receipt: binding.receipt, ...input }), binding);
  assert.equal(classifications.count, 2);
  assert.deepEqual(counters, { routeLaunches: 1, activationLaunches: 1 });

  const files = await allFiles(root);
  assert.equal(files.some((path) => /local-process-terminal\/route\/.+\/result\.json$/.test(path)), true);
  assert.equal(files.some((path) => /local-process-terminal\/activation\/.+\/result\.json$/.test(path)), true);
  assert.equal(files.some((path) => /bindings\/.+\/result\.json$/.test(path)), true);
});

test('local composition requires the exact adaptive activation root before creating transports', async (t) => {
  const root = await workspace(t, 'local-no-activation');
  const { createLocalRecoverableGodskillsAdapter } = await adapterModule();
  const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
  delete releasePin.activation;
  await assert.rejects(
    createLocalRecoverableGodskillsAdapter({
      admissionRoot: root,
      releasePin,
      routingPin: pinnedGodskillsRoutingExecutable(),
      activationClassifier: () => ({
        taskClass: 'verification',
        consequenceClass: 'consequential',
        reviewAvailable: true,
      }),
    }),
    /activation.*required|verified.*activation|activation.*unavailable/i,
  );
});
