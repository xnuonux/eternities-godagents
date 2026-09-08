import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import { prepareRecoveryFixture } from './helpers/local-workflow-recovery-fixture.mjs';
const api = await import('../scripts/evaluation/comparison-preparation.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'comparison-prep-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const task = { objective: 'Read the count', input: { count: 4 }, requirements: ['Return the supplied count'], outputFormat: 'JSON' };
  const providerPolicy = validOpenAICompatiblePhasePolicy();
  providerPolicy.provider.profile = 'chat-completions-json-schema-reasoning-split-v1';
  const mission = { schemaVersion: 2, routeMode: 'effect-only', mission: { missionId: 'comparison-task', objective: canonicalJson(task) }, budgets: { nativeCompletionTokens: 1000 } };
  const identityPolicy = { schemaVersion: 2, runtime: { instanceId: 'comparison-instance' } };
  const manifest = { schemaVersion: 2, status: 'prepared', workspaceRoot: root,
    family: 'openai-compatible-chat-completions-v1', instanceId: 'comparison-instance', missionId: 'comparison-task', genesisId: 'fixture-genesis',
    identityPolicyDigest: sha256Value(identityPolicy), inputs: {} };
  for (const [key, name, value] of [
    ['providerPolicy', 'provider-policy.json', providerPolicy], ['mission', 'mission-request.json', mission], ['identityPolicy', 'identity-policy.json', identityPolicy],
  ]) {
    const text = `${canonicalJson(value)}\n`;
    await writeFile(join(root, name), text);
    manifest.inputs[key] = sha256Text(text);
  }
  const text = `${canonicalJson(manifest)}\n`;
  await writeFile(join(root, 'workflow.json'), text);
  const limits = { maximumCalls: 1, maximumReservedTokens: 1000, maximumRequestBytes: 1048576, maximumResponseBytes: 1048576, timeoutMs: 30000, maximumWallMs: 60000 };
  const input = { workflow: { path: join(root, 'workflow.json'), sha256: sha256Text(text) }, task,
    baseline: { endpoint: 'https://models.example.test/v1/chat/completions', request: {
      model: providerPolicy.provider.modelId, reasoning_split: true, max_completion_tokens: 1000,
      n: 1, stream: false, store: false, response_format: { type: 'json_schema', json_schema: { name: 'native_phase_output_v1', strict: true,
        schema: { type: 'object', additionalProperties: false, required: ['content'], properties: { content: { type: 'string', minLength: 1, maxLength: 16777216 } } } } },
      messages: [{ role: 'system', content: 'Return JSON with one string field content.' }, { role: 'user', content: canonicalJson(task) }],
    } }, allocations: { baseline: limits, godagent: { ...limits }, totalCalls: 2, totalReservedTokens: 2000 } };
  return { root, input, manifest };
}

test('comparison inspection binds actual workflow input bytes without publishing readiness', async t => {
  assert.equal(typeof api.inspectPreparedComparison, 'function');
  const { root, input } = await fixture(t);
  const before = await readdir(root);
  const result = await api.inspectPreparedComparison(input);
  assert.equal(result.envelope.allocations.totalCalls, 2);
  assert.equal(result.files.length, 4);
  assert.equal(result.manifest.missionId, 'comparison-task');
  assert.deepEqual(await readdir(root), before);
  await writeFile(join(root, 'mission-request.json'), '{}');
  assert.equal(result.mission.mission.missionId, 'comparison-task');
  assert.equal(Object.isFrozen(result.mission.mission), true);
  await assert.rejects(api.inspectPreparedComparison(input), /digest/);
});

test('changed task, allocation, workflow bytes and manifest identity cannot be inspected as aligned', async t => {
  assert.equal(typeof api.inspectPreparedComparison, 'function');
  for (const kind of ['task', 'allocation', 'workflow', 'identity', 'extra']) {
    const { root, input, manifest } = await fixture(t);
    if (kind === 'task') input.task.objective = 'Do a different task';
    if (kind === 'allocation') input.allocations.totalCalls = 3;
    if (kind === 'workflow') await writeFile(join(root, 'workflow.json'), '{}');
    if (kind === 'extra') input.ready = true;
    if (kind === 'identity') {
      manifest.instanceId = 'another-instance';
      const text = `${canonicalJson(manifest)}\n`;
      await writeFile(input.workflow.path, text); input.workflow.sha256 = sha256Text(text);
    }
    await assert.rejects(api.inspectPreparedComparison(input));
    assert.equal((await readdir(root)).length, 4);
  }
});

