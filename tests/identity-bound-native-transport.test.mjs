import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test from 'node:test';

import { compileCortexBindingCandidate } from '../src/cortex/binding-compiler.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildIdentityBoundNativeCompletion,
  buildIdentityBoundNativeDispatch,
  buildIdentityBoundNativeTransportDescriptor,
  verifyIdentityBoundNativeCompletion,
  verifyIdentityBoundNativeDispatch,
  verifyIdentityBoundNativeTransportDescriptor,
} from '../src/runtime/identity-bound-native-contracts.mjs';
import { createIdentityBoundMissionNativeTransport } from '../src/runtime/identity-bound-native-transport.mjs';
import { createMissionNativeExecutor } from '../src/runtime/mission-native-executor.mjs';
import { createMissionNativeMaterializer } from '../src/runtime/mission-native-materializer.mjs';
import {
  buildMissionAdmission,
  buildMissionExecutorDescriptor,
  buildMissionPhaseRequest,
} from '../src/runtime/mission-phase-contracts.mjs';
import {
  buildMissionNativeDispatch,
  buildMissionNativeTransportDescriptor,
} from '../src/runtime/mission-native-transport-contracts.mjs';
import {
  cortexBindingRequest,
  setupAdmittedIdentity,
} from './helpers/admitted-identity-fixture.mjs';

const emptyAuthority = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

function usage(completionTokens = 90) {
  return {
    inputTokens: 500,
    cachedInputTokens: 420,
    reasoningTokens: completionTokens - 30,
    visibleOutputTokens: 30,
    completionTokens,
  };
}

function nativeAdmission(bindingRequest) {
  const { mission } = bindingRequest;
  return buildMissionAdmission({
    mission: {
      missionId: mission.missionId,
      objective: mission.objective,
      successEvidence: [...mission.successEvidence].sort(),
      stopConditions: [...mission.stopConditions].sort(),
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

function outerDispatch(admission, transportDescriptor) {
  const descriptor = buildMissionExecutorDescriptor({
    executorId: 'identity-bound-native-outer-fixture',
    phase: 'native',
  });
  const request = buildMissionPhaseRequest({
    admission,
    descriptor,
    phase: 'native',
    round: 1,
    inputs: [],
    maxCompletionTokens: admission.budgets.nativeCompletionTokens,
  });
  const materializer = createMissionNativeMaterializer({ maximumMaterializedBytes: 65_536 });
  const packageValue = materializer.materialize({
    admission,
    request,
    descriptor,
    mission: admission.mission,
    godskillsBinding: null,
  });
  return buildMissionNativeDispatch({
    admission,
    request,
    executorDescriptor: descriptor,
    transportDescriptor,
    packageValue,
  });
}

function innerTransport({
  calls = [],
  completions = new Map(),
  reconciliation = 'absent',
  mutateCompletion = null,
} = {}) {
  const descriptor = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'fixture-identity-cortex-v1',
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 65_536,
  });
  const complete = (dispatch) => {
    const value = buildIdentityBoundNativeCompletion({
      dispatch,
      transportDescriptor: descriptor,
      artifact: {
        schemaVersion: 1,
        artifactType: 'native',
        content: `identity-bound artifact for ${dispatch.bindingCandidateId}`,
      },
      usage: usage(),
      startedAt: '2026-08-31T18:00:01.000Z',
      completedAt: '2026-08-31T18:00:02.000Z',
    });
    if (!mutateCompletion) return value;
    const changed = structuredClone(value);
    mutateCompletion(changed);
    const { completionDigest: _ignored, ...unsigned } = changed;
    changed.completionDigest = sha256Value(unsigned);
    return changed;
  };
  return {
    descriptor,
    calls,
    completions,
    adapter: {
      descriptor: () => structuredClone(descriptor),
      async reconcile(dispatch) {
        calls.push({ type: 'reconcile', dispatch: structuredClone(dispatch) });
        const terminal = completions.get(dispatch.dispatchDigest);
        if (terminal) return { status: 'completed', completion: structuredClone(terminal) };
        if (reconciliation === 'pending') return { status: 'pending' };
        if (reconciliation !== 'absent') return { status: reconciliation };
        return { status: 'absent' };
      },
      async execute(dispatch) {
        calls.push({ type: 'execute', dispatch: structuredClone(dispatch) });
        if (completions.has(dispatch.dispatchDigest)) throw new Error('duplicate identity-bound dispatch');
        const terminal = complete(dispatch);
        completions.set(dispatch.dispatchDigest, terminal);
        return { status: 'completed', completion: structuredClone(terminal) };
      },
    },
  };
}

async function fixture(t, suffix = 'transport') {
  const admitted = await setupAdmittedIdentity(t, suffix);
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const request = cortexBindingRequest();
  const candidate = await compileCortexBindingCandidate({ admission: admitted.admission, request });
  return { admitted, request, candidate, admission: nativeAdmission(request) };
}

test('identity-bound inner descriptor is deterministic, closed, and authority-empty', () => {
  const first = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'identity-cortex-v1',
    maximumDispatchBytes: 4096,
    maximumCompletionBytes: 2048,
  });
  const second = buildIdentityBoundNativeTransportDescriptor({
    maximumCompletionBytes: 2048,
    maximumDispatchBytes: 4096,
    transportId: 'identity-cortex-v1',
  });
  assert.deepEqual(first, second);
  assert.deepEqual(verifyIdentityBoundNativeTransportDescriptor(first), first);
  assert.deepEqual(first.authority, emptyAuthority);
  assert.equal(first.terminalReconciliation, 'by-dispatch-digest');
  assert.equal(first.atomicDeduplication, true);
  assert.equal(Object.hasOwn(first, 'provider'), false);
  const changed = structuredClone(first);
  changed.model = 'forbidden';
  assert.throws(() => verifyIdentityBoundNativeTransportDescriptor(changed), /field|additionalProperties/i);
});

