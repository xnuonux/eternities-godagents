import assert from 'node:assert/strict';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';

import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { loadIdentityHostPolicy } from '../src/host/identity-policy.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import { buildIdentityBoundNativeTransportDescriptor } from '../src/runtime/identity-bound-native-contracts.mjs';
import { createRoutingEvidenceActivationClassifier } from '../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../src/skills/routing-executable-verifier.mjs';
import { setupAdmittedIdentity } from './helpers/admitted-identity-fixture.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { createAdmittedEffectOnlyIdentityLauncher } from '../src/sdk/index.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import {
  executors,
  identityTransport,
  reviewTransport,
  revisionTransport,
  vesselRequest,
} from './helpers/identity-bound-mission-vessel-certification-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

async function launcherModule() {
  try {
    return await import('../src/host/admitted-sealed-identity-launch.mjs');
  } catch (error) {
    assert.fail(`admitted sealed identity launcher is unavailable: ${error.message}`);
  }
}

test('versioned host policy pins the structured producer without widening v1', async (t) => {
  const fixture = await setup(t, 'effect-policy');
  const pin = 'bd00071f046bd5f8612a65cfe674d417b8b21c3fb25bad41634bb734b08bfc26';
  const request = prepareLocalArtifactEffectRequest({ ...fixture.request,
    schemaVersion: 2, routeMode: 'effect-only' }, { expectedProducerDescriptorDigest: pin });
  const { verifyIdentityHostRequest } = await launcherModule();
  assert.throws(() => verifyIdentityHostRequest(fixture.policy, request));
  const policy = structuredClone(fixture.policy);
  policy.schemaVersion = 2;
  policy.runtime.protocolId = 'eternities-admitted-sealed-identity-host-v2';
  policy.runtime.effectProducerDescriptorDigest = pin;
  for (const key of ['godskillsRelease', 'activationClassifier', 'reviewExecutor', 'revisionExecutor']) delete policy.runtime[key];
  for (const key of ['maximumGodskillsDispatchBytes', 'maximumGodskillsCompletionBytes', 'maximumGodskillsResultBytes']) delete policy.runtime.limits[key];
  policy.runtime.effectOnlyRepositoryRoot = 'unused-structural-policy-fixture';
  for (const [field, kind, script] of [
    ['routingExecutable', 'executable', 'effect-only-v2'],
    ['verifierExecutable', 'verifier', 'verify-effect-only-v2'],
  ]) policy.runtime[field] = { protocolId: `eternities-godskills-effect-only-${kind}-v2`,
    executableReceipt: { path: `receipts/effect-only-${kind}-v2.json`, sha256: '0'.repeat(64), receiptDigest: '0'.repeat(64) },
    entrypoint: { path: `scripts/${script}.mjs`, sha256: '0'.repeat(64) } };
  await writeFile(fixture.policyPath, `${canonicalJson(policy)}\n`);
  const loaded = await loadIdentityHostPolicy(fixture.policyPath);
  assert.deepEqual(verifyIdentityHostRequest(loaded.policy, request), request);
  for (const mutate of [
    p => { p.runtime.effectProducerDescriptorDigest = 'f'.repeat(64); },
    p => { delete p.runtime.effectProducerDescriptorDigest; },
    p => { p.schemaVersion = 1; },
    p => { p.runtime.protocolId = 'eternities-admitted-sealed-identity-host-v1'; },
  ]) {
    const changed = structuredClone(policy); mutate(changed);
    await writeFile(fixture.policyPath, `${canonicalJson(changed)}\n`);
    await assert.rejects(loadIdentityHostPolicy(fixture.policyPath));
  }
  const altered = structuredClone(request);
  altered.observation.summary = 'stale observation';
  assert.throws(() => verifyIdentityHostRequest(loaded.policy, altered), /assessment|source/);
});

function operationCount(calls) {
  return calls.filter(({ type }) => type !== 'descriptor').length;
}

async function findVesselAdmission(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const found = await findVesselAdmission(path);
      if (found) return found;
    } else if (entry.name === 'admission.json') {
      return path;
    }
  }
  return null;
}

