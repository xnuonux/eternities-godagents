import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { createGrokCliPortablePhaseHost } from '../src/transports/grok-cli-phase-transport.mjs';
import { launchAdmittedSealedIdentityMission } from '../src/host/admitted-sealed-identity-launch.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import { prepareArtifactRealmFixture } from './helpers/local-artifact-realm-fixture.mjs';
import { prepareRecoveryFixture } from './helpers/local-workflow-recovery-fixture.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { grokProcessFixture } from './helpers/grok-cli-process-fixture.mjs';
import * as api from '../src/host/admitted-effect-only-identity-launcher.mjs';

const json = value => `${canonicalJson(value)}\n`;
const openai = 'openai-compatible-chat-completions-v1';
const anthropic = 'anthropic-messages-v1';
const expected = input => ({ requestDigest: sha256Value(input.request), identityPolicyDigest: input.identityPolicyDigest });
async function inputFor(f) {
  const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8'));
  return { admissionRoot: join(f.workspace, 'admission'), policyPath: join(f.workspace, 'identity-policy.json'),
    request: JSON.parse(await readFile(join(f.workspace, 'mission-request.json'), 'utf8')),
    identityPolicyDigest: manifest.identityPolicyDigest };
}
async function providerFor(f, family, { credential = false, uncertain = false } = {}) {
  const policyPath = join(f.workspace, 'provider-policy.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const pinName = family === openai ? 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256' : 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256';
  const counts = { fetch: 0 };
  const host = await createProviderPhaseHost({ family, policyPath,
    runtimeRoot: join(f.workspace, 'admission', 'vessel', 'provider-phase', family),
    env: { [pinName]: sha256Value(policy), ...(credential ? { [policy.provider.credentialEnv]: 'controlled-reconciliation-secret' } : {}) },
    fetchImpl: async (_url, init) => {
      counts.fetch++;
      assert.ok(credential, 'credential-free host must not dispatch');
      if (uncertain) throw new Error('controlled uncertain attempt');
      const body = JSON.parse(init.body);
      const value = family === openai
        ? { id: 'controlled', object: 'chat.completion', model: body.model,
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content: 'four' }) } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
            completion_tokens_details: { reasoning_tokens: 10 }, prompt_tokens_details: { cached_tokens: 0 } } }
        : { id: 'msg_controlled', type: 'message', role: 'assistant', model: body.model,
          content: [{ type: 'text', text: canonicalJson({ content: 'four' }) }], stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            output_tokens: 20, output_tokens_details: { thinking_tokens: 0 } } };
      return new Response(json(value), { status: 200, headers: { 'content-type': 'application/json' } });
    } });
  return { host, counts, launcher: api.createAdmittedEffectOnlyIdentityLauncher({ host, hostKind: 'provider' }) };
}
async function fixture(t, family = openai, configure = async () => {}) {
  return prepareArtifactRealmFixture(t, async (config, workspace) => {
    if (family === anthropic) {
      config.family = family;
      await writeFile(config.providerPolicyPath, json(validAnthropicMessagesPhasePolicy()));
    }
    await configure(config, workspace);
  });
}