test('inner dispatch binds the exact admitted identity projection and native package', async (t) => {
  const state = await fixture(t);
  const inner = innerTransport();
  const outerDescriptor = buildMissionNativeTransportDescriptor({
    transportId: 'outer-fixture',
    maximumCompletionBytes: 65_536,
  });
  const outer = outerDispatch(state.admission, outerDescriptor);
  const vesselAdmissionDigest = 'c'.repeat(64);
  const dispatch = buildIdentityBoundNativeDispatch({
    candidate: state.candidate,
    vesselAdmissionDigest,
    outerDispatch: outer,
    transportDescriptor: inner.descriptor,
  });

  assert.deepEqual(verifyIdentityBoundNativeDispatch(dispatch, {
    candidate: state.candidate,
    vesselAdmissionDigest,
    outerDispatch: outer,
    transportDescriptor: inner.descriptor,
  }), dispatch);
  assert.deepEqual(dispatch.modelProjection, state.candidate.modelProjection);
  assert.deepEqual(dispatch.missionPackage, outer.package);
  assert.equal(dispatch.bindingCandidateId, state.candidate.bindingCandidateId);
  assert.equal(dispatch.candidateDigest, state.candidate.candidateDigest);
  assert.equal(dispatch.modelProjectionDigest, state.candidate.modelProjectionDigest);
  assert.deepEqual(dispatch.authority, emptyAuthority);
  assert.equal(canonicalJson(dispatch).includes(state.admitted.root), false);

  const changed = structuredClone(dispatch);
  changed.modelProjection.identity.name = 'Forged Identity';
  assert.throws(() => verifyIdentityBoundNativeDispatch(changed, {
    candidate: state.candidate,
    vesselAdmissionDigest,
    outerDispatch: outer,
    transportDescriptor: inner.descriptor,
  }), /projection|digest|identity/i);
});