function fixedMissionClock() {
  let now = Date.parse('2026-08-31T23:00:00.000Z');
  return () => {
    const current = now;
    now += 600_000;
    return current;
  };
}

function fixedGodskillsClock() {
  let tick = 0;
  return () => new Date(Date.parse('2026-08-31T22:00:00.000Z') + tick++ * 100).toISOString();
}

async function setup(t, suffix, { reviewAvailable = true } = {}) {
  const admitted = await setupAdmittedIdentity(null, suffix);
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const native = identityTransport();
  const review = reviewTransport();
  const revision = revisionTransport();
  const liveExecutors = reviewAvailable
    ? await executors(godskillsRoot, review, revision)
    : { reviewExecutor: null, revisionExecutor: null };
  const releasePin = pinnedGodskillsReviewRelease(godskillsRoot);
  const routingPin = pinnedGodskillsRoutingExecutable();
  const verifiedRouting = await verifyGodskillsRoutingExecutable({
    releasePin,
    routingPin,
  });
  const classifier = createRoutingEvidenceActivationClassifier({
    verifiedRoutingExecutable: verifiedRouting,
    reviewAvailable,
  });
  const request = vesselRequest();
  request.mission.objective = 'direct a consequential visual identity across several design layers and reconcile narrative motion with interface art direction';
  request.requestedAuthority = ['local-read', 'local-write', 'realm:write'];
  request.hostCeiling.availableAuthority = ['local-read', 'local-write', 'realm:write'];
  request.task.hostAdapterId = 'godagents-admitted-sealed-v1';
  const policyPath = join(admitted.root, 'identity-host-policy.json');
  const policyRoot = dirname(policyPath);
  const policy = {
    schemaVersion: 1,
    policyId: 'admitted-sealed-identity-fixture-v1',
    runtime: {
      protocolId: 'eternities-admitted-sealed-identity-host-v1',
      instanceId: admitted.admission.instanceId,
      distributionDir: relative(policyRoot, admitted.admission.distributionDir),
      journalPath: relative(policyRoot, admitted.admission.journalPath),
      snapshotPath: relative(policyRoot, join(admitted.admissionRoot, 'vessel', 'snapshot.json')),
      hostAdapterId: request.task.hostAdapterId,
      revocationEpoch: request.task.revocationEpoch,
      godskillsRelease: releasePin,
      routingExecutable: routingPin,
      activationClassifier: structuredClone(classifier.descriptor),
      nativeTransport: structuredClone(native.descriptor),
      ...(reviewAvailable ? {
        reviewExecutor: liveExecutors.reviewExecutor.descriptor(),
        revisionExecutor: liveExecutors.revisionExecutor.descriptor(),
      } : {}),
      limits: {
        timeoutMs: 30_000,
        maximumGodskillsDispatchBytes: 1_048_576,
        maximumGodskillsCompletionBytes: 1_048_576,
        maximumGodskillsResultBytes: 1_048_576,
        maximumNativeMaterializedBytes: 65_536,
        maxArtifactBytes: request.budgets.maxArtifactBytes,
        nativeCompletionTokens: request.budgets.nativeCompletionTokens,
        reviewCompletionTokensPerRound: request.budgets.reviewCompletionTokensPerRound,
        revisionCompletionTokens: request.budgets.revisionCompletionTokens,
        totalCompletionTokens: request.budgets.totalCompletionTokens,
        maxProjectionBytes: request.maxProjectionBytes,
        maxCycles: request.maxCycles,
      },
    },
    realmId: 'fixture-workbench',
    authority: structuredClone(request.requestedAuthority),
    hostContext: structuredClone(request.hostCeiling),
  };
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  return {
    ...admitted,
    policy,
    policyPath,
    request,
    native,
    review,
    revision,
    reviewExecutor: liveExecutors.reviewExecutor,
    revisionExecutor: liveExecutors.revisionExecutor,
    env: { GODAGENT_IDENTITY_POLICY_SHA256: sha256Text(canonicalJson(policy)) },
    registryRoot: join(admitted.root, 'instance-registry'),
    clock: fixedMissionClock(),
    godskillsClock: fixedGodskillsClock(),
  };
}

