import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { admitLocalCreation, LocalAdmissionError } from '../src/genesis/local-admission.mjs';
import { runLocalAdmissionCli } from '../src/genesis/local-cli.mjs';
import { verifyGenesisReceipt } from '../src/genesis/verify.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const policyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const creationRoot = new URL('../fixtures/creation/', import.meta.url);
const fixedClock = () => '2026-08-29T12:00:00.000Z';

async function setup(context, suffix = '') {
  const root = await mkdtemp(join(tmpdir(), `godagent-local-admission-${suffix}`));
  context.after(() => rm(root, { recursive: true, force: true }));
  const creationDir = join(root, 'source-creation');
  const creation = await compileCreation({
    candidatePath: new URL('creation-candidate.json', creationRoot),
    policyPath: new URL('creation-policy.json', creationRoot),
    expectedPolicyDigest: policyDigest,
    expressionPath: new URL('expression-overlay.json', creationRoot),
    moduleDirectory: new URL('modules/', creationRoot),
    outputDir: creationDir,
  });
  const promptArtifactPath = join(root, 'prompt-os.md');
  const realmContractPath = join(root, 'realm-contract.json');
  await writeFile(
    promptArtifactPath,
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: local-admission.test.json -->\n# Local admission test\n',
    'utf8',
  );
  const realm = {
    schemaVersion: 1,
    realmId: 'local-admission-workbench',
    version: '1',
    trustModel: 'fixture-local',
    capabilities: ['filesystem.read', 'filesystem.write'],
    observations: [],
    hands: [],
    resources: { maxActionsPerCycle: 1 },
    privacy: { retention: 'test-only' },
    lifecycle: { entry: 'explicit', suspension: 'fail-closed', recovery: 'reconcile', exit: 'receipt-required' },
    compatibleDistributions: ['0.2.x'],
  };
  await writeFile(realmContractPath, `${canonicalJson(realm)}\n`, 'utf8');
  const workspace = join(root, 'workspace');
  const request = {
    creationDir,
    expectedPolicyDigest: policyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    promptArtifactPath,
    realmContractPath,
    workspace,
    instanceId: `local-agent${suffix || '-a'}`,
    creatorRef: 'creator:dom',
    checkpointPurpose: 'continue the declared work with Soul dormant',
    clock: fixedClock,
  };
  return { root, creation, realm, workspace, request, promptArtifactPath, realmContractPath };
}

test('local admission snapshots verified inputs and admits one inert persistent identity', async (context) => {
  const { request, creation, workspace } = await setup(context, '-happy');
  const { clock: _testClock, ...productionRequest } = request;
  const result = await admitLocalCreation(productionRequest);
  assert.deepEqual(Object.keys(result).sort(), [
    'creationBuildId', 'distributionBuildId', 'genesisId', 'keelId', 'receiptDigest', 'schemaVersion', 'status',
  ]);
  assert.equal(result.status, 'admitted');
  assert.equal(result.creationBuildId, creation.manifest.buildId);
  const admissionRoot = join(workspace, 'admission');
  const keelAdapter = createLocalKeelBackend({ root: join(admissionRoot, 'keels') });
  const receipt = await verifyGenesisReceipt({
    creationDir: join(admissionRoot, 'creation'),
    distributionDir: join(admissionRoot, 'distribution'),
    expectedPolicyDigest: policyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    instanceId: productionRequest.instanceId,
    creatorRef: productionRequest.creatorRef,
    transactionDir: join(admissionRoot, 'transaction'),
    journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
    snapshotPath: join(admissionRoot, 'vessel', 'snapshot.json'),
    keelAdapter,
    receiptPath: join(admissionRoot, 'transaction', 'genesis-receipt.json'),
  });
  assert.equal(receipt.receiptDigest, result.receiptDigest);
  assert.equal(receipt.soulPortDigest.length, 64);
});

test('source pins and incompatible Realm inputs fail before any workspace write', async (context) => {
  const { request, workspace, realm, realmContractPath } = await setup(context, '-preflight');
  await assert.rejects(
    () => admitLocalCreation({ ...request, expectedCreationBuildId: 'f'.repeat(64) }),
    (error) => error instanceof LocalAdmissionError && error.code === 'source-invalid',
  );
  await assert.rejects(() => access(workspace));

  await writeFile(realmContractPath, `${canonicalJson({ ...realm, capabilities: ['filesystem.read'] })}\n`, 'utf8');
  await assert.rejects(
    () => admitLocalCreation(request),
    (error) => error instanceof LocalAdmissionError && error.code === 'compatibility-invalid',
  );
  await assert.rejects(() => access(workspace));
});

