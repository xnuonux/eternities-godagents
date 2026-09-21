import { sha256Value } from '../src/core/digest.mjs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createRecoverableGodskillsOutbox } from '../src/skills/recoverable-godskills-outbox.mjs';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { acquireFileLock } from '../src/state/file-lock.mjs';
import {
  GODSKILLS_OUTBOX_AUTHORITY,
  buildRecoverableGodskillsDispatch,
  verifyRecoverableGodskillsCompletion,
} from '../src/skills/recoverable-godskills-contracts.mjs';
import {
  assertVerifiedGodskillsRoutingExecutable,
  verifyGodskillsRoutingExecutable,
} from '../src/skills/routing-executable-verifier.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

async function transportModule() {
  try {
    return await import('../src/skills/local-recoverable-godskills-process-transport.mjs');
  } catch (error) {
    assert.fail(`local recoverable Godskills process transport is unavailable: ${error.message}`);
  }
}

async function verified() {
  return verifyGodskillsRoutingExecutable({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    routingPin: pinnedGodskillsRoutingExecutable(),
  });
}

function routeRequest(requestId = 'sealed-local-route') {
  return {
    schemaVersion: 1,
    requestId,
    text: 'coordinate implementation tests review verification and integration for the settled release',
    context: {
      permittedEffects: ['local-read', 'local-write'],
      availableAuthority: ['local-read', 'local-write', 'repository-write'],
      availablePreconditions: ['repository-present', 'settled-outcome'],
      forbiddenCapabilities: [],
      maximumRisk: 'moderate',
      minimumEvidenceConfidence: 'verified',
      contextBudget: 4000,
      maxCompositionSize: 3,
    },
  };
}

function fixedClock() {
  let tick = 0;
  return () => new Date(Date.parse('2026-08-31T21:00:00.000Z') + tick++ * 100).toISOString();
}

