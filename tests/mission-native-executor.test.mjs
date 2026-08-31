import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import {
  buildMissionAdmission,
  buildMissionPhaseRequest,
  verifyMissionPhaseResult,
} from '../src/runtime/mission-phase-contracts.mjs';
import { createMissionNativeExecutor } from '../src/runtime/mission-native-executor.mjs';
import { verifyMissionNativePackage } from '../src/runtime/mission-native-materializer.mjs';
import {
  buildMissionNativeTransportCompletion,
  buildMissionNativeTransportDescriptor,
  verifyMissionNativeDispatch,
  verifyMissionNativeTransportCompletion,
  verifyMissionNativeTransportDescriptor,
} from '../src/runtime/mission-native-transport-contracts.mjs';
import {
  buildReviewAdmission,
  buildReviewGodskillsBinding,
  buildReviewGodskillsTrustPin,
} from './helpers/mission-review-fixture.mjs';

const authority = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

function nativeOnlyAdmission(missionId = 'mission-native-only') {
  return buildMissionAdmission({
    mission: {
      missionId,
      objective: 'produce one bounded native mission artifact',
      successEvidence: ['artifact is complete'],
      stopConditions: ['artifact is accepted'],
    },
    authorityCeilingDigest: 'b'.repeat(64),
    budgets: {
      maxArtifactBytes: 32_768,
      nativeCompletionTokens: 256,
      reviewCompletionTokensPerRound: 128,
      revisionCompletionTokens: 192,
      totalCompletionTokens: 704,
    },
    admittedAt: '2026-08-31T14:30:00.000Z',
  });
}

function methodAdmission({ credentialField = false } = {}) {
  const missionId = 'mission-native-method';
  const binding = buildReviewGodskillsBinding(missionId);
  const decisions = binding.receipt.activation.decisions.map((decision) => {
    const { decisionDigest: _ignored, ...unsigned } = decision;
    const changed = {
      ...unsigned,
      mode: 'method',
      reasonCodes: ['fixture-method'],
      preInferenceDisclosure: 'entrypoint-and-contract',
      deferredReview: false,
    };
    return { ...changed, decisionDigest: sha256Value(changed) };
  });
  const { resultDigest: _ignored, ...activationUnsigned } = binding.receipt.activation;
  const activationBase = { ...activationUnsigned, decisions };
  const activation = { ...activationBase, resultDigest: sha256Value(activationBase) };
  const selectedId = binding.receipt.selected[0].id;
  const selectedPackage = {
    id: selectedId,
    entrypoint: 'verify the exact mission evidence before completion',
    contract: 'fail closed on ambiguous or authority-expanding results',
    ...(credentialField ? { apiKey: 'do-not-echo-this-value' } : {}),
  };
  binding.cortexPackage = {
    ...binding.cortexPackage,
    selectedPackages: [selectedPackage],
    deferredReviews: [],
    disclosureBytes: Buffer.byteLength(canonicalJson(selectedPackage), 'utf8'),
    activation,
  };
  binding.receipt = {
    ...binding.receipt,
    activation,
    packageDigest: sha256Text(canonicalJson(binding.cortexPackage)),
  };
  return buildMissionAdmission({
    mission: {
      missionId,
      objective: 'produce one method-guided native artifact',
      successEvidence: ['method package is applied'],
      stopConditions: ['native artifact is complete'],
    },
    authorityCeilingDigest: binding.receipt.authorityCeilingDigest,
    budgets: {
      maxArtifactBytes: 32_768,
      nativeCompletionTokens: 256,
      reviewCompletionTokensPerRound: 128,
      revisionCompletionTokens: 192,
      totalCompletionTokens: 704,
    },
    godskillsBinding: binding,
    godskillsTrustPin: buildReviewGodskillsTrustPin(binding),
    admittedAt: '2026-08-31T14:30:00.000Z',
  });
}

function nativeContext(admission) {
  return {
    admission,
    mission: structuredClone(admission.mission),
    godskillsBinding: admission.godskills === null ? null : {
      receipt: structuredClone(admission.godskills.receipt),
      cortexPackage: structuredClone(admission.godskills.cortexPackage),
    },
  };
}

