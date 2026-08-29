import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { deriveGenesisIdentity } from '../src/genesis/identity.mjs';
import { createGenesisStateStore } from '../src/genesis/state-store.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';
import { acquireFileLock } from '../src/state/file-lock.mjs';
import { appendEvent } from '../src/state/journal.mjs';

const digest = (character) => character.repeat(64);
const oldLock = Object.freeze({
  schemaVersion: 1,
  pid: 2147483647,
  nonce: 'dead-owner-nonce',
  createdAt: '2000-01-01T00:00:00.000Z',
});
const bytes = (value) => `${canonicalJson(value)}\n`;

async function writeExpiredMalformedLock(lockPath, content) {
  await writeFile(lockPath, content, 'utf8');
  const expired = new Date('2000-01-01T00:00:00.000Z');
  await utimes(lockPath, expired, expired);
}

async function workspace(context) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-lock-recovery-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('file lock atomically reclaims an expired owner proven dead', async (context) => {
  const root = await workspace(context);
  const lockPath = join(root, 'resource.lock');
  await writeFile(lockPath, bytes(oldLock), 'utf8');
  const lock = await acquireFileLock({
    lockPath,
    now: () => Date.parse('2026-08-29T10:00:00.000Z'),
    isProcessAlive: () => false,
    nonce: () => 'new-owner-nonce',
  });
  assert.equal(lock.owner.nonce, 'new-owner-nonce');
  await lock.release();
  await assert.rejects(() => access(lockPath));
});

test('file lock never reclaims a live or grace-period owner', async (context) => {
  const root = await workspace(context);
  const lockPath = join(root, 'resource.lock');
  await writeFile(lockPath, bytes({
    ...oldLock,
    pid: process.pid,
    nonce: 'live-owner-nonce',
    createdAt: '2026-08-29T09:59:59.000Z',
  }), 'utf8');
  await assert.rejects(
    () => acquireFileLock({
      lockPath,
      now: () => Date.parse('2026-08-29T10:00:00.000Z'),
      isProcessAlive: () => true,
      nonce: () => 'contender-nonce',
    }),
    /locked by a live or recent owner/,
  );
});

test('file lock reclaims expired malformed metadata but rejects a recent malformed lock', async (context) => {
  const root = await workspace(context);
  const lockPath = join(root, 'resource.lock');
  await writeExpiredMalformedLock(lockPath, '{"schemaVersion":1');
  const lock = await acquireFileLock({
    lockPath,
    now: () => Date.parse('2026-08-29T10:00:00.000Z'),
    nonce: () => 'malformed-recovery-nonce',
  });
  assert.equal(lock.owner.nonce, 'malformed-recovery-nonce');
  await lock.release();

  await writeFile(lockPath, '', 'utf8');
  await assert.rejects(
    () => acquireFileLock({
      lockPath,
      now: () => Date.parse('2026-08-29T10:00:00.000Z'),
      nonce: () => 'recent-contender-nonce',
    }),
    /locked by malformed owner metadata/,
  );
});

test('state, journal, ownership, and namespace locks recover old dead owners', async (context) => {
  const root = await workspace(context);
  const transactionDir = join(root, 'transaction');
  await mkdir(transactionDir, { recursive: true });
  await writeFile(join(transactionDir, '.genesis-state.lock'), bytes(oldLock), 'utf8');
  const identity = {
    ...deriveGenesisIdentity({
      instanceId: 'agent-a',
      creatorRef: 'creator:dom',
      creationBuildId: digest('1'),
      distributionBuildId: digest('2'),
      genomeValueDigest: digest('3'),
      genomeContentDigest: digest('4'),
    }),
    instanceId: 'agent-a',
  };
  assert.equal((await createGenesisStateStore({ transactionDir }).initialize(identity)).state, 'prepared');

  const journalPath = join(root, 'journal.jsonl');
  await writeFile(`${journalPath}.lock`, bytes(oldLock), 'utf8');
  const event = await appendEvent({
    journalPath,
    event: {
      schemaVersion: 1,
      instanceId: 'agent-a',
      stateEpoch: 0,
      eventType: 'test.event',
      sourceClass: 'test',
      sourceRef: 'test-1',
      causationId: 'test-1',
      correlationId: 'test-1',
      payload: {},
      recordedAt: '2026-08-29T10:00:00.000Z',
    },
  });
  assert.equal(event.sequence, 1);

  const keelRoot = join(root, 'keels');
  await mkdir(keelRoot, { recursive: true });
  await writeFile(join(keelRoot, '.ownership.lock'), bytes(oldLock), 'utf8');
  const backend = createLocalKeelBackend({ root: keelRoot, clock: () => '2026-08-29T10:00:00.000Z' });
  await backend.prepareNamespace({
    ...identity,
    bedrock: { genesisId: identity.genesisId, keelId: identity.keelId, instanceId: identity.instanceId },
  });
  await writeFile(join(keelRoot, identity.keelId, '.lock'), bytes(oldLock), 'utf8');
  assert.equal((await backend.prepareNamespace({
    ...identity,
    bedrock: { genesisId: identity.genesisId, keelId: identity.keelId, instanceId: identity.instanceId },
  })).recordCount, 1);
});

test('state, journal, ownership, and namespace locks recover expired malformed files', async (context) => {
  const root = await workspace(context);
  const transactionDir = join(root, 'transaction');
  await mkdir(transactionDir, { recursive: true });
  await writeExpiredMalformedLock(join(transactionDir, '.genesis-state.lock'), '');
  const identity = {
    ...deriveGenesisIdentity({
      instanceId: 'agent-malformed',
      creatorRef: 'creator:dom',
      creationBuildId: digest('5'),
      distributionBuildId: digest('6'),
      genomeValueDigest: digest('7'),
      genomeContentDigest: digest('8'),
    }),
    instanceId: 'agent-malformed',
  };
  assert.equal((await createGenesisStateStore({ transactionDir }).initialize(identity)).state, 'prepared');

  const journalPath = join(root, 'malformed-journal.jsonl');
  await writeExpiredMalformedLock(`${journalPath}.lock`, '{"schemaVersion":1');
  const event = await appendEvent({
    journalPath,
    event: {
      schemaVersion: 1,
      instanceId: identity.instanceId,
      stateEpoch: 0,
      eventType: 'test.event',
      sourceClass: 'test',
      sourceRef: 'test-malformed',
      causationId: 'test-malformed',
      correlationId: 'test-malformed',
      payload: {},
      recordedAt: '2026-08-29T10:00:00.000Z',
    },
  });
  assert.equal(event.sequence, 1);

  const keelRoot = join(root, 'malformed-keels');
  await mkdir(keelRoot, { recursive: true });
  await writeExpiredMalformedLock(join(keelRoot, '.ownership.lock'), '');
  const backend = createLocalKeelBackend({ root: keelRoot, clock: () => '2026-08-29T10:00:00.000Z' });
  await backend.prepareNamespace({
    ...identity,
    bedrock: { genesisId: identity.genesisId, keelId: identity.keelId, instanceId: identity.instanceId },
  });
  await writeExpiredMalformedLock(join(keelRoot, identity.keelId, '.lock'), '{"schemaVersion":1');
  assert.equal((await backend.prepareNamespace({
    ...identity,
    bedrock: { genesisId: identity.genesisId, keelId: identity.keelId, instanceId: identity.instanceId },
  })).recordCount, 1);
});
