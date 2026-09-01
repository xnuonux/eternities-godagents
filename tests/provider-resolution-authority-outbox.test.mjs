import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { createProviderResolutionAuthorityOutbox } from '../src/host/provider-resolution-authority-outbox.mjs';
import { createProviderPhaseHost } from '../src/host/provider-phase-host-sdk.mjs';
import { validAnthropicMessagesPhasePolicy } from './helpers/anthropic-messages-phase-policy-fixture.mjs';
import { nativeDispatch } from './helpers/openai-compatible-phase-operation-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './helpers/openai-compatible-phase-policy-fixture.mjs';
import {
  signResolutionDecision,
  validOpenAICompatiblePhaseResolutionPolicy,
} from './helpers/openai-compatible-phase-resolution-fixture.mjs';
import {
  signProviderResolutionDecision,
  validProviderPhaseResolutionPolicy,
} from './helpers/provider-phase-resolution-fixture.mjs';

const DEFINITIONS = Object.freeze({
  'openai-compatible-chat-completions-v1': Object.freeze({
    transportPolicy: validOpenAICompatiblePhasePolicy,
    transportPin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validOpenAICompatiblePhaseResolutionPolicy,
    sign: signResolutionDecision,
    envelope(model) {
      return {
        id: 'chatcmpl_authority_outbox', object: 'chat.completion', model,
        choices: [{
          index: 0, finish_reason: 'stop',
          message: { role: 'assistant', content: canonicalJson({ content: 'recovered artifact' }) },
        }],
        usage: {
          prompt_tokens: 20, prompt_tokens_details: { cached_tokens: 5 },
          completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 0 }, total_tokens: 24,
        },
      };
    },
  }),
  'anthropic-messages-v1': Object.freeze({
    transportPolicy: validAnthropicMessagesPhasePolicy,
    transportPin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    resolutionPolicy: validProviderPhaseResolutionPolicy,
    sign: signProviderResolutionDecision,
    envelope(model) {
      return {
        id: 'msg_authority_outbox', type: 'message', role: 'assistant', model,
        content: [{ type: 'text', text: canonicalJson({ content: 'recovered artifact' }) }],
        stop_reason: 'end_turn', stop_sequence: null,
        usage: {
          input_tokens: 20, cache_creation_input_tokens: 4, cache_read_input_tokens: 5,
          output_tokens: 4, output_tokens_details: { thinking_tokens: 0 },
        },
      };
    },
  }),
});

async function setupPending(
  t,
  checkpoint = async () => {},
  family = 'openai-compatible-chat-completions-v1',
) {
  const definition = DEFINITIONS[family];
  const root = await mkdtemp(join(tmpdir(), 'godagents-authority-outbox-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policy = definition.transportPolicy();
  const policyPath = join(root, 'transport-policy.json');
  const policyDigest = sha256Text(canonicalJson(policy));
  await writeFile(policyPath, `${canonicalJson(policy)}\n`, 'utf8');
  let providerCalls = 0;
  const host = await createProviderPhaseHost({
    family,
    policyPath,
    env: {
      [definition.transportPin]: policyDigest,
      [policy.provider.credentialEnv]: 'authority-outbox-secret-canary',
    },
    runtimeRoot: join(root, 'provider-operations'),
    clock: () => '2026-09-01T04:00:30.000Z',
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error('fixture ambiguous provider outcome');
    },
  });
  const resolutionPolicy = definition.resolutionPolicy({
    transportPolicyDigest: policyDigest,
  });
  const resolutionPath = join(root, 'resolution-policy.json');
  const resolutionDigest = sha256Text(canonicalJson(resolutionPolicy));
  await writeFile(resolutionPath, `${canonicalJson(resolutionPolicy)}\n`, 'utf8');
  const resolutionPin = host.describe().capabilities.resolutionProfile.externalPolicyPinVariable;
  const controller = await host.createOperatorResolutionController({
    policyPath: resolutionPath,
    env: { [resolutionPin]: resolutionDigest },
  });
  const dispatch = await nativeDispatch(t, host.describe().descriptors.native);
  await assert.rejects(host.native.execute(dispatch), (error) => error?.code === 'provider-ambiguous');
  const outboxRoot = join(root, 'authority-outbox');
  const outboxOptions = {
    root: outboxRoot,
    host,
    controller,
    checkpoint,
    lockOptions: {
      pid: 65001,
      now: () => Date.parse('2026-09-01T04:01:00.000Z'),
      staleAfterMs: 1,
      isProcessAlive: () => false,
      nonce: () => 'authority-outbox-lock',
    },
  };
  const outbox = await createProviderResolutionAuthorityOutbox(outboxOptions);
  return {
    root, outboxRoot, host, controller, dispatch, outbox, outboxOptions, policy, definition,
    get providerCalls() { return providerCalls; },
  };
}

function recoveredResponse(state, marker = 'authority-outbox-private-response-marker') {
  const body = state.definition.envelope(state.policy.provider.modelId);
  body.marker = marker;
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify(body),
  };
}

