import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256Value } from '../src/core/digest.mjs';
import { workspaceOwnerFixture } from './helpers/workspace-owner-fixture.mjs';
import { createWorkspaceOwner, assertWorkspaceOwner } from '../src/host/workspace-owner.mjs';

async function open(f, options = {}) {
  const host = await f.createHost({ propose: body => {
    const user = JSON.parse(body.messages.find(row => row.role === 'user').content);
    const find = value => {
      if (typeof value === 'string') { try { const parsed = JSON.parse(value); if (parsed.protocolId === 'eternities-workspace-repair-task-v1') return parsed; } catch {} }
      if (value && typeof value === 'object') for (const child of Object.values(value)) { const found = find(child); if (found) return found; }
      return null;
    };
    const task = find(user); assert.ok(task, 'exact workspace task reaches sender');
    assert.equal(task.files[0].text, f.broken.toString('utf8'));
    const proposal = { schemaVersion: 1, parentDigest: task.parentDigest,
      changes: [{ path: task.files[0].path, expectedSha256: task.files[0].sha256, text: f.fixed }] };
    options.mutate?.(proposal); return proposal;
  }, ...options.provider });
  return createWorkspaceOwner({ policy: f.policy, expectedPolicyDigest: sha256Value(f.policy), host, hostKind: 'provider', registryRoot: f.registryRoot, ...options.owner });
}

test('fresh admitted owner stages an authentic proposal, preserves source, and reconciles without inference', async t => {
  const f = await workspaceOwnerFixture(t), owner = await open(f);
  assertWorkspaceOwner(owner); assert.throws(() => assertWorkspaceOwner({ ...owner }), /issued/);
  const staged = await owner.propose();
  assert.equal(staged.status, 'needs-review'); assert.equal(staged.actor.instanceId, 'workspace-owner-test');
  assert.equal(staged.revision.parentDigest, staged.parent.revisionDigest);
  assert.equal(f.requests.length, 1); assert.deepEqual(await readFile(join(f.policy.source.sourceRoot, 'index.html')), f.broken);
  assert.deepEqual((await readdir(join(f.workspace, 'workspace-revisions', 'revisions'))).sort(), [staged.parent.revisionDigest, staged.revision.revisionDigest].sort());
  const fresh = await open(f, { provider: { credential: false } });
  assert.deepEqual(await fresh.propose(), staged); assert.equal(f.requests.length, 1);
  assert.equal(Object.hasOwn(owner, 'approve'), false); assert.equal(Object.hasOwn(owner, 'runShell'), false);
});

for (const [name, mutate] of [
  ['wrong preimage', v => { v.changes[0].expectedSha256 = '0'.repeat(64); }],
  ['unselected path', v => { v.changes[0].path = '../outside.html'; }],
  ['duplicate path', v => { v.changes.push(v.changes[0]); }],
]) test(`authentic model proposal with ${name} is refused before a child is published`, async t => {
  const f = await workspaceOwnerFixture(t), owner = await open(f, { mutate });
  await assert.rejects(owner.propose());
  assert.equal(f.requests.length, 1);
  assert.equal((await readdir(join(f.workspace, 'workspace-revisions', 'revisions'))).length, 1);
});

test('interruption after child publication recovers the identical revision without reissuing inference', async t => {
  const f = await workspaceOwnerFixture(t), first = await open(f, { owner: { checkpoint: point => {
    if (point === 'revision-published') throw new Error('controlled child interruption');
  } } });
  await assert.rejects(first.propose(), /controlled child interruption/);
  const before = (await readdir(join(f.workspace, 'workspace-revisions', 'revisions'))).sort();
  const fresh = await open(f, { provider: { credential: false } }), recovered = await fresh.propose();
  assert.equal(recovered.status, 'needs-review'); assert.equal(f.requests.length, 1);
  assert.deepEqual((await readdir(join(f.workspace, 'workspace-revisions', 'revisions'))).sort(), before);
});

test('workspace owner rejects old Realm, stale pins, forged host and source preimage drift before inference', async t => {
  const old = await workspaceOwnerFixture(t, { oldRealm: true });
  await assert.rejects(open(old), /workspace/); assert.equal(old.requests.length, 0);
  const f = await workspaceOwnerFixture(t), host = await f.createHost({ credential: false });
  await assert.rejects(createWorkspaceOwner({ policy: f.policy, expectedPolicyDigest: '0'.repeat(64), host, hostKind: 'provider' }), /pin/);
  await assert.rejects(createWorkspaceOwner({ policy: f.policy, expectedPolicyDigest: sha256Value(f.policy), host: { ...host }, hostKind: 'provider' }), /issued|instance/);
  const owner = await open(f); await writeFile(join(f.policy.source.sourceRoot, 'index.html'), 'changed');
  await assert.rejects(owner.propose(), /preimage/); assert.equal(f.requests.length, 0);
});

test('uncertain native execution remains pending instead of becoming a revision or duplicate call', async t => {
  const f = await workspaceOwnerFixture(t), first = await open(f, { provider: { uncertain: true } });
  await assert.rejects(first.propose()); assert.equal(f.requests.length, 1);
  const fresh = await open(f, { provider: { credential: false } });
  assert.equal((await fresh.propose()).status, 'pending'); assert.equal(f.requests.length, 1);
});

test('model-supplied authority or stale preimage cannot produce an executable child', async t => {
  const f = await workspaceOwnerFixture(t), owner = await open(f, { provider: { propose: () => ({
    schemaVersion: 1, parentDigest: 'a'.repeat(64), changes: [{ path: 'index.html', expectedSha256: 'b'.repeat(64), text: f.fixed }], approved: true }) } });
  await assert.rejects(owner.propose(), /proposal/); assert.equal(f.requests.length, 1);
  assert.equal((await readdir(join(f.workspace, 'workspace-revisions', 'revisions'))).length, 1);
});
