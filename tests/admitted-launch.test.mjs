import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { admitLocalCreation } from '../src/genesis/local-admission.mjs';
import { launchAdmittedLocalAgent, AdmittedLaunchError } from '../src/host/admitted-launch.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';

const creationRoot = new URL('../fixtures/creation/', import.meta.url);
const creationPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';
const fixedClock = () => '2026-08-29T13:00:00.000Z';

function cortex() {
  return Object.freeze({
    adapterId: 'openai-compatible',
    async infer({ missionId, observation, stateEpoch, now }) {
      return {
        schemaVersion: 1,
        proposalId: `test-cortex:${missionId}:${stateEpoch}`,
        organId: 'test-cortex',
        organVersion: '1',
        sourceStateEpoch: stateEpoch,
        claim: 'increment once',
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

async function noQualifiedGodskills(request) {
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
      proofLimits: ['fixture-only'],
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
      candidateIds: [], selectedIds: [], selectedEntrypoints: [], selectionConfidence: null,
      rejected: [], unresolvedDecisions: [],
      decisionPolicy: 'coverage>card-count>extra-capabilities>effects>context>dependencies>evidence>id',
    },
  };
}

async function setup(context, suffix) {
  const root = await mkdtemp(join(tmpdir(), `godagent-admitted-launch-${suffix}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
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
  await writeFile(promptArtifactPath, '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: admitted-launch.test.json -->\n# Admitted launch test\n', 'utf8');
  const contract = JSON.parse(await readFile(new URL('../fixtures/realm-contract.json', import.meta.url), 'utf8'));
  contract.capabilities = ['filesystem.read', 'filesystem.write'];
  contract.compatibleDistributions = ['0.2.x'];
  const realmContractPath = join(root, 'realm-contract.json');
  await writeFile(realmContractPath, `${canonicalJson(contract)}\n`, 'utf8');
  const workspace = join(root, 'workspace');
  const instanceId = `launch-agent-${suffix}`;
  await admitLocalCreation({
    creationDir,
    expectedPolicyDigest: creationPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    promptArtifactPath,
    realmContractPath,
    workspace,
    instanceId,
    creatorRef: 'creator:dom',
    checkpointPurpose: 'launch one admitted mission with Soul dormant',
    clock: fixedClock,
  });
  const admissionRoot = join(workspace, 'admission');
  const policyPath = join(root, 'host-policy.json');
  const policy = JSON.parse(await readFile(new URL('../fixtures/host-policy.json', import.meta.url), 'utf8'));
  policy.runtime.instanceId = instanceId;
  policy.runtime.distributionDir = relative(root, join(admissionRoot, 'distribution'));
  policy.runtime.journalPath = relative(root, join(admissionRoot, 'vessel', 'journal.jsonl'));
  policy.runtime.snapshotPath = relative(root, join(admissionRoot, 'vessel', 'snapshot.json'));
  const policyText = `${canonicalJson(policy)}\n`;
  await writeFile(policyPath, policyText, 'utf8');
  const missionPath = join(root, 'mission.txt');
  await writeFile(missionPath, 'increment the governed fixture counter once\n', 'utf8');
  const env = {
    GODAGENT_POLICY_SHA256: sha256Text(canonicalJson(policy)),
    GODAGENT_MODEL_API_KEY: 'admitted-launch-secret',
  };
  let realm;
  const runtimeFactory = async ({ realmContract, clock }) => {
    realm = createFixtureRealm({ contract: realmContract });
    return { cortex: cortex(), realm, godskillsAdapter: false, clock };
  };
  return {
    root, admissionRoot, policyPath, missionPath, env, runtimeFactory,
    registryRoot: join(root, 'machine-instance-registry'),
    requestId: `operator:${suffix}:001`,
    getRealm: () => realm,
  };
}

test('one admitted launch verifies persistent identity and completes one governed cycle', async (context) => {
  const fixture = await setup(context, 'success');
  const result = await launchAdmittedLocalAgent({ ...fixture, clock: fixedClock });
  assert.equal(result.status, 'completed');
  assert.equal(result.instanceId, 'launch-agent-success');
  assert.match(result.genesisId, /^[a-f0-9]{64}$/);
  assert.match(result.keelId, /^keel-[a-f0-9]{64}$/);
  assert.equal(fixture.getRealm().inspect().counter, 1);
});

test('admitted launch forwards explicit adaptive dependencies only through its programmatic boundary', async (context) => {
  const fixture = await setup(context, 'adaptive-boundary');
  const activationClassifier = () => ({
    taskClass: 'implementation', consequenceClass: 'low', reviewAvailable: false,
  });
  const activationTransport = async () => { throw new Error('fixture runtime must not invoke activation'); };
  const baseFactory = fixture.runtimeFactory;
  let observed;
  fixture.runtimeFactory = async (input) => {
    observed = input;
    return baseFactory(input);
  };
  const result = await launchAdmittedLocalAgent({
    ...fixture,
    activationClassifier,
    activationTransport,
    clock: fixedClock,
  });

  assert.equal(result.status, 'completed');
  assert.equal(observed.activationClassifier, activationClassifier);
  assert.equal(observed.activationTransport, activationTransport);
});

test('retrying one completed request returns its recorded outcome without another runtime or effect', async (context) => {
  const fixture = await setup(context, 'replay');
  const first = await launchAdmittedLocalAgent({ ...fixture, clock: fixedClock });
  const firstRealm = fixture.getRealm();
  fixture.runtimeFactory = async () => { throw new Error('runtime must not be reconstructed for terminal replay'); };
  const replay = await launchAdmittedLocalAgent({ ...fixture, clock: fixedClock });
  assert.deepEqual(replay, first);
  assert.equal(firstRealm.inspect().counter, 1);
});

test('a live launch lease blocks concurrent recovery or request admission', async (context) => {
  const fixture = await setup(context, 'concurrent');
  const originalFactory = fixture.runtimeFactory;
  let release;
  let markStarted;
  const started = new Promise((resolvePromise) => { markStarted = resolvePromise; });
  const gate = new Promise((resolvePromise) => { release = resolvePromise; });
  fixture.runtimeFactory = async (input) => {
    markStarted();
    await gate;
    return originalFactory(input);
  };
  const first = launchAdmittedLocalAgent({ ...fixture, clock: fixedClock });
  await started;
  await assert.rejects(
    () => launchAdmittedLocalAgent({ ...fixture, clock: fixedClock }),
    (error) => error instanceof AdmittedLaunchError && error.code === 'launch-busy',
  );
  release();
  assert.equal((await first).status, 'completed');
});

test('a request ID cannot be reused with changed mission content', async (context) => {
  const fixture = await setup(context, 'conflict');
  await launchAdmittedLocalAgent({ ...fixture, clock: fixedClock });
  await writeFile(fixture.missionPath, 'a different mission under the same request identity\n', 'utf8');
  fixture.runtimeFactory = async () => { throw new Error('conflict must fail before runtime'); };
  await assert.rejects(
    () => launchAdmittedLocalAgent({ ...fixture, clock: fixedClock }),
    (error) => error instanceof AdmittedLaunchError && error.code === 'request-conflict',
  );
});

test('policy runtime paths and instance must bind exactly to the admission', async (context) => {
  const fixture = await setup(context, 'policy');
  const policy = JSON.parse(await readFile(fixture.policyPath, 'utf8'));
  policy.runtime.journalPath = 'foreign/journal.jsonl';
  await writeFile(fixture.policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  fixture.env.GODAGENT_POLICY_SHA256 = sha256Text(canonicalJson(policy));
  await assert.rejects(
    () => launchAdmittedLocalAgent({ ...fixture, clock: fixedClock }),
    (error) => error instanceof AdmittedLaunchError && error.code === 'policy-mismatch',
  );
  assert.equal(fixture.getRealm(), undefined);
});

test('tampered keel blocks launch before runtime construction or Realm use', async (context) => {
  const fixture = await setup(context, 'tamper');
  const binding = JSON.parse(await readFile(join(fixture.admissionRoot, 'binding.json'), 'utf8'));
  const chainPath = join(fixture.admissionRoot, 'keels', binding.keelId, 'chain.jsonl');
  const chain = await readFile(chainPath, 'utf8');
  await writeFile(chainPath, chain.replace('Soul remains dormant', 'Soul is active'), 'utf8');
  await assert.rejects(
    () => launchAdmittedLocalAgent({ ...fixture, clock: fixedClock }),
    (error) => error instanceof AdmittedLaunchError && error.code === 'admission-invalid',
  );
  assert.equal(fixture.getRealm(), undefined);
});

test('changed binding, receipt, and distribution each block before runtime construction', async (context) => {
  for (const [suffix, mutate] of [
    ['binding', async (fixture) => {
      const path = join(fixture.admissionRoot, 'binding.json');
      await writeFile(path, `${await readFile(path, 'utf8')} `, 'utf8');
    }],
    ['receipt', async (fixture) => {
      const path = join(fixture.admissionRoot, 'transaction', 'genesis-receipt.json');
      const value = JSON.parse(await readFile(path, 'utf8'));
      value.receiptDigest = 'f'.repeat(64);
      await writeFile(path, `${canonicalJson(value)}\n`, 'utf8');
    }],
    ['distribution', async (fixture) => {
      const path = join(fixture.admissionRoot, 'distribution', 'agent-genome.json');
      const value = JSON.parse(await readFile(path, 'utf8'));
      value.constitution.principles = ['tampered after admission'];
      await writeFile(path, `${canonicalJson(value)}\n`, 'utf8');
    }],
  ]) {
    const fixture = await setup(context, suffix);
    await mutate(fixture);
    await assert.rejects(
      () => launchAdmittedLocalAgent({ ...fixture, clock: fixedClock }),
      (error) => error instanceof AdmittedLaunchError && error.code === 'admission-invalid',
    );
    assert.equal(fixture.getRealm(), undefined);
  }
});

test('a junctioned admission subtree is rejected before runtime construction', async (context) => {
  const fixture = await setup(context, 'junction');
  const distribution = join(fixture.admissionRoot, 'distribution');
  const outside = join(fixture.root, 'moved-distribution');
  await rename(distribution, outside);
  await symlink(outside, distribution, 'junction');
  await assert.rejects(
    () => launchAdmittedLocalAgent({ ...fixture, clock: fixedClock }),
    (error) => error instanceof AdmittedLaunchError && error.code === 'admission-invalid',
  );
  assert.equal(fixture.getRealm(), undefined);
});

test('a copied admission cannot fork one OS-account-resident persistent identity', async (context) => {
  const fixture = await setup(context, 'residency');
  await launchAdmittedLocalAgent({ ...fixture, clock: fixedClock });
  const copiedRoot = join(fixture.root, 'copied-admission');
  await cp(fixture.admissionRoot, copiedRoot, { recursive: true });
  const copiedPolicyPath = join(fixture.root, 'copied-policy.json');
  const policy = JSON.parse(await readFile(fixture.policyPath, 'utf8'));
  policy.runtime.distributionDir = relative(fixture.root, join(copiedRoot, 'distribution'));
  policy.runtime.journalPath = relative(fixture.root, join(copiedRoot, 'vessel', 'journal.jsonl'));
  policy.runtime.snapshotPath = relative(fixture.root, join(copiedRoot, 'vessel', 'snapshot.json'));
  await writeFile(copiedPolicyPath, `${canonicalJson(policy)}\n`, 'utf8');
  fixture.env.GODAGENT_POLICY_SHA256 = sha256Text(canonicalJson(policy));
  await assert.rejects(
    () => launchAdmittedLocalAgent({
      ...fixture,
      admissionRoot: copiedRoot,
      policyPath: copiedPolicyPath,
      requestId: 'operator:residency:copy',
      runtimeFactory: async () => { throw new Error('copy must fail before runtime'); },
      clock: fixedClock,
    }),
    (error) => error instanceof AdmittedLaunchError && error.code === 'residency-conflict',
  );
});
