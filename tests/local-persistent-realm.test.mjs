import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('Realm initialization recovers an abandoned pending publication without replacing committed state', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-realm-publication-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const statePath = join(root, 'realm-state.json');
  const pendingPath = `${statePath}.writing`;
  await writeFile(pendingPath, '{"schemaVersion":1', 'utf8');

  const first = await createPersistentLocalRealm({ contract, statePath });
  await assert.rejects(() => access(pendingPath), { code: 'ENOENT' });
  await first.invoke({
    handId: 'counter.increment',
    payload: { amount: 3 },
    idempotencyKey: 'publication-recovery:decision-1',
  });
  await writeFile(pendingPath, '', 'utf8');

  const second = await createPersistentLocalRealm({ contract, statePath });
  await assert.rejects(() => access(pendingPath), { code: 'ENOENT' });
  assert.equal((await second.observe()).counter, 3);
  assert.equal((await second.inspect()).idempotencyCount, 1);
});
