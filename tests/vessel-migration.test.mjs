import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createFixtureCortexA, createFixtureCortexB } from '../src/runtime/fixture-cortex.mjs';
import { createVessel } from '../src/runtime/vessel.mjs';
import { createDormantSoulPort } from '../src/soul/dormant-port.mjs';

const distributionDir = new URL('../dist/fixture-agent/', import.meta.url);
const contract = JSON.parse(await (await import('node:fs/promises')).readFile(
  new URL('../fixtures/realm-contract.json', import.meta.url),
  'utf8',
));
const fixedNow = '2026-08-28T00:00:00.000Z';

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

async function workspace(t, suffix = '') {
  const root = await mkdtemp(join(tmpdir(), `godagent-vessel-${suffix}`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    journalPath: join(root, 'events.jsonl'),
    snapshotPath: join(root, 'snapshot.json'),
  };
}

async function vesselOptions(t, { cortex, realm, crashAt = null, suffix = '' }) {
  return {
    distributionDir,
    instanceId: 'godagent-fixture-1',
    ...(await workspace(t, suffix)),
    cortex,
    realm,
    godskillsTransport: noQualifiedTransport,
    clock: () => fixedNow,
    crashAt,
  };
}

const mission = (requestId) => ({
  requestId,
  text: 'increment the fixture counter once',
  authority: ['realm:write'],
  hostContext,
});

test('one vessel cycle closes mission, decision, action, observation, and continuity', async (t) => {
  const realm = createFixtureRealm({ contract });
  const vessel = await createVessel(await vesselOptions(t, {
    cortex: createFixtureCortexA(),
    realm,
    suffix: 'cycle-',
  }));

  const result = await vessel.runCycle(mission('mission-1'));
  const inspected = vessel.inspect();

  assert.equal(result.receipt.discrepancyClass, 'none');
  assert.equal(realm.inspect().counter, 1);
  assert.equal(inspected.status, 'idle');
  assert.equal(inspected.epoch, 1);
  assert.equal(inspected.cortexAdapterId, 'fixture-a');
  assert.deepEqual(inspected.soulPort, { schemaVersion: 1, status: 'dormant' });
  assert.ok(inspected.lastDecisionId.startsWith('decision-'));
  assert.equal(inspected.lastActionId, 'action:mission-1:0');
});

test('cortex replacement preserves instance and constitution continuity', async (t) => {
  const paths = await workspace(t, 'migration-');
  const realm = createFixtureRealm({ contract });
  const common = {
    distributionDir,
    instanceId: 'godagent-fixture-1',
    ...paths,
    realm,
    godskillsTransport: noQualifiedTransport,
    clock: () => fixedNow,
  };
  const first = await createVessel({ ...common, cortex: createFixtureCortexA() });
  await first.runCycle(mission('mission-1'));
  const before = first.inspect();

  const second = await createVessel({ ...common, cortex: createFixtureCortexB() });
  const afterMigration = second.inspect();
  await second.runCycle(mission('mission-2'));
  const afterSecondCycle = second.inspect();

  assert.equal(afterMigration.instanceId, before.instanceId);
  assert.equal(afterMigration.constitutionDigest, before.constitutionDigest);
  assert.equal(afterMigration.cortexAdapterId, 'fixture-b');
  assert.equal(afterSecondCycle.epoch, 2);
  assert.equal(realm.inspect().counter, 2);
});

test('recovery closes every injected interruption without duplicate effects', async (t) => {
  const checkpoints = [
    { name: 'admission', expectedCounter: 0 },
    { name: 'decision', expectedCounter: 0 },
    { name: 'effect', expectedCounter: 1 },
    { name: 'observation', expectedCounter: 1 },
  ];

  for (const checkpoint of checkpoints) {
    const realm = createFixtureRealm({ contract });
    const vessel = await createVessel(await vesselOptions(t, {
      cortex: createFixtureCortexA(),
      realm,
      crashAt: checkpoint.name,
      suffix: `${checkpoint.name}-`,
    }));
    await assert.rejects(() => vessel.runCycle(mission(`mission-${checkpoint.name}`)), /injected crash/);
    assert.equal(realm.inspect().counter, checkpoint.expectedCounter, checkpoint.name);

    const recovered = await vessel.recover();
    assert.equal(recovered.status, 'idle', checkpoint.name);
    assert.equal(realm.inspect().counter, checkpoint.expectedCounter, checkpoint.name);
    await vessel.recover();
    assert.equal(realm.inspect().counter, checkpoint.expectedCounter, `${checkpoint.name} second recovery`);
    assert.ok(realm.inspect().invocationCount <= 1, checkpoint.name);
  }
});

test('the Soul compatibility port has no activation or mutation surface', () => {
  const port = createDormantSoulPort();

  assert.deepEqual(port, { schemaVersion: 1, status: 'dormant' });
  assert.equal(Object.isFrozen(port), true);
  assert.equal(Object.hasOwn(port, 'activate'), false);
  assert.throws(() => { port.status = 'active'; }, TypeError);
});

test('vessel construction rejects arbiter and action-awareness ablations', async (t) => {
  const realm = createFixtureRealm({ contract });
  const options = await vesselOptions(t, {
    cortex: createFixtureCortexA(),
    realm,
    suffix: 'ablation-',
  });

  await assert.rejects(() => createVessel({ ...options, bypassArbiter: true }), /arbiter bypass/);
  await assert.rejects(() => createVessel({ ...options, disableActionReconciliation: true }), /action reconciliation/);
});