async function operationRoot(state) {
  const [operationId] = await readdir(join(state.outboxRoot, 'operations'));
  return join(state.outboxRoot, 'operations', operationId);
}

test('authority outbox requires a closed durable root and certified host surfaces', async () => {
  await assert.rejects(
    createProviderResolutionAuthorityOutbox(),
    /authority outbox|root|host|controller/i,
  );
  await assert.rejects(
    createProviderResolutionAuthorityOutbox({
      root: 'C:\\fixture-authority-outbox',
      host: {},
      controller: {},
      signer: () => 'forbidden',
    }),
    /field|sign|authority outbox/i,
  );
});

test('one ambiguous operation publishes awaits signs abandons and replays without provider work', async (t) => {
  const state = await setupPending(t);
  const request = await state.outbox.prepare({
    phase: 'native',
    dispatch: state.dispatch,
    disposition: 'abandon',
    issuedAt: '2026-09-01T04:00:00.000Z',
    expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-abandon-001',
  });
  assert.equal(request.status, 'awaiting-signature');
  assert.deepEqual(await state.outbox.reconcile({ phase: 'native', dispatch: state.dispatch }), {
    status: 'awaiting-signature', requestDigest: request.requestDigest,
  });
  const signature = signResolutionDecision(request.decision).signature;
  const terminal = await state.outbox.submit({
    phase: 'native', dispatch: state.dispatch, requestDigest: request.requestDigest, signature,
  });
  assert.equal(terminal.status, 'resolved');
  assert.equal(terminal.outcomeStatus, 'abandoned');
  assert.deepEqual(
    await state.outbox.reconcile({ phase: 'native', dispatch: state.dispatch }),
    terminal,
  );
  assert.equal(state.providerCalls, 1);
  const operationRoots = await readdir(join(state.outboxRoot, 'operations'));
  assert.equal(operationRoots.length, 1);
  const files = (await readdir(join(state.outboxRoot, 'operations', operationRoots[0]))).sort();
  assert.deepEqual(files, ['request.json', 'signed-return.json', 'terminal.json']);
  const durableText = (await Promise.all(files.map((file) => readFile(
    join(state.outboxRoot, 'operations', operationRoots[0], file), 'utf8',
  )))).join('\n');
  assert.equal(durableText.includes('authority-outbox-secret-canary'), false);
});

