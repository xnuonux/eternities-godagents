import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { compileCreation } from '../src/creation/compile.mjs';
import { admitLocalCreation } from '../src/genesis/local-admission.mjs';
import {
  acquireCortexBinding,
  inspectCortexBindingRegistry,
  verifyCortexBindingLifecycleReceipt,
  verifyCortexBindingReceipt,
} from '../src/host/cortex-binding-registry.mjs';
import { createLocalKeelBackend } from '../src/keel/local-reference-backend.mjs';

const creationFixture = new URL('../fixtures/creation/', import.meta.url);
const realmFixture = new URL('../fixtures/realm-contract.json', import.meta.url);
const expectedPolicyDigest = 'c4e3411726fcb32159678b65348e3e14e67f4b011ba73391d19988dee056158b';

function bindingRequest({ taskId = 'codex-task-binding-registry-001', revocationEpoch = 0 } = {}) {
  return {
    schemaVersion: 1,
    task: { taskId, hostAdapterId: 'codex-desktop-v1', revocationEpoch },
    mission: {
      missionId: 'mission-binding-registry-001',
      objective: 'hold one exclusive inert host binding without invoking a model',
      successEvidence: ['active binding receipt', 'exclusive writer lease'],
      stopConditions: ['lease is revoked', 'verified source changes'],
      budget: { maxCycles: 3, maxCompletionTokens: 4096 },
      observation: {
        observationId: 'observation-binding-registry-001',
        summary: 'the admitted identity is ready for a host-held lease',
        evidenceDigests: ['a'.repeat(64)],
      },
    },
    maxProjectionBytes: 65_536,
  };
}

