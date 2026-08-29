import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { sha256Value } from '../src/core/digest.mjs';
import { promoteCheckpoint } from '../src/keel/checkpoint-policy.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';
import { appendEvent, readVerifiedJournal } from '../src/state/journal.mjs';

const digest = (character) => character.repeat(64);
const clock = () => '2026-08-29T10:00:00.000Z';

function receipt(instanceId, genesisId, keelId) {
  const unsigned = {
    schemaVersion: 1,
    status: 'admitted',
    genesisId,
    keelId,
    instanceId,
    creatorRef: 'creator:dom',
    creationBuildId: digest('1'),
    distributionBuildId: digest('2'),
    policyDigest: digest('3'),
    genomeValueDigest: digest('4'),
    genomeContentDigest: digest('5'),
    constitutionDigest: digest('6'),
    soulPortDigest: digest('7'),
    journalBindingBaseDigest: digest('8'),
    journalHeadDigest: digest('9'),
    keelBindingBaseDigest: digest('a'),
    keelHeadDigest: digest('b'),
    transactionStateDigest: digest('c'),
  };
  return { ...unsigned, receiptDigest: sha256Value(unsigned) };
}

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-checkpoint-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const instanceId = 'agent-a';
  const genesisId = digest('d');
  const keelId = `keel-${digest('e')}`;
  const keelAdapter = createLocalKeelBackend({ root: join(root, 'keels'), clock });
  await keelAdapter.prepareNamespace({
    keelId,
    instanceId,
    genesisId,
    bedrock: { genesisId, keelId, instanceId },
  });
  const journalPath = join(root, 'journal.jsonl');
  const source = await appendEvent({
    journalPath,
    event: {
      schemaVersion: 1,
      instanceId,
      stateEpoch: 0,
      eventType: 'cycle.completed',
      sourceClass: 'vessel-runtime',
      sourceRef: 'mission-1',
      causationId: 'mission-1',
      correlationId: 'mission-1',
      payload: { receiptDigest: digest('f') },
      recordedAt: clock(),
    },
  });
  return {
    root,
    instanceId,
    genesisId,
    keelId,
    keelAdapter,
    journalPath,
    source,
    admittedReceipt: receipt(instanceId, genesisId, keelId),
  };
}

test('checkpoint promotion mutually records exact journal and keel provenance', async (context) => {
  const setup = await fixture(context);
  const before = await setup.keelAdapter.inspectNamespace({ keelId: setup.keelId });
  const checkpoint = {
    kind: 'milestone',
    content: 'completed the first governed cycle',
    verification: 'verified',
    method: 'journal receipt and Realm observation',
  };
  const promoted = await promoteCheckpoint({
    admittedReceipt: setup.admittedReceipt,
    journalPath: setup.journalPath,
    keelAdapter: setup.keelAdapter,
    sourceSequence: setup.source.sequence,
    checkpoint,
    expectedKeelHead: before.headDigest,
    clock,
  });
  const keel = await setup.keelAdapter.inspectNamespace({ keelId: setup.keelId });
  const journal = await readVerifiedJournal(setup.journalPath);
  assert.equal(keel.records.at(-1).payload.sourceDigest, setup.source.contentDigest);
  assert.equal(keel.records.at(-1).payload.sourceInstanceId, setup.instanceId);
  assert.equal(journal.events.at(-1).eventType, 'keel.checkpoint-promoted');
  assert.equal(journal.events.at(-1).payload.keelHeadDigest, promoted.keelHeadDigest);
  assert.equal(promoted.journalHeadDigest, journal.lastDigest);

  const replayed = await promoteCheckpoint({
    admittedReceipt: setup.admittedReceipt,
    journalPath: setup.journalPath,
    keelAdapter: setup.keelAdapter,
    sourceSequence: setup.source.sequence,
    checkpoint,
    expectedKeelHead: before.headDigest,
    clock,
  });
  assert.deepEqual(replayed, promoted);
  assert.equal((await readVerifiedJournal(setup.journalPath)).events.length, 2);
});

test('checkpoint promotion rejects missing, changed, cross-agent, and stale provenance', async (context) => {
  const setup = await fixture(context);
  const before = await setup.keelAdapter.inspectNamespace({ keelId: setup.keelId });
  const checkpoint = { kind: 'decision', content: 'retain the boundary', verification: 'unverified', method: null };
  await assert.rejects(
    () => promoteCheckpoint({ ...setup, checkpoint, sourceSequence: 99, expectedKeelHead: before.headDigest, clock }),
    /source sequence/,
  );
  const otherReceipt = receipt('agent-b', digest('a'), `keel-${digest('b')}`);
  await assert.rejects(
    () => promoteCheckpoint({ ...setup, admittedReceipt: otherReceipt, checkpoint, sourceSequence: 1, expectedKeelHead: before.headDigest, clock }),
    /instance mismatch/,
  );
  await assert.rejects(
    () => promoteCheckpoint({ ...setup, checkpoint, sourceSequence: 1, expectedKeelHead: digest('0'), clock }),
    /head mismatch/,
  );
  await assert.rejects(
    () => promoteCheckpoint({
      ...setup,
      checkpoint: { ...checkpoint, verification: 'verified' },
      sourceSequence: 1,
      expectedKeelHead: before.headDigest,
      clock,
    }),
    /verification method/,
  );
});

test('checkpoint policy closes kinds, fields, and content bounds', async (context) => {
  const setup = await fixture(context);
  const before = await setup.keelAdapter.inspectNamespace({ keelId: setup.keelId });
  const base = { sourceSequence: 1, expectedKeelHead: before.headDigest, clock };
  await assert.rejects(
    () => promoteCheckpoint({ ...setup, ...base, checkpoint: { kind: 'routine-turn', content: 'noise', verification: 'unverified', method: null } }),
    /checkpoint kind/,
  );
  await assert.rejects(
    () => promoteCheckpoint({ ...setup, ...base, checkpoint: { kind: 'milestone', content: 'x'.repeat(4097), verification: 'unverified', method: null } }),
    /content/,
  );
  await assert.rejects(
    () => promoteCheckpoint({ ...setup, ...base, checkpoint: { kind: 'milestone', content: 'valid', verification: 'unverified', method: null, authority: 'admin' } }),
    /unknown field/,
  );
});