function transportFixture({
  reconciliation = 'absent',
  mutateCompletion = null,
  maximumCompletionBytes = 65_536,
  calls = [],
  terminals = new Map(),
} = {}) {
  const descriptor = buildMissionNativeTransportDescriptor({
    transportId: 'fixture-native-transport-v1',
    maximumCompletionBytes,
  });

  function completion(dispatch) {
    const built = buildMissionNativeTransportCompletion({
      dispatch,
      transportDescriptor: descriptor,
      artifact: {
        schemaVersion: 1,
        artifactType: 'native',
        content: 'one verified provider-neutral native artifact',
      },
      usage: {
        inputTokens: 31,
        cachedInputTokens: 11,
        reasoningTokens: 17,
        visibleOutputTokens: 23,
        completionTokens: 40,
      },
      startedAt: '2026-08-31T14:30:01.000Z',
      completedAt: '2026-08-31T14:30:02.000Z',
    });
    if (!mutateCompletion) return built;
    const changed = structuredClone(built);
    mutateCompletion(changed, dispatch);
    const { completionDigest: _ignored, ...unsigned } = changed;
    changed.completionDigest = sha256Value(unsigned);
    return changed;
  }

  return {
    calls,
    descriptor: () => structuredClone(descriptor),
    async reconcile(dispatch) {
      calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
      if (terminals.has(dispatch.dispatchDigest)) {
        return { status: 'completed', completion: structuredClone(terminals.get(dispatch.dispatchDigest)) };
      }
      if (reconciliation === 'pending') return { status: 'pending' };
      if (reconciliation === 'completed') {
        const terminal = completion(dispatch);
        terminals.set(dispatch.dispatchDigest, terminal);
        return { status: 'completed', completion: structuredClone(terminal) };
      }
      if (reconciliation !== 'absent') return { status: reconciliation };
      return { status: 'absent' };
    },
    async execute(dispatch) {
      calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
      if (terminals.has(dispatch.dispatchDigest)) throw new Error('duplicate native transport dispatch');
      const terminal = completion(dispatch);
      terminals.set(dispatch.dispatchDigest, terminal);
      return { status: 'completed', completion: structuredClone(terminal) };
    },
  };
}

async function executorState({
  bound = true,
  suppliedAdmission = null,
  transport = transportFixture(),
  maximumMaterializedBytes = 65_536,
} = {}) {
  const admission = suppliedAdmission ?? (bound
    ? buildReviewAdmission('mission-native-bound')
    : nativeOnlyAdmission());
  const executor = await createMissionNativeExecutor({
    maximumMaterializedBytes,
    transport,
  });
  const descriptor = executor.descriptor();
  const request = buildMissionPhaseRequest({
    admission,
    phase: 'native',
    round: 1,
    descriptor,
    inputs: admission.godskills === null ? [] : [{
      role: 'godskills-package',
      artifactDigest: admission.godskills.receipt.packageDigest,
    }],
    maxCompletionTokens: admission.budgets.nativeCompletionTokens,
  });
  return { admission, context: nativeContext(admission), descriptor, executor, request, transport };
}

test('native transport descriptor is deterministic, closed, and authority-empty', () => {
  const first = buildMissionNativeTransportDescriptor({
    transportId: 'native-provider-neutral-v1',
    maximumCompletionBytes: 4096,
  });
  const second = buildMissionNativeTransportDescriptor({
    maximumCompletionBytes: 4096,
    transportId: 'native-provider-neutral-v1',
  });
  assert.deepEqual(verifyMissionNativeTransportDescriptor(first), first);
  assert.deepEqual(first, second);
  assert.deepEqual(first.authority, authority);
  assert.equal(first.terminalReconciliation, 'by-dispatch-digest');
  assert.equal(first.atomicDeduplication, true);
  assert.equal(Object.hasOwn(first, 'provider'), false);
  assert.equal(canonicalJson(first).includes('credential'), false);
  const changed = structuredClone(first);
  changed.provider = 'forbidden';
  assert.throws(() => verifyMissionNativeTransportDescriptor(changed), /field|additionalProperties/i);
});