function launchArgs(fixture, overrides = {}) {
  return {
    admissionRoot: fixture.admissionRoot,
    policyPath: fixture.policyPath,
    request: fixture.request,
    env: fixture.env,
    registryRoot: fixture.registryRoot,
    nativeTransport: fixture.native.adapter,
    reviewExecutor: fixture.reviewExecutor,
    revisionExecutor: fixture.revisionExecutor,
    clock: fixture.clock,
    godskillsClock: fixture.godskillsClock,
    ...overrides,
  };
}

test('malformed launcher seams fail as input before filesystem or policy work', async () => {
  const { launchAdmittedSealedIdentityMission, AdmittedSealedIdentityLaunchError } = await launcherModule();
  await assert.rejects(
    () => launchAdmittedSealedIdentityMission({
      admissionRoot: 'C:/does-not-matter',
      policyPath: 'C:/does-not-matter/policy.json',
      nativeTransport: {},
    }),
    (error) => error instanceof AdmittedSealedIdentityLaunchError && error.code === 'input-invalid',
  );
});

async function prepareEffectOnlyFixture(fixture, nativeDescriptor = fixture.native.descriptor) {
  const sourceRoot = 'C:/dev/eternities-godskills/.worktrees/effect-only-v2';
  const policy = await rewritePolicy(fixture, p => {
    p.schemaVersion = 2;
    p.runtime.protocolId = 'eternities-admitted-sealed-identity-host-v2';
    p.runtime.effectProducerDescriptorDigest = 'bd00071f046bd5f8612a65cfe674d417b8b21c3fb25bad41634bb734b08bfc26';
    p.runtime.effectOnlyRepositoryRoot = sourceRoot;
    p.runtime.nativeTransport = structuredClone(nativeDescriptor);
    for (const key of ['godskillsRelease', 'activationClassifier']) delete p.runtime[key];
    for (const key of ['maximumGodskillsDispatchBytes', 'maximumGodskillsCompletionBytes', 'maximumGodskillsResultBytes']) delete p.runtime.limits[key];
  });
  // Test-host pins come from the local frozen fixture. External release approval
  // is separately covered by the fixed-pin policy test, not inferred here.
  for (const [field, kind] of [['routingExecutable', 'executable'], ['verifierExecutable', 'verifier']]) {
    const path = `receipts/effect-only-${kind}-v2.json`;
    const bytes = await readFile(join(sourceRoot, path), 'utf8');
    const receipt = JSON.parse(bytes);
    policy.runtime[field] = { protocolId: receipt.protocolId, entrypoint: receipt.entrypoint,
      executableReceipt: { path, sha256: sha256Text(bytes), receiptDigest: receipt.receiptDigest } };
  }
  await writeFile(fixture.policyPath, `${canonicalJson(policy)}\n`);
  fixture.env.GODAGENT_IDENTITY_POLICY_SHA256 = sha256Text(canonicalJson(policy));
  const request = prepareLocalArtifactEffectRequest({ ...fixture.request, schemaVersion: 2, routeMode: 'effect-only' },
    { expectedProducerDescriptorDigest: policy.runtime.effectProducerDescriptorDigest });
  return { policy, request };
}

