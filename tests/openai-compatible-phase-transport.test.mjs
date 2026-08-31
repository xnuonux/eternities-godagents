import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { compileCortexBindingCandidate } from '../src/cortex/binding-compiler.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildIdentityBoundNativeDispatch,
  buildIdentityBoundNativeTransportDescriptor,
  verifyIdentityBoundNativeCompletion,
} from '../src/runtime/identity-bound-native-contracts.mjs';
import { createMissionNativeMaterializer } from '../src/runtime/mission-native-materializer.mjs';
import {
  buildMissionAdmission,
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
  verifyMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createMissionRevisionExecutor } from '../src/runtime/mission-revision-executor.mjs';
import {
  buildMissionNativeDispatch,
  buildMissionNativeTransportDescriptor,
} from '../src/runtime/mission-native-transport-contracts.mjs';
import { buildMissionRevisionTransportDescriptor } from '../src/runtime/mission-revision-transport-contracts.mjs';
import { createDeferredGodskillsReviewExecutor } from '../src/skills/deferred-review-executor.mjs';
import { buildGodskillsReviewTransportDescriptor } from '../src/skills/review-transport-contracts.mjs';
import { createOpenAICompatiblePhaseTransportSuite } from '../src/transports/openai-compatible-phase-transport.mjs';
import { pinnedGodskillsReviewRelease } from '../scripts/lib/pinned-godskills-review-release.mjs';
import {
  cortexBindingRequest,
  setupAdmittedIdentity,
} from './helpers/admitted-identity-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import {
  buildReviewAdmission,
  buildReviewGodskillsBinding,
} from './helpers/mission-review-fixture.mjs';

const godskillsRoot = 'C:/dev/eternities-godskills';

async function setup(t, {
  policy = validOpenAICompatiblePhasePolicy(),
  secret = 'canary-phase-transport-secret',
  fetchImpl,
  clock,
  checkpoint,
  lockOptions,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-openai-phase-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policyPath = join(root, 'policy.json');
  const runtimeRoot = join(root, 'operations');
  const digest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  const env = {
    GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: digest,
    [policy.provider.credentialEnv]: secret,
  };
  const calls = [];
  const suite = await createOpenAICompatiblePhaseTransportSuite({
    policyPath,
    env,
    runtimeRoot,
    fetchImpl: fetchImpl ?? (async (...args) => {
      calls.push(args);
      throw new Error('unexpected network call');
    }),
    ...(clock ? { clock } : {}),
    ...(checkpoint ? { checkpoint } : {}),
    ...(lockOptions ? { lockOptions } : {}),
  });
  return { root, runtimeRoot, policy, policyPath, digest, env, secret, calls, suite };
}

function nativeProviderResponse(content = 'one exact identity-bound native artifact') {
  return new Response(JSON.stringify({
    id: 'chatcmpl-native-fixture',
    object: 'chat.completion',
    model: 'fixture-model-2026-08-31',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: JSON.stringify({ content }) },
    }],
    usage: {
      prompt_tokens: 240,
      prompt_tokens_details: { cached_tokens: 180 },
      completion_tokens: 40,
      completion_tokens_details: { reasoning_tokens: 10 },
      total_tokens: 280,
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function allFileText(root) {
  const values = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) values.push(await readFile(child, 'utf8'));
    }
  }
  await walk(root);
  return values.join('\n');
}

function missionAdmission(bindingRequest) {
  return buildMissionAdmission({
    mission: {
      missionId: bindingRequest.mission.missionId,
      objective: bindingRequest.mission.objective,
      successEvidence: [...bindingRequest.mission.successEvidence].sort(),
      stopConditions: [...bindingRequest.mission.stopConditions].sort(),
    },
    authorityCeilingDigest: 'b'.repeat(64),
    budgets: {
      maxArtifactBytes: 32_768,
      nativeCompletionTokens: 400,
      reviewCompletionTokensPerRound: 400,
      revisionCompletionTokens: 600,
      totalCompletionTokens: 1800,
    },
    admittedAt: '2026-08-31T18:00:00.000Z',
  });
}