test('an occupied workspace resumes only the exact bound admission', async (context) => {
  const { request, workspace, promptArtifactPath, realmContractPath } = await setup(context, '-binding');
  const first = await admitLocalCreation(request);
  const resumed = await admitLocalCreation(request);
  assert.deepEqual(resumed, first);
  const bindingPath = join(workspace, 'admission', 'binding.json');
  const bindingBefore = await readFile(bindingPath, 'utf8');
  for (const changed of [
    { ...request, instanceId: 'another-agent' },
    { ...request, creatorRef: 'creator:other' },
    { ...request, checkpointPurpose: 'a different purpose' },
  ]) {
    await assert.rejects(
      () => admitLocalCreation(changed),
      (error) => error instanceof LocalAdmissionError && error.code === 'workspace-occupied',
    );
  }
  await writeFile(promptArtifactPath, `${await readFile(promptArtifactPath, 'utf8')}changed\n`, 'utf8');
  await assert.rejects(
    () => admitLocalCreation(request),
    (error) => error instanceof LocalAdmissionError && error.code === 'workspace-occupied',
  );
  const realm = JSON.parse(await readFile(realmContractPath, 'utf8'));
  await writeFile(realmContractPath, `${canonicalJson({ ...realm, realmId: 'changed-workbench' })}\n`, 'utf8');
  await assert.rejects(
    () => admitLocalCreation(request),
    (error) => error instanceof LocalAdmissionError && error.code === 'workspace-occupied',
  );
  assert.equal(await readFile(bindingPath, 'utf8'), bindingBefore);
});

test('a junctioned admission subtree cannot redirect recovery writes outside the workspace', async (context) => {
  const { request, root, workspace } = await setup(context, '-junction');
  await admitLocalCreation(request);
  const outside = join(root, 'outside');
  await mkdir(outside);
  const transaction = join(workspace, 'admission', 'transaction');
  await rm(transaction, { recursive: true, force: true });
  await symlink(outside, transaction, 'junction');
  await assert.rejects(
    () => admitLocalCreation(request),
    (error) => error instanceof LocalAdmissionError && error.code === 'workspace-invalid',
  );
  assert.deepEqual(await readdir(outside), []);
  assert.deepEqual((await readdir(join(workspace, 'admission'))).sort(), [
    'binding.json', 'creation', 'distribution', 'keels', 'transaction', 'vessel',
  ]);
});

test('every genesis crash point resumes without duplicate journal or keel rows', async (context) => {
  const crashPoints = [
    'after-prepared',
    'after-keel-prepared',
    'after-journal-prepared',
    'after-journal-bound',
    'after-keel-bound',
    'after-mutually-bound',
    'after-receipt-written',
  ];
  for (const [index, crashAt] of crashPoints.entries()) {
    const { request, workspace } = await setup(context, `-crash-${index}`);
    await assert.rejects(() => admitLocalCreation({ ...request, crashAt }), new RegExp(crashAt));
    const resumed = await admitLocalCreation(request);
    const admissionRoot = join(workspace, 'admission');
    const journal = await readVerifiedJournal(join(admissionRoot, 'vessel', 'journal.jsonl'));
    assert.equal(journal.events.filter((row) => row.eventType === 'vessel.created').length, 1);
    assert.equal(journal.events.filter((row) => row.eventType === 'genesis.bound').length, 1);
    const keel = await createLocalKeelBackend({ root: join(admissionRoot, 'keels'), clock: fixedClock })
      .inspectNamespace({ keelId: resumed.keelId });
    assert.equal(keel.recordCount, 6);
  }
});

test('local admission has no runtime, provider, host, Realm-action, evolution, or Soul activation import', async () => {
  const source = await readFile(new URL('../src/genesis/local-admission.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    '../runtime/',
    '../cortex/',
    '../host/',
    '../realm/',
    '../evolution/',
    '../soul/',
  ]) assert.doesNotMatch(source, new RegExp(forbidden.replaceAll('/', '\\/')));
});

test('the real local CLI service emits one bounded canonical admission projection', async (context) => {
  const { request } = await setup(context, '-real-cli');
  let stdout = '';
  let stderr = '';
  const exitCode = await runLocalAdmissionCli({
    argv: [
      '--creation-dir', request.creationDir,
      '--policy-digest', request.expectedPolicyDigest,
      '--expected-creation-build-id', request.expectedCreationBuildId,
      '--prompt-os-artifact', request.promptArtifactPath,
      '--realm-contract', request.realmContractPath,
      '--workspace', request.workspace,
      '--instance-id', request.instanceId,
      '--creator', request.creatorRef,
      '--checkpoint-purpose', request.checkpointPurpose,
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
  });
  assert.equal(exitCode, 0);
  assert.equal(stderr, '');
  const value = JSON.parse(stdout);
  assert.equal(stdout, `${canonicalJson(value)}\n`);
  assert.deepEqual(Object.keys(value).sort(), [
    'creationBuildId', 'distributionBuildId', 'genesisId', 'keelId', 'receiptDigest', 'schemaVersion', 'status',
  ]);
});
