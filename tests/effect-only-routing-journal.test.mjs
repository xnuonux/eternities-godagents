import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Value } from '../src/core/digest.mjs';

async function fixture(t, behavior = 'success') {
  const root = await mkdtemp(join(tmpdir(), 'effect-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const module = await import('../src/skills/effect-only-routing-journal.mjs').catch(() => null);
  assert.equal(typeof module?.createEffectOnlyRoutingJournal, 'function', 'routing journal exists');
  const input = { slotId: 'mission-one', request: { text: 'inert test input' }, expectedSource: { test: true },
    hostBindingDigest: '1'.repeat(64) };
  const calls = { route: 0, verify: 0 };
  let resultPath;
  const journal = module.createEffectOnlyRoutingJournal({ root,
    routingReceiptDigest: '2'.repeat(64), verifierReceiptDigest: '3'.repeat(64),
    async route(args) {
      calls.route += 1;
      resultPath = args.resultPath;
      if (behavior === 'no-result') throw new Error('transport interrupted');
      await writeFile(args.resultPath, JSON.stringify({ routeReceipt: { status: behavior === 'denied' ? 'needs-decision' : 'no-qualified-route' }, inputDigest: sha256Value(args.request) }), { flag: 'wx' });
      if (behavior === 'after-result') throw new Error('transport observation lost');
    },
    async verify({ request, result }) {
      calls.verify += 1;
      return result.inputDigest === sha256Value(request);
    },
  });
  return { root, input, calls, journal, resultPath: () => resultPath };
}
test('committed result recovery verifies but never routes again', async t => {
  const f = await fixture(t);
  const first = await f.journal.run(f.input);
  assert.equal(first.status, 'no-qualified-route');
  assert.equal(f.calls.route, 1);
  const next = await f.journal.run(f.input);
  assert.deepEqual(next, first);
  assert.equal(f.calls.route, 1);
  assert.equal(f.calls.verify, 2);
});
test('a start without a result remains pending without retry', async t => {
  const f = await fixture(t, 'no-result');
  assert.equal((await f.journal.run(f.input)).status, 'pending');
  assert.equal((await f.journal.run(f.input)).status, 'pending');
  assert.equal(f.calls.route, 1);
  assert.equal(f.calls.verify, 0);
});
test('result surviving lost transport observation is reconciled without rerouting', async t => {
  const f = await fixture(t, 'after-result');
  assert.equal((await f.journal.run(f.input)).status, 'pending');
  assert.equal((await f.journal.run(f.input)).status, 'no-qualified-route');
  assert.equal(f.calls.route, 1);
});
test('valid needs-decision remains blocked after recovery', async t => {
  const f = await fixture(t, 'denied');
  assert.equal((await f.journal.run(f.input)).status, 'needs-decision');
  assert.equal((await f.journal.run(f.input)).status, 'needs-decision');
  assert.equal(f.calls.route, 1);
});
test('changed request or altered saved result never triggers another route', async t => {
  const f = await fixture(t);
  await f.journal.run(f.input);
  await assert.rejects(f.journal.run({ ...f.input, request: { text: 'changed' } }), /binding/);
  const original = await readFile(f.resultPath(), 'utf8');
  await writeFile(f.resultPath(), original.replace('inputDigest', 'forgedDigest'));
  await assert.rejects(f.journal.run(f.input), /verification/);
  assert.equal(f.calls.route, 1);
});
test('malformed saved result is rejected without exposing its body', async t => {
  const f = await fixture(t);
  await f.journal.run(f.input);
  await writeFile(f.resultPath(), 's3cr3t');
  await assert.rejects(f.journal.run(f.input), error => {
    assert.doesNotMatch(error.message, /s3cr3t/);
    return true;
  });
  assert.equal(f.calls.route, 1);
});
test('a changed completion record is preserved and rejected', async t => {
  const f = await fixture(t);
  await f.journal.run(f.input);
  const completion = join(f.resultPath(), '..', 'completion.json');
  await writeFile(completion, '{interrupted');
  await assert.rejects(f.journal.run(f.input), /binding/);
  assert.equal(await readFile(completion, 'utf8'), '{interrupted');
  assert.equal(f.calls.route, 1);
});
test('orphaned result cannot acquire start provenance across repeated recovery calls', async t => {
  const f = await fixture(t);
  const slot = join(f.root, sha256Value({ protocolId: 'effect-only-routing-journal-v2', slotId: f.input.slotId }));
  await mkdir(slot);
  await writeFile(join(slot, 'result.json'), JSON.stringify({ routeReceipt: { status: 'no-qualified-route' }, inputDigest: sha256Value(f.input.request) }));
  await assert.rejects(f.journal.run(f.input), /unclaimed/);
  await assert.rejects(f.journal.run(f.input), /unclaimed/);
  await assert.rejects(readFile(join(slot, 'execution.json')), { code: 'ENOENT' });
  assert.equal(f.calls.route, 0);
  assert.equal(f.calls.verify, 0);
});
test('completion binds exact saved result bytes as well as its JSON value', async t => {
  const f = await fixture(t);
  await f.journal.run(f.input);
  const original = JSON.parse(await readFile(f.resultPath(), 'utf8'));
  await writeFile(f.resultPath(), JSON.stringify(original, null, 2));
  await assert.rejects(f.journal.run(f.input), /binding/);
  assert.equal(f.calls.route, 1);
});
test('a newly inserted UTF-8 BOM cannot evade exact result-byte binding', async t => {
  const f = await fixture(t);
  await f.journal.run(f.input);
  const bytes = await readFile(f.resultPath());
  await writeFile(f.resultPath(), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]));
  await assert.rejects(f.journal.run(f.input));
  assert.equal(f.calls.route, 1);
});
