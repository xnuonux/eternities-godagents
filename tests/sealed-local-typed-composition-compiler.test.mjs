import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { pinnedGodskillsTypedCompositionRelease } from '../scripts/lib/pinned-godskills-typed-composition.mjs';
import {
  assertVerifiedLocalGodskillsProcessTransports,
  createVerifiedLocalGodskillsProcessTransports,
} from '../src/skills/local-recoverable-godskills-adapter.mjs';
import {
  assertSealedLocalTypedCompositionCompiler,
  createSealedLocalTypedCompositionCompiler,
} from '../src/skills/sealed-local-typed-composition-compiler.mjs';
import {
  bindingInput,
  executors,
  godskillsRoot,
  missionInputs,
  topology,
} from './helpers/recoverable-typed-composition-fixture.mjs';

function classifier() {
  return {
    taskClass: 'implementation',
    consequenceClass: 'consequential',
    reviewAvailable: false,
  };
}

function fixedClock(start = '2026-08-31T23:30:00.000Z') {
  let tick = 0;
  return () => new Date(Date.parse(start) + tick++ * 100).toISOString();
}

function localInput(missionId) {
  const input = bindingInput(missionId);
  input.mission.text = 'define one visual language across interface motion and accessibility, then carry the approved cross-component change through implementation tests review and integration';
  return input;
}

async function state(context, suffix) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), `godagents-sealed-typed-${suffix}-`));
  context.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const missionId = `sealed-local-typed-${suffix}`;
  return {
    runtimeRoot,
    missionId,
    bindingInput: localInput(missionId),
    topology: await topology(missionId),
  };
}

function options(fixture, overrides = {}) {
  return {
    runtimeRoot: fixture.runtimeRoot,
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
    compositionReleasePin: pinnedGodskillsTypedCompositionRelease(godskillsRoot),
    activationClassifier: classifier,
    processClock: fixedClock(),
    ...overrides,
  };
}

test('runs the exact local route and activation binaries before typed Muse-to-Forge execution', async (context) => {
  const fixture = await state(context, 'execution');
  const launches = { route: 0, activation: 0 };
  const compiler = await createSealedLocalTypedCompositionCompiler(options(fixture, {
    processCheckpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') launches.route += 1;
      if (name === 'before-local-godskills-activation-process') launches.activation += 1;
    },
  }));
  assert.equal(assertSealedLocalTypedCompositionCompiler(compiler), compiler);
  assert.throws(
    () => assertSealedLocalTypedCompositionCompiler({ ...compiler }),
    /sealed|provenance|compiler/i,
  );
  assert.equal(compiler.descriptor.defaultLaunchEnabled, false);
  assert.equal(compiler.descriptor.authorityExpanded, false);
  assert.equal(compiler.descriptor.localExecution.routeMode, 'default');
  assert.match(compiler.descriptor.localExecution.routingTrustRootDigest, /^[a-f0-9]{64}$/);
  assert.match(compiler.descriptor.localExecution.activationTrustRootDigest, /^[a-f0-9]{64}$/);

  const compilation = await compiler.compileMission({
    bindingInput: fixture.bindingInput,
    topology: fixture.topology,
  });
  const result = await compiler.execute({
    compilation,
    missionInputs: missionInputs(),
    executors: executors(),
  });
  assert.equal(result.outputs.implementation.status, 'verified');
  assert.equal(result.receipt.methodDigest, compilation.methodDigest);
  assert.deepEqual(launches, { route: 1, activation: 1 });

  const replay = await compiler.resumeMission({ missionId: fixture.missionId });
  assert.equal(replay.compilationDigest, compilation.compilationDigest);
  assert.deepEqual(launches, { route: 1, activation: 1 });
});

