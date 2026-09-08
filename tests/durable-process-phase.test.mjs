import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../src/core/digest.mjs';
import { buildIdentityBoundNativeTransportDescriptor, verifyIdentityBoundNativeCompletion } from '../src/runtime/identity-bound-native-contracts.mjs';
import { createDurablePhaseOperationSuite } from '../src/transports/durable-phase-operation.mjs';
import { providerNeutralPhaseInput, buildProviderNeutralPhaseCompletion } from '../src/transports/provider-neutral-phase-semantics.mjs';
import { buildProviderPhaseResponseWitness, verifyProviderPhaseResponseWitness, loadProviderPhaseResolutionPolicy } from '../src/transports/provider-phase-resolution.mjs';
import { nativeDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { validProviderPhaseResolutionPolicy, unsignedProviderResolutionDecision, signProviderResolutionDecision } from './helpers/provider-phase-resolution-fixture.mjs';

const child = promisify(execFile);
const KIND = 'subprocess-json-v1';
const at = '2026-08-31T20:01:00.000Z';
const response = (content = 'local process artifact') => ({
  kind: KIND, outcome: 'completed', exitCode: 0, bodyText: canonicalJson({ content }),
});

async function setup(t, { invoke, secret = 'fixture-secret-canary', overrides = {}, checkpoint } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'godagents-process-phase-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const descriptor = buildIdentityBoundNativeTransportDescriptor({
    transportId: 'local-process-native-v1', maximumDispatchBytes: 131072, maximumCompletionBytes: 65536,
  });
  const policy = { provider: { transportKind: KIND, maximumResponseBytes: 65536 } };
  const policyDigest = sha256Value(policy);
  // The engine must not coerce or serialize an opaque credential capability.
  const credential = { toString() { throw new Error('credential was coerced'); } };
  let calls = 0;
  const config = {
    policy, policyDigest, descriptors: { native: descriptor }, runtimeRoot: join(root, 'operations'),
    clock: () => at, ...(checkpoint ? { checkpoint } : {}),
    credentialResolver: { resolve: () => credential },
    compileRequest({ phase, dispatch, descriptor: desc }) {
      const body = canonicalJson(providerNeutralPhaseInput({ phase, dispatch, descriptor: desc }));
      return { body, bodyBytes: Buffer.byteLength(body), requestDigest: sha256Text(body) };
    },
    inspectResponse({ phase, dispatch, descriptor: desc, response: value, startedAt, completedAt }) {
      return {
        completion: buildProviderNeutralPhaseCompletion({ phase, dispatch, descriptor: desc,
          content: JSON.parse(value.bodyText), startedAt, completedAt,
          usage: { inputTokens: 20, cachedInputTokens: 0, reasoningTokens: 2, visibleOutputTokens: 8, completionTokens: 10 },
        }),
        providerUsage: { fixtureTokens: 30 },
      };
    },
    verifyProviderEvidence(value) { assert.deepEqual(value, { fixtureTokens: 30 }); },
    process: {
      assertCredentialAbsent({ text, credential: capability }) {
        assert.equal(capability, credential);
        return typeof text === 'string' && !text.includes(secret);
      },
      async invoke(args) {
        calls++;
        assert.equal(args.credential, credential);
        assert.equal(typeof args.request.body, 'string');
        if (invoke) return invoke(args);
        const result = await child(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({content:"local process artifact"}))'],
          { timeout: 5000, maxBuffer: 65536, windowsHide: true });
        return { kind: KIND, outcome: 'completed', exitCode: 0, bodyText: result.stdout };
      },
    },
    ...overrides,
  };
  const suite = await createDurablePhaseOperationSuite(config);
  return { root, suite, descriptor, policyDigest, calls: () => calls, config };
}

test('process completion witnesses preserve process identity without invented HTTP status', () => {
  const witness = buildProviderPhaseResponseWitness(response());
  assert.equal(witness.schemaVersion, 2);
  assert.equal(witness.protocolId, 'eternities-provider-process-response-witness-v1');
  assert.equal(witness.exitCode, 0);
  assert.equal(witness.outcome, 'completed');
  assert.equal(Object.hasOwn(witness, 'status'), false);
  assert.deepEqual(verifyProviderPhaseResponseWitness(witness), witness);
  assert.throws(() => verifyProviderPhaseResponseWitness({ ...witness, exitCode: 1 }));
  assert.throws(() => buildProviderPhaseResponseWitness({ ...response(), status: 200 }));
  assert.throws(() => buildProviderPhaseResponseWitness({ ...response(), outcome: 'unknown' }));
  for (const patch of [{ exitCode: -1 }, { exitCode: 2 ** 32 }, { exitCode: 1 }, { bodyText: {} }]) {
    assert.throws(() => buildProviderPhaseResponseWitness({ ...response(), ...patch }));
  }
});

