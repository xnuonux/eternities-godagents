import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import {
  buildRealmCompensationRelation,
} from '../src/realm/compensation.mjs';
import { createRecoverableRealmCompensationHost } from '../src/realm/recoverable-compensation-host.mjs';
import { createRecoverableRealmConsequenceHost } from '../src/realm/recoverable-consequence-host.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = join(root, 'fixtures', 'realm-compensation-contract.json');
const genomePath = join(root, 'dist', 'fixture-agent', 'agent-genome.json');
const outputPath = join(root, 'fixtures', 'realm-compensation-v1.json');
const contractText = await readFile(contractPath, 'utf8');
const genomeText = await readFile(genomePath, 'utf8');
const contract = JSON.parse(contractText);
const genome = JSON.parse(genomeText);
const now = '2026-09-04T00:00:00.000Z';
const clock = () => now;
const authority = {
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};
const mission = {
  missionId: 'mission-compensation-fixture',
  authority: ['realm:write'],
};
const state = {
  instanceId: 'godagent-compensation-fixture',
  epoch: 0,
  now,
  preconditions: ['realm-observed'],
};
const primaryProposal = await createFixtureCortexA().infer({
  missionId: mission.missionId,
  observation: { observationId: 'observation-0', counter: 0 },
  stateEpoch: state.epoch,
  now,
});
const primaryInput = {
  mission,
  proposal: primaryProposal,
  contract,
  authority,
  constitution: genome.constitution,
  state,
};

function compensationProposal() {
  return {
    schemaVersion: 1,
    proposalId: 'fixture-compensation-proposal',
    organId: 'fixture-compensator',
    organVersion: '1',
    sourceStateEpoch: state.epoch,
    claim: 'restore the counter before the explicit primary transition',
    evidenceRefs: ['observation-0'],
    intent: {
      effect: 'local-write',
      handId: 'counter.decrement',
      amount: 1,
    },
    expectedOutcome: { counter: 0 },
    cost: 1,
    risk: 'low',
    uncertainty: 'verified-fixture',
    requiredAuthority: ['realm:write'],
    preconditions: ['realm-observed'],
    expiresAt: new Date(Date.parse(now) + 60_000).toISOString(),
    priority: 10,
  };
}

const relation = buildRealmCompensationRelation({
  contract,
  primaryHandId: 'counter.increment',
  compensatingHandId: 'counter.decrement',
  payloadBindings: [{ primaryField: 'amount', compensatingField: 'amount' }],
  outputBindings: [{ primaryField: 'counter', compensatingField: 'counter' }],
});

function compensationInput(primaryExecutionId) {
  return {
    primaryExecutionId,
    relation,
    input: {
      mission,
      proposal: compensationProposal(),
      contract,
      authority,
      constitution: genome.constitution,
      state,
    },
  };
}

function trackedRealm() {
  const base = createFixtureRealm({ contract });
  const calls = { observe: 0, invoke: 0, reconcile: 0 };
  const realm = Object.freeze({
    contract: base.contract,
    async observe(...args) {
      calls.observe += 1;
      return base.observe(...args);
    },
    async invoke(...args) {
      calls.invoke += 1;
      return base.invoke(...args);
    },
    async reconcile(...args) {
      calls.reconcile += 1;
      return base.reconcile(...args);
    },
  });
  return { realm, calls, inspect: base.inspect };
}

async function journalFor(caseRoot, executionId) {
  return readVerifiedJournal(join(caseRoot, 'executions', executionId, 'journal.jsonl'));
}