test('absent reconciliation materializes once and exact execution returns evidenced native result', async () => {
  const state = await executorState();
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const result = await state.executor.execute(state.request, state.context);
  const dispatch = state.transport.calls.find(({ type }) => type === 'execute').dispatch;
  const transportDescriptor = state.transport.descriptor();

  assert.deepEqual(verifyMissionNativePackage(dispatch.package), dispatch.package);
  assert.deepEqual(verifyMissionNativeDispatch(dispatch, {
    admission: state.admission,
    request: state.request,
    executorDescriptor: state.descriptor,
    transportDescriptor,
  }), dispatch);
  assert.deepEqual(verifyMissionPhaseResult(result, {
    request: state.request,
    descriptor: state.descriptor,
  }), result);
  assert.equal(result.artifact.artifactType, 'native');
  assert.equal(result.receipt.executorEvidenceDigest.length, 64);
  assert.equal(dispatch.package.mission.missionId, state.admission.mission.missionId);
  assert.equal(dispatch.package.admissionDigest, state.admission.admissionDigest);
  assert.equal(dispatch.package.godskills.bindingDigest, state.admission.godskills.bindingDigest);
  assert.equal(dispatch.package.godskills.packageDigest, state.admission.godskills.receipt.packageDigest);
  assert.deepEqual(dispatch.package.godskills.cortexPackage, state.admission.godskills.cortexPackage);
  assert.deepEqual(dispatch.package.godskills.cortexPackage.selectedPackages, []);
  assert.deepEqual(
    Object.keys(dispatch.package.godskills.cortexPackage.deferredReviews[0]).sort(),
    ['contractSha256', 'entrypointSha256', 'id', 'status'],
  );
  assert.deepEqual(dispatch.authority, authority);
  assert.equal(state.transport.calls.filter(({ type }) => type === 'execute').length, 1);
});

test('native-only mission carries no Godskills context or phantom phase input', async () => {
  const state = await executorState({ bound: false });
  assert.deepEqual(state.request.inputs, []);
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  await state.executor.execute(state.request, state.context);
  const dispatch = state.transport.calls.find(({ type }) => type === 'execute').dispatch;
  assert.equal(dispatch.package.godskills, null);
  assert.equal(canonicalJson(dispatch.package).includes('selectedPackages'), false);
});

test('admitted method package is carried exactly without loading or widening it', async () => {
  const admission = methodAdmission();
  const state = await executorState({ suppliedAdmission: admission });
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const dispatch = state.transport.calls.find(({ type }) => type === 'reconcile').dispatch;
  assert.deepEqual(
    dispatch.package.godskills.cortexPackage.selectedPackages,
    admission.godskills.cortexPackage.selectedPackages,
  );
  assert.deepEqual(dispatch.package.godskills.cortexPackage.deferredReviews, []);
  assert.equal(dispatch.package.godskills.cortexPackage.selectedPackages.length, 1);
  assert.equal(dispatch.package.godskills.cortexPackage.selectedPackages[0].id, 'eternities-aegis');
});

test('credential-shaped admitted method context is rejected before transport disclosure', async () => {
  const admission = methodAdmission({ credentialField: true });
  const state = await executorState({ suppliedAdmission: admission });
  await assert.rejects(
    () => state.executor.reconcile(state.request, state.context),
    (error) => /credential|apiKey/i.test(error.message)
      && !error.message.includes('do-not-echo-this-value'),
  );
  assert.deepEqual(state.transport.calls, []);
});

test('pending and completed native reconciliation never execute transport', async () => {
  const pending = await executorState({ transport: transportFixture({ reconciliation: 'pending' }) });
  assert.deepEqual(await pending.executor.reconcile(pending.request, pending.context), { status: 'pending' });
  assert.equal(pending.transport.calls.some(({ type }) => type === 'execute'), false);

  const completed = await executorState({ transport: transportFixture({ reconciliation: 'completed' }) });
  const recovered = await completed.executor.reconcile(completed.request, completed.context);
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.result.artifact.artifactType, 'native');
  assert.equal(completed.transport.calls.some(({ type }) => type === 'execute'), false);
});

