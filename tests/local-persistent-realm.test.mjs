import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { createPersistentLocalRealm } from '../src/realm/local-persistent-realm.mjs';

const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));

test('local Realm state and idempotency survive independent process-shaped instances', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-persistent-realm-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const statePath = join(root, 'realm-state.json');
  const first = await createPersistentLocalRealm({ contract, statePath });
  const applied = await first.invoke({ handId: 'counter.increment', payload: { amount: 1 }, idempotencyKey: 'instance:decision-1' });
  assert.equal((await first.observe()).counter, 1);

  const second = await createPersistentLocalRealm({ contract, statePath });
  assert.equal((await second.observe()).counter, 1);
  assert.deepEqual(await second.invoke({
    handId: 'counter.increment', payload: { amount: 1 }, idempotencyKey: 'instance:decision-1',
  }), applied);
  assert.equal((await second.observe()).counter, 1);
  assert.equal((await second.inspect()).idempotencyCount, 1);
});

test('changed or noncanonical local Realm state fails closed', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-persistent-realm-tamper-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const statePath = join(root, 'realm-state.json');
  await createPersistentLocalRealm({ contract, statePath });
  await assert.rejects(async () => {
    const text = await readFile(statePath, 'utf8');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(statePath, text.replace('"counter":0', '"counter":9'), 'utf8'));
    await createPersistentLocalRealm({ contract, statePath });
  }, /Realm state/);
});
