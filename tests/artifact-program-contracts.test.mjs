import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Value } from '../src/core/digest.mjs';
import { assertSchema } from '../src/core/schema-validator.mjs';
import { verifyIdentityHostRequest } from '../src/host/admitted-sealed-identity-launch.mjs';
import { prepareLocalArtifactEffectRequest } from '../src/host/structured-effect-producer.mjs';
import { prepareArtifactRealmFixture } from './helpers/local-artifact-realm-fixture.mjs';
const api = await import('../src/runtime/artifact-program-contracts.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const digest = value => sha256Value(value);
const time = '2026-09-08T16:00:00.000Z';
const later = '2026-09-08T16:01:00.000Z';
const artifact = content => ({ schemaVersion: 1, artifactType: 'native', content });
const publicationBytes = value => Buffer.byteLength(`${canonicalJson(value)}\n`);
async function fixture(t) {
  const f = await prepareArtifactRealmFixture(t);
  const read = async path => JSON.parse(await readFile(join(f.workspace, path), 'utf8'));
  const manifest = await read('workflow.json');
  const policy = await read('identity-policy.json');
  const receipt = await read('admission/transaction/genesis-receipt.json');
  // This pure-contract test uses structurally valid source evidence. It is not
  // a substitute for the future owner's actual authenticated identity projection.
  const sourceBinding = { workflowManifestDigest: f.manifestDigest,
    identityPolicyDigest: manifest.identityPolicyDigest,
    providerPolicyDigest: digest(await read('provider-policy.json')),
    realmBindingDigest: digest(manifest.realmBinding), producerDescriptorDigest: policy.runtime.effectProducerDescriptorDigest,
    genesisId: receipt.genesisId, keelId: receipt.keelId, creationBuildId: receipt.creationBuildId,
    distributionBuildId: receipt.distributionBuildId, admissionReceiptDigest: receipt.receiptDigest,
    actor: { instanceId: f.instanceId, identityDigest: digest('synthetic identity projection'),
      genomeDigest: receipt.genomeValueDigest, keelHeadDigest: receipt.keelHeadDigest } };
  const step = (stepId, objective, predecessors) => ({ stepId, objective, predecessors,
    successEvidence: ['answer the stated question'], stopConditions: ['accepted artifact recorded'],
    maxCompletionTokens: 400, maxArtifactBytes: 512 });
  return { sourceBinding, policy, baseRequest: await read('mission-request.json'),
    definition: { schemaVersion: 1, context: 'arithmetic exercise', maxContextBytes: 4096,
      budget: { maxCompletionTokens: 800, maxResultBytes: 1026 }, steps: [
        step('first', 'what is two plus two?', []),
        step('second', 'double the prior accepted answer', [{ stepId: 'first', projection: 'content' }]),
      ] } };
}
function predecessor(program, output = artifact('four')) {
  const unsigned = { schemaVersion: 1, protocolId: 'eternities-long-horizon-mission-program-v1',
    programId: program.programInput.programId, stepId: 'first', stepIndex: 0, kind: 'artifact-mission',
    dispatchId: digest('controlled dispatch'), dispatchDigest: digest('controlled dispatch bytes'),
    resultDigest: digest(output), resultBytes: publicationBytes(output),
    usage: { inputTokens: 12, cachedInputTokens: 4, reasoningTokens: 6, visibleOutputTokens: 4, completionTokens: 10 },
    startedAt: time, completedAt: time };
  return { stepId: 'first', artifact: output, missionReceiptDigest: digest('verified by runtime owner, not by this pure test'),
    programCompletion: { ...unsigned, completionDigest: digest(unsigned) } };
}
const resolutionInput = (inputs, program, predecessors = [predecessor(program)]) => ({ program,
  stepId: 'second', baseRequest: inputs.baseRequest, policy: inputs.policy, predecessors, resolvedAt: later });

test('artifact program compilation binds one actor, ordered recipes and whole-publication budgets without mutation', async t => {
  const inputs = await fixture(t);
  const original = structuredClone(inputs);
  const p = api.compileArtifactProgram(inputs);
  assert.deepEqual(inputs, original);
  assertSchema('mission-program-input', p.programInput);
  assert.deepEqual(p.programInput.actor, inputs.sourceBinding.actor);
  assert.deepEqual(p.programInput.budget, { maxCompletionTokens: 800, maxResultBytes: 1026 });
  assert.deepEqual(p.programInput.steps.map(s => [s.stepId, s.stepIndex, s.kind, s.maxCompletionTokens, s.maxResultBytes]),
    [['first', 0, 'artifact-mission', 400, 513], ['second', 1, 'artifact-mission', 400, 513]]);
  assert.notEqual(p.programInput.steps[0].inputDigest, p.programInput.steps[1].inputDigest);
  assert.deepEqual(api.compileArtifactProgram(structuredClone(inputs)), p);
  assert.equal(p.baseRequestDigest, digest(inputs.baseRequest));
  assert.throws(() => { p.definition.context = 'edited'; }, TypeError);
  const changed = structuredClone(inputs); changed.definition.context = 'different input';
  assert.notEqual(api.compileArtifactProgram(changed).programInput.programId, p.programInput.programId);
});

test('artifact program resolution carries exact selected evidence under unchanged host authority and rebuilt assessment', async t => {
  const inputs = await fixture(t);
  const p = api.compileArtifactProgram(inputs);
  const pred = predecessor(p);
  const before = structuredClone(inputs.baseRequest);
  const r = api.materializeArtifactProgramStep(resolutionInput(inputs, p, [pred]));
  assert.equal(r.request.mission.objective, 'double the prior accepted answer');
  assert.equal(r.requestDigest, digest(r.request));
  assert.equal(r.request.budgets.nativeCompletionTokens, 400);
  assert.equal(r.request.budgets.totalCompletionTokens, 400);
  assert.equal(r.request.budgets.maxArtifactBytes, 512);
  assert.deepEqual(r.request.requestedAuthority, before.requestedAuthority);
  assert.deepEqual(r.request.hostCeiling, before.hostCeiling);
  assert.equal(r.request.sourceStateEpoch, before.sourceStateEpoch);
  assert.equal(r.request.task.hostAdapterId, before.task.hostAdapterId);
  assert.notEqual(r.request.effectAssessment.subjectDigest, before.effectAssessment.subjectDigest);
  verifyIdentityHostRequest(inputs.policy, r.request);
  const context = JSON.parse(r.request.observation.summary);
  assert.equal(context.context, 'arithmetic exercise');
  assert.deepEqual(context.predecessors, [{ stepId: 'first', projection: 'content',
    programCompletionDigest: pred.programCompletion.completionDigest, missionReceiptDigest: pred.missionReceiptDigest,
    artifactDigest: digest(pred.artifact), artifactBytes: publicationBytes(pred.artifact), content: 'four' }]);
  assert.ok(r.request.observation.evidenceDigests.includes(pred.missionReceiptDigest));
  assert.deepEqual(inputs.baseRequest, before);
  assert.notEqual(r.request.task.taskId, before.task.taskId);
  const first = api.materializeArtifactProgramStep({ ...resolutionInput(inputs, p, []), stepId: 'first' });
  assert.notEqual(first.request.mission.missionId, r.request.mission.missionId);
  const { resolvedAt, ...verification } = resolutionInput(inputs, p, [pred]);
  assert.deepEqual(api.verifyArtifactProgramResolution(r, verification), r);
});

test('artifact program digest-only projection omits body without substituting a summary', async t => {
  const inputs = await fixture(t); inputs.definition.steps[1].predecessors[0].projection = 'digest';
  const p = api.compileArtifactProgram(inputs);
  const r = api.materializeArtifactProgramStep(resolutionInput(inputs, p));
  assert.equal(Object.hasOwn(JSON.parse(r.request.observation.summary).predecessors[0], 'content'), false);
  assert.equal(r.request.observation.summary.includes('four'), false);
});

test('artifact program rejects invalid graphs, authority overrides and pre-admission overcommit', async t => {
  const inputs = await fixture(t);
  assert.equal(api.compileArtifactProgram(inputs).programInput.steps.length, 2);
  const changes = [
    d => { d.steps[1].stepId = 'first'; },
    d => { d.steps[0].predecessors = [{ stepId: 'second', projection: 'content' }]; },
    d => { d.steps[0].predecessors = [{ stepId: 'first', projection: 'content' }]; },
    d => { d.steps[1].predecessors[0].stepId = 'missing'; },
    d => { d.steps[1].predecessors.push({ ...d.steps[1].predecessors[0] }); },
    d => { d.steps[1].predecessors[0].projection = 'summarize'; },
    d => { d.steps[1].model = 'unapproved'; },
    d => { d.steps[1].requestedAuthority = ['admin']; },
    d => { d.authority = ['admin']; },
    d => { d.budget.maxCompletionTokens = 799; },
    d => { d.budget.maxResultBytes = 1025; },
    d => { d.budget.maxCompletionTokens = inputs.policy.runtime.limits.totalCompletionTokens + 1; },
    d => { d.steps[0].maxCompletionTokens = inputs.policy.runtime.limits.nativeCompletionTokens + 1; },
    d => { d.steps[0].maxArtifactBytes = inputs.policy.runtime.limits.maxArtifactBytes + 1; },
    d => { d.steps[0].maxCompletionTokens = 0; },
    d => { d.steps[0].maxArtifactBytes = 1.5; },
    d => { d.steps[0].successEvidence = []; },
    d => { d.steps[0].stopConditions = ['z', 'a']; },
    d => { d.steps = []; },
  ];
  for (const mutate of changes) {
    const variant = structuredClone(inputs); mutate(variant.definition);
    assert.throws(() => api.compileArtifactProgram(variant));
  }
  for (const mutate of [
    v => { v.sourceBinding.identityPolicyDigest = '0'.repeat(64); },
    v => { v.sourceBinding.actor.instanceId = 'another-agent'; },
    v => { v.sourceBinding.producerDescriptorDigest = '0'.repeat(64); },
    v => { v.sourceBinding.providerPolicyDigest = 'not-a-digest'; },
    v => { v.sourceBinding.actor.apiKey = 'secret'; },
  ]) {
    const v = structuredClone(inputs); mutate(v); assert.throws(() => api.compileArtifactProgram(v));
  }
});

test('artifact program rejects missing or inconsistent predecessor evidence and rehashed resolution edits', async t => {
  const inputs = await fixture(t); const p = api.compileArtifactProgram(inputs);
  const base = resolutionInput(inputs, p);
  assert.throws(() => api.materializeArtifactProgramStep({ ...base, predecessors: [] }));
  assert.throws(() => api.materializeArtifactProgramStep({ ...base, predecessors: [base.predecessors[0], base.predecessors[0]] }));
  for (const mutate of [
    e => { e.stepId = 'second'; },
    e => { e.artifact.content = 'changed'; },
    e => { e.programCompletion.programId = '0'.repeat(64); },
    e => { e.programCompletion.resultBytes--; },
    e => { e.programCompletion.stepIndex = 1; },
    e => { e.programCompletion.usage.completionTokens = 401; },
    e => { e.programCompletion.completedAt = '2026-09-09T00:00:00.000Z'; },
    e => { e.missionReceiptDigest = null; },
  ]) {
    const e = structuredClone(base.predecessors[0]); mutate(e);
    const { completionDigest, ...unsigned } = e.programCompletion;
    e.programCompletion.completionDigest = digest(unsigned);
    assert.throws(() => api.materializeArtifactProgramStep({ ...base, predecessors: [e] }));
  }
  const r = api.materializeArtifactProgramStep(base);
  const edited = structuredClone(r); edited.request.requestedAuthority.push('admin');
  edited.requestDigest = digest(edited.request);
  const { resolutionDigest, ...unsigned } = edited; edited.resolutionDigest = digest(unsigned);
  const { resolvedAt, ...verification } = base;
  assert.throws(() => api.verifyArtifactProgramResolution(edited, verification));
  const forgedProgram = structuredClone(p); forgedProgram.definition.steps[0].maxCompletionTokens++;
  const { programDigest, ...programUnsigned } = forgedProgram; forgedProgram.programDigest = digest(programUnsigned);
  assert.throws(() => api.verifyArtifactProgram(forgedProgram, {
    sourceBinding: inputs.sourceBinding, baseRequest: inputs.baseRequest, policy: inputs.policy }));
});

test('artifact program enforces actual UTF-8 context bytes including metadata, without truncation', async t => {
  const inputs = await fixture(t); inputs.definition.maxContextBytes = 512;
  const p = api.compileArtifactProgram(inputs);
  const large = predecessor(p, artifact('🌙'.repeat(70)));
  assert.ok(large.programCompletion.resultBytes <= 513);
  assert.throws(() => api.materializeArtifactProgramStep(resolutionInput(inputs, p, [large])), /context.*byte|context.*ceiling/);
  const exactInputs = structuredClone(inputs);
  exactInputs.definition.context = '🌙'.repeat(200);
  assert.throws(() => api.compileArtifactProgram(exactInputs), /context.*byte|context.*ceiling/);
});

test('artifact program identity includes the exact compatible base request, not only its authority', async t => {
  const inputs = await fixture(t);
  const first = api.compileArtifactProgram(inputs);
  const modified = structuredClone(inputs);
  delete modified.baseRequest.effectAssessment;
  modified.baseRequest.observation.summary = 'a changed base observation';
  modified.baseRequest = prepareLocalArtifactEffectRequest(modified.baseRequest,
    { expectedProducerDescriptorDigest: modified.policy.runtime.effectProducerDescriptorDigest });
  assert.notEqual(api.compileArtifactProgram(modified).programInput.programId, first.programInput.programId);
});

test('artifact program accepts an exact UTF-8 context boundary and rejects one byte less', async t => {
  const inputs = await fixture(t);
  let p = api.compileArtifactProgram(inputs);
  let pred = predecessor(p, artifact('🌙🌙'));
  const expectedContext = { context: 'arithmetic exercise', predecessors: [{ stepId: 'first', projection: 'content',
    programCompletionDigest: pred.programCompletion.completionDigest, missionReceiptDigest: pred.missionReceiptDigest,
    artifactDigest: digest(pred.artifact), artifactBytes: publicationBytes(pred.artifact), content: '🌙🌙' }] };
  const ceiling = Buffer.byteLength(JSON.stringify(expectedContext), 'utf8');
  inputs.definition.maxContextBytes = ceiling;
  p = api.compileArtifactProgram(inputs); pred = predecessor(p, artifact('🌙🌙'));
  const exact = api.materializeArtifactProgramStep(resolutionInput(inputs, p, [pred]));
  assert.equal(Buffer.byteLength(exact.request.observation.summary, 'utf8'), ceiling);
  inputs.definition.maxContextBytes = ceiling - 1;
  p = api.compileArtifactProgram(inputs); pred = predecessor(p, artifact('🌙🌙'));
  assert.throws(() => api.materializeArtifactProgramStep(resolutionInput(inputs, p, [pred])), /context.*byte/);
});
