import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { IntegrityError } from '../src/core/errors.mjs';
import { deriveGenesisIdentity } from '../src/genesis/identity.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';

const digest = (character) => character.repeat(64);
const identityFor = (instanceId, character) => deriveGenesisIdentity({
  instanceId,
  creatorRef: 'creator:dom',
  creationBuildId: digest(character),
  distributionBuildId: digest(character === '1' ? '2' : '3'),
  genomeValueDigest: digest(character === '1' ? '4' : '5'),
  genomeContentDigest: digest(character === '1' ? '6' : '7'),
});

const clock = () => '2026-08-29T10:00:00.000Z';

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'godagent-keel-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  return { root, backend: createLocalKeelBackend({ root, clock }) };
}

function preparation(instanceId, character = '1') {
  const identity = identityFor(instanceId, character);
  return {
    ...identity,
    instanceId,
    bedrock: {
      genesisId: identity.genesisId,
      instanceId,
      genomeValueDigest: digest(character === '1' ? '4' : '5'),
    },
  };
}

const genesisRows = Object.freeze([
  { kind: 'constitution', payload: { digest: digest('8'), laws: ['verify before claim'] } },
  { kind: 'provenance', payload: { creatorRef: 'creator:dom' } },
  { kind: 'soul-port', payload: { state: 'dormant', digest: digest('9') } },
  { kind: 'checkpoint', payload: { kind: 'genesis', open: 'begin', carry: 'none' } },
]);

test('separate persistent vessels receive isolated keel namespaces', async (context) => {
  const { backend } = await fixture(context);
  const first = preparation('agent-a', '1');
  const second = preparation('agent-b', 'a');

  await backend.prepareNamespace(first);
  await backend.appendGenesis({ keelId: first.keelId, genesisId: first.genesisId, rows: genesisRows });
  await backend.prepareNamespace(second);
  await backend.appendGenesis({ keelId: second.keelId, genesisId: second.genesisId, rows: genesisRows });

  const firstState = await backend.inspectNamespace({ keelId: first.keelId });
  const secondState = await backend.inspectNamespace({ keelId: second.keelId });
  assert.equal(firstState.instanceId, 'agent-a');
  assert.equal(secondState.instanceId, 'agent-b');
  assert.equal(firstState.recordCount, 5);
  assert.equal(secondState.recordCount, 5);
  assert.notEqual(firstState.headDigest, secondState.headDigest);
});

test('exact namespace and genesis replay is idempotent while identity collision fails closed', async (context) => {
  const { backend } = await fixture(context);
  const first = preparation('agent-a');
  await backend.prepareNamespace(first);
  await backend.prepareNamespace(first);
  await backend.appendGenesis({ keelId: first.keelId, genesisId: first.genesisId, rows: genesisRows });
  await backend.appendGenesis({ keelId: first.keelId, genesisId: first.genesisId, rows: genesisRows });
  assert.equal((await backend.inspectNamespace({ keelId: first.keelId })).recordCount, 5);

  await assert.rejects(
    () => backend.prepareNamespace({ ...first, instanceId: 'agent-impostor' }),
    /identity collision/,
  );
});

test('keel inspection detects modified and incomplete chain bytes', async (context) => {
  const { root, backend } = await fixture(context);
  const first = preparation('agent-a');
  await backend.prepareNamespace(first);
  await backend.appendGenesis({ keelId: first.keelId, genesisId: first.genesisId, rows: genesisRows });
  const chainPath = join(root, first.keelId, 'chain.jsonl');
  const original = await readFile(chainPath, 'utf8');

  await writeFile(chainPath, original.replace('verify before claim', 'trust without proof'), 'utf8');
  await assert.rejects(() => backend.inspectNamespace({ keelId: first.keelId }), /digest mismatch/);

  await writeFile(chainPath, `${original}{"partial":`, 'utf8');
  await assert.rejects(() => backend.inspectNamespace({ keelId: first.keelId }), /incomplete keel record/);
});