test('identity-bound wrapper executes only after exact reconciliation and preserves inner evidence', async (t) => {
  const state = await fixture(t, 'execute');
  const inner = innerTransport();
  const wrapper = await createIdentityBoundMissionNativeTransport({
    candidate: state.candidate,
    vesselAdmissionDigest: 'c'.repeat(64),
    transport: inner.adapter,
  });
  const executor = await createMissionNativeExecutor({
    executorIdPrefix: 'identity-bound-vessel',
    maximumMaterializedBytes: 65_536,
    transport: wrapper,
  });
  const descriptor = executor.descriptor();
  const request = buildMissionPhaseRequest({
    admission: state.admission,
    descriptor,
    phase: 'native',
    round: 1,
    inputs: [],
    maxCompletionTokens: state.admission.budgets.nativeCompletionTokens,
  });
  const context = { admission: state.admission, mission: state.admission.mission, godskillsBinding: null };

  assert.deepEqual(await executor.reconcile(request, context), { status: 'absent' });
  const result = await executor.execute(request, context);
  const dispatch = inner.calls.find(({ type }) => type === 'execute').dispatch;
  const terminal = [...inner.completions.values()][0];

  assert.equal(result.artifact.artifactType, 'native');
  assert.equal(result.receipt.executorEvidenceDigest.length, 64);
  assert.equal(dispatch.candidateDigest, state.candidate.candidateDigest);
  assert.equal(dispatch.modelProjection.identity.name, 'Aether Architect');
  assert.equal(dispatch.missionPackage.mission.missionId, state.admission.mission.missionId);
  assert.deepEqual(verifyIdentityBoundNativeCompletion(terminal, {
    dispatch,
    transportDescriptor: inner.descriptor,
  }), terminal);
  assert.equal(inner.calls.filter(({ type }) => type === 'execute').length, 1);
});

test('process reconstruction recovers the same identity-bound dispatch without redispatch', async (t) => {
  const state = await fixture(t, 'recovery');
  const shared = innerTransport();
  const construct = async () => {
    const wrapper = await createIdentityBoundMissionNativeTransport({
      candidate: state.candidate,
      vesselAdmissionDigest: 'c'.repeat(64),
      transport: shared.adapter,
    });
    const executor = await createMissionNativeExecutor({
      executorIdPrefix: 'identity-bound-recovery',
      maximumMaterializedBytes: 65_536,
      transport: wrapper,
    });
    const descriptor = executor.descriptor();
    const request = buildMissionPhaseRequest({
      admission: state.admission,
      descriptor,
      phase: 'native',
      round: 1,
      inputs: [],
      maxCompletionTokens: state.admission.budgets.nativeCompletionTokens,
    });
    return {
      wrapper,
      executor,
      request,
      context: { admission: state.admission, mission: state.admission.mission, godskillsBinding: null },
    };
  };
  const first = await construct();
  await first.executor.reconcile(first.request, first.context);
  await first.executor.execute(first.request, first.context);
  const firstDispatch = shared.calls.find(({ type }) => type === 'execute').dispatch;

  const recovered = await construct();
  assert.deepEqual(recovered.executor.descriptor(), first.executor.descriptor());
  const result = await recovered.executor.reconcile(recovered.request, recovered.context);
  const recoveredDispatch = shared.calls.filter(({ type }) => type === 'reconcile').at(-1).dispatch;
  assert.equal(result.status, 'completed');
  assert.equal(recoveredDispatch.dispatchDigest, firstDispatch.dispatchDigest);
  assert.equal(shared.calls.filter(({ type }) => type === 'execute').length, 1);
});

