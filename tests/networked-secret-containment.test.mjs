import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

import { createOpenAICompatibleCortex } from '../src/cortex/openai-compatible.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { compileDistribution } from '../src/foundry/compile.mjs';
import { executeNetworkedVessel, runLocalHost } from '../src/host/local-cli.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createFixtureCortexA, createFixtureCortexB } from '../src/runtime/fixture-cortex.mjs';
import { createVessel } from '../src/runtime/vessel.mjs';
import { createLocalGodskillsTransport } from '../src/skills/godskills-adapter.mjs';
import { createGodskillsAdapter } from '../src/skills/mission-binder.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const CANARY = 'canary-end-to-end-provider-secret';
const POLICY_DIGEST = 'bf9e6878399b4edeb4ff6bb77d234fdf646b53fd62ba6e1448b4374246d4c41d';
const EVIDENCE_DIGEST = '9a14d4296158c65c3929938c5c54b5f7f4b6a5ffeb5b0a827b3f8b25814f5e07';
const TRUST_ROOT_DIGEST = 'c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7';
const fixedNow = '2026-08-29T12:00:00.000Z';
const fixturePath = (name) => new URL(`../fixtures/${name}`, import.meta.url);
const contract = JSON.parse(await readFile(fixturePath('realm-contract.json'), 'utf8'));

const activationPin = Object.freeze({
  protocolId: 'eternities-godskills-activation-v1',
  executableReceipt: {
    path: 'receipts/adaptive-activation-executable-v1.json',
    sha256: '98ebeb63db38b67608cf71b1b511b807cfe2d96e17e9b1bc54e7dbb536f8403f',
    receiptDigest: TRUST_ROOT_DIGEST,
  },
  parentReceipt: {
    path: 'receipts/adaptive-activation-v1.json',
    sha256: '6c6d689ecf9df14823407a917e89a5848776fb50eca3b7acc0d70056ae305f70',
    receiptDigest: 'a28a0af7e588f2abbbe1d51a15775dfbeb8d565109d0a176711bfa73b520440f',
  },
  entrypoint: { path: 'scripts/activation.mjs', sha256: 'e19ceef6a781d1d82a82fb17c519755526dc17fa979474b99f291d6eaa17788a' },
  compiler: { path: 'src/adaptive-activation.mjs', sha256: '9844aee1147f7129f3e37067424ccebb88ff478de1b7a9a9fb7306d5f2fdbd82' },
  dependencies: [
    { path: 'scripts/build-adaptive-activation-executable-receipt.mjs', sha256: 'd35fa44632711c64c1e23f84f80fc0edfb5adbed4261ef88b7d9c32de2d96486' },
    { path: 'src/adaptive-activation-protocol.mjs', sha256: 'e697fe37d18a76de22ca4fdcd8ade6089bceddb20baad971e895bc49c9b0172e' },
    { path: 'src/io.mjs', sha256: '48dca2b203947e12ca3d5500b70a25066a8166d86bc2284aaeed6abf622a5c37' },
    { path: 'src/static-module-closure.mjs', sha256: '3bb0d825e6838b901315e685f9e5b02c94dac316ccb7788f54cd6fd18cd6a6ab' },
  ],
  schemas: {
    request: { path: 'schemas/adaptive-activation-request.v1.schema.json', sha256: 'bcadd846b96809733837183e12dba6f8d094409aa7c16e5676fa63357e3c2cde' },
    result: { path: 'schemas/adaptive-activation-result.v1.schema.json', sha256: '0a069a5eb121e625aa4ea529cbb48783e266e4c7c7f36f93ee24749303dd4391' },
  },
  policy: {
    path: 'policies/adaptive-activation.v1.json',
    sha256: 'b87bbfaddecb42417e57202173220bf240204d27b7de5fffc9e609eb18138939',
    logicalDigest: POLICY_DIGEST,
  },
  evidence: {
    path: 'artifacts/adaptive-activation/evidence.v1.json',
    sha256: 'b55a5cb4f7ff039cc7f4027c165b2f151bad723d9030913076a4225342fbe8c5',
    logicalDigest: EVIDENCE_DIGEST,
  },
  contract: { path: 'artifacts/adaptive-activation/neutral-contract.json', sha256: 'feade348d3fd31afd5103eb296181f68000186d3193a995e4b77c25a06e57c92' },
});

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