for (const family of [openai, anthropic]) {
  test(`${family}: authenticated absent, normal launch, credential-free saved completion`, async t => {
    const f = await fixture(t, family);
    const input = await inputFor(f);
    const cold = await providerFor(f, family);
    assert.equal(cold.counts.fetch, 0, 'constructor is inert');
    const absent = await cold.launcher.reconcile(input);
    assert.equal(absent.status, 'absent');
    api.assertAdmittedEffectOnlyReconciliationResult(absent, expected(input));
    assert.equal(absent.result.mission.phase, 'native');
    assert.equal(typeof absent.result.vesselAdmissionDigest, 'string');
    assert.equal(cold.counts.fetch, 0);
    const live = await providerFor(f, family, { credential: true });
    const first = await live.launcher.launch(input);
    assert.equal(first.status, 'completed');
    assert.equal(live.counts.fetch, 1);
    const recovered = await cold.launcher.reconcile(input);
    assert.equal(recovered.status, 'completed');
    api.assertAdmittedEffectOnlyReconciliationResult(recovered, expected(input));
    api.assertAdmittedEffectOnlyTerminalResult(recovered.result);
    assert.deepEqual(recovered.result, first);
    assert.equal(cold.counts.fetch, 0);
    assert.equal(live.counts.fetch, 1);
    await assert.rejects(access(join(f.workspace, 'artifacts')), { code: 'ENOENT' });
  });
  test(`${family}: uncertain attempt stays pending without a new request`, async t => {
    const f = await fixture(t, family);
    const input = await inputFor(f);
    const live = await providerFor(f, family, { credential: true, uncertain: true });
    await assert.rejects(live.launcher.launch(input));
    assert.equal(live.counts.fetch, 1);
    const cold = await providerFor(f, family);
    const result = await cold.launcher.reconcile(input);
    assert.equal(result.status, 'pending');
    api.assertAdmittedEffectOnlyReconciliationResult(result, expected(input));
    assert.equal(cold.counts.fetch, 0);
    assert.equal(live.counts.fetch, 1);
  });
}

test('reconciliation issuance binds exact original input and returned bytes, not ordinary results', async t => {
  const f = await fixture(t);
  const input = await inputFor(f);
  const { launcher, counts } = await providerFor(f, openai);
  const binding = expected(input);
  const pending = launcher.reconcile(input);
  input.identityPolicyDigest = '0'.repeat(64);
  input.request.mission.objective = 'caller changed after invocation';
  const result = await pending;
  api.assertAdmittedEffectOnlyReconciliationResult(result, binding);
  for (const fake of [structuredClone(result), JSON.parse(JSON.stringify(result)), result.result]) {
    assert.throws(() => api.assertAdmittedEffectOnlyReconciliationResult(fake, binding), /not issued/);
  }
  for (const key of ['requestDigest', 'identityPolicyDigest']) {
    assert.throws(() => api.assertAdmittedEffectOnlyReconciliationResult(result, { ...binding, [key]: '0'.repeat(64) }), /binding/);
  }
  result.status = 'completed';
  assert.throws(() => api.assertAdmittedEffectOnlyReconciliationResult(result, binding), /changed/);
  assert.equal(counts.fetch, 0);
});

test('stale mission, policy, Realm and admission reject rather than return false absence', async t => {
  const f = await fixture(t);
  const input = await inputFor(f);
  const { launcher, counts } = await providerFor(f, openai);
  assert.equal((await launcher.reconcile(input)).status, 'absent');
  const changed = structuredClone(input);
  changed.request.observation.summary = 'different prior evidence';
  await assert.rejects(launcher.reconcile(changed));
  await assert.rejects(launcher.reconcile({ ...input, identityPolicyDigest: '0'.repeat(64) }));
  await assert.rejects(launcher.reconcile({ ...input, executionMode: 'launch' }), /fields/);
  const policy = JSON.parse(await readFile(input.policyPath, 'utf8'));
  await writeFile(input.policyPath, json({ ...policy, realmId: 'wrong-realm' }));
  await assert.rejects(launcher.reconcile({ ...input, identityPolicyDigest: sha256Value({ ...policy, realmId: 'wrong-realm' }) }));
  await writeFile(input.policyPath, json(policy));
  await writeFile(join(input.admissionRoot, 'transaction', 'genesis-receipt.json'), '{}\n');
  await assert.rejects(launcher.reconcile(input));
  assert.equal(counts.fetch, 0);
});

test('routing refusal remains an issued needs-decision, not phase absence', async t => {
  const f = await fixture(t, openai, config => {
    config.request = structuredClone(config.request);
    config.request.requestedAuthority = ['realm:write'];
    config.request.hostCeiling.availableAuthority = ['realm:write'];
    config.hostPolicy.authority = ['realm:write'];
    config.hostPolicy.hostContext.availableAuthority = ['realm:write'];
    delete config.request.effectAssessment;
    config.request = prepareLocalArtifactEffectRequest(config.request,
      { expectedProducerDescriptorDigest: config.effectOnly.producerDescriptorDigest });
  });
  const input = await inputFor(f);
  const { launcher, counts } = await providerFor(f, openai);
  const result = await launcher.reconcile(input);
  assert.equal(result.status, 'needs-decision');
  api.assertAdmittedEffectOnlyReconciliationResult(result, expected(input));
  assert.equal(counts.fetch, 0);
});

