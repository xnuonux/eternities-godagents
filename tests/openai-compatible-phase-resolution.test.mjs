import assert from 'node:assert/strict';
import { readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import {
  buildOpenAICompatiblePhaseResponseWitness,
} from '../src/transports/openai-compatible-phase-resolution.mjs';
import {
  createResolutionController,
  recoveredNativeResponse,
  recoveredReviewResponse,
  recoveredRevisionResponse,
  reviewDispatch,
  revisionDispatch,
  setupPendingNativePhase,
} from './helpers/openai-compatible-phase-operation-fixture.mjs';
import {
  signResolutionDecision,
  unsignedResolutionDecision,
} from './helpers/openai-compatible-phase-resolution-fixture.mjs';

function decisionFor(operation, policyDigest, overrides = {}) {
  return signResolutionDecision(unsignedResolutionDecision({
    policyDigest,
    phase: operation.phase,
    dispatchDigest: operation.dispatchDigest,
    requestDigest: operation.requestDigest,
    attemptId: operation.attemptId,
    ...overrides,
  }));
}

function rehashResolutionRecord(value) {
  const decision = value.signedDecision.decision;
  const { decisionDigest: _decisionDigest, ...decisionUnsigned } = decision;
  decision.decisionDigest = sha256Value(decisionUnsigned);
  value.decisionDigest = decision.decisionDigest;
  const { recordDigest: _recordDigest, ...recordUnsigned } = value;
  value.recordDigest = sha256Value(recordUnsigned);
  return value;
}

async function makePending(fixture) {
  await assert.rejects(
    () => fixture.suite.native.execute(fixture.dispatch),
    (error) => error?.code === 'provider-ambiguous',
  );
  assert.equal(fixture.networkCalls, 1);
}

test('a signed abandonment closes one exact pending attempt without retry or model artifact', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  await makePending(fixture);
  const { controller, policyDigest } = await createResolutionController(fixture);
  const inspected = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  assert.equal(inspected.status, 'pending');
  const signedDecision = decisionFor(inspected.operation, policyDigest);
  const resolved = await controller.resolve({
    phase: 'native',
    dispatch: fixture.dispatch,
    signedDecision,
  });
  assert.equal(resolved.status, 'abandoned');
  assert.equal(resolved.decisionDigest, signedDecision.decision.decisionDigest);
  assert.equal(fixture.networkCalls, 1);
  await assert.rejects(
    () => fixture.suite.native.reconcile(fixture.dispatch),
    (error) => error?.code === 'operator-abandoned',
  );
  const repeated = await controller.resolve({
    phase: 'native',
    dispatch: fixture.dispatch,
    signedDecision,
  });
  assert.deepEqual(repeated, resolved);
  assert.equal(fixture.networkCalls, 1);

  const operationRoot = join(fixture.runtimeRoot, 'native', fixture.dispatch.dispatchDigest);
  assert.deepEqual((await readdir(operationRoot)).sort(), [
    'attempt.json', 'failure.json', 'prepared.json', 'resolution.json',
  ]);
  const failure = JSON.parse(await readFile(join(operationRoot, 'failure.json'), 'utf8'));
  assert.equal(failure.reasonCode, 'operator-abandoned');
});

test('a signed recovered response becomes the ordinary exact completion with zero additional network calls', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  await makePending(fixture);
  const { controller, policyDigest } = await createResolutionController(fixture);
  const inspected = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  const response = recoveredNativeResponse();
  const witness = buildOpenAICompatiblePhaseResponseWitness(response);
  const signedDecision = decisionFor(inspected.operation, policyDigest, {
    disposition: 'adopt-response',
    responseDigest: witness.witnessDigest,
  });
  const resolved = await controller.resolve({
    phase: 'native',
    dispatch: fixture.dispatch,
    signedDecision,
    response,
  });
  assert.equal(resolved.status, 'completed');
  assert.equal(resolved.decisionDigest, signedDecision.decision.decisionDigest);
  assert.equal(resolved.completion.artifact.content, 'one externally recovered exact native artifact');
  assert.equal(fixture.networkCalls, 1);
  const reconciled = await fixture.suite.native.reconcile(fixture.dispatch);
  assert.deepEqual(reconciled.completion, resolved.completion);
  const replay = await fixture.suite.native.execute(fixture.dispatch);
  assert.deepEqual(replay.completion, resolved.completion);
  assert.equal(fixture.networkCalls, 1);

  const operationRoot = join(fixture.runtimeRoot, 'native', fixture.dispatch.dispatchDigest);
  const resolutionText = await readFile(join(operationRoot, 'resolution.json'), 'utf8');
  assert.doesNotMatch(resolutionText, /externally recovered exact native artifact/);
  assert.doesNotMatch(resolutionText, /phase-resolution-credential-canary/);
  assert.equal(resolutionText, `${canonicalJson(JSON.parse(resolutionText))}\n`);
});

