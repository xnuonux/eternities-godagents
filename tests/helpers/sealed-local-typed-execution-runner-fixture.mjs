import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256Value } from '../../src/core/digest.mjs';
import { createSealedLocalTypedExecutionRunner } from '../../src/runtime/sealed-local-typed-execution-runner.mjs';
import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { pinnedGodskillsTypedCompositionRelease } from '../../scripts/lib/pinned-godskills-typed-composition.mjs';
import { pinnedGodskillsTypedExecutionStepperRelease } from '../../scripts/lib/pinned-godskills-typed-execution-stepper.mjs';
import {
  bindingInput,
  executors,
  godskillsRoot,
  missionInputs,
  topology,
} from './recoverable-typed-composition-fixture.mjs';

function classifier() {
  return {
    taskClass: 'implementation',
    consequenceClass: 'consequential',
    reviewAvailable: false,
  };
}

function fixedClock(start) {
  let tick = 0;
  return () => new Date(Date.parse(start) + tick++ * 100).toISOString();
}

function requestFor(missionId, declaredTopology, observed) {
  const input = bindingInput(missionId);
  input.mission.text = 'define one visual language across interface motion and accessibility, then carry the approved cross-component change through implementation tests review and integration';
  return {
    bindingInput: input,
    topology: declaredTopology,
    missionInputs: missionInputs(),
    executors: executors(observed),
  };
}

function options(runtimeRoot, overrides = {}) {
  return {
    runtimeRoot,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
    compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    stepperReleasePin: pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot),
    activationClassifier: classifier,
    processClock: fixedClock('2026-09-01T00:10:00.000Z'),
    ...overrides,
  };
}

async function filesBelow(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else result.push(path);
    }
  }
  await visit(root);
  return result.sort();
}

function countMethodFields(value) {
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + countMethodFields(child), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce(
    (sum, [name, child]) => sum + (name === 'method' ? 1 : 0) + countMethodFields(child),
    0,
  );
}

export async function buildDeterministicSealedLocalTypedExecutionRunnerFixture() {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'godagents-sealed-typed-runner-fixture-'));
  try {
    const missionId = 'sealed-local-typed-execution-runner-certification-v1';
    const declaredTopology = await topology(missionId);
    const launches = { route: 0, activation: 0 };
    const firstObserved = [];
    const first = await createSealedLocalTypedExecutionRunner(options(runtimeRoot, {
      processCheckpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') launches.route += 1;
        if (name === 'before-local-godskills-activation-process') launches.activation += 1;
      },
      journalCheckpoint: async (name, record) => {
        if (name === 'after-typed-step-persisted' && record.order === 0) {
          throw new Error('certification crash after persisted Muse output');
        }
      },
    }));
    let crashObserved = false;
    try {
      await first.run(requestFor(missionId, declaredTopology, firstObserved));
    } catch (error) {
      if (!/certification crash/.test(error.message)) throw error;
      crashObserved = true;
    }

    const recoveryObserved = [];
    const recovered = await createSealedLocalTypedExecutionRunner(options(runtimeRoot, {
      processClock: fixedClock('2026-09-01T00:20:00.000Z'),
      processCheckpoint: async (name) => {
        if (name.startsWith('before-local-godskills-')) throw new Error('completed process relaunched');
      },
    }));
    const completion = await recovered.run(requestFor(missionId, declaredTopology, recoveryObserved));

    const replayObserved = [];
    const replay = await createSealedLocalTypedExecutionRunner(options(runtimeRoot, {
      processClock: fixedClock('2026-09-01T00:30:00.000Z'),
      processCheckpoint: async (name) => {
        if (name.startsWith('before-local-godskills-')) throw new Error('terminal process replay');
      },
    }));
    const terminal = await replay.run(requestFor(missionId, declaredTopology, replayObserved));
    const files = await filesBelow(runtimeRoot);
    let serializedMethodFields = 0;
    for (const path of files.filter((value) => value.endsWith('.json'))) {
      serializedMethodFields += countMethodFields(JSON.parse(await readFile(path, 'utf8')));
    }
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-sealed-local-typed-execution-runner-fixture-v1',
      roots: {
        godskillsReleaseDigest: recovered.descriptor.godskillsReleaseDigest,
        typedCompositionReceiptDigest: recovered.descriptor.typedComposition.trustRootDigest,
        stepperReceiptDigest: recovered.descriptor.stepperTrustRootDigest,
        routingTrustRootDigest: recovered.descriptor.localExecution.routingTrustRootDigest,
        activationTrustRootDigest: recovered.descriptor.localExecution.activationTrustRootDigest,
      },
      compilation: completion.compilation,
      execution: {
        executionId: completion.execution.executionId,
        journalHeadDigest: completion.execution.journalHeadDigest,
        completionDigest: completion.execution.completion.completionDigest,
        executionDigest: completion.execution.completion.result.receipt.executionDigest,
      },
      recovery: {
        crashObserved,
        launches,
        firstExecutions: firstObserved.map(({ capabilityId }) => capabilityId),
        recoveryExecutions: recoveryObserved.map(({ capabilityId }) => capabilityId),
        recoveredSteps: completion.execution.recoveredSteps,
        executedSteps: completion.execution.executedSteps,
        replayExecutions: replayObserved.map(({ capabilityId }) => capabilityId),
        replayRecoveredSteps: terminal.execution.recoveredSteps,
        replayExecutedSteps: terminal.execution.executedSteps,
      },
      durableState: {
        files: files.length,
        serializedMethodFields,
      },
      guarantees: {
        callerTransportInjection: false,
        callerActivationResultInjection: false,
        methodSerialized: false,
        externalExactlyOnce: false,
        authorityExpanded: false,
        defaultLaunchEnabled: false,
      },
    };
    return Object.freeze({ ...unsigned, fixtureDigest: sha256Value(unsigned) });
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}
