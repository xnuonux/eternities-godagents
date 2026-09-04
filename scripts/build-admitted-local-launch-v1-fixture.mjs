import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { admitLocalCreation } from '../src/genesis/local-admission.mjs';
import { launchAdmittedLocalAgent } from '../src/host/admitted-launch.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const creationRoot = new URL('../fixtures/creation/', import.meta.url);
const fixturePath = fileURLToPath(new URL('../fixtures/admitted-local-launch-v1.json', import.meta.url));
const creationPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixedClock = () => '2026-08-29T13:00:00.000Z';
const expectedEventTypes = Object.freeze([
  'genesis.prepared',
  'vessel.created',
  'genesis.bound',
  'mission.admitted',
  'realm.observed',
  'proposal.collected',
  'decision.committed',
  'action.invoking',
  'action.receipt',
  'cycle.completed',
]);
const RESULT_KEYS = Object.freeze([
  'actionId', 'decisionId', 'discrepancyClass', 'genesisId', 'instanceId', 'keelId', 'schemaVersion', 'status',
]);
const DIGEST = /^[a-f0-9]{64}$/;
const KEEL_ID = /^keel-[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !same(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function digest(value, label) {
  if (!DIGEST.test(value ?? '')) throw new Error(`${label} is invalid`);
}

function projectResult(value, label = 'launch result') {
  exactKeys(value, RESULT_KEYS, label);
  if (value.schemaVersion !== 1 || value.status !== 'completed'
      || !IDENTIFIER.test(value.instanceId) || !DIGEST.test(value.genesisId)
      || !KEEL_ID.test(value.keelId) || !IDENTIFIER.test(value.decisionId)
      || !IDENTIFIER.test(value.actionId) || value.discrepancyClass !== 'none') {
    throw new Error(`${label} is invalid`);
  }
  return structuredClone(value);
}

function fixtureCortex() {
  return Object.freeze({
    adapterId: 'openai-compatible',
    async infer({ missionId, observation, stateEpoch, now }) {
      return {
        schemaVersion: 1,
        proposalId: `admitted-launch-certification:${missionId}:${stateEpoch}`,
        organId: 'admitted-launch-certification-cortex',
        organVersion: '1',
        sourceStateEpoch: stateEpoch,
        claim: 'increment the governed fixture counter once',
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

export function verifyAdmittedLocalLaunchFixture(value) {
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'sourceAdmission', 'first', 'replay', 'journal', 'runtime', 'realm',
    'assertions', 'fixtureDigest',
  ], 'admitted local launch fixture');
  if (value.schemaVersion !== 1 || value.protocolId !== 'eternities-admitted-local-launch-fixture-v1') {
    throw new Error('admitted local launch fixture identity is invalid');
  }

  exactKeys(value.sourceAdmission, [
    'creationBuildId', 'distributionBuildId', 'genesisId', 'hostPolicyDigest', 'instanceId', 'keelId',
    'missionDigest', 'policyDigest', 'realmContractDigest', 'realmId', 'requestId',
  ], 'admitted local launch source');
  for (const key of [
    'creationBuildId', 'distributionBuildId', 'genesisId', 'hostPolicyDigest', 'missionDigest',
    'policyDigest', 'realmContractDigest',
  ]) digest(value.sourceAdmission[key], `admitted local launch ${key}`);
  if (!KEEL_ID.test(value.sourceAdmission.keelId)
      || !IDENTIFIER.test(value.sourceAdmission.instanceId)
      || !IDENTIFIER.test(value.sourceAdmission.realmId)
      || !IDENTIFIER.test(value.sourceAdmission.requestId)
      || value.sourceAdmission.policyDigest !== creationPolicyDigest
      || value.sourceAdmission.realmId !== 'fixture-workbench') {
    throw new Error('admitted local launch source binding is invalid');
  }

  const first = projectResult(value.first, 'admitted local launch first result');
  const replay = projectResult(value.replay, 'admitted local launch replay result');
  if (!same(first, replay)
      || first.instanceId !== value.sourceAdmission.instanceId
      || first.genesisId !== value.sourceAdmission.genesisId
      || first.keelId !== value.sourceAdmission.keelId) {
    throw new Error('admitted local launch replay identity is not stable');
  }

  exactKeys(value.journal, [
    'cycleAbortedCount', 'cycleCompletedCount', 'eventCount', 'eventTypes', 'missionAdmissionCount',
  ], 'admitted local launch journal');
  if (!same(value.journal.eventTypes, expectedEventTypes)
      || value.journal.eventCount !== expectedEventTypes.length
      || value.journal.missionAdmissionCount !== 1
      || value.journal.cycleCompletedCount !== 1
      || value.journal.cycleAbortedCount !== 0) {
    throw new Error('admitted local launch journal evidence is invalid');
  }

  exactKeys(value.runtime, ['factoryCalls', 'replayFactoryCalls'], 'admitted local launch runtime');
  if (value.runtime.factoryCalls !== 1 || value.runtime.replayFactoryCalls !== 0) {
    throw new Error('admitted local launch runtime evidence is invalid');
  }
  exactKeys(value.realm, ['counter', 'idempotencyCount', 'invocationCount', 'reconciliationCount'], 'admitted local launch Realm');
  if (!same(value.realm, { counter: 1, idempotencyCount: 1, invocationCount: 1, reconciliationCount: 0 })) {
    throw new Error('admitted local launch Realm evidence is invalid');
  }

  exactKeys(value.assertions, [
    'authorityExpansions', 'identityStable', 'realmMutations', 'replayFactoryCalls',
    'runtimeFactoryCalls', 'terminalReplayStable',
  ], 'admitted local launch assertions');
  if (!same(value.assertions, {
    authorityExpansions: 0,
    identityStable: true,
    realmMutations: 1,
    replayFactoryCalls: 0,
    runtimeFactoryCalls: 1,
    terminalReplayStable: true,
  })) throw new Error('admitted local launch assertions are invalid');

  digest(value.fixtureDigest, 'admitted local launch fixture digest');
  const { fixtureDigest, ...unsigned } = value;
  if (fixtureDigest !== sha256Value(unsigned)) throw new Error('admitted local launch fixture digest mismatch');
  return value;
}

export async function buildAdmittedLocalLaunchFixture() {
  const root = await mkdtemp(join(tmpdir(), 'godagents-admitted-local-launch-cert-'));
  try {
    const creationDir = join(root, 'source-creation');
    const creation = await compileCreation({
      candidatePath: new URL('creation-candidate.json', creationRoot),
      policyPath: new URL('creation-policy.json', creationRoot),
      expectedPolicyDigest: creationPolicyDigest,
      expressionPath: new URL('expression-overlay.json', creationRoot),
      moduleDirectory: new URL('modules/', creationRoot),
      outputDir: creationDir,
    });

    const promptArtifactPath = join(root, 'prompt-os.md');
    await writeFile(
      promptArtifactPath,
      '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: admitted-local-launch-v1.json -->\n#admitted local launch certification\n',
      'utf8',
    );
    const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));
    contract.capabilities = ['filesystem.read', 'filesystem.write'];
    contract.compatibleDistributions = ['0.2.x'];
    const realmContractPath = join(root, 'realm-contract.json');
    await writeFile(realmContractPath, `${canonicalJson(contract)}\n`, 'utf8');

    const workspace = join(root, 'workspace');
    const instanceId = 'certified-admitted-launch-agent';
    const requestId = 'operator:admitted-launch-certification:001';
    const admission = await admitLocalCreation({
      creationDir,
      expectedPolicyDigest: creationPolicyDigest,
      expectedCreationBuildId: creation.manifest.buildId,
      promptArtifactPath,
      realmContractPath,
      workspace,
      instanceId,
      creatorRef: 'creator:dom',
      checkpointPurpose: 'certify one governed local launch with Soul dormant',
      clock: fixedClock,
    });
    const admissionRoot = join(workspace, 'admission');

    const policy = JSON.parse(await readFile(new URL('../fixtures/host-policy.json', import.meta.url), 'utf8'));
    policy.runtime.instanceId = instanceId;
    policy.runtime.distributionDir = relative(root, join(admissionRoot, 'distribution'));
    policy.runtime.journalPath = relative(root, join(admissionRoot, 'vessel', 'journal.jsonl'));
    policy.runtime.snapshotPath = relative(root, join(admissionRoot, 'vessel', 'snapshot.json'));
    const policyText = `${canonicalJson(policy)}\n`;
    const policyPath = join(root, 'host-policy.json');
    await writeFile(policyPath, policyText, 'utf8');

    const missionText = 'increment the governed fixture counter once';
    const missionPath = join(root, 'mission.txt');
    await writeFile(missionPath, `${missionText}\n`, 'utf8');
    const env = {
      GODAGENT_POLICY_SHA256: sha256Text(canonicalJson(policy)),
      GODAGENT_MODEL_API_KEY: 'admitted-local-launch-fixture-secret',
    };
    let realm;
    let factoryCalls = 0;
    let rejectRuntime = false;
    const runtimeFactory = async ({ realmContract, clock }) => {
      factoryCalls += 1;
      if (rejectRuntime) throw new Error('terminal replay must not reconstruct runtime');
      realm = createFixtureRealm({ contract: realmContract });
      return { cortex: fixtureCortex(), realm, godskillsAdapter: false, clock };
    };
    const first = await launchAdmittedLocalAgent({
      admissionRoot,
      policyPath,
      missionPath,
      requestId,
      env,
      registryRoot: join(root, 'machine-instance-registry'),
      runtimeFactory,
      clock: fixedClock,
    });
    const firstFactoryCalls = factoryCalls;
    rejectRuntime = true;
    const replay = await launchAdmittedLocalAgent({
      admissionRoot,
      policyPath,
      missionPath,
      requestId,
      env,
      registryRoot: join(root, 'machine-instance-registry'),
      runtimeFactory,
      clock: fixedClock,
    });
    const journal = await readVerifiedJournal(join(admissionRoot, 'vessel', 'journal.jsonl'));
    const binding = JSON.parse(await readFile(join(admissionRoot, 'binding.json'), 'utf8'));
    const unsigned = {
      schemaVersion: 1,
      protocolId: 'eternities-admitted-local-launch-fixture-v1',
      sourceAdmission: {
        creationBuildId: admission.creationBuildId,
        distributionBuildId: admission.distributionBuildId,
        genesisId: admission.genesisId,
        hostPolicyDigest: sha256Text(canonicalJson(policy)),
        instanceId,
        keelId: admission.keelId,
        missionDigest: sha256Text(missionText),
        policyDigest: creationPolicyDigest,
        realmContractDigest: sha256Value(contract),
        realmId: contract.realmId,
        requestId,
      },
      first: projectResult(first),
      replay: projectResult(replay),
      journal: {
        cycleAbortedCount: journal.events.filter(({ eventType }) => eventType === 'cycle.aborted').length,
        cycleCompletedCount: journal.events.filter(({ eventType }) => eventType === 'cycle.completed').length,
        eventCount: journal.events.length,
        eventTypes: journal.events.map(({ eventType }) => eventType),
        missionAdmissionCount: journal.events.filter(({ eventType }) => eventType === 'mission.admitted').length,
      },
      runtime: {
        factoryCalls,
        replayFactoryCalls: factoryCalls - firstFactoryCalls,
      },
      realm: realm.inspect(),
      assertions: {
        authorityExpansions: 0,
        identityStable: first.instanceId === replay.instanceId
          && first.genesisId === replay.genesisId
          && first.keelId === replay.keelId
          && binding.instanceId === first.instanceId
          && binding.genesisId === first.genesisId
          && binding.keelId === first.keelId,
        realmMutations: realm.inspect().invocationCount,
        replayFactoryCalls: factoryCalls - firstFactoryCalls,
        runtimeFactoryCalls: firstFactoryCalls,
        terminalReplayStable: same(first, replay),
      },
    };
    const fixture = { ...unsigned, fixtureDigest: sha256Value(unsigned) };
    return verifyAdmittedLocalLaunchFixture(fixture);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = await buildAdmittedLocalLaunchFixture();
  await writeFile(fixturePath, `${canonicalJson(fixture)}\n`, 'utf8');
  process.stdout.write(`${canonicalJson({ status: 'written', outputPath: fixturePath, fixtureDigest: fixture.fixtureDigest })}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
