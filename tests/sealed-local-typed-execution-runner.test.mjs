import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { pinnedGodskillsTypedCompositionRelease } from '../scripts/lib/pinned-godskills-typed-composition.mjs';
import { pinnedGodskillsTypedExecutionStepperRelease } from '../scripts/lib/pinned-godskills-typed-execution-stepper.mjs';
import {
  bindingInput,
  executors,
  godskillsRoot,
  missionInputs,
  topology,
} from './helpers/recoverable-typed-composition-fixture.mjs';
import { buildDeterministicSealedLocalTypedExecutionRunnerFixture } from './helpers/sealed-local-typed-execution-runner-fixture.mjs';

async function runnerModule() {
  try {
    return await import('../src/runtime/sealed-local-typed-execution-runner.mjs');
  } catch (error) {
    assert.fail(`sealed local typed execution runner is unavailable: ${error.message}`);
  }
}

function classifier() {
  return {
    taskClass: 'implementation',
    consequenceClass: 'consequential',
    reviewAvailable: false,
  };
}

function fixedClock(start = '2026-08-31T23:50:00.000Z') {
  let tick = 0;
  return () => new Date(Date.parse(start) + tick++ * 100).toISOString();
}

function localInput(missionId) {
  const input = bindingInput(missionId);
  input.mission.text = 'define one visual language across interface motion and accessibility, then carry the approved cross-component change through implementation tests review and integration';
  return input;
}

async function fixture(t, suffix) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), `godagents-sealed-typed-runner-${suffix}-`));
  t.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const missionId = `sealed-typed-execution-${suffix}`;
  return {
    runtimeRoot,
    missionId,
    request: {
      bindingInput: localInput(missionId),
      topology: await topology(missionId),
      missionInputs: missionInputs(),
    },
  };
}

function options(value, overrides = {}) {
  return {
    runtimeRoot: value.runtimeRoot,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
    compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    stepperReleasePin: pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot),
    activationClassifier: classifier,
    processClock: fixedClock(),
    ...overrides,
  };
}

test('runs sealed local routing activation compilation and durable typed execution end to end', async (t) => {
  const value = await fixture(t, 'complete');
  const launches = { route: 0, activation: 0 };
  const observed = [];
  const { assertSealedLocalTypedExecutionRunner, createSealedLocalTypedExecutionRunner } = await runnerModule();
  const runner = await createSealedLocalTypedExecutionRunner(options(value, {
    processCheckpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') launches.route += 1;
      if (name === 'before-local-godskills-activation-process') launches.activation += 1;
    },
  }));
  assert.equal(assertSealedLocalTypedExecutionRunner(runner), runner);
  assert.throws(() => assertSealedLocalTypedExecutionRunner({ ...runner }), /provenance|sealed|runner/i);
  const result = await runner.run({ ...value.request, executors: executors(observed) });

  assert.equal(result.status, 'completed');
  assert.equal(result.compilation.methodDigest, result.execution.completion.result.receipt.methodDigest);
  assert.equal(result.execution.completion.result.outputs.implementation.status, 'verified');
  assert.equal(result.execution.executedSteps, 2);
  assert.equal(result.execution.recoveredSteps, 0);
  assert.equal(result.execution.externalExactlyOnce, false);
  assert.equal(result.authorityExpanded, false);
  assert.equal(runner.descriptor.defaultLaunchEnabled, false);
  assert.equal(runner.descriptor.callerTransportInjection, false);
  assert.deepEqual(launches, { route: 1, activation: 1 });
  assert.equal(observed.length, 2);
});

