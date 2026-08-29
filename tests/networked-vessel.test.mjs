import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acceptedProposal, failedInference } from '../src/cortex/result.mjs';
import { compileDistribution } from '../src/foundry/compile.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createVessel } from '../src/runtime/vessel.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const fixedNow = '2026-08-29T12:00:00.000Z';
const fixturePath = (name) => new URL(`../fixtures/${name}`, import.meta.url);
const contract = JSON.parse(await readFile(fixturePath('realm-contract.json'), 'utf8'));

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

const inferencePolicy = {
  maxAttempts: 2,
  retryableReasonCodes: ['timeout', 'connect-failed', 'rate-limited', 'transient-server'],
  hostPolicyId: 'networked-test-policy',
  hostPolicyDigest: 'f'.repeat(64),
  maxCompletionTokens: 128,
  maxCycleCompletionTokens: 256,
};

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
        forbiddenCapabilities: [],
        permittedEffects: ['local-read', 'local-write'],
        availableAuthority: ['local-read', 'local-write', 'realm:write'],
        availablePreconditions: ['realm-present', 'realm-observed'],
        maximumRisk: 'moderate',
        minimumEvidenceConfidence: 'verified',
        contextBudget: 4000,
        maxCompositionSize: 3,
        unresolvedDecisions: [],
      },
      proofLimits: ['fixture-only'],
    },
    routeReceipt: {
      schemaVersion: 1,
      requestId: request.requestId,
      requestDigest: 'c'.repeat(64),
      status: 'no-qualified-route',
      selectionKind: 'none',
      requestFeatures: {
        candidateFamilies: [], requiredCapabilities: [], permittedEffects: ['local-read', 'local-write'],
        maximumRisk: 'moderate', minimumEvidenceConfidence: 'verified', contextBudget: 4000,
      },
      candidateIds: [], selectedIds: [], selectedEntrypoints: [], selectionConfidence: null,
      rejected: [], unresolvedDecisions: [], decisionPolicy: 'fixture',
    },
  };
}