test('recovers local activation success after process death without relaunch', async (context) => {
  const fixture = await state(context, 'recovery');
  const launches = { route: 0, activation: 0 };
  let crash = true;
  const first = await createSealedLocalTypedCompositionCompiler(options(fixture, {
    processCheckpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') launches.route += 1;
      if (name === 'before-local-godskills-activation-process') launches.activation += 1;
      if (crash && name === 'after-local-godskills-activation-process') {
        crash = false;
        throw new Error('simulated sealed typed process death');
      }
    },
  }));
  await assert.rejects(() => first.compileMission({
    bindingInput: fixture.bindingInput,
    topology: fixture.topology,
  }), /simulated sealed typed process death/);
  assert.deepEqual(launches, { route: 1, activation: 1 });

  const recovered = await createSealedLocalTypedCompositionCompiler(options(fixture, {
    processClock: fixedClock('2026-08-31T23:40:00.000Z'),
    processCheckpoint: async (name) => {
      if (name.startsWith('before-local-godskills-')) {
        throw new Error('completed local Godskills process relaunched');
      }
    },
  }));
  const compilation = await recovered.resumeMission({ missionId: fixture.missionId });
  assert.equal(compilation.status, 'compiled');
  assert.deepEqual(launches, { route: 1, activation: 1 });
  const replay = await recovered.resumeMission({ missionId: fixture.missionId });
  assert.equal(replay.compilationDigest, compilation.compilationDigest);
});

test('rejects impossible topology before launching either local process', async (context) => {
  const fixture = await state(context, 'preflight');
  const launches = [];
  const compiler = await createSealedLocalTypedCompositionCompiler(options(fixture, {
    processCheckpoint: async (name) => {
      if (name.startsWith('before-local-godskills-')) launches.push(name);
    },
  }));
  const changed = structuredClone(fixture.topology);
  changed.links[0].consumer.nodeId = 'missing-node';
  await assert.rejects(() => compiler.compileMission({
    bindingInput: fixture.bindingInput,
    topology: changed,
  }), /topology|consumer|node/i);
  assert.deepEqual(launches, []);
});

test('rejects changed executable pins and partial construction before child launch', async (context) => {
  const fixture = await state(context, 'pin-drift');
  const launches = [];
  const changedRoutingPin = pinnedGodskillsRoutingExecutable({
    executableReceipt: {
      path: 'receipts/routing-executable-v1.json',
      sha256: '0'.repeat(64),
      receiptDigest: '0'.repeat(64),
    },
  });
  await assert.rejects(
    () => createSealedLocalTypedCompositionCompiler(options(fixture, {
      routingPin: changedRoutingPin,
      processCheckpoint: async (name) => launches.push(name),
    })),
    /routing|pin|receipt|digest|executable/i,
  );
  const partial = options(fixture);
  delete partial.activationClassifier;
  await assert.rejects(
    () => createSealedLocalTypedCompositionCompiler(partial),
    /classifier|required/i,
  );
  const changedComposition = pinnedGodskillsTypedCompositionRelease(godskillsRoot);
  changedComposition.expected.registryDigest = '0'.repeat(64);
  await assert.rejects(
    () => createSealedLocalTypedCompositionCompiler(options(fixture, {
      compositionReleasePin: changedComposition,
      processCheckpoint: async (name) => launches.push(name),
    })),
    /composition|registry|pin|release|certified/i,
  );
  await assert.rejects(
    () => createSealedLocalTypedCompositionCompiler({
      ...options(fixture),
      routingTransport: {},
    }),
    /options|invalid/i,
  );
  assert.deepEqual(launches, []);
});

test('keeps private compilation ownership inside one sealed factory', async (context) => {
  const firstFixture = await state(context, 'owner-a');
  const secondFixture = await state(context, 'owner-b');
  const first = await createSealedLocalTypedCompositionCompiler(options(firstFixture));
  const second = await createSealedLocalTypedCompositionCompiler(options(secondFixture));
  const compilation = await first.compileMission({
    bindingInput: firstFixture.bindingInput,
    topology: firstFixture.topology,
  });
  await assert.rejects(() => second.execute({
    compilation,
    missionInputs: missionInputs(),
    executors: executors(),
  }), (error) => error?.code === 'compilation-owner-mismatch');
});

test('brands the shared local process pair without exposing executable verification internals', async (context) => {
  const fixture = await state(context, 'bundle');
  const bundle = await createVerifiedLocalGodskillsProcessTransports({
    terminalRoot: join(fixture.runtimeRoot, 'terminal'),
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
  });
  assert.equal(assertVerifiedLocalGodskillsProcessTransports(bundle), bundle);
  assert.throws(
    () => assertVerifiedLocalGodskillsProcessTransports({ ...bundle }),
    /bundle|provenance|verified/i,
  );
  assert.equal(Object.hasOwn(bundle, 'verification'), false);
  assert.equal(Object.isFrozen(bundle), true);
  assert.equal(typeof bundle.routingTransport.execute, 'function');
  assert.equal(typeof bundle.activationTransport.execute, 'function');
});