test('pending, ambiguous, changed identity, and credential-shaped state fail before execution', async (t) => {
  const state = await fixture(t, 'negative');
  const pendingInner = innerTransport({ reconciliation: 'pending' });
  const pending = await createIdentityBoundMissionNativeTransport({
    candidate: state.candidate,
    vesselAdmissionDigest: 'c'.repeat(64),
    transport: pendingInner.adapter,
  });
  const outer = outerDispatch(state.admission, pending.descriptor());
  assert.deepEqual(await pending.reconcile(outer), { status: 'pending' });
  assert.equal(pendingInner.calls.some(({ type }) => type === 'execute'), false);
  const callsBeforeTransplant = pendingInner.calls.length;
  const foreignOuter = outerDispatch(state.admission, buildMissionNativeTransportDescriptor({
    transportId: 'foreign-outer-transport',
    maximumCompletionBytes: 65_536,
  }));
  await assert.rejects(() => pending.reconcile(foreignOuter), /different|descriptor|transport/i);
  assert.equal(pendingInner.calls.length, callsBeforeTransplant);

  const ambiguousInner = innerTransport({ reconciliation: 'unknown' });
  const ambiguous = await createIdentityBoundMissionNativeTransport({
    candidate: state.candidate,
    vesselAdmissionDigest: 'c'.repeat(64),
    transport: ambiguousInner.adapter,
  });
  await assert.rejects(() => ambiguous.reconcile(outerDispatch(state.admission, ambiguous.descriptor())), /reconciliation|status/i);
  assert.equal(ambiguousInner.calls.some(({ type }) => type === 'execute'), false);

  const changedBindingRequest = structuredClone(state.request);
  changedBindingRequest.mission.objective = 'detached mission';
  const changedOuter = outerDispatch(nativeAdmission(changedBindingRequest), pending.descriptor());
  await assert.rejects(() => pending.reconcile(changedOuter), /mission|identity|projection|binding/i);

  const credentialCandidate = structuredClone(state.candidate);
  credentialCandidate.modelProjection.apiKey = 'do-not-disclose';
  await assert.rejects(
    () => createIdentityBoundMissionNativeTransport({
      candidate: credentialCandidate,
      vesselAdmissionDigest: 'c'.repeat(64),
      transport: innerTransport().adapter,
    }),
    (error) => /credential|field|projection|candidate/i.test(error.message)
      && !error.message.includes('do-not-disclose'),
  );
});

test('completion substitution, usage, time, authority, and field attacks fail after outer rehash', async (t) => {
  const state = await fixture(t, 'completion-attacks');
  const inner = innerTransport();
  const outerDescriptor = buildMissionNativeTransportDescriptor({
    transportId: 'completion-attack-outer',
    maximumCompletionBytes: 65_536,
  });
  const outer = outerDispatch(state.admission, outerDescriptor);
  const dispatch = buildIdentityBoundNativeDispatch({
    candidate: state.candidate,
    vesselAdmissionDigest: 'c'.repeat(64),
    outerDispatch: outer,
    transportDescriptor: inner.descriptor,
  });
  const completion = buildIdentityBoundNativeCompletion({
    dispatch,
    transportDescriptor: inner.descriptor,
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'verified identity-bound result' },
    usage: usage(),
    startedAt: '2026-08-31T18:00:01.000Z',
    completedAt: '2026-08-31T18:00:02.000Z',
  });
  const attacks = [
    (value) => { value.candidateDigest = 'd'.repeat(64); },
    (value) => { value.modelProjectionDigest = 'e'.repeat(64); },
    (value) => { value.outerDispatchDigest = 'f'.repeat(64); },
    (value) => { value.usage.completionTokens = 401; value.usage.reasoningTokens = 371; },
    (value) => { value.authority.realmEffects = true; },
    (value) => { value.completedAt = '2026-08-31T18:00:00.000Z'; },
    (value) => { value.provider = 'forbidden'; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(completion);
    attack(changed);
    const { completionDigest: _ignored, ...unsigned } = changed;
    changed.completionDigest = sha256Value(unsigned);
    assert.throws(
      () => verifyIdentityBoundNativeCompletion(changed, {
        dispatch,
        transportDescriptor: inner.descriptor,
      }),
      /binding|artifact|usage|authority|time|precede|field|additionalProperties/i,
    );
  }
  const changedArtifact = structuredClone(completion);
  changedArtifact.artifact.content = 'substituted output';
  assert.throws(
    () => verifyIdentityBoundNativeCompletion(changedArtifact, {
      dispatch,
      transportDescriptor: inner.descriptor,
    }),
    /digest/i,
  );
});

