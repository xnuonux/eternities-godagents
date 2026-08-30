import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acceptedProposal } from '../src/cortex/result.mjs';
import { compileDistribution } from '../src/foundry/compile.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createVessel } from '../src/runtime/vessel.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const now = '2026-08-30T08:00:00.000Z';
const fixture = (name) => new URL(`../fixtures/${name}`, import.meta.url);
const realmContract = JSON.parse(await readFile(fixture('realm-contract.json'), 'utf8'));
const methodEnvelope = Object.freeze({
  protocolId: 'eternities-godskills-adapter-v1',
  sourceEnvelopeDigest: 'a'.repeat(64),
  releaseDigest: 'b'.repeat(64),
  stackDigest: 'c'.repeat(64),
  selectedCapabilities: [], methods: [], evidenceRequirements: [], proposalRequirements: [],
  riskObligations: [], preconditionObligations: [], terminationConditions: [], selectedPackages: [],
  authorityProjection: {
    availableAuthority: ['realm:write'], permittedEffects: ['local-read', 'local-write'],
    availablePreconditions: ['realm-observed'], maximumRisk: 'moderate',
    minimumEvidenceConfidence: 'verified', contextBudget: 4000,
  },
});
const receipt = Object.freeze({
  schemaVersion: 1,
  protocolId: 'eternities-godskills-adapter-v1',
  requestId: 'mission-order',
  sourceEnvelopeDigest: 'a'.repeat(64),
  releaseDigest: 'b'.repeat(64),
  routerReceiptDigest: 'd'.repeat(64),
  selectionStatus: 'no-qualified-route',
  selected: [],
  authorityCeilingDigest: 'e'.repeat(64),
  stackDigest: 'c'.repeat(64),
  packageDigest: 'f'.repeat(64),
});

