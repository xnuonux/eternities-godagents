import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { compileDistribution } from '../src/foundry/compile.mjs';
import { prepareGenesis } from '../src/genesis/coordinator.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createPersistentVessel } from '../src/runtime/persistent-vessel.mjs';

const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const creationRoot = new URL('../fixtures/creation/', import.meta.url);
const fixedNow = '2026-08-29T10:00:00.000Z';
const clock = () => fixedNow;

const hostContext = {
  permittedEffects: ['local-read', 'local-write'],
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  availablePreconditions: ['realm-present', 'realm-observed'],
  forbiddenCapabilities: [],
  maximumRisk: 'moderate',
  minimumEvidenceConfidence: 'verified',
  contextBudget: 4000,
  maxCompositionSize: 3,
};

const mission = (requestId) => ({
  requestId,
  text: 'increment the fixture counter once',
  authority: ['realm:write'],
  hostContext,
});

function allowedCortex(claim) {
  return Object.freeze({
    adapterId: 'openai-compatible',
    async infer({ missionId, observation, stateEpoch, now }) {
      return {
        schemaVersion: 1,
        proposalId: `openai-compatible:${claim}:${missionId}:${stateEpoch}`,
        organId: 'openai-compatible',
        organVersion: '1',
        sourceStateEpoch: stateEpoch,
        claim,
        evidenceRefs: [observation.observationId],
        intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
        expectedOutcome: { counter: observation.counter + 1 },
        cost: 1,
        risk: 'low',
        uncertainty: 'verified-fixture',
        requiredAuthority: ['realm:write'],
        preconditions: ['realm-observed'],
        expiresAt: new Date(Date.parse(now) + 60_000).toISOString(),
        priority: 10,
      };
    },
  });
}

async function noQualifiedTransport(request) {
  return {
    compilerReceipt: {
      schemaVersion: 1,
      requestId: request.requestId,
      requestDigest: 'a'.repeat(64),
      textDigest: 'b'.repeat(64),
      requestedEffects: ['local-read', 'local-write'],
      unresolvedDecisions: [],
      envelope: {
        schemaVersion: 1,
        requestId: request.requestId,
        outcome: request.text,
        candidateFamilies: [],
        requiredCapabilities: ['unresolved-intent'],
        forbiddenCapabilities: request.context.forbiddenCapabilities,
        permittedEffects: request.context.permittedEffects,
        availableAuthority: request.context.availableAuthority,
        availablePreconditions: request.context.availablePreconditions,
        maximumRisk: request.context.maximumRisk,
        minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
        contextBudget: request.context.contextBudget,
        maxCompositionSize: request.context.maxCompositionSize,
        unresolvedDecisions: [],
      },
      proofLimits: ['fixture-and-contract-evidence-only'],
    },
    routeReceipt: {
      schemaVersion: 1,
      requestId: request.requestId,
      requestDigest: 'c'.repeat(64),
      status: 'no-qualified-route',
      selectionKind: 'none',
      requestFeatures: {
        candidateFamilies: [],
        requiredCapabilities: ['unresolved-intent'],
        permittedEffects: request.context.permittedEffects,
        maximumRisk: request.context.maximumRisk,
        minimumEvidenceConfidence: request.context.minimumEvidenceConfidence,
        contextBudget: request.context.contextBudget,
      },
      candidateIds: [],
      selectedIds: [],
      selectedEntrypoints: [],
      selectionConfidence: null,
      rejected: [],
      unresolvedDecisions: [],
      decisionPolicy: 'coverage>card-count>extra-capabilities>effects>context>dependencies>evidence>id',
    },
  };
}

async function fixture(context, suffix) {
  const root = await mkdtemp(join(tmpdir(), `godagent-persistent-${suffix}`));
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
  const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));
  contract.capabilities = [...contract.capabilities, 'filesystem.read', 'filesystem.write'];
  await writeFile(realmPath, `${canonicalJson(contract)}\n`, 'utf8');
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
      constraints: ['Soul remains dormant'],
      carry: ['first wake pending'],
    },
  };
  const realm = createFixtureRealm({ contract });
  const runtime = {
    cortex: allowedCortex('first cortex'),
    realm,
    godskillsTransport: noQualifiedTransport,
    clock,
  };
  return { root, request, runtime, realm, keelRoot };
}