test('identity-bound dispatch and completion byte ceilings fail before transport trust', async (t) => {
  const state = await fixture(t, 'byte-ceilings');
  const outerDescriptor = buildMissionNativeTransportDescriptor({
    transportId: 'byte-ceiling-outer',
    maximumCompletionBytes: 65_536,
  });
  const outer = outerDispatch(state.admission, outerDescriptor);
  const dispatchConstrained = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'dispatch-byte-ceiling-inner',
    maximumDispatchBytes: 1024,
    maximumCompletionBytes: 65_536,
  });
  assert.throws(() => buildIdentityBoundNativeDispatch({
    candidate: state.candidate,
    vesselAdmissionDigest: 'c'.repeat(64),
    outerDispatch: outer,
    transportDescriptor: dispatchConstrained,
  }), /dispatch.*byte|byte.*ceiling/i);

  const completionConstrained = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'completion-byte-ceiling-inner',
    maximumDispatchBytes: 262_144,
    maximumCompletionBytes: 256,
  });
  const dispatch = buildIdentityBoundNativeDispatch({
    candidate: state.candidate,
    vesselAdmissionDigest: 'c'.repeat(64),
    outerDispatch: outer,
    transportDescriptor: completionConstrained,
  });
  assert.throws(() => buildIdentityBoundNativeCompletion({
    dispatch,
    transportDescriptor: completionConstrained,
    artifact: { schemaVersion: 1, artifactType: 'native', content: 'bounded output' },
    usage: usage(),
    startedAt: '2026-08-31T18:00:01.000Z',
    completedAt: '2026-08-31T18:00:02.000Z',
  }), /completion.*byte|byte.*ceiling/i);
});

test('two admitted identities produce distinct native transport and dispatch identities for the same mission', async (t) => {
  const firstAdmitted = await setupAdmittedIdentity(t, 'identity-distinct-a');
  const secondAdmitted = await setupAdmittedIdentity(t, 'identity-distinct-b', { variant: true });
  t.after(() => rm(firstAdmitted.root, { recursive: true, force: true }));
  t.after(() => rm(secondAdmitted.root, { recursive: true, force: true }));
  const request = cortexBindingRequest({ missionId: 'mission-shared-identity-test' });
  const firstCandidate = await compileCortexBindingCandidate({ admission: firstAdmitted.admission, request });
  const secondCandidate = await compileCortexBindingCandidate({ admission: secondAdmitted.admission, request });
  const admission = nativeAdmission(request);
  const inner = innerTransport();
  const firstWrapper = await createIdentityBoundMissionNativeTransport({
    candidate: firstCandidate,
    vesselAdmissionDigest: 'c'.repeat(64),
    transport: inner.adapter,
  });
  const secondWrapper = await createIdentityBoundMissionNativeTransport({
    candidate: secondCandidate,
    vesselAdmissionDigest: 'd'.repeat(64),
    transport: inner.adapter,
  });
  const firstOuter = outerDispatch(admission, firstWrapper.descriptor());
  const secondOuter = outerDispatch(admission, secondWrapper.descriptor());
  const firstDispatch = buildIdentityBoundNativeDispatch({
    candidate: firstCandidate,
    vesselAdmissionDigest: 'c'.repeat(64),
    outerDispatch: firstOuter,
    transportDescriptor: inner.descriptor,
  });
  const secondDispatch = buildIdentityBoundNativeDispatch({
    candidate: secondCandidate,
    vesselAdmissionDigest: 'd'.repeat(64),
    outerDispatch: secondOuter,
    transportDescriptor: inner.descriptor,
  });

  assert.notEqual(firstCandidate.candidateDigest, secondCandidate.candidateDigest);
  assert.notDeepEqual(firstWrapper.descriptor(), secondWrapper.descriptor());
  assert.notEqual(firstDispatch.dispatchDigest, secondDispatch.dispatchDigest);
  assert.notEqual(firstDispatch.modelProjection.identity.name, secondDispatch.modelProjection.identity.name);
});
