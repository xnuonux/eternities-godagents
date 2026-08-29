import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { compileDistribution } from '../src/foundry/compile.mjs';
import { prepareGenesis } from '../src/genesis/coordinator.mjs';
import { verifyGenesisReceipt } from '../src/genesis/verify.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const creationRoot = new URL('../fixtures/creation/', import.meta.url);
const clock = () => '2026-08-29T10:00:00.000Z';

async function fixture(context, suffix = '') {
  const root = await mkdtemp(join(tmpdir(), `godagent-genesis-${suffix}`));
  context.after(() => rm(root, { recursive: true, force: true }));
  const creationDir = join(root, 'creation');
  const distributionDir = join(root, 'distribution');
  const realmPath = join(root, 'realm-contract.json');
  const promptPath = join(root, 'prompt-os-artifact.md');
  const creation = await compileCreation({
    candidatePath: new URL('creation-candidate.json', creationRoot),
    policyPath: new URL('creation-policy.json', creationRoot),
    expectedPolicyDigest,
    expressionPath: new URL('expression-overlay.json', creationRoot),
    moduleDirectory: new URL('modules/', creationRoot),
    outputDir: creationDir,
  });
  const realm = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));
  realm.capabilities = [...realm.capabilities, 'filesystem.read', 'filesystem.write'];
  await writeFile(realmPath, `${canonicalJson(realm)}\n`, 'utf8');
  await writeFile(
    promptPath,
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: fixture.receipt.json -->\n# Genesis fixture\n',
    'utf8',
  );
  await compileDistribution({
    genomePath: join(creationDir, 'agent-genome.json'),
    promptArtifactPath: promptPath,
    realmContractPath: realmPath,
    outputDir: distributionDir,
  });
  const transactionDir = join(root, 'transaction');
  const journalPath = join(root, 'vessel', 'journal.jsonl');
  const snapshotPath = join(root, 'vessel', 'snapshot.json');
  const keelRoot = join(root, 'keels');
  const keelAdapter = createLocalKeelBackend({ root: keelRoot, clock });
  const request = {
    creationDir,
    distributionDir,
    expectedPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    instanceId: 'agent-a',
    creatorRef: 'creator:dom',
    transactionDir,
    journalPath,
    snapshotPath,
    keelAdapter,
    clock,
    initialCheckpoint: {
      purpose: 'serve the declared mission',
      constraints: ['Soul remains dormant', 'verify before claim'],
      carry: ['first wake pending'],
    },
  };
  return { root, creation, request, keelRoot, transactionDir, journalPath };
}

test('transactional genesis binds creation, distribution, journal, and isolated keel before admission', async (context) => {
  const { request, journalPath } = await fixture(context, 'happy-');
  const result = await prepareGenesis(request);

  assert.equal(result.status, 'admitted');
  assert.equal(result.genesisReceipt.status, 'admitted');
  assert.equal(result.genesisReceipt.creationBuildId, request.expectedCreationBuildId);
  assert.notEqual(result.genesisReceipt.genomeValueDigest, result.genesisReceipt.genomeContentDigest);
  const journal = await readVerifiedJournal(journalPath);
  assert.deepEqual(journal.events.map((event) => event.eventType), [
    'genesis.prepared',
    'vessel.created',
    'genesis.bound',
  ]);
  const keel = await request.keelAdapter.inspectNamespace({ keelId: result.genesisReceipt.keelId });
  assert.equal(keel.recordCount, 6);
  assert.equal(keel.records[0].kind, 'bedrock');
  assert.equal(keel.records.at(-1).kind, 'binding');
  assert.equal(keel.headDigest, result.genesisReceipt.keelHeadDigest);
  assert.equal(journal.lastDigest, result.genesisReceipt.journalHeadDigest);

  const verified = await verifyGenesisReceipt({
    ...request,
    receiptPath: result.receiptPath,
  });
  assert.equal(verified.receiptDigest, result.genesisReceipt.receiptDigest);
});

test('missing or wrong external pins fail before any genesis storage is written', async (context) => {
  const { request, transactionDir, keelRoot } = await fixture(context, 'pins-');
  await assert.rejects(
    () => prepareGenesis({ ...request, expectedCreationBuildId: 'f'.repeat(64) }),
    /creation build id pin mismatch/,
  );
  await assert.rejects(
    () => prepareGenesis({ ...request, expectedPolicyDigest: undefined }),
    /policy digest pin is required/,
  );
  await assert.rejects(() => access(transactionDir));
  await assert.rejects(() => access(keelRoot));
});

test('every durable crash boundary resumes exactly once without admitting partial genesis', async (context) => {
  const boundaries = [
    'after-prepared',
    'after-keel-prepared',
    'after-journal-prepared',
    'after-journal-bound',
    'after-keel-bound',
    'after-mutually-bound',
    'after-receipt-written',
  ];
  for (const [index, crashAt] of boundaries.entries()) {
    const { request, journalPath } = await fixture(context, `crash-${index}-`);
    await assert.rejects(() => prepareGenesis({ ...request, crashAt }), new RegExp(crashAt));
    const resumed = await prepareGenesis(request);
    assert.equal(resumed.status, 'admitted');
    const journal = await readVerifiedJournal(journalPath);
    assert.equal(journal.events.filter((event) => event.eventType === 'vessel.created').length, 1);
    assert.equal(journal.events.filter((event) => event.eventType === 'genesis.bound').length, 1);
    const keel = await request.keelAdapter.inspectNamespace({ keelId: resumed.genesisReceipt.keelId });
    assert.equal(keel.recordCount, 6);
  }
});

test('receipt verification detects journal, keel, receipt, and transaction-state tampering', async (context) => {
  const { request, journalPath, keelRoot, transactionDir } = await fixture(context, 'tamper-');
  const admitted = await prepareGenesis(request);
  const verification = () => verifyGenesisReceipt({ ...request, receiptPath: admitted.receiptPath });

  const journalBytes = await readFile(journalPath, 'utf8');
  await writeFile(journalPath, journalBytes.replace('serve the declared mission', 'serve an altered mission'), 'utf8');
  await assert.rejects(verification, /journal digest mismatch/);
  await writeFile(journalPath, journalBytes, 'utf8');

  const chainPath = join(keelRoot, admitted.genesisReceipt.keelId, 'chain.jsonl');
  const chainBytes = await readFile(chainPath, 'utf8');
  await writeFile(chainPath, chainBytes.replace('verify before claim', 'trust without proof'), 'utf8');
  await assert.rejects(verification, /keel digest mismatch/);
  await writeFile(chainPath, chainBytes, 'utf8');

  const receiptBytes = await readFile(admitted.receiptPath, 'utf8');
  const receipt = JSON.parse(receiptBytes);
  await writeFile(admitted.receiptPath, `${canonicalJson({ ...receipt, journalHeadDigest: 'f'.repeat(64) })}\n`, 'utf8');
  await assert.rejects(verification, /receipt digest mismatch/);
  await writeFile(admitted.receiptPath, receiptBytes, 'utf8');

  const statePath = join(transactionDir, 'genesis-state.json');
  const stateBytes = await readFile(statePath, 'utf8');
  const state = JSON.parse(stateBytes);
  await writeFile(statePath, `${canonicalJson({ ...state, evidence: { receiptDigest: 'e'.repeat(64) } })}\n`, 'utf8');
  await assert.rejects(verification, /state digest mismatch/);
});
