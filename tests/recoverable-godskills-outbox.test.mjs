import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  GODSKILLS_OUTBOX_AUTHORITY,
  buildRecoverableGodskillsCompletion,
  buildRecoverableGodskillsDispatch,
  buildRecoverableGodskillsTransportDescriptor,
  verifyRecoverableGodskillsCompletion,
  verifyRecoverableGodskillsDispatch,
  verifyRecoverableGodskillsTransportDescriptor,
} from '../src/skills/recoverable-godskills-contracts.mjs';
import { createRecoverableGodskillsOutbox } from '../src/skills/recoverable-godskills-outbox.mjs';

function routeRequest(overrides = {}) {
  return {
    requestId: 'route-request-stable',
    request: 'select a bounded verification capability',
    context: {
      permittedEffects: ['local-read'],
      maximumRisk: 'moderate',
    },
    ...structuredClone(overrides),
  };
}

function routeResult(request) {
  return {
    compilerReceipt: { requestId: request.requestId, envelope: structuredClone(request.context) },
    routeReceipt: {
      requestId: request.requestId,
      status: 'selected',
      selectedIds: ['eternities-aegis'],
    },
  };
}

function transport({ stage = 'route', reconciliation = 'absent', transportId = `fixture-${stage}-v1` } = {}) {
  const descriptor = buildRecoverableGodskillsTransportDescriptor({
    stage,
    transportId,
    maximumDispatchBytes: 65_536,
    maximumCompletionBytes: 65_536,
  });
  const calls = [];
  const completions = new Map();
  const complete = (dispatch) => buildRecoverableGodskillsCompletion({
    dispatch,
    transportDescriptor: descriptor,
    result: routeResult(dispatch.request),
    startedAt: '2026-08-31T16:00:00.000Z',
    completedAt: '2026-08-31T16:00:00.500Z',
  });
  return {
    descriptor,
    calls,
    completions,
    adapter: {
      descriptor() {
        calls.push({ type: 'descriptor' });
        return structuredClone(descriptor);
      },
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const completion = completions.get(dispatch.dispatchDigest);
        if (completion) return { status: 'completed', completion: structuredClone(completion) };
        if (reconciliation === 'pending') return { status: 'pending' };
        if (reconciliation !== 'absent') return { status: reconciliation };
        return { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate outbox execution');
        const completion = complete(dispatch);
        completions.set(dispatch.dispatchDigest, completion);
        return { status: 'completed', completion: structuredClone(completion) };
      },
    },
  };
}

async function jsonFiles(root) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.json')) found.push(path);
    }
  }
  await walk(root);
  return found.sort();
}

test('outbox transport contracts are deterministic, stage-bound, closed, and authority-empty', () => {
  const descriptor = buildRecoverableGodskillsTransportDescriptor({
    stage: 'route',
    transportId: 'route-contract-v1',
    maximumDispatchBytes: 16_384,
    maximumCompletionBytes: 8192,
  });
  assert.deepEqual(verifyRecoverableGodskillsTransportDescriptor(descriptor), descriptor);
  assert.deepEqual(descriptor.authority, GODSKILLS_OUTBOX_AUTHORITY);
  assert.equal(descriptor.terminalReconciliation, 'by-dispatch-digest');
  assert.equal(descriptor.atomicDeduplication, true);

  const request = routeRequest();
  const dispatch = buildRecoverableGodskillsDispatch({ request, transportDescriptor: descriptor });
  assert.deepEqual(verifyRecoverableGodskillsDispatch(dispatch, { transportDescriptor: descriptor }), dispatch);
  assert.equal(dispatch.stage, 'route');
  assert.equal(dispatch.requestDigest, sha256Value(request));
  assert.deepEqual(dispatch.authority, GODSKILLS_OUTBOX_AUTHORITY);

  const completion = buildRecoverableGodskillsCompletion({
    dispatch,
    transportDescriptor: descriptor,
    result: routeResult(request),
    startedAt: '2026-08-31T16:00:00.000Z',
    completedAt: '2026-08-31T16:00:00.500Z',
  });
  assert.deepEqual(verifyRecoverableGodskillsCompletion(completion, {
    dispatch,
    transportDescriptor: descriptor,
  }), completion);
  assert.equal(completion.resultDigest, sha256Value(completion.result));
  assert.deepEqual(completion.authority, GODSKILLS_OUTBOX_AUTHORITY);

  for (const mutate of [
    (value) => { value.provider = 'forbidden'; },
    (value) => { value.stage = 'activation'; },
    (value) => { value.authority.realmEffects = true; },
  ]) {
    const changed = structuredClone(completion);
    mutate(changed);
    const { completionDigest: _ignored, ...unsigned } = changed;
    changed.completionDigest = sha256Value(unsigned);
    assert.throws(
      () => verifyRecoverableGodskillsCompletion(changed, { dispatch, transportDescriptor: descriptor }),
      /field|additionalProperties|stage|authority|binding|credential/i,
    );
  }
});

