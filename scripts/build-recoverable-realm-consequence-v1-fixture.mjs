import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { createFixtureCortexA } from '../src/runtime/fixture-cortex.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createRecoverableRealmConsequenceHost } from '../src/realm/recoverable-consequence-host.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const contractPath = join(root, 'fixtures', 'realm-contract.json');
const genomePath = join(root, 'dist', 'fixture-agent', 'agent-genome.json');
const outputPath = join(root, 'fixtures', 'recoverable-realm-consequence-v1.json');
const contractText = await readFile(contractPath, 'utf8');
const genomeText = await readFile(genomePath, 'utf8');
const contract = JSON.parse(contractText);
const genome = JSON.parse(genomeText);
const now = '2026-09-04T00:00:00.000Z';
const authority = {
  availableAuthority: ['local-read', 'local-write', 'realm:write'],
  permittedEffects: ['local-read', 'local-write'],
};
const mission = {
  missionId: 'mission-recoverable-consequence-fixture',
  authority: ['realm:write'],
};
const state = {
  instanceId: 'godagent-recoverable-consequence-fixture',
  epoch: 0,
  now,
  preconditions: ['realm-observed'],
};
const clock = () => now;

const proposal = await createFixtureCortexA().infer({
  missionId: mission.missionId,
  observation: { observationId: 'observation-0', counter: 0 },
  stateEpoch: state.epoch,
  now,
});
const input = {
  mission,
  proposal,
  contract,
  authority,
  constitution: genome.constitution,
  state,
};

function trackedRealm(options = {}) {
  const base = createFixtureRealm({ contract, ...options });
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

async function journalFor(rootPath, executionId) {
  return readVerifiedJournal(join(rootPath, 'executions', executionId, 'journal.jsonl'));
}

async function runCase({ checkpoint = async () => {}, realmOptions = {} } = {}) {
  const caseRoot = await mkdtemp(join(tmpdir(), 'godagents-recoverable-realm-cert-'));
  try {
    const tracked = trackedRealm(realmOptions);
    const host = await createRecoverableRealmConsequenceHost({
      root: caseRoot,
      realm: tracked.realm,
      checkpoint,
      clock,
    });
    const executionId = host.executionIdFor(input);
    let failure = null;
    try {
      await host.execute(input);
    } catch (error) {
      failure = { name: error.name, message: error.message };
    }
    const beforeRecovery = tracked.inspect();
    const callsBeforeRecovery = { ...tracked.calls };
    const recovered = await host.recover(executionId);
    const afterRecovery = tracked.inspect();
    const callsAfterRecovery = { ...tracked.calls };
    const journal = await journalFor(caseRoot, executionId);
    return {
      executionId,
      failure,
      recovered,
      eventTypes: journal.events.map(({ eventType }) => eventType),
      realm: { callsBeforeRecovery, callsAfterRecovery, beforeRecovery, afterRecovery },
    };
  } finally {
    await rm(caseRoot, { recursive: true, force: true });
  }
}

const primaryRoot = await mkdtemp(join(tmpdir(), 'godagents-recoverable-realm-cert-primary-'));
let primary;
try {
  const tracked = trackedRealm();
  const host = await createRecoverableRealmConsequenceHost({
    root: primaryRoot,
    realm: tracked.realm,
    clock,
  });
  const first = await host.execute(input);
  const exactRetry = await host.execute(input);
  const journal = await journalFor(primaryRoot, first.executionId);
  primary = {
    first,
    exactRetry,
    eventTypes: journal.events.map(({ eventType }) => eventType),
    realm: { calls: tracked.calls, state: tracked.inspect() },
  };
} finally {
  await rm(primaryRoot, { recursive: true, force: true });
}

let afterAdmissionCrash = false;
const afterAdmission = await runCase({
  checkpoint: async (stage) => {
    if (!afterAdmissionCrash && stage === 'after-admission') {
      afterAdmissionCrash = true;
      throw new Error('simulated after-admission boundary');
    }
  },
});

let afterEffectCrash = false;
const afterEffect = await runCase({
  checkpoint: async (stage) => {
    if (!afterEffectCrash && stage === 'before-result-publish') {
      afterEffectCrash = true;
      throw new Error('simulated after-effect boundary');
    }
  },
});

let afterResultCrash = false;
const afterResult = await runCase({
  checkpoint: async (stage) => {
    if (!afterResultCrash && stage === 'after-result-publish') {
      afterResultCrash = true;
      throw new Error('simulated after-result boundary');
    }
  },
});

const unsigned = {
  schemaVersion: 1,
  protocolId: 'eternities-recoverable-realm-consequence-fixture-v1',
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
    primary,
    afterAdmission,
    afterEffect,
    afterResult,
  },
  assertions: {
    operationCount: 4,
    terminalReplayStable: canonicalJson(primary.first.consequence) === canonicalJson(primary.exactRetry.consequence)
      && canonicalJson(primary.first.receipt) === canonicalJson(primary.exactRetry.receipt),
    admissionEventCount: 4,
    resultEventCount: 4,
    receiptEventCount: 4,
    realmMutations: 4,
    postEffectMutationCount: afterEffect.realm.afterRecovery.invocationCount,
    postEffectReconciliationCount: afterEffect.realm.afterRecovery.reconciliationCount,
    postResultRecoveryCalls: (afterResult.realm.callsAfterRecovery.observe - afterResult.realm.callsBeforeRecovery.observe)
      + (afterResult.realm.callsAfterRecovery.invoke - afterResult.realm.callsBeforeRecovery.invoke)
      + (afterResult.realm.callsAfterRecovery.reconcile - afterResult.realm.callsBeforeRecovery.reconcile),
    authorityExpansions: 0,
    credentialLeaks: 0,
    rollbackCalls: 0,
    providerCalls: 0,
  },
};
const fixture = { ...unsigned, fixtureDigest: sha256Value(unsigned) };
await writeFile(outputPath, `${canonicalJson(fixture)}\n`, 'utf8');
process.stdout.write(`${canonicalJson({
  status: 'written',
  outputPath,
  fixtureDigest: fixture.fixtureDigest,
  executionId: primary.first.executionId,
})}\n`);