test('authenticated v2 launcher runs pinned effect-only routing and recovers native work', async t => {
  const fixture = await setup(t, 'effect-only-host', { reviewAvailable: false });
  const { policy, request } = await prepareEffectOnlyFixture(fixture);
  const { launchAdmittedSealedIdentityMission } = await launcherModule();
  const args = launchArgs(fixture, { request });
  const { buildPortablePhaseHostDescription, createPortablePhaseHostAdapter } = await import('../src/sdk/portable-phase-host.mjs');
  const { createAdmittedEffectOnlyIdentityLauncher } = await import('../src/sdk/index.mjs');
  const portable = await createPortablePhaseHostAdapter({
    description: buildPortablePhaseHostDescription({ adapterId: 'effect-only-integration-host', adapterVersion: '1',
      policyDigest: fixture.env.GODAGENT_IDENTITY_POLICY_SHA256,
      descriptors: { native: fixture.native.descriptor, review: fixture.review.descriptor, revision: fixture.revision.descriptor } }),
    native: fixture.native.adapter, review: fixture.review.adapter, revision: fixture.revision.adapter,
    assertCredentialAbsent: () => {}, createOperatorResolutionController: () => { throw new Error('not used'); },
  });
  const facade = createAdmittedEffectOnlyIdentityLauncher({ host: portable, hostKind: 'portable' });
  const facadeArgs = { admissionRoot: args.admissionRoot, policyPath: args.policyPath, request,
    identityPolicyDigest: fixture.env.GODAGENT_IDENTITY_POLICY_SHA256,
    registryRoot: args.registryRoot, clock: args.clock };
  const first = await facade.launch(facadeArgs);
  assert.equal(first.status, 'completed');
  const { assertAdmittedEffectOnlyTerminalResult } = await import('../src/host/admitted-effect-only-identity-launcher.mjs');
  assert.equal(typeof assertAdmittedEffectOnlyTerminalResult, 'function');
  assert.deepEqual(assertAdmittedEffectOnlyTerminalResult(first), first.receipt);
  assert.throws(() => assertAdmittedEffectOnlyTerminalResult(structuredClone(first)), /issued/);
  assert.throws(() => assertAdmittedEffectOnlyTerminalResult({ status: 'pending' }), /issued/);
  const originalMission = first.mission;
  first.mission = structuredClone(originalMission);
  first.mission.artifact.content = 'changed after authenticated completion';
  assert.throws(() => assertAdmittedEffectOnlyTerminalResult(first), /changed/);
  first.mission = originalMission;
  assert.equal(first.receipt.schemaVersion, 2);
  assert.equal(first.mission.verdict.reason, 'native-no-review');
  const calls = operationCount(fixture.native.calls);
  assert.deepEqual(await launchAdmittedSealedIdentityMission(args), first);
  assert.deepEqual(await facade.launch(facadeArgs), first);
  assert.equal(operationCount(fixture.native.calls), calls);
  const changed = prepareLocalArtifactEffectRequest({ ...fixture.request, schemaVersion: 2, routeMode: 'effect-only', sourceStateEpoch: 1 },
    { expectedProducerDescriptorDigest: policy.runtime.effectProducerDescriptorDigest });
  await assert.rejects(launchAdmittedSealedIdentityMission({ ...args, request: changed }));
  assert.equal(operationCount(fixture.native.calls), calls);
  const denied = prepareLocalArtifactEffectRequest({ ...fixture.request, schemaVersion: 2, routeMode: 'effect-only',
    requestedAuthority: ['local-read'], mission: { ...fixture.request.mission, missionId: 'denied-effect-mission' } },
    { expectedProducerDescriptorDigest: policy.runtime.effectProducerDescriptorDigest });
  const blocked = await launchAdmittedSealedIdentityMission({ ...args, request: denied });
  assert.equal(blocked.status, 'needs-decision');
  assert.equal(operationCount(fixture.native.calls), calls, 'denied effects cannot reach native transport');
  const { sha256Value } = await import('../src/core/digest.mjs');
  const slot = sha256Value({ taskId: request.task.taskId, missionId: request.mission.missionId });
  const admissionPath = join(fixture.admissionRoot, 'vessel', 'effect-only-v2', `${slot}.admission.json`);
  const saved = JSON.parse(await readFile(admissionPath, 'utf8'));
  saved.sourceStateEpoch += 1;
  const { vesselAdmissionDigest, ...unsigned } = saved;
  saved.vesselAdmissionDigest = sha256Value(unsigned);
  await writeFile(admissionPath, `${canonicalJson(saved)}\n`);
  await assert.rejects(launchAdmittedSealedIdentityMission(args));
  assert.equal(operationCount(fixture.native.calls), calls, 'tampered admission cannot reach native transport');
});

