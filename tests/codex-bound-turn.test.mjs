import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildCodexTaskCancellationReceipt,
  buildCodexTaskReservationReceipt,
  buildCodexTaskTransportReceipt,
  createCodexBoundTurnHost,
  verifyCodexBoundTurnReceipt,
} from '../src/host/codex-bound-turn.mjs';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { admitLocalCreation } from '../src/genesis/local-admission.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';

const creationFixture = new URL('../fixtures/creation/', import.meta.url);
const realmFixture = new URL('../fixtures/realm-contract.json', import.meta.url);
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';

function turnRequest({
  operationId = 'operation-codex-bound-turn-001',
  turnId = 'turn-codex-bound-001',
  objective = 'produce one evidence-bound proposal',
  maxProjectionBytes = 65_536,
} = {}) {
  return {
    schemaVersion: 1,
    operationId,
    turnId,
    hostAdapterId: 'codex-desktop-v1',
    revocationEpoch: 0,
    mission: {
      missionId: `mission-${turnId}`,
      objective,
      successEvidence: ['exact envelope receipt', 'bounded response'],
      stopConditions: ['source binding changes', 'transport receipt mismatch'],
      budget: { maxCycles: 1, maxCompletionTokens: 2048 },
      observation: {
        observationId: `observation-${turnId}`,
        summary: 'the host is ready to dispatch one sealed turn',
        evidenceDigests: ['a'.repeat(64)],
      },
    },
    maxProjectionBytes,
    maxResponseBytes: 16_384,
  };
}

