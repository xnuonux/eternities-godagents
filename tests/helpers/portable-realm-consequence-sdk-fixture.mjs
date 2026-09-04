import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value } from '../../src/core/digest.mjs';
import { createFixtureCortexA } from '../../src/runtime/fixture-cortex.mjs';
import { createFixtureRealm } from '../../src/realm/fixture-realm.mjs';

const contract = JSON.parse(await readFile(new URL('../../fixtures/realm-contract.json', import.meta.url), 'utf8'));
const genome = JSON.parse(await readFile(new URL('../../dist/fixture-agent/agent-genome.json', import.meta.url), 'utf8'));
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

export async function buildDeterministicPortableRealmConsequenceSdkFixture() {
  const sdk = await import('@eternities/godagents');
  const root = await mkdtemp(join(tmpdir(), 'godagents-portable-realm-sdk-fixture-'));
  try {
    const realm = createFixtureRealm({ contract });
    const host = await sdk.createRecoverableRealmConsequenceHost({
      root,
      realm,
      clock: () => now,
    });
    const input = await inputFor();
    const first = await host.execute(input);
    const retry = await host.execute(input);
    const rootExports = Object.keys(sdk).sort();
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-portable-realm-consequence-sdk-fixture-v1',
      sdk: {
        protocolId: sdk.GODAGENT_SDK_PROTOCOL_ID,
        version: sdk.GODAGENT_SDK_VERSION,
        rootExports,
        supportedAdapterProtocols: sdk.describeGodagentSdk().supportedAdapterProtocols,
      },
      host: {
        protocolId: sdk.RECOVERABLE_REALM_CONSEQUENCE_PROTOCOL_ID,
        exposedFields: Object.keys(host).sort(),
        safety: {
          authorityExpanded: host.descriptor.authorityExpanded,
          defaultLaunchEnabled: host.descriptor.defaultLaunchEnabled,
          rollbackSupported: host.descriptor.rollbackSupported,
          noPersistedSecrets: host.descriptor.credentialsPersisted === false,
        },
      },
      execution: {
        firstStatus: first.status,
        retryRecovered: retry.recovered,
        receiptDigest: first.receipt.receiptDigest,
        retryReceiptDigest: retry.receipt.receiptDigest,
        terminalReplayStable: canonicalJson(first.receipt) === canonicalJson(retry.receipt),
        realmMutationCount: realm.inspect().invocationCount,
        realmCounter: realm.inspect().counter,
      },
      assertions: {
        authorityExpansions: 0,
        defaultLaunchAdoption: 0,
        noSensitivePersistence: true,
        providerCalls: 0,
        realmMutations: 1,
        terminalReplayStable: true,
      },
    };
    return {
      ...unsigned,
      fixtureDigest: sha256Value(unsigned),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
