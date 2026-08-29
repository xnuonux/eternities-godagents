import assert from 'node:assert/strict';
import test from 'node:test';

import { createTemporaryWorkerEnvelope } from '../src/runtime/temporary-worker.mjs';

test('temporary worker receives bounded external context and proposal authority without a personal keel capability', () => {
  const envelope = createTemporaryWorkerEnvelope({
    taskId: 'task-1',
    leadInstanceId: 'agent-a',
    authority: ['analyze', 'propose'],
    excerpts: [
      { sourceRef: 'journal:12', provenance: 'lead-provided', content: 'inspect this bounded failure' },
    ],
  });
  assert.deepEqual(envelope, {
    schemaVersion: 1,
    role: 'temporary-worker',
    taskId: 'task-1',
    lead: { instanceId: 'agent-a', relation: 'external-provenance-only' },
    authority: ['analyze', 'propose'],
    excerpts: [
      { sourceRef: 'journal:12', provenance: 'lead-provided', content: 'inspect this bounded failure' },
    ],
  });
  const durable = JSON.stringify(envelope);
  for (const forbidden of ['keelId', 'receiptDigest', 'backendRoot', 'appendCheckpoint', 'genesisReceipt']) {
    assert.equal(durable.includes(forbidden), false);
  }
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.excerpts[0]), true);
});

test('temporary worker rejects writable authority, hidden fields, functions, and path-shaped identity', () => {
  const base = {
    taskId: 'task-1',
    leadInstanceId: 'agent-a',
    authority: ['observe'],
    excerpts: [],
  };
  assert.throws(() => createTemporaryWorkerEnvelope({ ...base, authority: ['keel.write'] }), /authority/);
  assert.throws(() => createTemporaryWorkerEnvelope({ ...base, taskId: '../escape' }), /taskId/);
  assert.throws(() => createTemporaryWorkerEnvelope({ ...base, keelId: `keel-${'a'.repeat(64)}` }), /unknown field/);
  assert.throws(() => createTemporaryWorkerEnvelope({
    ...base,
    excerpts: [{ sourceRef: 'journal:1', provenance: 'lead-provided', content: () => 'hidden' }],
  }), /content/);
});

test('temporary worker enforces excerpt count and total canonical byte budget', () => {
  const base = { taskId: 'task-1', leadInstanceId: 'agent-a', authority: ['analyze'] };
  const excerpt = { sourceRef: 'journal:1', provenance: 'lead-provided', content: 'x' };
  assert.throws(() => createTemporaryWorkerEnvelope({ ...base, excerpts: Array.from({ length: 17 }, () => excerpt) }), /excerpt count/);
  assert.throws(() => createTemporaryWorkerEnvelope({
    ...base,
    excerpts: [{ ...excerpt, content: 'x'.repeat(8192) }],
  }), /byte budget/);
});
