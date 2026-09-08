import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { loadIdentityHostPolicy } from '../src/host/identity-policy.mjs';
import { verifyIdentityHostRequest } from '../src/host/admitted-sealed-identity-launch.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { defaultLocalInstanceRegistryRoot } from '../src/host/local-instance-registry.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { setupAdmittedIdentity, expectedCreationPolicyDigest } from './helpers/admitted-identity-fixture.mjs';
import { vesselRequest } from './helpers/identity-bound-mission-vessel-certification-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import { runLocalWorkflowCli } from '../examples/local-artifact-workflow/cli.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';

for (const scenario of ['authority-required', 'accepted', 'rejected', 'uncertain', 'effect-only-prepare']) {
test(`local workflow ${scenario}: preparation and real host execution`, async (t) => {
  const suffix = `local-workflow-${randomUUID()}`;
  const source = await setupAdmittedIdentity(null, suffix);
  const workspace = join(source.root, 'operator-workspace');
  t.after(async () => {
    const recordPath = join(defaultLocalInstanceRegistryRoot(), `${sha256Text(source.admission.instanceId)}.json`);
    try {
      const record = JSON.parse(await readFile(recordPath, 'utf8'));
      if (record.instanceId === source.admission.instanceId
          && record.admissionRoot === join(workspace, 'admission')) await rm(recordPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rm(source.root, { recursive: true, force: true });
  });
  const providerPolicyPath = join(source.root, 'operator-provider-policy.json');
  const providerPolicy = validOpenAICompatiblePhasePolicy();
  await writeFile(providerPolicyPath, `${canonicalJson(providerPolicy)}\n`);
  const request = vesselRequest();
  request.mission.missionId = `mission-${randomUUID()}`;
  request.mission.objective = 'write a short answer to the supplied arithmetic question';
  request.observation.summary = 'the question is: what is two plus two?';
  if (scenario !== 'authority-required') {
    request.requestedAuthority = ['local-read', 'local-write', 'realm:write'];
    request.hostCeiling.availableAuthority = ['local-read', 'local-write', 'realm:write'];
  }
  if (scenario === 'rejected') {
    request.mission.objective = 'direct a consequential visual identity across several design layers and reconcile narrative motion with interface art direction';
  }
  const configuration = {
    admission: {
      creationDir: join(source.root, 'compiled-creation'),
      expectedPolicyDigest: expectedCreationPolicyDigest,
      expectedCreationBuildId: source.creation.manifest.buildId,
      promptArtifactPath: join(source.root, 'prompt-os.md'),
      realmContractPath: join(source.root, 'realm-contract.json'),
      instanceId: source.admission.instanceId,
      creatorRef: 'creator:dom',
      checkpointPurpose: 'controlled local workflow test; Soul dormant',
    },
    family: 'openai-compatible-chat-completions-v1',
    providerPolicyPath,
    releasePin: pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    routingPin: pinnedGodskillsRoutingExecutable(),
    request,
    hostPolicy: {
      policyId: 'local-workflow-test-policy',
      realmId: 'fixture-workbench',
      authority: request.requestedAuthority,
      hostContext: request.hostCeiling,
      limits: {
        timeoutMs: 30_000,
        maximumGodskillsDispatchBytes: 1_048_576,
        maximumGodskillsCompletionBytes: 1_048_576,
        maximumGodskillsResultBytes: 1_048_576,
        maximumNativeMaterializedBytes: 65_536,
        ...request.budgets,
        maxProjectionBytes: request.maxProjectionBytes,
        maxCycles: request.maxCycles,
      },
    },
    maximumReviewMaterializedBytes: 65_536,
    maximumRevisionMaterializedBytes: 32_768,
  };
  const { prepareLocalWorkflow } = await import('../examples/local-artifact-workflow/prepare.mjs');
  const { runLocalWorkflow } = await import('../examples/local-artifact-workflow/run.mjs');
  if (scenario === 'effect-only-prepare') {
    configuration.schemaVersion = 2;
    const repositoryRoot = 'C:/dev/eternities-godskills/.worktrees/effect-only-v2';
    configuration.effectOnly = { repositoryRoot,
      producerDescriptorDigest: 'bd00071f046bd5f8612a65cfe674d417b8b21c3fb25bad41634bb734b08bfc26' };
    for (const [field, kind] of [['routingExecutable', 'executable'], ['verifierExecutable', 'verifier']]) {
      const path = `receipts/effect-only-${kind}-v2.json`;
      const bytes = await readFile(join(repositoryRoot, path), 'utf8');
      const receipt = JSON.parse(bytes);
      configuration.effectOnly[field] = { protocolId: receipt.protocolId, entrypoint: receipt.entrypoint,
        executableReceipt: { path, sha256: sha256Text(bytes), receiptDigest: receipt.receiptDigest } };
    }
    for (const key of ['releasePin', 'routingPin', 'maximumReviewMaterializedBytes', 'maximumRevisionMaterializedBytes']) delete configuration[key];
    for (const key of ['maximumGodskillsDispatchBytes', 'maximumGodskillsCompletionBytes', 'maximumGodskillsResultBytes']) delete configuration.hostPolicy.limits[key];
    configuration.request = prepareLocalArtifactEffectRequest({ ...request, schemaVersion: 2, routeMode: 'effect-only' },
      { expectedProducerDescriptorDigest: configuration.effectOnly.producerDescriptorDigest });
  }
  const noNetwork = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('preparation must not call a provider');
  });
  let prepared;
  if (scenario === 'accepted' || scenario === 'effect-only-prepare') {
    const configPath = join(source.root, 'workflow-config.json');
    const relativeConfig = structuredClone(configuration);
    relativeConfig.providerPolicyPath = 'operator-provider-policy.json';
    for (const key of ['creationDir', 'promptArtifactPath', 'realmContractPath']) {
      relativeConfig.admission[key] = relative(source.root, relativeConfig.admission[key]);
    }
    if (scenario === 'effect-only-prepare') {
      relativeConfig.effectOnly.repositoryRoot = relative(source.root, relativeConfig.effectOnly.repositoryRoot);
    } else relativeConfig.releasePin.repositoryRoot = relative(source.root, relativeConfig.releasePin.repositoryRoot);
    await writeFile(configPath, `${canonicalJson(relativeConfig)}\n`);
    let output = '';
    const exit = await runLocalWorkflowCli({ argv: ['prepare', '--config', configPath, '--workspace', workspace],
      stdout: { write: (text) => { output += text; } }, stderr: { write: () => {} } });
    assert.equal(exit, 0, 'CLI must prepare using paths relative to the configuration, not the current directory');
    prepared = JSON.parse(output);
  } else prepared = await prepareLocalWorkflow({ workspace, configuration });
  assert.ok(prepared, 'preparation must return a pinned workspace');
  assert.equal(noNetwork.mock.callCount(), 0);
  noNetwork.mock.restore();
  const manifestText = await readFile(prepared.manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.status, 'prepared');
  assert.equal(sha256Text(manifestText), prepared.manifestDigest);
  const loaded = await loadIdentityHostPolicy(join(workspace, 'identity-policy.json'));
  assert.equal(loaded.digest, manifest.identityPolicyDigest);
  assert.equal(verifyIdentityHostRequest(loaded.policy, configuration.request).mission.missionId, request.mission.missionId);
  await assert.rejects(prepareLocalWorkflow({ workspace, configuration }));
  assert.equal(await readFile(prepared.manifestPath, 'utf8'), manifestText);
  if (scenario === 'effect-only-prepare') {
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(loaded.policy.schemaVersion, 2);
    for (const key of ['godskillsRelease', 'activationClassifier', 'reviewExecutor', 'revisionExecutor']) {
      assert.equal(Object.hasOwn(loaded.policy.runtime, key), false);
    }
    assert.equal(Object.hasOwn(manifest, 'maximumReviewMaterializedBytes'), false);
    for (const [name, mutate] of [
      ['bad-pin', c => { c.effectOnly.verifierExecutable.executableReceipt.sha256 = 'f'.repeat(64); }],
      ['mixed-request', c => { c.request = request; }],
      ['review-injection', c => { c.maximumReviewMaterializedBytes = 65_536; }],
    ]) {
      const changed = structuredClone(configuration); mutate(changed);
      const invalidWorkspace = join(source.root, `invalid-${name}`);
      await assert.rejects(prepareLocalWorkflow({ workspace: invalidWorkspace, configuration: changed }));
      await assert.rejects(readFile(join(invalidWorkspace, 'workflow.json')), { code: 'ENOENT' });
    }
    return;
  }

  const phases = [];
  const hostFactory = (options) => createProviderPhaseHost({
    ...options,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      const input = JSON.parse(body.messages[1].content);
      phases.push(input.phase);
      if (scenario === 'uncertain') throw new Error('controlled connection ended after dispatch');
      const content = input.phase === 'review'
        ? { recommendation: scenario === 'rejected' ? 'reject' : 'accept',
          findings: scenario === 'rejected'
            ? [{ id: 'wrong-task', severity: 'important', required: true, message: 'arithmetic does not answer this design task' }]
            : [], summary: 'controlled fixture review' }
        : input.phase === 'revision'
          ? { content: 'two plus two is four.', addressedFindingIds: [] }
          : { content: 'two plus two is four.' };
      return new Response(JSON.stringify({
        id: `workflow-${phases.length}`, object: 'chat.completion', model: providerPolicy.provider.modelId,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson(content) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const options = { manifestPath: prepared.manifestPath, expectedManifestDigest: prepared.manifestDigest };
  const cliRun = async () => {
    const output = { stdout: '', stderr: '' };
    const exit = await runLocalWorkflowCli({ argv: ['run', '--manifest', prepared.manifestPath,
      '--manifest-digest', prepared.manifestDigest], env: {},
    stdout: { write: (text) => { output.stdout += text; } },
    stderr: { write: (text) => { output.stderr += text; } } });
    return { exit, ...output };
  };
  await assert.rejects(runLocalWorkflow({ ...options, expectedManifestDigest: 'a'.repeat(64), createProviderPhaseHostImpl: hostFactory }));
  assert.deepEqual(phases, []);
  if (scenario === 'uncertain' || scenario === 'rejected') {
    const run = () => runLocalWorkflow({ ...options,
      env: { GODAGENT_TEST_PHASE_KEY: 'local-workflow-test-secret' }, createProviderPhaseHostImpl: hostFactory });
    if (scenario === 'uncertain') {
      await assert.rejects(run, { code: 'launch-failed' });
    } else {
      const rejected = await run();
      assert.equal(rejected.status, 'rejected');
      assert.equal(rejected.artifact, null);
      assert.equal(rejected.receipt.acceptedArtifactDigest, null);
    }
    assert.ok(phases.includes('native'));
    if (scenario === 'rejected') assert.ok(phases.includes('review'));
    const calls = phases.length;
    if (scenario === 'uncertain') {
      const pending = await run();
      assert.equal(pending.status, 'pending');
      assert.equal(pending.artifact, null);
    }
    else assert.equal((await run()).status, 'rejected');
    assert.equal(phases.length, calls, 'replay must not repeat rejected or uncertain provider work');
    await assert.rejects(readdir(join(workspace, 'artifacts')), { code: 'ENOENT' });
    const cli = await cliRun();
    assert.equal(cli.exit, scenario === 'uncertain' ? 3 : 4);
    if (scenario === 'uncertain') assert.equal(JSON.parse(cli.stdout).status, 'pending');
    else {
      assert.equal(JSON.parse(cli.stdout).status, 'rejected');
      assert.equal(JSON.parse(cli.stdout).artifact, null);
      assert.equal(cli.stderr, '');
    }
    assert.equal(phases.length, calls);
    return;
  }
  const first = await runLocalWorkflow({
    ...options, env: { GODAGENT_TEST_PHASE_KEY: 'local-workflow-test-secret' }, createProviderPhaseHostImpl: hostFactory,
  });
  if (scenario === 'authority-required') {
    assert.equal(first.status, 'needs-decision');
    assert.equal(first.artifact, null);
    assert.deepEqual(first.unresolvedDecisions, ['authority:local-read', 'authority:local-write']);
    assert.deepEqual(phases, []);
    await assert.rejects(readdir(join(workspace, 'artifacts')), { code: 'ENOENT' });
    const cli = await cliRun();
    assert.equal(cli.exit, 3);
    assert.equal(JSON.parse(cli.stdout).status, 'needs-decision');
    return;
  }
  assert.equal(first.status, 'completed');
  const artifactText = await readFile(first.artifact.path, 'utf8');
  assert.equal(JSON.parse(artifactText).content, 'two plus two is four.');
  assert.equal(phases.filter((phase) => phase === 'native').length, 1);
  const firstCalls = phases.length;
  const second = await runLocalWorkflow({ ...options, env: {}, createProviderPhaseHostImpl: hostFactory });
  assert.equal(phases.length, firstCalls);
  assert.equal(second.instanceId, first.instanceId);
  assert.equal(second.missionId, first.missionId);
  assert.equal(second.artifact.replayed, true);
  assert.equal(await readFile(second.artifact.path, 'utf8'), artifactText);
  assert.equal((await readdir(join(workspace, 'artifacts'))).length, 1);
  const cli = await cliRun();
  assert.equal(cli.exit, 0);
  assert.equal(cli.stderr, '');
  assert.equal(JSON.parse(cli.stdout).artifact.path, first.artifact.path);
  assert.equal(JSON.parse(cli.stdout).artifact.replayed, true);
  assert.ok(!cli.stdout.includes('two plus two'));
  assert.ok(!cli.stdout.includes('local-workflow-test-secret'));
  assert.equal(phases.length, firstCalls);
  const missionPath = join(workspace, 'mission-request.json');
  await writeFile(missionPath, '{}\n');
  await assert.rejects(runLocalWorkflow({ ...options, createProviderPhaseHostImpl: hostFactory }));
  assert.equal(phases.length, firstCalls);
});
}