test('accepted abandonment recovers after interruption and decision expiry', async (t) => {
  let current = '2026-08-31T20:02:00.000Z';
  let interrupt = true;
  const fixture = await setupPendingNativePhase(t, {
    clock: () => current,
    checkpoint: async (name) => {
      if (interrupt && name === 'after-openai-phase-resolution-persisted') {
        throw new Error('fixture process death after resolution publication');
      }
    },
  });
  await makePending(fixture);
  const { controller, policyDigest } = await createResolutionController(fixture);
  const inspected = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  const signedDecision = decisionFor(inspected.operation, policyDigest);
  await assert.rejects(
    () => controller.resolve({ phase: 'native', dispatch: fixture.dispatch, signedDecision }),
    (error) => error?.code === 'operation-integrity',
  );
  assert.equal((await controller.inspect({ phase: 'native', dispatch: fixture.dispatch })).resolutionAccepted, true);

  interrupt = false;
  current = '2026-08-31T20:06:00.000Z';
  const recovered = await controller.resolve({ phase: 'native', dispatch: fixture.dispatch, signedDecision });
  assert.equal(recovered.status, 'abandoned');
  assert.equal(fixture.networkCalls, 1);
});

test('accepted response adoption recovers after interruption only from the exact resupplied bytes', async (t) => {
  let current = '2026-08-31T20:02:00.000Z';
  let interrupt = true;
  const fixture = await setupPendingNativePhase(t, {
    clock: () => current,
    checkpoint: async (name) => {
      if (interrupt && name === 'after-openai-phase-resolution-persisted') {
        throw new Error('fixture process death after adoption publication');
      }
    },
  });
  await makePending(fixture);
  const { controller, policyDigest } = await createResolutionController(fixture);
  const inspected = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  const response = recoveredNativeResponse();
  const witness = buildOpenAICompatiblePhaseResponseWitness(response);
  const signedDecision = decisionFor(inspected.operation, policyDigest, {
    disposition: 'adopt-response',
    responseDigest: witness.witnessDigest,
  });
  await assert.rejects(
    () => controller.resolve({ phase: 'native', dispatch: fixture.dispatch, signedDecision, response }),
    (error) => error?.code === 'operation-integrity',
  );
  interrupt = false;
  current = '2026-08-31T20:06:00.000Z';
  const changed = recoveredNativeResponse('changed response body');
  await assert.rejects(
    () => controller.resolve({ phase: 'native', dispatch: fixture.dispatch, signedDecision, response: changed }),
    /resolution decision|collision/i,
  );
  const recovered = await controller.resolve({
    phase: 'native', dispatch: fixture.dispatch, signedDecision, response,
  });
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.completion.artifact.content, 'one externally recovered exact native artifact');
  assert.equal(fixture.networkCalls, 1);
});