async function createDistribution(root, adapters) {
  const genome = JSON.parse(await readFile(fixturePath('agent-genome.json'), 'utf8'));
  genome.blueprint = { id: 'networked-containment-agent', version: '0.2.0' };
  genome.cortex.allowedAdapters = adapters;
  const genomePath = join(root, 'agent-genome.json');
  await writeFile(genomePath, `${JSON.stringify(genome, null, 2)}\n`, 'utf8');
  const distributionDir = join(root, 'distribution');
  await compileDistribution({
    genomePath,
    promptArtifactPath: fixturePath('prompt-os-artifact.md'),
    realmContractPath: fixturePath('realm-contract.json'),
    outputDir: distributionDir,
  });
  return distributionDir;
}

function providerEnvelope(content, model = 'test-model') {
  return JSON.stringify({
    id: 'completion-1',
    object: 'chat.completion',
    created: 1788000000,
    model,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 31, completion_tokens: 47, total_tokens: 78 },
  });
}

function proposal(counter, overrides = {}) {
  return {
    sourceStateEpoch: 0,
    claim: 'advance the observed counter once',
    intent: { effect: 'local-write', handId: 'counter.increment', amount: 1 },
    expectedOutcome: { counter: counter + 1 },
    cost: 1,
    risk: 'low',
    uncertainty: 'provider-proposal',
    requiredAuthority: ['realm:write'],
    preconditions: ['realm-observed'],
    expiresAt: '2026-08-29T12:01:00.000Z',
    priority: 10,
    ...overrides,
  };
}

function nativeActivationResult(request) {
  const decisions = request.selected.map(({ selectedId }) => {
    const unsigned = {
      schemaVersion: 1,
      selectedId,
      taskClass: request.classification.taskClass,
      consequenceClass: request.classification.consequenceClass,
      mode: 'native',
      reasonCodes: ['fixture-native'],
      preInferenceDisclosure: 'none',
      deferredReview: false,
      methodEvidence: {
        eligible: false,
        matchedEvaluations: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        criticalRegressions: 0,
        overheadRatio: null,
        failedGates: ['fixture-evidence'],
      },
      policyDigest: POLICY_DIGEST,
      evidenceDigest: EVIDENCE_DIGEST,
      authorityProjection: structuredClone(request.authorityProjection),
      authorityExpanded: false,
    };
    return { ...unsigned, decisionDigest: sha256Text(canonicalJson(unsigned)) };
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: request.protocolId,
    requestId: request.requestId,
    requestDigest: sha256Text(canonicalJson(request)),
    trustRootDigest: request.trustRootDigest,
    policyDigest: POLICY_DIGEST,
    evidenceDigest: EVIDENCE_DIGEST,
    classification: structuredClone(request.classification),
    decisions,
  };
  return { ...unsigned, resultDigest: sha256Text(canonicalJson(unsigned)) };
}

async function allTextFiles(root) {
  const rows = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else rows.push({ path: relative(root, path), text: await readFile(path, 'utf8') });
    }
  }
  await walk(root);
  return rows;
}

function sink() {
  let text = '';
  return { write(chunk) { text += chunk; }, read() { return text; } };
}

