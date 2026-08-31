import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  assertRecoverableTypedCompositionCompilation,
  createRecoverableTypedCompositionCompiler,
  recoverableTypedCompositionSlot,
} from '../src/skills/recoverable-typed-composition-compiler.mjs';
import { verifyRecoverableTypedCompositionPending } from '../src/skills/recoverable-typed-composition-contracts.mjs';
import {
  bindingInput,
  compilerOptions,
  executeCount,
  executors,
  fixtureTransports,
  missionInputs,
  topology,
} from './helpers/recoverable-typed-composition-fixture.mjs';

async function state(context, suffix) {
  const root = await mkdtemp(join(tmpdir(), `godagents-typed-compiler-${suffix}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  const missionId = `typed-compiler-${suffix}`;
  return { root, missionId, input: bindingInput(missionId), topology: await topology(missionId) };
}

function compilationPaths(root, missionId) {
  const slot = recoverableTypedCompositionSlot(missionId);
  return {
    intent: join(root, 'compilations', slot, 'intent.json'),
    record: join(root, 'compilations', slot, 'result.json'),
  };
}

test('persists the exact topology before routing and returns one body-free branded compilation', async (context) => {
  const fixture = await state(context, 'ordered');
  const events = [];
  const compositionReads = [];
  const transports = fixtureTransports({ onCall: (event) => events.push(event) });
  const compiler = await createRecoverableTypedCompositionCompiler(compilerOptions(
    fixture.root,
    transports,
    {
      checkpoint: async (name) => events.push(`checkpoint:${name}`),
      compositionIo: {
        async readFile(path, ...args) {
          compositionReads.push(String(path));
          return readFile(path, ...args);
        },
      },
    },
  ));
  const compilation = await compiler.compileMission({
    bindingInput: fixture.input,
    topology: fixture.topology,
  });

  assert.equal(compilation.status, 'compiled');
  assert.equal(compilation.missionId, fixture.missionId);
  assert.match(compilation.planDigest, /^[a-f0-9]{64}$/);
  assert.match(compilation.methodDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(compilation, 'method'), false);
  assert.equal(compilation.authorityExpanded, false);
  assert.equal(assertRecoverableTypedCompositionCompilation(compilation), compilation);
  assert.throws(
    () => assertRecoverableTypedCompositionCompilation({ ...compilation }),
    /compilation|brand|provenance/i,
  );
  assert.ok(events.indexOf('checkpoint:after-recoverable-typed-composition-intent')
    < events.indexOf('route:execute'));
  assert.equal(executeCount(transports.route), 1);
  assert.equal(executeCount(transports.activation), 1);

  const paths = compilationPaths(fixture.root, fixture.missionId);
  const [intentText, recordText] = await Promise.all([
    readFile(paths.intent, 'utf8'),
    readFile(paths.record, 'utf8'),
  ]);
  assert.equal(intentText, `${canonicalJson(JSON.parse(intentText))}\n`);
  assert.equal(recordText, `${canonicalJson(JSON.parse(recordText))}\n`);
  assert.doesNotMatch(intentText, /"method"\s*:/);
  assert.doesNotMatch(recordText, /"method"\s*:/);
  assert.equal(JSON.parse(intentText).topologyDigest, sha256Value(fixture.topology));
  assert.equal(JSON.parse(recordText).methodDigest, compilation.methodDigest);
  assert.equal(compiler.descriptor.defaultLaunchEnabled, false);
  assert.equal(compiler.descriptor.authorityExpanded, false);
  assert.equal(compositionReads.some((path) => /[\\/]skills[\\/]|SKILL\.md$/i.test(path)), false);
});

test('reconstructs after durable Godskills binding without caller replay or external redispatch', async (context) => {
  const fixture = await state(context, 'recovery');
  const transports = fixtureTransports();
  let crash = true;
  const first = await createRecoverableTypedCompositionCompiler(compilerOptions(
    fixture.root,
    transports,
    {
      checkpoint: async (name) => {
        if (crash && name === 'after-recoverable-typed-composition-godskills-bound') {
          crash = false;
          throw new Error('simulated compiler process death');
        }
      },
    },
  ));
  await assert.rejects(() => first.compileMission({
    bindingInput: fixture.input,
    topology: fixture.topology,
  }), /simulated compiler process death/);
  assert.equal(executeCount(transports.route), 1);
  assert.equal(executeCount(transports.activation), 1);

  const resumedCompiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(fixture.root, transports),
  );
  const resumed = await resumedCompiler.resumeMission({ missionId: fixture.missionId });
  assert.equal(resumed.status, 'compiled');
  assert.equal(executeCount(transports.route), 1);
  assert.equal(executeCount(transports.activation), 1);
  const replay = await resumedCompiler.resumeMission({ missionId: fixture.missionId });
  assert.equal(replay.planDigest, resumed.planDigest);
  assert.equal(replay.methodDigest, resumed.methodDigest);
  assert.equal(replay.compilationDigest, resumed.compilationDigest);
  assert.equal(executeCount(transports.route), 1);
  assert.equal(executeCount(transports.activation), 1);
});

test('keeps pending explicit and rejects no-route or selected-set mismatch without a method', async (context) => {
  const pendingFixture = await state(context, 'pending');
  const pendingTransports = fixtureTransports({ routeReconciliation: 'pending' });
  const pendingCompiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(pendingFixture.root, pendingTransports),
  );
  const pending = await pendingCompiler.compileMission({
    bindingInput: pendingFixture.input,
    topology: pendingFixture.topology,
  });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.phase, 'route');
  await assert.rejects(readFile(compilationPaths(
    pendingFixture.root, pendingFixture.missionId,
  ).record), (error) => error?.code === 'ENOENT');

  const noRouteFixture = await state(context, 'no-route');
  const noRouteTransports = fixtureTransports({ selectedIds: [] });
  const noRouteCompiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(noRouteFixture.root, noRouteTransports),
  );
  await assert.rejects(() => noRouteCompiler.compileMission({
    bindingInput: noRouteFixture.input,
    topology: noRouteFixture.topology,
  }), (error) => error?.code === 'composition-unavailable');
  assert.equal(executeCount(noRouteTransports.activation), 0);

  const mismatchFixture = await state(context, 'mismatch');
  const mismatchTransports = fixtureTransports({ selectedIds: ['eternities-muse'] });
  const mismatchCompiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(mismatchFixture.root, mismatchTransports),
  );
  await assert.rejects(() => mismatchCompiler.compileMission({
    bindingInput: mismatchFixture.input,
    topology: mismatchFixture.topology,
  }), (error) => error?.code === 'activation-mismatch');
});

test('changed topology, binding input, activation fields, and recomputed records fail closed', async (context) => {
  const fixture = await state(context, 'drift');
  const transports = fixtureTransports();
  const compiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(fixture.root, transports),
  );
  const compiled = await compiler.compileMission({
    bindingInput: fixture.input,
    topology: fixture.topology,
  });
  const changedTopology = structuredClone(fixture.topology);
  changedTopology.maximumContextBytes -= 1;
  await assert.rejects(() => compiler.compileMission({
    bindingInput: fixture.input,
    topology: changedTopology,
  }), (error) => error?.code === 'intent-collision');
  const changedInput = structuredClone(fixture.input);
  changedInput.observation.counter = 1;
  await assert.rejects(() => compiler.compileMission({
    bindingInput: changedInput,
    topology: fixture.topology,
  }), (error) => error?.code === 'intent-collision');
  const callerActivation = { ...fixture.topology, activationResultDigest: '0'.repeat(64) };
  const fresh = await state(context, 'caller-activation');
  const freshTransports = fixtureTransports();
  const freshCompiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(fresh.root, freshTransports),
  );
  await assert.rejects(() => freshCompiler.compileMission({
    bindingInput: fresh.input,
    topology: { ...callerActivation, missionId: fresh.missionId },
  }), /topology|fields|activation/i);
  assert.equal(executeCount(freshTransports.route), 0);

  const recordPath = compilationPaths(fixture.root, fixture.missionId).record;
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  record.planDigest = '0'.repeat(64);
  const { compilationDigest: _old, ...unsigned } = record;
  record.compilationDigest = sha256Value(unsigned);
  await writeFile(recordPath, `${canonicalJson(record)}\n`, 'utf8');
  await assert.rejects(
    () => compiler.resumeMission({ missionId: fixture.missionId }),
    /record|plan|compilation|changed|mismatch/i,
  );
  assert.equal(compiled.methodDigest === record.methodDigest, true);
});

test('executes only a branded reconstructed method and preserves typed executor rejection', async (context) => {
  const fixture = await state(context, 'execution');
  const transports = fixtureTransports();
  const compiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(fixture.root, transports),
  );
  const compilation = await compiler.compileMission({
    bindingInput: fixture.input,
    topology: fixture.topology,
  });
  await assert.rejects(() => compiler.execute({
    compilation: { ...compilation },
    missionInputs: missionInputs(),
    executors: executors(),
  }), /compilation|brand|provenance/i);

  const observed = [];
  const result = await compiler.execute({
    compilation,
    missionInputs: missionInputs(),
    executors: executors(observed),
  });
  assert.equal(result.receipt.methodDigest, compilation.methodDigest);
  assert.equal(result.receipt.authorityExpanded, false);
  assert.equal(result.outputs.implementation.status, 'verified');
  assert.deepEqual(observed[1].slots['acceptance-risk-boundary'], {
    invariants: ['activation-bound', 'recoverable-compilation'],
    rejectionCriteria: ['caller-activation', 'serialized-method'],
  });

  await assert.rejects(() => compiler.execute({
    compilation,
    missionInputs: missionInputs(),
    executors: { 'eternities-muse': executors()['eternities-muse'] },
  }), (error) => error?.code === 'executor-missing');
  const malformed = executors();
  malformed['eternities-forge'] = async (input) => ({
    schemaVersion: 1,
    capabilityId: 'eternities-forge',
    missionId: input.missionId,
    slots: {},
  });
  await assert.rejects(() => compiler.execute({
    compilation,
    missionInputs: missionInputs(),
    executors: malformed,
  }), (error) => error?.code === 'output-invalid');
});

test('rejects structurally impossible topology before any route or activation dispatch', async (context) => {
  const cases = [
    ['unknown-consumer', (value) => { value.links[0].consumer.nodeId = 'missing-node'; }],
    ['unknown-input', (value) => { value.links[0].producer.inputId = 'missing-input'; }],
    ['unknown-producer-node', (value) => {
      value.links[3].producer.nodeId = 'missing-node';
    }],
    ['duplicate-consumer', (value) => {
      value.links.push({
        artifactId: 'duplicate-consumer-artifact',
        producer: { kind: 'mission-input', inputId: 'design-constraints' },
        consumer: structuredClone(value.links[0].consumer),
      });
    }],
    ['duplicate-artifact-owner', (value) => { value.links[4].artifactId = value.links[0].artifactId; }],
    ['duplicate-phase-owner', (value) => { value.nodes[1].phase = value.nodes[0].phase; }],
    ['cycle', (value) => {
      value.links[0].producer = {
        kind: 'node-output', nodeId: 'implementation', slotId: 'implementation',
      };
    }],
    ['unknown-output-node', (value) => { value.missionOutputs[0].nodeId = 'missing-node'; }],
    ['consumed-output', (value) => {
      value.missionOutputs[0] = {
        outputId: 'consumed-output', nodeId: 'design', slotId: 'acceptance-boundary',
      };
    }],
  ];
  for (const [suffix, mutate] of cases) {
    const fixture = await state(context, `preflight-${suffix}`);
    const transports = fixtureTransports();
    const compiler = await createRecoverableTypedCompositionCompiler(
      compilerOptions(fixture.root, transports),
    );
    const changed = structuredClone(fixture.topology);
    mutate(changed);
    await assert.rejects(() => compiler.compileMission({
      bindingInput: fixture.input,
      topology: changed,
    }), /topology|node|input|consumer|artifact|phase|cycle|output/i);
    assert.equal(executeCount(transports.route), 0, suffix);
    assert.equal(executeCount(transports.activation), 0, suffix);
  }
});

test('rejects unsafe or oversized durable compiler state before parsing it', async (context) => {
  const oversized = await state(context, 'oversized-state');
  const oversizedTransports = fixtureTransports();
  const oversizedCompiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(oversized.root, oversizedTransports),
  );
  const oversizedPath = compilationPaths(oversized.root, oversized.missionId).intent;
  await mkdir(join(oversized.root, 'compilations', recoverableTypedCompositionSlot(oversized.missionId)), {
    recursive: true,
  });
  await writeFile(oversizedPath, Buffer.alloc(1_048_577, 0x20));
  await assert.rejects(
    () => oversizedCompiler.resumeMission({ missionId: oversized.missionId }),
    (error) => error?.code === 'record-invalid',
  );
  assert.equal(executeCount(oversizedTransports.route), 0);

  const escaped = await state(context, 'escaped-slot');
  const escapedTransports = fixtureTransports();
  const escapedCompiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(escaped.root, escapedTransports),
  );
  const outsideSlot = join(escaped.root, 'outside-compilation-slot');
  await mkdir(outsideSlot);
  const escapedSlot = join(
    escaped.root, 'compilations', recoverableTypedCompositionSlot(escaped.missionId),
  );
  await symlink(outsideSlot, escapedSlot, 'junction');
  await assert.rejects(
    () => escapedCompiler.resumeMission({ missionId: escaped.missionId }),
    (error) => error?.code === 'state-path-invalid',
  );
  assert.equal(executeCount(escapedTransports.route), 0);

  const linked = await state(context, 'linked-state');
  const linkedTransports = fixtureTransports();
  const linkedCompiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(linked.root, linkedTransports),
  );
  const linkedPath = compilationPaths(linked.root, linked.missionId).intent;
  const linkedRoot = join(linked.root, 'compilations', recoverableTypedCompositionSlot(linked.missionId));
  await mkdir(linkedRoot, { recursive: true });
  const outside = join(linked.root, 'outside-intent.json');
  await writeFile(outside, '{}\n', 'utf8');
  try {
    await symlink(outside, linkedPath, 'file');
  } catch (error) {
    if (error?.code === 'EPERM') {
      context.diagnostic('file symlink probe skipped because this Windows account lacks symlink privilege');
      return;
    }
    throw error;
  }
  await assert.rejects(
    () => linkedCompiler.resumeMission({ missionId: linked.missionId }),
    (error) => error?.code === 'record-invalid',
  );
  assert.equal(executeCount(linkedTransports.route), 0);
});

test('keeps compilation handles compiler-local even when both compilers trust the same release', async (context) => {
  const firstFixture = await state(context, 'owner-a');
  const secondFixture = await state(context, 'owner-b');
  const firstTransports = fixtureTransports();
  const secondTransports = fixtureTransports();
  const first = await createRecoverableTypedCompositionCompiler(
    compilerOptions(firstFixture.root, firstTransports),
  );
  const second = await createRecoverableTypedCompositionCompiler(
    compilerOptions(secondFixture.root, secondTransports),
  );
  const compilation = await first.compileMission({
    bindingInput: firstFixture.input,
    topology: firstFixture.topology,
  });
  await assert.rejects(() => second.execute({
    compilation,
    missionInputs: missionInputs(),
    executors: executors(),
  }), (error) => error?.code === 'compilation-owner-mismatch');
});

test('recovers exactly after record publication and serializes concurrent compiles', async (context) => {
  const crashFixture = await state(context, 'record-crash');
  const crashTransports = fixtureTransports();
  let crash = true;
  const crashing = await createRecoverableTypedCompositionCompiler(compilerOptions(
    crashFixture.root,
    crashTransports,
    {
      checkpoint: async (name) => {
        if (crash && name === 'after-recoverable-typed-composition-record') {
          crash = false;
          throw new Error('simulated death after record publication');
        }
      },
    },
  ));
  await assert.rejects(() => crashing.compileMission({
    bindingInput: crashFixture.input,
    topology: crashFixture.topology,
  }), /simulated death after record publication/);
  const persisted = JSON.parse(await readFile(
    compilationPaths(crashFixture.root, crashFixture.missionId).record, 'utf8',
  ));
  const resumed = await createRecoverableTypedCompositionCompiler(
    compilerOptions(crashFixture.root, crashTransports),
  );
  const recovered = await resumed.resumeMission({ missionId: crashFixture.missionId });
  assert.equal(recovered.compilationDigest, persisted.compilationDigest);
  assert.equal(executeCount(crashTransports.route), 1);
  assert.equal(executeCount(crashTransports.activation), 1);

  const concurrentFixture = await state(context, 'concurrent');
  const concurrentTransports = fixtureTransports();
  const compiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(concurrentFixture.root, concurrentTransports),
  );
  const request = {
    bindingInput: concurrentFixture.input,
    topology: concurrentFixture.topology,
  };
  const [left, right] = await Promise.all([
    compiler.compileMission(request),
    compiler.compileMission(structuredClone(request)),
  ]);
  assert.equal(left.compilationDigest, right.compilationDigest);
  assert.equal(left.planDigest, right.planDigest);
  assert.equal(left.methodDigest, right.methodDigest);
  assert.equal(executeCount(concurrentTransports.route), 1);
  assert.equal(executeCount(concurrentTransports.activation), 1);
});

test('rejects drifted release roots and recomputed malformed pending projections', async (context) => {
  const fixture = await state(context, 'root-drift');
  const transports = fixtureTransports();
  const options = compilerOptions(fixture.root, transports);
  options.compositionReleasePin.expected.registryDigest = '0'.repeat(64);
  await assert.rejects(
    () => createRecoverableTypedCompositionCompiler(options),
    /pin|release|registry|certified/i,
  );
  assert.equal(executeCount(transports.route), 0);
  assert.equal(executeCount(transports.activation), 0);

  const pendingFixture = await state(context, 'pending-verifier');
  const pendingTransports = fixtureTransports({ routeReconciliation: 'pending' });
  const compiler = await createRecoverableTypedCompositionCompiler(
    compilerOptions(pendingFixture.root, pendingTransports),
  );
  const pending = await compiler.compileMission({
    bindingInput: pendingFixture.input,
    topology: pendingFixture.topology,
  });
  const changed = { ...pending, phase: 'native' };
  const { pendingDigest: _old, ...unsigned } = changed;
  changed.pendingDigest = sha256Value(unsigned);
  assert.throws(
    () => verifyRecoverableTypedCompositionPending(changed),
    /pending|phase|enum/i,
  );
});