for (const family of ['openai-compatible-chat-completions-v1', 'anthropic-messages-v1']) {
  test(`authenticated effect-only ${family} publishes native output and replays without provider work`, async t => {
    const fixture = await setup(t, `effect-only-${family}`, { reviewAvailable: false });
    const anthropic = family === 'anthropic-messages-v1';
    const transportPolicy = anthropic ? validAnthropicMessagesPhasePolicy() : validOpenAICompatiblePhasePolicy();
    const transportPolicyPath = join(fixture.root, 'controlled-provider-policy.json');
    await writeFile(transportPolicyPath, `${canonicalJson(transportPolicy)}\n`);
    let providerCalls = 0;
    const content = 'controlled provider output through authenticated effect-only launch';
    const host = await createProviderPhaseHost({ family, policyPath: transportPolicyPath,
      runtimeRoot: join(fixture.root, 'controlled-provider-operations'),
      env: {
        [anthropic ? 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256' : 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256']: sha256Text(canonicalJson(transportPolicy)),
        [transportPolicy.provider.credentialEnv]: 'effect-only-provider-fixture-secret',
      },
      clock: () => new Date(fixture.clock()).toISOString(),
      fetchImpl: async (_url, options) => {
        providerCalls += 1;
        const dispatched = JSON.parse(options.body);
        assert.equal(dispatched.model, transportPolicy.provider.modelId);
        const response = anthropic ? {
          id: 'msg_effect_only', type: 'message', role: 'assistant', model: dispatched.model,
          content: [{ type: 'text', text: canonicalJson({ content }) }],
          stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
            output_tokens: 30, output_tokens_details: { thinking_tokens: 0 } },
        } : {
          id: 'chatcmpl_effect_only', object: 'chat.completion', model: dispatched.model,
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: canonicalJson({ content }) } }],
          usage: { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens: 30,
            completion_tokens_details: { reasoning_tokens: 0 }, total_tokens: 130 },
        };
        return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    const { request } = await prepareEffectOnlyFixture(fixture, host.describe().descriptors.native);
    const launcher = createAdmittedEffectOnlyIdentityLauncher({ host, hostKind: 'provider' });
    const args = { admissionRoot: fixture.admissionRoot, policyPath: fixture.policyPath, request,
      identityPolicyDigest: fixture.env.GODAGENT_IDENTITY_POLICY_SHA256,
      registryRoot: fixture.registryRoot, clock: fixture.clock };
    const deniedRequest = prepareLocalArtifactEffectRequest({ ...fixture.request, schemaVersion: 2, routeMode: 'effect-only',
      requestedAuthority: ['local-read'], mission: { ...request.mission, missionId: 'provider-denied-write' } },
    { expectedProducerDescriptorDigest: 'bd00071f046bd5f8612a65cfe674d417b8b21c3fb25bad41634bb734b08bfc26' });
    const denied = await launcher.launch({ ...args, request: deniedRequest });
    assert.equal(denied.status, 'needs-decision');
    assert.equal(providerCalls, 0, 'a declared write without authority cannot reach either provider');
    const first = await launcher.launch(args);
    assert.equal(first.status, 'completed');
    assert.equal(first.mission.verdict.reason, 'native-no-review');
    assert.equal(first.mission.artifact.content, content);
    assert.equal(providerCalls, 1);
    assert.deepEqual(await launcher.launch(args), first);
    assert.equal(providerCalls, 1, 'persisted replay cannot redispatch native or call review/revision');
  });
}

async function rewritePolicy(fixture, mutate) {
  const changed = structuredClone(fixture.policy);
  mutate(changed);
  await writeFile(fixture.policyPath, `${canonicalJson(changed)}\n`, 'utf8');
  fixture.env.GODAGENT_IDENTITY_POLICY_SHA256 = sha256Text(canonicalJson(changed));
  return changed;
}

test('one exact identity policy launches the sealed reviewed mission and replays without external work', async (t) => {
  const { launchAdmittedSealedIdentityMission } = await launcherModule();
  const fixture = await setup(t, 'admitted-sealed-host-success');
  const first = await launchAdmittedSealedIdentityMission(launchArgs(fixture));
  assert.equal(first.status, 'completed');
  assert.equal(first.mission.verdict.reason, 'revision-review-accepted');
  assert.equal(first.receipt.authority.authorityExpanded, false);
  assert.equal(first.receipt.authority.realmEffects, false);
  await stat(join(fixture.admissionRoot, 'vessel', 'sealed-identity-v1'));

  const beforeReplay = {
    native: operationCount(fixture.native.calls),
    review: operationCount(fixture.review.calls),
    revision: operationCount(fixture.revision.calls),
  };
  const replay = await launchAdmittedSealedIdentityMission(launchArgs(fixture));
  const afterReplay = {
    native: operationCount(fixture.native.calls),
    review: operationCount(fixture.review.calls),
    revision: operationCount(fixture.revision.calls),
  };
  assert.deepEqual(replay, first);
  assert.deepEqual(afterReplay, beforeReplay);
});