async function hostWorkspace(t, name, providerContent) {
  const root = await mkdtemp(join(tmpdir(), `godagent-containment-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createDistribution(root, ['openai-compatible-v1']);
  const policy = JSON.parse(await readFile(fixturePath('host-policy.json'), 'utf8'));
  policy.runtime = {
    instanceId: `instance-${name}`,
    distributionDir: './distribution',
    journalPath: './state/events.jsonl',
    snapshotPath: './state/snapshot.json',
    godskillsRelease: policy.runtime.godskillsRelease,
  };
  policy.provider.credentialEnv = 'GODAGENT_CONTAINMENT_KEY';
  const policyPath = join(root, 'policy.json');
  const missionPath = join(root, 'mission.txt');
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  await writeFile(
    missionPath,
    'resolve conflicting runtime constraints into an implementation-ready system architecture\n',
    'utf8',
  );
  const fetchImpl = async (_url, request) => {
    assert.equal(request.headers.authorization, `Bearer ${CANARY}`);
    const body = JSON.parse(request.body);
    const user = JSON.parse(body.messages[1].content);
    const content = user.methodEnvelopeDigest
      ? { ...providerContent, methodEnvelopeDigest: user.methodEnvelopeDigest }
      : providerContent;
    return new Response(providerEnvelope(content), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { root, policy, policyPath, missionPath, fetchImpl, policyDigest: sha256Text(canonicalJson(policy)) };
}

test('end-to-end local host leaves the canary credential out of every durable and emitted surface', async (t) => {
  const workspace = await hostWorkspace(t, 'success', proposal(0));
  const stdout = sink();
  const stderr = sink();
  const code = await runLocalHost({
    argv: ['--policy', workspace.policyPath, '--mission', workspace.missionPath],
    env: { GODAGENT_CONTAINMENT_KEY: CANARY, GODAGENT_POLICY_SHA256: workspace.policyDigest },
    stdout,
    stderr,
    fetchImpl: workspace.fetchImpl,
    clock: () => fixedNow,
  });

  assert.equal(code, 0, stderr.read());
  assert.equal(stderr.read(), '');
  assert.equal(JSON.parse(stdout.read()).status, 'completed');
  const surfaces = [...await allTextFiles(workspace.root), { path: 'stdout', text: stdout.read() }, { path: 'stderr', text: stderr.read() }];
  for (const surface of surfaces) assert.equal(surface.text.includes(CANARY), false, surface.path);

  const journal = await readVerifiedJournal(join(workspace.root, 'state', 'events.jsonl'));
  const inferencePayloads = journal.events
    .filter((event) => event.eventType.startsWith('cortex.'))
    .map((event) => event.payload);
  assert.equal(JSON.stringify(inferencePayloads).includes('authorization'), false);
  assert.equal(JSON.stringify(inferencePayloads).includes('rawResponse'), false);
});

test('explicit adaptive host keeps credentials continuity memory Realm handles and unselected bodies out of every boundary', async (t) => {
  const workspace = await hostWorkspace(t, 'adaptive-secrets', proposal(0));
  const policy = structuredClone(workspace.policy);
  policy.runtime.godskillsRelease.activation = structuredClone(activationPin);
  await writeFile(workspace.policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const canaries = [
    CANARY,
    'canary-keel-state-private',
    'canary-raw-memory-private',
    'canary-realm-handle-private',
    'canary-unselected-skill-body-private',
  ];
  let classifierProjection;
  let activationRequest;
  let activationResult;
  let cortexRequestBody;
  const result = await executeNetworkedVessel({
    policy,
    policyDigest: sha256Text(canonicalJson(policy)),
    policyPath: workspace.policyPath,
    mission: {
      requestId: 'mission-adaptive-secret-boundary',
      text: 'resolve conflicting runtime constraints into an implementation-ready system architecture',
      authority: [...policy.authority],
      hostContext: structuredClone(policy.hostContext),
      keelState: canaries[1],
      rawMemory: canaries[2],
      realmHandle: { credential: canaries[3] },
      unselectedSkillBody: canaries[4],
    },
    credentialResolver: Object.freeze({ resolve: () => CANARY }),
    fetchImpl: async (url, request) => {
      cortexRequestBody = request.body;
      return workspace.fetchImpl(url, request);
    },
    clock: () => fixedNow,
    activationClassifier: (projection) => {
      classifierProjection = projection;
      return { taskClass: 'implementation', consequenceClass: 'low', reviewAvailable: false };
    },
    activationTransport: (request) => {
      activationRequest = request;
      activationResult = nativeActivationResult(request);
      return activationResult;
    },
  });

  assert.equal(result.status, 'completed');
  const surfaces = [
    ...await allTextFiles(workspace.root),
    { path: 'classifier-projection', text: JSON.stringify(classifierProjection) },
    { path: 'activation-request', text: JSON.stringify(activationRequest) },
    { path: 'activation-result', text: JSON.stringify(activationResult) },
    { path: 'cortex-request', text: cortexRequestBody },
    { path: 'host-result', text: JSON.stringify(result) },
  ];
  for (const surface of surfaces) {
    for (const canary of canaries) assert.equal(surface.text.includes(canary), false, `${surface.path}: ${canary}`);
  }
  assert.deepEqual(Object.keys(classifierProjection).sort(), ['mission', 'selected']);
  assert.deepEqual(Object.keys(activationRequest).sort(), [
    'authorityProjection', 'classification', 'protocolId', 'requestId', 'schemaVersion', 'selected', 'trustRootDigest',
  ].sort());
});

test('networked host rejects every partial adaptive state before routing or inference', async (t) => {
  const workspace = await hostWorkspace(t, 'adaptive-partial', proposal(0));
  const legacyPolicy = structuredClone(workspace.policy);
  const adaptivePolicy = structuredClone(workspace.policy);
  adaptivePolicy.runtime.godskillsRelease.activation = structuredClone(activationPin);
  const calls = { classify: 0, activate: 0, infer: 0 };
  const classifier = () => {
    calls.classify += 1;
    return { taskClass: 'implementation', consequenceClass: 'low', reviewAvailable: false };
  };
  const activationTransport = () => {
    calls.activate += 1;
    throw new Error('activation must not run');
  };
  const common = {
    policyDigest: 'f'.repeat(64),
    policyPath: workspace.policyPath,
    mission: {
      requestId: 'mission-partial-adaptive-state',
      text: 'verify adaptive host closure',
      authority: [...legacyPolicy.authority],
      hostContext: structuredClone(legacyPolicy.hostContext),
    },
    credentialResolver: Object.freeze({ resolve: () => CANARY }),
    fetchImpl: async () => { calls.infer += 1; throw new Error('inference must not run'); },
    clock: () => fixedNow,
  };
  for (const options of [
    { policy: adaptivePolicy },
    { policy: adaptivePolicy, activationClassifier: classifier },
    { policy: adaptivePolicy, activationTransport },
    { policy: legacyPolicy, activationClassifier: classifier, activationTransport },
  ]) {
    await assert.rejects(executeNetworkedVessel({ ...common, ...options }), /activation/i);
  }
  assert.deepEqual(calls, { classify: 0, activate: 0, infer: 0 });
});

test('provider output cannot manufacture host authority or reach a Realm hand', async (t) => {
  const workspace = await hostWorkspace(t, 'authority', proposal(0, { requiredAuthority: ['realm:write', 'realm:admin'] }));
  const stdout = sink();
  const stderr = sink();
  const code = await runLocalHost({
    argv: ['--policy', workspace.policyPath, '--mission', workspace.missionPath],
    env: { GODAGENT_CONTAINMENT_KEY: CANARY, GODAGENT_POLICY_SHA256: workspace.policyDigest },
    stdout,
    stderr,
    fetchImpl: workspace.fetchImpl,
    clock: () => fixedNow,
  });
  const journal = await readVerifiedJournal(join(workspace.root, 'state', 'events.jsonl'));

  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(stderr.read()), { status: 'failed', reasonCode: 'semantic-rejected' });
  assert.equal(journal.events.some((event) => event.eventType === 'decision.committed'), false);
  assert.equal(journal.events.some((event) => event.eventType === 'action.invoking'), false);
});

test('provider-reflected credential is rejected before accepted-proposal journaling', async (t) => {
  const workspace = await hostWorkspace(t, 'reflected-secret', proposal(0, { claim: `reflected ${CANARY}` }));
  const stdout = sink();
  const stderr = sink();
  const code = await runLocalHost({
    argv: ['--policy', workspace.policyPath, '--mission', workspace.missionPath],
    env: { GODAGENT_CONTAINMENT_KEY: CANARY, GODAGENT_POLICY_SHA256: workspace.policyDigest },
    stdout,
    stderr,
    fetchImpl: workspace.fetchImpl,
    clock: () => fixedNow,
  });
  const journalText = await readFile(join(workspace.root, 'state', 'events.jsonl'), 'utf8');

  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(stderr.read()), { status: 'failed', reasonCode: 'schema-rejected' });
  assert.equal(journalText.includes(CANARY), false);
  assert.equal(journalText.includes('cortex.accepted'), false);
});

test('fixture to networked to fixture cortex migration preserves the vessel and dormant Soul', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'godagent-three-cortex-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const distributionDir = await createDistribution(root, ['fixture-a', 'openai-compatible-v1', 'fixture-b']);
  const realm = createFixtureRealm({ contract });
  const godskillsTransport = await createLocalGodskillsTransport({ repositoryRoot: 'C:/dev/eternities-godskills' });
  const policy = JSON.parse(await readFile(fixturePath('host-policy.json'), 'utf8'));
  const godskillsAdapter = await createGodskillsAdapter({
    releasePin: policy.runtime.godskillsRelease,
    transport: godskillsTransport,
  });
  const common = {
    distributionDir,
    instanceId: 'three-cortex-vessel',
    journalPath: join(root, 'events.jsonl'),
    snapshotPath: join(root, 'snapshot.json'),
    realm,
    godskillsAdapter,
    clock: () => fixedNow,
  };
  const mission = (id) => ({
    requestId: id,
    text: 'resolve conflicting runtime constraints into an implementation-ready system architecture',
    authority: ['local-read', 'local-write', 'realm:write'],
    hostContext,
  });

  const first = await createVessel({ ...common, cortex: createFixtureCortexA() });
  const firstResult = await first.runCycle(mission('mission-a'));
  assert.equal(firstResult.status, 'completed', JSON.stringify(firstResult));
  const baseline = first.inspect();

  const networked = createOpenAICompatibleCortex({
    adapterId: 'openai-compatible-v1',
    profile: 'chat-completions-json',
    endpoint: 'https://models.example.test/v1/chat/completions',
    modelId: 'test-model',
    timeoutMs: 5000,
    maxResponseBytes: 16384,
    maxProposalTtlMs: 120000,
    maxPromptBytes: 32768,
    maxCompletionTokens: 128,
    transport: async ({ body }) => {
      const user = JSON.parse(JSON.parse(body).messages[1].content);
      return {
        status: 200,
        headers: {},
        bodyText: providerEnvelope(proposal(1, {
          sourceStateEpoch: 1,
          methodEnvelopeDigest: user.methodEnvelopeDigest,
        })),
      };
    },
    resolveCredential: () => CANARY,
  });
  const middle = await createVessel({
    ...common,
    cortex: networked,
    inferencePolicy: {
      maxAttempts: 1,
      retryableReasonCodes: [],
      hostPolicyId: 'migration-policy',
      hostPolicyDigest: 'f'.repeat(64),
      maxCompletionTokens: 128,
      maxCycleCompletionTokens: 128,
    },
  });
  const middleResult = await middle.runCycle(mission('mission-networked'));
  assert.equal(middleResult.status, 'completed', JSON.stringify(middleResult));

  const third = await createVessel({ ...common, cortex: createFixtureCortexB() });
  const thirdResult = await third.runCycle(mission('mission-b'));
  assert.equal(thirdResult.status, 'completed', JSON.stringify(thirdResult));
  const final = third.inspect();
  const journalText = await readFile(common.journalPath, 'utf8');

  assert.equal(final.instanceId, baseline.instanceId);
  assert.equal(final.constitutionDigest, baseline.constitutionDigest);
  assert.equal(final.artifactId, baseline.artifactId);
  assert.deepEqual(final.soulPort, { schemaVersion: 1, status: 'dormant' });
  assert.equal(final.epoch, 3);
  assert.equal(realm.inspect().counter, 3);
  assert.equal(journalText.includes(CANARY), false);
});