async function runCompensationCase({ checkpoint = async () => {} } = {}) {
  const primaryRoot = await mkdtemp(join(tmpdir(), 'godagents-compensation-cert-primary-'));
  const compensationRoot = await mkdtemp(join(tmpdir(), 'godagents-compensation-cert-compensation-'));
  try {
    const tracked = trackedRealm();
    const primaryHost = await createRecoverableRealmConsequenceHost({
      root: primaryRoot,
      realm: tracked.realm,
      clock,
    });
    const compensationHost = await createRecoverableRealmCompensationHost({
      root: compensationRoot,
      realm: tracked.realm,
      primaryHost,
      clock,
      checkpoint,
    });
    const primary = await primaryHost.execute(primaryInput);
    const input = compensationInput(primary.executionId);
    let failure = null;
    try {
      await compensationHost.execute(input);
    } catch (error) {
      failure = { name: error.name, message: error.message };
    }
    const callsBeforeRecovery = { ...tracked.calls };
    const beforeRecovery = tracked.inspect();
    const recovered = await compensationHost.recover(compensationHost.executionIdFor(input));
    const callsAfterRecovery = { ...tracked.calls };
    const afterRecovery = tracked.inspect();
    const journal = await journalFor(compensationRoot, recovered.executionId);
    return {
      primaryExecutionId: primary.executionId,
      input,
      executionId: recovered.executionId,
      failure,
      recovered,
      eventTypes: journal.events.map(({ eventType }) => eventType),
      realm: { callsBeforeRecovery, callsAfterRecovery, beforeRecovery, afterRecovery },
    };
  } finally {
    await Promise.all([
      rm(primaryRoot, { recursive: true, force: true }),
      rm(compensationRoot, { recursive: true, force: true }),
    ]);
  }
}

const successRoot = await mkdtemp(join(tmpdir(), 'godagents-compensation-cert-success-'));
let success;
try {
  const tracked = trackedRealm();
  const primaryRoot = join(successRoot, 'primary');
  const compensationRoot = join(successRoot, 'compensation');
  const primaryHost = await createRecoverableRealmConsequenceHost({
    root: primaryRoot,
    realm: tracked.realm,
    clock,
  });
  const compensationHost = await createRecoverableRealmCompensationHost({
    root: compensationRoot,
    realm: tracked.realm,
    primaryHost,
    clock,
  });
  const primary = await primaryHost.execute(primaryInput);
  const primaryRetry = await primaryHost.execute(primaryInput);
  const input = compensationInput(primary.executionId);
  const first = await compensationHost.execute(input);
  const exactRetry = await compensationHost.execute(input);
  const journal = await journalFor(compensationRoot, first.executionId);
  success = {
    primary,
    primaryRetry,
    first,
    exactRetry,
    eventTypes: journal.events.map(({ eventType }) => eventType),
    realm: { calls: tracked.calls, state: tracked.inspect() },
    input,
  };
} finally {
  await rm(successRoot, { recursive: true, force: true });
}

let afterAdmissionCrashed = false;
const afterAdmission = await runCompensationCase({
  checkpoint: async (stage) => {
    if (!afterAdmissionCrashed && stage === 'after-admission') {
      afterAdmissionCrashed = true;
      throw new Error('simulated compensation after-admission boundary');
    }
  },
});

let afterEffectCrashed = false;
const afterEffect = await runCompensationCase({
  checkpoint: async (stage) => {
    if (!afterEffectCrashed && stage === 'before-result-publish') {
      afterEffectCrashed = true;
      throw new Error('simulated compensation after-effect boundary');
    }
  },
});

let afterResultCrashed = false;
const afterResult = await runCompensationCase({
  checkpoint: async (stage) => {
    if (!afterResultCrashed && stage === 'after-result-publish') {
      afterResultCrashed = true;
      throw new Error('simulated compensation after-result boundary');
    }
  },
});

const unsigned = {
  schemaVersion: 1,
  protocolId: 'eternities-realm-compensation-fixture-v1',
  sourceContract: {
    path: 'fixtures/realm-compensation-contract.json',
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
  relation,
  primaryInput,
  cases: {
    success,
    afterAdmission,
    afterEffect,
    afterResult,
  },
  assertions: {
    inverseRelation: true,
    knownCompletePrimaryRequired: true,
    exactCompensationRetryStable: canonicalJson(success.first.consequence) === canonicalJson(success.exactRetry.consequence)
      && canonicalJson(success.first.receipt) === canonicalJson(success.exactRetry.receipt),
    successfulRestoration: success.first.receipt.restorationStatus === 'restored',
    compensationEventCount: success.eventTypes.length,
    compensationRealmCounter: success.realm.state.counter,
    compensationRealmInvocationCount: success.realm.state.invocationCount,
    authorityExpansions: 0,
    credentialLeaks: 0,
    automaticRollbackCalls: 0,
    providerCalls: 0,
  },
};
const fixture = { ...unsigned, fixtureDigest: sha256Value(unsigned) };
await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  status: 'written',
  outputPath,
  fixtureDigest: fixture.fixtureDigest,
  executionId: success.first.executionId,
  receiptDigest: success.first.receipt.receiptDigest,
})}\n`);