test('checkpoint append uses compare-and-append and exact replay semantics', async (context) => {
  const { backend } = await fixture(context);
  const first = preparation('agent-a');
  await backend.prepareNamespace(first);
  const before = await backend.inspectNamespace({ keelId: first.keelId });
  const checkpoint = { kind: 'milestone', content: 'phase complete', sourceDigest: digest('a') };

  await assert.rejects(
    () => backend.appendCheckpoint({ keelId: first.keelId, expectedHeadDigest: digest('0'), checkpoint }),
    /head mismatch/,
  );
  const appended = await backend.appendCheckpoint({
    keelId: first.keelId,
    expectedHeadDigest: before.headDigest,
    checkpoint,
  });
  const replayed = await backend.appendCheckpoint({
    keelId: first.keelId,
    expectedHeadDigest: before.headDigest,
    checkpoint,
  });
  assert.equal(replayed.headDigest, appended.headDigest);
  assert.equal((await backend.inspectNamespace({ keelId: first.keelId })).recordCount, 2);
});

test('quarantined namespace refuses future writes', async (context) => {
  const { backend } = await fixture(context);
  const first = preparation('agent-a');
  await backend.prepareNamespace(first);
  await backend.quarantineNamespace({
    keelId: first.keelId,
    genesisId: first.genesisId,
    reasonDigest: digest('b'),
  });
  assert.equal((await backend.inspectNamespace({ keelId: first.keelId })).status, 'quarantined');
  await assert.rejects(
    () => backend.appendGenesis({ keelId: first.keelId, genesisId: first.genesisId, rows: genesisRows }),
    /quarantined/,
  );
});

test('keel state transition recovers an abandoned pending publication', async (context) => {
  const { root, backend } = await fixture(context);
  const first = preparation('agent-pending-state');
  await backend.prepareNamespace(first);
  const pendingPath = join(root, first.keelId, 'state.json.writing');
  await writeFile(pendingPath, '{"schemaVersion":1', 'utf8');

  await backend.quarantineNamespace({
    keelId: first.keelId,
    genesisId: first.genesisId,
    reasonDigest: digest('c'),
  });

  await assert.rejects(() => access(pendingPath), { code: 'ENOENT' });
  assert.equal((await backend.inspectNamespace({ keelId: first.keelId })).status, 'quarantined');
});

test('exclusive lock conflict is loud and does not mutate the chain', async (context) => {
  const { root, backend } = await fixture(context);
  const first = preparation('agent-a');
  await backend.prepareNamespace(first);
  const before = await backend.inspectNamespace({ keelId: first.keelId });
  await writeFile(join(root, first.keelId, '.lock'), 'held', 'utf8');

  await assert.rejects(
    () => backend.appendGenesis({ keelId: first.keelId, genesisId: first.genesisId, rows: genesisRows }),
    /locked/,
  );
  assert.equal((await backend.inspectNamespace({ keelId: first.keelId })).headDigest, before.headDigest);
});

test('backend rejects path escape before filesystem access', async (context) => {
  const { backend } = await fixture(context);
  await assert.rejects(() => backend.inspectNamespace({ keelId: '../outside' }), IntegrityError);
  await assert.rejects(() => backend.inspectNamespace({ keelId: 'keel-ABC' }), IntegrityError);
});

test('namespace preparation replaces uncommitted files when no identity commit marker exists', async (context) => {
  const { root, backend } = await fixture(context);
  const first = preparation('agent-a');
  const directory = join(root, first.keelId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'chain.jsonl'), '{"partial":', 'utf8');
  await writeFile(join(directory, 'state.json'), '{"partial":true}\n', 'utf8');

  const prepared = await backend.prepareNamespace(first);
  assert.equal(prepared.status, 'active');
  assert.equal(prepared.recordCount, 1);
  assert.equal(prepared.instanceId, 'agent-a');
});

test('one backend root refuses a second personal keel for the same persistent instance', async (context) => {
  const { backend } = await fixture(context);
  const first = preparation('agent-a', '1');
  const secondIdentity = identityFor('agent-a', 'a');
  const second = {
    ...secondIdentity,
    instanceId: 'agent-a',
    bedrock: {
      genesisId: secondIdentity.genesisId,
      instanceId: 'agent-a',
      genomeValueDigest: digest('5'),
    },
  };
  await backend.prepareNamespace(first);
  await assert.rejects(() => backend.prepareNamespace(second), /instance already owns another keel/);
  assert.equal((await backend.inspectNamespace({ keelId: first.keelId })).instanceId, 'agent-a');
});