async function paths(t, suffix) {
  const root = await mkdtemp(join(tmpdir(), `godskills-order-${suffix}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  const genome = JSON.parse(await readFile(fixture('agent-genome.json'), 'utf8'));
  genome.cortex.allowedAdapters = ['ordered-cortex'];
  const genomePath = join(root, 'genome.json');
  await writeFile(genomePath, `${JSON.stringify(genome, null, 2)}\n`);
  const distributionDir = join(root, 'distribution');
  await compileDistribution({
    genomePath,
    promptArtifactPath: fixture('prompt-os-artifact.md'),
    realmContractPath: fixture('realm-contract.json'),
    outputDir: distributionDir,
  });
  return { distributionDir, journalPath: join(root, 'events.jsonl'), snapshotPath: join(root, 'snapshot.json') };
}

function mission(requestId = 'mission-order') {
  return {
    requestId,
    text: 'increment once with bounded method',
    authority: ['realm:write'],
    hostContext: {
      permittedEffects: ['local-read', 'local-write'],
      availableAuthority: ['realm:write'],
      availablePreconditions: ['realm-observed'],
      forbiddenCapabilities: [], maximumRisk: 'moderate', minimumEvidenceConfidence: 'verified',
      contextBudget: 4000, maxCompositionSize: 3,
    },
  };
}

function adapter({ unresolved = false } = {}) {
  let binds = 0;
  let rehydrates = 0;
  return {
    get bindCount() { return binds; },
    get rehydrateCount() { return rehydrates; },
    async bindMission() {
      binds += 1;
      if (unresolved) return { status: 'needs-decision', unresolvedDecisions: ['effect'], receipt: null, cortexPackage: null };
      return { status: 'no-qualified-route', receipt, cortexPackage: methodEnvelope };
    },
    async rehydrateMission({ receipt: supplied }) {
      rehydrates += 1;
      assert.equal(supplied.packageDigest, receipt.packageDigest);
      return { status: 'no-qualified-route', receipt: supplied, cortexPackage: methodEnvelope };
    },
  };
}

function cortex(isBound) {
  let prepares = 0;
  return {
    adapterId: 'ordered-cortex',
    get prepareCount() { return prepares; },
    prepare(context, attempt) {
      prepares += 1;
      assert.equal(isBound(), true);
      assert.equal(context.methodEnvelope, methodEnvelope);
      const metadata = {
        attemptId: attempt.attemptId, ordinal: attempt.ordinal, adapterId: 'ordered-cortex',
        profile: 'fixture', modelId: 'fixture', requestDigest: '1'.repeat(64),
      };
      return {
        metadata,
        async execute() {
          return acceptedProposal({
            schemaVersion: 1, proposalId: `${attempt.attemptId}:proposal`, organId: 'ordered-cortex', organVersion: '1',
            sourceStateEpoch: context.stateEpoch, claim: 'advance once', evidenceRefs: [context.observation.observationId],
            intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
            expectedOutcome: { counter: context.observation.counter + 1 }, cost: 1, risk: 'low', uncertainty: 'fixture',
            requiredAuthority: ['realm:write'], preconditions: ['realm-observed'], expiresAt: '2026-08-30T08:01:00.000Z', priority: 10,
          }, { ...metadata, responseDigest: '2'.repeat(64), usage: { inputTokens: 1, outputTokens: 1 } });
        },
      };
    },
  };
}

const inferencePolicy = {
  maxAttempts: 1, retryableReasonCodes: [], hostPolicyId: 'ordered-policy', hostPolicyDigest: '3'.repeat(64),
  maxCompletionTokens: 32, maxCycleCompletionTokens: 32,
};

test('journals a body-free Godskills binding before cortex inference and constitutional decision', async (t) => {
  const runtime = await paths(t, 'cycle');
  const godskillsAdapter = adapter();
  const vesselCortex = cortex(() => godskillsAdapter.bindCount === 1);
  const vessel = await createVessel({
    ...runtime, instanceId: 'ordered-cycle', cortex: vesselCortex,
    realm: createFixtureRealm({ contract: realmContract }), godskillsAdapter,
    clock: () => now, inferencePolicy,
  });
  const result = await vessel.runCycle(mission());
  const journal = await readVerifiedJournal(runtime.journalPath);
  const events = journal.events.map(({ eventType }) => eventType);
  const ordered = ['mission.admitted', 'realm.observed', 'godskills.bound', 'cortex.requested', 'cortex.accepted', 'proposal.collected', 'decision.committed'];
  for (let index = 1; index < ordered.length; index += 1) assert.ok(events.indexOf(ordered[index - 1]) < events.indexOf(ordered[index]));
  assert.equal(result.status, 'completed');
  assert.equal(JSON.stringify(journal.events.find(({ eventType }) => eventType === 'godskills.bound')).includes('selectedPackages'), false);
});

test('unresolved routing aborts without preparing the cortex', async (t) => {
  const runtime = await paths(t, 'unresolved');
  const godskillsAdapter = adapter({ unresolved: true });
  const vesselCortex = cortex(() => false);
  const vessel = await createVessel({
    ...runtime, instanceId: 'ordered-unresolved', cortex: vesselCortex,
    realm: createFixtureRealm({ contract: realmContract }), godskillsAdapter,
    clock: () => now, inferencePolicy,
  });
  const result = await vessel.runCycle(mission('mission-unresolved'));
  assert.equal(result.status, 'failed');
  assert.equal(vesselCortex.prepareCount, 0);
});

test('recovery after durable binding rehydrates the exact package without rerouting', async (t) => {
  const runtime = await paths(t, 'recovery');
  const godskillsAdapter = adapter();
  const realm = createFixtureRealm({ contract: realmContract });
  const first = await createVessel({
    ...runtime, instanceId: 'ordered-recovery', cortex: cortex(() => true), realm, godskillsAdapter,
    clock: () => now, inferencePolicy, crashAt: 'godskills-binding',
  });
  await assert.rejects(first.runCycle(mission()), /injected crash after godskills-binding/);
  assert.equal(godskillsAdapter.bindCount, 1);

  const recoveredCortex = cortex(() => godskillsAdapter.rehydrateCount === 1);
  const second = await createVessel({
    ...runtime, instanceId: 'ordered-recovery', cortex: recoveredCortex, realm, godskillsAdapter,
    clock: () => now, inferencePolicy,
  });
  await second.recover();
  assert.equal(godskillsAdapter.bindCount, 1);
  assert.equal(godskillsAdapter.rehydrateCount, 1);
  assert.equal(realm.inspect().counter, 1);
});

test('bound vessels reject a bare transport while explicit unbound operation stays unchanged', async (t) => {
  const rejectedRuntime = await paths(t, 'bare-transport');
  await assert.rejects(() => createVessel({
    ...rejectedRuntime,
    instanceId: 'bare-transport',
    cortex: cortex(() => false),
    realm: createFixtureRealm({ contract: realmContract }),
    godskillsTransport: async () => ({}),
    clock: () => now,
    inferencePolicy,
  }), /verified Godskills adapter/i);

  const runtime = await paths(t, 'unbound');
  let observedEnvelope = 'not-called';
  const unboundCortex = {
    adapterId: 'ordered-cortex',
    prepare(context, attempt) {
      observedEnvelope = context.methodEnvelope;
      const metadata = {
        attemptId: attempt.attemptId, ordinal: attempt.ordinal, adapterId: 'ordered-cortex',
        profile: 'fixture', modelId: 'fixture', requestDigest: '1'.repeat(64),
      };
      return {
        metadata,
        async execute() {
          return acceptedProposal({
            schemaVersion: 1, proposalId: `${attempt.attemptId}:proposal`, organId: 'ordered-cortex', organVersion: '1',
            sourceStateEpoch: context.stateEpoch, claim: 'advance once', evidenceRefs: [context.observation.observationId],
            intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
            expectedOutcome: { counter: context.observation.counter + 1 }, cost: 1, risk: 'low', uncertainty: 'fixture',
            requiredAuthority: ['realm:write'], preconditions: ['realm-observed'], expiresAt: '2026-08-30T08:01:00.000Z', priority: 10,
          }, { ...metadata, responseDigest: '2'.repeat(64), usage: { inputTokens: 1, outputTokens: 1 } });
        },
      };
    },
  };
  const vessel = await createVessel({
    ...runtime,
    instanceId: 'explicit-unbound',
    cortex: unboundCortex,
    realm: createFixtureRealm({ contract: realmContract }),
    godskillsAdapter: false,
    clock: () => now,
    inferencePolicy,
  });
  assert.equal((await vessel.runCycle(mission('mission-unbound'))).status, 'completed');
  assert.equal(observedEnvelope, undefined);
  const journal = await readVerifiedJournal(runtime.journalPath);
  assert.equal(journal.events.some(({ eventType }) => eventType === 'godskills.bound'), false);
});
