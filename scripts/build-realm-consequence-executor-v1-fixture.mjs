import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { executeNegotiatedConsequence } from '../src/realm/negotiated-consequence-executor.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = join(root, 'fixtures', 'realm-contract.json');
const genomePath = join(root, 'dist', 'fixture-agent', 'agent-genome.json');
const outputPath = join(root, 'fixtures', 'realm-negotiated-consequence-v1.json');
const contractText = await readFile(contractPath, 'utf8');
const genomeText = await readFile(genomePath, 'utf8');
const contract = JSON.parse(contractText);
const genome = JSON.parse(genomeText);
const authority = {
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};
const mission = {
  missionId: 'mission-consequence-fixture',
  authority: ['realm:write'],
};
const state = {
  instanceId: 'godagent-consequence-fixture',
  epoch: 0,
  now: '2026-09-04T00:00:00.000Z',
  preconditions: ['realm-observed'],
};
const proposal = await createFixtureCortexA().infer({
  missionId: mission.missionId,
  observation: { observationId: 'observation-0', counter: 0 },
  stateEpoch: state.epoch,
  now: state.now,
});
const input = {
  mission,
  proposal,
  contract,
  authority,
  constitution: genome.constitution,
  state,
};
const realm = createFixtureRealm({ contract });
const counts = { observe: 0, invoke: 0, reconcile: 0 };
const countedRealm = {
  contract: realm.contract,
  async observe(...args) {
    counts.observe += 1;
    return realm.observe(...args);
  },
  async invoke(...args) {
    counts.invoke += 1;
    return realm.invoke(...args);
  },
  async reconcile(...args) {
    counts.reconcile += 1;
    return realm.reconcile(...args);
  },
};

const first = await executeNegotiatedConsequence({ ...input, realm: countedRealm });
const exactRetry = await executeNegotiatedConsequence({ ...input, realm: countedRealm });
if (canonicalJson(first) !== canonicalJson(exactRetry)) throw new Error('fixture exact retry is not stable');
const inspect = realm.inspect();
const unsigned = {
  schemaVersion: 1,
  protocolId: 'eternities-realm-negotiated-consequence-fixture-v1',
  sourceContract: {
    path: 'fixtures/realm-contract.json',
    fileSha256: sha256Text(contractText),
    logicalDigest: sha256Value(contract),
    value: contract,
  },
  sourceConstitution: {
    path: 'dist/fixture-agent/agent-genome.json',
    fileSha256: sha256Text(genomeText),
    logicalDigest: sha256Value(genome.constitution),
    value: genome.constitution,
  },
  cases: {
    input,
    first,
    exactRetry,
  },
  assertions: {
    sourceContractCount: 1,
    sourceConstitutionCount: 1,
    successfulActions: 1,
    exactRetryStable: true,
    realmInvocationCount: inspect.invocationCount,
    realmCounter: inspect.counter,
    idempotencyCount: inspect.idempotencyCount,
    observeCalls: counts.observe,
    invokeCalls: counts.invoke,
    reconcileCalls: counts.reconcile,
    authorityExpansions: 0,
    executableFields: 0,
    credentialLeaks: 0,
    providerCalls: 0,
  },
};
const fixture = { ...unsigned, fixtureDigest: sha256Value(unsigned) };
await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  status: 'written',
  outputPath,
  fixtureDigest: fixture.fixtureDigest,
  receiptDigest: first.receipt.receiptDigest,
})}\n`);