function missionOuterDispatch(admission) {
  const executorDescriptor = buildMissionExecutorDescriptor({
    executorId: 'openai-compatible-native-outer-fixture',
    phase: 'native',
  });
  const request = buildMissionPhaseRequest({
    admission,
    descriptor: executorDescriptor,
    phase: 'native',
    round: 1,
    inputs: [],
    maxCompletionTokens: admission.budgets.nativeCompletionTokens,
  });
  const materializer = createMissionNativeMaterializer({ maximumMaterializedBytes: 65_536 });
  const packageValue = materializer.materialize({
    admission,
    request,
    descriptor: executorDescriptor,
    mission: admission.mission,
    godskillsBinding: null,
  });
  return buildMissionNativeDispatch({
    admission,
    request,
    executorDescriptor,
    transportDescriptor: buildMissionNativeTransportDescriptor({
      transportId: 'openai-compatible-native-outer-transport-v1',
      maximumCompletionBytes: 65_536,
    }),
    packageValue,
  });
}

async function nativeDispatch(t, transportDescriptor) {
  const admitted = await setupAdmittedIdentity(t, 'openai-compatible-phase-native');
  const bindingRequest = cortexBindingRequest();
  const candidate = await compileCortexBindingCandidate({ admission: admitted.admission, request: bindingRequest });
  const admission = missionAdmission(bindingRequest);
  return buildIdentityBoundNativeDispatch({
    candidate,
    vesselAdmissionDigest: 'd'.repeat(64),
    outerDispatch: missionOuterDispatch(admission),
    transportDescriptor,
  });
}

async function reviewExecution(t, suite) {
  const executor = await createDeferredGodskillsReviewExecutor({
    releasePin: pinnedGodskillsReviewRelease(godskillsRoot),
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'openai-compatible-review-fixture',
    transport: suite.review,
    io: { readFile, realpath },
  });
  const manifest = JSON.parse(await readFile(
    `${godskillsRoot}/artifacts/portable-capabilities/manifest.v1.json`,
    'utf8',
  ));
  const capability = manifest.capabilities.find(({ id }) => id === 'eternities-aegis');
  const missionId = 'mission-openai-compatible-review';
  const binding = buildReviewGodskillsBinding(missionId, {
    id: capability.id,
    entrypointSha256: capability.entrypoint.sha256,
    contractSha256: capability.contract.sha256,
    releaseDigest: executor.releaseDigest,
    activationTrustRootDigest: executor.activationTrustRootDigest,
  });
  const admission = buildReviewAdmission(missionId, { godskillsBinding: binding });
  const descriptor = executor.descriptor();
  const subject = {
    schemaVersion: 1,
    artifactType: 'native',
    content: 'native subject requiring one exact Godskills review',
  };
  const request = buildMissionPhaseRequest({
    admission,
    phase: 'review',
    round: 1,
    descriptor,
    inputs: [
      { role: 'godskills-binding', artifactDigest: admission.godskills.bindingDigest },
      { role: 'subject', artifactDigest: sha256Text(canonicalJson(subject)) },
    ],
    maxCompletionTokens: admission.budgets.reviewCompletionTokensPerRound,
  });
  const context = {
    admission,
    subject,
    deferredReviews: admission.godskills.deferredReviews,
    godskillsReceipt: admission.godskills.receipt,
    priorReview: null,
    revision: null,
  };
  return { executor, descriptor, admission, subject, request, context };
}

