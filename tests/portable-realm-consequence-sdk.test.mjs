import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';

const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));
const genome = JSON.parse(await readFile(new URL('../dist/fixture-agent/agent-genome.json', import.meta.url), 'utf8'));
const now = '2026-09-04T00:00:00.000Z';

const authority = {
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};

const mission = {
  missionId: 'mission-portable-realm-sdk-1',
  authority: ['realm:write'],
};

const state = {
  instanceId: 'godagent-portable-realm-sdk-fixture',
  epoch: 0,
  now,
  preconditions: ['realm-observed'],
};

async function inputFor() {
  const proposal = await createFixtureCortexA().infer({
    missionId: mission.missionId,
    observation: { observationId: 'observation-0', counter: 0 },
    stateEpoch: state.epoch,
    now,
  });
  return {
    mission,
    proposal,
    contract,
    authority,
    constitution: genome.constitution,
    state,
  };
}

test('package root exposes the certified optional Realm consequence host', async () => {
  const sdk = await import('@eternities/godagents');
  assert.equal(sdk.RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID, 'eternities-recoverable-realm-consequence-v1');
  assert.equal(typeof sdk.createRecoverableRealmConsequenceHost, 'function');
  assert.equal(typeof sdk.assertRecoverableRealmConsequenceHost, 'function');

  const description = sdk.describeGodagentSdk();
  assert.deepEqual(description.supportedAdapterProtocols, [
    'eternities-external-host-qualification-v1',
    'eternities-portable-phase-host-v1',
    'eternities-recoverable-realm-consequence-v1',
  ]);
  assert.equal(description.proofLimits.realmAuthority, false);
  assert.equal(description.proofLimits.defaultLaunchAdoption, false);
  assert.equal(canonicalJson(description).includes('credential'), false);
  assert.equal(canonicalJson(description).includes('provider credential'), false);
});

test('SDK Realm consequence host preserves the certified durable boundary', async (t) => {
  const sdk = await import('@eternities/godagents');
  const root = await mkdtemp(join(tmpdir(), 'godagents-portable-realm-sdk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const realm = createFixtureRealm({ contract });
  const host = await sdk.createRecoverableRealmConsequenceHost({
    root,
    realm,
    clock: () => now,
  });

  assert.equal(sdk.assertRecoverableRealmConsequenceHost(host), host);
  assert.deepEqual(Object.keys(host).sort(), [
    'descriptor', 'execute', 'executionIdFor', 'inspect', 'recover',
  ]);
  assert.equal(host.descriptor.defaultLaunchEnabled, false);
  assert.equal(host.descriptor.authorityExpanded, false);
  assert.equal(host.descriptor.credentialsPersisted, false);
  assert.equal(host.descriptor.rollbackSupported, false);

  const input = await inputFor();
  const first = await host.execute(input);
  const retry = await host.execute(input);
  assert.equal(first.status, 'completed');
  assert.equal(retry.recovered, true);
  assert.deepEqual(retry.receipt, first.receipt);
  assert.deepEqual(realm.inspect(), {
    counter: 1,
    invocationCount: 1,
    reconciliationCount: 0,
    idempotencyCount: 1,
  });
});
