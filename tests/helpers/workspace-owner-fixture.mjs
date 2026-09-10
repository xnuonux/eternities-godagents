import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Value, sha256Text } from '../../src/core/digest.mjs';
import { compileCreation } from '../../src/creation/compile.mjs';
import { admitLocalCreation } from '../../src/genesis/local-admission.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { localArtifactEffectProducer, prepareLocalArtifactEffectRequest } from '../../src/host/structured-effect-producer.mjs';
import { vesselRequest } from './identity-bound-mission-vessel-certification-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';

const json = value => `${canonicalJson(value)}\n`;
export async function workspaceOwnerFixture(t, { oldRealm = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-workspace-owner-'));
  t.after(async () => {
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child.startsWith('godagents-workspace-owner-') && !child.includes('..') && !isAbsolute(child));
    assert.equal(await realpath(root), resolve(root)); await rm(root, { recursive: true, force: true });
  });
  const source = join(root, 'creation-source');
  await cp(new URL('../../fixtures/creation/', import.meta.url), source, { recursive: true });
  const capabilities = ['artifact.publish', 'artifact.verify', ...(!oldRealm ? ['workspace.export', 'workspace.revise', 'workspace.test'] : [])];
  for (const [file, mutate] of [
    ['creation-candidate.json', v => { v.realm.requiredCapabilities = capabilities; }],
    ['creation-policy.json', v => { v.allowedRealmCapabilities = capabilities; }],
    ['modules/embodiment.json', v => { v.payload.requiredRealmCapabilities = capabilities; }],
  ]) {
    const path = join(source, file), value = JSON.parse(await readFile(path, 'utf8'));
    mutate(value); await writeFile(path, json(value));
  }
  const policyPath = join(source, 'creation-policy.json'), expectedPolicyDigest = sha256Value(JSON.parse(await readFile(policyPath, 'utf8')));
  const creationDir = join(root, 'creation');
  const creation = await compileCreation({ candidatePath: join(source, 'creation-candidate.json'), policyPath,
    expectedPolicyDigest, expressionPath: join(source, 'expression-overlay.json'), moduleDirectory: join(source, 'modules'), outputDir: creationDir });
  const realm = { schemaVersion: oldRealm ? 2 : 3, profile: oldRealm ? 'local-artifact-v2' : 'local-workspace-v3',
    realmId: 'reviewed-workspace', version: '1.0.0', trustModel: 'operator-local', capabilities,
    artifactStore: { operation: 'publish-local-artifact', producerDescriptorDigest: sha256Value(localArtifactEffectProducer),
      relativeRoot: 'artifacts', maximumBytes: 65536, naming: 'sha256-canonical-json', publication: 'exclusive-hard-link', replay: 'verify-identical-canonical-json' },
    ...(!oldRealm ? { workspace: { relativeRoot: 'workspace-revisions', maximumFiles: 4, maximumRevisionBytes: 131072,
      browserProfile: 'host-reviewed-browser-local-v1', independentReviewRequired: true, sourceMutation: false } } : {}),
    privacy: { retention: 'operator-managed', automaticDeletion: false } };
  const realmContractPath = join(root, 'realm.json'), promptArtifactPath = join(root, 'prompt.md');
  await writeFile(realmContractPath, json(realm));
  await writeFile(promptArtifactPath, '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: workspace-owner.test.json -->\n# Workspace owner fixture\n');
  const workspace = join(root, 'workspace'), instanceId = 'workspace-owner-test';
  await admitLocalCreation({ creationDir, expectedPolicyDigest, expectedCreationBuildId: creation.manifest.buildId,
    realmContractPath, promptArtifactPath, workspace, instanceId, creatorRef: 'creator:dom', checkpointPurpose: 'actual workspace owner fixture' });
  const admissionRoot = join(workspace, 'admission'), providerPolicyPath = join(workspace, 'provider-policy.json');
  const providerPolicy = validOpenAICompatiblePhasePolicy(); providerPolicy.provider.profile = 'chat-completions-json-schema-reasoning-split-v1';
  await writeFile(providerPolicyPath, json(providerPolicy));
  const request = vesselRequest(); request.schemaVersion = 2; request.routeMode = 'effect-only';
  request.requestedAuthority = ['local-read', 'local-write']; request.hostCeiling.availableAuthority = [...request.requestedAuthority];
  request.mission.objective = 'repair the selected app so the add button adds exactly one item';
  const effectOnlyRepositoryRoot = 'C:/dev/eternities-godskills/.worktrees/effect-only-v2';
  const pins = {};
  for (const [field, kind] of [['routingExecutable', 'executable'], ['verifierExecutable', 'verifier']]) {
    const path = `receipts/effect-only-${kind}-v2.json`, text = await readFile(join(effectOnlyRepositoryRoot, path), 'utf8'), receipt = JSON.parse(text);
    pins[field] = { protocolId: receipt.protocolId, entrypoint: receipt.entrypoint,
      executableReceipt: { path, sha256: sha256Text(text), receiptDigest: receipt.receiptDigest } };
  }
  const requests = [];
  const createHost = async ({ credential = true, uncertain = false, propose } = {}) => createProviderPhaseHost({
    family: 'openai-compatible-chat-completions-v1', policyPath: providerPolicyPath,
    runtimeRoot: join(admissionRoot, 'vessel', 'provider-phase'),
    env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: sha256Value(providerPolicy), ...(credential ? { GODAGENT_TEST_PHASE_KEY: 'synthetic-workspace-key' } : {}) },
    fetchImpl: async (_url, init) => {
      assert.ok(credential); requests.push(JSON.parse(init.body));
      if (uncertain) throw new Error('synthetic uncertain inference');
      const body = requests.at(-1), output = await propose(body);
      return new Response(json({ id: 'workspace-fixture', object: 'chat.completion', model: body.model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content: canonicalJson(output) }) } }],
        usage: { prompt_tokens: 200, completion_tokens: 120, total_tokens: 320,
          completion_tokens_details: { reasoning_tokens: 20 }, prompt_tokens_details: { cached_tokens: 0 } } }),
      { status: 200, headers: { 'content-type': 'application/json' } });
    } });
  const inert = await createHost({ credential: false });
  const identityPolicy = { schemaVersion: 2, policyId: 'workspace-owner-fixture', realmId: realm.realmId,
    authority: request.requestedAuthority, hostContext: request.hostCeiling,
    runtime: { protocolId: 'eternities-admitted-sealed-identity-host-v2', instanceId,
      distributionDir: 'admission/distribution', journalPath: 'admission/vessel/journal.jsonl', snapshotPath: 'admission/vessel/snapshot.json',
      hostAdapterId: request.task.hostAdapterId, revocationEpoch: request.task.revocationEpoch, effectOnlyRepositoryRoot, ...pins,
      effectProducerDescriptorDigest: sha256Value(localArtifactEffectProducer), nativeTransport: inert.describe().descriptors.native,
      limits: { timeoutMs: 30000, maximumNativeMaterializedBytes: 65536, ...request.budgets,
        maxProjectionBytes: request.maxProjectionBytes, maxCycles: request.maxCycles } } };
  const identityPolicyPath = join(workspace, 'identity-policy.json'); await writeFile(identityPolicyPath, json(identityPolicy));
  const sourceRoot = join(root, 'app'); await mkdir(sourceRoot);
  const broken = await readFile(new URL('../fixtures/browser-workspace/broken.html', import.meta.url));
  const fixed = await readFile(new URL('../fixtures/browser-workspace/fixed.html', import.meta.url), 'utf8');
  await writeFile(join(sourceRoot, 'index.html'), broken);
  const policy = { schemaVersion: 1, protocolId: 'eternities-workspace-owner-policy-v1', admissionRoot,
    identityPolicyPath, identityPolicyDigest: sha256Value(identityPolicy),
    request: prepareLocalArtifactEffectRequest(request, { expectedProducerDescriptorDigest: sha256Value(localArtifactEffectProducer) }),
    source: { sourceRoot, files: [{ path: 'index.html', sha256: sha256Text(broken.toString('utf8')) }] },
    repairBudget: { maxAttempts: 3, totalCompletionTokens: 2800 },
    storeLimits: { maxFiles: 4, maxFileBytes: 65536, maxTotalBytes: 131072, maxRevisions: 8, maxStoreBytes: 1048576 } };
  return { root, workspace, policy, requests, createHost, registryRoot: join(root, 'registry'), broken, fixed };
}
