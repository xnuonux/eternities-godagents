import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { deriveGenesisIdentity } from '../src/genesis/identity.mjs';
import { createGenesisStateStore } from '../src/genesis/state-store.mjs';

const digest = (character) => character.repeat(64);
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

async function fixture(context) {
  const transactionDir = await mkdtemp(join(tmpdir(), 'godagent-genesis-state-'));
  context.after(() => rm(transactionDir, { recursive: true, force: true }));
  return {
    transactionDir,
    store: createGenesisStateStore({
      transactionDir,
      clock: () => '2026-08-29T10:00:00.000Z',
    }),
  };
}

test('genesis state store advances one digest-linked closed transition chain', async (context) => {
  const { store } = await fixture(context);
  const prepared = await store.initialize(identity);
  const keelPrepared = await store.transition({
    expectedState: 'prepared',
    nextState: 'keel-prepared',
    evidence: { keelHeadDigest: digest('5') },
  });
  const journalPrepared = await store.transition({
    expectedState: 'keel-prepared',
    nextState: 'journal-prepared',
    evidence: { journalHeadDigest: digest('6') },
  });

  assert.equal(prepared.previousStateDigest, digest('0'));
  assert.equal(keelPrepared.previousStateDigest, prepared.stateDigest);
  assert.equal(journalPrepared.previousStateDigest, keelPrepared.stateDigest);
  assert.deepEqual(await store.read(), journalPrepared);
});

test('genesis state store rejects backward, skipped, stale, and unknown transitions', async (context) => {
  const { store } = await fixture(context);
  await store.initialize(identity);
  await assert.rejects(
    () => store.transition({ expectedState: 'prepared', nextState: 'journal-prepared', evidence: { journalHeadDigest: digest('6') } }),
    /transition/,
  );
  await assert.rejects(
    () => store.transition({ expectedState: 'prepared', nextState: 'keel-prepared', evidence: { surprise: digest('5') } }),
    /evidence/,
  );
  await store.transition({ expectedState: 'prepared', nextState: 'keel-prepared', evidence: { keelHeadDigest: digest('5') } });
  await assert.rejects(
    () => store.transition({ expectedState: 'prepared', nextState: 'keel-prepared', evidence: { keelHeadDigest: digest('5') } }),
    /stale/,
  );
  await assert.rejects(
    () => store.transition({ expectedState: 'keel-prepared', nextState: 'prepared', evidence: {} }),
    /transition/,
  );
});

test('genesis state store detects identity and digest modification', async (context) => {
  const { transactionDir, store } = await fixture(context);
  const state = await store.initialize(identity);
  const path = join(transactionDir, 'genesis-state.json');

  await writeFile(path, `${canonicalJson({ ...state, instanceId: 'agent-b' })}\n`, 'utf8');
  await assert.rejects(() => store.read(), /state digest mismatch|identity mismatch/);

  await writeFile(path, `${canonicalJson({ ...state, stateDigest: digest('f') })}\n`, 'utf8');
  await assert.rejects(() => store.read(), /state digest mismatch/);
});

test('genesis state initialization is exact-idempotent and refuses another identity', async (context) => {
  const { store } = await fixture(context);
  const first = await store.initialize(identity);
  assert.deepEqual(await store.initialize(identity), first);
  await assert.rejects(
    () => store.initialize({ ...identity, instanceId: 'agent-b' }),
    /identity collision/,
  );
});