test('adoption keeps raw response bytes in memory and publishes one replayable terminal', async (t) => {
  const state = await setupPending(t);
  const marker = 'authority-outbox-raw-response-must-not-persist';
  const response = recoveredResponse(state, marker);
  const request = await state.outbox.prepare({
    phase: 'native',
    dispatch: state.dispatch,
    disposition: 'adopt-response',
    response,
    issuedAt: '2026-09-01T04:00:00.000Z',
    expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-adopt-001',
  });
  const terminal = await state.outbox.submit({
    phase: 'native',
    dispatch: state.dispatch,
    requestDigest: request.requestDigest,
    signature: signResolutionDecision(request.decision).signature,
    response,
  });
  assert.equal(terminal.status, 'resolved');
  assert.equal(terminal.outcomeStatus, 'completed');
  assert.equal(state.providerCalls, 1);
  const durableRoot = await operationRoot(state);
  const files = (await readdir(durableRoot)).sort();
  assert.deepEqual(files, ['request.json', 'signed-return.json', 'terminal.json']);
  const durableText = (await Promise.all(files.map((file) => readFile(
    join(durableRoot, file), 'utf8',
  )))).join('\n');
  assert.equal(durableText.includes(marker), false);
  assert.equal(durableText.includes('authority-outbox-secret-canary'), false);
  assert.equal(canonicalJson(terminal).includes('recovered artifact'), false);
});

test('reconstruction after controller acceptance publishes terminal without response or provider work', async (t) => {
  let interrupt = true;
  const state = await setupPending(t, async (name) => {
    if (name === 'after-authority-outbox-controller-accepted' && interrupt) {
      interrupt = false;
      throw new Error('fixture interruption after controller acceptance');
    }
  });
  const response = recoveredResponse(state);
  const request = await state.outbox.prepare({
    phase: 'native', dispatch: state.dispatch, disposition: 'adopt-response', response,
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-adopt-recovery-001',
  });
  await assert.rejects(state.outbox.submit({
    phase: 'native', dispatch: state.dispatch, requestDigest: request.requestDigest,
    signature: signResolutionDecision(request.decision).signature, response,
  }), /fixture interruption/);
  assert.equal((await readdir(await operationRoot(state))).includes('terminal.json'), false);
  const reconstructed = await createProviderResolutionAuthorityOutbox({
    ...state.outboxOptions,
    checkpoint: async () => {},
  });
  const terminal = await reconstructed.reconcile({ phase: 'native', dispatch: state.dispatch });
  assert.equal(terminal.outcomeStatus, 'completed');
  assert.equal(state.providerCalls, 1);
});

test('recovery calls reject unknown authority-expanding fields before mutation', async (t) => {
  const state = await setupPending(t);
  await assert.rejects(
    state.outbox.reconcile({ phase: 'native', dispatch: state.dispatch, signer: () => 'forbidden' }),
    /field/i,
  );
  await assert.rejects(
    state.outbox.submit({ phase: 'native', dispatch: state.dispatch, privateKey: 'forbidden' }),
    /field/i,
  );
  assert.equal(await readdir(state.outboxRoot).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error)).then((x) => x).then((x) => x.length), 0);
});

test('unknown operation entries fail closed before controller mutation', async (t) => {
  const state = await setupPending(t);
  const request = await state.outbox.prepare({
    phase: 'native', dispatch: state.dispatch, disposition: 'abandon',
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-unknown-entry-001',
  });
  await writeFile(join(await operationRoot(state), 'intruder.json'), '{}\n', 'utf8');
  await assert.rejects(state.outbox.submit({
    phase: 'native', dispatch: state.dispatch, requestDigest: request.requestDigest,
    signature: signResolutionDecision(request.decision).signature,
  }), (error) => error?.code === 'state-invalid');
  assert.equal((await state.controller.inspect({ phase: 'native', dispatch: state.dispatch })).status, 'pending');
  assert.equal(state.providerCalls, 1);
});