test('real child result becomes an authenticated artifact and is replayed without a second child', async t => {
  const state = await setup(t);
  const dispatch = await nativeDispatch(t, state.descriptor);
  const first = await state.suite.native.execute(dispatch);
  verifyIdentityBoundNativeCompletion(first.completion, { dispatch, transportDescriptor: state.descriptor });
  assert.equal(first.completion.artifact.content, 'local process artifact');
  assert.deepEqual(await state.suite.native.reconcile(dispatch), first);
  assert.deepEqual(await state.suite.native.execute(dispatch), first);
  assert.equal(state.calls(), 1);
  const slot = join(state.root, 'operations', 'native', dispatch.dispatchDigest);
  assert.equal(JSON.parse(await readFile(join(slot, 'attempt.json'))).dispatchDigest, dispatch.dispatchDigest);
  assert.equal(JSON.parse(await readFile(join(slot, 'provider-evidence.json'))).completionDigest, first.completion.completionDigest);
});

test('uncertain subprocess interruption remains pending without redispatch after restart', async t => {
  const state = await setup(t, { invoke: async () => { throw new Error('process may have completed'); } });
  const dispatch = await nativeDispatch(t, state.descriptor);
  await assert.rejects(state.suite.native.execute(dispatch), { code: 'provider-ambiguous' });
  const restored = await createDurablePhaseOperationSuite(state.config);
  assert.deepEqual(await restored.native.reconcile(dispatch), { status: 'pending' });
  await assert.rejects(restored.native.execute(dispatch), { code: 'operation-pending' });
  assert.equal(state.calls(), 1);
});

test('process mode rejects mixed network configuration and missing policy binding before invoking', async t => {
  await assert.rejects(setup(t, { overrides: { network: async () => response(), networkRequest: () => ({}) } }), /configuration/);
  await assert.rejects(setup(t, { overrides: { policy: { provider: { maximumResponseBytes: 65536 } } } }), /configuration/);
  await assert.rejects(setup(t, { overrides: { policyDigest: '0'.repeat(64) } }), /configuration/);
});

test('opaque credential screening blocks input before invocation and reflected output before publication', async t => {
  const input = await setup(t, { secret: 'eternities-provider-neutral-phase-input-v1' });
  const inputDispatch = await nativeDispatch(t, input.descriptor);
  await assert.rejects(input.suite.native.execute(inputDispatch), { code: 'credential-in-input' });
  assert.equal(input.calls(), 0);
  const output = await setup(t, { invoke: async () => response('fixture-secret-canary') });
  const outputDispatch = await nativeDispatch(t, output.descriptor);
  await assert.rejects(output.suite.native.execute(outputDispatch), { code: 'credential-reflected' });
  await assert.rejects(output.suite.native.execute(outputDispatch), { code: 'credential-reflected' });
  assert.equal(output.calls(), 1);
  const record = JSON.parse(await readFile(join(output.root, 'operations', 'native', outputDispatch.dispatchDigest, 'failure.json')));
  assert.equal(record.httpStatus, null);
  assert.equal(JSON.stringify(record).includes('fixture-secret-canary'), false);
});

test('subprocess port does not accept a fabricated HTTP response', async t => {
  const state = await setup(t, { invoke: async () => ({ status: 200, bodyText: response().bodyText }) });
  const dispatch = await nativeDispatch(t, state.descriptor);
  await assert.rejects(state.suite.native.execute(dispatch), { code: 'response-invalid' });
  assert.equal(state.calls(), 1);
});

test('process result is snapshotted before checkpoints can mutate the returned object', async t => {
  const payload = response('original captured artifact');
  const state = await setup(t, { invoke: async () => payload,
    checkpoint: async name => { if (name === 'after-provider-phase-response-received') payload.bodyText = response('later mutation').bodyText; },
  });
  const dispatch = await nativeDispatch(t, state.descriptor);
  const result = await state.suite.native.execute(dispatch);
  assert.equal(result.completion.artifact.content, 'original captured artifact');
});

test('accessor-backed process results are rejected without executing their getters', async t => {
  let reads = 0;
  const payload = { ...response() };
  Object.defineProperty(payload, 'bodyText', { enumerable: true, get() { reads++; return response().bodyText; } });
  const state = await setup(t, { invoke: async () => payload });
  const dispatch = await nativeDispatch(t, state.descriptor);
  await assert.rejects(state.suite.native.execute(dispatch), { code: 'response-invalid' });
  assert.equal(reads, 0);
});