async function workspace(t, name) {
  const root = await mkdtemp(join(tmpdir(), `godagent-networked-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  const genome = JSON.parse(await readFile(fixturePath('agent-genome.json'), 'utf8'));
  genome.blueprint = { id: 'networked-fixture-agent', version: '0.2.0' };
  genome.cortex.allowedAdapters = ['networked-test'];
  const genomePath = join(root, 'agent-genome.json');
  await writeFile(genomePath, `${JSON.stringify(genome, null, 2)}\n`, 'utf8');
  const distributionDir = join(root, 'distribution');
  await compileDistribution({
    genomePath,
    promptArtifactPath: fixturePath('prompt-os-artifact.md'),
    realmContractPath: fixturePath('realm-contract.json'),
    outputDir: distributionDir,
  });
  return {
    distributionDir,
    journalPath: join(root, 'events.jsonl'),
    snapshotPath: join(root, 'snapshot.json'),
  };
}

function networkedCortex(script) {
  let executions = 0;
  return {
    adapterId: 'networked-test',
    profile: 'test-json',
    get executionCount() { return executions; },
    prepare(context, attempt) {
      const metadata = {
        attemptId: attempt.attemptId,
        ordinal: attempt.ordinal,
        adapterId: 'networked-test',
        profile: 'test-json',
        modelId: 'test-model',
        requestDigest: String(attempt.ordinal).repeat(64),
      };
      return {
        metadata,
        async execute() {
          const next = script[executions] ?? 'unexpected-extra-inference';
          executions += 1;
          if (next !== 'accepted') return failedInference(next, metadata);
          return acceptedProposal({
            schemaVersion: 1,
            proposalId: `${attempt.attemptId}:proposal`,
            organId: 'networked-test',
            organVersion: '1',
            sourceStateEpoch: context.stateEpoch,
            claim: 'advance once',
            evidenceRefs: [context.observation.observationId],
            intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
            expectedOutcome: { counter: context.observation.counter + 1 },
            cost: 1,
            risk: 'low',
            uncertainty: 'fixture',
            requiredAuthority: ['realm:write'],
            preconditions: ['realm-observed'],
            expiresAt: '2026-08-29T12:01:00.000Z',
            priority: 10,
          }, { ...metadata, responseDigest: 'a'.repeat(64), usage: { inputTokens: 3, outputTokens: 5 } });
        },
      };
    },
  };
}

function mission(requestId) {
  return { requestId, text: 'increment once', authority: ['realm:write'], hostContext };
}

async function vesselOptions(t, name, cortex, realm, extra = {}) {
  return {
    ...(await workspace(t, name)),
    instanceId: `instance-${name}`,
    cortex,
    realm,
    godskillsTransport: noQualifiedTransport,
    clock: () => fixedNow,
    inferencePolicy,
    ...extra,
  };
}

test('networked vessel retries a timeout and performs one governed Realm action', async (t) => {
  const realm = createFixtureRealm({ contract });
  const cortex = networkedCortex(['timeout', 'accepted']);
  const options = await vesselOptions(t, 'retry', cortex, realm);
  const vessel = await createVessel(options);

  const result = await vessel.runCycle(mission('mission-retry'));
  const journal = await readVerifiedJournal(options.journalPath);

  assert.equal(result.status, 'completed');
  assert.equal(realm.inspect().counter, 1);
  assert.equal(cortex.executionCount, 2);
  assert.deepEqual(journal.events.filter((event) => event.eventType.startsWith('cortex.')).map((event) => event.eventType), [
    'cortex.requested', 'cortex.failed', 'cortex.requested', 'cortex.accepted',
  ]);
});

test('terminal cortex failure aborts the cycle before decision or Realm invocation', async (t) => {
  const realm = createFixtureRealm({ contract });
  const cortex = networkedCortex(['authentication']);
  const options = await vesselOptions(t, 'failure', cortex, realm);
  const vessel = await createVessel(options);

  const result = await vessel.runCycle(mission('mission-failure'));
  const journal = await readVerifiedJournal(options.journalPath);

  assert.equal(result.status, 'failed');
  assert.equal(result.inference.reasonCode, 'authentication');
  assert.equal(realm.inspect().invocationCount, 0);
  assert.equal(journal.events.some((event) => event.eventType === 'decision.committed'), false);
  assert.equal(vessel.inspect().status, 'idle');
});

test('recovery after durable cortex acceptance reuses the proposal without reinference', async (t) => {
  const realm = createFixtureRealm({ contract });
  const cortex = networkedCortex(['accepted']);
  const options = await vesselOptions(t, 'accepted-crash', cortex, realm, { crashAt: 'cortex-accepted' });
  const vessel = await createVessel(options);

  await assert.rejects(() => vessel.runCycle(mission('mission-accepted-crash')), /injected crash/);
  assert.equal(cortex.executionCount, 1);
  const recoveredVessel = await createVessel({ ...options, crashAt: null });
  const recovered = await recoveredVessel.recover();

  assert.equal(recovered.status, 'idle');
  assert.equal(cortex.executionCount, 1);
  assert.equal(realm.inspect().counter, 1);
});

test('recovery after durable request uses the next bounded attempt ordinal', async (t) => {
  const realm = createFixtureRealm({ contract });
  const cortex = networkedCortex(['accepted']);
  const options = await vesselOptions(t, 'requested-crash', cortex, realm, { crashAt: 'cortex-requested' });
  const vessel = await createVessel(options);

  await assert.rejects(() => vessel.runCycle(mission('mission-requested-crash')), /injected crash/);
  assert.equal(cortex.executionCount, 0);
  const recoveredVessel = await createVessel({ ...options, crashAt: null });
  await recoveredVessel.recover();
  const journal = await readVerifiedJournal(options.journalPath);
  const ordinals = journal.events
    .filter((event) => event.eventType === 'cortex.requested')
    .map((event) => event.payload.inference.ordinal);

  assert.deepEqual(ordinals, [1, 2]);
  assert.equal(cortex.executionCount, 1);
  assert.equal(realm.inspect().counter, 1);
});
