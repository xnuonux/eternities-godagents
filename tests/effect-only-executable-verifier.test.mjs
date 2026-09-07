import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, symlink, readdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['scripts/effect-only-v2.mjs', 'src/effect-intent-v2.mjs',
  'src/intent-contracts.mjs', 'src/io.mjs', 'src/routing-contracts.mjs'];
const protocolId = 'eternities-godskills-effect-only-executable-v2';
async function api() {
  const value = await import('../src/skills/effect-only-executable-verifier.mjs').catch(() => null);
  assert.equal(typeof value?.verifyEffectOnlyExecutable, 'function', 'effect-only source capture is implemented');
  return value;
}
async function fixture(t, routingCode = null) {
  const root = await mkdtemp(join(tmpdir(), 'effect-only-verifier-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sources = [];
  for (const path of paths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    const bytes = path === paths[0] && routingCode !== null ? routingCode : `// synthetic inert module: ${path}\n`;
    await writeFile(join(root, path), bytes);
    sources.push({ path, sha256: hash(bytes) });
  }
  // Synthetic trusted fixture, never a release or execution-quality claim.
  const receipt = { schemaVersion: 1, protocolId, status: 'verified-structural-only',
    sourceCommit: '1'.repeat(40), entrypoint: sources[0], sources,
    builder: {}, tests: [], vectors: [], verification: {},
    proofLimits: ['synthetic-fixture-not-release-evidence'] };
  receipt.receiptDigest = hash(canonicalJson(receipt));
  await mkdir(join(root, 'receipts'));
  const bytes = JSON.stringify(receipt);
  await writeFile(join(root, 'receipts/effect-only-executable-v2.json'), bytes);
  return { repositoryRoot: root, pin: { protocolId,
    executableReceipt: { path: 'receipts/effect-only-executable-v2.json', sha256: hash(bytes), receiptDigest: receipt.receiptDigest },
    entrypoint: sources[0] } };
}
test('captures immutable verified bytes so later checkout edits cannot alter the snapshot', async t => {
  const { verifyEffectOnlyExecutable, assertVerifiedEffectOnlyExecutable } = await api();
  const input = await fixture(t);
  const result = await verifyEffectOnlyExecutable(input);
  await writeFile(join(input.repositoryRoot, paths[0]), '// changed after verification');
  assert.equal(Buffer.from(result.sources[0].contentBase64, 'base64').toString(), '// synthetic inert module: scripts/effect-only-v2.mjs\n');
  assert.equal(Object.isFrozen(result.sources[0]), true);
  assert.equal(assertVerifiedEffectOnlyExecutable(result), result);
  assert.throws(() => assertVerifiedEffectOnlyExecutable(structuredClone(result)), /provenance/);
  await assert.rejects(verifyEffectOnlyExecutable(input), /digest/);
});
for (const target of ['receipt-file', 'receipt-logical', 'entrypoint', 'protocol', 'path']) {
  test(`rejects incorrect externally held ${target} pin`, async t => {
    const { verifyEffectOnlyExecutable } = await api();
    const input = await fixture(t);
    if (target === 'receipt-file') input.pin.executableReceipt.sha256 = '0'.repeat(64);
    if (target === 'receipt-logical') input.pin.executableReceipt.receiptDigest = '0'.repeat(64);
    if (target === 'entrypoint') input.pin.entrypoint.sha256 = '0'.repeat(64);
    if (target === 'protocol') input.pin.protocolId = 'unsupported';
    if (target === 'path') input.pin.executableReceipt.path = '../elsewhere.json';
    await assert.rejects(verifyEffectOnlyExecutable(input));
  });
}

for (const mutation of ['extra-module', 'reordered-closure', 'unsupported-receipt']) {
  test(`rejects ${mutation} even when its receipt is externally pinned`, async t => {
    const { verifyEffectOnlyExecutable } = await api();
    const input = await fixture(t);
    const location = join(input.repositoryRoot, input.pin.executableReceipt.path);
    const receipt = JSON.parse(await readFile(location, 'utf8'));
    if (mutation === 'extra-module') receipt.sources.push({ path: 'src/extra.mjs', sha256: '0'.repeat(64) });
    if (mutation === 'reordered-closure') receipt.sources.reverse();
    if (mutation === 'unsupported-receipt') receipt.schemaVersion = 99;
    delete receipt.receiptDigest;
    receipt.receiptDigest = hash(canonicalJson(receipt));
    const bytes = JSON.stringify(receipt);
    await writeFile(location, bytes);
    input.pin.executableReceipt = { ...input.pin.executableReceipt,
      sha256: hash(bytes), receiptDigest: receipt.receiptDigest };
    await assert.rejects(verifyEffectOnlyExecutable(input), /closure|identity/);
  });
}
test('refuses oversized source before hashing or exposing it', async t => {
  const { verifyEffectOnlyExecutable } = await api();
  const input = await fixture(t);
  await writeFile(join(input.repositoryRoot, paths[1]), Buffer.alloc(1_048_577));
  await assert.rejects(verifyEffectOnlyExecutable(input), /bound/);
});
test('rejects an aliased source directory even when every source byte matches', async t => {
  const { verifyEffectOnlyExecutable } = await api();
  const input = await fixture(t);
  const original = join(input.repositoryRoot, 'src');
  const relocated = join(input.repositoryRoot, 'relocated-src');
  await rename(original, relocated);
  await symlink(relocated, original, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyEffectOnlyExecutable(input), /alias/);
});

test('materializes only captured modules in a fresh directory without reopening the checkout', async t => {
  const { verifyEffectOnlyExecutable, materializeEffectOnlyExecutable } = await api();
  assert.equal(typeof materializeEffectOnlyExecutable, 'function', 'isolated source materialization is implemented');
  const input = await fixture(t);
  const captured = await verifyEffectOnlyExecutable(input);
  const parent = join(input.repositoryRoot, 'snapshots');
  await mkdir(parent);
  await writeFile(join(input.repositoryRoot, paths[0]), '// changed checkout');
  const first = await materializeEffectOnlyExecutable({ verifiedExecutable: captured, parent });
  const second = await materializeEffectOnlyExecutable({ verifiedExecutable: captured, parent });
  assert.notEqual(first.root, second.root);
  assert.equal(first.entrypoint, join(first.root, paths[0]));
  assert.equal(await readFile(first.entrypoint, 'utf8'), '// synthetic inert module: scripts/effect-only-v2.mjs\n');
  assert.deepEqual((await readdir(first.root)).sort(), ['scripts', 'src']);
  assert.equal((await readdir(join(first.root, 'src'))).length, 4);
  await assert.rejects(materializeEffectOnlyExecutable({ verifiedExecutable: structuredClone(captured), parent }), /provenance/);
});
test('offline probe never creates a missing output parent before source validation', async t => {
  const input = await fixture(t);
  const parent = join(input.repositoryRoot, 'not-created');
  const script = fileURLToPath(new URL('../scripts/evaluation/effect-only-snapshot-smoke.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script, input.repositoryRoot, parent],
    { windowsHide: true, timeout: 5000, maxBuffer: 4096 });
  assert.notEqual(child.status, 0);
  await assert.rejects(readdir(parent), { code: 'ENOENT' });
});

async function sidecarFixture(t, routingCode = null, verifierCode = '// inert verifier\n') {
  const input = await fixture(t, routingCode);
  const { verifyEffectOnlyExecutable } = await api();
  const routingExecutable = await verifyEffectOnlyExecutable(input);
  const receipt = structuredClone(routingExecutable.receipt);
  receipt.protocolId = 'eternities-godskills-effect-only-verifier-v2';
  receipt.parent = structuredClone(input.pin.executableReceipt);
  const entrypoint = { path: 'scripts/verify-effect-only-v2.mjs', sha256: hash(verifierCode) };
  receipt.entrypoint = entrypoint;
  receipt.sources[0] = entrypoint;
  await writeFile(join(input.repositoryRoot, entrypoint.path), verifierCode);
  async function save() {
    delete receipt.receiptDigest;
    receipt.receiptDigest = hash(canonicalJson(receipt));
    const bytes = JSON.stringify(receipt);
    const path = 'receipts/effect-only-verifier-v2.json';
    await writeFile(join(input.repositoryRoot, path), bytes);
    return { repositoryRoot: input.repositoryRoot, routingExecutable,
      pin: { protocolId: receipt.protocolId, entrypoint: receipt.entrypoint,
        executableReceipt: { path, sha256: hash(bytes), receiptDigest: receipt.receiptDigest } } };
  }
  return { input, receipt, save };
}
test('sidecar captures its own entrypoint but remains bound to the verified routing parent', async t => {
  const { verifyEffectOnlyVerifier, assertVerifiedEffectOnlyExecutable, materializeEffectOnlyExecutable } = await api();
  assert.equal(typeof verifyEffectOnlyVerifier, 'function', 'sidecar host verifier exists');
  const f = await sidecarFixture(t);
  const args = await f.save();
  const result = await verifyEffectOnlyVerifier(args);
  assert.deepEqual(result.receipt.parent, args.routingExecutable.pin.executableReceipt);
  assert.throws(() => assertVerifiedEffectOnlyExecutable(result), /provenance/);
  await assert.rejects(verifyEffectOnlyVerifier({ ...args, routingExecutable: structuredClone(args.routingExecutable) }), /provenance/);
  const snapshot = await materializeEffectOnlyExecutable({ verifiedExecutable: result, parent: f.input.repositoryRoot });
  assert.equal(await readFile(snapshot.entrypoint, 'utf8'), '// inert verifier\n');
  for (const field of ['sha256', 'receiptDigest']) {
    f.receipt.parent[field] = '0'.repeat(64);
    await assert.rejects(verifyEffectOnlyVerifier(await f.save()), /parent/);
    f.receipt.parent = structuredClone(args.routingExecutable.pin.executableReceipt);
  }
});
test('sidecar cannot replace shared consumer bytes even with a newly pinned receipt', async t => {
  const { verifyEffectOnlyVerifier } = await api();
  assert.equal(typeof verifyEffectOnlyVerifier, 'function', 'sidecar host verifier exists');
  const f = await sidecarFixture(t);
  const bytes = '// different consumer\n';
  await writeFile(join(f.input.repositoryRoot, paths[1]), bytes);
  f.receipt.sources[1].sha256 = hash(bytes);
  await assert.rejects(verifyEffectOnlyVerifier(await f.save()), /shared/);
});
test('identical pinned sidecar content remains portable across repository directories', async t => {
  const { verifyEffectOnlyVerifier } = await api();
  const f = await sidecarFixture(t);
  const args = await f.save();
  const mirror = await fixture(t);
  for (const relative of ['scripts/verify-effect-only-v2.mjs', 'receipts/effect-only-verifier-v2.json']) {
    await cp(join(f.input.repositoryRoot, relative), join(mirror.repositoryRoot, relative));
  }
  const fromOriginal = await verifyEffectOnlyVerifier(args);
  const fromMirror = await verifyEffectOnlyVerifier({ ...args, repositoryRoot: mirror.repositoryRoot });
  assert.deepEqual(fromMirror, fromOriginal);
});

test('pinned subprocess adapters drive journal execution and recovery without rerouting', async t => {
  const adapterModule = await import('../src/skills/effect-only-process-adapters.mjs').catch(() => null);
  assert.equal(typeof adapterModule?.createEffectOnlyProcessAdapters, 'function', 'pinned process adapters exist');
  // Synthetic reviewed-code fixtures exercise transport mechanics, not Godskills semantics.
  const routingCode = `import {readFile,writeFile} from 'node:fs/promises';
const arg=k=>process.argv[process.argv.indexOf(k)+1];
const request=JSON.parse(await readFile(arg('--request'),'utf8'));
await writeFile(arg('--output'),JSON.stringify({routeReceipt:{status:'no-qualified-route'},marker:request.marker}),{flag:'wx'});`;
  const verifierCode = `import {readFile} from 'node:fs/promises';
const arg=k=>process.argv[process.argv.indexOf(k)+1];
const request=JSON.parse(await readFile(arg('--request'),'utf8'));
const result=JSON.parse(await readFile(arg('--result'),'utf8'));
process.exitCode=result.marker===request.marker?0:1;`;
  const f = await sidecarFixture(t, routingCode, verifierCode);
  const args = await f.save();
  const { verifyEffectOnlyVerifier } = await api();
  const sidecar = await verifyEffectOnlyVerifier(args);
  const adapters = await adapterModule.createEffectOnlyProcessAdapters({ routingExecutable: args.routingExecutable,
    verifierExecutable: sidecar, snapshotParent: f.input.repositoryRoot });
  const { createEffectOnlyRoutingJournal } = await import('../src/skills/effect-only-routing-journal.mjs');
  const journal = createEffectOnlyRoutingJournal({ root: f.input.repositoryRoot, ...adapters,
    routingReceiptDigest: args.routingExecutable.receipt.receiptDigest, verifierReceiptDigest: sidecar.receipt.receiptDigest });
  const input = { slotId: 'real-process', request: { marker: 'checked' }, expectedSource: {}, hostBindingDigest: '1'.repeat(64) };
  assert.equal((await journal.run(input)).status, 'no-qualified-route');
  assert.equal((await journal.run(input)).status, 'no-qualified-route');
  assert.deepEqual(adapters.counters(), { routingSubprocesses: 1, verificationSubprocesses: 2 });
  const rebuiltAdapters = await adapterModule.createEffectOnlyProcessAdapters({ routingExecutable: args.routingExecutable,
    verifierExecutable: sidecar, snapshotParent: f.input.repositoryRoot });
  const rebuiltJournal = createEffectOnlyRoutingJournal({ root: f.input.repositoryRoot, ...rebuiltAdapters,
    routingReceiptDigest: args.routingExecutable.receipt.receiptDigest, verifierReceiptDigest: sidecar.receipt.receiptDigest });
  assert.equal((await rebuiltJournal.run(input)).status, 'no-qualified-route');
  assert.deepEqual(rebuiltAdapters.counters(), { routingSubprocesses: 0, verificationSubprocesses: 1 });
  assert.equal(await adapters.verify({ operationRoot: f.input.repositoryRoot, request: input.request, expectedSource: {}, result: { marker: 'forged' } }), false);
  await assert.rejects(adapters.route({ operationRoot: f.input.repositoryRoot, resultPath: join(f.input.repositoryRoot, '..', 'escape.json'), request: input.request, expectedSource: {} }), /result path/);
  await assert.rejects(adapters.route({ operationRoot: f.input.repositoryRoot, resultPath: join(f.input.repositoryRoot, 'result.json'), request: { oversized: 'x'.repeat(1_048_577) }, expectedSource: {} }), /bound/);
  assert.equal(adapters.counters().routingSubprocesses, 1);
  await assert.rejects(adapterModule.createEffectOnlyProcessAdapters({ routingExecutable: args.routingExecutable,
    verifierExecutable: structuredClone(sidecar), snapshotParent: f.input.repositoryRoot }), /provenance/);
});

test('routing subprocess timeout terminates observation without an automatic retry', async t => {
  const { createEffectOnlyProcessAdapters } = await import('../src/skills/effect-only-process-adapters.mjs');
  const f = await sidecarFixture(t, 'setInterval(()=>{},1000);', '// no-op verifier');
  const args = await f.save();
  const { verifyEffectOnlyVerifier } = await api();
  const verifierExecutable = await verifyEffectOnlyVerifier(args);
  const adapters = await createEffectOnlyProcessAdapters({ routingExecutable: args.routingExecutable,
    verifierExecutable, snapshotParent: f.input.repositoryRoot, timeoutMs: 100 });
  await assert.rejects(adapters.route({ operationRoot: f.input.repositoryRoot,
    resultPath: join(f.input.repositoryRoot, 'result.json'), request: {}, expectedSource: {} }), /timed out/);
  assert.deepEqual(adapters.counters(), { routingSubprocesses: 1, verificationSubprocesses: 0 });
});

test('v2 admission binds the verified journal and admitted identity without a fabricated v1 skill receipt', async t => {
  const admissionApi = await import('../src/runtime/effect-only-vessel-admission.mjs').catch(() => null);
  assert.equal(typeof admissionApi?.buildEffectOnlyVesselAdmission, 'function', 'v2 outer admission exists');
  const { setupAdmittedIdentity } = await import('./helpers/admitted-identity-fixture.mjs');
  const { compileCortexBindingCandidate } = await import('../src/cortex/binding-compiler.mjs');
  const { buildCortexBindingRequestFromVesselRequest } = await import('../src/runtime/identity-bound-mission-vessel-contracts.mjs');
  const { prepareLocalArtifactEffectRequest } = await import('../src/host/structured-effect-producer.mjs');
  const { buildEffectOnlyRoutingProjection } = await import('../src/skills/effect-only-routing-projection.mjs');
  const { createEffectOnlyRoutingJournal } = await import('../src/skills/effect-only-routing-journal.mjs');
  const { sha256Value } = await import('../src/core/digest.mjs');
  const admitted = await setupAdmittedIdentity(t, 'effect-v2-admission');
  t.after(() => rm(admitted.root, { recursive: true, force: true }));
  const vector = JSON.parse(await readFile(new URL('../fixtures/effect-only-golden-vector-v2.json', import.meta.url), 'utf8'));
  const { routeMode, ...legacy } = vector.subject;
  const request = prepareLocalArtifactEffectRequest(vector.subject, { expectedProducerDescriptorDigest: vector.digests.producerDescriptorDigest });
  const candidate = await compileCortexBindingCandidate({ admission: admitted.admission,
    request: buildCortexBindingRequestFromVesselRequest({ ...legacy, schemaVersion: 1 }) });
  const policy = { schemaVersion: 2, authority: request.requestedAuthority, hostContext: request.hostCeiling,
    runtime: { protocolId: 'eternities-admitted-sealed-identity-host-v2', hostAdapterId: request.task.hostAdapterId,
      revocationEpoch: request.task.revocationEpoch, effectProducerDescriptorDigest: vector.digests.producerDescriptorDigest,
      limits: { ...request.budgets, maxCycles: request.maxCycles, maxProjectionBytes: request.maxProjectionBytes } } };
  const projection = buildEffectOnlyRoutingProjection({ request, policy, candidate });
  const f = await sidecarFixture(t);
  const args = await f.save();
  const routingExecutable = args.routingExecutable;
  const verifierExecutable = await (await api()).verifyEffectOnlyVerifier(args);
  // Trusted test adapters isolate admission mechanics from already-tested consumer semantics.
  const journal = createEffectOnlyRoutingJournal({ root: f.input.repositoryRoot,
    routingReceiptDigest: routingExecutable.receipt.receiptDigest, verifierReceiptDigest: verifierExecutable.receipt.receiptDigest,
    route: async ({ resultPath }) => writeFile(resultPath, JSON.stringify({ routeReceipt: { status: 'no-qualified-route' } }), { flag: 'wx' }),
    verify: async () => true });
  const slotId = sha256Value({ taskId: request.task.taskId, missionId: request.mission.missionId });
  const routingResult = await journal.run({ slotId, request: projection.request, expectedSource: projection.expectedSource,
    hostBindingDigest: projection.hostBinding.bindingDigest });
  const context = { request, policy, candidate, routingResult, routingExecutable, verifierExecutable,
    admittedAt: '2026-09-07T12:00:00.000Z' };
  const result = admissionApi.buildEffectOnlyVesselAdmission(context);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.missionAdmission.godskills, null);
  assert.equal(result.identity.candidateDigest, candidate.candidateDigest);
  assert.equal(result.hostBinding.requestDigest, sha256Value(request));
  assert.equal(result.routing.result.routeReceipt.status, 'no-qualified-route');
  assert.deepEqual(admissionApi.verifyEffectOnlyVesselAdmission(structuredClone(result), context), result);
  await t.test('v2 completion rejects artifact replacement and rehashed authority expansion', async () => {
    assert.equal(typeof admissionApi.buildEffectOnlyVesselCompletion, 'function', 'v2 completion exists');
    const { buildMissionVerdict, buildMissionCompletionReceipt } = await import('../src/runtime/mission-phase-contracts.mjs');
    const artifact = { text: 'bounded local artifact' };
    const phaseResults = { nativeResultDigest: '1'.repeat(64), reviewResultDigests: [], revisionResultDigest: null };
    const verdict = buildMissionVerdict({ admission: result.missionAdmission, disposition: 'accepted',
      reason: 'native-no-review', acceptedArtifactDigest: sha256Value(artifact), ...phaseResults });
    const receipt = buildMissionCompletionReceipt({ admission: result.missionAdmission, verdict, phaseResults,
      transactionId: '2'.repeat(64), preCompletionJournalHeadDigest: '3'.repeat(64),
      usage: { inputTokens: 10, cachedInputTokens: 0, reasoningTokens: 2, visibleOutputTokens: 3, completionTokens: 5 },
      completedAt: '2026-09-07T12:01:00.000Z' });
    const missionResult = { status: 'completed', artifact, verdict, receipt };
    const completionContext = { vesselAdmission: result, admissionContext: context, missionResult };
    const completion = admissionApi.buildEffectOnlyVesselCompletion(completionContext);
    assert.equal(completion.acceptedArtifactDigest, sha256Value(artifact));
    assert.equal(completion.vesselAdmissionDigest, result.vesselAdmissionDigest);
    assert.equal(completion.authority.realmEffects, false);
    assert.equal(completion.authority.personalKeelWrite, false);
    assert.deepEqual(admissionApi.verifyEffectOnlyVesselCompletion(structuredClone(completion), completionContext), completion);
    assert.throws(() => admissionApi.buildEffectOnlyVesselCompletion({ ...completionContext,
      missionResult: { ...missionResult, artifact: { text: 'replacement' } } }), /artifact/);
    assert.throws(() => admissionApi.buildEffectOnlyVesselCompletion({ ...completionContext,
      missionResult: { ...missionResult, status: 'pending' } }), /terminal/);
    const forged = structuredClone(completion);
    forged.authority.realmEffects = true;
    const { receiptDigest, ...body } = forged;
    forged.receiptDigest = sha256Value(body);
    assert.throws(() => admissionApi.verifyEffectOnlyVesselCompletion(forged, completionContext), /binding/);
    assert.throws(() => admissionApi.buildEffectOnlyVesselCompletion({ ...completionContext,
      admissionContext: { ...context, request: { ...request, sourceStateEpoch: request.sourceStateEpoch + 1 } } }));
    assert.deepEqual(admissionApi.buildEffectOnlyVesselCompletion({ ...completionContext,
      vesselAdmission: structuredClone(result), missionResult: structuredClone(missionResult) }), completion);
    const rejectedVerdict = buildMissionVerdict({ admission: result.missionAdmission, disposition: 'rejected',
      reason: 'budget-exhausted-before-review', acceptedArtifactDigest: null, ...phaseResults });
    const rejectedReceipt = buildMissionCompletionReceipt({ admission: result.missionAdmission,
      verdict: rejectedVerdict, phaseResults, transactionId: '2'.repeat(64), preCompletionJournalHeadDigest: '3'.repeat(64),
      usage: receipt.usage, completedAt: receipt.completedAt });
    const rejectedResult = { status: 'completed', artifact: null, verdict: rejectedVerdict, receipt: rejectedReceipt };
    assert.equal(admissionApi.buildEffectOnlyVesselCompletion({ ...completionContext,
      missionResult: rejectedResult }).acceptedArtifactDigest, null);
    for (const invalid of [
      { ...missionResult, verdict: rejectedVerdict },
      { ...missionResult, receipt: rejectedReceipt },
      { ...missionResult, extra: true },
      { ...rejectedResult, artifact },
    ]) assert.throws(() => admissionApi.buildEffectOnlyVesselCompletion({ ...completionContext, missionResult: invalid }));
    for (const key of ['candidateDigest', 'vesselAdmissionDigest']) {
      const changed = structuredClone(completion);
      changed[key] = 'f'.repeat(64);
      const { receiptDigest: ignored, ...unsignedCompletion } = changed;
      changed.receiptDigest = sha256Value(unsignedCompletion);
      assert.throws(() => admissionApi.verifyEffectOnlyVesselCompletion(changed, completionContext), /binding/);
    }
  });
  assert.throws(() => admissionApi.buildEffectOnlyVesselAdmission({ ...context, routingResult: structuredClone(routingResult) }), /provenance/);
  const tampered = structuredClone(result);
  tampered.sourceStateEpoch += 1;
  const { vesselAdmissionDigest, ...unsigned } = tampered;
  tampered.vesselAdmissionDigest = sha256Value(unsigned);
  assert.throws(() => admissionApi.verifyEffectOnlyVesselAdmission(tampered, context), /binding/);
  const blockedRoot = join(f.input.repositoryRoot, 'blocked-journal');
  await mkdir(blockedRoot);
  const blockedJournal = createEffectOnlyRoutingJournal({ root: blockedRoot,
    routingReceiptDigest: routingExecutable.receipt.receiptDigest, verifierReceiptDigest: verifierExecutable.receipt.receiptDigest,
    route: async ({ resultPath }) => writeFile(resultPath, JSON.stringify({ routeReceipt: { status: 'needs-decision' } }), { flag: 'wx' }),
    verify: async () => true });
  const blocked = await blockedJournal.run({ slotId, request: projection.request, expectedSource: projection.expectedSource,
    hostBindingDigest: projection.hostBinding.bindingDigest });
  assert.throws(() => admissionApi.buildEffectOnlyVesselAdmission({ ...context, routingResult: blocked }), /blocked/);
  const deniedSubject = structuredClone(vector.subject);
  deniedSubject.requestedAuthority = ['local-read'];
  deniedSubject.hostCeiling.availableAuthority = ['local-read'];
  deniedSubject.hostCeiling.permittedEffects = ['local-read'];
  const deniedRequest = prepareLocalArtifactEffectRequest(deniedSubject, { expectedProducerDescriptorDigest: vector.digests.producerDescriptorDigest });
  const deniedPolicy = { ...policy, authority: ['local-read'], hostContext: deniedSubject.hostCeiling };
  assert.throws(() => admissionApi.buildEffectOnlyVesselAdmission({ ...context, request: deniedRequest, policy: deniedPolicy }), /effects exceed/);
});
