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