async function revisionExecution(suite) {
  const executor = await createMissionRevisionExecutor({
    maximumMaterializedBytes: 65_536,
    executorIdPrefix: 'openai-compatible-revision-fixture',
    transport: suite.revision,
  });
  const missionId = 'mission-openai-compatible-revision';
  const admission = buildReviewAdmission(missionId);
  const descriptor = executor.descriptor();
  const native = {
    schemaVersion: 1,
    artifactType: 'native',
    content: 'native artifact with one evidence gap and otherwise strong structure',
  };
  const review = {
    schemaVersion: 1,
    artifactType: 'review',
    subjectDigest: sha256Text(canonicalJson(native)),
    recommendation: 'revise',
    findings: [
      { id: 'bind-evidence', severity: 'important', required: true, message: 'bind the factual claim to evidence' },
      { id: 'trim-prose', severity: 'advisory', required: false, message: 'remove one redundant phrase' },
    ],
    summary: 'one required correction and one optional refinement',
  };
  const request = buildMissionPhaseRequest({
    admission,
    phase: 'revision',
    round: 1,
    descriptor,
    inputs: [
      { role: 'native', artifactDigest: sha256Text(canonicalJson(native)) },
      { role: 'review', artifactDigest: sha256Text(canonicalJson(review)) },
    ],
    maxCompletionTokens: admission.budgets.revisionCompletionTokens,
  });
  return {
    executor,
    descriptor,
    request,
    context: { admission, native, review },
    native,
    review,
  };
}

test('one pinned policy deterministically binds three closed phase descriptors', async (t) => {
  const state = await setup(t);
  const expectedId = (phase) => `openai-compatible-${phase}:${state.digest}`;
  const native = buildIdentityBoundNativeTransportDescriptor({
    transportId: expectedId('native'),
    maximumDispatchBytes: state.policy.phases.native.maximumDispatchBytes,
    maximumCompletionBytes: state.policy.phases.native.maximumCompletionBytes,
  });
  const review = buildGodskillsReviewTransportDescriptor({
    transportId: expectedId('review'),
    maximumCompletionBytes: state.policy.phases.review.maximumCompletionBytes,
  });
  const revision = buildMissionRevisionTransportDescriptor({
    transportId: expectedId('revision'),
    maximumCompletionBytes: state.policy.phases.revision.maximumCompletionBytes,
  });

  assert.equal(state.suite.policyDigest, state.digest);
  assert.deepEqual(await state.suite.native.descriptor(), native);
  assert.deepEqual(await state.suite.review.descriptor(), review);
  assert.deepEqual(await state.suite.revision.descriptor(), revision);
  assert.deepEqual(state.suite.descriptors, { native, review, revision });
  assert.equal(Object.isFrozen(state.suite), true);
  assert.equal(Object.isFrozen(state.suite.descriptors.native), true);
  const serialized = JSON.stringify(state.suite);
  assert.equal(serialized.includes(state.secret), false);
  assert.equal(serialized.includes(state.root), false);
  assert.equal(state.calls.length, 0);
});

test('provider policy changes alter every descriptor without exposing endpoint or model', async (t) => {
  const first = await setup(t);
  const changed = validOpenAICompatiblePhasePolicy();
  changed.provider.modelId = 'fixture-model-2026-09-01';
  const second = await setup(t, { policy: changed, secret: 'second-canary-secret' });
  for (const phase of ['native', 'review', 'revision']) {
    assert.notEqual(first.suite.descriptors[phase].descriptorDigest, second.suite.descriptors[phase].descriptorDigest);
    const serialized = canonicalJson(first.suite.descriptors[phase]);
    assert.equal(serialized.includes(first.policy.provider.endpointOrigin), false);
    assert.equal(serialized.includes(first.policy.provider.modelId), false);
  }
});

test('credential-bearing input is rejected before durable or network work', async (t) => {
  const state = await setup(t);
  assert.deepEqual(state.suite.assertCredentialAbsent({ objective: 'ordinary mission' }), { objective: 'ordinary mission' });
  assert.throws(
    () => state.suite.assertCredentialAbsent({ objective: `leaked ${state.secret}` }),
    (error) => error.code === 'credential-in-input'
      && !error.message.includes(state.secret),
  );
  assert.equal(state.calls.length, 0);
});