test('partial genesis cannot construct a persistent runnable vessel', async (context) => {
  const { request, runtime } = await fixture(context, 'partial-');
  await assert.rejects(() => prepareGenesis({ ...request, crashAt: 'after-journal-prepared' }), /after-journal-prepared/);
  await assert.rejects(
    () => createPersistentVessel({
      genesis: { ...request, receiptPath: join(request.transactionDir, 'genesis-receipt.json') },
      runtime,
      keelAdapter: request.keelAdapter,
    }),
    /ENOENT|not admitted/,
  );
  assert.equal(runtime.realm.inspect().invocationCount, 0);
});

test('admitted wrapper wakes both chains before running a mission', async (context) => {
  const { request, runtime, realm } = await fixture(context, 'mission-');
  const admitted = await prepareGenesis(request);
  const vessel = await createPersistentVessel({
    genesis: { ...request, receiptPath: admitted.receiptPath },
    runtime,
    keelAdapter: request.keelAdapter,
  });
  const result = await vessel.runCycle(mission('mission-1'));
  const inspected = vessel.inspect();
  assert.equal(result.status, 'completed');
  assert.equal(realm.inspect().counter, 1);
  assert.equal(inspected.persistent, true);
  assert.equal(inspected.genesisId, admitted.genesisReceipt.genesisId);
  assert.equal(inspected.keelId, admitted.genesisReceipt.keelId);
  assert.deepEqual(inspected.soulPort, { schemaVersion: 1, status: 'dormant' });
});

test('keel tampering after construction blocks the next mission before Realm invocation', async (context) => {
  const { request, runtime, keelRoot, realm } = await fixture(context, 'tamper-');
  const admitted = await prepareGenesis(request);
  const vessel = await createPersistentVessel({
    genesis: { ...request, receiptPath: admitted.receiptPath },
    runtime,
    keelAdapter: request.keelAdapter,
  });
  const chainPath = join(keelRoot, admitted.genesisReceipt.keelId, 'chain.jsonl');
  const chain = await readFile(chainPath, 'utf8');
  await writeFile(chainPath, chain.replace('Soul remains dormant', 'Soul is active'), 'utf8');
  await assert.rejects(() => vessel.runCycle(mission('mission-blocked')), /keel digest mismatch/);
  assert.equal(realm.inspect().invocationCount, 0);
});

test('cortex replacement preserves all non-cortex identity and continuity', async (context) => {
  const { request, runtime, realm } = await fixture(context, 'replace-');
  const admitted = await prepareGenesis(request);
  const first = await createPersistentVessel({
    genesis: { ...request, receiptPath: admitted.receiptPath },
    runtime,
    keelAdapter: request.keelAdapter,
  });
  await first.runCycle(mission('mission-1'));
  const before = first.inspect();
  const second = await first.replaceCortex(allowedCortex('second cortex'));
  const after = second.inspect();
  await second.runCycle(mission('mission-2'));

  for (const field of ['instanceId', 'genesisId', 'keelId', 'creationBuildId', 'distributionBuildId', 'genomeValueDigest', 'genomeContentDigest', 'constitutionDigest']) {
    assert.equal(after[field], before[field]);
  }
  assert.equal(second.inspect().epoch, 2);
  assert.equal(realm.inspect().counter, 2);
});

test('distribution substitution between wake verification and vessel construction fails closed', async (context) => {
  const { request, runtime } = await fixture(context, 'substitution-');
  const admitted = await prepareGenesis(request);
  const realAdapter = request.keelAdapter;
  let substituted = false;
  const substitutingAdapter = Object.freeze({
    ...realAdapter,
    async inspectNamespace(input) {
      const inspected = await realAdapter.inspectNamespace(input);
      if (!substituted) {
        substituted = true;
        const genomePath = join(request.distributionDir, 'agent-genome.json');
        const manifestPath = join(request.distributionDir, 'distribution-manifest.json');
        const genome = JSON.parse(await readFile(genomePath, 'utf8'));
        genome.constitution.principles = ['substituted after verification'];
        const genomeBytes = `${canonicalJson(genome)}\n`;
        await writeFile(genomePath, genomeBytes, 'utf8');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        manifest.artifacts.find((row) => row.path === 'agent-genome.json').sha256 = sha256Text(genomeBytes);
        await writeFile(manifestPath, `${canonicalJson(manifest)}\n`, 'utf8');
      }
      return inspected;
    },
  });

  const vessel = await createPersistentVessel({
    genesis: { ...request, receiptPath: admitted.receiptPath },
    runtime,
    keelAdapter: substitutingAdapter,
  });
  assert.equal(vessel.inspect().constitutionDigest, admitted.genesisReceipt.constitutionDigest);
  await assert.rejects(() => vessel.runCycle(mission('substitution-blocked')), /distribution.*mismatch/);
  assert.equal(runtime.realm.inspect().invocationCount, 0);
});