test('process response ceiling remains pinned when caller mutates its policy after construction', async t => {
  const policy = { provider: { transportKind: KIND, maximumResponseBytes: 100 } };
  const state = await setup(t, { invoke: async () => response('x'.repeat(512)),
    overrides: { policy, policyDigest: sha256Value(policy) },
  });
  policy.provider.maximumResponseBytes = 65536;
  const dispatch = await nativeDispatch(t, state.descriptor);
  await assert.rejects(state.suite.native.execute(dispatch), { code: 'response-over-budget' });
  const slot = join(state.root, 'operations', 'native', dispatch.dispatchDigest);
  await assert.rejects(readFile(join(slot, 'provider-evidence.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(slot, 'completion.json')), { code: 'ENOENT' });
  assert.equal(state.calls(), 1);
});

test('process screening requires synchronous true and never invokes after async or truthy denial', async t => {
  const state = await setup(t);
  for (const screen of [() => 'yes', async () => true, async () => { throw new Error('screening rejected'); }]) {
    const suite = await createDurablePhaseOperationSuite({ ...state.config,
      process: { ...state.config.process, assertCredentialAbsent: screen },
    });
    const dispatch = await nativeDispatch(t, state.descriptor);
    await assert.rejects(suite.native.execute(dispatch), { code: 'credential-in-input' });
  }
  assert.equal(state.calls(), 0);
});

test('definite subprocess rejection is terminal and cannot be represented as HTTP failure status', async t => {
  const state = await setup(t, { invoke: async () => ({ ...response(), outcome: 'rejected', exitCode: 5 }) });
  const dispatch = await nativeDispatch(t, state.descriptor);
  await assert.rejects(state.suite.native.execute(dispatch), { code: 'provider-rejected' });
  await assert.rejects(state.suite.native.execute(dispatch), { code: 'provider-rejected' });
  const record = JSON.parse(await readFile(join(state.root, 'operations', 'native', dispatch.dispatchDigest, 'failure.json')));
  assert.equal(record.httpStatus, null);
  assert.equal(state.calls(), 1);
});

test('signed exact process-response adoption resolves uncertainty without another invocation', async t => {
  const state = await setup(t, { invoke: async () => { throw new Error('unknown outcome'); } });
  const dispatch = await nativeDispatch(t, state.descriptor);
  await assert.rejects(state.suite.native.execute(dispatch), { code: 'provider-ambiguous' });
  const policy = validProviderPhaseResolutionPolicy({ transportPolicyDigest: state.policyDigest, maximumAdoptedResponseBytes: 65536 });
  const path = join(state.root, 'resolution-policy.json');
  await writeFile(path, `${canonicalJson(policy)}\n`);
  const digest = sha256Value(policy);
  const loaded = await loadProviderPhaseResolutionPolicy({ path,
    env: { GODAGENT_PROVIDER_PHASE_RESOLUTION_POLICY_SHA256: digest },
    transportPolicyDigest: state.policyDigest, maximumProviderResponseBytes: 65536,
  });
  const controller = state.suite.createOperatorResolutionController(loaded);
  const pending = await controller.inspect({ phase: 'native', dispatch });
  const exact = response('adopted process artifact');
  const signedDecision = signProviderResolutionDecision(unsignedProviderResolutionDecision({
    ...pending.operation, policyDigest: digest, disposition: 'adopt-response',
    responseWitnessDigest: buildProviderPhaseResponseWitness(exact).witnessDigest,
  }));
  const rejected = { ...exact, outcome: 'rejected', exitCode: 3 };
  const rejectDecision = signProviderResolutionDecision(unsignedProviderResolutionDecision({
    ...pending.operation, policyDigest: digest, disposition: 'adopt-response',
    responseWitnessDigest: buildProviderPhaseResponseWitness(rejected).witnessDigest,
  }));
  await assert.rejects(controller.resolve({ phase: 'native', dispatch, signedDecision: rejectDecision, response: rejected }));
  await assert.rejects(controller.resolve({ phase: 'native', dispatch, signedDecision, response: response('altered') }));
  await controller.resolve({ phase: 'native', dispatch, signedDecision, response: exact });
  const restored = await createDurablePhaseOperationSuite(state.config);
  const result = await restored.native.execute(dispatch);
  assert.equal(result.completion.artifact.content, 'adopted process artifact');
  assert.equal(state.calls(), 1);
});