test('canonical input bytes are required even when a changed manifest pins their hash', async t => {
  assert.equal(typeof api.inspectPreparedComparison, 'function');
  const { input, root, manifest } = await fixture(t);
  const path = join(root, 'mission-request.json');
  const noncanonical = JSON.stringify(JSON.parse(await readFile(path, 'utf8')), null, 2);
  await writeFile(path, noncanonical);
  manifest.inputs.mission = sha256Text(noncanonical);
  const text = `${canonicalJson(manifest)}\n`;
  await writeFile(input.workflow.path, text); input.workflow.sha256 = sha256Text(text);
  await assert.rejects(api.inspectPreparedComparison(input), /canonical/);
});

test('full comparison validation rejects hash-consistent but structurally invalid host policy', async t => {
  assert.equal(typeof api.verifyPreparedComparison, 'function');
  const { input } = await fixture(t);
  await assert.rejects(api.verifyPreparedComparison(input));
});

test('full comparison validation uses real admitted v2 policy and pinned executables without inference', async t => {
  assert.equal(typeof api.verifyPreparedComparison, 'function');
  const { input } = await fixture(t);
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('no inference during validation'); });
  const prepared = await prepareRecoveryFixture(t, { effectOnlyTask: input.task });
  input.workflow = { path: prepared.manifestPath, sha256: prepared.manifestDigest };
  const verified = await api.verifyPreparedComparison(input);
  assert.equal(verified.manifest.instanceId, prepared.instanceId);
  assert.equal(verified.identityPolicy.schemaVersion, 2);
  assert.equal(network.mock.callCount(), 0);
  // Re-pinning a different provider must not silently replace the transport
  // already pinned in the identity host policy.
  const providerPath = join(prepared.workspace, 'provider-policy.json');
  const changedProvider = structuredClone(verified.providerPolicy);
  changedProvider.provider.modelId = 'different-model';
  const providerText = `${canonicalJson(changedProvider)}\n`;
  await writeFile(providerPath, providerText);
  const changedManifest = structuredClone(verified.manifest);
  changedManifest.inputs.providerPolicy = sha256Text(providerText);
  const manifestText = `${canonicalJson(changedManifest)}\n`;
  await writeFile(prepared.manifestPath, manifestText);
  input.workflow.sha256 = sha256Text(manifestText);
  input.baseline.request.model = 'different-model';
  await assert.rejects(api.verifyPreparedComparison(input), /native transport/);
});

test('comparison preparation publishes once and refuses stale pins or occupied output', async t => {
  assert.equal(typeof api.prepareComparison, 'function');
  const { input, root } = await fixture(t);
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('inert preparation'); });
  const prepared = await prepareRecoveryFixture(t, { effectOnlyTask: input.task });
  input.workflow = { path: prepared.manifestPath, sha256: prepared.manifestDigest };
  const sourcePath = join(root, 'declared-source.mjs');
  const oraclePath = join(root, 'declared-oracle.mjs');
  await writeFile(sourcePath, 'throw new Error("must not execute source")');
  await writeFile(oraclePath, 'throw new Error("must not execute oracle")');
  const pin = async path => ({ path, sha256: sha256Text(await readFile(path, 'utf8')) });
  const preregistration = { schemaVersion: 1, comparison: input, armOrder: ['baseline', 'godagent'],
    sources: [await pin(sourcePath)], oracle: { id: 'test-oracle-v1', source: await pin(oraclePath) } };
  const directory = join(root, 'comparison');
  const expectedDigest = sha256Value(preregistration);
  await assert.rejects(api.prepareComparison({ directory, preregistration, expectedDigest: '0'.repeat(64) }), /digest/);
  assert.equal((await readdir(root)).includes('comparison'), false);
  const output = await api.prepareComparison({ directory, preregistration, expectedDigest });
  const text = await readFile(output.preparationPath, 'utf8');
  const record = JSON.parse(text);
  assert.equal(record.status, 'prepared');
  assert.equal(record.executionAuthorized, false);
  assert.equal(record.preregistrationDigest, expectedDigest);
  assert.equal(sha256Text(text), output.preparationDigest);
  assert.equal(network.mock.callCount(), 0);
  await assert.rejects(api.prepareComparison({ directory, preregistration, expectedDigest }));
  assert.equal(await readFile(output.preparationPath, 'utf8'), text);
  await writeFile(sourcePath, 'changed');
  await assert.rejects(api.prepareComparison({ directory: join(root, 'stale'), preregistration, expectedDigest }), /digest/);
  assert.equal((await readdir(root)).includes('stale'), false);
  await assert.rejects(api.prepareComparison({ directory: join(prepared.workspace, 'nested'), preregistration, expectedDigest }), /overlap/);
});