test('identity host request binding rejects every authority identity context and budget expansion', async (t) => {
  const { verifyIdentityHostRequest } = await launcherModule();
  const fixture = await setup(t, 'admitted-sealed-host-request');
  assert.deepEqual(verifyIdentityHostRequest(fixture.policy, fixture.request), fixture.request);
  const cases = [
    ['host adapter', (request) => { request.task.hostAdapterId = 'foreign-host'; }],
    ['revocation epoch', (request) => { request.task.revocationEpoch += 1; }],
    ['authority', (request) => {
      request.requestedAuthority = ['local-read', 'local-write', 'realm:admin', 'realm:write'];
      request.hostCeiling.availableAuthority = ['local-read', 'local-write', 'realm:admin', 'realm:write'];
    }],
    ['host ceiling', (request) => { request.hostCeiling.maximumRisk = 'high'; }],
    ['artifact budget', (request) => { request.budgets.maxArtifactBytes += 1; }],
    ['native tokens', (request) => { request.budgets.nativeCompletionTokens += 1; }],
    ['review tokens', (request) => { request.budgets.reviewCompletionTokensPerRound += 1; }],
    ['revision tokens', (request) => { request.budgets.revisionCompletionTokens += 1; }],
    ['total tokens', (request) => { request.budgets.totalCompletionTokens += 1; }],
    ['projection', (request) => { request.maxProjectionBytes += 1; }],
    ['cycles', (request) => { request.maxCycles += 1; }],
  ];
  for (const [name, mutate] of cases) {
    const changed = structuredClone(fixture.request);
    mutate(changed);
    assert.throws(() => verifyIdentityHostRequest(fixture.policy, changed), /identity|policy|ceiling|budget|authority/i, name);
  }
});

test('a policy without review descriptors admits only a launcher without live review executors', async (t) => {
  const { launchAdmittedSealedIdentityMission } = await launcherModule();
  const fixture = await setup(t, 'admitted-sealed-host-native-only', { reviewAvailable: false });
  fixture.request.mission.objective = 'determine whether this experiment supports its causal claim after accounting for confounding multiplicity and uncertainty';
  fixture.request.requestedAuthority = ['local-read'];
  fixture.request.hostCeiling.availableAuthority = ['local-read'];
  fixture.request.hostCeiling.permittedEffects = ['local-read'];
  fixture.request.hostCeiling.maximumRisk = 'low';
  await rewritePolicy(fixture, (policy) => {
    policy.authority = structuredClone(fixture.request.requestedAuthority);
    policy.hostContext = structuredClone(fixture.request.hostCeiling);
  });
  const result = await launchAdmittedSealedIdentityMission(launchArgs(fixture));
  assert.equal(result.status, 'completed');
  assert.equal(result.mission.verdict.reason, 'native-no-review');
  const admissionPath = await findVesselAdmission(
    join(fixture.admissionRoot, 'vessel', 'sealed-identity-v1', 'vessel-admissions'),
  );
  const admission = JSON.parse(await readFile(admissionPath, 'utf8'));
  assert.deepEqual(admission.godskills.receipt.selected.map(({ id }) => id), ['eternities-athena']);
  assert.deepEqual(admission.godskills.receipt.activation.decisions.map(({ mode }) => mode), ['native']);
  assert.equal(fixture.review.calls.filter(({ type }) => type === 'execute').length, 0);
  assert.equal(fixture.revision.calls.filter(({ type }) => type === 'execute').length, 0);
});