async function workspace(t, name) {
  const root = await mkdtemp(join(tmpdir(), `godagents-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('route transport fixes a scrubbed bounded process and durable content-addressed result', async (t) => {
  const root = await workspace(t, 'sealed-route');
  const verification = await verified();
  const { createLocalRecoverableGodskillsProcessTransport } = await transportModule();
  const checkpoints = [];
  const transport = await createLocalRecoverableGodskillsProcessTransport({
    verification,
    stage: 'route',
    terminalRoot: root,
    clock: fixedClock(),
    checkpoint: async (name, context) => {
      checkpoints.push(name);
      if (name === 'before-local-godskills-route-process') {
        for (const file of ['dispatch.json', 'request.json', 'execution.json']) {
          await access(join(context.operationRoot, file));
        }
        await assert.rejects(access(join(context.operationRoot, 'result.json')), /ENOENT/i);
      }
    },
  });
  const descriptor = transport.descriptor();
  assert.equal(descriptor.stage, 'route');
  assert.match(descriptor.transportId, /sealed-local-route.*default/i);
  assert.deepEqual(descriptor.authority, GODSKILLS_OUTBOX_AUTHORITY);
  const request = routeRequest();
  const dispatch = buildRecoverableGodskillsDispatch({ request, transportDescriptor: descriptor });
  assert.deepEqual(await transport.reconcile(dispatch), { status: 'absent' });

  const execution = await transport.execute(dispatch);
  assert.equal(execution.status, 'completed');
  const completion = verifyRecoverableGodskillsCompletion(execution.completion, {
    dispatch,
    transportDescriptor: descriptor,
  });
  assert.equal(completion.result.compilerReceipt.requestId, request.requestId);
  assert.ok(['selected', 'needs-decision', 'no-qualified-route'].includes(completion.result.routeReceipt.status));
  assert.deepEqual(await transport.reconcile(dispatch), execution);
  assert.deepEqual(checkpoints, [
    'before-local-godskills-route-process',
    'after-local-godskills-route-process',
  ]);

  const operationRoot = join(root, 'route', dispatch.dispatchDigest);
  await access(join(operationRoot, 'success.json'));
  assert.equal(await readFile(join(operationRoot, 'request.json'), 'utf8'), `${canonicalJson(request)}\n`);
  const storedCompletion = JSON.parse(await readFile(join(operationRoot, 'completion.json'), 'utf8'));
  assert.deepEqual(storedCompletion, completion);
  assert.equal(await readFile(join(operationRoot, 'completion.json'), 'utf8'), `${canonicalJson(completion)}\n`);
  await rm(join(operationRoot, 'request.json'));
  await assert.rejects(transport.reconcile(dispatch), /request.*missing|operation.*record/i);
});

test('atomic child result recovers after process death without another launch', async (t) => {
  const root = await workspace(t, 'sealed-recovery');
  const verification = await verified();
  const { createLocalRecoverableGodskillsProcessTransport } = await transportModule();
  let launches = 0;
  const first = await createLocalRecoverableGodskillsProcessTransport({
    verification,
    stage: 'route',
    terminalRoot: root,
    clock: fixedClock(),
    checkpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') launches += 1;
      if (name === 'after-local-godskills-route-process') throw new Error('simulated process death after child result');
    },
  });
  const request = routeRequest('sealed-local-route-recovery');
  const descriptor = first.descriptor();
  const dispatch = buildRecoverableGodskillsDispatch({ request, transportDescriptor: descriptor });
  await assert.rejects(first.execute(dispatch), /simulated process death/i);
  assert.equal(launches, 1);
  await access(join(root, 'route', dispatch.dispatchDigest, 'result.json'));
  await assert.rejects(access(join(root, 'route', dispatch.dispatchDigest, 'completion.json')), /ENOENT/i);

  const recovered = await createLocalRecoverableGodskillsProcessTransport({
    verification,
    stage: 'route',
    terminalRoot: root,
    clock: fixedClock(),
    checkpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') {
        launches += 1;
        throw new Error('recovery must not launch another child');
      }
    },
  });
  const reconciled = await recovered.reconcile(dispatch);
  assert.equal(reconciled.status, 'completed');
  assert.equal(reconciled.completion.result.compilerReceipt.requestId, request.requestId);
  assert.equal(launches, 1);
  assert.deepEqual(await recovered.execute(dispatch), reconciled);
  assert.equal(launches, 1);
  await rm(join(root, 'route', dispatch.dispatchDigest, 'success.json'));
  await assert.rejects(recovered.reconcile(dispatch), /success.*missing|terminal.*record/i);
});

test('live contention is pending while timeout, byte, dispatch, and provenance drift fail closed', async (t) => {
  const root = await workspace(t, 'sealed-negative');
  const verification = await verified();
  const { createLocalRecoverableGodskillsProcessTransport } = await transportModule();
  assertVerifiedGodskillsRoutingExecutable(verification);
  await assert.rejects(
    createLocalRecoverableGodskillsProcessTransport({
      verification: { release: verification.release, routing: verification.routing },
      stage: 'route',
      terminalRoot: join(root, 'forged'),
    }),
    /verified|provenance|brand/i,
  );

  const contended = await createLocalRecoverableGodskillsProcessTransport({
    verification,
    stage: 'route',
    terminalRoot: join(root, 'contended'),
    clock: fixedClock(),
  });
  const contendedDescriptor = contended.descriptor();
  const contendedDispatch = buildRecoverableGodskillsDispatch({
    request: routeRequest('sealed-local-route-contended'),
    transportDescriptor: contendedDescriptor,
  });
  const operationRoot = join(root, 'contended', 'route', contendedDispatch.dispatchDigest);
  const held = await acquireFileLock({
    lockPath: join(operationRoot, 'execution.lock'),
    staleAfterMs: 60_000,
    nonce: () => 'held-by-test',
  });
  try {
    assert.deepEqual(await contended.reconcile(contendedDispatch), { status: 'pending' });
    assert.deepEqual(await contended.execute(contendedDispatch), { status: 'pending' });
  } finally {
    await held.release();
  }

  const timed = await createLocalRecoverableGodskillsProcessTransport({
    verification,
    stage: 'route',
    terminalRoot: join(root, 'timeout'),
    timeoutMs: 1,
    clock: fixedClock(),
  });
  const timedDispatch = buildRecoverableGodskillsDispatch({
    request: routeRequest('sealed-local-route-timeout'),
    transportDescriptor: timed.descriptor(),
  });
  await assert.rejects(timed.execute(timedDispatch), /timed out|timeout/i);

  const tiny = await createLocalRecoverableGodskillsProcessTransport({
    verification,
    stage: 'route',
    terminalRoot: join(root, 'oversized'),
    maximumResultBytes: 256,
    clock: fixedClock(),
  });
  const tinyDescriptor = tiny.descriptor();
  const tinyDispatch = buildRecoverableGodskillsDispatch({
    request: routeRequest('sealed-local-route-oversized'),
    transportDescriptor: tinyDescriptor,
  });
  await assert.rejects(tiny.execute(tinyDispatch), /byte|ceiling|large/i);
  await assert.rejects(tiny.reconcile(tinyDispatch), /byte|ceiling|large/i);

  const changed = structuredClone(contendedDispatch);
  changed.request.text = 'changed after dispatch';
  await assert.rejects(contended.reconcile(changed), /dispatch|digest|binding/i);
});

test('process source contains no ambient environment or shell escape', async () => {
  const source = await readFile(
    new URL('../src/skills/local-recoverable-godskills-process-transport.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /shell:\s*false/);
  assert.match(source, /windowsHide:\s*true/);
  assert.match(source, /env:\s*minimalChildEnvironment\(\)/);
  assert.match(source, /allowed\s*=\s*new Set\(\['SYSTEMROOT', 'WINDIR'\]\)/);
  assert.doesNotMatch(source, /env:\s*process\.env/);
});

// Fault injection is confined to this test-file process; the sealed transport
// still accepts only its verified executable, with no production spawn hook.
for (const killBehavior of ['silent', 'false', 'throw', 'error']) {
  test(`unconfirmed termination (${killBehavior}) settles pending and fences restart and late output`, async (t) => {
    const root = await workspace(t, `unconfirmed-${killBehavior}`);
    const verification = await verified();
    const { createLocalRecoverableGodskillsProcessTransport } = await transportModule();
    const originalSpawn = childProcess.spawn;
    const child = new EventEmitter();
    child.pid = 12345;
    let launches = 0;
    let unrefs = 0;
    child.unref = () => { unrefs += 1; };
    child.kill = () => {
      if (killBehavior === 'throw') throw new Error('injected kill failure');
      if (killBehavior === 'error') child.emit('error', new Error('injected kill error'));
      return killBehavior !== 'false';
    };
    childProcess.spawn = () => { launches += 1; return child; };
    syncBuiltinESMExports();
    t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
    const options = { verification, stage: 'route', terminalRoot: root, timeoutMs: 5 };
    const transport = await createLocalRecoverableGodskillsProcessTransport(options);
    const request = routeRequest(`uncertain-${killBehavior}`);
    const dispatch = buildRecoverableGodskillsDispatch({ request, transportDescriptor: transport.descriptor() });
    let watchdog;
    try {
      const result = await Promise.race([
        transport.execute(dispatch),
        new Promise((_, reject) => { watchdog = setTimeout(() => {
          child.emit('close', 1);
          reject(new Error('termination observation exceeded its bounded wait'));
        }, 3000); }),
      ]);
      assert.deepEqual(result, { status: 'pending' });
    } finally { clearTimeout(watchdog); }
    assert.equal(unrefs, 1);
    const operationRoot = join(root, 'route', dispatch.dispatchDigest);
    const observation = JSON.parse(await readFile(join(operationRoot, 'termination-unconfirmed.json'), 'utf8'));
    assert.equal(observation.status, 'termination-unconfirmed');
    assert.equal(observation.dispatchDigest, dispatch.dispatchDigest);
    await assert.rejects(access(join(operationRoot, 'success.json')), /ENOENT/);
    await assert.rejects(access(join(operationRoot, 'completion.json')), /ENOENT/);
    // Output or a late event is not proof of a successful host-observed exit.
    await writeFile(join(operationRoot, 'result.json'), '{\n  "late": true\n}\n');
    child.emit('close', 0);
    child.emit('error', new Error('late process error'));
    const restarted = await createLocalRecoverableGodskillsProcessTransport(options);
    assert.deepEqual(await restarted.reconcile(dispatch), { status: 'pending' });
    assert.deepEqual(await restarted.execute(dispatch), { status: 'pending' });
    const outbox = await createRecoverableGodskillsOutbox({ root: join(root, 'outbox'), stage: 'route', transport: restarted });
    await assert.rejects(outbox.invoke(request), { code: 'operation-pending' });
    assert.equal(launches, 1);
  });
}

test('guard survives failed observation publication and blocks replay without an observation', async (t) => {
  const root = await workspace(t, 'unconfirmed-publication');
  const verification = await verified();
  const { createLocalRecoverableGodskillsProcessTransport } = await transportModule();
  const originalSpawn = childProcess.spawn;
  const child = new EventEmitter();
  child.pid = 12345;
  child.kill = () => true;
  child.unref = () => {};
  let launches = 0;
  childProcess.spawn = () => { launches += 1; return child; };
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  const options = { verification, stage: 'route', terminalRoot: root, timeoutMs: 5 };
  const transport = await createLocalRecoverableGodskillsProcessTransport({ ...options, clock: () => {
    if (launches) throw new Error('injected observation clock failure');
    return new Date().toISOString();
  } });
  const dispatch = buildRecoverableGodskillsDispatch({ request: routeRequest('observation-failure'), transportDescriptor: transport.descriptor() });
  await assert.rejects(transport.execute(dispatch), /injected observation clock failure/);
  const operationRoot = join(root, 'route', dispatch.dispatchDigest);
  await access(join(operationRoot, 'process-guard.json'));
  await assert.rejects(access(join(operationRoot, 'termination-unconfirmed.json')), /ENOENT/);
  const recovered = await createLocalRecoverableGodskillsProcessTransport(options);
  assert.deepEqual(await recovered.reconcile(dispatch), { status: 'pending' });
  assert.deepEqual(await recovered.execute(dispatch), { status: 'pending' });
  assert.equal(launches, 1);
  const guard = JSON.parse(await readFile(join(operationRoot, 'process-guard.json'), 'utf8'));
  // A success-shaped record cannot clear an outstanding launch guard.
  const unsigned = {
    schemaVersion: 1, protocolId: 'eternities-local-godskills-process-success-v1',
    status: 'succeeded', stage: 'route', dispatchDigest: dispatch.dispatchDigest,
    configurationDigest: guard.configurationDigest, executionDigest: guard.executionDigest,
    resultDigest: sha256Value(null), resultBytes: 5, completedAt: new Date().toISOString(),
  };
  await writeFile(join(operationRoot, 'success.json'), `${canonicalJson({ ...unsigned, successDigest: sha256Value(unsigned) })}\n`);
  assert.deepEqual(await recovered.reconcile(dispatch), { status: 'pending' });
  assert.deepEqual(await recovered.execute(dispatch), { status: 'pending' });
  assert.equal(launches, 1);
  guard.executionDigest = '0'.repeat(64);
  await writeFile(join(operationRoot, 'process-guard.json'), `${canonicalJson(guard)}\n`);
  await assert.rejects(recovered.execute(dispatch), /binding is invalid/);
  assert.equal(launches, 1);
});

for (const outcome of ['nonzero', 'timeout-close', 'spawn-error', 'spawn-throw']) {
  test(`confirmed ${outcome} retains failure and permits explicit retry`, async (t) => {
    const root = await workspace(t, `confirmed-${outcome}`);
    const verification = await verified();
    const { createLocalRecoverableGodskillsProcessTransport } = await transportModule();
    const originalSpawn = childProcess.spawn;
    let launches = 0;
    childProcess.spawn = () => {
      launches += 1;
      if (outcome === 'spawn-throw') throw new Error('injected synchronous spawn failure');
      const child = new EventEmitter();
      child.pid = outcome === 'spawn-error' ? undefined : 12345;
      child.unref = () => assert.fail('confirmed failure must not be detached');
      child.kill = () => { setTimeout(() => child.emit('close', null), 10); return true; };
      if (outcome === 'nonzero') setImmediate(() => child.emit('close', 2));
      if (outcome === 'spawn-error') setImmediate(() => {
        child.emit('error', new Error('injected launch failure'));
        child.emit('close', -2);
      });
      return child;
    };
    syncBuiltinESMExports();
    t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
    const transport = await createLocalRecoverableGodskillsProcessTransport({ verification, stage: 'route', terminalRoot: root, timeoutMs: 50 });
    const dispatch = buildRecoverableGodskillsDispatch({ request: routeRequest(outcome), transportDescriptor: transport.descriptor() });
    const expected = outcome === 'timeout-close' ? /timed out/ : /failed|could not start|code 2/;
    await assert.rejects(transport.execute(dispatch), expected);
    assert.deepEqual(await transport.reconcile(dispatch), { status: 'absent' });
    await assert.rejects(transport.execute(dispatch), expected);
    assert.equal(launches, 2);
    await assert.rejects(access(join(root, 'route', dispatch.dispatchDigest, 'process-guard.json')), /ENOENT/);
  });
}
