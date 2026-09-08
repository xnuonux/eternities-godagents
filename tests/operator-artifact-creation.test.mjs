import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { runCreatorCli } from '../src/creator/local-cli.mjs';
import { loadVerifiedCreationBuild } from '../src/creation/compile.mjs';
import { loadVerifiedDistribution } from '../src/foundry/compile.mjs';
import { defaultLocalInstanceRegistryRoot } from '../src/host/local-instance-registry.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { prepareLocalWorkflow } from '../examples/local-artifact-workflow/prepare.mjs';
import { runLocalWorkflow } from '../examples/local-artifact-workflow/run.mjs';

const library = fileURLToPath(new URL('../examples/local-artifact-workflow/operator-library/', import.meta.url));
const json = value => `${canonicalJson(value)}\n`;
async function creator(argv) {
  let stdout = ''; let stderr = '';
  const code = await runCreatorCli({ argv, stdout: { write: text => { stdout += text; } },
    stderr: { write: text => { stderr += text; } } });
  return { code, value: JSON.parse(stdout || stderr) };
}

test('standalone operator sources create a fresh admitted agent and a replayable accepted artifact', async t => {
  // Catches a broken public creation/admission path, widened Realm capabilities,
  // or replay dispatch. No fixture identity or creation factory supplies inputs.
  const root = await mkdtemp(join(tmpdir(), 'godagent-operator-starter-'));
  const instanceId = `operator-starter-${randomUUID()}`;
  const workspace = join(root, 'workspace');
  t.after(async () => {
    assert.equal(resolve(dirname(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('godagent-operator-starter-'));
    const recordPath = join(defaultLocalInstanceRegistryRoot(), `${sha256Text(instanceId)}.json`);
    try {
      const record = JSON.parse(await readFile(recordPath, 'utf8'));
      assert.equal(record.instanceId, instanceId);
      assert.equal(resolve(record.admissionRoot), resolve(join(workspace, 'admission')));
      await rm(recordPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rm(root, { recursive: true, force: true });
  });
  const localLibrary = join(root, 'library');
  await cp(library, localLibrary, { recursive: true });
  const policyPath = join(localLibrary, 'creation-policy.json');
  const expectedPolicyDigest = sha256Value(JSON.parse(await readFile(policyPath, 'utf8')));
  const common = ['--policy', policyPath, '--policy-digest', expectedPolicyDigest,
    '--modules', join(localLibrary, 'modules'), '--expressions', join(localLibrary, 'expressions'),
    '--presets', join(localLibrary, 'presets')];
  const selection = ['--preset', 'preset:evidence-steward@1.0.0', '--creator', 'creator:operator-test'];
  assert.equal((await creator(['catalog', ...common])).code, 0);
  const review = await creator(['preview-preset', ...common, ...selection]);
  assert.equal(review.code, 0);
  assert.equal(review.value.status, 'ready');
  const creationDir = join(root, 'creation');
  const finalize = ['finalize-preset', ...common, ...selection, '--expected-preview-digest', review.value.previewDigest,
    '--source-dir', join(root, 'selected-source'), '--output-dir', creationDir];
  const wrongPreview = [...finalize];
  wrongPreview[wrongPreview.indexOf('--expected-preview-digest') + 1] = '0'.repeat(64);
  assert.equal((await creator(wrongPreview)).code, 3);
  const wrongPolicy = [...finalize];
  wrongPolicy[wrongPolicy.indexOf('--policy-digest') + 1] = '0'.repeat(64);
  assert.notEqual((await creator(wrongPolicy)).code, 0);
  const voicePath = join(localLibrary, 'modules', 'voice-quiet-precise.json');
  const originalVoice = await readFile(voicePath, 'utf8');
  const changedVoice = JSON.parse(originalVoice);
  changedVoice.payload.tone = 'changed after review';
  await writeFile(voicePath, json(changedVoice));
  assert.notEqual((await creator(finalize)).code, 0);
  await writeFile(voicePath, originalVoice);
  const finalized = await creator(finalize);
  assert.equal(finalized.code, 0);
  const creation = await loadVerifiedCreationBuild(creationDir, { expectedPolicyDigest });
  assert.equal(creation.manifest.buildId, finalized.value.creationBuildId);
  assert.equal(creation.expression.name, 'Evidence Steward');
  assert.deepEqual(creation.genome.realm.requiredCapabilities, ['artifact.publish', 'artifact.verify']);
  assert.deepEqual(creation.genome.soulPort, { schemaVersion: 1, status: 'dormant' });
  assert.deepEqual(creation.genome.evolution, { policy: 'frozen-v0' });

  const providerPolicy = {
    schemaVersion: 1, protocolId: 'eternities-openai-compatible-phase-transport-policy-v1', policyId: 'controlled-operator-starter',
    provider: { profile: 'chat-completions-json-schema-reasoning-split-v1', endpointOrigin: 'https://models.example.test',
      endpointPath: '/v1/chat/completions', modelId: 'controlled-starter-model', credentialEnv: 'GODAGENT_TEST_PHASE_KEY',
      timeoutMs: 30000, maximumRequestBytes: 1048576, maximumResponseBytes: 1048576 },
    phases: { native: { maximumDispatchBytes: 1048576, maximumCompletionBytes: 1048576, maximumCompletionTokens: 1000 },
      review: { maximumCompletionBytes: 1048576, maximumCompletionTokens: 500 },
      revision: { maximumCompletionBytes: 1048576, maximumCompletionTokens: 800 } },
  };
  const providerPolicyPath = join(root, 'provider-policy.json');
  await writeFile(providerPolicyPath, json(providerPolicy));
  const repositoryRoot = 'C:/dev/eternities-godskills/.worktrees/effect-only-v2';
  const effectOnly = { repositoryRoot,
    producerDescriptorDigest: 'bd00071f046bd5f8612a65cfe674d417b8b21c3fb25bad41634bb734b08bfc26' };
  for (const [field, kind] of [['routingExecutable', 'executable'], ['verifierExecutable', 'verifier']]) {
    const path = `receipts/effect-only-${kind}-v2.json`;
    const bytes = await readFile(join(repositoryRoot, path), 'utf8');
    const receipt = JSON.parse(bytes);
    effectOnly[field] = { protocolId: receipt.protocolId, entrypoint: receipt.entrypoint,
      executableReceipt: { path, sha256: sha256Text(bytes), receiptDigest: receipt.receiptDigest } };
  }
  const authority = ['local-read', 'local-write', 'realm:write'];
  const hostCeiling = { availableAuthority: authority, permittedEffects: ['local-read', 'local-write'],
    availablePreconditions: ['realm-observed'], forbiddenCapabilities: [], maximumRisk: 'moderate',
    minimumEvidenceConfidence: 'verified', contextBudget: 16000, maxCompositionSize: 3 };
  const budgets = { maxArtifactBytes: 8192, nativeCompletionTokens: 1000, reviewCompletionTokensPerRound: 500,
    revisionCompletionTokens: 800, totalCompletionTokens: 2800 };
  const request = prepareLocalArtifactEffectRequest({ schemaVersion: 2, routeMode: 'effect-only',
    task: { taskId: 'operator-starter-task', hostAdapterId: 'universal-mission-vessel-v1', revocationEpoch: 0 },
    mission: { missionId: `starter-${randomUUID()}`, objective: 'write an evidence-bounded answer to two plus two',
      successEvidence: ['a correct answer is published'], stopConditions: ['required authority is absent'] },
    observation: { observationId: 'operator-observation', summary: 'two plus two', evidenceDigests: [] },
    requestedAuthority: authority, explicitMethodRequests: [], hostCeiling, budgets,
    sourceStateEpoch: 0, maxCycles: 4, maxProjectionBytes: 65536 },
  { expectedProducerDescriptorDigest: effectOnly.producerDescriptorDigest });
  const prepared = await prepareLocalWorkflow({ workspace, configuration: {
    schemaVersion: 3, admission: { creationDir, expectedPolicyDigest,
      expectedCreationBuildId: creation.manifest.buildId, promptArtifactPath: join(localLibrary, 'prompt-os.md'),
      realmContractPath: join(localLibrary, 'realm-contract.json'), instanceId, creatorRef: 'creator:operator-test',
      checkpointPurpose: 'controlled fresh operator proof; no live model or Soul' },
    family: 'openai-compatible-chat-completions-v1', providerPolicyPath, effectOnly, request,
    hostPolicy: { policyId: 'operator-starter-host', realmId: 'operator-artifacts', authority, hostContext: hostCeiling,
      limits: { timeoutMs: 30000, maximumNativeMaterializedBytes: 65536, ...budgets, maxProjectionBytes: 65536, maxCycles: 4 } },
  } });
  const manifest = JSON.parse(await readFile(prepared.manifestPath, 'utf8'));
  const distribution = await loadVerifiedDistribution(join(workspace, 'admission', 'distribution'));
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(distribution.manifest.schemaVersion, 1);
  assert.equal(distribution.realmContract.schemaVersion, 2);
  assert.equal(manifest.realmBinding.distributionBuildId, distribution.manifest.buildId);
  assert.equal(manifest.realmBinding.contractDigest, sha256Value(distribution.realmContract));
  assert.equal(distribution.realmContract.trustModel, 'operator-local');
  let calls = 0;
  const result = await runLocalWorkflow({ manifestPath: prepared.manifestPath, expectedManifestDigest: prepared.manifestDigest,
    env: { GODAGENT_TEST_PHASE_KEY: 'synthetic-operator-key' },
    createProviderPhaseHostImpl: options => createProviderPhaseHost({ ...options, fetchImpl: async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      return new Response(json({ id: 'controlled-operator', object: 'chat.completion', model: body.model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content: 'four' }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
          completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } } }),
      { status: 200, headers: { 'content-type': 'application/json' } });
    } }),
  });
  assert.equal(result.status, 'completed');
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await readFile(result.artifact.path, 'utf8')).content, 'four');
  const cli = fileURLToPath(new URL('../examples/local-artifact-workflow/cli.mjs', import.meta.url));
  const guard = new URL('../src/certification/no-network-guard.mjs', import.meta.url).href;
  const replay = spawnSync(process.execPath, ['--import', guard, cli, 'run', '--manifest', prepared.manifestPath,
    '--manifest-digest', prepared.manifestDigest], { encoding: 'utf8', windowsHide: true, timeout: 20000,
    env: { SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA } });
  assert.equal(replay.status, 0, replay.stderr);
  const replayed = JSON.parse(replay.stdout);
  assert.equal(replayed.artifact.replayed, true);
  assert.equal(replayed.artifact.artifactDigest, result.artifact.artifactDigest);
});