test('reconstruction skips completed local processes and the persisted first node', async (t) => {
  const value = await fixture(t, 'recovery');
  const launches = { route: 0, activation: 0 };
  const firstObserved = [];
  const { createSealedLocalTypedExecutionRunner } = await runnerModule();
  const first = await createSealedLocalTypedExecutionRunner(options(value, {
    processCheckpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') launches.route += 1;
      if (name === 'before-local-godskills-activation-process') launches.activation += 1;
    },
    journalCheckpoint: async (name, record) => {
      if (name === 'after-typed-step-persisted' && record.order === 0) {
        throw new Error('simulated sealed runner process death');
      }
    },
  }));
  await assert.rejects(
    first.run({ ...value.request, executors: executors(firstObserved) }),
    /simulated sealed runner process death/i,
  );
  assert.deepEqual(launches, { route: 1, activation: 1 });
  assert.equal(firstObserved.length, 1);
  assert.equal(firstObserved[0].capabilityId, 'eternities-muse');

  const recoveredObserved = [];
  const recovered = await createSealedLocalTypedExecutionRunner(options(value, {
    processClock: fixedClock('2026-09-01T00:00:00.000Z'),
    processCheckpoint: async (name) => {
      if (name.startsWith('before-local-godskills-')) throw new Error('completed process relaunched');
    },
  }));
  const result = await recovered.run({ ...value.request, executors: executors(recoveredObserved) });
  assert.equal(result.execution.recoveredSteps, 1);
  assert.equal(result.execution.executedSteps, 1);
  assert.equal(recoveredObserved.length, 1);
  assert.equal(recoveredObserved[0].capabilityId, 'eternities-forge');
  assert.deepEqual(launches, { route: 1, activation: 1 });
});

test('exact terminal replay performs no local process or node execution', async (t) => {
  const value = await fixture(t, 'replay');
  const { createSealedLocalTypedExecutionRunner } = await runnerModule();
  const first = await createSealedLocalTypedExecutionRunner(options(value));
  await first.run({ ...value.request, executors: executors([]) });

  const replay = await createSealedLocalTypedExecutionRunner(options(value, {
    processCheckpoint: async (name) => {
      if (name.startsWith('before-local-godskills-')) throw new Error('terminal process replay');
    },
  }));
  const observed = [];
  const result = await replay.run({ ...value.request, executors: executors(observed) });
  assert.deepEqual(observed, []);
  assert.equal(result.execution.recoveredSteps, 2);
  assert.equal(result.execution.executedSteps, 0);
});

test('impossible topology and stepper pin drift fail before any child launch', async (t) => {
  const value = await fixture(t, 'preflight');
  const launches = [];
  const { createSealedLocalTypedExecutionRunner } = await runnerModule();
  const runner = await createSealedLocalTypedExecutionRunner(options(value, {
    processCheckpoint: async (name) => launches.push(name),
  }));
  const impossible = structuredClone(value.request.topology);
  impossible.links[0].consumer.nodeId = 'missing-node';
  await assert.rejects(runner.run({
    ...value.request,
    topology: impossible,
    executors: executors([]),
  }), /topology|consumer|node/i);
  assert.deepEqual(launches, []);

  const changedStepper = pinnedGodskillsTypedExecutionStepperRelease(godskillsRoot);
  changedStepper.releaseReceipt.receiptDigest = '0'.repeat(64);
  await assert.rejects(
    createSealedLocalTypedExecutionRunner(options(value, {
      stepperReleasePin: changedStepper,
      processCheckpoint: async (name) => launches.push(name),
    })),
    /stepper|receipt|pin|digest/i,
  );
  assert.deepEqual(launches, []);
});

test('caller transport and activation-result injection are rejected at construction', async (t) => {
  const value = await fixture(t, 'closed-options');
  const { createSealedLocalTypedExecutionRunner } = await runnerModule();
  for (const injected of [
    { routingTransport: {} },
    { activationTransport: {} },
    { activationResult: {} },
    { typedMethod: {} },
  ]) {
    await assert.rejects(
      createSealedLocalTypedExecutionRunner({ ...options(value), ...injected }),
      /options|invalid|injection/i,
    );
  }
});

test('rebuilds the frozen sealed local typed execution runner fixture exactly', async () => {
  const expected = JSON.parse(await readFile(
    new URL('../fixtures/sealed-local-typed-execution-runner-v1.json', import.meta.url),
    'utf8',
  ));
  const actual = await buildDeterministicSealedLocalTypedExecutionRunnerFixture();
  assert.deepEqual(actual, expected);
});