async function setupAdmission(context, suffix, { variant = false, clock } = {}) {
  const root = await mkdtemp(join(tmpdir(), `godagent-cortex-registry-${suffix}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'creation-source');
  await cp(creationFixture, sourceRoot, { recursive: true });
  if (variant) {
    const candidatePath = join(sourceRoot, 'creation-candidate.json');
    const expressionPath = join(sourceRoot, 'expression-overlay.json');
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
    const expression = JSON.parse(await readFile(expressionPath, 'utf8'));
    candidate.blueprint = { id: 'quiet-architect', version: '1.0.0' };
    candidate.telos.mission = 'map uncertain systems into precise evidence-bound paths';
    candidate.expressionRef = 'expression:quiet-architect@1.0.0';
    expression.id = 'quiet-architect';
    expression.name = 'Quiet Architect';
    expression.narrativeDescription = 'A quiet architect who maps uncertainty before acting.';
    await writeFile(candidatePath, `${canonicalJson(candidate)}\n`, 'utf8');
    await writeFile(expressionPath, `${canonicalJson(expression)}\n`, 'utf8');
  }
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
    '<!-- ULTRAGOD Prompt OS 1.0.0 | Edition: godagent-v0 | Adapter: prompt-os-v1 | Receipt: cortex-binding-registry.test.json -->\n# Binding registry test\n',
    'utf8',
  );
  const realm = JSON.parse(await readFile(realmFixture, 'utf8'));
  realm.capabilities = ['filesystem.read', 'filesystem.write'];
  realm.compatibleDistributions = ['0.2.x'];
  const realmContractPath = join(root, 'realm-contract.json');
  await writeFile(realmContractPath, `${canonicalJson(realm)}\n`, 'utf8');
  const workspace = join(root, 'workspace');
  const instanceId = `cortex-registry-${suffix}`;
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
    checkpointPurpose: 'test one host-held cortex binding lease',
    clock: () => new Date(clock?.() ?? Date.parse('2026-08-31T14:00:00.000Z')).toISOString(),
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

test('one verified candidate becomes one credential-free active host receipt', async (context) => {
  const fixture = await setupAdmission(context, 'active');
  const registryRoot = join(fixture.root, 'binding-registry');
  const leaseCanary = 'lease-canary-must-never-serialize';
  const handle = await acquireCortexBinding({
    registryRoot,
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    request: bindingRequest(),
    leaseDurationMs: 60_000,
    clock: () => Date.parse('2026-08-31T15:00:00.000Z'),
    leaseCredential: () => leaseCanary,
  });
  assert.deepEqual(Object.keys(handle).sort(), ['inspect', 'receipt', 'release', 'renew', 'revoke']);
  assert.equal(handle.receipt.status, 'active');
  assert.equal(handle.receipt.active, true);
  assert.equal(handle.receipt.authority.continuity, 'host-lease-only');
  assert.equal(handle.receipt.authority.realmEffects, 'none');
  assert.equal(handle.receipt.instanceId, 'cortex-registry-active');
  assert.equal(handle.receipt.taskId, 'codex-task-binding-registry-001');
  assert.deepEqual(verifyCortexBindingReceipt(structuredClone(handle.receipt)), handle.receipt);
  assert.ok(Object.isFrozen(handle.receipt));
  assert.ok(!canonicalJson(handle.receipt).includes(leaseCanary));

  const snapshot = await inspectCortexBindingRegistry({
    registryRoot,
    clock: () => Date.parse('2026-08-31T15:00:01.000Z'),
  });
  assert.equal(snapshot.bindings.length, 1);
  assert.equal(snapshot.bindings[0].status, 'active');
  assert.equal(snapshot.bindings[0].bindingId, handle.receipt.bindingId);
  assert.ok(!canonicalJson(snapshot).includes(leaseCanary));
  assert.deepEqual(await handle.inspect(), handle.receipt);
  await handle.release();
});

test('one codex task cannot hold two active admitted identities', async (context) => {
  const first = await setupAdmission(context, 'task-a');
  const second = await setupAdmission(context, 'task-b', { variant: true });
  const registryRoot = join(first.root, 'shared-binding-registry');
  const instanceRegistryRoot = join(first.root, 'shared-instance-registry');
  const options = {
    registryRoot,
    instanceRegistryRoot,
    request: bindingRequest(),
    leaseDurationMs: 60_000,
    clock: () => Date.parse('2026-08-31T15:10:00.000Z'),
  };
  const firstHandle = await acquireCortexBinding({ ...options, admission: first.admission });
  await assert.rejects(
    () => acquireCortexBinding({ ...options, admission: second.admission }),
    /task already has an active godagent binding/,
  );

  const secondHandle = await acquireCortexBinding({
    ...options,
    admission: second.admission,
    request: bindingRequest({ taskId: 'codex-task-binding-registry-002' }),
  });
  await secondHandle.release();
  await firstHandle.release();
});

test('one personal keel has one writer and release frees both task and launch-lock claims', async (context) => {
  const fixture = await setupAdmission(context, 'writer');
  const options = {
    registryRoot: join(fixture.root, 'binding-registry'),
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    leaseDurationMs: 60_000,
    clock: () => Date.parse('2026-08-31T15:20:00.000Z'),
  };
  const first = await acquireCortexBinding({ ...options, request: bindingRequest() });
  await assert.rejects(
    () => acquireCortexBinding({
      ...options,
      request: bindingRequest({ taskId: 'codex-task-binding-registry-002' }),
    }),
    /resource is locked by a live or recent owner/,
  );
  const released = await first.release();
  assert.equal(released.status, 'released');
  assert.equal(released.active, false);
  assert.equal(released.revocationEpoch, 0);
  assert.deepEqual(verifyCortexBindingLifecycleReceipt(structuredClone(released)), released);
  const changedLifecycle = structuredClone(released);
  changedLifecycle.taskId = 'forged-task';
  assert.throws(
    () => verifyCortexBindingLifecycleReceipt(changedLifecycle),
    /binding lifecycle receipt digest mismatch/,
  );
  assert.deepEqual(await first.release(), released);

  const replacement = await acquireCortexBinding({
    ...options,
    request: bindingRequest({ taskId: 'codex-task-binding-registry-002' }),
  });
  await replacement.release();
});

test('a transient writer-lock release failure remains retryable after durable closure', async (context) => {
  const fixture = await setupAdmission(context, 'release-retry');
  const options = {
    registryRoot: join(fixture.root, 'binding-registry'),
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    request: bindingRequest(),
    leaseDurationMs: 60_000,
    clock: () => Date.parse('2026-08-31T15:25:00.000Z'),
  };
  const handle = await acquireCortexBinding(options);
  const lockPath = join(fixture.admissionRoot, 'vessel', 'launch.lock');
  const originalLock = await readFile(lockPath, 'utf8');
  const foreignOwner = JSON.parse(originalLock);
  foreignOwner.nonce = 'foreign-lock-owner';
  await writeFile(lockPath, `${canonicalJson(foreignOwner)}\n`, 'utf8');
  await assert.rejects(() => handle.release(), /lock ownership changed before release/);

  await writeFile(lockPath, originalLock, 'utf8');
  const released = await handle.release();
  assert.equal(released.status, 'released');
  const replacement = await acquireCortexBinding(options);
  await replacement.release();
});

test('renewal preserves binding identity while revocation advances task and instance epochs', async (context) => {
  let now = Date.parse('2026-08-31T15:30:00.000Z');
  const fixture = await setupAdmission(context, 'revocation', { clock: () => now });
  const replacementFixture = await setupAdmission(context, 'revocation-replacement', {
    clock: () => now,
    variant: true,
  });
  const options = {
    registryRoot: join(fixture.root, 'binding-registry'),
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    leaseDurationMs: 20_000,
    clock: () => now,
  };
  const handle = await acquireCortexBinding({ ...options, request: bindingRequest() });
  const bindingId = handle.receipt.bindingId;
  now += 5_000;
  const renewed = await handle.renew();
  assert.equal(renewed.bindingId, bindingId);
  assert.equal(renewed.lastVerifiedAt, '2026-08-31T15:30:05.000Z');
  assert.equal(renewed.lease.expiresAt, '2026-08-31T15:30:25.000Z');

  now += 1_000;
  const revoked = await handle.revoke({ reasonDigest: 'b'.repeat(64) });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revocationEpoch, 1);
  await assert.rejects(
    () => acquireCortexBinding({ ...options, request: bindingRequest() }),
    /revocation epoch mismatch/,
  );
  await assert.rejects(
    () => acquireCortexBinding({
      ...options,
      request: bindingRequest({ taskId: 'codex-task-binding-registry-new-task' }),
    }),
    /revocation epoch mismatch/,
  );

  const restored = await acquireCortexBinding({
    ...options,
    admission: replacementFixture.admission,
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    request: bindingRequest({ revocationEpoch: 1 }),
  });
  assert.equal(restored.receipt.instanceId, 'cortex-registry-revocation-replacement');
  await restored.release();
});

test('inspection expires a live-process lease and releases its held writer lock', async (context) => {
  let now = Date.parse('2026-08-31T15:35:00.000Z');
  const fixture = await setupAdmission(context, 'inspection-expiry', { clock: () => now });
  const options = {
    registryRoot: join(fixture.root, 'binding-registry'),
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    request: bindingRequest(),
    leaseDurationMs: 2_000,
    clock: () => now,
  };
  const handle = await acquireCortexBinding(options);
  now += 3_000;
  const inspected = await handle.inspect();
  assert.equal(inspected.status, 'expired');
  assert.equal(inspected.active, false);
  const snapshot = await inspectCortexBindingRegistry({ registryRoot: options.registryRoot, clock: () => now });
  assert.equal(snapshot.bindings[0].status, 'expired');

  const replacement = await acquireCortexBinding(options);
  await replacement.release();
});

test('renewal that discovers expiry releases its held writer lock', async (context) => {
  let now = Date.parse('2026-08-31T15:37:00.000Z');
  const fixture = await setupAdmission(context, 'renewal-expiry', { clock: () => now });
  const options = {
    registryRoot: join(fixture.root, 'binding-registry'),
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    request: bindingRequest(),
    leaseDurationMs: 2_000,
    clock: () => now,
  };
  const expired = await acquireCortexBinding(options);
  now += 3_000;
  await assert.rejects(() => expired.renew(), /binding is no longer active/);

  const replacement = await acquireCortexBinding(options);
  assert.equal(replacement.receipt.status, 'active');
  await replacement.release();
});

test('dead-host recovery requires expired durable lease and stale process-lock reclamation', async (context) => {
  let now = Date.parse('2026-08-31T15:40:00.000Z');
  let firstAlive = true;
  const fixture = await setupAdmission(context, 'recovery', { clock: () => now });
  const common = {
    registryRoot: join(fixture.root, 'binding-registry'),
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    request: bindingRequest(),
    leaseDurationMs: 2_000,
    clock: () => now,
  };
  const abandoned = await acquireCortexBinding({
    ...common,
    leaseCredential: () => 'abandoned-host-credential',
    writerLockOptions: {
      pid: 41001,
      nonce: () => 'abandoned-writer-lock',
      now: () => now,
      staleAfterMs: 1_000,
      isProcessAlive: () => firstAlive,
    },
  });
  assert.equal(abandoned.receipt.status, 'active');
  await assert.rejects(
    () => acquireCortexBinding({
      ...common,
      writerLockOptions: {
        pid: 41002,
        nonce: () => 'replacement-too-early',
        now: () => now,
        staleAfterMs: 1_000,
        isProcessAlive: () => false,
      },
    }),
    /resource is locked by a live or recent owner/,
  );

  firstAlive = false;
  now += 3_000;
  const recovered = await acquireCortexBinding({
    ...common,
    leaseCredential: () => 'replacement-host-credential',
    writerLockOptions: {
      pid: 41002,
      nonce: () => 'replacement-writer-lock',
      now: () => now,
      staleAfterMs: 1_000,
      isProcessAlive: () => false,
    },
  });
  assert.notEqual(recovered.receipt.bindingId, abandoned.receipt.bindingId);
  const snapshot = await inspectCortexBindingRegistry({ registryRoot: common.registryRoot, clock: () => now });
  assert.deepEqual(snapshot.bindings.map((row) => row.status), ['expired', 'active']);
  await recovered.release();
});

test('renewal re-verifies the admitted source before extending its writer lease', async (context) => {
  const fixture = await setupAdmission(context, 'renew-source');
  const handle = await acquireCortexBinding({
    registryRoot: join(fixture.root, 'binding-registry'),
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    request: bindingRequest(),
    leaseDurationMs: 60_000,
    clock: () => Date.parse('2026-08-31T15:45:00.000Z'),
  });
  const expressionPath = join(fixture.admissionRoot, 'creation', 'expression-overlay.json');
  const expression = JSON.parse(await readFile(expressionPath, 'utf8'));
  expression.name = 'Forged Renewal';
  await writeFile(expressionPath, `${canonicalJson(expression)}\n`, 'utf8');
  await assert.rejects(() => handle.renew(), /artifact digest mismatch/);
  await handle.release();
});

test('registry and receipt mutation fail closed', async (context) => {
  const fixture = await setupAdmission(context, 'tamper');
  const registryRoot = join(fixture.root, 'binding-registry');
  const handle = await acquireCortexBinding({
    registryRoot,
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    request: bindingRequest(),
    leaseDurationMs: 60_000,
    clock: () => Date.parse('2026-08-31T15:50:00.000Z'),
  });
  const changedReceipt = structuredClone(handle.receipt);
  changedReceipt.taskId = 'forged-task';
  assert.throws(() => verifyCortexBindingReceipt(changedReceipt), /binding receipt digest mismatch/);

  const statePath = join(registryRoot, 'registry.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.events[0].payload.taskId = 'forged-task';
  const { registryDigest: _oldRegistryDigest, ...unsignedState } = state;
  state.registryDigest = sha256Value(unsignedState);
  await writeFile(statePath, `${canonicalJson(state)}\n`, 'utf8');
  await assert.rejects(
    () => inspectCortexBindingRegistry({ registryRoot }),
    /registry event digest mismatch/,
  );
});

test('an oversized registry fails before JSON parsing', async (context) => {
  const fixture = await setupAdmission(context, 'oversized-registry');
  const registryRoot = join(fixture.root, 'binding-registry');
  const statePath = join(registryRoot, 'registry.json');
  await acquireCortexBinding({
    registryRoot,
    instanceRegistryRoot: join(fixture.root, 'instance-registry'),
    admission: fixture.admission,
    request: bindingRequest(),
    leaseDurationMs: 60_000,
    clock: () => Date.parse('2026-08-31T15:55:00.000Z'),
  });
  await truncate(statePath, (32 * 1024 * 1024) + 1);
  await assert.rejects(
    () => inspectCortexBindingRegistry({ registryRoot }),
    /registry exceeds maximum size/,
  );
});

test('binding registry source has no model, Godskills, Realm, or continuity-write import', async () => {
  const source = await readFile(new URL('../src/host/cortex-binding-registry.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    "../runtime/", "../skills/", "../realm/", "openai-compatible", ".infer(", "appendCheckpoint",
  ]) {
    assert.ok(!source.includes(forbidden), forbidden);
  }
});