test('ambiguous reconciliation and direct execution fail closed', async () => {
  for (const status of ['unknown', 'completed-without-result']) {
    const state = await executorState({ transport: transportFixture({ reconciliation: status }) });
    await assert.rejects(
      () => state.executor.reconcile(state.request, state.context),
      /state|status|field|reconciliation/i,
    );
  }
  const state = await executorState();
  await assert.rejects(
    () => state.executor.execute(state.request, state.context),
    /reconciliation|required/i,
  );
  assert.equal(state.transport.calls.some(({ type }) => type === 'execute'), false);
});

test('changed native context fails before transport use', async () => {
  const state = await executorState();
  const changed = structuredClone(state.context);
  changed.mission.objective = 'detached mission objective';
  await assert.rejects(
    () => state.executor.reconcile(state.request, changed),
    /context|mission|admission|binding/i,
  );
  assert.deepEqual(state.transport.calls, []);

  const authorityShaped = { ...state.context, authority: ['forbidden'] };
  await assert.rejects(
    () => state.executor.reconcile(state.request, authorityShaped),
    /context|fields/i,
  );
  assert.deepEqual(state.transport.calls, []);
});

test('request or context drift after absent reconciliation consumes the execution grant', async () => {
  const state = await executorState();
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const changed = structuredClone(state.context);
  changed.mission.objective = 'changed after exact reconciliation';
  await assert.rejects(
    () => state.executor.execute(state.request, changed),
    /changed|cache|context/i,
  );
  await assert.rejects(
    () => state.executor.execute(state.request, state.context),
    /reconciliation|required/i,
  );
  assert.equal(state.transport.calls.filter(({ type }) => type === 'execute').length, 0);
});

test('changed completion links, artifact, usage, authority, time, and fields fail after outer rehash', async () => {
  for (const [name, mutate, pattern] of [
    ['package', (value) => { value.packageDigest = 'f'.repeat(64); }, /package|completion/i],
    ['artifact-type', (value) => { value.artifact.artifactType = 'revision'; }, /artifact|phase|native/i],
    ['usage', (value) => {
      value.usage.reasoningTokens = 978;
      value.usage.completionTokens = 1001;
    }, /usage|token|completion/i],
    ['cached-usage', (value) => { value.usage.cachedInputTokens = 32; }, /usage|cached/i],
    ['authority', (value) => { value.authority.realmEffects = true; }, /authority|Realm/i],
    ['time', (value) => { value.completedAt = '2026-08-31T14:30:00.000Z'; }, /time|before|completion/i],
    ['credential', (value) => { value.apiKey = 'forbidden'; }, /field|additionalProperties/i],
    ['artifact-bytes', (value) => { value.artifact.content = 'x'.repeat(9000); }, /artifact.*byte|byte.*artifact/i],
  ]) {
    const state = await executorState({ transport: transportFixture({ mutateCompletion: mutate }) });
    assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
    await assert.rejects(() => state.executor.execute(state.request, state.context), pattern, name);
  }
});

test('completion and materialized package byte ceilings fail before acceptance or transport use', async () => {
  const completionState = await executorState({
    transport: transportFixture({ maximumCompletionBytes: 256 }),
  });
  assert.deepEqual(
    await completionState.executor.reconcile(completionState.request, completionState.context),
    { status: 'absent' },
  );
  await assert.rejects(
    () => completionState.executor.execute(completionState.request, completionState.context),
    /byte ceiling|bytes/i,
  );

  const packageState = await executorState({ maximumMaterializedBytes: 1024 });
  await assert.rejects(
    () => packageState.executor.reconcile(packageState.request, packageState.context),
    /package.*byte|byte ceiling/i,
  );
  assert.equal(packageState.transport.calls.length, 0);
});