test('policy digest admission binding Realm and dependencies fail closed before mission execution', async (t) => {
  const { launchAdmittedSealedIdentityMission, AdmittedSealedIdentityLaunchError } = await launcherModule();
  async function expectClosed(suffix, prepare, code) {
    const fixture = await setup(t, suffix);
    const baseline = {
      native: operationCount(fixture.native.calls),
      review: operationCount(fixture.review.calls),
      revision: operationCount(fixture.revision.calls),
    };
    const args = await prepare(fixture, launchArgs(fixture));
    await assert.rejects(
      () => launchAdmittedSealedIdentityMission(args),
      (error) => error instanceof AdmittedSealedIdentityLaunchError && error.code === code,
      `${suffix} must fail as ${code}`,
    );
    assert.deepEqual({
      native: operationCount(fixture.native.calls),
      review: operationCount(fixture.review.calls),
      revision: operationCount(fixture.revision.calls),
    }, baseline);
  }
  let untrustedPolicyArtifactReads = 0;
  await expectClosed('identity-policy-digest', async (fixture, args) => ({
    ...args,
    env: { GODAGENT_IDENTITY_POLICY_SHA256: '0'.repeat(64) },
    io: {
      readFile: async () => {
        untrustedPolicyArtifactReads += 1;
        throw new Error('unpinned policy attempted an artifact read');
      },
      realpath: async () => {
        untrustedPolicyArtifactReads += 1;
        throw new Error('unpinned policy attempted an artifact lookup');
      },
    },
  }), 'policy-integrity');
  assert.equal(untrustedPolicyArtifactReads, 0);
  await expectClosed('identity-policy-path', async (fixture, args) => {
    await rewritePolicy(fixture, (policy) => { policy.runtime.journalPath = 'foreign/journal.jsonl'; });
    return args;
  }, 'policy-mismatch');
  await expectClosed('identity-policy-realm', async (fixture, args) => {
    await rewritePolicy(fixture, (policy) => { policy.realmId = 'foreign-realm'; });
    return args;
  }, 'policy-mismatch');
  await expectClosed('identity-admission-tamper', async (fixture, args) => {
    const path = join(fixture.admissionRoot, 'binding.json');
    await writeFile(path, `${await readFile(path, 'utf8')} `, 'utf8');
    return args;
  }, 'admission-invalid');
  await expectClosed('identity-native-descriptor', async (fixture, args) => ({
    ...args,
    nativeTransport: {
      descriptor: () => buildIdentityBoundNativeTransportDescriptor({
        transportId: 'foreign-native-v1',
        maximumDispatchBytes: fixture.native.descriptor.maximumDispatchBytes,
        maximumCompletionBytes: fixture.native.descriptor.maximumCompletionBytes,
      }),
      reconcile: async () => { throw new Error('mismatched native transport executed'); },
      execute: async () => { throw new Error('mismatched native transport executed'); },
    },
  }), 'dependency-mismatch');
  await expectClosed('identity-review-pair', async (fixture, args) => ({
    ...args,
    reviewExecutor: null,
  }), 'dependency-mismatch');
});

test('interruption after sealed activation recovers without relaunching either Godskills process', async (t) => {
  const { launchAdmittedSealedIdentityMission, AdmittedSealedIdentityLaunchError } = await launcherModule();
  const fixture = await setup(t, 'admitted-sealed-host-recovery');
  const launches = { route: 0, activation: 0 };
  let crash = true;
  await assert.rejects(
    () => launchAdmittedSealedIdentityMission(launchArgs(fixture, {
      checkpoint: async (name) => {
        if (name === 'before-local-godskills-route-process') launches.route += 1;
        if (name === 'before-local-godskills-activation-process') launches.activation += 1;
        if (crash && name === 'after-local-godskills-activation-process') {
          crash = false;
          throw new Error('simulated process death after sealed activation success');
        }
      },
    })),
    (error) => error instanceof AdmittedSealedIdentityLaunchError && error.code === 'launch-failed',
  );
  const recovered = await launchAdmittedSealedIdentityMission(launchArgs(fixture, {
    checkpoint: async (name) => {
      if (name === 'before-local-godskills-route-process') throw new Error('route relaunched');
      if (name === 'before-local-godskills-activation-process') throw new Error('activation relaunched');
    },
  }));
  assert.equal(recovered.status, 'completed');
  assert.deepEqual(launches, { route: 1, activation: 1 });
  assert.equal(fixture.native.calls.filter(({ type }) => type === 'execute').length, 1);
});
