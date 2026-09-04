import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { executeNegotiatedAction } from '../src/realm/negotiated-action-adapter.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { buildRealmNegotiation } from '../src/realm/negotiation.mjs';
import { commitDecision } from '../src/runtime/arbiter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = join(root, 'fixtures', 'realm-contract.json');
const outputPath = join(root, 'fixtures', 'realm-negotiated-action-v1.json');
const contractText = await readFile(contractPath, 'utf8');
const contract = JSON.parse(contractText);
const authority = {
  availableAuthority: ['realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};
const proposal = {
  schemaVersion: 1,
  proposalId: 'proposal-adapter-fixture-1',
  organId: 'planner',
  organVersion: '1',
  sourceStateEpoch: 0,
  claim: 'increment the local counter once',
  evidenceRefs: ['observation-0'],
  intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
  expectedOutcome: { counter: 1 },
  cost: 1,
  risk: 'low',
  uncertainty: 'verified-fixture',
  requiredAuthority: ['realm:write'],
  preconditions: ['realm-observed'],
  expiresAt: '2026-08-28T00:01:00.000Z',
  priority: 10,
};
const decision = commitDecision({
  proposals: [proposal],
  state: {
    epoch: 0,
    missionId: 'mission-adapter-fixture',
    now: '2026-08-28T00:00:00.000Z',
    preconditions: ['realm-observed'],
  },
  constitution: {
    principles: ['purpose-is-not-permission'],
    allowedEffects: ['local-write'],
  },
  authority: ['realm:write'],
});
const action = {
  actionId: 'action:adapter-fixture:0',
  idempotencyKey: 'adapter-fixture:cycle-0',
  handId: 'counter.increment',
  payload: { amount: 1 },
};
const negotiation = buildRealmNegotiation({ contract, authority });
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

const first = await executeNegotiatedAction({
  negotiation,
  contract,
  authority,
  decision,
  action,
  realm: countedRealm,
  stateEpoch: 0,
});
const second = await executeNegotiatedAction({
  negotiation,
  contract,
  authority,
  decision,
  action,
  realm: countedRealm,
  stateEpoch: 0,
});
if (canonicalJson(first) !== canonicalJson(second)) throw new Error('fixture exact retry is not stable');
const inspect = realm.inspect();
const unsigned = {
  schemaVersion: 1,
  protocolId: 'eternities-realm-negotiated-action-fixture-v1',
  sourceContract: {
    path: 'fixtures/realm-contract.json',
    fileSha256: sha256Text(contractText),
    logicalDigest: sha256Value(contract),
    value: contract,
  },
  cases: {
    input: {
      authority,
      negotiation,
      decision,
      action,
    },
    first,
    exactRetry: second,
  },
  assertions: {
    sourceContractCount: 1,
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