test('completed external work recovers after process death without duplicate execution', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godskills-outbox-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = transport();
  let crash = true;
  const first = await createRecoverableGodskillsOutbox({
    root,
    stage: 'route',
    transport: external.adapter,
    checkpoint: async (name) => {
      if (crash && name === 'after-godskills-route-execute') {
        crash = false;
        throw new Error('simulated process death after route execution');
      }
    },
    lockOptions: {
      pid: 64101,
      now: () => Date.parse('2026-08-31T16:01:00.000Z'),
      staleAfterMs: 1,
      isProcessAlive: () => false,
      nonce: () => 'outbox-route-lock',
    },
  });
  const request = routeRequest();
  await assert.rejects(() => first.invoke(request), /process death/i);
  assert.equal(external.calls.filter(({ type }) => type === 'execute').length, 1);

  const recovered = await createRecoverableGodskillsOutbox({
    root,
    stage: 'route',
    transport: external.adapter,
    checkpoint: async () => {},
    lockOptions: {
      pid: 64102,
      now: () => Date.parse('2026-08-31T16:02:00.000Z'),
      staleAfterMs: 1,
      isProcessAlive: () => false,
      nonce: () => 'outbox-route-recovery-lock',
    },
  });
  assert.deepEqual(await recovered.invoke(request), routeResult(request));
  assert.equal(external.calls.filter(({ type }) => type === 'reconcile').length, 2);
  assert.equal(external.calls.filter(({ type }) => type === 'execute').length, 1);

  const calls = external.calls.length;
  assert.deepEqual(await recovered.invoke(request), routeResult(request));
  assert.equal(external.calls.length, calls);
  const files = await jsonFiles(root);
  assert.deepEqual(files.map((path) => path.slice(root.length + 1).replaceAll('\\', '/')).sort(), [
    `operations/route/${sha256Value({ protocolId: 'eternities-recoverable-godskills-outbox-v1', stage: 'route', requestId: request.requestId })}/completion.json`,
    `operations/route/${sha256Value({ protocolId: 'eternities-recoverable-godskills-outbox-v1', stage: 'route', requestId: request.requestId })}/dispatch.json`,
  ]);
  for (const path of files) {
    const text = await readFile(path, 'utf8');
    assert.equal(text, `${canonicalJson(JSON.parse(text))}\n`);
  }

  const changed = routeRequest({ request: 'changed under the same stable request id' });
  await assert.rejects(() => recovered.invoke(changed), /collision|changed|dispatch/i);
  assert.equal(external.calls.length, calls);
});

test('pending and ambiguous reconciliation never execute while descriptor and byte drift fail closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godskills-outbox-negative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pendingExternal = transport({ reconciliation: 'pending' });
  const pending = await createRecoverableGodskillsOutbox({
    root: join(root, 'pending'),
    stage: 'route',
    transport: pendingExternal.adapter,
  });
  await assert.rejects(
    () => pending.invoke(routeRequest()),
    (error) => error.code === 'operation-pending'
      && error.pending.status === 'pending'
      && error.pending.phase === 'route',
  );
  assert.equal(pendingExternal.calls.some(({ type }) => type === 'execute'), false);

  const ambiguousExternal = transport({ reconciliation: 'unknown' });
  const ambiguous = await createRecoverableGodskillsOutbox({
    root: join(root, 'ambiguous'),
    stage: 'route',
    transport: ambiguousExternal.adapter,
  });
  await assert.rejects(() => ambiguous.invoke(routeRequest()), /reconciliation|ambiguous|status/i);
  assert.equal(ambiguousExternal.calls.some(({ type }) => type === 'execute'), false);

  const tinyDispatchDescriptor = buildRecoverableGodskillsTransportDescriptor({
    stage: 'route',
    transportId: 'tiny-dispatch',
    maximumDispatchBytes: 256,
    maximumCompletionBytes: 65_536,
  });
  assert.throws(
    () => buildRecoverableGodskillsDispatch({ request: routeRequest(), transportDescriptor: tinyDispatchDescriptor }),
    /dispatch.*byte|byte.*ceiling/i,
  );

  const tinyCompletionDescriptor = buildRecoverableGodskillsTransportDescriptor({
    stage: 'route',
    transportId: 'tiny-completion',
    maximumDispatchBytes: 65_536,
    maximumCompletionBytes: 256,
  });
  const dispatch = buildRecoverableGodskillsDispatch({
    request: routeRequest(),
    transportDescriptor: tinyCompletionDescriptor,
  });
  assert.throws(() => buildRecoverableGodskillsCompletion({
    dispatch,
    transportDescriptor: tinyCompletionDescriptor,
    result: routeResult(routeRequest()),
    startedAt: '2026-08-31T16:00:00.000Z',
    completedAt: '2026-08-31T16:00:00.500Z',
  }), /completion.*byte|byte.*ceiling/i);
});