test('request publication interruption reconstructs the exact immutable request', async (t) => {
  let interrupt = true;
  const state = await setupPending(t, async (name) => {
    if (name === 'after-authority-outbox-request-published' && interrupt) {
      interrupt = false;
      throw new Error('fixture request publication interruption');
    }
  });
  const input = {
    phase: 'native', dispatch: state.dispatch, disposition: 'abandon',
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-request-recovery-001',
  };
  await assert.rejects(state.outbox.prepare(input), /request publication interruption/);
  const storedText = await readFile(join(await operationRoot(state), 'request.json'), 'utf8');
  const reconstructed = await createProviderResolutionAuthorityOutbox({
    ...state.outboxOptions, checkpoint: async () => {},
  });
  const request = await reconstructed.prepare(input);
  assert.equal(storedText, `${canonicalJson(request)}\n`);
  assert.equal(state.providerCalls, 1);
});

test('signed return interruption collides on a changed signature and accepts exact replay', async (t) => {
  let interrupt = true;
  const state = await setupPending(t, async (name) => {
    if (name === 'after-authority-outbox-signed-return-published' && interrupt) {
      interrupt = false;
      throw new Error('fixture signed return interruption');
    }
  });
  const request = await state.outbox.prepare({
    phase: 'native', dispatch: state.dispatch, disposition: 'abandon',
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-signed-recovery-001',
  });
  const signature = signResolutionDecision(request.decision).signature;
  const input = {
    phase: 'native', dispatch: state.dispatch, requestDigest: request.requestDigest, signature,
  };
  await assert.rejects(state.outbox.submit(input), /signed return interruption/);
  await assert.rejects(state.outbox.submit({
    ...input, signature: Buffer.alloc(64, 7).toString('base64'),
  }), (error) => error?.code === 'record-collision');
  const terminal = await state.outbox.submit(input);
  assert.equal(terminal.outcomeStatus, 'abandoned');
  assert.equal(state.providerCalls, 1);
});

test('terminal publication interruption returns the same terminal on exact replay', async (t) => {
  let interrupt = true;
  const state = await setupPending(t, async (name) => {
    if (name === 'after-authority-outbox-terminal-published' && interrupt) {
      interrupt = false;
      throw new Error('fixture terminal publication interruption');
    }
  });
  const request = await state.outbox.prepare({
    phase: 'native', dispatch: state.dispatch, disposition: 'abandon',
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-terminal-recovery-001',
  });
  const input = {
    phase: 'native', dispatch: state.dispatch, requestDigest: request.requestDigest,
    signature: signResolutionDecision(request.decision).signature,
  };
  await assert.rejects(state.outbox.submit(input), /terminal publication interruption/);
  const stored = JSON.parse(await readFile(join(await operationRoot(state), 'terminal.json'), 'utf8'));
  assert.deepEqual(await state.outbox.submit(input), stored);
  assert.equal(state.providerCalls, 1);
});

test('a coherently rehashed request with a changed operation binding fails closed', async (t) => {
  const state = await setupPending(t);
  await state.outbox.prepare({
    phase: 'native', dispatch: state.dispatch, disposition: 'abandon',
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-tamper-001',
  });
  const path = join(await operationRoot(state), 'request.json');
  const forged = JSON.parse(await readFile(path, 'utf8'));
  forged.operation.attemptId = 'f'.repeat(64);
  const { requestDigest: _old, ...unsigned } = forged;
  forged.requestDigest = sha256Text(canonicalJson(unsigned));
  await writeFile(path, `${canonicalJson(forged)}\n`, 'utf8');
  await assert.rejects(
    state.outbox.reconcile({ phase: 'native', dispatch: state.dispatch }),
    (error) => error?.code === 'record-invalid',
  );
  assert.equal((await state.controller.inspect({ phase: 'native', dispatch: state.dispatch })).status, 'pending');
  assert.equal(state.providerCalls, 1);
});