test('an unaccepted expired decision and an invalid adopted response mutate no resolution state', async (t) => {
  let current = '2026-08-31T20:06:00.000Z';
  const fixture = await setupPendingNativePhase(t, { clock: () => current });
  await makePending(fixture);
  const { controller, policyDigest } = await createResolutionController(fixture);
  const inspected = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  await assert.rejects(
    () => controller.resolve({
      phase: 'native',
      dispatch: fixture.dispatch,
      signedDecision: decisionFor(inspected.operation, policyDigest),
    }),
    /resolution decision/i,
  );
  const operationRoot = join(fixture.runtimeRoot, 'native', fixture.dispatch.dispatchDigest);
  assert.equal((await readdir(operationRoot)).includes('resolution.json'), false);

  current = '2026-08-31T20:02:00.000Z';
  const invalidResponse = { status: 200, headers: { 'content-type': 'application/json' }, bodyText: '{}' };
  const witness = buildOpenAICompatiblePhaseResponseWitness(invalidResponse);
  const signedDecision = decisionFor(inspected.operation, policyDigest, {
    disposition: 'adopt-response', responseDigest: witness.witnessDigest,
  });
  await assert.rejects(
    () => controller.resolve({
      phase: 'native', dispatch: fixture.dispatch, signedDecision, response: invalidResponse,
    }),
    /response is invalid/i,
  );
  assert.equal((await readdir(operationRoot)).includes('resolution.json'), false);
});

test('tampered accepted resolution state fails signature verification before terminal publication', async (t) => {
  let interrupt = true;
  const fixture = await setupPendingNativePhase(t, {
    checkpoint: async (name) => {
      if (interrupt && name === 'after-openai-phase-resolution-persisted') throw new Error('fixture interruption');
    },
  });
  await makePending(fixture);
  const { controller, policyDigest } = await createResolutionController(fixture);
  const inspected = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  const signedDecision = decisionFor(inspected.operation, policyDigest);
  await assert.rejects(
    () => controller.resolve({ phase: 'native', dispatch: fixture.dispatch, signedDecision }),
    (error) => error?.code === 'operation-integrity',
  );
  interrupt = false;
  const path = join(fixture.runtimeRoot, 'native', fixture.dispatch.dispatchDigest, 'resolution.json');
  const original = JSON.parse(await readFile(path, 'utf8'));
  const wrongSizedSignature = structuredClone(original);
  wrongSizedSignature.signedDecision.signature = Buffer.alloc(63).toString('base64');
  rehashResolutionRecord(wrongSizedSignature);
  await writeFile(path, `${canonicalJson(wrongSizedSignature)}\n`, 'utf8');
  await assert.rejects(
    () => fixture.suite.native.reconcile(fixture.dispatch),
    /integrity/i,
  );

  const wrongProtocol = structuredClone(original);
  wrongProtocol.signedDecision.decision.protocolId = 'eternities-openai-compatible-phase-resolution-decision-v2';
  rehashResolutionRecord(wrongProtocol);
  await writeFile(path, `${canonicalJson(wrongProtocol)}\n`, 'utf8');
  await assert.rejects(
    () => fixture.suite.native.reconcile(fixture.dispatch),
    /integrity/i,
  );
  await assert.rejects(
    () => controller.inspect({ phase: 'native', dispatch: fixture.dispatch }),
    /resolution decision|integrity/i,
  );
  assert.equal((await readdir(join(fixture.runtimeRoot, 'native', fixture.dispatch.dispatchDigest))).includes('failure.json'), false);
});

test('response adoption obeys the narrower resolution ceiling before durable mutation', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  await makePending(fixture);
  const { controller, policyDigest } = await createResolutionController(fixture, {
    policyOverrides: { maximumAdoptedResponseBytes: 256 },
  });
  const inspected = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  const response = recoveredNativeResponse('x'.repeat(512));
  const witness = buildOpenAICompatiblePhaseResponseWitness(response);
  const signedDecision = decisionFor(inspected.operation, policyDigest, {
    disposition: 'adopt-response', responseDigest: witness.witnessDigest,
  });
  await assert.rejects(
    () => controller.resolve({ phase: 'native', dispatch: fixture.dispatch, signedDecision, response }),
    /resolution decision/i,
  );
  const entries = await readdir(join(fixture.runtimeRoot, 'native', fixture.dispatch.dispatchDigest));
  assert.equal(entries.includes('resolution.json'), false);
  assert.equal(fixture.networkCalls, 1);
});

