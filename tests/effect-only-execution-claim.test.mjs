import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'effect-claim-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { recordPath: join(root, 'execution.json'), executionIdentity: {
    hostBindingDigest: '1'.repeat(64), routingReceiptDigest: '2'.repeat(64),
    verifierReceiptDigest: '3'.repeat(64), requestDigest: '4'.repeat(64),
  } };
}
async function api() {
  const value = await import('../src/skills/effect-only-execution-claim.mjs').catch(() => null);
  assert.equal(typeof value?.claimEffectOnlyRoutingExecution, 'function', 'exclusive execution claim exists');
  return value.claimEffectOnlyRoutingExecution;
}
test('only the first durable claim can permit a routing launch', async t => {
  const claim = await api();
  const input = await setup(t);
  const first = await claim(input);
  const bytes = await readFile(input.recordPath);
  assert.equal(first.status, 'claimed');
  const recovered = await claim(input);
  assert.equal(recovered.status, 'pending');
  assert.deepEqual(recovered.record, first.record);
  assert.deepEqual(await readFile(input.recordPath), bytes);
});
test('partial start evidence is preserved and never converted into a fresh claim', async t => {
  const claim = await api();
  const input = await setup(t);
  await writeFile(input.recordPath, '{interrupted');
  await assert.rejects(claim(input));
  assert.equal(await readFile(input.recordPath, 'utf8'), '{interrupted');
});
test('changed host or executable binding cannot reuse an old execution slot', async t => {
  const claim = await api();
  const input = await setup(t);
  await claim(input);
  for (const key of Object.keys(input.executionIdentity)) {
    await assert.rejects(claim({ ...input, executionIdentity: { ...input.executionIdentity, [key]: 'f'.repeat(64) } }), /binding/);
  }
});
test('racing claimers never receive two launch permissions', async t => {
  const claim = await api();
  const input = await setup(t);
  const results = await Promise.allSettled([claim(input), claim(input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.status === 'claimed').length, 1);
  assert.equal((await claim(input)).status, 'pending');
});