test('the same authority outbox lifecycle resolves both certified provider families', async (t) => {
  for (const family of Object.keys(DEFINITIONS)) {
    const state = await setupPending(t, async () => {}, family);
    const response = recoveredResponse(state, `private-${family}-response-marker`);
    const request = await state.outbox.prepare({
      phase: 'native', dispatch: state.dispatch, disposition: 'adopt-response', response,
      issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
      nonce: `authority-outbox-${family}`,
    });
    const terminal = await state.outbox.submit({
      phase: 'native', dispatch: state.dispatch, requestDigest: request.requestDigest,
      signature: state.definition.sign(request.decision).signature, response,
    });
    assert.equal(terminal.outcomeStatus, 'completed');
    assert.equal(state.providerCalls, 1);
    const durableRoot = await operationRoot(state);
    const durable = (await Promise.all((await readdir(durableRoot)).map(
      (file) => readFile(join(durableRoot, file), 'utf8'),
    ))).join('\n');
    assert.equal(durable.includes(`private-${family}-response-marker`), false);
  }
});

test('concurrent exact submissions serialize without duplicate controller or provider work', async (t) => {
  let entered;
  const atCheckpoint = new Promise((resolve) => { entered = resolve; });
  let release;
  const continueFirst = new Promise((resolve) => { release = resolve; });
  const state = await setupPending(t, async (name) => {
    if (name === 'after-authority-outbox-signed-return-published') {
      entered();
      await continueFirst;
    }
  });
  const request = await state.outbox.prepare({
    phase: 'native', dispatch: state.dispatch, disposition: 'abandon',
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-concurrent-001',
  });
  const input = {
    phase: 'native', dispatch: state.dispatch, requestDigest: request.requestDigest,
    signature: signResolutionDecision(request.decision).signature,
  };
  const first = state.outbox.submit(input);
  await atCheckpoint;
  await assert.rejects(state.outbox.submit(input), /locked|lock/i);
  release();
  const terminal = await first;
  assert.deepEqual(await state.outbox.reconcile({ phase: 'native', dispatch: state.dispatch }), terminal);
  assert.equal(state.providerCalls, 1);
});

test('changed adopted response is rejected after signed-return publication', async (t) => {
  let interrupt = true;
  const state = await setupPending(t, async (name) => {
    if (name === 'after-authority-outbox-signed-return-published' && interrupt) {
      interrupt = false;
      throw new Error('fixture adoption signed return interruption');
    }
  });
  const response = recoveredResponse(state, 'authority-outbox-original-response');
  const request = await state.outbox.prepare({
    phase: 'native', dispatch: state.dispatch, disposition: 'adopt-response', response,
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-response-collision-001',
  });
  const input = {
    phase: 'native', dispatch: state.dispatch, requestDigest: request.requestDigest,
    signature: signResolutionDecision(request.decision).signature,
  };
  await assert.rejects(state.outbox.submit({ ...input, response }), /fixture adoption/);
  await assert.rejects(
    state.outbox.submit({ ...input, response: recoveredResponse(state, 'changed-response') }),
    (error) => error?.code === 'decision-invalid',
  );
  assert.equal((await state.controller.inspect({ phase: 'native', dispatch: state.dispatch })).status, 'pending');
  assert.equal(state.providerCalls, 1);
});

test('known abandoned publication files are inert while reparse operation roots fail closed', async (t) => {
  const state = await setupPending(t);
  await state.outbox.prepare({
    phase: 'native', dispatch: state.dispatch, disposition: 'abandon',
    issuedAt: '2026-09-01T04:00:00.000Z', expiresAt: '2026-09-01T04:05:00.000Z',
    nonce: 'authority-outbox-reparse-001',
  });
  const operation = await operationRoot(state);
  await writeFile(join(operation, 'terminal.json.writing'), 'inert partial bytes', 'utf8');
  assert.equal((await state.outbox.reconcile({ phase: 'native', dispatch: state.dispatch })).status, 'awaiting-signature');
  const held = join(state.root, 'held-authority-operation');
  await rename(operation, held);
  await symlink(held, operation, 'junction');
  await assert.rejects(
    state.outbox.reconcile({ phase: 'native', dispatch: state.dispatch }),
    (error) => error?.code === 'state-invalid',
  );
  assert.equal((await state.controller.inspect({ phase: 'native', dispatch: state.dispatch })).status, 'pending');
});