test('dispatch rejects coherently rehashed mission, admission, ceiling, and Godskills detachment', async () => {
  for (const mutate of [
    (packageValue) => { packageValue.mission.missionId = 'detached-native-mission'; },
    (packageValue) => { packageValue.admissionDigest = 'f'.repeat(64); },
    (packageValue) => { packageValue.maxArtifactBytes = 16_777_216; },
    (packageValue) => { packageValue.godskills.bindingDigest = 'e'.repeat(64); },
    (packageValue) => {
      packageValue.godskills.cortexPackage.stackDigest = 'd'.repeat(64);
      packageValue.godskills.packageDigest = sha256Text(canonicalJson(packageValue.godskills.cortexPackage));
    },
  ]) {
    const state = await executorState();
    assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
    const dispatch = structuredClone(state.transport.calls.find(({ type }) => type === 'reconcile').dispatch);
    mutate(dispatch.package);
    const { packageDigest: _oldPackageDigest, ...packageUnsigned } = dispatch.package;
    dispatch.package.packageDigest = sha256Value(packageUnsigned);
    dispatch.packageDigest = dispatch.package.packageDigest;
    const { dispatchDigest: _oldDispatchDigest, ...dispatchUnsigned } = dispatch;
    dispatch.dispatchDigest = sha256Value(dispatchUnsigned);
    assert.throws(() => verifyMissionNativeDispatch(dispatch, {
      admission: state.admission,
      request: state.request,
      executorDescriptor: state.descriptor,
      transportDescriptor: state.transport.descriptor(),
    }), /mission|admission|binding|Godskills|dispatch/i);
  }
});

test('dispatch and completion verifiers reject post-build mutation', async () => {
  const state = await executorState();
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const dispatch = state.transport.calls.find(({ type }) => type === 'reconcile').dispatch;
  const transportDescriptor = state.transport.descriptor();
  const completion = buildMissionNativeTransportCompletion({
    dispatch,
    transportDescriptor,
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'immutable native completion' },
    usage: {
      inputTokens: 12,
      cachedInputTokens: 4,
      reasoningTokens: 9,
      visibleOutputTokens: 7,
      completionTokens: 16,
    },
    startedAt: '2026-08-31T14:31:00.000Z',
    completedAt: '2026-08-31T14:31:01.000Z',
  });
  assert.deepEqual(verifyMissionNativeTransportCompletion(completion, {
    dispatch,
    transportDescriptor,
  }), completion);

  const changedDispatch = structuredClone(dispatch);
  changedDispatch.package.mission.objective = 'mutated native objective';
  assert.throws(() => verifyMissionNativeDispatch(changedDispatch, {
    admission: state.admission,
    request: state.request,
    executorDescriptor: state.descriptor,
    transportDescriptor,
  }), /package|mission|digest/i);

  const changedCompletion = structuredClone(completion);
  changedCompletion.artifact.content = 'mutated native completion';
  assert.throws(() => verifyMissionNativeTransportCompletion(changedCompletion, {
    dispatch,
    transportDescriptor,
  }), /completion|digest/i);
});

test('transport responses are snapshotted and same-process duplicate execution is blocked', async () => {
  const transport = transportFixture();
  const originalExecute = transport.execute.bind(transport);
  let returned;
  transport.execute = async (dispatch) => {
    returned = await originalExecute(dispatch);
    setTimeout(() => { returned.completion.artifact.content = 'late mutation'; }, 0);
    return returned;
  };
  const state = await executorState({ transport });
  assert.deepEqual(await state.executor.reconcile(state.request, state.context), { status: 'absent' });
  const competing = await Promise.allSettled([
    state.executor.execute(state.request, state.context),
    state.executor.execute(state.request, state.context),
  ]);
  const fulfilled = competing.filter(({ status }) => status === 'fulfilled');
  const rejected = competing.filter(({ status }) => status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.message, /reconciliation|required/i);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(fulfilled[0].value.artifact.content, 'one verified provider-neutral native artifact');
  assert.equal(transport.calls.filter(({ type }) => type === 'execute').length, 1);
});

test('executor reconstruction reproduces the dispatch and recovers without redispatch', async () => {
  const transport = transportFixture();
  const first = await executorState({ transport });
  assert.deepEqual(await first.executor.reconcile(first.request, first.context), { status: 'absent' });
  const firstResult = await first.executor.execute(first.request, first.context);
  const firstDispatch = transport.calls.find(({ type }) => type === 'execute').dispatch;

  transport.calls.length = 0;
  const second = await executorState({ transport });
  const recovered = await second.executor.reconcile(second.request, second.context);
  const recoveredDispatch = transport.calls.find(({ type }) => type === 'reconcile').dispatch;

  assert.equal(recovered.status, 'completed');
  assert.deepEqual(recovered.result, firstResult);
  assert.deepEqual(recoveredDispatch, firstDispatch);
  assert.equal(transport.calls.some(({ type }) => type === 'execute'), false);
});
