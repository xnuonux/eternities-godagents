import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

import { createOpenAICompatibleCortex } from '../src/cortex/openai-compatible.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { compileDistribution } from '../src/foundry/compile.mjs';
import { runLocalHost } from '../src/host/local-cli.mjs';
import { createFixtureRealm } from '../src/realm/fixture-realm.mjs';
import { createFixtureCortexA, createFixtureCortexB } from '../src/runtime/fixture-cortex.mjs';
import { createVessel } from '../src/runtime/vessel.mjs';
import { createLocalGodskillsTransport } from '../src/skills/godskills-adapter.mjs';
import { createGodskillsAdapter } from '../src/skills/mission-binder.mjs';
import { readVerifiedJournal } from '../src/state/journal.mjs';

const CANARY = 'canary-end-to-end-provider-secret';
const fixedNow = '2026-08-29T12:00:00.000Z';
const fixturePath = (name) => new URL(`../fixtures/${name}`, import.meta.url);
const contract = JSON.parse(await readFile(fixturePath('realm-contract.json'), 'utf8'));

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
  return { root, policyPath, missionPath, fetchImpl, policyDigest: sha256Text(canonicalJson(policy)) };
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