async function setupAdmission(context, suffix) {
  const root = await mkdtemp(join(tmpdir(), `godagent-codex-turn-${suffix}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'creation-source');
  await cp(creationFixture, sourceRoot, { recursive: true });
  const sourceCreationDir = join(root, 'compiled-creation');
  const creation = await compileCreation({
    candidatePath: join(sourceRoot, 'creation-candidate.json'),
    policyPath: join(sourceRoot, 'creation-policy.json'),
    expectedPolicyDigest,
    expressionPath: join(sourceRoot, 'expression-overlay.json'),
    moduleDirectory: join(sourceRoot, 'modules'),
    outputDir: sourceCreationDir,
  });
  const promptArtifactPath = join(root, 'prompt-os.md');
  await writeFile(
    promptArtifactPath,
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: codex-bound-turn.test.json -->\n# Codex bound turn test\n',
    'utf8',
  );
  const realm = JSON.parse(await readFile(realmFixture, 'utf8'));
  realm.capabilities = ['filesystem.read', 'filesystem.write'];
  realm.compatibleDistributions = ['0.2.x'];
  const realmContractPath = join(root, 'realm-contract.json');
  await writeFile(realmContractPath, `${canonicalJson(realm)}\n`, 'utf8');
  const workspace = join(root, 'workspace');
  const instanceId = `codex-bound-turn-${suffix}`;
  const creatorRef = 'creator:dom';
  await admitLocalCreation({
    creationDir: sourceCreationDir,
    expectedPolicyDigest,
    expectedCreationBuildId: creation.manifest.buildId,
    promptArtifactPath,
    realmContractPath,
    workspace,
    instanceId,
    creatorRef,
    checkpointPurpose: 'test one sealed task-scoped bound turn',
    clock: () => '2026-08-31T18:00:00.000Z',
  });
  const admissionRoot = join(workspace, 'admission');
  return {
    root,
    admissionRoot,
    admission: {
      receiptPath: join(admissionRoot, 'transaction', 'genesis-receipt.json'),
      creationDir: join(admissionRoot, 'creation'),
      distributionDir: join(admissionRoot, 'distribution'),
      expectedPolicyDigest,
      expectedCreationBuildId: creation.manifest.buildId,
      instanceId,
      creatorRef,
      transactionDir: join(admissionRoot, 'transaction'),
      journalPath: join(admissionRoot, 'vessel', 'journal.jsonl'),
      keelAdapter: createLocalKeelBackend({ root: join(admissionRoot, 'keels') }),
    },
  };
}

function createFixtureTransport({ mutateReservation, mutateDispatch, failDispatch = false } = {}) {
  const calls = [];
  const task = { taskId: 'codex-thread-fixture-001', hostId: 'local-host-001' };
  const descriptor = {
    schemaVersion: 1,
    protocolId: 'eternities-codex-task-control-v1',
    hostAdapterId: 'codex-desktop-v1',
    instructionChannel: 'developer',
    suspendedReservation: true,
    boundExecutionReceipt: true,
  };
  return {
    calls,
    descriptor() {
      calls.push({ type: 'descriptor' });
      return structuredClone(descriptor);
    },
    async reserveTask(intent) {
      calls.push({ type: 'reserve', intent: structuredClone(intent) });
      const receipt = buildCodexTaskReservationReceipt({
        intent,
        task,
        instructionChannel: descriptor.instructionChannel,
      });
      return mutateReservation ? mutateReservation(structuredClone(receipt)) : receipt;
    },
    async cancelReservation({ reservationReceipt, reasonDigest }) {
      calls.push({ type: 'cancel', reasonDigest });
      return buildCodexTaskCancellationReceipt({ reservationReceipt, reasonDigest });
    },
    async dispatchTurn(dispatch) {
      calls.push({ type: 'dispatch', dispatch: structuredClone(dispatch) });
      if (failDispatch) throw new Error('fixture dispatch failed');
      const responseText = `fixture response for ${dispatch.operation}:${dispatch.turnId}`;
      const receipt = buildCodexTaskTransportReceipt({ dispatch, responseText });
      return mutateDispatch
        ? mutateDispatch({ responseText, receipt: structuredClone(receipt) })
        : { responseText, receipt };
    },
  };
}

function hostFor(fixture, transport, clock = () => Date.parse('2026-08-31T19:00:00.000Z')) {
  let credentialOrdinal = 0;
  return createCodexBoundTurnHost({
    taskTransport: transport,
    registryRoot: join(fixture.root, 'binding-registry'),
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    leaseDurationMs: 60_000,
    clock,
    leaseCredential: () => `codex-bound-turn-credential-${++credentialOrdinal}`,
  });
}

test('create reserves without dispatch, binds the returned task, and closes after one exact turn', async (context) => {
  const fixture = await setupAdmission(context, 'create');
  const transport = createFixtureTransport();
  const host = hostFor(fixture, transport);
  const result = await host.create({
    admission: fixture.admission,
    request: turnRequest(),
    cortexId: 'gpt-fixture-a',
  });

  assert.deepEqual(transport.calls.map((call) => call.type), ['descriptor', 'reserve', 'dispatch']);
  assert.equal(result.task.taskId, 'codex-thread-fixture-001');
  assert.equal(result.receipt.operation, 'create');
  assert.equal(result.receipt.status, 'accepted');
  assert.equal(result.receipt.authority.realmEffects, 0);
  assert.equal(result.receipt.authority.continuityAdmission, false);
  assert.match(result.receipt.reservationReceiptDigest, /^[a-f0-9]{64}$/);
  assert.match(result.receipt.transportDescriptorDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.receipt.instructionChannel, 'developer');
  assert.deepEqual(verifyCodexBoundTurnReceipt(structuredClone(result.receipt)), result.receipt);
  assert.match(result.responseText, /fixture response/);
  assert.equal(await readFile(join(fixture.admissionRoot, 'vessel', 'launch.lock'), 'utf8').catch((e) => e.code), 'ENOENT');

  const dispatch = transport.calls.find((call) => call.type === 'dispatch').dispatch;
  assert.equal(dispatch.envelope.binding.taskId, result.task.taskId);
  assert.equal(dispatch.envelope.binding.bindingReceiptDigest, result.receipt.binding.activeReceiptDigest);
  assert.equal(dispatch.envelope.transportDescriptorDigest, result.receipt.transportDescriptorDigest);
  assert.equal(dispatch.envelope.modelProjection.binding.active, false);
  assert.equal(dispatch.envelope.hostRules.modelAuthority, 'proposal-only');
  assert.ok(!canonicalJson(dispatch.envelope).includes('codex-bound-turn-credential'));
});

test('continue and compaction resume chain exact receipts without transcript replay', async (context) => {
  const fixture = await setupAdmission(context, 'resume');
  const transport = createFixtureTransport();
  const host = hostFor(fixture, transport);
  const created = await host.create({
    admission: fixture.admission,
    request: turnRequest(),
    cortexId: 'gpt-fixture-a',
  });
  const continued = await host.continue({
    admission: fixture.admission,
    task: created.task,
    parentReceipt: created.receipt,
    request: turnRequest({
      operationId: 'operation-codex-bound-turn-002',
      turnId: 'turn-codex-bound-002',
      objective: 'continue with a new mission without changing actor identity',
    }),
    cortexId: 'gpt-fixture-b',
  });
  const resumed = await host.resumeAfterCompaction({
    admission: fixture.admission,
    task: created.task,
    parentReceipt: continued.receipt,
    request: turnRequest({
      operationId: 'operation-codex-bound-turn-003',
      turnId: 'turn-codex-bound-003',
      objective: 'reconstruct the actor after compaction without transcript replay',
    }),
    cortexId: 'gpt-fixture-a',
  });

  assert.equal(continued.receipt.operation, 'continue');
  assert.equal(resumed.receipt.operation, 'compaction-resume');
  assert.equal(continued.receipt.parentTurnReceiptDigest, created.receipt.receiptDigest);
  assert.equal(resumed.receipt.parentTurnReceiptDigest, continued.receipt.receiptDigest);
  assert.equal(created.receipt.actor.instanceId, continued.receipt.actor.instanceId);
  assert.equal(continued.receipt.actor.instanceId, resumed.receipt.actor.instanceId);
  assert.equal(created.receipt.actor.identityDigest, resumed.receipt.actor.identityDigest);
  assert.equal(resumed.task.taskId, created.task.taskId);
  assert.equal(transport.calls.filter((call) => call.type === 'reserve').length, 1);
  assert.equal(transport.calls.filter((call) => call.type === 'dispatch').length, 3);
  assert.ok(transport.calls.filter((call) => call.type === 'dispatch')
    .every((call) => !Object.hasOwn(call.dispatch.envelope, 'transcript')));
});

test('identity, authority, transcript, paths, credentials, and model routing cannot enter the turn request', async (context) => {
  const fixture = await setupAdmission(context, 'closed-request');
  for (const field of ['identity', 'authority', 'transcript', 'workspacePath', 'apiKey', 'model']) {
    const transport = createFixtureTransport();
    const host = hostFor(fixture, transport);
    const request = turnRequest({ operationId: `operation-closed-${field}`, turnId: `turn-closed-${field}` });
    request[field] = field === 'transcript' ? [] : 'forbidden';
    await assert.rejects(
      () => host.create({ admission: fixture.admission, request, cortexId: 'gpt-fixture-a' }),
    );
    assert.deepEqual(transport.calls, []);
  }
});

test('binding failure cancels only the suspended reservation and never dispatches', async (context) => {
  const fixture = await setupAdmission(context, 'cancel');
  const transport = createFixtureTransport();
  const host = hostFor(fixture, transport);
  await assert.rejects(
    () => host.create({
      admission: fixture.admission,
      request: turnRequest({ maxProjectionBytes: 256 }),
      cortexId: 'gpt-fixture-a',
    }),
    /mandatory cortex binding projection exceeds/,
  );
  assert.deepEqual(transport.calls.map((call) => call.type), ['descriptor', 'reserve', 'cancel']);
  assert.equal(await readFile(join(fixture.admissionRoot, 'vessel', 'launch.lock'), 'utf8').catch((e) => e.code), 'ENOENT');
});

test('transport substitution and dispatch failure issue no host receipt and release the writer lock', async (context) => {
  const fixture = await setupAdmission(context, 'transport-failure');
  for (const [index, transport] of [
    createFixtureTransport({
      mutateDispatch(value) {
        value.receipt.envelopeDigest = 'f'.repeat(64);
        return value;
      },
    }),
    createFixtureTransport({
      mutateDispatch(value) {
        value.responseText += '-changed-after-receipt';
        return value;
      },
    }),
    createFixtureTransport({ failDispatch: true }),
  ].entries()) {
    const host = hostFor(fixture, transport);
    await assert.rejects(() => host.create({
      admission: fixture.admission,
      request: turnRequest({
        operationId: `operation-failure-${index}`,
        turnId: `turn-failure-${index}`,
      }),
      cortexId: 'gpt-fixture-a',
    }));
    assert.equal(await readFile(join(fixture.admissionRoot, 'vessel', 'launch.lock'), 'utf8').catch((e) => e.code), 'ENOENT');
  }
});

test('changed parent receipts and unsupported task transports fail before dispatch', async (context) => {
  const fixture = await setupAdmission(context, 'parent');
  const transport = createFixtureTransport();
  const host = hostFor(fixture, transport);
  const created = await host.create({
    admission: fixture.admission,
    request: turnRequest(),
    cortexId: 'gpt-fixture-a',
  });
  const changed = structuredClone(created.receipt);
  changed.task.taskId = 'another-task';
  await assert.rejects(() => host.continue({
    admission: fixture.admission,
    task: created.task,
    parentReceipt: changed,
    request: turnRequest({ operationId: 'operation-parent-changed', turnId: 'turn-parent-changed' }),
    cortexId: 'gpt-fixture-a',
  }));
  assert.equal(transport.calls.filter((call) => call.type === 'dispatch').length, 1);

  const unsupported = createFixtureTransport();
  unsupported.descriptor = () => ({
    schemaVersion: 1,
    protocolId: 'eternities-codex-task-control-v1',
    hostAdapterId: 'codex-desktop-v1',
    instructionChannel: 'ambient-global-file',
    suspendedReservation: false,
    boundExecutionReceipt: false,
  });
  const unsupportedHost = hostFor(fixture, unsupported);
  await assert.rejects(() => unsupportedHost.create({
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-unsupported', turnId: 'turn-unsupported' }),
    cortexId: 'gpt-fixture-a',
  }), /task transport descriptor/);
});

test('deeply recomputed receipt mutations still fail semantic verification', async (context) => {
  const fixture = await setupAdmission(context, 'semantic-receipt');
  const transport = createFixtureTransport();
  const host = hostFor(fixture, transport);
  const result = await host.create({
    admission: fixture.admission,
    request: turnRequest(),
    cortexId: 'gpt-fixture-a',
  });
  const changed = structuredClone(result.receipt);
  changed.actor.genomeDigest = 'z'.repeat(64);
  const { receiptDigest: _oldDigest, ...unsigned } = changed;
  changed.receiptDigest = sha256Value(unsigned);
  assert.throws(
    () => verifyCodexBoundTurnReceipt(changed),
    /actor genome digest is invalid/,
  );
});

test('model text cannot manufacture host identity, continuity, or Realm authority', async (context) => {
  const fixture = await setupAdmission(context, 'forged-output');
  const transport = createFixtureTransport({
    mutateDispatch({ receipt }) {
      const responseText = canonicalJson({
        status: 'accepted',
        identity: 'self-appointed',
        continuityAdmission: true,
        realmEffects: ['filesystem.write'],
      });
      return { responseText, receipt: buildCodexTaskTransportReceipt({
        dispatch: transport.calls.find((call) => call.type === 'dispatch').dispatch,
        responseText,
      }) };
    },
  });
  const host = hostFor(fixture, transport);
  const result = await host.create({
    admission: fixture.admission,
    request: turnRequest(),
    cortexId: 'gpt-fixture-a',
  });
  assert.match(result.responseText, /self-appointed/);
  assert.equal(result.receipt.authority.continuityAdmission, false);
  assert.equal(result.receipt.authority.realmEffects, 0);
  assert.equal(Object.hasOwn(result.receipt, 'identity'), false);
});

test('bound-turn source never edits global instructions or treats model output as a receipt', async () => {
  const source = await readFile(new URL('../src/host/codex-bound-turn.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['AGENTS.md', 'config.toml', 'writeFile(', 'appendFile(', 'responseText.receipt']) {
    assert.ok(!source.includes(forbidden), forbidden);
  }
});

test('descriptor, reservation, parent actor, and response ceilings remain fail-closed', async (context) => {
  const fixture = await setupAdmission(context, 'deep-boundaries');

  const wrongAdapter = createFixtureTransport();
  const originalDescriptor = wrongAdapter.descriptor;
  wrongAdapter.descriptor = () => ({ ...originalDescriptor(), hostAdapterId: 'another-adapter' });
  await assert.rejects(() => hostFor(fixture, wrongAdapter).create({
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-wrong-adapter', turnId: 'turn-wrong-adapter' }),
    cortexId: 'gpt-fixture-a',
  }), /host adapter does not match/);
  assert.equal(wrongAdapter.calls.some((call) => call.type === 'reserve'), false);

  const changedReservation = createFixtureTransport({
    mutateReservation(receipt) {
      receipt.instructionChannel = 'sealed-user-envelope';
      const { receiptDigest: _old, ...unsigned } = receipt;
      receipt.receiptDigest = sha256Value(unsigned);
      return receipt;
    },
  });
  await assert.rejects(() => hostFor(fixture, changedReservation).create({
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-changed-reservation', turnId: 'turn-changed-reservation' }),
    cortexId: 'gpt-fixture-a',
  }), /reservation does not match/);
  assert.deepEqual(changedReservation.calls.map((call) => call.type), ['descriptor', 'reserve', 'cancel']);

  const ordinary = createFixtureTransport();
  const host = hostFor(fixture, ordinary);
  const created = await host.create({
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-parent-source', turnId: 'turn-parent-source' }),
    cortexId: 'gpt-fixture-a',
  });
  const changedParent = structuredClone(created.receipt);
  changedParent.actor.identityDigest = 'f'.repeat(64);
  const { receiptDigest: _parentDigest, ...unsignedParent } = changedParent;
  changedParent.receiptDigest = sha256Value(unsignedParent);
  await assert.rejects(() => host.continue({
    admission: fixture.admission,
    task: created.task,
    parentReceipt: changedParent,
    request: turnRequest({ operationId: 'operation-parent-forged', turnId: 'turn-parent-forged' }),
    cortexId: 'gpt-fixture-a',
  }), /parent bound-turn actor does not match/);
  assert.equal(await readFile(join(fixture.admissionRoot, 'vessel', 'launch.lock'), 'utf8').catch((e) => e.code), 'ENOENT');

  const oversized = createFixtureTransport({
    mutateDispatch({ receipt }) {
      return { responseText: 'x'.repeat(16_385), receipt };
    },
  });
  await assert.rejects(() => hostFor(fixture, oversized).create({
    admission: fixture.admission,
    request: turnRequest({ operationId: 'operation-oversized', turnId: 'turn-oversized' }),
    cortexId: 'gpt-fixture-a',
  }), /response exceeds maximum size/);
  assert.equal(await readFile(join(fixture.admissionRoot, 'vessel', 'launch.lock'), 'utf8').catch((e) => e.code), 'ENOENT');
});