test('native transport emits one strict bounded request and assigns trusted completion fields', async (t) => {
  const captured = [];
  const times = ['2026-08-31T17:00:00.000Z', '2026-08-31T17:00:00.500Z'];
  const state = await setup(t, {
    clock: () => times.shift(),
    fetchImpl: async (url, request) => {
      captured.push({ url: String(url), request: structuredClone(request) });
      return nativeProviderResponse();
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);

  assert.deepEqual(await state.suite.native.reconcile(dispatch), { status: 'absent' });
  const executed = await state.suite.native.execute(dispatch);
  assert.equal(executed.status, 'completed');
  verifyIdentityBoundNativeCompletion(executed.completion, {
    dispatch,
    transportDescriptor: state.suite.descriptors.native,
  });
  assert.deepEqual(executed.completion.artifact, {
    schemaVersion: 1,
    artifactType: 'native',
    content: 'one exact identity-bound native artifact',
  });
  assert.deepEqual(executed.completion.usage, {
    inputTokens: 240,
    cachedInputTokens: 180,
    reasoningTokens: 10,
    visibleOutputTokens: 30,
    completionTokens: 40,
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, 'https://models.example.test/v1/chat/completions');
  assert.equal(captured[0].request.headers.authorization, `Bearer ${state.secret}`);
  const body = JSON.parse(captured[0].request.body);
  assert.equal(body.model, state.policy.provider.modelId);
  assert.equal(body.n, 1);
  assert.equal(body.stream, false);
  assert.equal(body.store, false);
  assert.equal(body.max_completion_tokens, dispatch.maxCompletionTokens);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.response_format.json_schema.name, 'native_phase_output_v1');
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /untrusted|authority|json/i);
  const modelInput = JSON.parse(body.messages[1].content);
  assert.equal(modelInput.phase, 'native');
  assert.equal(modelInput.dispatchDigest, dispatch.dispatchDigest);
  assert.deepEqual(modelInput.modelProjection, dispatch.modelProjection);
  assert.deepEqual(modelInput.missionPackage, dispatch.missionPackage);
  assert.equal(captured[0].request.body.includes(state.secret), false);
});

test('process reconstruction reconciles the exact native completion without a second request', async (t) => {
  let networkCalls = 0;
  const times = ['2026-08-31T17:05:00.000Z', '2026-08-31T17:05:00.500Z'];
  const state = await setup(t, {
    clock: () => times.shift(),
    fetchImpl: async () => { networkCalls += 1; return nativeProviderResponse('durable recovered native artifact'); },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  const first = await state.suite.native.execute(dispatch);
  assert.equal(networkCalls, 1);
  delete state.env[state.policy.provider.credentialEnv];

  const reconstructed = await createOpenAICompatiblePhaseTransportSuite({
    policyPath: state.policyPath,
    env: state.env,
    runtimeRoot: state.runtimeRoot,
    fetchImpl: async () => { networkCalls += 1; throw new Error('replay must not call provider'); },
  });
  const reconciled = await reconstructed.native.reconcile(dispatch);
  assert.equal(reconciled.status, 'completed');
  assert.deepEqual(reconciled.completion, first.completion);
  const replayed = await reconstructed.native.execute(dispatch);
  assert.deepEqual(replayed, first);
  assert.equal(networkCalls, 1);
});

test('concurrent execution of one dispatch produces at most one provider request', async (t) => {
  let networkCalls = 0;
  let releaseProvider;
  let reportStarted;
  const providerStarted = new Promise((resolve) => { reportStarted = resolve; });
  const providerRelease = new Promise((resolve) => { releaseProvider = resolve; });
  const times = ['2026-08-31T17:06:00.000Z', '2026-08-31T17:06:00.500Z'];
  const state = await setup(t, {
    clock: () => times.shift(),
    fetchImpl: async () => {
      networkCalls += 1;
      reportStarted();
      await providerRelease;
      return nativeProviderResponse('single concurrent native artifact');
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  const first = state.suite.native.execute(dispatch);
  await providerStarted;
  await assert.rejects(
    state.suite.native.execute(dispatch),
    (error) => error.code === 'operation-pending',
  );
  releaseProvider();
  const completed = await first;
  assert.equal(completed.status, 'completed');
  assert.equal(networkCalls, 1);
});

test('interruption after durable attempt publication remains pending and never redispatches', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    clock: () => '2026-08-31T17:07:00.000Z',
    checkpoint: async (label) => {
      if (label === 'after-openai-phase-attempt-persisted') throw new Error('fixture process death');
    },
    fetchImpl: async () => { networkCalls += 1; return nativeProviderResponse(); },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(
    state.suite.native.execute(dispatch),
    (error) => error.code === 'operation-integrity',
  );
  assert.equal(networkCalls, 0);

  const reconstructed = await createOpenAICompatiblePhaseTransportSuite({
    policyPath: state.policyPath,
    env: state.env,
    runtimeRoot: state.runtimeRoot,
    fetchImpl: async () => { networkCalls += 1; return nativeProviderResponse(); },
  });
  assert.deepEqual(await reconstructed.native.reconcile(dispatch), { status: 'pending' });
  await assert.rejects(
    reconstructed.native.execute(dispatch),
    (error) => error.code === 'operation-pending',
  );
  assert.equal(networkCalls, 0);
});

test('ambiguous network failure remains pending and cannot buy a duplicate completion', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    clock: () => '2026-08-31T17:07:30.000Z',
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('connection vanished after write');
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(
    state.suite.native.execute(dispatch),
    (error) => error.code === 'provider-ambiguous'
      && !error.message.includes('connection vanished'),
  );
  assert.equal(networkCalls, 1);
  assert.deepEqual(await state.suite.native.reconcile(dispatch), { status: 'pending' });
  await assert.rejects(
    state.suite.native.execute(dispatch),
    (error) => error.code === 'operation-pending',
  );
  assert.equal(networkCalls, 1);
});

test('credential reflection closes durably without persisting or emitting the raw secret', async (t) => {
  let networkCalls = 0;
  const times = [
    '2026-08-31T17:08:00.000Z',
    '2026-08-31T17:08:00.250Z',
    '2026-08-31T17:08:00.500Z',
  ];
  const state = await setup(t, {
    clock: () => times.shift(),
    fetchImpl: async () => {
      networkCalls += 1;
      return nativeProviderResponse(`provider reflected ${state.secret}`);
    },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(
    state.suite.native.execute(dispatch),
    (error) => error.code === 'credential-reflected' && !error.message.includes(state.secret),
  );
  assert.equal(networkCalls, 1);
  const durableText = await allFileText(state.runtimeRoot);
  assert.equal(durableText.includes(state.secret), false);
  assert.equal(durableText.includes('provider reflected'), false);
  assert.match(durableText, /credential-reflected/);

  const reconstructed = await createOpenAICompatiblePhaseTransportSuite({
    policyPath: state.policyPath,
    env: state.env,
    runtimeRoot: state.runtimeRoot,
    fetchImpl: async () => { networkCalls += 1; throw new Error('terminal failure must not redispatch'); },
  });
  await assert.rejects(
    reconstructed.native.reconcile(dispatch),
    (error) => error.code === 'credential-reflected' && !error.message.includes(state.secret),
  );
  assert.equal(networkCalls, 1);
});

test('provider rejection persists status and response digest without the raw provider body', async (t) => {
  const rawError = 'private upstream diagnostic that must not persist';
  const times = ['2026-08-31T17:08:30.000Z', '2026-08-31T17:08:30.500Z'];
  const state = await setup(t, {
    clock: () => times.shift(),
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: rawError } }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await assert.rejects(
    state.suite.native.execute(dispatch),
    (error) => error.code === 'provider-rejected' && !error.message.includes(rawError),
  );
  const durableText = await allFileText(state.runtimeRoot);
  assert.equal(durableText.includes(rawError), false);
  assert.match(durableText, /"httpStatus":429/);
  assert.match(durableText, /"responseDigest":"[a-f0-9]{64}"/);
  await assert.rejects(
    state.suite.native.reconcile(dispatch),
    (error) => error.code === 'provider-rejected',
  );
});

test('request and provider response ceilings fail before unsafe replay', async (t) => {
  const narrowRequestPolicy = validOpenAICompatiblePhasePolicy();
  narrowRequestPolicy.provider.maximumRequestBytes = 1024;
  const requestState = await setup(t, { policy: narrowRequestPolicy });
  const requestDispatch = await nativeDispatch(t, requestState.suite.descriptors.native);
  await assert.rejects(
    requestState.suite.native.reconcile(requestDispatch),
    (error) => error.code === 'request-over-budget',
  );
  assert.equal(requestState.calls.length, 0);

  const narrowTokenPolicy = validOpenAICompatiblePhasePolicy();
  narrowTokenPolicy.phases.native.maximumCompletionTokens = 399;
  const tokenState = await setup(t, { policy: narrowTokenPolicy });
  const tokenDispatch = await nativeDispatch(t, tokenState.suite.descriptors.native);
  await assert.rejects(
    tokenState.suite.native.reconcile(tokenDispatch),
    (error) => error.code === 'request-over-budget',
  );
  assert.equal(tokenState.calls.length, 0);

  let responseCalls = 0;
  const narrowResponsePolicy = validOpenAICompatiblePhasePolicy();
  narrowResponsePolicy.provider.maximumResponseBytes = 256;
  const times = ['2026-08-31T17:09:00.000Z', '2026-08-31T17:09:00.500Z'];
  const responseState = await setup(t, {
    policy: narrowResponsePolicy,
    clock: () => times.shift(),
    fetchImpl: async () => {
      responseCalls += 1;
      return nativeProviderResponse('x'.repeat(2048));
    },
  });
  const responseDispatch = await nativeDispatch(t, responseState.suite.descriptors.native);
  await assert.rejects(
    responseState.suite.native.execute(responseDispatch),
    (error) => error.code === 'response-over-budget',
  );
  assert.equal(responseCalls, 1);
  await assert.rejects(
    responseState.suite.native.reconcile(responseDispatch),
    (error) => error.code === 'response-over-budget',
  );
});

test('model mismatch tool use ambiguity and contradictory usage close as response-invalid', async (t) => {
  const variants = [
    ['model mismatch', (body) => { body.model = 'different-model'; }],
    ['tool call', (body) => { body.choices[0].message.tool_calls = []; }],
    ['multiple choices', (body) => { body.choices.push(structuredClone(body.choices[0])); }],
    ['usage contradiction', (body) => { body.usage.completion_tokens_details.reasoning_tokens = 41; }],
  ];
  for (const [name, mutate] of variants) {
    let responseBody;
    const baseResponse = nativeProviderResponse();
    responseBody = JSON.parse(await baseResponse.text());
    mutate(responseBody);
    const times = [
      '2026-08-31T17:11:00.000Z',
      '2026-08-31T17:11:00.250Z',
      '2026-08-31T17:11:00.500Z',
    ];
    const state = await setup(t, {
      secret: `canary-${name.replace(' ', '-')}`,
      clock: () => times.shift(),
      fetchImpl: async () => new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });
    const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
    await assert.rejects(
      state.suite.native.execute(dispatch),
      (error) => error.code === 'response-invalid',
      name,
    );
    await assert.rejects(
      state.suite.native.reconcile(dispatch),
      (error) => error.code === 'response-invalid',
      `${name} recovery`,
    );
  }
});

test('symlinked operation slots fail integrity before provider access', async (t) => {
  let networkCalls = 0;
  const state = await setup(t, {
    fetchImpl: async () => { networkCalls += 1; return nativeProviderResponse(); },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  const phaseRoot = join(state.runtimeRoot, 'native');
  const target = join(state.root, 'foreign-operation-target');
  await mkdir(phaseRoot, { recursive: true });
  await mkdir(target);
  await symlink(target, join(phaseRoot, dispatch.dispatchDigest), 'junction');

  await assert.rejects(
    state.suite.native.reconcile(dispatch),
    (error) => error.code === 'operation-integrity',
  );
  assert.equal(networkCalls, 0);
});

test('coherently rehashed prepared-state substitution fails before terminal replay', async (t) => {
  let networkCalls = 0;
  const times = ['2026-08-31T17:12:00.000Z', '2026-08-31T17:12:00.500Z'];
  const state = await setup(t, {
    clock: () => times.shift(),
    fetchImpl: async () => { networkCalls += 1; return nativeProviderResponse(); },
  });
  const dispatch = await nativeDispatch(t, state.suite.descriptors.native);
  await state.suite.native.execute(dispatch);
  const preparedPath = join(state.runtimeRoot, 'native', dispatch.dispatchDigest, 'prepared.json');
  const prepared = JSON.parse(await readFile(preparedPath, 'utf8'));
  prepared.requestBytes += 1;
  const { recordDigest: _oldDigest, ...unsigned } = prepared;
  prepared.recordDigest = sha256Value(unsigned);
  await writeFile(preparedPath, `${canonicalJson(prepared)}\n`, 'utf8');

  await assert.rejects(
    state.suite.native.reconcile(dispatch),
    (error) => error.code === 'operation-integrity',
  );
  assert.equal(networkCalls, 1);
});

test('review transport exposes only critique fields and assigns the exact subject digest', async (t) => {
  const captured = [];
  const times = ['2026-08-31T17:10:00.000Z', '2026-08-31T17:10:00.500Z'];
  const state = await setup(t, {
    clock: () => times.shift(),
    fetchImpl: async (url, request) => {
      captured.push({ url: String(url), request: structuredClone(request) });
      return new Response(JSON.stringify({
        id: 'chatcmpl-review-fixture',
        object: 'chat.completion',
        model: 'fixture-model-2026-08-31',
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify({
              recommendation: 'accept',
              findings: [],
              summary: 'the exact subject satisfies the activated review contract',
            }),
          },
        }],
        usage: { prompt_tokens: 300, completion_tokens: 30, total_tokens: 330 },
      }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
    },
  });
  const fixture = await reviewExecution(t, state.suite);

  assert.deepEqual(await fixture.executor.reconcile(fixture.request, fixture.context), { status: 'absent' });
  const result = await fixture.executor.execute(fixture.request, fixture.context);
  verifyMissionPhaseResult(result, { request: fixture.request, descriptor: fixture.descriptor });
  assert.equal(result.artifact.subjectDigest, sha256Text(canonicalJson(fixture.subject)));
  assert.equal(result.artifact.recommendation, 'accept');
  assert.deepEqual(result.artifact.findings, []);
  assert.deepEqual(result.receipt.usage, {
    inputTokens: 300,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    visibleOutputTokens: 30,
    completionTokens: 30,
  });
  assert.equal(captured.length, 1);
  const body = JSON.parse(captured[0].request.body);
  assert.equal(body.response_format.json_schema.name, 'review_phase_output_v1');
  assert.deepEqual(body.response_format.json_schema.schema.required, ['recommendation', 'findings', 'summary']);
  assert.equal(body.response_format.json_schema.schema.properties.subjectDigest, undefined);
  const modelInput = JSON.parse(body.messages[1].content);
  assert.equal(modelInput.phase, 'review');
  assert.equal(modelInput.package.subject.artifactDigest, result.artifact.subjectDigest);
  assert.equal(captured[0].request.body.includes(state.secret), false);
});

test('revision transport restricts finding ids and assigns both immutable input digests', async (t) => {
  const captured = [];
  const times = ['2026-08-31T17:20:00.000Z', '2026-08-31T17:20:00.500Z'];
  const state = await setup(t, {
    clock: () => times.shift(),
    fetchImpl: async (url, request) => {
      captured.push({ url: String(url), request: structuredClone(request) });
      return new Response(JSON.stringify({
        id: 'chatcmpl-revision-fixture',
        object: 'chat.completion',
        model: 'fixture-model-2026-08-31',
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify({
              addressedFindingIds: ['bind-evidence'],
              content: 'revised artifact with its factual claim bound to exact evidence',
            }),
          },
        }],
        usage: {
          prompt_tokens: 350,
          prompt_tokens_details: { cached_tokens: 256 },
          completion_tokens: 50,
          completion_tokens_details: { reasoning_tokens: 20 },
          total_tokens: 400,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const fixture = await revisionExecution(state.suite);

  assert.deepEqual(await fixture.executor.reconcile(fixture.request, fixture.context), { status: 'absent' });
  const result = await fixture.executor.execute(fixture.request, fixture.context);
  verifyMissionPhaseResult(result, { request: fixture.request, descriptor: fixture.descriptor });
  assert.equal(result.artifact.nativeArtifactDigest, sha256Text(canonicalJson(fixture.native)));
  assert.equal(result.artifact.reviewArtifactDigest, sha256Text(canonicalJson(fixture.review)));
  assert.deepEqual(result.artifact.addressedFindingIds, ['bind-evidence']);
  assert.equal(captured.length, 1);
  const body = JSON.parse(captured[0].request.body);
  assert.equal(body.response_format.json_schema.name, 'revision_phase_output_v1');
  assert.deepEqual(
    body.response_format.json_schema.schema.properties.addressedFindingIds.items.enum,
    ['bind-evidence', 'trim-prose'],
  );
  assert.equal(body.response_format.json_schema.schema.properties.nativeArtifactDigest, undefined);
  assert.equal(body.response_format.json_schema.schema.properties.reviewArtifactDigest, undefined);
  const modelInput = JSON.parse(body.messages[1].content);
  assert.equal(modelInput.phase, 'revision');
  assert.deepEqual(modelInput.package.native.artifact, fixture.native);
  assert.deepEqual(modelInput.package.review.artifact, fixture.review);
  assert.equal(captured[0].request.body.includes(state.secret), false);
});

test('semantic review and revision contradictions fail closed before artifact acceptance', async (t) => {
  const reviewTimes = [
    '2026-08-31T17:30:00.000Z',
    '2026-08-31T17:30:00.250Z',
    '2026-08-31T17:30:00.500Z',
  ];
  const reviewState = await setup(t, {
    secret: 'review-semantic-canary',
    clock: () => reviewTimes.shift(),
    fetchImpl: async () => new Response(JSON.stringify({
      model: 'fixture-model-2026-08-31',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            recommendation: 'accept',
            findings: [{ id: 'blocking', severity: 'critical', required: true, message: 'still blocked' }],
            summary: 'contradictory acceptance',
          }),
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const reviewFixture = await reviewExecution(t, reviewState.suite);
  await reviewFixture.executor.reconcile(reviewFixture.request, reviewFixture.context);
  await assert.rejects(
    reviewFixture.executor.execute(reviewFixture.request, reviewFixture.context),
    (error) => error.code === 'response-invalid',
  );

  const revisionTimes = [
    '2026-08-31T17:31:00.000Z',
    '2026-08-31T17:31:00.250Z',
    '2026-08-31T17:31:00.500Z',
  ];
  const revisionState = await setup(t, {
    secret: 'revision-semantic-canary',
    clock: () => revisionTimes.shift(),
    fetchImpl: async () => new Response(JSON.stringify({
      model: 'fixture-model-2026-08-31',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            addressedFindingIds: ['unknown-finding'],
            content: 'revision that addresses the wrong finding',
          }),
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const revisionFixture = await revisionExecution(revisionState.suite);
  await revisionFixture.executor.reconcile(revisionFixture.request, revisionFixture.context);
  await assert.rejects(
    revisionFixture.executor.execute(revisionFixture.request, revisionFixture.context),
    (error) => error.code === 'response-invalid',
  );
});