test('review and revision adoption preserve their exact existing phase contracts', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  const { controller, policyDigest } = await createResolutionController(fixture);
  const cases = [
    ['review', await reviewDispatch(fixture.suite.descriptors.review), recoveredReviewResponse(), 'review'],
    ['revision', revisionDispatch(fixture.suite.descriptors.revision), recoveredRevisionResponse(), 'revision'],
  ];
  for (const [phase, dispatch, response, artifactType] of cases) {
    await assert.rejects(
      () => fixture.suite[phase].execute(dispatch),
      (error) => error?.code === 'provider-ambiguous',
    );
    const inspected = await controller.inspect({ phase, dispatch });
    const witness = buildOpenAICompatiblePhaseResponseWitness(response);
    const signedDecision = decisionFor(inspected.operation, policyDigest, {
      disposition: 'adopt-response',
      responseDigest: witness.witnessDigest,
      nonce: `fixture-resolution-${phase}`,
    });
    const resolved = await controller.resolve({ phase, dispatch, signedDecision, response });
    assert.equal(resolved.status, 'completed');
    assert.equal(resolved.completion.artifact.artifactType, artifactType);
    assert.deepEqual(
      (await fixture.suite[phase].reconcile(dispatch)).completion,
      resolved.completion,
    );
  }
  assert.equal(fixture.networkCalls, 2);
});

test('changed concurrent resolutions cannot create two operator outcomes', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  await makePending(fixture);
  const { controller, policyDigest } = await createResolutionController(fixture);
  const inspected = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  const first = decisionFor(inspected.operation, policyDigest, { nonce: 'concurrent-resolution-first' });
  const second = decisionFor(inspected.operation, policyDigest, { nonce: 'concurrent-resolution-second' });
  const outcomes = await Promise.allSettled([
    controller.resolve({ phase: 'native', dispatch: fixture.dispatch, signedDecision: first }),
    controller.resolve({ phase: 'native', dispatch: fixture.dispatch, signedDecision: second }),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
  const terminal = await controller.inspect({ phase: 'native', dispatch: fixture.dispatch });
  assert.equal(terminal.status, 'abandoned');
  const winningDigest = outcomes.find(({ status }) => status === 'fulfilled').value.decisionDigest;
  assert.equal(terminal.decisionDigest, winningDigest);
  assert.equal(fixture.networkCalls, 1);
});

test('unknown and symlinked resolution entries fail through the stable integrity boundary', async (t) => {
  const unknown = await setupPendingNativePhase(t);
  await makePending(unknown);
  const unknownController = await createResolutionController(unknown);
  const unknownRoot = join(unknown.runtimeRoot, 'native', unknown.dispatch.dispatchDigest);
  await writeFile(join(unknownRoot, 'foreign.json'), '{}\n', 'utf8');
  await assert.rejects(
    () => unknownController.controller.inspect({ phase: 'native', dispatch: unknown.dispatch }),
    (error) => error?.code === 'operation-integrity',
  );

  const linked = await setupPendingNativePhase(t);
  await makePending(linked);
  const linkedController = await createResolutionController(linked);
  const operationRoot = join(linked.runtimeRoot, 'native', linked.dispatch.dispatchDigest);
  const external = join(linked.root, 'junctioned-operation');
  await rename(operationRoot, external);
  await symlink(external, operationRoot, 'junction');
  await assert.rejects(
    () => linkedController.controller.inspect({ phase: 'native', dispatch: linked.dispatch }),
    (error) => error?.code === 'operation-integrity',
  );
});

test('operator authority stays outside each ordinary phase adapter surface', async (t) => {
  const fixture = await setupPendingNativePhase(t);
  for (const phase of ['native', 'review', 'revision']) {
    assert.deepEqual(Object.keys(fixture.suite[phase]).sort(), ['descriptor', 'execute', 'reconcile']);
    assert.equal(fixture.suite[phase].resolve, undefined);
  }
  assert.equal(typeof fixture.suite.createOperatorResolutionController, 'function');
  assert.doesNotMatch(JSON.stringify(fixture.suite), /phase-resolution-credential-canary/);
});