test('Grok portable construction and reconciliation never require auth, refresh or model process', async t => {
  const grok = await grokProcessFixture(t);
  // A throwing module makes any bridge load/readiness path a hard failure.
  const original = await readFile(grok.policy.provider.bridge.path, 'utf8');
  const tripwire = "throw new Error('bridge load or refresh forbidden during reconcile');\n";
  await writeFile(grok.policy.provider.bridge.path, tripwire);
  const { sha256Text } = await import('../src/core/digest.mjs');
  grok.policy.provider.bridge.sha256 = sha256Text(tripwire);
  await writeFile(grok.policyPath, json(grok.policy));
  await rename(grok.authPath, `${grok.authPath}.saved`);
  const f = await prepareArtifactRealmFixture(t, config => {
    config.family = 'grok-cli-subscription-v1'; config.providerPolicyPath = grok.policyPath;
  });
  const input = await inputFor(f);
  const host = await createGrokCliPortablePhaseHost({ policyPath: join(f.workspace, 'provider-policy.json'),
    env: { GODAGENT_GROK_PHASE_POLICY_SHA256: sha256Value(grok.policy) },
    runtimeRoot: join(f.workspace, 'admission', 'vessel', 'provider-phase', 'grok-cli-subscription-v1') });
  const launcher = api.createAdmittedEffectOnlyIdentityLauncher({ host, hostKind: 'portable' });
  const result = await launcher.reconcile(input);
  assert.equal(result.status, 'absent');
  api.assertAdmittedEffectOnlyReconciliationResult(result, expected(input));
  assert.equal(await grok.calls(), 0);
  // The throwing bridge deliberately remains pinned for this isolated fixture.
  assert.ok(original.includes('runProcess'));
});

test('host rejects invalid execution mode and legacy reconciliation without dispatch', async t => {
  const f = await prepareRecoveryFixture(t);
  const input = await inputFor(f);
  const { host, counts } = await providerFor(f, openai);
  const options = { ...input, env: { GODAGENT_IDENTITY_POLICY_SHA256: input.identityPolicyDigest }, nativeTransport: host.native };
  await assert.rejects(launchAdmittedSealedIdentityMission({ ...options, executionMode: 'invalid' }), { code: 'input-invalid' });
  await assert.rejects(launchAdmittedSealedIdentityMission({ ...options, executionMode: 'reconcile' }), { code: 'input-invalid' });
  assert.equal(counts.fetch, 0);
});

for (const mode of ['normal', 'uncertain']) {
  test(`Grok portable ${mode}: recover existing evidence without auth or extra process`, async t => {
    const grok = await grokProcessFixture(t, mode);
    const f = await prepareArtifactRealmFixture(t, config => {
      config.family = 'grok-cli-subscription-v1'; config.providerPolicyPath = grok.policyPath;
    });
    const input = await inputFor(f);
    const create = async () => api.createAdmittedEffectOnlyIdentityLauncher({ hostKind: 'portable',
      host: await createGrokCliPortablePhaseHost({ policyPath: join(f.workspace, 'provider-policy.json'), env: grok.env,
        runtimeRoot: join(f.workspace, 'admission', 'vessel', 'provider-phase', 'grok-cli-subscription-v1') }) });
    const launcher = await create();
    if (mode === 'uncertain') await assert.rejects(launcher.launch(input));
    else assert.equal((await launcher.launch(input)).status, 'completed');
    assert.equal(await grok.calls(), 1);
    await rename(grok.authPath, `${grok.authPath}.saved`);
    const recovered = await (await create()).reconcile(input);
    assert.equal(recovered.status, mode === 'normal' ? 'completed' : 'pending');
    api.assertAdmittedEffectOnlyReconciliationResult(recovered, expected(input));
    if (mode === 'normal') api.assertAdmittedEffectOnlyTerminalResult(recovered.result);
    assert.equal(await grok.calls(), 1);
  });
}
